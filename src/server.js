'use strict';

const config = require('./config');
const { getKnex } = require('./db/knex');
const { createApp } = require('./web/app');

async function start() {
  // Ensure schema is present before serving (safe to run repeatedly).
  const knex = getKnex();
  await knex.migrate.latest();
  await knex.seed.run();

  const app = createApp();
  app.listen(config.port, () => {
    console.log(`JAB Jarvis listening on http://localhost:${config.port}`);
    console.log(`  DB=${config.db.client}  NLP=${config.nlp.provider}  SMS=${config.sms.provider}  EMAIL=${config.email.provider}`);
  });
}

start().catch((e) => {
  console.error('Failed to start:', e);
  process.exit(1);
});
