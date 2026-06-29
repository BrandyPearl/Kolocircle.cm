// PLACE AT: backend/controllers/contributionController.js
import pool from '../config/db.js';
import { transferBetweenWallets } from '../services/ledgerService.js';


export const getMyContributions = async (req, res) => {
  try {
    const userId = req.userId;
    const { groupId } = req.params;

    const [rows] = await pool.query(
      `SELECT c.id, c.amount, c.contribution_round, c.contribution_date, c.status,
              cy.cycle_number
       FROM contributions c
       JOIN cycle_members cm ON c.cycle_member_id = cm.id
       JOIN group_members gm ON cm.membership_id = gm.id
       JOIN cycles cy ON cm.cycle_id = cy.id
       WHERE gm.group_id = ? AND gm.user_id = ?
       ORDER BY cy.cycle_number DESC, c.contribution_round ASC`,
      [groupId, userId]
    );

    res.json({ contributions: rows });
  } catch (error) {
    console.error('Error fetching contributions:', error);
    res.status(500).json({ error: 'Failed to fetch contribution history' });
  }
};

export const markContributionPaid = async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const userId = req.userId;
    const { contributionId } = req.params;

    const [contribRows] = await pool.query(
      `SELECT c.id, c.cycle_member_id, c.amount, c.contribution_round, c.status,
              cm.cycle_id, gm.user_id AS member_user_id, cy.group_id
       FROM contributions c
       JOIN cycle_members cm ON c.cycle_member_id = cm.id
       JOIN group_members gm ON cm.membership_id = gm.id
       JOIN cycles cy ON cm.cycle_id = cy.id
       WHERE c.id = ?`,
      [contributionId]
    );

    if (!contribRows.length) {
      return res.status(404).json({ error: 'Contribution not found' });
    }

    const contribution = contribRows[0];

    if (contribution.member_user_id !== userId) {
      return res.status(403).json({ error: 'You can only pay your own contributions' });
    }

    if (contribution.status === 'paid') {
      return res.status(409).json({ error: 'This contribution has already been paid' });
    }

   
    const [walletRows] = await pool.query('SELECT balance FROM wallets WHERE user_id = ?', [userId]);
    const currentBalance = walletRows.length ? parseFloat(walletRows[0].balance) : 0;
    if (currentBalance < contribution.amount) {
      return res.status(402).json({
        error: 'Insufficient wallet balance for this contribution. Please top up your wallet first.',
        currentBalance,
        required: contribution.amount
      });
    }

    await connection.beginTransaction();

    await connection.query(
      `UPDATE contributions SET status = 'paid', contribution_date = NOW() WHERE id = ?`,
      [contributionId]
    );

    // Contribution = personal wallet (debit) -> group wallet (credit, escrow)
    await transferBetweenWallets(connection, {
      userId,
      groupId: contribution.group_id,
      entryType: 'contribution',
      direction: 'debit',
      amount: contribution.amount,
      referenceTable: 'contributions',
      referenceId: contribution.id
    });

    const payoutResult = await tryProcessRoundPayout(connection, contribution.cycle_id, contribution.group_id, contribution.contribution_round);

    await connection.commit();

    res.json({
      message: 'Contribution paid from wallet balance',
      contributionId: contribution.id,
      round: contribution.contribution_round,
      payoutTriggered: payoutResult.triggered,
      ...(payoutResult.triggered ? { payout: payoutResult.payout } : {})
    });
  } catch (error) {
    await connection.rollback();
    console.error('Error marking contribution paid:', error);
    res.status(500).json({ error: 'Failed to mark contribution as paid' });
  } finally {
    connection.release();
  }
};


async function tryProcessRoundPayout(connection, cycleId, groupId, round) {
  const [incompleteRows] = await connection.query(
    `SELECT COUNT(*) AS count
     FROM contributions c
     JOIN cycle_members cm ON c.cycle_member_id = cm.id
     WHERE cm.cycle_id = ? AND c.contribution_round = ? AND c.status != 'paid'`,
    [cycleId, round]
  );

  const stillPending = incompleteRows[0].count;
  if (stillPending > 0) {
    return { triggered: false, reason: `${stillPending} contribution(s) still pending for this round` };
  }

  const [payoutRows] = await connection.query(
    `SELECT pc.id, pc.amount, pc.status, gm.user_id AS beneficiary_user_id
     FROM payout_cycles pc
     JOIN cycle_members cm ON pc.cycle_member_id = cm.id
     JOIN group_members gm ON cm.membership_id = gm.id
     WHERE pc.cycle_id = ? AND pc.payout_round = ?`,
    [cycleId, round]
  );

  if (!payoutRows.length) {
    // Defensive: should not happen if startCycle pre-created rows correctly.
    throw new Error(`No payout_cycles row found for cycle ${cycleId}, round ${round}`);
  }

  const payout = payoutRows[0];

  if (payout.status === 'completed') {
    // Round was already paid out (e.g. a retry) — do not double-credit.
    return { triggered: false, reason: 'Payout already completed for this round' };
  }

  await connection.query(
    `UPDATE payout_cycles SET status = 'completed', payout_date = CURDATE() WHERE id = ?`,
    [payout.id]
  );

  await transferBetweenWallets(connection, {
    userId: payout.beneficiary_user_id,
    groupId,
    entryType: 'payout',
    direction: 'credit',
    amount: payout.amount,
    referenceTable: 'payout_cycles',
    referenceId: payout.id
  });

  return {
    triggered: true,
    payout: {
      payoutCycleId: payout.id,
      beneficiaryUserId: payout.beneficiary_user_id,
      amount: payout.amount,
      round
    }
  };
}

export default {
  getMyContributions,
  markContributionPaid
};