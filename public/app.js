'use strict';

const $ = (sel) => document.querySelector(sel);
const api = async (url, opts = {}) => {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    ...opts,
  });
  return res.json();
};
const esc = (s) => String(s == null ? '' : s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

let me = null;
let currentTab = 'jarvis';
let dashView = 'board';
let lastDraft = null;

// ---------- Auth ----------
async function checkSession() {
  const { user } = await api('/api/auth/me');
  if (user) { me = user; showMain(); } else { showLogin(); }
}
function showLogin() { $('#login').classList.remove('hidden'); $('#main').classList.add('hidden'); }
function showMain() {
  $('#login').classList.add('hidden');
  $('#main').classList.remove('hidden');
  $('#me-name').textContent = me.name;
  switchTab('jarvis');
  initPush();
  handleDeepLink();
}

$('#btn-request').onclick = async () => {
  const phone = $('#phone').value.trim();
  const msg = $('#login-msg');
  msg.className = 'msg'; msg.textContent = 'Sending…';
  const r = await api('/api/auth/request-otp', { method: 'POST', body: JSON.stringify({ phone }) });
  msg.textContent = r.message || '';
  msg.className = 'msg ' + (r.ok ? 'ok' : 'error');
  if (r.ok) { $('#step-phone').classList.add('hidden'); $('#step-code').classList.remove('hidden'); $('#code').focus(); }
};
$('#btn-verify').onclick = async () => {
  const phone = $('#phone').value.trim();
  const code = $('#code').value.trim();
  const r = await api('/api/auth/verify-otp', { method: 'POST', body: JSON.stringify({ phone, code }) });
  if (r.ok) { me = r.user; showMain(); }
  else { $('#login-msg').textContent = r.message; $('#login-msg').className = 'msg error'; }
};
$('#btn-back').onclick = () => {
  $('#step-code').classList.add('hidden'); $('#step-phone').classList.remove('hidden'); $('#login-msg').textContent = '';
};
$('#btn-logout').onclick = async () => { await api('/api/auth/logout', { method: 'POST' }); me = null; location.reload(); };

// ---------- Tabs ----------
const VIEWS = { jarvis: '#chat-view', list: '#list', dashboard: '#dashboard', projects: '#projects-view' };
function hideAllViews() { Object.values(VIEWS).forEach((s) => $(s).classList.add('hidden')); }
function switchTab(tab) {
  currentTab = tab;
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === tab));
  hideAllViews();
  if (tab === 'jarvis') { $('#chat-view').classList.remove('hidden'); loadChat(); }
  else if (tab === 'all') { $('#dashboard').classList.remove('hidden'); loadDashboard(); }
  else if (tab === 'projects') { $('#projects-view').classList.remove('hidden'); loadProjects(); }
  else { $('#list').classList.remove('hidden'); loadList(); }
}
document.querySelectorAll('.tab').forEach((t) => { t.onclick = () => switchTab(t.dataset.tab); });

// ---------- Jarvis chat ----------
async function loadChat() {
  const log = $('#chat-log');
  const history = await api('/api/chat');
  log.innerHTML = history.length
    ? history.map((m) => chatBubbleHtml(m.role, m.text, m.status, m.task_id)).join('')
    : `<div class="chat-empty">👋 Type an instruction like<br><b>"Hey Jarvis, assign Eric for Cold Calling to pull 400 leads by Monday 4pm"</b></div>`;
  log.scrollTop = log.scrollHeight;
}
function chatBubbleHtml(role, text, status, taskId) {
  if (role === 'user') return `<div class="chat-row user"><div class="chat-bubble user">${esc(text)}</div></div>`;
  const icon = status === 'created' ? '✅' : status === 'need_project' ? '❓' : status === 'error' ? '⛔' : '🤖';
  const link = taskId ? ` <a class="chat-tasklink" data-task="${taskId}">open task</a>` : '';
  return `<div class="chat-row jarvis"><div class="chat-bubble jarvis ${status || ''}">${icon} ${esc(text)}${link}</div></div>`;
}
function appendChat(html) { const log = $('#chat-log'); log.insertAdjacentHTML('beforeend', html); log.scrollTop = log.scrollHeight; }

