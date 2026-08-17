/**
 * Recruiter CRM — optional LLM-assisted extraction.
 *
 * Two providers, two jobs:
 *   - Anthropic (claude-opus-5): the one-time 2-year backfill, where accuracy
 *     on old, messy threads matters most. Used only if ANTHROPIC_API_KEY is set.
 *   - Google Gemini (gemini-2.5-flash, free tier): daily runs. Used only if
 *     GEMINI_API_KEY is set.
 *
 * With no key for the current phase, callers get null and the deterministic
 * regex extraction stands on its own.
 */

function nullableString_(description) {
  var s = { anyOf: [{ type: 'string' }, { type: 'null' }] };
  if (description) s.description = description;
  return s;
}

var EXTRACTION_SCHEMA = {
  type: 'object',
  properties: {
    is_recruiting: { type: 'boolean', description: 'True if this thread is about recruiting the mailbox owner for a job (not a newsletter, job-board digest, or unrelated mail).' },
    recruiter_name: nullableString_(),
    recruiter_email: nullableString_(),
    company: nullableString_('The hiring company, not a staffing agency or applicant-tracking system.'),
    job_title: nullableString_(),
    recruiter_title: nullableString_(),
    phone: nullableString_(),
    stage: {
      anyOf: [
        { type: 'string', enum: ['Initial Contact', 'Applied', 'Recruiter Screen', 'Technical Interview', 'Onsite / Final', 'Offer', 'Rejected'] },
        { type: 'null' }
      ]
    }
  },
  required: ['is_recruiting', 'recruiter_name', 'recruiter_email', 'company', 'job_title', 'recruiter_title', 'phone', 'stage'],
  additionalProperties: false
};

var EXTRACTION_PROMPT =
  'Extract recruiting information from this email thread. The mailbox owner is a job candidate; ' +
  'identify the recruiter contacting them, the hiring company, the role, and the current pipeline stage. ' +
  'Use null for anything not present. If the thread is not about recruiting the mailbox owner ' +
  '(newsletters, job-board digests, sales outreach), set is_recruiting to false.\n\nThread:\n';

function getProp_(name) {
  return PropertiesService.getScriptProperties().getProperty(name);
}

/** Which LLM (if any) applies right now. @param {boolean} isBackfill */
function llmAvailable(isBackfill) {
  return isBackfill ? !!getProp_('ANTHROPIC_API_KEY') : !!getProp_('GEMINI_API_KEY');
}

/**
 * @param {string} threadText subject + recent messages
 * @param {boolean} isBackfill
 * @return {Object|null} extraction fields, or null on any failure.
 */
function llmExtract(threadText, isBackfill) {
  var text = threadText.slice(0, CONFIG.LLM.MAX_INPUT_CHARS);
  try {
    return isBackfill ? anthropicExtract_(text) : geminiExtract_(text);
  } catch (e) {
    Logger.log('LLM extraction failed (falling back to regex): ' + e);
    return null;
  }
}

/** Anthropic Messages API with structured outputs — guaranteed-valid JSON. */
function anthropicExtract_(text) {
  var key = getProp_('ANTHROPIC_API_KEY');
  if (!key) return null;

  var payload = {
    model: CONFIG.LLM.BACKFILL_MODEL,
    max_tokens: CONFIG.LLM.MAX_TOKENS,
    output_config: { format: { type: 'json_schema', schema: EXTRACTION_SCHEMA } },
    messages: [{ role: 'user', content: EXTRACTION_PROMPT + text }]
  };

  var body = fetchWithRetry_('https://api.anthropic.com/v1/messages', {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
  if (!body) return null;

  var response = JSON.parse(body);
  if (response.stop_reason === 'refusal') return null;
  for (var i = 0; i < (response.content || []).length; i++) {
    if (response.content[i].type === 'text') {
      return JSON.parse(response.content[i].text);
    }
  }
  return null;
}

/** Google Gemini API (free tier) with a JSON response schema. */
function geminiExtract_(text) {
  var key = getProp_('GEMINI_API_KEY');
  if (!key) return null;

  // Gemini's schema dialect doesn't take type arrays; nullable is a flag.
  var props = {};
  Object.keys(EXTRACTION_SCHEMA.properties).forEach(function (name) {
    props[name] = name === 'is_recruiting'
      ? { type: 'BOOLEAN' }
      : { type: 'STRING', nullable: true };
  });

  var payload = {
    contents: [{ parts: [{ text: EXTRACTION_PROMPT + text }] }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: { type: 'OBJECT', properties: props, required: ['is_recruiting'] },
      maxOutputTokens: CONFIG.LLM.MAX_TOKENS
    }
  };

  var url = 'https://generativelanguage.googleapis.com/v1beta/models/' +
    CONFIG.LLM.DAILY_MODEL + ':generateContent?key=' + encodeURIComponent(key);

  var body = fetchWithRetry_(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
  if (!body) return null;

  var response = JSON.parse(body);
  var candidate = response.candidates && response.candidates[0];
  var part = candidate && candidate.content && candidate.content.parts && candidate.content.parts[0];
  return part && part.text ? JSON.parse(part.text) : null;
}

/** POST with retries on 429/5xx (rate limits, overload). Returns body text or null. */
function fetchWithRetry_(url, options) {
  var delays = [0, 2000, 5000, 12000];
  for (var attempt = 0; attempt < delays.length; attempt++) {
    if (delays[attempt]) Utilities.sleep(delays[attempt]);
    var resp = UrlFetchApp.fetch(url, options);
    var code = resp.getResponseCode();
    if (code >= 200 && code < 300) return resp.getContentText();
    if (code !== 429 && code < 500) { // 4xx other than 429: not retryable
      Logger.log('LLM API error ' + code + ': ' + resp.getContentText().slice(0, 500));
      return null;
    }
  }
  Logger.log('LLM API gave up after retries: ' + url.split('?')[0]);
  return null;
}

/**
 * Merge LLM extraction into a deterministic record. The LLM wins on fields it
 * filled; regex results survive where the LLM returned null.
 * @return {boolean} false if the LLM says this isn't a recruiting thread.
 */
function mergeLlmIntoRecord(record, llm) {
  if (!llm) return true;
  if (llm.is_recruiting === false) return false;

  var map = {
    recruiter_name: 'recruiterName',
    recruiter_email: 'recruiterEmail',
    company: 'company',
    job_title: 'jobTitle',
    recruiter_title: 'recruiterTitle',
    phone: 'phone',
    stage: 'stage'
  };
  Object.keys(map).forEach(function (from) {
    if (llm[from]) record[map[from]] = llm[from];
  });
  return true;
}
