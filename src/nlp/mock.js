'use strict';

/**
 * Deterministic, offline NL parser. No network, no API key — used by the test
 * harness and as the default provider for local demos. It anchors extraction on
 * the known roster + project list (passed in ctx) so it is reliable for the kinds
 * of sentences the team will type.
 *
 * Contract (shared with the Gemini provider):
 *   extract(text, ctx) -> { assignee, project, description, date, time }
 *   ctx = { now: luxon DateTime (NY), users: [{name}], projects: [{name}] }
 */

const { DateTime } = require('luxon');

const WEEKDAYS = {
  monday: 1, tuesday: 2, wednesday: 3, thursday: 4,
  friday: 5, saturday: 6, sunday: 7,
};
const MONTHS = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
  jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9,
  oct: 10, nov: 11, dec: 12,
};

function resolveTime(text) {
  // 4pm, 4 pm, 4:30pm, 16:00, 9am
  let m = text.match(/\b(\d{1,2}):(\d{2})\s*(am|pm)?\b/i);
  if (m) {
    let h = parseInt(m[1], 10);
    const min = parseInt(m[2], 10);
    const ap = m[3] ? m[3].toLowerCase() : null;
    if (ap === 'pm' && h < 12) h += 12;
    if (ap === 'am' && h === 12) h = 0;
    return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
  }
  m = text.match(/\b(\d{1,2})\s*(am|pm)\b/i);
  if (m) {
    let h = parseInt(m[1], 10);
    const ap = m[2].toLowerCase();
    if (ap === 'pm' && h < 12) h += 12;
    if (ap === 'am' && h === 12) h = 0;
    return `${String(h).padStart(2, '0')}:00`;
  }
  if (/\bnoon\b/i.test(text)) return '12:00';
  if (/\bmidnight\b/i.test(text)) return '00:00';
  return null;
}

function resolveDate(text, now) {
  const lower = text.toLowerCase();

  if (/\btoday\b/.test(lower)) return now.toFormat('yyyy-LL-dd');
  if (/\btomorrow\b/.test(lower)) return now.plus({ days: 1 }).toFormat('yyyy-LL-dd');

  // "next <weekday>" or "<weekday>" -> next occurrence (today excluded)
  const wd = lower.match(/\b(next\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/);
  if (wd) {
    const target = WEEKDAYS[wd[2]];
    let d = now;
    // advance to the next day that matches; always strictly in the future
    do {
      d = d.plus({ days: 1 });
    } while (d.weekday !== target);
    if (wd[1]) {
      // "next" — if the nearest hit is within this week, push another week
      // (kept simple: nearest future occurrence is fine for the demo)
    }
    return d.toFormat('yyyy-LL-dd');
  }

  // "June 25", "Jun 25", "25 June", "6/25", "2026-06-25"
  let m = lower.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;

  m = lower.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec|january|february|march|april|june|july|august|september|october|november|december)\.?\s+(\d{1,2})\b/);
  if (m) {
    const mo = MONTHS[m[1]];
    const day = parseInt(m[2], 10);
    let year = now.year;
    let dt = DateTime.fromObject({ year, month: mo, day }, { zone: now.zoneName });
    if (dt < now.startOf('day')) dt = dt.plus({ years: 1 });
    return dt.toFormat('yyyy-LL-dd');
  }

  m = lower.match(/\b(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec|january|february|march|april|june|july|august|september|october|november|december)\b/);
  if (m) {
    const mo = MONTHS[m[2]];
    const day = parseInt(m[1], 10);
    let dt = DateTime.fromObject({ year: now.year, month: mo, day }, { zone: now.zoneName });
    if (dt < now.startOf('day')) dt = dt.plus({ years: 1 });
    return dt.toFormat('yyyy-LL-dd');
  }

  m = lower.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
  if (m) {
    const mo = parseInt(m[1], 10);
    const day = parseInt(m[2], 10);
    let year = m[3] ? parseInt(m[3], 10) : now.year;
    if (year < 100) year += 2000;
    let dt = DateTime.fromObject({ year, month: mo, day }, { zone: now.zoneName });
    if (!m[3] && dt < now.startOf('day')) dt = dt.plus({ years: 1 });
    return dt.toFormat('yyyy-LL-dd');
  }

  return null;
}

function findName(text, names) {
  // longest match first so "Mary Jane" wins over "Mary"
  const sorted = [...names].sort((a, b) => b.length - a.length);
  for (const n of sorted) {
    const re = new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (re.test(text)) return n;
  }
  return null;
}

function extractAssignee(text, users) {
  // Prefer the name right after "assign" — return it even if it's not a known
  // user, so the service layer can produce a clear "don't recognise" message.
  const m = text.match(/\bassign(?:ed)?\s+(?:to\s+)?([A-Z][a-zA-Z]+)/);
  if (m) {
    const known = findName(m[1], users.map((u) => u.name));
    return known || m[1];
  }
  return findName(text, users.map((u) => u.name));
}

function extractProject(text, projects) {
  // "for Project General" / "for project Cold Calling" / "on <Project>"
  const m = text.match(/\b(?:for|on|under)\s+project\s+([A-Za-z][\w ]*?)(?:\s+to\b|\s+to\s|,|\.|\bby\b|\bdue\b|\bbefore\b|$)/i);
  if (m) {
    const cand = findName(m[1], projects.map((p) => p.name));
    if (cand) return cand;
  }
  // bare project name anywhere
  return findName(text, projects.map((p) => p.name));
}

function extractDescription(text, deadlinePhraseIdx) {
  // Take the segment after "to <verb...>" up to the deadline marker.
  let work = text;
  if (deadlinePhraseIdx > -1) work = text.slice(0, deadlinePhraseIdx);
  const m = work.match(/\bto\s+(.+)$/i);
  let desc = m ? m[1] : null;
  if (!desc) return null;
  desc = desc.replace(/\s+(by|before|due|completed by|complete by)\b.*$/i, '').trim();
  desc = desc.replace(/[\s,.;:]+$/, '').trim();
  return desc || null;
}

async function extract(text, ctx) {
  const users = ctx.users || [];
  const projects = ctx.projects || [];
  const now = ctx.now || DateTime.now();

  // Locate the deadline phrase ("by ...", "before ...", "due ...")
  const dlMatch = text.match(/\b(by|before|due(?:\s+on)?|completed\s+by|complete\s+by)\b/i);
  const dlIdx = dlMatch ? dlMatch.index : -1;
  const deadlineText = dlIdx > -1 ? text.slice(dlIdx) : text;

  const assignee = extractAssignee(text, users);
  const project = extractProject(text, projects);
  const description = extractDescription(text, dlIdx);
  const date = resolveDate(dlIdx > -1 ? deadlineText : text, now);
  const time = resolveTime(dlIdx > -1 ? deadlineText : text);

  return { assignee, project, description, date, time };
}

module.exports = { extract };
