import pool from '../config/db.js';
import crypto from 'crypto';
// group creation, listing, and details
export const createGroup = async (req, res) => {
  try {
    const userId = req.userId;
    const {
      groupName,
      description,
      visibility,
      contributionAmount,
      contributionFrequency,
      maxMembers
    } = req.body;

    if (!groupName || !visibility || !contributionAmount || !contributionFrequency || !maxMembers) {
      return res.status(400).json({ error: 'groupName, visibility, contributionAmount, contributionFrequency, and maxMembers are required' });
    }

    if (!['private', 'public'].includes(visibility)) {
      return res.status(400).json({ error: 'visibility must be "private" or "public"' });
    }

    if (!['weekly', 'monthly'].includes(contributionFrequency)) {
      return res.status(400).json({ error: 'contributionFrequency must be "weekly" or "monthly"' });
    }

    if (maxMembers < 2) {
      return res.status(400).json({ error: 'maxMembers must be at least 2' });
    }

    if (contributionAmount <= 0) {
      return res.status(400).json({ error: 'contributionAmount must be greater than 0' });
    }

    // Every group gets an invite token regardless of visibility — public
    // groups can still be shared via link, private groups REQUIRE it
    // for the private_link join path.
    const inviteToken = crypto.randomBytes(16).toString('hex'); // 32 chars, matches CHAR(32)

    const [result] = await pool.query(
      `INSERT INTO njangi_groups
       (creator_id, group_name, description, visibility, invite_token, contribution_amount, contribution_frequency, max_members)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [userId, groupName, description || null, visibility, inviteToken, contributionAmount, contributionFrequency, maxMembers]
    );

    res.status(201).json({
      message: 'Circle created successfully',
      group: {
        id: result.insertId,
        groupName,
        visibility,
        inviteToken,
        contributionAmount,
        contributionFrequency,
        maxMembers,
        groupStatus: 'forming'
      }
    });
  } catch (error) {
    console.error('Error creating group:', error);
    res.status(500).json({ error: 'Failed to create circle' });
  }
};

// view all public groups (no auth required)
export const listPublicGroups = async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, group_name, description, contribution_amount, contribution_frequency,
              max_members, group_status, created_at,
              (SELECT COUNT(*) FROM group_members gm
                 WHERE gm.group_id = njangi_groups.id AND gm.request_status = 'approved' AND gm.member_status = 'active') AS member_count
       FROM njangi_groups
       WHERE visibility = 'public' AND group_status != 'closed'
       ORDER BY created_at DESC`
    );
    res.json({ groups: rows });
  } catch (error) {
    console.error('Error listing public groups:', error);
    res.status(500).json({ error: 'Failed to list circles' });
  }
};

export const getGroupDetails = async (req, res) => {
  try {
    const { groupId } = req.params;
    const { inviteToken } = req.query;
    const userId = req.userId; // may be undefined if route uses optionalAuthMiddleware

    const [groupRows] = await pool.query(
      `SELECT id, creator_id, group_name, description, visibility, invite_token,
              contribution_amount, contribution_frequency, max_members, group_status, created_at
       FROM njangi_groups WHERE id = ?`,
      [groupId]
    );

    if (!groupRows.length) {
      return res.status(404).json({ error: 'Circle not found' });
    }

    const group = groupRows[0];

    if (group.visibility === 'private') {
      const hasValidToken = inviteToken && inviteToken === group.invite_token;
      let isMember = false;

      if (userId) {
        const [memberRows] = await pool.query(
          `SELECT id FROM group_members WHERE group_id = ? AND user_id = ? AND request_status = 'approved'`,
          [groupId, userId]
        );
        isMember = memberRows.length > 0;
      }

      const isCreator = userId && group.creator_id === userId;

      if (!hasValidToken && !isMember && !isCreator) {
        return res.status(403).json({ error: 'This circle is private. A valid invite link or membership is required.' });
      }
    }

    // Never leak the raw invite token to people who didn't already have it
    const { invite_token, ...safeGroup } = group;
    res.json({ group: safeGroup });
  } catch (error) {
    console.error('Error fetching group details:', error);
    res.status(500).json({ error: 'Failed to fetch circle details' });
  }
};

