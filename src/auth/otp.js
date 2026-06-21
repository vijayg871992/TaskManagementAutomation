'use strict';

const crypto = require('crypto');
const { DateTime } = require('luxon');
const config = require('../config');
const { getKnex } = require('../db/knex');
const { sendSms } = require('./sms');
const taskService = require('../services/taskService');
const { normalizeUsPhone } = require('../util/phone');

function hashCode(phone, code) {
  return crypto
    .createHash('sha256')
    .update(`${phone}:${code}:${config.sessionSecret}`)
    .digest('hex');
}

function genCode(len) {
  // numeric, no leading-zero loss
  let s = '';
  while (s.length < len) s += crypto.randomInt(0, 10).toString();
  return s.slice(0, len);
}

/**
 * Generate + send an OTP for a phone that belongs to a known user.
 * Returns { ok, message }. Never reveals whether the phone exists (anti-enumeration)
 * but for an internal tool we keep it friendly.
 */
async function requestOtp(rawPhone) {
  const phone = normalizeUsPhone(rawPhone);
  if (!phone) {
    return { ok: false, message: 'Enter a valid US mobile number, e.g. (646) 787-1339.' };
  }
  const user = await taskService.findUserByPhone(phone);
  if (!user) {
    return { ok: false, message: 'That number is not on the JAB roster.' };
  }

  // Test accounts (e.g. Tony) use a fixed code and never send a real SMS.
  if (user.test_code) {
    return { ok: true, message: 'Test account — use your fixed code.', userName: user.name, test: true };
  }

  const code = genCode(config.otp.length);
  const now = DateTime.utc();
  await getKnex()('otp_codes').insert({
    phone,
    code_hash: hashCode(phone, code),
    expires_at: now.plus({ minutes: config.otp.ttlMinutes }).toISO(),
    used_at: null,
    created_at: now.toISO(),
  });

  await sendSms(phone, `Your JAB Jarvis code is ${code}. Expires in ${config.otp.ttlMinutes} min.`);
  return { ok: true, message: 'Code sent.', userName: user.name };
}

/** Verify a code. Returns the user on success, else null. */
async function verifyOtp(rawPhone, rawCode) {
  const phone = normalizeUsPhone(rawPhone);
  const code = String(rawCode || '').trim();
  if (!phone) return null;

  // Test accounts: accept the fixed code directly.
  const candidate = await taskService.findUserByPhone(phone);
  if (candidate && candidate.test_code) {
    return candidate.test_code === code ? candidate : null;
  }

  const nowISO = DateTime.utc().toISO();

  const row = await getKnex()('otp_codes')
    .where({ phone, code_hash: hashCode(phone, code) })
    .andWhere('expires_at', '>', nowISO)
    .whereNull('used_at')
    .orderBy('id', 'desc')
    .first();

  if (!row) return null;

  await getKnex()('otp_codes').where({ id: row.id }).update({ used_at: nowISO });
  return taskService.findUserByPhone(phone);
}

module.exports = { requestOtp, verifyOtp };
