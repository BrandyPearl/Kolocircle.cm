import pool from '../config/db.js';
import { initiatePayment, checkPaymentStatus } from '../utils/momo.js';
import { recordWalletMomoMovement } from '../services/ledgerService.js';

const VALID_OPERATORS = ['MTN', 'Orange'];

export const getWalletOverview = async (req, res) => {
  try {
    const userId = req.userId;

    const [walletRows] = await pool.query('SELECT id, balance FROM wallets WHERE user_id = ?', [userId]);
    const balance = walletRows.length ? parseFloat(walletRows[0].balance) : 0;
    const walletId = walletRows[0]?.id ?? null;

    if (!walletId) {
      return res.json({
        balance: 0,
        thisMonth: {
          topup: { total: 0, count: 0 },
          contribution: { total: 0, count: 0 },
          payout: { total: 0, count: 0 }
        }
      });
    }

    const [monthRows] = await pool.query(
      `SELECT entry_type, direction, SUM(amount) AS total, COUNT(*) AS count
       FROM ledger_entries
       WHERE wallet_id = ?
         AND entry_type IN ('topup', 'contribution', 'payout')
         AND created_at >= DATE_FORMAT(NOW(), '%Y-%m-01')
       GROUP BY entry_type, direction`,
      [walletId]
    );

    const thisMonth = {
      topup: { total: 0, count: 0 },
      contribution: { total: 0, count: 0 },
      payout: { total: 0, count: 0 }
    };
    for (const row of monthRows) {
      thisMonth[row.entry_type] = { total: parseFloat(row.total), count: row.count };
    }

    res.json({ balance, thisMonth });
  } catch (error) {
    console.error('Error fetching wallet overview:', error);
    res.status(500).json({ error: 'Failed to fetch wallet overview' });
  }
};


export const getWeeklyActivity = async (req, res) => {
  try {
    const userId = req.userId;

    const [walletRows] = await pool.query('SELECT id FROM wallets WHERE user_id = ?', [userId]);
    if (!walletRows.length) {
      return res.json({ days: buildEmptyWeek() });
    }
    const walletId = walletRows[0].id;

    const [rows] = await pool.query(
      `SELECT DATE(created_at) AS day, direction, SUM(amount) AS total
       FROM ledger_entries
       WHERE wallet_id = ? AND created_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
       GROUP BY DATE(created_at), direction
       ORDER BY day ASC`,
      [walletId]
    );

    const days = buildEmptyWeek();
    for (const row of rows) {
      const key = row.day.toISOString().slice(0, 10);
      const entry = days.find(d => d.date === key);
      if (entry) entry[row.direction] = parseFloat(row.total);
    }

    res.json({ days });
  } catch (error) {
    console.error('Error fetching weekly activity:', error);
    res.status(500).json({ error: 'Failed to fetch weekly activity' });
  }
};

function buildEmptyWeek() {
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push({ date: d.toISOString().slice(0, 10), credit: 0, debit: 0 });
  }
  return days;
}


export const initiateTopup = async (req, res) => {
  try {
    const userId = req.userId;
    const { phoneNumber, operator, amount } = req.body;

    if (!phoneNumber || !operator || !amount) {
      return res.status(400).json({ error: 'phoneNumber, operator, and amount are required' });
    }
    if (!VALID_OPERATORS.includes(operator)) {
      return res.status(400).json({ error: 'Invalid operator' });
    }
    if (amount <= 0) {
      return res.status(400).json({ error: 'amount must be greater than 0' });
    }

    const momoResult = await initiatePayment(phoneNumber, amount, userId);
    const referenceId = momoResult.referenceId;

    const [result] = await pool.query(
      'INSERT INTO wallet_topups (user_id, amount, operator, momo_reference_id, status) VALUES (?, ?, ?, ?, ?)',
      [userId, amount, operator, referenceId, 'pending']
    );

    res.json({
      message: 'Top-up initiated',
      topupId: result.insertId,
      referenceId,
      amount,
      currency: 'XAF',
      status: 'pending',
      note: 'A MoMo prompt has been sent to your phone. Enter your PIN to complete the top-up.'
    });
  } catch (error) {
    console.error('Error initiating top-up:', error);
    res.status(500).json({ error: 'Failed to initiate top-up. Please try again.' });
  }
};

