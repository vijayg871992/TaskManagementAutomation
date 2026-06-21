'use strict';

const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const config = require('../../config');
const commandService = require('../../services/commandService');
const taskService = require('../../services/taskService');
const chatService = require('../../services/chatService');
const push = require('../../push');

const router = express.Router();

// Notify the assignee when a task is created for them (not for self-assigned).
async function notifyAssigned(result, assignerId) {
  if (result.status !== 'created' || !result.task) return;
  const t = result.task;
  if (t.assignee_id === assignerId) return;
  push.sendToUser(t.assignee_id, {
    title: `New task from ${t.assigner_name}`,
    body: t.description,
    taskId: t.id,
    kind: 'assigned',
  });
}

// Turn a command result into the text Jarvis "says" in the chat log.
function jarvisReplyText(result) {
  if (result.status === 'created') return result.summary;
  return result.message;
}

// --- File uploads (reference docs) stored under <app>/data/uploads ---
const UPLOAD_DIR = path.join(config.dataDir, 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const safe = file.originalname.replace(/[^\w.\-]+/g, '_').slice(-80);
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safe}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 15 * 1024 * 1024 } }); // 15 MB

// Helper: only the assigner or assignee may touch a task.
async function loadTaskAsMember(req, res) {
  const task = await taskService.getTaskById(Number(req.params.id));
  if (!task) {
    res.status(404).json({ error: 'Not found.' });
    return null;
  }
  if (![task.assignee_id, task.assigner_id].includes(req.session.userId)) {
    res.status(403).json({ error: 'Not your task.' });
    return null;
  }
  return task;
}

// Auth gate for everything in this router.
function requireAuth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: 'Not signed in.' });
  next();
}
router.use(requireAuth);

// Submit a "Hey Jarvis" instruction.
router.post('/command', async (req, res) => {
  const userId = req.session.userId;
  const text = req.body.text || '';
  try {
    await chatService.logUser(userId, text);
    const result = await commandService.handle({ senderId: userId, text });
    await chatService.logJarvis(userId, {
      text: jarvisReplyText(result),
      status: result.status,
      taskId: result.task ? result.task.id : null,
    });
    await notifyAssigned(result, userId);
    res.json(result);
  } catch (e) {
    console.error('command error:', e);
    res.status(500).json({ status: 'error', message: 'Something went wrong parsing that.' });
  }
});

// Complete the need_project flow once a project is picked.
router.post('/command/pick-project', async (req, res) => {
  const userId = req.session.userId;
  try {
    const result = await commandService.createFromDraft({
      senderId: userId,
      draft: req.body.draft,
      projectId: req.body.projectId,
    });
    await chatService.logJarvis(userId, {
      text: jarvisReplyText(result),
      status: result.status,
      taskId: result.task ? result.task.id : null,
    });
    await notifyAssigned(result, userId);
    res.json(result);
  } catch (e) {
    console.error('pick-project error:', e);
    res.status(500).json({ status: 'error', message: 'Could not create the task.' });
  }
});

// Full Jarvis chat history for the signed-in user.
router.get('/chat', async (req, res) => {
  res.json(await chatService.getHistory(req.session.userId));
});

router.get('/tasks/assigned-to-me', async (req, res) => {
  res.json(await taskService.getAssignedTo(req.session.userId));
});

router.get('/tasks/delegated', async (req, res) => {
  res.json(await taskService.getDelegatedBy(req.session.userId));
});

// All tasks across the team (for the dashboard). Private tasks only show to their members.
router.get('/tasks/all', async (req, res) => {
  res.json(await taskService.getAllTasksForViewer(req.session.userId));
});

router.get('/tasks/:id', async (req, res) => {
  const task = await taskService.getTaskById(Number(req.params.id));
  if (!task) return res.status(404).json({ error: 'Not found.' });
  const messages = await taskService.getMessages(task.id);
  const attachments = await taskService.listAttachments(task.id);
  res.json({ task, messages, attachments });
});

