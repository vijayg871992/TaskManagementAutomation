'use strict';

/**
 * Add-ons: project descriptions, private tasks, test-user fixed codes,
 * and Web Push subscriptions.
 */

exports.up = async function up(knex) {
  await knex.schema.alterTable('projects', (t) => {
    t.text('description');
  });

  await knex.schema.alterTable('tasks', (t) => {
    t.boolean('is_private').notNullable().defaultTo(false);
  });

  await knex.schema.alterTable('users', (t) => {
    // For test accounts: a fixed OTP that always works and never sends a real SMS.
    t.string('test_code');
  });

  await knex.schema.createTable('push_subscriptions', (t) => {
    t.increments('id').primary();
    t.integer('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.text('endpoint').notNullable().unique();
    t.string('p256dh').notNullable();
    t.string('auth').notNullable();
    t.string('created_at').notNullable();
    t.index(['user_id']);
  });
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('push_subscriptions');
  await knex.schema.alterTable('users', (t) => t.dropColumn('test_code'));
  await knex.schema.alterTable('tasks', (t) => t.dropColumn('is_private'));
  await knex.schema.alterTable('projects', (t) => t.dropColumn('description'));
};
