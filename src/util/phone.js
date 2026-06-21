'use strict';

/**
 * US phone handling. People type the American way — "(646) 787-1339",
 * "646-787-1339", "6467871339" — and we normalize to E.164 (+16467871339)
 * for storage, lookup, and sending via Aloware.
 */

/** Normalize a US phone input to E.164 (+1XXXXXXXXXX). Returns null if invalid. */
function normalizeUsPhone(input) {
  if (!input) return null;
  const raw = String(input).trim();

  if (raw.startsWith('+')) {
    const digits = raw.slice(1).replace(/\D/g, '');
    if (digits.length === 11 && digits[0] === '1') return '+' + digits;
    if (digits.length === 10) return '+1' + digits;
    if (digits.length >= 11) return '+' + digits; // other intl — leave as-is
    return null;
  }

  const d = raw.replace(/\D/g, '');
  if (d.length === 10) return '+1' + d;
  if (d.length === 11 && d[0] === '1') return '+' + d;
  return null;
}

/** Format E.164 back to the American display style: +16467871339 -> (646) 787-1339 */
function formatUsPretty(e164) {
  const m = String(e164 || '').match(/^\+1(\d{3})(\d{3})(\d{4})$/);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : e164;
}

module.exports = { normalizeUsPhone, formatUsPretty };
