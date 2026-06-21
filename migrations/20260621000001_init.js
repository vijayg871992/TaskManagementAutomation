'use strict';

/**
 * Initial schema. Written to work identically on better-sqlite3 and Postgres
 * (knex abstracts the type differences). Timestamps are stored as ISO-8601
 * UTC strings so behaviour is identical across both engines.
 */

exports.up = async function up(knex) {
  await knex.schema.createTable('users', (t) => {
    t.increments('id').primary();
    t.string('name').notNullable();
    t.string('phone').notNullable().unique();
    t.string('email');
    t.string('role');
    t.boolean('active').notNullable().defaultTo(true);
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('projects', (t) => {
    t.increments('id').primary();
    t.string('name').notNullable().unique();
    t.boolean('active').notNullable().defaultTo(true);
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('tasks', (t) => {
    t.increments('id').primary();
    t.integer('assigner_id').notNullable().references('id').inTable('users');
    t.integer('assignee_id').notNullable().references('id').inTable('users');
    t.integer('project_id').notNullable().references('id').inTable('projects');
    t.text('description').notNullable();
    // Deadline stored as ISO-8601 UTC string.
    t.string('deadline_utc').notNullable();
    t.string('status').notNullable().defaultTo('open'); // open | in_progress | done
    t.string('created_at').notNullable();
    t.string('updated_at').notNullable();
  });

  await knex.schema.createTable('task_messages', (t) => {
    t.increments('id').primary();
    t.integer('task_id').notNullable().references('id').inTable('tasks').onDelete('CASCADE');
    t.integer('author_id').notNullable().references('id').inTable('users');
    t.text('body').notNullable();
    t.string('created_at').notNullable();
  });

  await knex.schema.createTable('otp_codes', (t) => {
    t.increments('id').primary();
    t.string('phone').notNullable();
    t.string('code_hash').notNullable();
    t.string('expires_at').notNullable(); // ISO UTC
    t.string('used_at'); // ISO UTC or null
    t.string('created_at').notNullable();
    t.index(['phone']);
  });
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('otp_codes');
  await knex.schema.dropTableIfExists('task_messages');
  await knex.schema.dropTableIfExists('tasks');
  await knex.schema.dropTableIfExists('projects');
  await knex.schema.dropTableIfExists('users');
};
