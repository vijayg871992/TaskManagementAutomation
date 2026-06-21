'use strict';

const fs = require('fs');
const path = require('path');
const knexLib = require('knex');
const config = require('../config');

let instance = null;

const dirs = {
  migrations: { directory: path.join(__dirname, '..', '..', 'migrations') },
  seeds: { directory: path.join(__dirname, '..', '..', 'seeds') },
};

function buildConfig() {
  const client = config.db.client;
  if (client === 'pg') {
    return {
      client: 'pg',
      connection: config.db.databaseUrl,
      pool: { min: 0, max: 10 },
      ...dirs,
    };
  }
  // better-sqlite3
  const file = config.db.sqliteFile;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  return {
    client: 'better-sqlite3',
    connection: { filename: file },
    useNullAsDefault: true,
    pool: {
      afterCreate: (conn, done) => {
        conn.pragma('foreign_keys = ON');
        done(null, conn);
      },
    },
    ...dirs,
  };
}

function getKnex() {
  if (!instance) {
    instance = knexLib(buildConfig());
  }
  return instance;
}

async function destroyKnex() {
  if (instance) {
    await instance.destroy();
    instance = null;
  }
}

module.exports = { getKnex, destroyKnex };
