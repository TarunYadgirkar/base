/**
 * Recruiter CRM — API key diagnostics.
 *
 * Run testApiKeys() by hand from the editor. It checks each key's presence and
 * shape, makes one tiny live call per provider, and prints the provider's own
 * error text so you can see exactly what's wrong instead of a generic
 * "invalid API key".
 *
 * Costs a fraction of a cent (a handful of tokens per provider).
 */
function testApiKeys() {
  Logger.log('=== Recruiter CRM API key check ===');
  var all = PropertiesService.getScriptProperties().getProperties();
  Logger.log('Script Properties defined: ' + (Object.keys(all).join(', ') || '(none)'));
  Logger.log('');

  checkKeyShape_('ANTHROPIC_API_KEY', 'sk-ant-');
  testAnthropic_();
  Logger.log('');
  checkKeyShape_('GEMINI_API_KEY', 'AIza');
  testGemini_();
}

/** Presence, length, prefix, and stray-whitespace report — never logs the key. */
function checkKeyShape_(name, expectedPrefix) {
  var raw = PropertiesService.getScriptProperties().getProperty(name);
  if (!raw) {
    Logger.log('[' + name + '] MISSING. Add it under Project Settings -> ' +
      'Script Properties. The name must match exactly (case-sensitive).');
    return;
  }
  var clean = getProp_(name);
  Logger.log('[' + name + '] present, length ' + clean.length +
    ', starts with "' + clean.slice(0, expectedPrefix.length) + '"' +
    (clean.slice(0, expectedPrefix.length) === expectedPrefix
      ? ' (expected prefix OK)'
      : ' (WARNING: expected it to start with "' + expectedPrefix + '")'));
  if (raw.length !== clean.length) {
    Logger.log('  Note: stripped ' + (raw.length - clean.length) +
      ' whitespace/invisible character(s) from the pasted value.');
  }
}

function testAnthropic_() {
  var key = getProp_('ANTHROPIC_API_KEY');
  if (!key) return;
  var resp = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    payload: JSON.stringify({
      model: CONFIG.LLM.BACKFILL_MODEL,
      max_tokens: 16,
      messages: [{ role: 'user', content: 'Reply with the single word: OK' }]
    }),
    muteHttpExceptions: true
  });
  reportResult_('Anthropic (' + CONFIG.LLM.BACKFILL_MODEL + ')', resp);
}

function testGemini_() {
  var key = getProp_('GEMINI_API_KEY');
  if (!key) return;
  var url = 'https://generativelanguage.googleapis.com/v1beta/models/' +
    CONFIG.LLM.DAILY_MODEL + ':generateContent?key=' + encodeURIComponent(key);
  var resp = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({
      contents: [{ parts: [{ text: 'Reply with the single word: OK' }] }],
      generationConfig: { maxOutputTokens: 16 }
    }),
    muteHttpExceptions: true
  });
  reportResult_('Gemini (' + CONFIG.LLM.DAILY_MODEL + ')', resp);
}

function reportResult_(label, resp) {
  var code = resp.getResponseCode();
  var body = resp.getContentText();
  if (code >= 200 && code < 300) {
    Logger.log('  ' + label + ': SUCCESS (HTTP ' + code + ') — key works.');
    return;
  }
  Logger.log('  ' + label + ': FAILED with HTTP ' + code);
  Logger.log('  Provider said: ' + body.slice(0, 800));
  Logger.log('  ' + hint_(code, body));
}

/** Plain-English reading of the common failure codes. */
function hint_(code, body) {
  if (code === 401) {
    return 'Hint: the key itself is being rejected. Re-copy it from the ' +
      'provider console and re-paste — make sure no characters are missing ' +
      'from either end, and that you saved the Script Properties row.';
  }
  if (code === 403) {
    return 'Hint: the key is recognized but not permitted. For Gemini this ' +
      'usually means the Generative Language API is not enabled on that ' +
      'Google Cloud project, or the key has an HTTP-referrer/IP restriction ' +
      'that blocks server-side calls. Create an unrestricted key in AI Studio.';
  }
  if (code === 400 && /model/i.test(body)) {
    return 'Hint: the model name in Config.js is not available to this key. ' +
      'Check CONFIG.LLM.BACKFILL_MODEL / DAILY_MODEL.';
  }
  if (code === 400) {
    return 'Hint: the request was malformed or the key is empty. See the text above.';
  }
  if (code === 404) {
    return 'Hint: model not found for this API version — check the model name in Config.js.';
  }
  if (code === 429) {
    return 'Hint: rate limited or out of quota/credits. For Anthropic, confirm ' +
      'the workspace has credit balance; for Gemini, wait and retry.';
  }
  return 'Hint: see the provider response above.';
}
