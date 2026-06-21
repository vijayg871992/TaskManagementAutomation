'use strict';

const path = require('path');

// App root = two levels up from src/config. Used to anchor file paths so the
// app works the same regardless of the launch cwd (preview, cron, systemd).
const APP_ROOT = path.join(__dirname, '..', '..');

// Load .env from the app root explicitly (not cwd) so cron/systemd work too.
require('dotenv').config({ path: path.join(APP_ROOT, '.env') });

function bool(v, def = false) {
  if (v === undefined || v === null || v === '') return def;
  return String(v).toLowerCase() === 'true' || v === '1';
}

const config = {
  appRoot: APP_ROOT,
  dataDir: path.join(APP_ROOT, 'data'),
  port: parseInt(process.env.PORT || '3000', 10),
  sessionSecret: process.env.SESSION_SECRET || 'dev-insecure-secret',
  appTz: process.env.APP_TZ || 'America/New_York',
  appBaseUrl: (process.env.APP_BASE_URL || 'http://localhost:3000').replace(/\/$/, ''),

  db: {
    client: process.env.DB_CLIENT || 'better-sqlite3',
    // Resolve relative sqlite paths against the app root (not cwd) for consistency.
    sqliteFile: process.env.SQLITE_FILE
      ? (path.isAbsolute(process.env.SQLITE_FILE) ? process.env.SQLITE_FILE : path.join(APP_ROOT, process.env.SQLITE_FILE))
      : path.join(APP_ROOT, 'data', 'jarvis.sqlite'),
    databaseUrl: process.env.DATABASE_URL || '',
  },

  nlp: {
    provider: process.env.NLP_PROVIDER || 'mock',
    geminiApiKey: process.env.GEMINI_API_KEY || '',
    geminiModel: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
  },

  sms: {
    provider: process.env.SMS_PROVIDER || 'console',
    alowareApiBase: process.env.ALOWARE_API_BASE || 'https://app.aloware.io',
    alowareApiToken: process.env.ALOWARE_API_TOKEN || '',
    // Provide EITHER a "from" line phone number OR a line_id.
    alowareFrom: process.env.ALOWARE_FROM || '',
    alowareLineId: process.env.ALOWARE_LINE_ID || '',
    // Optional: send on behalf of a user. -1 = company, 0 = contact owner, or a user id.
    alowareUserId: process.env.ALOWARE_USER_ID || '',
  },

  email: {
    provider: process.env.EMAIL_PROVIDER || 'file',
    from: process.env.EMAIL_FROM || 'JAB Jarvis <noreply@example.com>',
    smtp: {
      host: process.env.SMTP_HOST || 'smtp.office365.com',
      port: parseInt(process.env.SMTP_PORT || '587', 10),
      secure: bool(process.env.SMTP_SECURE, false),
      user: process.env.SMTP_USER || '',
      pass: process.env.SMTP_PASS || '',
    },
  },

  // OTP behaviour
  otp: {
    ttlMinutes: 10,
    length: 6,
  },

  // Web Push (free; VAPID). Generate keys with: npx web-push generate-vapid-keys
  push: {
    publicKey: process.env.VAPID_PUBLIC_KEY || '',
    privateKey: process.env.VAPID_PRIVATE_KEY || '',
    subject: process.env.VAPID_SUBJECT || 'mailto:admin@example.com',
  },
};

module.exports = config;