// join circle (public request or private link) or admin add (admin_added) 
const assertGroupAcceptingMembers = (group) => {
  if (group.group_status === 'in_cycle') {
    throw { status: 409, message: 'This circle has an active cycle in progress. New members can only join between cycles.' };
  }
  if (group.group_status === 'closed') {
    throw { status: 409, message: 'This circle is closed.' };
  }
};

export const requestToJoin = async (req, res) => {
  try {
    const userId = req.userId;
    const { groupId } = req.params;
    const { inviteToken } = req.body;

    const [groupRows] = await pool.query(
      `SELECT id, visibility, invite_token, group_status, max_members FROM njangi_groups WHERE id = ?`,
      [groupId]
    );

    if (!groupRows.length) {
      return res.status(404).json({ error: 'Circle not found' });
    }
    const group = groupRows[0];

    try {
      assertGroupAcceptingMembers(group);
    } catch (e) {
      return res.status(e.status).json({ error: e.message });
    }

    // Determine the join path: a private group requires the correct
    // invite token; a public group accepts an open request.
    let joinPath;
    if (group.visibility === 'private') {
      if (!inviteToken || inviteToken !== group.invite_token) {
        return res.status(403).json({ error: 'A valid invite link is required to join this private circle' });
      }
      joinPath = 'private_link';
    } else {
      joinPath = 'public_request';
    }

    const [existingRows] = await pool.query(
      `SELECT id, request_status, member_status FROM group_members WHERE group_id = ? AND user_id = ?`,
      [groupId, userId]
    );
    if (existingRows.length) {
      return res.status(409).json({ error: `You already have a ${existingRows[0].request_status} request or membership for this circle` });
    }

    const [countRows] = await pool.query(
      `SELECT COUNT(*) as count FROM group_members WHERE group_id = ? AND request_status = 'approved' AND member_status = 'active'`,
      [groupId]
    );
    if (countRows[0].count >= group.max_members) {
      return res.status(409).json({ error: 'This circle is already at its maximum number of members' });
    }

    const [result] = await pool.query(
      `INSERT INTO group_members (group_id, user_id, join_path, request_status) VALUES (?, ?, ?, 'pending')`,
      [groupId, userId, joinPath]
    );

    res.status(201).json({
      message: 'Join request submitted, awaiting admin approval',
      membershipId: result.insertId,
      status: 'pending'
    });
  } catch (error) {
    console.error('Error requesting to join:', error);
    res.status(500).json({ error: 'Failed to submit join request' });
  }
};


// admin adding member
export const addMemberDirectly = async (req, res) => {
  try {
    const { groupId } = req.params;
    const { userId: targetUserId } = req.body;
    const group = req.group; // attached by requireCircleAdmin middleware

    try {
      assertGroupAcceptingMembers(group);
    } catch (e) {
      return res.status(e.status).json({ error: e.message });
    }

    if (group.visibility !== 'private') {
      return res.status(400).json({ error: 'Direct member addition is only available for private circles. Use invite links or public requests otherwise.' });
    }

    const [targetUserRows] = await pool.query(
      `SELECT id, verification_status FROM users WHERE id = ?`,
      [targetUserId]
    );
    if (!targetUserRows.length) {
      return res.status(404).json({ error: 'Target user not found' });
    }
    if (targetUserRows[0].verification_status !== 'verified') {
      return res.status(400).json({ error: 'Target user must be fully verified before being added to a circle' });
    }

    const [existingRows] = await pool.query(
      `SELECT id FROM group_members WHERE group_id = ? AND user_id = ?`,
      [groupId, targetUserId]
    );
    if (existingRows.length) {
      return res.status(409).json({ error: 'This user already has a request or membership for this circle' });
    }

    const [countRows] = await pool.query(
      `SELECT COUNT(*) as count FROM group_members WHERE group_id = ? AND request_status = 'approved' AND member_status = 'active'`,
      [groupId]
    );
    if (countRows[0].count >= group.max_members) {
      return res.status(409).json({ error: 'This circle is already at its maximum number of members' });
    }

    const [result] = await pool.query(
      `INSERT INTO group_members (group_id, user_id, join_path, request_status) VALUES (?, ?, 'admin_added', 'pending')`,
      [groupId, targetUserId]
    );

    res.status(201).json({
      message: 'Member added, pending approval',
      membershipId: result.insertId,
      status: 'pending'
    });
  } catch (error) {
    console.error('Error adding member directly:', error);
    res.status(500).json({ error: 'Failed to add member' });
  }
};

