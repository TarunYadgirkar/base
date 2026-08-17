/**
 * Recruiter CRM — Gmail scanning.
 * Finds threads that look recruiting-related. Two layers:
 *   1. A Gmail search query (cheap, server-side).
 *   2. JS-side scoring against STRONG/WEAK signals and sender filters.
 */

/**
 * @param {string|null} lastRunIso ISO timestamp of the previous successful run.
 * @return {GmailThread[]} threads worth extracting from.
 */
function findRecruitingThreads(lastRunIso) {
  var days;
  if (lastRunIso) {
    var elapsedMs = Date.now() - new Date(lastRunIso).getTime();
    days = Math.ceil(elapsedMs / 86400000) + CONFIG.INCREMENTAL_OVERLAP_DAYS;
  } else {
    days = CONFIG.INITIAL_LOOKBACK_DAYS;
  }

  var query = 'newer_than:' + days + 'd -in:spam -in:trash -category:promotions ' +
    '(' + CONFIG.GMAIL_QUERY_TERMS.join(' OR ') + ')';

  var threads = [];
  var start = 0;
  var PAGE = 100;
  while (true) {
    var page = GmailApp.search(query, start, PAGE);
    threads = threads.concat(page);
    if (page.length < PAGE) break;
    start += PAGE;
    if (start >= 500) break; // hard cap per run; overlap catches the rest tomorrow
  }

  return threads.filter(isRecruitingThread);
}

/** Heuristic relevance check on a thread's participants + text. */
function isRecruitingThread(thread) {
  var messages = thread.getMessages();
  if (!messages.length) return false;

  var me = Session.getActiveUser().getEmail().toLowerCase();
  var externalSenders = messages
    .map(function (m) { return parseAddress(m.getFrom()).email.toLowerCase(); })
    .filter(function (e) { return e && e !== me; });

  // Thread must involve at least one external sender that isn't pure noise.
  var realSenders = externalSenders.filter(function (e) {
    return !CONFIG.IGNORED_SENDER_PATTERNS.some(function (re) { return re.test(e); });
  });
  if (externalSenders.length && !realSenders.length) return false;

  var text = thread.getFirstMessageSubject() + '\n' + recentThreadText(messages);
  var strong = CONFIG.STRONG_SIGNALS.filter(function (re) { return re.test(text); }).length;
  var weak = CONFIG.WEAK_SIGNALS.filter(function (re) { return re.test(text); }).length;
  return strong >= 1 || weak >= 2;
}

/** Concatenated plain-text of the last few messages, capped to keep regex work cheap. */
function recentThreadText(messages) {
  var out = [];
  var startIdx = Math.max(0, messages.length - 4);
  for (var i = startIdx; i < messages.length; i++) {
    out.push(messages[i].getPlainBody().slice(0, 4000));
  }
  return out.join('\n');
}

/**
 * "Sarah Johnson <sarah@stripe.com>" → {name: "Sarah Johnson", email: "sarah@stripe.com"}
 */
function parseAddress(raw) {
  if (!raw) return { name: '', email: '' };
  var m = raw.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  if (m) return { name: m[1].trim(), email: m[2].trim() };
  var bare = raw.match(/[\w.+-]+@[\w.-]+\.\w+/);
  return { name: '', email: bare ? bare[0] : raw.trim() };
}
