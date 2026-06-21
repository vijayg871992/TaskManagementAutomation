'use strict';

const config = require('../config');
const mock = require('./mock');
const { mockSummarize } = require('./summarize');

let geminiMod = null;
function gemini() {
  if (!geminiMod) geminiMod = require('./gemini');
  return geminiMod;
}

function useGemini() {
  return config.nlp.provider === 'gemini' && config.nlp.geminiApiKey;
}

/** Extract structured fields from an instruction. */
async function extract(text, ctx) {
  if (useGemini()) return gemini().extract(text, ctx);
  return mock.extract(text, ctx);
}

/**
 * Summarize a notes thread.
 * @param {Array<{authorName:string, body:string}>} messages
 */
async function summarizeThread(messages) {
  if (useGemini()) {
    const text = (messages || [])
      .map((m) => `${m.authorName}: ${m.body}`)
      .join('\n');
    try {
      return await gemini().summarize(text || '');
    } catch (e) {
      // Never let a digest fail on a summarizer hiccup — fall back to mock.
      return mockSummarize(messages);
    }
  }
  return mockSummarize(messages);
}

module.exports = { extract, summarizeThread };
