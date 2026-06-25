import assert from 'node:assert';

const { markContributionPaid } = await import('./contribution_test_copy.js');
const { mockNextQuery, mockTransactionLog } = await import('./mock-db.js');

function mockReq(overrides = {}) {
  return { body: {}, params: {}, ...overrides };
}
function mockRes() {
  const res = { statusCode: null, body: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (payload) => { res.body = payload; return res; };
  return res;
}

let passed = 0, failed = 0;
async function test(name, fn) {
  try {
    await fn();
    console.log(`✅ ${name}`);
    passed++;
  } catch (err) {
    console.log(`❌ ${name}`);
    console.log(`   ${err.stack}`);
    failed++;
  }
}

await test('markContributionPaid rejects paying someone else\'s contribution', async () => {
  mockNextQuery([{
    id: 1, cycle_member_id: 10, amount: 1000, contribution_round: 1,
    status: 'pending', cycle_id: 5, member_user_id: 99
  }]);

  const req = mockReq({ userId: 1, params: { contributionId: '1' } }); // userId 1, but contribution belongs to user 99
  const res = mockRes();
  await markContributionPaid(req, res);
  assert.strictEqual(res.statusCode, 403);
});

await test('markContributionPaid rejects an already-paid contribution', async () => {
  mockNextQuery([{
    id: 1, cycle_member_id: 10, amount: 1000, contribution_round: 1,
    status: 'paid', cycle_id: 5, member_user_id: 1
  }]);

  const req = mockReq({ userId: 1, params: { contributionId: '1' } });
  const res = mockRes();
  await markContributionPaid(req, res);
  assert.strictEqual(res.statusCode, 409);
});

await test('markContributionPaid succeeds but does NOT trigger payout when other members still pending', async () => {
  mockTransactionLog.length = 0;

  // Lookup the contribution (pool.query, pre-transaction)
  mockNextQuery([{
    id: 1, cycle_member_id: 10, amount: 1000, contribution_round: 1,
    status: 'pending', cycle_id: 5, member_user_id: 1
  }]);

  // Inside transaction:
  mockNextQuery({ affectedRows: 1 }); // UPDATE contributions SET status = 'paid'

  // createLedgerEntry: wallet lookup -> found existing wallet
  mockNextQuery([{ id: 50, balance: 2000 }]);
  mockNextQuery({ insertId: 777 }); // INSERT ledger_entries
  mockNextQuery({ affectedRows: 1 }); // UPDATE wallets

  // tryProcessRoundPayout: completeness check -> 2 STILL pending
  mockNextQuery([{ count: 2 }]);

  const req = mockReq({ userId: 1, params: { contributionId: '1' }, body: {} });
  const res = mockRes();
  await markContributionPaid(req, res);

  assert.strictEqual(res.statusCode, null); // 200 default
  assert.strictEqual(res.body.payoutTriggered, false);
  assert.ok(mockTransactionLog.includes('commit'));
  assert.ok(!mockTransactionLog.includes('rollback'));
});

await test('markContributionPaid triggers automatic payout when this is the LAST pending contribution for the round', async () => {
  mockTransactionLog.length = 0;

  // Lookup the contribution
  mockNextQuery([{
    id: 2, cycle_member_id: 11, amount: 1000, contribution_round: 1,
    status: 'pending', cycle_id: 5, member_user_id: 1
  }]);

  // UPDATE contributions SET status = 'paid'
  mockNextQuery({ affectedRows: 1 });

  // createLedgerEntry for the CONTRIBUTION (debit on payer's wallet)
  mockNextQuery([{ id: 50, balance: 2000 }]); // wallet lookup
  mockNextQuery({ insertId: 778 });           // INSERT ledger_entries
  mockNextQuery({ affectedRows: 1 });         // UPDATE wallets

  // tryProcessRoundPayout: completeness check -> 0 pending, round complete!
  mockNextQuery([{ count: 0 }]);

  // Lookup this round's payout_cycles row
  mockNextQuery([{ id: 900, amount: 3000, status: 'pending', beneficiary_user_id: 42 }]);

  // UPDATE payout_cycles SET status = 'completed'
  mockNextQuery({ affectedRows: 1 });

  // createLedgerEntry for the PAYOUT (credit on beneficiary's wallet) —
  // beneficiary has no wallet yet, so this exercises the wallet-creation path
  mockNextQuery([]);                  // wallet lookup -> none found
  mockNextQuery({ insertId: 60 });    // INSERT wallets
  mockNextQuery({ insertId: 779 });   // INSERT ledger_entries
  mockNextQuery({ affectedRows: 1 }); // UPDATE wallets

  const req = mockReq({ userId: 1, params: { contributionId: '2' }, body: {} });
  const res = mockRes();
  await markContributionPaid(req, res);

  assert.strictEqual(res.body.payoutTriggered, true, `expected payout to trigger: ${JSON.stringify(res.body)}`);
  assert.strictEqual(res.body.payout.beneficiaryUserId, 42);
  assert.strictEqual(res.body.payout.amount, 3000);
  assert.ok(mockTransactionLog.includes('commit'));
  assert.ok(!mockTransactionLog.includes('rollback'));
});

await test('markContributionPaid does not double-pay a round whose payout is already completed', async () => {
  mockTransactionLog.length = 0;

  mockNextQuery([{
    id: 3, cycle_member_id: 12, amount: 1000, contribution_round: 1,
    status: 'pending', cycle_id: 5, member_user_id: 1
  }]);
  mockNextQuery({ affectedRows: 1 }); // UPDATE contributions

  // ledger entry for the contribution itself
  mockNextQuery([{ id: 50, balance: 1000 }]);
  mockNextQuery({ insertId: 780 });
  mockNextQuery({ affectedRows: 1 });

  // completeness check says round complete
  mockNextQuery([{ count: 0 }]);

  // but payout_cycles row already shows completed (e.g. duplicate call)
  mockNextQuery([{ id: 901, amount: 3000, status: 'completed', beneficiary_user_id: 42 }]);

  const req = mockReq({ userId: 1, params: { contributionId: '3' }, body: {} });
  const res = mockRes();
  await markContributionPaid(req, res);

  assert.strictEqual(res.body.payoutTriggered, false);
  assert.ok(mockTransactionLog.includes('commit'));
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);