export const respondToJoinRequest = async (req, res) => {
  try {
    const { groupId, membershipId } = req.params;
    const { decision } = req.body; // 'approve' | 'reject'

    if (!['approve', 'reject'].includes(decision)) {
      return res.status(400).json({ error: 'decision must be "approve" or "reject"' });
    }

    const [membershipRows] = await pool.query(
      `SELECT id, group_id, request_status FROM group_members WHERE id = ? AND group_id = ?`,
      [membershipId, groupId]
    );
    if (!membershipRows.length) {
      return res.status(404).json({ error: 'Join request not found for this circle' });
    }
    if (membershipRows[0].request_status !== 'pending') {
      return res.status(409).json({ error: `This request has already been ${membershipRows[0].request_status}` });
    }

    const newStatus = decision === 'approve' ? 'approved' : 'rejected';
    await pool.query(
      `UPDATE group_members SET request_status = ?, approved_at = IF(? = 'approved', NOW(), NULL) WHERE id = ?`,
      [newStatus, newStatus, membershipId]
    );

    res.json({ message: `Join request ${newStatus}`, status: newStatus });
  } catch (error) {
    console.error('Error responding to join request:', error);
    res.status(500).json({ error: 'Failed to process join request' });
  }
};

//member requesting to leave circle
export const requestToLeave = async (req, res) => {
  try {
    const userId = req.userId;
    const { groupId } = req.params;

    const [membershipRows] = await pool.query(
      `SELECT id, leave_requested FROM group_members
       WHERE group_id = ? AND user_id = ? AND request_status = 'approved' AND member_status = 'active'`,
      [groupId, userId]
    );
    if (!membershipRows.length) {
      return res.status(404).json({ error: 'You are not an active member of this circle' });
    }
    if (membershipRows[0].leave_requested) {
      return res.status(409).json({ error: 'You have already requested to leave' });
    }

    await pool.query(
      `UPDATE group_members SET leave_requested = TRUE, leave_requested_at = NOW() WHERE id = ?`,
      [membershipRows[0].id]
    );

    res.json({
      message: 'Leave request recorded. You will remain an active member, with full contribution obligations, until the current cycle ends.'
    });
  } catch (error) {
    console.error('Error requesting to leave:', error);
    res.status(500).json({ error: 'Failed to record leave request' });
  }
};

