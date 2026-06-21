'use strict';

const { getKnex } = require('../db/knex');
const { nowUtcISO } = require('../util/time');

/** Log the user's typed instruction. */
async function logUser(userId, text) {
  return insert(userId, 'user', text, null, null);
}

/** Log Jarvis's reply (status: created | need_project | error). */
async function logJarvis(userId, { text, status, taskId }) {
  return insert(userId, 'jarvis', text, status || null, taskId || null);
}

async function insert(userId, role, text, status, taskId) {
  const created_at = nowUtcISO(); // stored for ordering; not shown in UI yet
  const [row] = await getKnex()('chat_messages')
    .insert({ user_id: userId, role, text, status, task_id: taskId, created_at })
    .returning('id');
  const id = row && typeof row === 'object' ? row.id : row;
  return { id, role, text, status, task_id: taskId };
}

/** Full chat history for one user, oldest first. */
async function getHistory(userId) {
  return getKnex()('chat_messages')
    .where({ user_id: userId })
    .orderBy('id', 'asc')
    .select('id', 'role', 'text', 'status', 'task_id');
}

module.exports = { logUser, logJarvis, getHistory };