async function submitCommand() {
  const text = $('#cmd').value.trim();
  if (!text) return;
  resumeAudio();
  appendChat(chatBubbleHtml('user', text));
  $('#cmd').value = '';
  appendChat(`<div class="chat-row jarvis" id="thinking"><div class="chat-bubble jarvis">🤖 …</div></div>`);
  const r = await api('/api/command', { method: 'POST', body: JSON.stringify({ text }) });
  const t = document.getElementById('thinking'); if (t) t.remove();
  renderJarvisReply(r);
}
function renderJarvisReply(r) {
  if (r.status === 'need_project') {
    lastDraft = r.draft;
    const chips = r.projects.map((p) => `<span class="chip" data-pid="${p.id}">${esc(p.name)}</span>`).join('');
    appendChat(`<div class="chat-row jarvis"><div class="chat-bubble jarvis need_project">❓ ${esc(r.message)}<div class="chips">${chips}</div></div></div>`);
    document.querySelectorAll('#chat-log .chip').forEach((c) => {
      c.onclick = async () => {
        const pr = await api('/api/command/pick-project', { method: 'POST', body: JSON.stringify({ draft: lastDraft, projectId: Number(c.dataset.pid) }) });
        c.closest('.chips').innerHTML = `picked <b>${esc(c.textContent)}</b>`;
        renderJarvisReply(pr);
      };
    });
  } else {
    appendChat(chatBubbleHtml('jarvis', r.summary || r.message, r.status, r.task ? r.task.id : null));
  }
  bindChatTaskLinks();
}
function bindChatTaskLinks() {
  document.querySelectorAll('#chat-log .chat-tasklink').forEach((a) => { a.onclick = () => openTask(Number(a.dataset.task)); });
}
$('#btn-send').onclick = submitCommand;
$('#cmd').addEventListener('keydown', (e) => { if (e.key === 'Enter') submitCommand(); });

// ---------- Lists (assigned / delegated) ----------
async function loadList() {
  const list = $('#list');
  list.innerHTML = '<div class="empty">Loading…</div>';
  const url = currentTab === 'assigned' ? '/api/tasks/assigned-to-me' : '/api/tasks/delegated';
  const tasks = await api(url);
  if (!tasks.length) { list.innerHTML = '<div class="empty">Nothing here yet.</div>'; return; }
  list.innerHTML = tasks.map((t) => taskCard(t, currentTab === 'assigned' ? `from ${esc(t.assigner_name)}` : `to ${esc(t.assignee_name)}`)).join('');
  list.querySelectorAll('.item').forEach((el) => { el.onclick = () => openTask(Number(el.dataset.id)); });
}
function taskCard(t, who) {
  return `<div class="item" data-id="${t.id}">
    <h3>${t.is_private ? '🔒 ' : ''}${esc(t.description)}</h3>
    <div class="meta">
      <span>${esc(t.project_name)}</span><span>·</span><span>${who}</span><span>·</span>
      <span>due ${esc(fmtDeadline(t.deadline_utc))}</span>
      <span class="badge ${t.status}">${statusLabel(t.status)}</span>
    </div>
  </div>`;
}

// ---------- All Tasks dashboard ----------
document.querySelectorAll('.vbtn').forEach((b) => {
  b.onclick = () => {
    dashView = b.dataset.view;
    document.querySelectorAll('.vbtn').forEach((x) => x.classList.toggle('active', x === b));
    loadDashboard();
  };
});
const STATUS_COLS = [
  { key: 'open', label: 'Not started' },
  { key: 'in_progress', label: 'In progress' },
  { key: 'done', label: 'Completed' },
];
function statusLabel(s) { return (STATUS_COLS.find((c) => c.key === s) || {}).label || s; }

