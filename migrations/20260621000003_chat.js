'use strict';

/**
 * Persistent "Hey Jarvis" chat log — every instruction the user types and every
 * reply Jarvis gives, kept in one place per user.
 *
 * Note: created_at is captured server-side for ordering, but the UI does not
 * surface the time/date yet (per request — that gets turned on with the
 * production DB move).
 */

exports.up = async function up(knex) {
  await knex.schema.createTable('chat_messages', (t) => {
    t.increments('id').primary();
    t.integer('user_id').notNullable().references('id').inTable('users');
    t.string('role').notNullable(); // 'user' | 'jarvis'
    t.text('text').notNullable();
    t.string('status'); // for jarvis replies: created | need_project | error
    t.integer('task_id').references('id').inTable('tasks'); // linked task, if created
    t.string('created_at').notNullable();
    t.index(['user_id', 'id']);
  });
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('chat_messages');
};
