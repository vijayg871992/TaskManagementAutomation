'use strict';

/**
 * The single code path for turning a natural-language instruction into a task.
 * Used identically by the HTTP route and the test harness (scripts/simulate.js).
 *
 * Returns a typed result:
 *   { status: 'created',      task }
 *   { status: 'need_project', message, projects }   // project missing/unknown
 *   { status: 'error',        message }             // bad format / missing required fields
 */

const nlp = require('../nlp');
const taskService = require('./taskService');
const { nowInTz, toDeadlineUtc, hasExplicitTime } = require('../util/time');

const WAKE_RE = /^\s*(hey\s+jarvis|hi\s+jarvis|jarvis)\b[\s,:-]*/i;

const FORMAT_HELP =
  'I couldn\'t read that. Use: "Hey Jarvis, assign <person> for <project> to <task> by <date> <time>". ' +
  'A person, a task description, and a deadline date are required.';

function stripWakeWord(text) {
  return text.replace(WAKE_RE, '').trim();
}

/**
 * @param {object} args
 * @param {number} args.senderId  - the authenticated/simulated assigner's user id
 * @param {string} args.text      - raw instruction including the wake word
 */
async function handle({ senderId, text }) {
  if (!text || !WAKE_RE.test(text)) {
    return {
      status: 'error',
      message: 'Start your request with "Hey Jarvis" so I know to listen. e.g. ' +
        '"Hey Jarvis, assign Eric for Cold Calling to pull 400 leads by Monday 4pm."',
    };
  }

  const sender = await taskService.findUserById(senderId);
  if (!sender) return { status: 'error', message: 'Unknown sender.' };

  const body = stripWakeWord(text);
  const users = await taskService.listUsers();
  const projects = await taskService.listProjects();
  const now = nowInTz();

  // "private" / "privately" / "private task" anywhere marks the task private.
  const isPrivate = /\bprivate(ly)?\b/i.test(body);

  const parsed = await nlp.extract(body, { now, users, projects });

  // Keep the privacy keyword out of the saved task description.
  if (parsed.description) {
    parsed.description = parsed.description
      .replace(/\b(as a private task|private task|privately|private)\b/gi, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  // ---- Validation rules (provider-agnostic) ----

  // Required: assignee, description, deadline DATE. If any missing -> error, no task.
  const missing = [];
  if (!parsed.assignee) missing.push('who it is assigned to');
  if (!parsed.description) missing.push('the task description');
  if (!parsed.date) missing.push('a deadline date');
  if (missing.length > 0) {
    return {
      status: 'error',
      message: `${FORMAT_HELP} (Missing: ${missing.join(', ')}.)`,
    };
  }

  // Resolve assignee name -> user.
  const assignee = await taskService.findUserByName(parsed.assignee);
  if (!assignee) {
    return {
      status: 'error',
      message: `I don't recognise "${parsed.assignee}" on the team. Known: ${users
        .map((u) => u.name)
        .join(', ')}.`,
    };
  }

  // Project: if missing OR unknown -> ask the sender to pick from the list.
  let project = null;
  if (parsed.project) project = await taskService.findProjectByName(parsed.project);
  if (!project) {
    return {
      status: 'need_project',
      message: parsed.project
        ? `I don't have a project called "${parsed.project}". Which project is this for?`
        : 'Which project is this for?',
      projects: projects.map((p) => ({ id: p.id, name: p.name })),
      // Echo back the rest so the client can resubmit once a project is chosen.
      draft: {
        assigneeId: assignee.id,
        description: parsed.description,
        date: parsed.date,
        time: parsed.time,
        isPrivate,
      },
    };
  }

  // Deadline: time missing but date present -> default 5 PM ET.
  const { utc, localPretty } = toDeadlineUtc(parsed.date, parsed.time);
  const usedDefaultTime = !hasExplicitTime(parsed.time);

  const task = await taskService.createTask({
    assignerId: sender.id,
    assigneeId: assignee.id,
    projectId: project.id,
    description: parsed.description,
    deadlineUtc: utc,
    isPrivate,
  });

  return {
    status: 'created',
    task,
    summary: `Assigned to ${assignee.name} for ${project.name}: "${parsed.description}" — due ${localPretty}${
      usedDefaultTime ? ' (defaulted to 5 PM ET)' : ''
    }${isPrivate ? ' 🔒 private' : ''}.`,
  };
}

/**
 * Create a task directly once a project has been chosen from the picker.
 * (Second step of the need_project flow.)
 */
async function createFromDraft({ senderId, draft, projectId }) {
  const sender = await taskService.findUserById(senderId);
  const project = await taskService
    .listProjects()
    .then((ps) => ps.find((p) => p.id === Number(projectId)));
  if (!sender || !project) return { status: 'error', message: 'Invalid project selection.' };

  const { utc, localPretty } = toDeadlineUtc(draft.date, draft.time);
  const usedDefaultTime = !hasExplicitTime(draft.time);
  const assignee = await taskService.findUserById(draft.assigneeId);

  const task = await taskService.createTask({
    assignerId: sender.id,
    assigneeId: draft.assigneeId,
    projectId: project.id,
    description: draft.description,
    deadlineUtc: utc,
    isPrivate: draft.isPrivate,
  });

  return {
    status: 'created',
    task,
    summary: `Assigned to ${assignee ? assignee.name : 'user'} for ${project.name}: "${draft.description}" — due ${localPretty}${
      usedDefaultTime ? ' (defaulted to 5 PM ET)' : ''
    }${draft.isPrivate ? ' 🔒 private' : ''}.`,
  };
}

module.exports = { handle, createFromDraft, stripWakeWord, WAKE_RE };
