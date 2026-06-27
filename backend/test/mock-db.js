// Mock pool.query — tests push expected responses onto the queue,
// each call to query() shifts the next one off. Throws if the queue
// runs dry, so a missing mock shows up as a clear test failure rather
// than silently returning undefined.
const queue = [];

export function mockNextQuery(rows) {
  queue.push(rows);
}

export function mockQueueLength() {
  return queue.length;
}

async function sharedQuery(sql, params) {
  if (queue.length === 0) {
    throw new Error(`mock-db: no mocked response queued for query: ${sql}`);
  }
  const next = queue.shift();
  if (next instanceof Error) throw next;
  return [next];
}

// Tracks calls for assertions like "did the test actually commit / rollback"
export const mockTransactionLog = [];

const mockConnection = {
  query: sharedQuery,
  beginTransaction: async () => { mockTransactionLog.push('begin'); },
  commit: async () => { mockTransactionLog.push('commit'); },
  rollback: async () => { mockTransactionLog.push('rollback'); },
  release: () => { mockTransactionLog.push('release'); }
};

const pool = {
  query: sharedQuery,
  getConnection: async () => mockConnection
};

export default pool;