//start a new cycle for a circle (admin only)
export const startCycle = async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const { groupId } = req.params;
    const { assignments } = req.body; // [{ membershipId, payoutOrder }, ...]
    const group = req.group; // from requireCircleAdmin

    if (group.group_status === 'in_cycle') {
      return res.status(409).json({ error: 'A cycle is already active for this circle' });
    }
    if (group.group_status === 'closed') {
      return res.status(409).json({ error: 'This circle is closed' });
    }

    const [activeMemberRows] = await pool.query(
      `SELECT id FROM group_members
       WHERE group_id = ? AND request_status = 'approved' AND member_status = 'active'`,
      [groupId]
    );
    const activeMembershipIds = activeMemberRows.map(r => r.id);
    const n = activeMembershipIds.length;

    if (n < 2) {
      return res.status(400).json({ error: 'A circle needs at least 2 active members to start a cycle' });
    }

    if (!Array.isArray(assignments) || assignments.length !== n) {
      return res.status(400).json({ error: `assignments must include exactly one payoutOrder per active member (expected ${n})` });
    }

    const assignedMembershipIds = assignments.map(a => a.membershipId).sort((a, b) => a - b);
    const expectedIds = [...activeMembershipIds].sort((a, b) => a - b);
    if (JSON.stringify(assignedMembershipIds) !== JSON.stringify(expectedIds)) {
      return res.status(400).json({ error: 'assignments must cover every active member exactly once, with no extras' });
    }

    const orders = assignments.map(a => a.payoutOrder).sort((a, b) => a - b);
    const expectedOrders = Array.from({ length: n }, (_, i) => i + 1);
    if (JSON.stringify(orders) !== JSON.stringify(expectedOrders)) {
      return res.status(400).json({ error: `payoutOrder values must be exactly 1..${n}, each used once` });
    }

    await connection.beginTransaction();

    // Determine next cycle_number for this group
    const [cycleNumRows] = await connection.query(
      `SELECT COALESCE(MAX(cycle_number), 0) + 1 AS next_number FROM cycles WHERE group_id = ?`,
      [groupId]
    );
    const cycleNumber = cycleNumRows[0].next_number;

    const [cycleResult] = await connection.query(
      `INSERT INTO cycles (group_id, cycle_number, start_date, status) VALUES (?, ?, CURDATE(), 'active')`,
      [groupId, cycleNumber]
    );
    const cycleId = cycleResult.insertId;

    // Materialize cycle_members with the admin's assigned payout order
    const cycleMemberIdByMembership = {};
    for (const a of assignments) {
      const [cmResult] = await connection.query(
        `INSERT INTO cycle_members (cycle_id, membership_id, payout_order) VALUES (?, ?, ?)`,
        [cycleId, a.membershipId, a.payoutOrder]
      );
      cycleMemberIdByMembership[a.membershipId] = cmResult.insertId;
    }

    // Pre-create all N rounds: every member contributes every round;
    // exactly one payout_cycles row per round, tied to that round's
    // scheduled beneficiary by payout_order.
    for (let round = 1; round <= n; round++) {
      for (const a of assignments) {
        const cycleMemberId = cycleMemberIdByMembership[a.membershipId];
        await connection.query(
          `INSERT INTO contributions (cycle_member_id, amount, contribution_round, status) VALUES (?, ?, ?, 'pending')`,
          [cycleMemberId, group.contribution_amount, round]
        );
      }

      const beneficiaryAssignment = assignments.find(a => a.payoutOrder === round);
      const beneficiaryCycleMemberId = cycleMemberIdByMembership[beneficiaryAssignment.membershipId];
      const payoutAmount = group.contribution_amount * n;

      await connection.query(
        `INSERT INTO payout_cycles (cycle_id, cycle_member_id, payout_round, amount, status) VALUES (?, ?, ?, ?, 'pending')`,
        [cycleId, beneficiaryCycleMemberId, round, payoutAmount]
      );
    }

    await connection.query(
      `UPDATE njangi_groups SET group_status = 'in_cycle' WHERE id = ?`,
      [groupId]
    );

    await connection.commit();

    res.status(201).json({
      message: `Cycle ${cycleNumber} started with ${n} members over ${n} rounds`,
      cycleId,
      cycleNumber,
      totalRounds: n,
      payoutAmountPerRound: group.contribution_amount * n
    });
  } catch (error) {
    await connection.rollback();
    console.error('Error starting cycle:', error);
    res.status(500).json({ error: 'Failed to start cycle' });
  } finally {
    connection.release();
  }
};

export default {
  createGroup,
  listPublicGroups,
  getGroupDetails,
  requestToJoin,
  addMemberDirectly,
  respondToJoinRequest,
  requestToLeave,
  startCycle
};