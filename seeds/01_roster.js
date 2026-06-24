'use strict';

/**
 * Seed roster + projects. Phone numbers are placeholders for the demo — the
 * console SMS provider prints the OTP, so any value works until Aloware is wired.
 */

const USERS = [
  { name: 'Vijay', phone: '+16467871339', email: 'vijay@example.com', role: 'builder' },
  { name: 'Donald', phone: '+15185734396', email: 'donald@example.com', role: 'owner' },
  { name: 'Eric', phone: '+15550000003', email: 'eric@example.com', role: 'manager' },
  { name: 'Jeremy', phone: '+15550000004', email: 'jeremy@example.com', role: 'manager' },
  { name: 'Omar', phone: '+15550000005', email: 'omar@example.com', role: 'sales' },
  { name: 'Edwin', phone: '+15550000006', email: 'edwin@example.com', role: 'estimator' },
  // Test account: fixed OTP 123456, no real SMS — for safe testing without disturbing others.
  { name: 'Tony', phone: '+12125550123', email: 'tony@example.com', role: 'tester', test_code: '123456' },
];

const PROJECTS = [
  { name: 'General', description: 'Catch-all for tasks without a dedicated project.' },
  { name: 'Cold Calling', description: 'Outbound lead generation and dialing.' },
  { name: 'Estimating', description: 'Takeoffs, pricing, and estimate preparation.' },
  { name: 'Subcontractors', description: 'Sub coordination, COIs, and scheduling.' },
];

exports.seed = async function seed(knex) {
  // Idempotent insert: only add rows that aren't present yet (don't wipe live data).
  for (const u of USERS) {
    const exists = await knex('users').where({ phone: u.phone }).first();
    if (!exists) await knex('users').insert({ ...u, active: true });
  }
  for (const p of PROJECTS) {
    const exists = await knex('projects').where({ name: p.name }).first();
    if (!exists) await knex('projects').insert({ ...p, active: true });
  }
};

exports.USERS = USERS;
exports.PROJECTS = PROJECTS;
