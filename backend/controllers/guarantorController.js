import pool from '../config/db.js';
import { generateToken } from '../middleware/auth.js';
import { sendGuarantorConfirmationLink, sendGuarantorConfirmationNotice, sendGuarantorReleaseNotice } from '../utils/sms.js';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

dotenv.config();

export const requestGuarantor = async (req, res) => {
  try {
    const userId = req.userId;
    const { 
      guarantorName, 
      relationship, 
      age, 
      guarantorPhone, 
      guarantorCNI, 
      town, 
      reason 
    } = req.body;

    if (!guarantorName || !relationship || !age || !guarantorPhone || !guarantorCNI || !town || !reason) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    if (reason.length < 30) {
      return res.status(400).json({ error: 'Reason must be at least 30 characters' });
    }

    if (age < 25) {
      return res.status(400).json({ error: 'Guarantor must be at least 25 years old' });
    }

    const validRelationships = ['Parent', 'Employer', 'Community elder', 'Church or mosque leader', 'Teacher or lecturer', 'Family friend (senior)'];
    if (!validRelationships.includes(relationship)) {
      return res.status(400).json({ error: 'Invalid relationship' });
    }

    const existingGuarantor = await pool.query(
      'SELECT COUNT(*) as count FROM guarantors WHERE member_id = $1 AND status != $2',
      [userId, 'released']
    );

    if (parseInt(existingGuarantor.rows[0].count) > 0) {
      return res.status(400).json({ error: 'You already have an active guarantor. Release them first to request a new one.' });
    }

    const guarantorRecords = await pool.query(
      'SELECT COUNT(*) as count FROM guarantors WHERE guarantor_phone = $1 AND status = $2',
      [guarantorPhone, 'confirmed']
    );

    if (parseInt(guarantorRecords.rows[0].count) >= 3) {
      return res.status(400).json({ error: 'This guarantor is already guaranteeing 3 members' });
    }

    const guarantorToken = jwt.sign(
      { guarantorPhone, memberUserId: userId },
      process.env.JWT_SECRET,
      { expiresIn: '48h' }
    );

    const tokenExpiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);

    const result = await pool.query(
      `INSERT INTO guarantors 
       (member_id, guarantor_name, guarantor_cni, guarantor_phone, relation, town, reason, confirmation_token, token_expires_at) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) 
       RETURNING id`,
      [userId, guarantorName, guarantorCNI, guarantorPhone, relationship, town, reason, guarantorToken, tokenExpiresAt]
    );

    const guarantorId = result.rows[0].id;
    const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
    const confirmationLink = `${baseUrl}/api/guarantor/confirm/${guarantorToken}`;

    await sendGuarantorConfirmationLink(guarantorPhone, confirmationLink);

    res.json({
      message: 'Guarantor request sent successfully',
      guarantorId: guarantorId,
      status: 'pending',
      note: 'Confirmation link has been sent to your guarantor\'s phone'
    });
  } catch (error) {
    console.error('Error requesting guarantor:', error);
    res.status(500).json({ error: 'Failed to request guarantor' });
  }
};

export const confirmGuarantor = async (req, res) => {
  try {
    const { token } = req.params;

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (error) {
      return res.status(400).json({ error: 'Invalid or expired confirmation link' });
    }

    const guarantorResult = await pool.query(
      'SELECT * FROM guarantors WHERE confirmation_token = $1 AND status = $2 AND token_expires_at > NOW()',
      [token, 'pending']
    );

    if (guarantorResult.rows.length === 0) {
      return res.status(404).json({ error: 'Guarantor request not found or expired' });
    }

    const guarantor = guarantorResult.rows[0];

    await pool.query(
      'UPDATE guarantors SET status = $1, confirmed_at = NOW() WHERE id = $2',
      ['confirmed', guarantor.id]
    );

    const memberResult = await pool.query(
      'SELECT phone FROM users WHERE id = $1',
      [guarantor.member_id]
    );

    const memberPhone = memberResult.rows[0].phone;
    await sendGuarantorConfirmationNotice(memberPhone, guarantor.guarantor_name, 'confirmed');

    res.json({
      message: 'Guarantor confirmed successfully',
      status: 'confirmed'
    });
  } catch (error) {
    console.error('Error confirming guarantor:', error);
    res.status(500).json({ error: 'Failed to confirm guarantor' });
  }
};