router.patch('/tasks/:id', async (req, res) => {
  try {
    const task = await taskService.getTaskById(Number(req.params.id));
    if (!task) return res.status(404).json({ error: 'Not found.' });
    // Only the assignee or assigner may change status / privacy.
    if (![task.assignee_id, task.assigner_id].includes(req.session.userId)) {
      return res.status(403).json({ error: 'Not your task.' });
    }
    let updated = task;
    if (typeof req.body.status === 'string') {
      updated = await taskService.updateStatus(task.id, req.body.status);
    }
    if (typeof req.body.is_private === 'boolean') {
      updated = await taskService.setPrivacy(task.id, req.body.is_private);
    }
    res.json(updated);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Post a message/doubt to a task thread.
router.post('/tasks/:id/messages', async (req, res) => {
  const task = await taskService.getTaskById(Number(req.params.id));
  if (!task) return res.status(404).json({ error: 'Not found.' });
  if (![task.assignee_id, task.assigner_id].includes(req.session.userId)) {
    return res.status(403).json({ error: 'Not your task.' });
  }
  const body = String(req.body.body || '').trim();
  if (!body) return res.status(400).json({ error: 'Empty message.' });
  const messages = await taskService.addMessage(task.id, req.session.userId, body);

  // Notify the OTHER party in the task (assigner <-> assignee).
  const recipientId = req.session.userId === task.assignee_id ? task.assigner_id : task.assignee_id;
  const author = await taskService.findUserById(req.session.userId);
  if (recipientId && recipientId !== req.session.userId) {
    push.sendToUser(recipientId, {
      title: `${author ? author.name : 'Someone'} replied on "${task.description.slice(0, 40)}"`,
      body,
      taskId: task.id,
      kind: 'message',
    });
  }
  res.json({ messages });
});

// ---- Reference docs / attachments ----

// Upload a file or image.
router.post('/tasks/:id/attachments/file', upload.single('file'), async (req, res) => {
  const task = await loadTaskAsMember(req, res);
  if (!task) return;
  if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });
  const attachments = await taskService.addFileAttachment(task.id, req.session.userId, {
    label: req.file.originalname,
    path: path.basename(req.file.path),
    mime: req.file.mimetype,
    size: req.file.size,
  });
  res.json({ attachments });
});

// Attach a link.
router.post('/tasks/:id/attachments/link', async (req, res) => {
  const task = await loadTaskAsMember(req, res);
  if (!task) return;
  let url = String(req.body.url || '').trim();
  if (!url) return res.status(400).json({ error: 'Empty link.' });
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
  const attachments = await taskService.addLinkAttachment(task.id, req.session.userId, {
    url,
    label: String(req.body.label || '').trim() || url,
  });
  res.json({ attachments });
});

// Download / view a file attachment.
router.get('/tasks/:id/attachments/:aid/download', async (req, res) => {
  const task = await loadTaskAsMember(req, res);
  if (!task) return;
  const att = await taskService.getAttachment(Number(req.params.aid));
  if (!att || att.task_id !== task.id || !att.path) {
    return res.status(404).json({ error: 'Not found.' });
  }
  const abs = path.join(UPLOAD_DIR, att.path);
  if (!fs.existsSync(abs)) return res.status(404).json({ error: 'File missing.' });
  if (att.mime) res.type(att.mime);
  const disp = att.kind === 'image' ? 'inline' : 'attachment';
  res.setHeader('Content-Disposition', `${disp}; filename="${att.label.replace(/"/g, '')}"`);
  fs.createReadStream(abs).pipe(res);
});

// Remove an attachment.
router.delete('/tasks/:id/attachments/:aid', async (req, res) => {
  const task = await loadTaskAsMember(req, res);
  if (!task) return;
  const att = await taskService.getAttachment(Number(req.params.aid));
  if (!att || att.task_id !== task.id) return res.status(404).json({ error: 'Not found.' });
  if (att.path) {
    try { fs.unlinkSync(path.join(UPLOAD_DIR, att.path)); } catch (_) { /* ignore */ }
  }
  await taskService.deleteAttachment(att.id);
  res.json({ attachments: await taskService.listAttachments(task.id) });
});

router.get('/projects', async (req, res) => {
  res.json(await taskService.listProjects());
});

// Create a project with an optional description.
router.post('/projects', async (req, res) => {
  const name = String(req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Project name is required.' });
  const project = await taskService.createProject({ name, description: req.body.description });
  res.json(project);
});

// ---- Web Push ----
router.get('/push/public-key', (req, res) => {
  res.json({ publicKey: push.getPublicKey() });
});

router.post('/push/subscribe', async (req, res) => {
  await push.saveSubscription(req.session.userId, req.body.subscription);
  res.json({ ok: true });
});

module.exports = router;
