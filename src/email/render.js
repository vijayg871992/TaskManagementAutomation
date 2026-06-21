'use strict';

const { formatDeadline } = require('../util/time');

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function statusBadge(status) {
  const map = { open: '#6b7280', in_progress: '#2563eb', done: '#16a34a' };
  const color = map[status] || '#6b7280';
  return `<span style="background:${color};color:#fff;border-radius:10px;padding:1px 8px;font-size:12px;">${esc(
    status
  )}</span>`;
}

function taskRow(t) {
  return `
    <tr>
      <td style="padding:8px 10px;border-bottom:1px solid #eee;">
        <div style="font-weight:600;">${esc(t.description)}</div>
        <div style="color:#555;font-size:13px;">
          ${esc(t.project_name)} · due ${esc(formatDeadline(t.deadline_utc))} · ${statusBadge(t.status)}
        </div>
        <div style="color:#374151;font-size:13px;margin-top:4px;">📝 ${esc(t.notesSummary)}</div>
        ${t.attachmentCount ? `<div style="color:#374151;font-size:13px;">📎 ${t.attachmentCount} reference doc(s)</div>` : ''}
      </td>
    </tr>`;
}

function section(title, who, tasks) {
  if (!tasks.length) {
    return `<h3 style="margin:16px 0 6px;">${esc(title)}</h3>
      <div style="color:#888;font-size:14px;">Nothing here today.</div>`;
  }
  return `<h3 style="margin:16px 0 6px;">${esc(title)} <span style="color:#888;font-weight:400;">(${tasks.length})</span></h3>
    <table style="width:100%;border-collapse:collapse;">${tasks.map(taskRow).join('')}</table>`;
}

/**
 * @param {object} d  - { user, delegated:[], assigned:[] } (tasks carry .notesSummary)
 */
function renderDigest(d) {
  const subject = `Your JAB Jarvis digest — ${d.delegated.length + d.assigned.length} task(s)`;
  const html = `<div style="font-family:Segoe UI,Arial,sans-serif;max-width:640px;margin:auto;color:#111;">
    <h2 style="margin:0 0 4px;">Good morning, ${esc(d.user.name)} 👋</h2>
    <div style="color:#888;font-size:13px;">Daily task digest · ${new Date().toDateString()}</div>
    ${section('Tasks you delegated', d.user.name, d.delegated)}
    ${section('Tasks assigned to you', d.user.name, d.assigned)}
    <div style="color:#aaa;font-size:12px;margin-top:20px;">JAB Jarvis · reply in the app to discuss any task.</div>
  </div>`;

  const text =
    `Good morning, ${d.user.name}\n\n` +
    `TASKS YOU DELEGATED (${d.delegated.length}):\n` +
    d.delegated.map((t) => ` - ${t.description} [${t.project_name}] due ${formatDeadline(t.deadline_utc)} (${t.status}) — ${t.notesSummary}`).join('\n') +
    `\n\nTASKS ASSIGNED TO YOU (${d.assigned.length}):\n` +
    d.assigned.map((t) => ` - ${t.description} [${t.project_name}] due ${formatDeadline(t.deadline_utc)} (${t.status}) — ${t.notesSummary}`).join('\n') +
    `\n`;

  return { subject, html, text };
}

module.exports = { renderDigest };
