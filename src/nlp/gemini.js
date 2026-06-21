'use strict';

/**
 * Gemini provider — Google AI Studio FREE TIER ONLY.
 * Uses an API key (no service account, no Vertex AI, no billing).
 */

const { GoogleGenerativeAI } = require('@google/generative-ai');
const config = require('../config');
const { buildExtractionPrompt } = require('./prompt');

let client = null;

function getModel() {
  if (!config.nlp.geminiApiKey) {
    throw new Error('GEMINI_API_KEY is not set (required when NLP_PROVIDER=gemini).');
  }
  if (!client) client = new GoogleGenerativeAI(config.nlp.geminiApiKey);
  return client.getGenerativeModel({
    model: config.nlp.geminiModel,
    generationConfig: { responseMimeType: 'application/json', temperature: 0 },
  });
}

function safeParse(raw) {
  // Strip accidental code fences, then JSON.parse.
  const cleaned = String(raw).replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  return JSON.parse(cleaned);
}

async function extract(text, ctx) {
  const model = getModel();
  const prompt = buildExtractionPrompt(text, ctx);
  const res = await model.generateContent(prompt);
  const out = safeParse(res.response.text());
  return {
    assignee: out.assignee ?? null,
    project: out.project ?? null,
    description: out.description ?? null,
    date: out.date ?? null,
    time: out.time ?? null,
  };
}

/** Summarize a notes thread for the digest. Returns plain text. */
async function summarize(threadText) {
  const model = (() => {
    if (!client) client = new GoogleGenerativeAI(config.nlp.geminiApiKey);
    return client.getGenerativeModel({
      model: config.nlp.geminiModel,
      generationConfig: { temperature: 0.2 },
    });
  })();
  const prompt = `Summarize the following task discussion in 1-2 short sentences for a manager's daily digest. Focus on status, blockers, and any question raised. If empty, say "No notes yet."\n\n${threadText}`;
  const res = await model.generateContent(prompt);
  return res.response.text().trim();
}

module.exports = { extract, summarize };
