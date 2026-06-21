'use strict';

const { getKnex } = require('../db/knex');
const { nowUtcISO } = require('../util/time');

const VALID_STATUS = ['open', 'in_progress', 'done'];

async function listUsers() {
  return getKnex()('users').where({ active: true }).orderBy('name');
}

async function listProjects() {
  return getKnex()('projects').where({ active: true }).orderBy('name');
}

async function findUserByName(name) {
  if (!name) return null;
  return getKnex()('users')
    .whereRaw('LOWER(name) = ?', [String(name).toLowerCase()])
    .andWhere({ active: true })
    .first();
}

async function findUserById(id) {
  return getKnex()('users').where({ id }).first();
}

async function findUserByPhone(phone) {
  return getKnex()('users').where({ phone }).first();
}

async function findProjectByName(name) {
  if (!name) return null;
  return getKnex()('projects')
    .whereRaw('LOWER(name) = ?', [String(name).toLowerCase()])
    .andWhere({ active: true })
    .first();
}

async function createTask({ assignerId, assigneeId, projectId, description, deadlineUtc, isPrivate }) {
  const now = nowUtcISO();
  const [row] = await getKnex()('tasks')
    .insert({
      assigner_id: assignerId,
      assignee_id: assigneeId,
      project_id: projectId,
      description,
      deadline_utc: deadlineUtc,
      status: 'open',
      is_private: !!isPrivate,
      created_at: now,
      updated_at: now,
    })
    .returning('*');
  // better-sqlite3 returning may give id only on some versions — normalise.
  if (row && typeof row === 'object' && row.id) return getTaskById(row.id);
  const id = Array.isArray(row) ? row[0] : row;
  return getTaskById(id);
}

function taskJoin() {
  return getKnex()('tasks')
    .leftJoin('users as assigner', 'tasks.assigner_id', 'assigner.id')
    .leftJoin('users as assignee', 'tasks.assignee_id', 'assignee.id')
    .leftJoin('projects', 'tasks.project_id', 'projects.id')
    .select(
      'tasks.*',
      'assigner.name as assigner_name',
      'assignee.name as assignee_name',
      'projects.name as project_name'
    );
}

async function getTaskById(id) {
  return taskJoin().where('tasks.id', id).first();
}

async function getAssignedTo(userId) {
  return taskJoin().where('tasks.assignee_id', userId).orderBy('tasks.deadline_utc');
}

async function getDelegatedBy(userId) {
  return taskJoin().where('tasks.assigner_id', userId).orderBy('tasks.deadline_utc');
}

async function setPrivacy(taskId, isPrivate) {
  await getKnex()('tasks').where({ id: taskId }).update({
    is_private: !!isPrivate,
    updated_at: nowUtcISO(),
  });
  return getTaskById(taskId);
}

/**
 * All tasks for the dashboard, across the team. Private tasks are only included
 * for the viewer when they are the assigner or assignee.
 */
async function getAllTasksForViewer(viewerId) {
  return taskJoin()
    .where(function () {
      this.where('tasks.is_private', false)
        .orWhere('tasks.assigner_id', viewerId)
        .orWhere('tasks.assignee_id', viewerId);
    })
    .orderBy('tasks.deadline_utc');
}

async function createProject({ name, description }) {
  const existing = await findProjectByName(name);
  if (existing) return existing;
  const [row] = await getKnex()('projects')
    .insert({ name, description: description || null, active: true, created_at: nowUtcISO() })
    .returning('id');
  const id = row && typeof row === 'object' ? row.id : row;
  return getKnex()('projects').where({ id }).first();
}

async function updateStatus(taskId, status) {
  if (!VALID_STATUS.includes(status)) {
    throw new Error(`Invalid status: ${status}`);
  }
  await getKnex()('tasks').where({ id: taskId }).update({
    status,
    updated_at: nowUtcISO(),
  });
  return getTaskById(taskId);
}

async function addMessage(taskId, authorId, body) {
  const now = nowUtcISO();
  await getKnex()('task_messages').insert({
    task_id: taskId,
    author_id: authorId,
    body,
    created_at: now,
  });
  await getKnex()('tasks').where({ id: taskId }).update({ updated_at: now });
  return getMessages(taskId);
}

async function getMessages(taskId) {
  return getKnex()('task_messages')
    .leftJoin('users', 'task_messages.author_id', 'users.id')
    .where('task_messages.task_id', taskId)
    .select('task_messages.*', 'users.name as author_name')
    .orderBy('task_messages.created_at');
}

async function addLinkAttachment(taskId, userId, { url, label }) {
  await getKnex()('task_attachments').insert({
    task_id: taskId,
    uploaded_by: userId,
    kind: 'link',
    label: label || url,
    url,
    created_at: nowUtcISO(),
  });
  return listAttachments(taskId);
}

async function addFileAttachment(taskId, userId, { label, path, mime, size }) {
  const kind = mime && mime.startsWith('image/') ? 'image' : 'file';
  await getKnex()('task_attachments').insert({
    task_id: taskId,
    uploaded_by: userId,
    kind,
    label,
    path,
    mime,
    size,
    created_at: nowUtcISO(),
  });
  return listAttachments(taskId);
}

async function listAttachments(taskId) {
  return getKnex()('task_attachments')
    .leftJoin('users', 'task_attachments.uploaded_by', 'users.id')
    .where('task_attachments.task_id', taskId)
    .select('task_attachments.*', 'users.name as uploaded_by_name')
    .orderBy('task_attachments.created_at');
}

async function getAttachment(id) {
  return getKnex()('task_attachments').where({ id }).first();
}

async function deleteAttachment(id) {
  await getKnex()('task_attachments').where({ id }).del();
}

module.exports = {
  VALID_STATUS,
  listUsers,
  addLinkAttachment,
  addFileAttachment,
  listAttachments,
  getAttachment,
  deleteAttachment,
  listProjects,
  findUserByName,
  findUserById,
  findUserByPhone,
  findProjectByName,
  createTask,
  getTaskById,
  getAssignedTo,
  getDelegatedBy,
  getAllTasksForViewer,
  setPrivacy,
  createProject,
  updateStatus,
  addMessage,
  getMessages,
};
