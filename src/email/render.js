'use strict';

const { formatDeadline } = require('../util/time');

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

const STATUS_LABELS = { open: 'Not started', in_progress: 'In progress', done: 'Completed' };
const STATUS_COLORS = { open: '#6b7280', in_progress: '#2563eb', done: '#16a34a' };

function statusBadge(status) {
  const color = STATUS_COLORS[status] || '#6b7280';
  const label = STATUS_LABELS[status] || status;
  return `<span style="background:${color};color:#fff;border-radius:10px;padding:2px 10px;font-size:12px;white-space:nowrap;">${esc(label)}</span>`;
}

const TD = 'style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;vertical-align:top;"';
const TH = 'style="padding:8px 12px;background:#f3f4f6;font-size:12px;font-weight:600;color:#374151;text-align:left;border-bottom:2px solid #d1d5db;"';

function delegatedRow(t) {
  return `<tr>
    <td ${TD}>${esc(t.project_name)}</td>
    <td ${TD}>${esc(t.assignee_name)}</td>
    <td ${TD} style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;vertical-align:top;font-weight:600;">${esc(t.description)}</td>
    <td ${TD}>${statusBadge(t.status)}</td>
    <td ${TD} style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;vertical-align:top;white-space:nowrap;">${esc(formatDeadline(t.deadline_utc))}</td>
    <td ${TD} style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;vertical-align:top;color:#555;">${esc(t.notesSummary || '—')}${t.attachmentCount ? ` <span style="color:#6b7280;">(${t.attachmentCount} doc${t.attachmentCount > 1 ? 's' : ''})</span>` : ''}</td>
  </tr>`;
}

function assignedRow(t) {
  return `<tr>
    <td ${TD}>${esc(t.project_name)}</td>
    <td ${TD}>${esc(t.assigner_name)}</td>
    <td ${TD} style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;vertical-align:top;font-weight:600;">${esc(t.description)}</td>
    <td ${TD}>${statusBadge(t.status)}</td>
    <td ${TD} style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;vertical-align:top;white-space:nowrap;">${esc(formatDeadline(t.deadline_utc))}</td>
    <td ${TD} style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;vertical-align:top;color:#555;">${esc(t.notesSummary || '—')}${t.attachmentCount ? ` <span style="color:#6b7280;">(${t.attachmentCount} doc${t.attachmentCount > 1 ? 's' : ''})</span>` : ''}</td>
  </tr>`;
}

function tableWrap(headers, rows, emptyMsg) {
  if (!rows.length) {
    return `<p style="color:#888;font-size:14px;margin:8px 0 16px;">${emptyMsg}</p>`;
  }
  const ths = headers.map((h) => `<th ${TH}>${h}</th>`).join('');
  return `<table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
    <thead><tr>${ths}</tr></thead>
    <tbody>${rows.join('')}</tbody>
  </table>`;
}

/**
 * @param {object} d  - { user, delegated:[], assigned:[] } (tasks carry .notesSummary)
 */
function renderDigest(d) {
  const total = d.delegated.length + d.assigned.length;
  const subject = `Your JAB Jarvis digest — ${total} task(s) · ${new Date().toDateString()}`;

  const delegatedTable = tableWrap(
    ['Project Name', 'Assigned To', 'Task Name', 'Status', 'Due Date', 'Notes'],
    d.delegated.map(delegatedRow),
    'No open delegated tasks today.'
  );

  const assignedTable = tableWrap(
    ['Project Name', 'Assigned By', 'Task Name', 'Status', 'Due Date', 'Notes'],
    d.assigned.map(assignedRow),
    'No open tasks assigned to you today.'
  );

  const html = `<div style="font-family:Segoe UI,Arial,sans-serif;max-width:800px;margin:auto;color:#111;padding:20px;">
    <h2 style="margin:0 0 4px;color:#1e3a5f;">Good morning, ${esc(d.user.name)} 👋</h2>
    <p style="color:#888;font-size:13px;margin:0 0 24px;">Daily task digest &mdash; ${new Date().toDateString()}</p>

    <h3 style="margin:0 0 10px;color:#1e3a5f;border-bottom:2px solid #e5e7eb;padding-bottom:6px;">
      Tasks You Delegated <span style="color:#888;font-weight:400;">(${d.delegated.length})</span>
    </h3>
    ${delegatedTable}

    <h3 style="margin:0 0 10px;color:#1e3a5f;border-bottom:2px solid #e5e7eb;padding-bottom:6px;">
      Tasks Assigned to You <span style="color:#888;font-weight:400;">(${d.assigned.length})</span>
    </h3>
    ${assignedTable}

    <p style="color:#aaa;font-size:12px;margin-top:24px;border-top:1px solid #e5e7eb;padding-top:12px;">
      JAB Jarvis &mdash; reply in the app to discuss any task.
    </p>
  </div>`;

  const text =
    `Good morning, ${d.user.name}\n\n` +
    `TASKS YOU DELEGATED (${d.delegated.length}):\n` +
    (d.delegated.length
      ? d.delegated.map((t) => ` - [${t.project_name}] ${t.description} → ${t.assignee_name} | ${t.status} | due ${formatDeadline(t.deadline_utc)} | ${t.notesSummary || 'no notes'}`).join('\n')
      : '  Nothing here today.') +
    `\n\nTASKS ASSIGNED TO YOU (${d.assigned.length}):\n` +
    (d.assigned.length
      ? d.assigned.map((t) => ` - [${t.project_name}] ${t.description} from ${t.assigner_name} | ${t.status} | due ${formatDeadline(t.deadline_utc)} | ${t.notesSummary || 'no notes'}`).join('\n')
      : '  Nothing here today.') +
    `\n`;

  return { subject, html, text };
}

module.exports = { renderDigest };
