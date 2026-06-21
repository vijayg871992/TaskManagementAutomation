'use strict';

/**
 * Builds the extraction prompt for Gemini. We pass the current NY datetime and
 * the known roster/projects so the model resolves relative dates and matches
 * names/projects to the real options. It must return STRICT JSON.
 */
function buildExtractionPrompt(text, ctx) {
  const nowISO = ctx.now.toISO();
  const userNames = (ctx.users || []).map((u) => u.name).join(', ');
  const projectNames = (ctx.projects || []).map((p) => p.name).join(', ');

  return `You extract structured task data from a natural-language instruction.

Current date and time (America/New_York): ${nowISO}
Known people: ${userNames}
Known projects: ${projectNames}

Instruction: """${text}"""

Return ONLY a JSON object (no markdown, no prose) with exactly these keys:
{
  "assignee": string|null,     // the person the task is assigned TO, matched to a known person if possible
  "project":  string|null,     // matched to a known project if possible, else the named project, else null
  "description": string|null,  // the task to be done, concise, no deadline text
  "date": string|null,         // deadline date as "YYYY-MM-DD", resolving relative words (Monday, tomorrow) against the current NY date; null if no date given
  "time": string|null          // deadline time as 24h "HH:mm"; null if no time given
}

Rules:
- Interpret all dates/times in America/New_York.
- Resolve weekday names to the NEXT future occurrence.
- Do NOT invent a date or time that was not stated. Use null when absent.
- Ignore the wake word ("Hey Jarvis" / "Jarvis").`;
}

module.exports = { buildExtractionPrompt };
