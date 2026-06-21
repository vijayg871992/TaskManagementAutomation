'use strict';

/**
 * End-to-end smoke test over the real HTTP stack: OTP login -> submit a
 * "Hey Jarvis" command -> verify task appears for the assignee -> post a
 * thread message -> run the digest. Uses console SMS (captures the printed
 * code) + file email + mock NLP, all against a temp SQLite DB.
 *
 *   node scripts/e2e-smoke.js
 */

const os = require('os');
const path = require('path');

process.env.DB_CLIENT = 'better-sqlite3';
process.env.SQLITE_FILE = path.join(os.tmpdir(), `jarvis-e2e-${Date.now()}.sqlite`);
process.env.NLP_PROVIDER = 'mock';
process.env.SMS_PROVIDER = 'console';
process.env.EMAIL_PROVIDER = 'file';
process.env.APP_TZ = 'America/New_York';

const { getKnex, destroyKnex } = require('../src/db/knex');
const { createApp } = require('../src/web/app');

// --- capture console.log to grab the printed OTP code ---
let captured = '';
const origLog = console.log;
console.log = (...args) => { captured += args.join(' ') + '\n'; origLog(...args); };

// --- tiny cookie-aware fetch ---
function makeClient(base) {
  let cookie = '';
  const fn = async (url, opts = {}) => {
    const res = await fetch(base + url, {
      ...opts,
      headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), ...(opts.headers || {}) },
    });
    const sc = res.headers.get('set-cookie');
    if (sc) cookie = sc.split(';')[0];
    const json = await res.json().catch(() => ({}));
    return { status: res.status, json };
  };
  fn.getCookie = () => cookie;
  return fn;
}

function assert(cond, msg) {
  if (!cond) { console.error('❌ ASSERT FAILED:', msg); process.exitCode = 1; throw new Error(msg); }
  origLog('   ✓', msg);
}

async function login(client, phone) {
  captured = '';
  await client('/api/auth/request-otp', { method: 'POST', body: JSON.stringify({ phone }) });
  const m = captured.match(/code is (\d{6})/);
  if (!m) throw new Error('OTP code not found in output');
  const r = await client('/api/auth/verify-otp', { method: 'POST', body: JSON.stringify({ phone, code: m[1] }) });
  assert(r.json.ok, `logged in as ${r.json.user && r.json.user.name}`);
  return r.json.user;
}

async function main() {
  const knex = getKnex();
  await knex.migrate.latest();
  await knex.seed.run();

  const app = createApp();
  const server = app.listen(0);
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;
  origLog(`\n=== E2E against ${base} ===\n`);

  try {
    // Donald (owner, +15550000002) assigns Eric (+15550000003)
    const donald = makeClient(base);
    await login(donald, '+15550000002');

    const cmd = await donald('/api/command', {
      method: 'POST',
      body: JSON.stringify({ text: 'Hey Jarvis, assign Eric for Cold Calling to pull the 400 leads by Monday 4pm' }),
    });
    assert(cmd.json.status === 'created', 'command created a task');
    const taskId = cmd.json.task.id;

    const delegated = await donald('/api/tasks/delegated');
    assert(delegated.json.some((t) => t.id === taskId), 'task shows under Donald\'s delegated');

    // Eric logs in, sees it assigned, posts a doubt, marks in_progress
    const eric = makeClient(base);
    await login(eric, '+15550000003');
    const assigned = await eric('/api/tasks/assigned-to-me');
    assert(assigned.json.some((t) => t.id === taskId), 'task shows under Eric\'s assigned-to-me');

    const msg = await eric(`/api/tasks/${taskId}/messages`, {
      method: 'POST', body: JSON.stringify({ body: 'Do you want residential or commercial leads?' }),
    });
    assert(msg.json.messages.length === 1, 'Eric posted a thread message');

    const patched = await eric(`/api/tasks/${taskId}`, { method: 'PATCH', body: JSON.stringify({ status: 'in_progress' }) });
    assert(patched.json.status === 'in_progress', 'status updated to in_progress');

    // Attach a reference link + an uploaded file
    const linkRes = await eric(`/api/tasks/${taskId}/attachments/link`, {
      method: 'POST', body: JSON.stringify({ url: 'drive.google.com/specs', label: 'Lead spec sheet' }),
    });
    assert(linkRes.json.attachments.length === 1, 'link attachment added');

    // multipart upload via global FormData/Blob (Node 18+)
    const fd = new FormData();
    fd.append('file', new Blob(['hello,world\n1,2\n'], { type: 'text/csv' }), 'leads.csv');
    const upRes = await fetch(`${base}/api/tasks/${taskId}/attachments/file`, {
      method: 'POST', headers: { Cookie: eric.getCookie() }, body: fd,
    });
    const upJson = await upRes.json();
    assert(upJson.attachments && upJson.attachments.length === 2, 'file attachment uploaded (2 total)');

    const fileAtt = upJson.attachments.find((a) => a.kind === 'file');
    const dl = await fetch(`${base}/api/tasks/${taskId}/attachments/${fileAtt.id}/download`, { headers: { Cookie: eric.getCookie() } });
    assert(dl.status === 200, 'file attachment downloads (200)');

    // Unauthenticated access is blocked
    const anon = makeClient(base);
    const blocked = await anon('/api/tasks/delegated');
    assert(blocked.status === 401, 'unauthenticated API call returns 401');

    origLog('\n✅ E2E smoke passed.\n');
  } finally {
    server.close();
    console.log = origLog;
    await destroyKnex();
  }
}

main().catch((e) => { console.log = origLog; console.error(e); process.exitCode = 1; destroyKnex(); });
