'use strict';

const taskService = require('./taskService');
const nlp = require('../nlp');

/** Attach an AI-summarized notes thread to each task. */
async function withNotesSummary(tasks) {
  const out = [];
  for (const t of tasks) {
    const messages = await taskService.getMessages(t.id);
    const summary = await nlp.summarizeThread(
      messages.map((m) => ({ authorName: m.author_name, body: m.body }))
    );
    const attachments = await taskService.listAttachments(t.id);
    out.push({ ...t, notesSummary: summary, attachmentCount: attachments.length });
  }
  return out;
}

/** Build the digest payload for one user (both sections). */
async function buildFor(user) {
  const delegatedRaw = await taskService.getDelegatedBy(user.id);
  const assignedRaw = await taskService.getAssignedTo(user.id);
  const delegated = await withNotesSummary(delegatedRaw.filter((t) => t.status !== 'done'));
  const assigned = await withNotesSummary(assignedRaw.filter((t) => t.status !== 'done'));
  return { user, delegated, assigned };
}

module.exports = { buildFor };
