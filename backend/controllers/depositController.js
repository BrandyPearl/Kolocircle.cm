import pool from '../config/db.js';
import { initiatePayment, checkPaymentStatus } from '../utils/momo.js';
import dotenv from 'dotenv';

dotenv.config();

export const initiateDeposit = async (req, res) => {
  try {
    const userId = req.userId;
    const { phoneNumber, operator } = req.body;

    if (!phoneNumber || !operator) {
      return res.status(400).json({ error: 'Phone number and operator are required' });
    }

    const validOperators = ['MTN', 'Orange'];
    if (!validOperators.includes(operator)) {
      return res.status(400).json({ error: 'Invalid operator' });
    }

    const existingDeposit = await pool.query(
      'SELECT id, status FROM deposits WHERE user_id = $1 AND status = $2',
      [userId, 'successful']
    );

    if (existingDeposit.rows.length > 0) {
      return res.status(400).json({ error: 'Deposit already paid' });
    }

    try {
      const momoResult = await initiatePayment(phoneNumber, 5000, userId);
      const referenceId = momoResult.referenceId;

      const result = await pool.query(
        'INSERT INTO deposits (user_id, operator, momo_reference_id, status) VALUES ($1, $2, $3, $4) RETURNING id',
        [userId, operator, referenceId, 'pending']
      );

      res.json({
        message: 'Deposit payment initiated',
        referenceId: referenceId,
        amount: 5000,
        currency: 'XAF',
        status: 'pending',
        note: 'A MoMo prompt has been sent to your phone. Enter your PIN to complete the payment.'
      });
    } catch (error) {
      console.error('MoMo API Error:', error);
      res.status(500).json({ error: 'Failed to initiate payment. Please try again.' });
    }
  } catch (error) {
    console.error('Error initiating deposit:', error);
    res.status(500).json({ error: 'Failed to initiate deposit' });
  }
};

export const checkDepositStatus = async (req, res) => {
  try {
    const userId = req.userId;
    const { referenceId } = req.params;

    const depositResult = await pool.query(
      'SELECT * FROM deposits WHERE momo_reference_id = $1 AND user_id = $2',
      [referenceId, userId]
    );

    if (depositResult.rows.length === 0) {
      return res.status(404).json({ error: 'Deposit not found' });
    }

    const deposit = depositResult.rows[0];

    if (deposit.status === 'successful') {
      return res.json({
        status: 'successful',
        amount: deposit.amount,
        completedAt: deposit.completed_at
      });
    }

    try {
      const momoStatus = await checkPaymentStatus(referenceId);

      if (momoStatus.status === 'SUCCESSFUL') {
        await pool.query(
          'UPDATE deposits SET status = $1, completed_at = NOW() WHERE momo_reference_id = $2',
          ['successful', referenceId]
        );

        res.json({
          status: 'successful',
          amount: 5000,
          currency: 'XAF',
          message: 'Deposit payment successful'
        });
      } else if (momoStatus.status === 'FAILED') {
        await pool.query(
          'UPDATE deposits SET status = $1 WHERE momo_reference_id = $2',
          ['failed', referenceId]
        );

        res.json({
          status: 'failed',
          message: 'Payment failed. Please try again.'
        });
      } else {
        res.json({
          status: 'pending',
          message: 'Payment is still being processed'
        });
      }
    } catch (error) {
      console.error('Error checking MoMo status:', error);
      res.json({
        status: 'pending',
        message: 'Unable to check status right now. Please wait and try again.'
      });
    }
  } catch (error) {
    console.error('Error checking deposit status:', error);
    res.status(500).json({ error: 'Failed to check deposit status' });
  }
};

export const handleMoMoCallback = async (req, res) => {
  try {
    const { referenceId, status } = req.body;

    if (!referenceId || !status) {
      return res.status(400).json({ error: 'Reference ID and status are required' });
    }

    const depositResult = await pool.query(
      'SELECT * FROM deposits WHERE momo_reference_id = $1',
      [referenceId]
    );

    if (depositResult.rows.length === 0) {
      return res.status(404).json({ error: 'Deposit not found' });
    }

    if (status === 'SUCCESSFUL') {
      await pool.query(
        'UPDATE deposits SET status = $1, completed_at = NOW() WHERE momo_reference_id = $2',
        ['successful', referenceId]
      );

      const userId = depositResult.rows[0].user_id;
      await pool.query(
        'UPDATE users SET trust_score = trust_score + 20 WHERE id = $1',
        [userId]
      );
    } else if (status === 'FAILED') {
      await pool.query(
        'UPDATE deposits SET status = $1 WHERE momo_reference_id = $2',
        ['failed', referenceId]
      );
    }

    res.json({ message: 'Callback processed' });
  } catch (error) {
    console.error('Error handling MoMo callback:', error);
    res.status(500).json({ error: 'Failed to process callback' });
  }
};

export default {
  initiateDeposit,
  checkDepositStatus,
  handleMoMoCallback
};