async function loadDashboard() {
  const body = $('#dash-body');
  body.innerHTML = '<div class="empty">Loading…</div>';
  const tasks = await api('/api/tasks/all');
  if (!tasks.length) { body.innerHTML = '<div class="empty">No tasks yet.</div>'; return; }
  // group by project
  const byProject = {};
  tasks.forEach((t) => { (byProject[t.project_name] = byProject[t.project_name] || []).push(t); });
  const projects = Object.keys(byProject).sort();

  if (dashView === 'board') body.innerHTML = projects.map((p) => boardSection(p, byProject[p])).join('');
  else if (dashView === 'grid') body.innerHTML = projects.map((p) => gridSection(p, byProject[p])).join('');
  else body.innerHTML = projects.map((p) => listSection(p, byProject[p])).join('');

  body.querySelectorAll('[data-id]').forEach((el) => { el.onclick = () => openTask(Number(el.dataset.id)); });
}
function avatar(name) {
  const initials = name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  const colors = ['#5b9dff', '#16a34a', '#f59e0b', '#ef4444', '#a855f7', '#06b6d4'];
  let h = 0; for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % colors.length;
  return `<span class="avatar" style="background:${colors[h]}" title="${esc(name)}">${esc(initials)}</span>`;
}
function dashCard(t) {
  return `<div class="dash-card" data-id="${t.id}">
    <div class="dash-proj">${esc(t.project_name)}</div>
    <div class="dash-title">${t.is_private ? '🔒 ' : ''}${esc(t.description)}</div>
    <div class="dash-foot">
      <span class="who-chip">${avatar(t.assignee_name)} ${esc(t.assignee_name)}</span>
      <span class="due">${esc(fmtDeadline(t.deadline_utc))}</span>
    </div>
  </div>`;
}
function boardSection(project, tasks) {
  const cols = STATUS_COLS.map((c) => {
    const items = tasks.filter((t) => t.status === c.key);
    return `<div class="board-col">
      <div class="board-col-head">${c.label} <span class="cnt">${items.length}</span></div>
      ${items.map(dashCard).join('') || '<div class="board-empty">—</div>'}
    </div>`;
  }).join('');
  return `<div class="proj-block"><h3 class="proj-h">${esc(project)} <span class="cnt">${tasks.length}</span></h3><div class="board">${cols}</div></div>`;
}
function gridSection(project, tasks) {
  const rows = tasks.map((t) => `<tr data-id="${t.id}">
    <td>${t.is_private ? '🔒 ' : ''}${esc(t.description)}</td>
    <td>${avatar(t.assignee_name)} ${esc(t.assignee_name)}</td>
    <td>${esc(t.assigner_name)}</td>
    <td>${esc(fmtDeadline(t.deadline_utc))}</td>
    <td><span class="badge ${t.status}">${statusLabel(t.status)}</span></td>
  </tr>`).join('');
  return `<div class="proj-block"><h3 class="proj-h">${esc(project)} <span class="cnt">${tasks.length}</span></h3>
    <table class="grid-table"><thead><tr><th>Task</th><th>Assignee</th><th>By</th><th>Due</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}
function listSection(project, tasks) {
  const rows = tasks.map((t) => `<div class="list-row" data-id="${t.id}">
    <span class="badge ${t.status}">${statusLabel(t.status)}</span>
    <span class="lr-title">${t.is_private ? '🔒 ' : ''}${esc(t.description)}</span>
    <span class="who-chip">${avatar(t.assignee_name)} ${esc(t.assignee_name)}</span>
    <span class="due">${esc(fmtDeadline(t.deadline_utc))}</span>
  </div>`).join('');
  return `<div class="proj-block"><h3 class="proj-h">${esc(project)} <span class="cnt">${tasks.length}</span></h3>${rows}</div>`;
}

// ---------- Projects ----------
async function loadProjects() {
  const view = $('#projects-view');
  const projects = await api('/api/projects');
  view.innerHTML = `
    <div class="proj-create card">
      <h3>New project</h3>
      <input id="np-name" placeholder="Project name" />
      <textarea id="np-desc" placeholder="Description (optional)"></textarea>
      <button id="np-add">Create project</button>
      <div id="np-msg" class="msg"></div>
    </div>
    <div class="proj-list">
      ${projects.map((p) => `<div class="proj-item"><h4>${esc(p.name)}</h4><div class="muted">${esc(p.description || 'No description')}</div></div>`).join('')}
    </div>`;
  $('#np-add').onclick = async () => {
    const name = $('#np-name').value.trim();
    if (!name) { $('#np-msg').textContent = 'Name is required.'; $('#np-msg').className = 'msg error'; return; }
    const r = await api('/api/projects', { method: 'POST', body: JSON.stringify({ name, description: $('#np-desc').value.trim() }) });
    if (r && r.id) loadProjects(); else { $('#np-msg').textContent = (r && r.error) || 'Failed.'; $('#np-msg').className = 'msg error'; }
  };
}

function fmtDeadline(utc) {
  try {
    return new Date(utc).toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) + ' ET';
  } catch { return utc; }
}

// ---------- Task detail / thread / attachments / privacy ----------
async function openTask(id) {
  const { task, messages, attachments } = await api('/api/tasks/' + id);
  if (!task) return;
  const body = $('#modal-body');
  const isMember = [task.assignee_id, task.assigner_id].includes(me.id);
  body.innerHTML = `
    <h2>${task.is_private ? '🔒 ' : ''}${esc(task.description)}</h2>
    <div class="meta muted">${esc(task.project_name)} · from ${esc(task.assigner_name)} → ${esc(task.assignee_name)} · due ${esc(fmtDeadline(task.deadline_utc))}</div>
    ${isMember ? `<div class="status-row" id="status-row">
      ${STATUS_COLS.map((c) => `<button data-s="${c.key}" class="${c.key === task.status ? 'sel' : ''}">${c.label}</button>`).join('')}
    </div>
    <label class="priv-toggle"><input type="checkbox" id="priv-check" ${task.is_private ? 'checked' : ''}/> 🔒 Private (only assigner & assignee can see)</label>` : ''}

    <h4>Reference docs</h4>
    <div class="attachments" id="attachments">${renderAttachments(id, attachments)}</div>
    <div class="attach-controls">
      <label class="attach-btn">📎 Attach file / photo
        <input id="file-input" type="file" accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.txt,.csv" hidden />
      </label>
      <div class="attach-link">
        <input id="link-input" placeholder="Paste a link (Drive, Procore, URL…)" />
        <button id="link-add">Add link</button>
      </div>
    </div>

    <h4>Discussion</h4>
    <div class="thread" id="thread">${messages.map(msgBubble).join('') || '<div class="muted">No messages yet.</div>'}</div>
    <input id="msg-input" placeholder="Ask a question or add a note…" />
    <button id="msg-send" style="width:100%">Post message</button>
  `;
  $('#modal').classList.remove('hidden');

  $('#file-input').onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    const fd = new FormData(); fd.append('file', f);
    $('#attachments').innerHTML = '<div class="muted">Uploading…</div>';
    const res = await fetch(`/api/tasks/${id}/attachments/file`, { method: 'POST', credentials: 'same-origin', body: fd });
    const json = await res.json();
    $('#attachments').innerHTML = renderAttachments(id, json.attachments || []);
    bindAttachmentDeletes(id);
  };
  $('#link-add').onclick = async () => {
    const url = $('#link-input').value.trim(); if (!url) return;
    const { attachments: updated } = await api(`/api/tasks/${id}/attachments/link`, { method: 'POST', body: JSON.stringify({ url }) });
    $('#attachments').innerHTML = renderAttachments(id, updated || []); $('#link-input').value = ''; bindAttachmentDeletes(id);
  };
  bindAttachmentDeletes(id);

  if (isMember) {
    body.querySelectorAll('#status-row button').forEach((b) => {
      b.onclick = async () => { await api('/api/tasks/' + id, { method: 'PATCH', body: JSON.stringify({ status: b.dataset.s }) }); openTask(id); refreshActive(); };
    });
    $('#priv-check').onchange = async (e) => {
      await api('/api/tasks/' + id, { method: 'PATCH', body: JSON.stringify({ is_private: e.target.checked }) });
      refreshActive();
    };
  }
  $('#msg-send').onclick = async () => {
    const val = $('#msg-input').value.trim(); if (!val) return;
    const { messages: updated } = await api('/api/tasks/' + id + '/messages', { method: 'POST', body: JSON.stringify({ body: val }) });
    $('#thread').innerHTML = updated.map(msgBubble).join(''); $('#msg-input').value = '';
  };
}
function msgBubble(m) { return `<div class="bubble"><div class="who">${esc(m.author_name)}</div>${esc(m.body)}</div>`; }

function renderAttachments(taskId, list) {
  if (!list || !list.length) return '<div class="muted">No reference docs yet.</div>';
  return list.map((a) => {
    const dl = `/api/tasks/${taskId}/attachments/${a.id}/download`;
    let inner;
    if (a.kind === 'image') inner = `<a href="${dl}" target="_blank"><img class="att-thumb" src="${dl}" alt="${esc(a.label)}"></a><span class="att-label">${esc(a.label)}</span>`;
    else if (a.kind === 'link') inner = `🔗 <a href="${esc(a.url)}" target="_blank" rel="noopener">${esc(a.label)}</a>`;
    else inner = `📄 <a href="${dl}" target="_blank">${esc(a.label)}</a>`;
    return `<div class="att-item">${inner}<button class="att-del" data-aid="${a.id}" title="Remove">×</button></div>`;
  }).join('');
}
function bindAttachmentDeletes(taskId) {
  document.querySelectorAll('#attachments .att-del').forEach((b) => {
    b.onclick = async () => {
      const { attachments } = await api(`/api/tasks/${taskId}/attachments/${b.dataset.aid}`, { method: 'DELETE' });
      $('#attachments').innerHTML = renderAttachments(taskId, attachments || []); bindAttachmentDeletes(taskId);
    };
  });
}
$('#modal-close').onclick = () => $('#modal').classList.add('hidden');
$('#modal').onclick = (e) => { if (e.target.id === 'modal') $('#modal').classList.add('hidden'); };

function refreshActive() {
  if (currentTab === 'all') loadDashboard();
  else if (currentTab === 'assigned' || currentTab === 'delegated') loadList();
}

// ---------- Push notifications + sound ----------
let audioCtx;
function resumeAudio() { try { audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)(); if (audioCtx.state === 'suspended') audioCtx.resume(); } catch (_) {} }
function playSound() {
  try {
    resumeAudio(); const now = audioCtx.currentTime;
    [880, 1175].forEach((f, i) => {
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.type = 'sine'; o.frequency.value = f; o.connect(g); g.connect(audioCtx.destination);
      const t = now + i * 0.18;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.3, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
      o.start(t); o.stop(t + 0.18);
    });
  } catch (_) {}
}
function urlBase64ToUint8Array(base64) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64); const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}
async function initPush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    const { publicKey } = await api('/api/push/public-key');
    if (!publicKey) return; // push not configured on the server
    if (Notification.permission === 'denied') return;
    const perm = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
    if (perm !== 'granted') return;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) });
    await api('/api/push/subscribe', { method: 'POST', body: JSON.stringify({ subscription: sub }) });
  } catch (e) { console.warn('push init failed', e); }
}
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', (e) => {
    if (e.data && e.data.type === 'play-sound') { playSound(); refreshActive(); }
  });
}

// Deep link from a notification: /?task=123
function handleDeepLink() {
  const id = new URLSearchParams(location.search).get('task');
  if (id) { openTask(Number(id)); history.replaceState({}, '', '/'); }
}

// ---------- Boot ----------
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
checkSession();