export const checkTopupStatus = async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const userId = req.userId;
    const { referenceId } = req.params;

    const [topupRows] = await pool.query(
      'SELECT * FROM wallet_topups WHERE momo_reference_id = ? AND user_id = ?',
      [referenceId, userId]
    );

    if (!topupRows.length) {
      return res.status(404).json({ error: 'Top-up not found' });
    }

    const topup = topupRows[0];

    if (topup.status === 'successful') {
      return res.json({ status: 'successful', amount: topup.amount });
    }

    const momoStatus = await checkPaymentStatus(referenceId);

    if (momoStatus.status === 'SUCCESSFUL') {
      await connection.beginTransaction();

      await connection.query(
        'UPDATE wallet_topups SET status = ?, completed_at = NOW() WHERE id = ?',
        ['successful', topup.id]
      );

      await recordWalletMomoMovement(connection, {
        userId,
        entryType: 'topup',
        direction: 'credit',
        amount: topup.amount,
        referenceTable: 'wallet_topups',
        referenceId: topup.id
      });

      await connection.commit();
      return res.json({ status: 'successful', amount: topup.amount });
    }

    if (momoStatus.status === 'FAILED') {
      await pool.query('UPDATE wallet_topups SET status = ? WHERE id = ?', ['failed', topup.id]);
      return res.json({ status: 'failed', message: 'Top-up failed. Please try again.' });
    }

    res.json({ status: 'pending', message: 'Top-up is still being processed' });
  } catch (error) {
    await connection.rollback();
    console.error('Error checking top-up status:', error);
    res.status(500).json({ error: 'Failed to check top-up status' });
  } finally {
    connection.release();
  }
};

export const initiateWithdrawal = async (req, res) => {
  try {
    const userId = req.userId;
    const { phoneNumber, operator, amount } = req.body;

    if (!phoneNumber || !operator || !amount) {
      return res.status(400).json({ error: 'phoneNumber, operator, and amount are required' });
    }
    if (!VALID_OPERATORS.includes(operator)) {
      return res.status(400).json({ error: 'Invalid operator' });
    }
    if (amount <= 0) {
      return res.status(400).json({ error: 'amount must be greater than 0' });
    }

    const [walletRows] = await pool.query('SELECT balance FROM wallets WHERE user_id = ?', [userId]);
    const balance = walletRows.length ? parseFloat(walletRows[0].balance) : 0;

    if (balance < amount) {
      return res.status(402).json({ error: 'Insufficient wallet balance', currentBalance: balance, requested: amount });
    }

    const momoResult = await initiatePayment(phoneNumber, amount, userId);
    const referenceId = momoResult.referenceId;

    // Note: the wallet is intentionally NOT debited here. The debit now
    // happens in the Fapshi webhook handler, only once the payout is
    // confirmed successful. This closes the old gap where a failed payout
    // left the member's wallet debited with no reversal.
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const [result] = await connection.query(
        'INSERT INTO wallet_withdrawals (user_id, amount, operator, momo_reference_id, status) VALUES (?, ?, ?, ?, ?)',
        [userId, amount, operator, referenceId, 'pending']
      );

      await connection.commit();

      res.json({
        message: 'Withdrawal initiated',
        withdrawalId: result.insertId,
        referenceId,
        amount,
        currency: 'XAF',
        status: 'pending'
      });
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('Error initiating withdrawal:', error);
    res.status(500).json({ error: 'Failed to initiate withdrawal. Please try again.' });
  }
};

