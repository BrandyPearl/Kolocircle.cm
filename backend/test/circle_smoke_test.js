import assert from 'node:assert';

const {
  createGroup,
  requestToJoin,
  respondToJoinRequest,
  startCycle
} = await import('./circle_test_copy.js');
const { mockNextQuery, mockTransactionLog } = await import('./mock-db.js');

function mockReq(overrides = {}) {
  return { body: {}, params: {}, query: {}, ...overrides };
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

// ---- createGroup ----
await test('createGroup rejects invalid visibility', async () => {
  const req = mockReq({
    userId: 1,
    body: { groupName: 'Test', visibility: 'secret', contributionAmount: 1000, contributionFrequency: 'monthly', maxMembers: 5 }
  });
  const res = mockRes();
  await createGroup(req, res);
  assert.strictEqual(res.statusCode, 400);
});

await test('createGroup rejects maxMembers below 2', async () => {
  const req = mockReq({
    userId: 1,
    body: { groupName: 'Test', visibility: 'public', contributionAmount: 1000, contributionFrequency: 'monthly', maxMembers: 1 }
  });
  const res = mockRes();
  await createGroup(req, res);
  assert.strictEqual(res.statusCode, 400);
});

await test('createGroup succeeds with valid input', async () => {
  mockNextQuery({ insertId: 42 });
  const req = mockReq({
    userId: 1,
    body: { groupName: 'Family Njangi', visibility: 'private', contributionAmount: 5000, contributionFrequency: 'monthly', maxMembers: 8 }
  });
  const res = mockRes();
  await createGroup(req, res);
  assert.strictEqual(res.statusCode, 201);
  assert.strictEqual(res.body.group.id, 42);
  assert.strictEqual(res.body.group.groupStatus, 'forming');
});

// ---- requestToJoin: the group_status guard is the critical thing to verify ----
await test('requestToJoin rejects when group is in_cycle', async () => {
  mockNextQuery([{ id: 5, visibility: 'public', invite_token: 'abc', group_status: 'in_cycle', max_members: 8 }]);
  const req = mockReq({ userId: 2, params: { groupId: '5' }, body: {} });
  const res = mockRes();
  await requestToJoin(req, res);
  assert.strictEqual(res.statusCode, 409);
  assert.ok(res.body.error.includes('active cycle'));
});

await test('requestToJoin rejects private group join without correct invite token', async () => {
  mockNextQuery([{ id: 5, visibility: 'private', invite_token: 'realtoken', group_status: 'forming', max_members: 8 }]);
  const req = mockReq({ userId: 2, params: { groupId: '5' }, body: { inviteToken: 'wrongtoken' } });
  const res = mockRes();
  await requestToJoin(req, res);
  assert.strictEqual(res.statusCode, 403);
});

await test('requestToJoin succeeds for public group, no token needed', async () => {
  mockNextQuery([{ id: 5, visibility: 'public', invite_token: 'abc', group_status: 'forming', max_members: 8 }]);
  mockNextQuery([]); // no existing membership row
  mockNextQuery([{ count: 3 }]); // under max_members
  mockNextQuery({ insertId: 100 });

  const req = mockReq({ userId: 2, params: { groupId: '5' }, body: {} });
  const res = mockRes();
  await requestToJoin(req, res);
  assert.strictEqual(res.statusCode, 201);
  assert.strictEqual(res.body.status, 'pending');
});

await test('requestToJoin rejects when circle is already at max members', async () => {
  mockNextQuery([{ id: 5, visibility: 'public', invite_token: 'abc', group_status: 'forming', max_members: 3 }]);
  mockNextQuery([]); // no existing membership
  mockNextQuery([{ count: 3 }]); // already at cap
  const req = mockReq({ userId: 2, params: { groupId: '5' }, body: {} });
  const res = mockRes();
  await requestToJoin(req, res);
  assert.strictEqual(res.statusCode, 409);
});

// ---- respondToJoinRequest ----
await test('respondToJoinRequest rejects an already-decided request', async () => {
  mockNextQuery([{ id: 100, group_id: 5, request_status: 'approved' }]);
  const req = mockReq({ params: { groupId: '5', membershipId: '100' }, body: { decision: 'approve' } });
  const res = mockRes();
  await respondToJoinRequest(req, res);
  assert.strictEqual(res.statusCode, 409);
});

await test('respondToJoinRequest approves a pending request', async () => {
  mockNextQuery([{ id: 100, group_id: 5, request_status: 'pending' }]);
  mockNextQuery({ affectedRows: 1 });
  const req = mockReq({ params: { groupId: '5', membershipId: '100' }, body: { decision: 'approve' } });
  const res = mockRes();
  await respondToJoinRequest(req, res);
  assert.strictEqual(res.body.status, 'approved');
});

// ---- startCycle: the most complex path — full transaction, N=3 members ----
await test('startCycle rejects when assignments do not cover every active member exactly once', async () => {
  mockNextQuery([{ id: 10 }, { id: 11 }, { id: 12 }]); // 3 active members
  const req = mockReq({
    params: { groupId: '5' },
    group: { id: 5, group_status: 'forming', contribution_amount: 1000 },
    body: { assignments: [{ membershipId: 10, payoutOrder: 1 }, { membershipId: 11, payoutOrder: 2 }] } // missing member 12
  });
  const res = mockRes();
  await startCycle(req, res);
  assert.strictEqual(res.statusCode, 400);
});

await test('startCycle generates N rounds for N members and commits the transaction', async () => {
  mockTransactionLog.length = 0; // reset log

  mockNextQuery([{ id: 10 }, { id: 11 }, { id: 12 }]); // 3 active members (pool.query, pre-transaction)

  // Inside transaction:
  mockNextQuery([{ next_number: 1 }]);       // SELECT next cycle_number
  mockNextQuery({ insertId: 900 });          // INSERT INTO cycles
  mockNextQuery({ insertId: 9001 });         // INSERT cycle_members for membership 10
  mockNextQuery({ insertId: 9002 });         // INSERT cycle_members for membership 11
  mockNextQuery({ insertId: 9003 });         // INSERT cycle_members for membership 12

  // Round 1: 3 contributions + 1 payout row
  mockNextQuery({ affectedRows: 1 }); // contribution for cm 9001
  mockNextQuery({ affectedRows: 1 }); // contribution for cm 9002
  mockNextQuery({ affectedRows: 1 }); // contribution for cm 9003
  mockNextQuery({ insertId: 1 });     // payout_cycles round 1

  // Round 2
  mockNextQuery({ affectedRows: 1 });
  mockNextQuery({ affectedRows: 1 });
  mockNextQuery({ affectedRows: 1 });
  mockNextQuery({ insertId: 2 });     // payout round 2

  // Round 3
  mockNextQuery({ affectedRows: 1 });
  mockNextQuery({ affectedRows: 1 });
  mockNextQuery({ affectedRows: 1 });
  mockNextQuery({ insertId: 3 });     // payout round 3

  mockNextQuery({ affectedRows: 1 }); // UPDATE njangi_groups SET group_status = 'in_cycle'

  const req = mockReq({
    params: { groupId: '5' },
    group: { id: 5, group_status: 'forming', contribution_amount: 1000 },
    body: {
      assignments: [
        { membershipId: 10, payoutOrder: 1 },
        { membershipId: 11, payoutOrder: 2 },
        { membershipId: 12, payoutOrder: 3 }
      ]
    }
  });
  const res = mockRes();
  await startCycle(req, res);

  assert.strictEqual(res.statusCode, 201, `expected 201, got ${res.statusCode}: ${JSON.stringify(res.body)}`);
  assert.strictEqual(res.body.totalRounds, 3);
  assert.strictEqual(res.body.payoutAmountPerRound, 3000); // 1000 * 3 members
  assert.ok(mockTransactionLog.includes('begin'));
  assert.ok(mockTransactionLog.includes('commit'));
  assert.ok(!mockTransactionLog.includes('rollback'));
});

await test('startCycle rolls back the transaction if a query fails mid-flight', async () => {
  mockTransactionLog.length = 0;

  mockNextQuery([{ id: 10 }, { id: 11 }]); // 2 active members (pool.query, pre-transaction)
  mockNextQuery([{ next_number: 1 }]);     // SELECT next cycle_number
  mockNextQuery(new Error('simulated DB failure mid-transaction')); // INSERT INTO cycles fails

  const req = mockReq({
    params: { groupId: '5' },
    group: { id: 5, group_status: 'forming', contribution_amount: 1000 },
    body: {
      assignments: [
        { membershipId: 10, payoutOrder: 1 },
        { membershipId: 11, payoutOrder: 2 }
      ]
    }
  });
  const res = mockRes();
  await startCycle(req, res);

  assert.strictEqual(res.statusCode, 500);
  assert.ok(mockTransactionLog.includes('rollback'), 'expected rollback to have been called');
  assert.ok(!mockTransactionLog.includes('commit'), 'commit should NOT have been called');
  assert.ok(mockTransactionLog.includes('release'), 'connection should still be released even on failure');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);