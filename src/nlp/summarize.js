'use strict';

/**
 * Deterministic offline summarizer (mock). Used when NLP_PROVIDER=mock or no key.
 * Produces a compact, readable summary of a notes thread without calling an API.
 */
function mockSummarize(messages) {
  if (!messages || messages.length === 0) return 'No notes yet.';
  const last = messages[messages.length - 1];
  const count = messages.length;
  const lastLine = last.body.length > 140 ? `${last.body.slice(0, 137)}...` : last.body;
  const questions = messages.filter((m) => /\?/.test(m.body)).length;
  const parts = [`${count} message${count === 1 ? '' : 's'} in thread.`];
  if (questions > 0) parts.push(`${questions} open question${questions === 1 ? '' : 's'}.`);
  parts.push(`Latest (${last.authorName}): "${lastLine}"`);
  return parts.join(' ');
}

module.exports = { mockSummarize };
