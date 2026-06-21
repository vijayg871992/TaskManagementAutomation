'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert');

const { freshDb, teardown } = require('./_setup');
const { DateTime } = require('luxon');

let knex;
let commandService;
let taskService;

async function senderId(name) {
  const u = await knex('users').whereRaw('LOWER(name)=?', [name.toLowerCase()]).first();
  return u.id;
}

before(async () => {
  knex = await freshDb();
  commandService = require('../src/services/commandService');
  taskService = require('../src/services/taskService');
});

after(async () => {
  await teardown();
});

test('rejects input without the wake word', async () => {
  const from = await senderId('Donald');
  const res = await commandService.handle({
    senderId: from,
    text: 'assign Eric for Cold Calling to pull leads by Monday 4pm',
  });
  assert.equal(res.status, 'error');
  assert.match(res.message, /Hey Jarvis/i);
});

test('happy path: creates a task with correct fields (4pm Monday in NY -> UTC)', async () => {
  const from = await senderId('Donald');
  const res = await commandService.handle({
    senderId: from,
    text:
      'Hey Jarvis, assign Eric for Cold Calling to pull the 400 leads completed by Monday 4pm',
  });
  assert.equal(res.status, 'created', JSON.stringify(res));
  assert.equal(res.task.assigner_name, 'Donald');
  assert.equal(res.task.assignee_name, 'Eric');
  assert.equal(res.task.project_name, 'Cold Calling');
  assert.match(res.task.description, /400 leads/);
  assert.equal(res.task.status, 'open');

  // Deadline must be 16:00 America/New_York on a Monday.
  const dt = DateTime.fromISO(res.task.deadline_utc, { zone: 'utc' }).setZone('America/New_York');
  assert.equal(dt.weekday, 1, 'should be Monday');
  assert.equal(dt.hour, 16);
  assert.equal(dt.minute, 0);
});

test('date present but no time -> defaults to 5 PM ET', async () => {
  const from = await senderId('Donald');
  const res = await commandService.handle({
    senderId: from,
    text: 'Hey Jarvis, assign Vijay for General to write the weekly report by tomorrow',
  });
  assert.equal(res.status, 'created', JSON.stringify(res));
  const dt = DateTime.fromISO(res.task.deadline_utc, { zone: 'utc' }).setZone('America/New_York');
  assert.equal(dt.hour, 17);
  assert.equal(dt.minute, 0);
  assert.match(res.summary, /5 PM ET/);
});

test('missing project -> need_project with the project list, no task created', async () => {
  const from = await senderId('Donald');
  const before = await knex('tasks').count({ c: '*' }).first();
  const res = await commandService.handle({
    senderId: from,
    text: 'Hey Jarvis, assign Eric to follow up with the subcontractor by Friday 2pm',
  });
  assert.equal(res.status, 'need_project');
  assert.ok(Array.isArray(res.projects) && res.projects.length > 0);
  assert.ok(res.draft && res.draft.assigneeId);
  const after = await knex('tasks').count({ c: '*' }).first();
  assert.equal(after.c, before.c, 'no task should be created');
});

test('need_project draft -> createFromDraft completes the task', async () => {
  const from = await senderId('Donald');
  const res = await commandService.handle({
    senderId: from,
    text: 'Hey Jarvis, assign Eric to follow up with the subcontractor by Friday 2pm',
  });
  assert.equal(res.status, 'need_project');
  const proj = res.projects.find((p) => p.name === 'Subcontractors');
  const done = await commandService.createFromDraft({
    senderId: from,
    draft: res.draft,
    projectId: proj.id,
  });
  assert.equal(done.status, 'created');
  assert.equal(done.task.project_name, 'Subcontractors');
  const dt = DateTime.fromISO(done.task.deadline_utc, { zone: 'utc' }).setZone('America/New_York');
  assert.equal(dt.hour, 14);
});

test('missing assignee -> error, no task created', async () => {
  const from = await senderId('Donald');
  const before = await knex('tasks').count({ c: '*' }).first();
  const res = await commandService.handle({
    senderId: from,
    text: 'Hey Jarvis, for Cold Calling to pull 400 leads by Monday 4pm',
  });
  assert.equal(res.status, 'error');
  assert.match(res.message, /assigned to/i);
  const after = await knex('tasks').count({ c: '*' }).first();
  assert.equal(after.c, before.c);
});

test('missing deadline date -> error, no task created', async () => {
  const from = await senderId('Donald');
  const before = await knex('tasks').count({ c: '*' }).first();
  const res = await commandService.handle({
    senderId: from,
    text: 'Hey Jarvis, assign Eric for Cold Calling to pull 400 leads',
  });
  assert.equal(res.status, 'error');
  assert.match(res.message, /deadline date/i);
  const after = await knex('tasks').count({ c: '*' }).first();
  assert.equal(after.c, before.c);
});

test('unknown assignee name -> error listing known people', async () => {
  const from = await senderId('Donald');
  const res = await commandService.handle({
    senderId: from,
    text: 'Hey Jarvis, assign Gandalf for General to do the thing by Monday 4pm',
  });
  assert.equal(res.status, 'error');
  assert.match(res.message, /don't recognise/i);
});

test('simulate different senders (Eric, Jeremy) as assigner', async () => {
  for (const name of ['Eric', 'Jeremy']) {
    const from = await senderId(name);
    const res = await commandService.handle({
      senderId: from,
      text: 'Hey Jarvis, assign Vijay for General to prep the demo by Monday 3pm',
    });
    assert.equal(res.status, 'created');
    assert.equal(res.task.assigner_name, name);
  }
});
