'use strict';

/**
 * Daily digest runner. Invoked by system cron at 5 AM America/New_York.
 * Builds + sends one email per active user with an email address.
 *
 *   node scripts/digest.js            # all users
 *   node scripts/digest.js --user Vijay   # one user (handy for demos)
 */

const { destroyKnex } = require('../src/db/knex');
const taskService = require('../src/services/taskService');
const digestService = require('../src/services/digestService');
const { renderDigest } = require('../src/email/render');
const email = require('../src/email');

async function main() {
  const argIdx = process.argv.indexOf('--user');
  const onlyUser = argIdx > -1 ? process.argv[argIdx + 1] : null;

  let users = await taskService.listUsers();
  if (onlyUser) users = users.filter((u) => u.name.toLowerCase() === onlyUser.toLowerCase());

  let sent = 0;
  for (const user of users) {
    if (!user.email) {
      console.log(`[digest] skip ${user.name} (no email)`);
      continue;
    }
    const payload = await digestService.buildFor(user);
    if (payload.delegated.length === 0 && payload.assigned.length === 0) {
      console.log(`[digest] skip ${user.name} (no open tasks)`);
      continue;
    }
    const { subject, html, text } = renderDigest(payload);
    await email.send({ to: user.email, subject, html, text });
    sent++;
    console.log(`[digest] sent to ${user.name} <${user.email}>`);
  }
  console.log(`[digest] done — ${sent} email(s).`);
}

main()
  .catch((e) => {
    console.error('[digest] failed:', e);
    process.exitCode = 1;
  })
  .finally(() => destroyKnex());
