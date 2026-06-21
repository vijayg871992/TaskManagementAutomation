'use strict';

/** Demo SMS provider — prints the code to stdout so you can log in without Aloware. */
async function sendSms(to, body) {
  console.log('\n==================== SMS (console) ====================');
  console.log(`  To: ${to}`);
  console.log(`  ${body}`);
  console.log('======================================================\n');
  return { ok: true, provider: 'console' };
}

module.exports = { sendSms };
