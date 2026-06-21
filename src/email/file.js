'use strict';

const fs = require('fs');
const path = require('path');
const config = require('../config');

/** Demo email transport — writes each rendered message to <app>/data/outbox. */
const OUTBOX = path.join(config.dataDir, 'outbox');

async function send({ to, subject, html, text }) {
  fs.mkdirSync(OUTBOX, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const safeTo = String(to).replace(/[^a-z0-9@._-]/gi, '_');
  const file = path.join(OUTBOX, `${stamp}__${safeTo}.html`);
  const doc = `<!-- To: ${to} -->\n<!-- Subject: ${subject} -->\n${html || `<pre>${text || ''}</pre>`}`;
  fs.writeFileSync(file, doc, 'utf8');
  console.log(`[email:file] wrote ${file}`);
  return { ok: true, provider: 'file', file };
}

module.exports = { send };
