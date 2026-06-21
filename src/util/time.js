'use strict';

const { DateTime } = require('luxon');
const config = require('../config');

const TZ = config.appTz; // 'America/New_York'

/** Current moment as a luxon DateTime in the app timezone. */
function nowInTz() {
  return DateTime.now().setZone(TZ);
}

/**
 * Resolve a parsed date + optional time into a UTC ISO string.
 *
 * @param {string} dateISO - 'YYYY-MM-DD' (already resolved from relative words by the NLP layer)
 * @param {string|null} timeHHmm - 'HH:mm' 24h, or null/empty to apply the 5 PM default
 * @returns {{ utc: string, localPretty: string }}
 */
function toDeadlineUtc(dateISO, timeHHmm) {
  const time = timeHHmm && /^\d{1,2}:\d{2}$/.test(timeHHmm) ? timeHHmm : '17:00'; // 5 PM default
  const [h, m] = time.split(':').map((n) => parseInt(n, 10));
  const local = DateTime.fromISO(dateISO, { zone: TZ }).set({
    hour: h,
    minute: m,
    second: 0,
    millisecond: 0,
  });
  if (!local.isValid) {
    throw new Error(`Invalid deadline date/time: ${dateISO} ${time}`);
  }
  return {
    utc: local.toUTC().toISO(),
    localPretty: local.toFormat("ccc, LLL d 'at' h:mm a 'ET'"),
  };
}

/** Was a time component supplied (vs. needing the 5 PM default)? */
function hasExplicitTime(timeHHmm) {
  return Boolean(timeHHmm && /^\d{1,2}:\d{2}$/.test(timeHHmm));
}

/** Format a stored UTC ISO string back into NY-local pretty text. */
function formatDeadline(utcISO) {
  const dt = DateTime.fromISO(utcISO, { zone: 'utc' }).setZone(TZ);
  return dt.isValid ? dt.toFormat("ccc, LLL d 'at' h:mm a 'ET'") : utcISO;
}

/** ISO UTC string for "now" — used for created_at/updated_at. */
function nowUtcISO() {
  return DateTime.utc().toISO();
}

module.exports = {
  TZ,
  nowInTz,
  toDeadlineUtc,
  hasExplicitTime,
  formatDeadline,
  nowUtcISO,
};
