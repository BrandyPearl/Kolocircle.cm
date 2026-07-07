// PLACE AT: backend/test/simulate-local-webhook.js
//
// Fapshi's sandbox can't reach a plain http://localhost address, so it can
// never actually deliver a webhook to your machine without a public HTTPS
// tunnel (ngrok/localtunnel/etc). This script stands in for Fapshi during
// local development:
//
//   1. Calls Fapshi's REAL sandbox /payment-status endpoint to find out
//      what actually happened to a transaction you initiated (real HTTP
//      call, outbound only — no tunnel needed for this direction).
//   2. Forwards that real result to your OWN local webhook endpoint,
//      with the same shape and x-wh-secret header Fapshi would have sent.
//
// This exercises the real webhookController.js code — it's not a mock of
// the handler, just a manual delivery of a real result.
//
// Usage:
//   node test/simulate-local-webhook.js <transId>            (collection/topup or deposit)
//   node test/simulate-local-webhook.js <transId> payout      (withdrawal)
import dotenv from 'dotenv';
dotenv.config();

const LOCAL_WEBHOOK_URL = process.env.LOCAL_WEBHOOK_URL || 'http://localhost:3000/api/webhooks/fapshi';
const WEBHOOK_SECRET = process.env.FAPSHI_WEBHOOK_SECRET;
const BASE_URL = process.env.FAPSHI_BASE_URL || 'https://sandbox.fapshi.com';

const [, , transId, kind] = process.argv;

if (!transId) {
  console.error('Usage: node test/simulate-local-webhook.js <transId> [payout]');
  process.exit(1);
}
if (!WEBHOOK_SECRET) {
  console.error('FAPSHI_WEBHOOK_SECRET is not set in .env — the local webhook will reject this.');
  process.exit(1);
}

const creds = kind === 'payout'
  ? { apiuser: process.env.FAPSHI_PAYOUT_USER, apikey: process.env.FAPSHI_PAYOUT_KEY }
  : { apiuser: process.env.FAPSHI_COLLECT_USER, apikey: process.env.FAPSHI_COLLECT_KEY };

async function main() {
  console.log(`[1/2] Asking Fapshi sandbox for the real status of ${transId}...`);

  const statusRes = await fetch(`${BASE_URL}/payment-status/${transId}`, {
    headers: { apiuser: creds.apiuser, apikey: creds.apikey }
  });
  const statusData = await statusRes.json().catch(() => ({}));

  if (!statusRes.ok) {
    console.error('Fapshi status check failed:', statusData);
    process.exit(1);
  }

  console.log(`      Fapshi says: status=${statusData.status}, amount=${statusData.amount}`);

  console.log(`[2/2] Relaying that result to your local webhook at ${LOCAL_WEBHOOK_URL}...`);

  const webhookRes = await fetch(LOCAL_WEBHOOK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-wh-secret': WEBHOOK_SECRET
    },
    body: JSON.stringify({
      transId,
      status: statusData.status,
      amount: statusData.amount
    })
  });
  const webhookBody = await webhookRes.json().catch(() => ({}));

  console.log(`      Local webhook responded ${webhookRes.status}:`, webhookBody);
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});