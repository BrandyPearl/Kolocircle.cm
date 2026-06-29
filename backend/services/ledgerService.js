
async function getOrCreatePersonalWallet(connection, userId) {
  let [rows] = await connection.query('SELECT id, balance FROM wallets WHERE user_id = ?', [userId]);
  if (rows.length === 0) {
    const [result] = await connection.query('INSERT INTO wallets (user_id, balance) VALUES (?, 0.00)', [userId]);
    return { id: result.insertId, balance: 0 };
  }
  return { id: rows[0].id, balance: parseFloat(rows[0].balance) };
}

async function getOrCreateGroupWallet(connection, groupId) {
  let [rows] = await connection.query('SELECT id, balance FROM group_wallets WHERE group_id = ?', [groupId]);
  if (rows.length === 0) {
    const [result] = await connection.query('INSERT INTO group_wallets (group_id, balance) VALUES (?, 0.00)', [groupId]);
    return { id: result.insertId, balance: 0 };
  }
  return { id: rows[0].id, balance: parseFloat(rows[0].balance) };
}

async function writeEntry(connection, { walletId, groupWalletId, entryType, direction, amount, referenceTable, referenceId }) {
  const isGroup = groupWalletId != null;
  const table = isGroup ? 'group_wallets' : 'wallets';
  const idCol = isGroup ? 'group_wallet_id' : 'wallet_id';
  const targetId = isGroup ? groupWalletId : walletId;

  const [rows] = await connection.query(`SELECT balance FROM ${table} WHERE id = ?`, [targetId]);
  const currentBalance = parseFloat(rows[0].balance);
  const signedAmount = direction === 'credit' ? Math.abs(amount) : -Math.abs(amount);
  const balanceAfter = currentBalance + signedAmount;

  if (balanceAfter < 0) {
    throw new Error(`${table} ${targetId} would go negative (current: ${currentBalance}, delta: ${signedAmount})`);
  }

  const [ledgerResult] = await connection.query(
    `INSERT INTO ledger_entries (${idCol}, entry_type, direction, amount, reference_table, reference_id, balance_after)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [targetId, entryType, direction, Math.abs(amount), referenceTable, referenceId, balanceAfter]
  );

  await connection.query(`UPDATE ${table} SET balance = ? WHERE id = ?`, [balanceAfter, targetId]);

  return { ledgerEntryId: ledgerResult.insertId, balanceAfter };
}


export async function recordWalletMomoMovement(connection, { userId, entryType, direction, amount, referenceTable, referenceId }) {
  const wallet = await getOrCreatePersonalWallet(connection, userId);
  const result = await writeEntry(connection, {
    walletId: wallet.id, groupWalletId: null,
    entryType, direction, amount, referenceTable, referenceId
  });
  return { walletId: wallet.id, ...result };
}

export async function transferBetweenWallets(connection, {
  userId, groupId, entryType, direction, amount, referenceTable, referenceId
}) {
  const personalWallet = await getOrCreatePersonalWallet(connection, userId);
  const groupWallet = await getOrCreateGroupWallet(connection, groupId);

  
  const personalDirection = direction;
  const groupDirection = direction === 'debit' ? 'credit' : 'debit';

  const personalResult = await writeEntry(connection, {
    walletId: personalWallet.id, groupWalletId: null,
    entryType, direction: personalDirection, amount, referenceTable, referenceId
  });

  const groupResult = await writeEntry(connection, {
    walletId: null, groupWalletId: groupWallet.id,
    entryType, direction: groupDirection, amount, referenceTable, referenceId
  });

  return {
    personalWalletId: personalWallet.id,
    personalBalanceAfter: personalResult.balanceAfter,
    groupWalletId: groupWallet.id,
    groupBalanceAfter: groupResult.balanceAfter
  };
}

export default { recordWalletMomoMovement, transferBetweenWallets };