import crypto from 'crypto';
import pool from '../config/db.js';
import { recordWalletMomoMovement } from '../services/ledgerService.js';

// Timing-safe comparison so an attacker can't guess the secret one
// character at a time via response-time differences.
function isValidSecret(providedSecret) {
  const expected = process.env.FAPSHI_WEBHOOK_SECRET || '';
  const provided = providedSecret || '';

  const expectedBuf = Buffer.from(expected);
  const providedBuf = Buffer.from(provided);

  if (expectedBuf.length === 0 || expectedBuf.length !== providedBuf.length) {
    return false;
  }
  return crypto.timingSafeEqual(expectedBuf, providedBuf);
}

export const handleFapshiWebhook = async (req, res) => {
  const providedSecret = req.headers['x-wh-secret'];

  if (!isValidSecret(providedSecret)) {
    console.warn('[Fapshi webhook] rejected: missing or invalid x-wh-secret header');
    return res.status(401).json({ error: 'Invalid webhook secret' });
  }

  const { transId, status } = req.body;

  if (!transId || !status) {
    return res.status(400).json({ error: 'transId and status are required' });
  }

  try {
    const handled =
      (await handleTopup(transId, status)) ||
      (await handleWithdrawal(transId, status)) ||
      (await handleDeposit(transId, status));

    if (!handled) {
      // Not necessarily an error on Fapshi's side (e.g. a stray sandbox
      // transaction) — acknowledge with 200 so Fapshi doesn't retry forever.
      console.warn(`[Fapshi webhook] no matching record found for transId ${transId}`);
      return res.status(200).json({ message: 'No matching transaction found' });
    }

    return res.status(200).json({ message: 'Webhook processed' });
  } catch (error) {
    console.error('[Fapshi webhook] processing error:', error);
    // 500 tells Fapshi this was our failure and it should retry later —
    // correct here, since the event itself was valid.
    return res.status(500).json({ error: 'Webhook processing failed' });
  }
};

// ---------------------------------------------------------------
// wallet_topups — credits the member's personal wallet on success.
// ---------------------------------------------------------------
async function handleTopup(transId, status) {
  const [rows] = await pool.query(
    'SELECT * FROM wallet_topups WHERE momo_reference_id = ?',
    [transId]
  );
  if (!rows.length) return false;

  const topup = rows[0];
  if (topup.status !== 'pending') return true; // already handled — idempotent no-op

  if (status === 'SUCCESSFUL') {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      await connection.query(
        'UPDATE wallet_topups SET status = ?, completed_at = NOW() WHERE id = ?',
        ['successful', topup.id]
      );

      await recordWalletMomoMovement(connection, {
        userId: topup.user_id,
        entryType: 'topup',
        direction: 'credit',
        amount: topup.amount,
        referenceTable: 'wallet_topups',
        referenceId: topup.id
      });

      await connection.commit();
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  } else if (status === 'FAILED' || status === 'EXPIRED') {
    await pool.query('UPDATE wallet_topups SET status = ? WHERE id = ?', ['failed', topup.id]);
  }
  // Any other status (e.g. CREATED) — leave as pending, nothing to do yet.

  return true;
}

// ---------------------------------------------------------------
// wallet_withdrawals — debits the member's personal wallet ONLY on
// confirmed success. This is the fix for the old behaviour, which debited
// at initiation time with no reversal path if the payout later failed.
// ---------------------------------------------------------------
async function handleWithdrawal(transId, status) {
  const [rows] = await pool.query(
    'SELECT * FROM wallet_withdrawals WHERE momo_reference_id = ?',
    [transId]
  );
  if (!rows.length) return false;

  const withdrawal = rows[0];
  if (withdrawal.status !== 'pending') return true;

  if (status === 'SUCCESSFUL') {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      await connection.query(
        'UPDATE wallet_withdrawals SET status = ?, completed_at = NOW() WHERE id = ?',
        ['successful', withdrawal.id]
      );

      await recordWalletMomoMovement(connection, {
        userId: withdrawal.user_id,
        entryType: 'withdrawal',
        direction: 'debit',
        amount: withdrawal.amount,
        referenceTable: 'wallet_withdrawals',
        referenceId: withdrawal.id
      });

      await connection.commit();
    } catch (err) {
      await connection.rollback();
      // If this throws because the balance would go negative (e.g. the
      // member spent the money elsewhere between initiation and
      // confirmation), the withdrawal is left as 'pending' rather than
      // silently marked successful with no matching debit. Surface it
      // loudly — this needs manual reconciliation, not a silent failure.
      console.error(`[Fapshi webhook] failed to debit wallet for withdrawal ${withdrawal.id}:`, err.message);
      throw err;
    } finally {
      connection.release();
    }
  } else if (status === 'FAILED' || status === 'EXPIRED') {
    await pool.query('UPDATE wallet_withdrawals SET status = ? WHERE id = ?', ['failed', withdrawal.id]);
  }

  return true;
}

// ---------------------------------------------------------------
// deposits — security deposit paid during verification (step 4/5).
// Credits the personal wallet AND bumps trust_score, matching the
// previous handleMoMoCallback behaviour.
// ---------------------------------------------------------------
async function handleDeposit(transId, status) {
  const [rows] = await pool.query(
    'SELECT * FROM deposits WHERE momo_reference_id = ?',
    [transId]
  );
  if (!rows.length) return false;

  const deposit = rows[0];
  if (deposit.status !== 'pending') return true;

  if (status === 'SUCCESSFUL') {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      await connection.query(
        'UPDATE deposits SET status = ?, completed_at = NOW() WHERE id = ?',
        ['successful', deposit.id]
      );

      await recordWalletMomoMovement(connection, {
        userId: deposit.user_id,
        entryType: 'deposit',
        direction: 'credit',
        amount: deposit.amount,
        referenceTable: 'deposits',
        referenceId: deposit.id
      });

      await connection.query(
        'UPDATE users SET trust_score = trust_score + 20 WHERE id = ?',
        [deposit.user_id]
      );

      await connection.commit();
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  } else if (status === 'FAILED' || status === 'EXPIRED') {
    await pool.query('UPDATE deposits SET status = ? WHERE id = ?', ['failed', deposit.id]);
  }

  return true;
}

export default { handleFapshiWebhook };