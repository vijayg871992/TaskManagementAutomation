'use strict';

/**
 * Aloware SMS provider — matches the SMS Gateway API:
 *   POST {base}/api/v1/webhook/sms-gateway/send
 *   body: { api_token, from | line_id, to, message, [user_id] }
 *   headers: Accept + Content-Type application/json
 *   success: HTTP 202 { "message": "Message sent." }
 *
 * Credentials come from env (ALOWARE_API_TOKEN, and either ALOWARE_FROM or
 * ALOWARE_LINE_ID). Optional ALOWARE_USER_ID to send on behalf of a user.
 */

const config = require('../../config');

const PATH = '/api/v1/webhook/sms-gateway/send';

async function sendSms(to, message) {
  const c = config.sms;
  if (!c.alowareApiToken) {
    throw new Error('ALOWARE_API_TOKEN is not set (required when SMS_PROVIDER=aloware).');
  }
  if (!c.alowareFrom && !c.alowareLineId) {
    throw new Error('Set ALOWARE_FROM (a line phone number) or ALOWARE_LINE_ID.');
  }

  const body = {
    api_token: c.alowareApiToken,
    to,
    message: message.slice(0, 160), // Aloware limits SMS to 160 chars
  };
  if (c.alowareLineId) body.line_id = Number(c.alowareLineId);
  else body.from = c.alowareFrom;
  if (c.alowareUserId !== '') body.user_id = Number(c.alowareUserId);

  const url = `${c.alowareApiBase.replace(/\/$/, '')}${PATH}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (res.status !== 202 && !res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Aloware SMS failed: ${res.status} ${text}`);
  }
  return { ok: true, provider: 'aloware' };
}

module.exports = { sendSms };
