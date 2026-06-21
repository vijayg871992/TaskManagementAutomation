'use strict';

require('dotenv').config();

const path = require('path');
const fs = require('fs');

const client = process.env.DB_CLIENT || 'better-sqlite3';

const base = {
  migrations: { directory: path.join(__dirname, 'migrations') },
  seeds: { directory: path.join(__dirname, 'seeds') },
};

let connection;
let useNullAsDefault = false;

if (client === 'pg') {
  connection = process.env.DATABASE_URL;
} else {
  // better-sqlite3
  const file = process.env.SQLITE_FILE || path.join(__dirname, 'data', 'jarvis.sqlite');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  connection = { filename: file };
  useNullAsDefault = true;
}

const configuration = {
  client,
  connection,
  useNullAsDefault,
  pool:
    client === 'better-sqlite3'
      ? {
          // Enable FK enforcement on every sqlite connection.
          afterCreate: (conn, done) => {
            conn.pragma('foreign_keys = ON');
            done(null, conn);
          },
        }
      : undefined,
  ...base,
};

// knex CLI expects an environment map; we use a single config for all envs.
module.exports = {
  development: configuration,
  production: configuration,
  test: configuration,
};