export const getWalletTransactions = async (req, res) => {
  try {
    const userId = req.userId;
    const [walletRows] = await pool.query('SELECT id FROM wallets WHERE user_id = ?', [userId]);
    if (!walletRows.length) {
      return res.json({ transactions: [] });
    }

    const walletId = walletRows[0].id;
    const [rows] = await pool.query(
      `SELECT le.id, le.entry_type, le.direction, le.amount, le.created_at,
              wt.operator AS topup_operator, wt.status AS topup_status,
              ww.operator AS withdrawal_operator, ww.status AS withdrawal_status,
              c.contribution_round, c.status AS contribution_status,
              g.group_name AS contribution_group,
              pc.payout_round, pc.status AS payout_status,
              gp.group_name AS payout_group
       FROM ledger_entries le
       LEFT JOIN wallet_topups wt ON le.reference_table = 'wallet_topups' AND le.reference_id = wt.id
       LEFT JOIN wallet_withdrawals ww ON le.reference_table = 'wallet_withdrawals' AND le.reference_id = ww.id
       LEFT JOIN contributions c ON le.reference_table = 'contributions' AND le.reference_id = c.id
       LEFT JOIN payout_cycles pc ON le.reference_table = 'payout_cycles' AND le.reference_id = pc.id
       LEFT JOIN cycle_members cm_contrib ON c.cycle_member_id = cm_contrib.id
       LEFT JOIN group_members gm_contrib ON cm_contrib.membership_id = gm_contrib.id
       LEFT JOIN njangi_groups g ON gm_contrib.group_id = g.id
       LEFT JOIN cycle_members cm_payout ON pc.cycle_member_id = cm_payout.id
       LEFT JOIN group_members gm_payout ON cm_payout.membership_id = gm_payout.id
       LEFT JOIN njangi_groups gp ON gm_payout.group_id = gp.id
       WHERE le.wallet_id = ?
       ORDER BY le.created_at DESC`,
      [walletId]
    );

    const transactions = rows.map(row => {
      let type = 'Other';
      let method = 'KoloCircle';
      let status = 'Successful';
      let description = 'Wallet activity';

      if (row.entry_type === 'topup') {
        type = 'Top up';
        method = row.topup_operator ? `${row.topup_operator} Money` : 'Mobile Money';
        status = row.topup_status ? capitalize(row.topup_status) : 'Pending';
        description = 'Wallet top up';
      } else if (row.entry_type === 'withdrawal') {
        type = 'Withdrawal';
        method = row.withdrawal_operator ? `${row.withdrawal_operator} Money` : 'Mobile Money';
        status = row.withdrawal_status ? capitalize(row.withdrawal_status) : 'Pending';
        description = 'Withdrawal to Mobile Money';
      } else if (row.entry_type === 'contribution') {
        type = 'Contribution';
        method = 'KoloCircle wallet';
        status = row.contribution_status ? capitalize(row.contribution_status) : 'Successful';
        description = row.contribution_group ? `Contribution ${row.contribution_group}` : 'Contribution';
      } else if (row.entry_type === 'payout') {
        type = 'Payout';
        method = 'KoloCircle';
        status = row.payout_status ? capitalize(row.payout_status) : 'Successful';
        description = row.payout_group ? `Payout received ${row.payout_group}` : 'Payout received';
      } else if (row.entry_type === 'deposit') {
        type = 'Deposit';
        method = 'KoloCircle';
        status = 'Successful';
        description = 'Security deposit';
      }

      return {
        id: row.id,
        date: row.created_at,
        type,
        method,
        status,
        description,
        amount: Number(row.amount),
        direction: row.direction
      };
    });

    res.json({ transactions });
  } catch (error) {
    console.error('Error fetching wallet transactions:', error);
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
};

function capitalize(value) {
  return String(value || '').replace(/\b\w/g, char => char.toUpperCase());
}

export default {
  getWalletOverview,
  getWeeklyActivity,
  initiateTopup,
  checkTopupStatus,
  initiateWithdrawal,
  getWalletTransactions
};