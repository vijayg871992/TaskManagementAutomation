'use strict';

/**
 * Test bootstrap. MUST be required before any src module that reads config,
 * because it sets env vars that config captures at require-time.
 */
const os = require('os');
const path = require('path');
const fs = require('fs');

process.env.DB_CLIENT = 'better-sqlite3';
process.env.NLP_PROVIDER = 'mock';
process.env.SMS_PROVIDER = 'console';
process.env.EMAIL_PROVIDER = 'file';
process.env.APP_TZ = 'America/New_York';

const tmpFile = path.join(os.tmpdir(), `jarvis-test-${process.pid}-${Date.now()}.sqlite`);
process.env.SQLITE_FILE = tmpFile;

async function freshDb() {
  const { getKnex } = require('../src/db/knex');
  const knex = getKnex();
  await knex.migrate.latest();
  await knex.seed.run();
  return knex;
}

async function teardown() {
  const { destroyKnex } = require('../src/db/knex');
  await destroyKnex();
  try {
    fs.unlinkSync(tmpFile);
  } catch (_) {
    /* ignore */
  }
}

module.exports = { freshDb, teardown, tmpFile };
