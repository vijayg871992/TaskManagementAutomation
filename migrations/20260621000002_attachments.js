'use strict';

/** Reference docs on a task: uploaded files, images, or links. */

exports.up = async function up(knex) {
  await knex.schema.createTable('task_attachments', (t) => {
    t.increments('id').primary();
    t.integer('task_id').notNullable().references('id').inTable('tasks').onDelete('CASCADE');
    t.integer('uploaded_by').notNullable().references('id').inTable('users');
    t.string('kind').notNullable(); // 'file' | 'image' | 'link'
    t.string('label').notNullable(); // display name / link title / original filename
    t.string('url'); // for links
    t.string('path'); // relative stored path for files (under data/uploads)
    t.string('mime');
    t.integer('size');
    t.string('created_at').notNullable();
    t.index(['task_id']);
  });
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('task_attachments');
};
