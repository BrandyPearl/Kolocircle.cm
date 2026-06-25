/**
 * Records a financial event: writes one ledger_entries row and updates
 * the corresponding wallet balance, both within the caller's existing
 * transaction.
 *
 * @param {object} connection  an active transaction connection (NOT the pool)
 * @param {object} params
 * @param {number} params.userId  whose wallet this affects
 * @param {('contribution'|'payout'|'deposit'|'withdrawal')} params.entryType
 * @param {number} params.amount positive for credits (payout, deposit),
 *                                  negative for debits (contribution, withdrawal)
 * @param {string} params.referenceTable e.g. 'contributions', 'payout_cycles'
 * @param {number} params.referenceId the id of the row in referenceTable
 * @returns {Promise<{ledgerEntryId: number, walletId: number, balanceAfter: number}>}
 */
export async function createLedgerEntry(connection, { userId, entryType, amount, referenceTable, referenceId }) {
  
  let [walletRows] = await connection.query(
    'SELECT id, balance FROM wallets WHERE user_id = ?',
    [userId]
  );

  let walletId;
  if (walletRows.length === 0) {
    const [createResult] = await connection.query(
      'INSERT INTO wallets (user_id, balance) VALUES (?, 0.00)',
      [userId]
    );
    walletId = createResult.insertId;
    walletRows = [{ id: walletId, balance: 0 }];
  } else {
    walletId = walletRows[0].id;
  }

  const currentBalance = parseFloat(walletRows[0].balance);
  const balanceAfter = currentBalance + amount;

  if (balanceAfter < 0) {
    throw new Error(`Ledger entry would drive wallet ${walletId} negative (current: ${currentBalance}, delta: ${amount})`);
  }

  const [ledgerResult] = await connection.query(
    `INSERT INTO ledger_entries (wallet_id, entry_type, amount, reference_table, reference_id, balance_after)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [walletId, entryType, amount, referenceTable, referenceId, balanceAfter]
  );

  await connection.query(
    'UPDATE wallets SET balance = ? WHERE id = ?',
    [balanceAfter, walletId]
  );

  return { ledgerEntryId: ledgerResult.insertId, walletId, balanceAfter };
}

export default { createLedgerEntry };