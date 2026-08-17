/**
 * Recruiter CRM — deterministic extraction (no AI API).
 * Pulls recruiter name/email, company, job title, recruiter title, phone,
 * stage, and contact dates out of a Gmail thread using headers, domains,
 * signatures, and regexes.
 */

/**
 * @param {GmailThread} thread
 * @param {boolean} isBackfill picks the LLM provider (Anthropic for backfill,
 *   Gemini for daily runs); with no matching API key set, extraction is
 *   regex-only either way.
 * @return {Object|null} extracted record, or null if nothing usable.
 */
function extractFromThread(thread, isBackfill) {
  var messages = thread.getMessages();
  var me = myEmail();

  // The "recruiter" is the most recent external sender; if Dad started the
  // thread, fall back to the first external recipient.
  var recruiter = null;
  for (var i = messages.length - 1; i >= 0; i--) {
    var from = parseAddress(messages[i].getFrom());
    if (from.email && from.email.toLowerCase() !== me &&
        !CONFIG.IGNORED_SENDER_PATTERNS.some(function (re) { return re.test(from.email); })) {
      recruiter = { name: from.name, email: from.email, message: messages[i] };
      break;
    }
  }
  if (!recruiter) {
    var to = parseAddress(messages[0].getTo() || '');
    if (!to.email || to.email.toLowerCase() === me) return null;
    recruiter = { name: to.name, email: to.email, message: messages[0] };
  }

  var subject = thread.getFirstMessageSubject() || '';
  var fullText = subject + '\n' + recentThreadText(messages);
  var signature = extractSignature(recruiter.message, recruiter.name);

  var record = {
    threadId: thread.getId(),
    messageIds: messages.map(function (m) { return m.getId(); }),
    recruiterName: recruiter.name || nameFromEmail(recruiter.email),
    recruiterEmail: recruiter.email,
    company: extractCompany(recruiter.email, fullText, signature, subject),
    jobTitle: extractJobTitle(subject, fullText),
    recruiterTitle: extractRecruiterTitle(signature, fullText),
    phone: extractPhone(signature || fullText),
    stage: detectStage(fullText),
    firstContact: messages[0].getDate(),
    lastContact: messages[messages.length - 1].getDate(),
    lastSubject: subject,
    interviewDates: [], // filled in by CalendarMatcher
    nextInterview: null
  };

  // Optional LLM pass: fills fields the regexes missed, corrects the stage,
  // and vetoes threads that only *look* recruiting-related.
  if (llmAvailable(isBackfill)) {
    var llm = llmExtract(fullText, isBackfill);
    if (!mergeLlmIntoRecord(record, llm)) return null;
  }

  if (!record.company && !record.recruiterEmail) return null;
  return record;
}

/** "sarah.johnson@stripe.com" → "Sarah Johnson" */
function nameFromEmail(email) {
  var local = (email || '').split('@')[0];
  return local
    .split(/[._-]+/)
    .filter(function (p) { return p && !/^\d+$/.test(p); })
    .map(function (p) { return p.charAt(0).toUpperCase() + p.slice(1); })
    .join(' ');
}

/**
 * Company resolution order:
 *   1. Sender domain, unless it's freemail or an ATS/job-board domain.
 *   2. "at <Company>" / "join <Company>" / "<Company> is hiring" phrases.
 *   3. Capitalized line in the signature under the recruiter's name.
 */
function extractCompany(email, text, signature, subject) {
  var domain = (email.split('@')[1] || '').toLowerCase();
  var isFreemail = CONFIG.FREEMAIL_DOMAINS.indexOf(domain) !== -1;
  var isAts = CONFIG.ATS_DOMAINS.some(function (d) {
    return domain === d || domain.slice(-d.length - 1) === '.' + d;
  });

  if (domain && !isFreemail && !isAts) {
    // stripe.com → Stripe ; mail.notion.so → Notion
    var parts = domain.split('.');
    var core = parts.length >= 2 ? parts[parts.length - 2] : parts[0];
    if (['mail', 'email', 'hr', 'jobs', 'careers'].indexOf(core) !== -1 && parts.length >= 3) {
      core = parts[parts.length - 3];
    }
    return core.charAt(0).toUpperCase() + core.slice(1);
  }

  var phrase = (subject + '\n' + text).match(
    /(?:position at|role at|opportunity at|opportunit(?:y|ies) with|team at|join(?:ing)?|on behalf of|recruiting for)\s+([A-Z][A-Za-z0-9&.\- ]{1,40}?)(?=[,.!\n]|\s+(?:as|for|is|to|and)\b)/
  );
  if (phrase) return phrase[1].trim();

  if (signature) {
    var lines = signature.split('\n').map(function (l) { return l.trim(); }).filter(Boolean);
    for (var i = 1; i < lines.length; i++) {
      if (/^[A-Z][A-Za-z0-9&.\- ]{1,40}$/.test(lines[i]) &&
          !/recruiter|talent|phone|www|http|@/i.test(lines[i])) {
        return lines[i];
      }
    }
  }
  return '';
}

function extractJobTitle(subject, text) {
  var ROLE_WORDS = '(?:Engineer(?:ing)?|Developer|Manager|Scientist|Analyst|Designer|Architect|Director|Consultant|Specialist|Lead|Administrator|Programmer|SRE|PM)';
  var LEVEL = '(?:Senior|Staff|Principal|Lead|Junior|Sr\\.?|Jr\\.?|Founding)?';

  // Prefer the subject line — "Interview for Senior Software Engineer at Stripe"
  var sources = [subject, text];
  for (var i = 0; i < sources.length; i++) {
    var m = sources[i].match(new RegExp(
      LEVEL + '\\s*[A-Z][A-Za-z/+#. ]{0,30}?' + ROLE_WORDS + '(?:\\s+(?:I{1,3}|IV|V|\\d))?'
    ));
    if (m) return m[0].replace(/\s+/g, ' ').trim();
  }
  return '';
}

function extractRecruiterTitle(signature, text) {
  var source = (signature || '') + '\n' + text;
  var m = source.match(
    /(?:Senior |Lead |Principal |Staff )?(?:Technical |Executive |University )?(?:Recruiter|Sourcer|Talent (?:Acquisition(?: Partner| Specialist| Manager)?|Partner)|Recruiting (?:Coordinator|Manager)|People Operations [A-Za-z]+)/
  );
  return m ? m[0].trim() : '';
}

function extractPhone(text) {
  if (!text) return '';
  var m = text.match(/(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b/);
  return m ? m[0].trim() : '';
}

/**
 * Signature: the tail of the message after a sign-off ("Best,", "Thanks," ...)
 * or after the sender's own name near the end.
 */
function extractSignature(message, senderName) {
  var body = message.getPlainBody().slice(0, 6000);
  // Cut quoted reply history.
  body = body.split(/\r?\n\s*(?:>|On .{5,80} wrote:)/)[0];

  var m = body.match(/\r?\n(?:Best|Best regards|Regards|Thanks|Thank you|Cheers|Sincerely|Warmly|Talk soon)[,!]?\s*\r?\n([\s\S]{0,400})$/i);
  if (m) return m[1];

  if (senderName) {
    var idx = body.lastIndexOf(senderName);
    if (idx > body.length * 0.6) return body.slice(idx, idx + 400);
  }
  return '';
}

/** First matching stage in CONFIG.STAGES (ordered most-advanced first) wins. */
function detectStage(text) {
  for (var i = 0; i < CONFIG.STAGES.length; i++) {
    if (CONFIG.STAGES[i].re.test(text)) return CONFIG.STAGES[i].name;
  }
  return 'Initial Contact';
}