export const declineGuarantor = async (req, res) => {
  try {
    const { token } = req.params;

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (error) {
      return res.status(400).json({ error: 'Invalid or expired confirmation link' });
    }

    const guarantorResult = await pool.query(
      'SELECT * FROM guarantors WHERE confirmation_token = $1 AND status = $2 AND token_expires_at > NOW()',
      [token, 'pending']
    );

    if (guarantorResult.rows.length === 0) {
      return res.status(404).json({ error: 'Guarantor request not found or expired' });
    }

    const guarantor = guarantorResult.rows[0];

    await pool.query(
      'UPDATE guarantors SET status = $1 WHERE id = $2',
      ['declined', guarantor.id]
    );

    const memberResult = await pool.query(
      'SELECT phone FROM users WHERE id = $1',
      [guarantor.member_id]
    );

    const memberPhone = memberResult.rows[0].phone;
    await sendGuarantorConfirmationNotice(memberPhone, guarantor.guarantor_name, 'declined');

    res.json({
      message: 'Guarantor request declined',
      status: 'declined'
    });
  } catch (error) {
    console.error('Error declining guarantor:', error);
    res.status(500).json({ error: 'Failed to decline guarantor' });
  }
};

export const checkGuarantorChangeEligibility = async (req, res) => {
  try {
    const userId = req.userId;

    const guarantorResult = await pool.query(
      'SELECT assigned_at FROM guarantors WHERE member_id = $1 AND status = $2 ORDER BY assigned_at DESC LIMIT 1',
      [userId, 'confirmed']
    );

    if (guarantorResult.rows.length === 0) {
      return res.json({
        eligible: false,
        message: 'No active guarantor found'
      });
    }

    const assignedAt = new Date(guarantorResult.rows[0].assigned_at);
    const oneYearLater = new Date(assignedAt.getTime() + 365 * 24 * 60 * 60 * 1000);
    const now = new Date();

    const eligible = now >= oneYearLater;
    const daysLeft = Math.ceil((oneYearLater - now) / (1000 * 60 * 60 * 24));

    res.json({
      eligible: eligible,
      unlocksAt: oneYearLater.toISOString(),
      daysLeft: Math.max(0, daysLeft),
      assignedAt: assignedAt.toISOString()
    });
  } catch (error) {
    console.error('Error checking guarantor change eligibility:', error);
    res.status(500).json({ error: 'Failed to check eligibility' });
  }
};

export const changeGuarantor = async (req, res) => {
  try {
    const userId = req.userId;
    const { 
      guarantorName, 
      relationship, 
      age, 
      guarantorPhone, 
      guarantorCNI, 
      town, 
      reason 
    } = req.body;

    const eligibilityResult = await pool.query(
      'SELECT assigned_at FROM guarantors WHERE member_id = $1 AND status = $2 ORDER BY assigned_at DESC LIMIT 1',
      [userId, 'confirmed']
    );

    if (eligibilityResult.rows.length === 0) {
      return res.status(400).json({ error: 'No active guarantor to change' });
    }

    const assignedAt = new Date(eligibilityResult.rows[0].assigned_at);
    const oneYearLater = new Date(assignedAt.getTime() + 365 * 24 * 60 * 60 * 1000);
    const now = new Date();

    if (now < oneYearLater) {
      return res.status(400).json({ 
        error: 'Guarantor change locked for 1 year from registration',
        unlocksAt: oneYearLater.toISOString()
      });
    }

    const oldGuarantorResult = await pool.query(
      'SELECT * FROM guarantors WHERE member_id = $1 AND status = $2 ORDER BY assigned_at DESC LIMIT 1',
      [userId, 'confirmed']
    );

    const oldGuarantor = oldGuarantorResult.rows[0];

    await pool.query(
      'UPDATE guarantors SET status = $1, released_at = NOW() WHERE id = $2',
      ['released', oldGuarantor.id]
    );

    await sendGuarantorReleaseNotice(oldGuarantor.guarantor_phone, (await pool.query('SELECT full_name FROM users WHERE id = $1', [userId])).rows[0].full_name);

    const guarantorToken = jwt.sign(
      { guarantorPhone, memberUserId: userId },
      process.env.JWT_SECRET,
      { expiresIn: '48h' }
    );

    const tokenExpiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);

    const result = await pool.query(
      `INSERT INTO guarantors 
       (member_id, guarantor_name, guarantor_cni, guarantor_phone, relation, town, reason, confirmation_token, token_expires_at) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) 
       RETURNING id`,
      [userId, guarantorName, guarantorCNI, guarantorPhone, relationship, town, reason, guarantorToken, tokenExpiresAt]
    );

    const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
    const confirmationLink = `${baseUrl}/api/guarantor/confirm/${guarantorToken}`;

    await sendGuarantorConfirmationLink(guarantorPhone, confirmationLink);

    res.json({
      message: 'Guarantor change request sent successfully',
      status: 'pending',
      note: 'Old guarantor has been released. Confirmation link sent to new guarantor.'
    });
  } catch (error) {
    console.error('Error changing guarantor:', error);
    res.status(500).json({ error: 'Failed to change guarantor' });
  }
};

export default {
  requestGuarantor,
  confirmGuarantor,
  declineGuarantor,
  checkGuarantorChangeEligibility,
  changeGuarantor
};
