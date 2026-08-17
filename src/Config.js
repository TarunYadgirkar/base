/**
 * Recruiter CRM — configuration.
 * Everything tunable lives here so the other files rarely need editing.
 */
var CONFIG = {
  // Name of the spreadsheet that gets created on first run. The spreadsheet id
  // is remembered in Script Properties afterwards, so renaming it later is fine.
  SPREADSHEET_NAME: 'Recruiter Tracker',

  // Tab names inside the spreadsheet.
  SHEET_RECRUITERS: 'Recruiters',
  SHEET_ACTIVITY: 'Activity Log',
  SHEET_STATE: '_State', // hidden bookkeeping tab (processed message/event ids)

  // How far back the very first run looks in Gmail. The backfill is chunked
  // and re-schedules itself, so it survives Apps Script's ~6-minute execution
  // limit even at 2 years. Daily runs afterwards only scan messages newer than
  // the last successful run (minus a 2-day overlap so nothing slips through).
  INITIAL_LOOKBACK_DAYS: 730,
  INCREMENTAL_OVERLAP_DAYS: 2,

  // Backfill chunking: how many threads to process per execution, and how much
  // wall-clock time to use before saving a cursor and re-scheduling.
  BACKFILL_CHUNK_THREADS: 25,
  BACKFILL_TIME_BUDGET_MS: 4.5 * 60 * 1000,

  // ---- Optional LLM-assisted extraction ----
  // Keys are set via: Project Settings (gear icon) -> Script Properties.
  // Both are optional; with neither key set the script is fully deterministic.
  //
  //   ANTHROPIC_API_KEY -> used ONLY for the one-time historical backfill,
  //                        with a top-tier model for maximum accuracy on
  //                        2 years of mail. Delete the key after the backfill
  //                        if you want to be sure it's never billed again.
  //   GEMINI_API_KEY    -> used for the daily runs. Google AI Studio keys
  //                        (aistudio.google.com) have a free tier that easily
  //                        covers a few recruiter emails per day.
  LLM: {
    BACKFILL_MODEL: 'claude-opus-5',    // Anthropic, one-time backfill
    DAILY_MODEL: 'gemini-2.5-flash',  // Google, free tier, daily runs
    MAX_TOKENS: 1024,
    // How much thread text to send per call (chars). Keeps cost bounded.
    MAX_INPUT_CHARS: 12000
  },

  // Calendar window scanned for interview events: past 60 days + next 90 days.
  CALENDAR_PAST_DAYS: 60,
  CALENDAR_FUTURE_DAYS: 90,

  // Hour of day (0-23, script timezone) for the daily trigger.
  DAILY_RUN_HOUR: 7,

  // Terms used in the Gmail search query (OR'd together).
  GMAIL_QUERY_TERMS: [
    'recruiter',
    'recruiting',
    'interview',
    '"talent acquisition"',
    '"phone screen"',
    '"hiring manager"',
    '"your application"',
    '"next steps"',
    'onsite',
    '"technical interview"',
    'opportunity'
  ],

  // Senders that are job-board noise, not real recruiters. Threads whose only
  // participants match these are skipped.
  IGNORED_SENDER_PATTERNS: [
    /jobs-noreply@linkedin\.com/i,
    /jobalerts-noreply@linkedin\.com/i,
    /@indeed(email)?\.com/i,
    /@glassdoor\.com/i,
    /@ziprecruiter\.com/i,
    /@hi\.wellfound\.com/i,
    /@mail\.dice\.com/i,
    /no-?reply@/i,
    /notifications?@/i,
    /newsletter@/i,
    /@substack\.com/i
  ],

  // Body/subject phrases that mark a thread as recruiting-related. A thread
  // needs at least one strong signal (or two weak ones) to be kept.
  STRONG_SIGNALS: [
    /technical (recruiter|sourcer)/i,
    /talent (acquisition|partner|sourcer)/i,
    /phone screen/i,
    /recruiter screen/i,
    /schedule (your|an|the) interview/i,
    /interview (is )?(confirmed|scheduled)/i,
    /onsite interview/i,
    /final round/i,
    /coding (challenge|assessment)/i,
    /take-?home (assignment|exercise)/i,
    /offer letter/i,
    /we('d| would) love to (chat|connect|talk)/i,
    /your application (to|for|at)/i,
    /moving (you )?forward (to|with)/i
  ],
  WEAK_SIGNALS: [
    /\binterview\b/i,
    /\brecruiter\b/i,
    /\bhiring\b/i,
    /\brole\b/i,
    /\bposition\b/i,
    /\bopportunity\b/i,
    /\bcandidate\b/i,
    /next steps/i
  ],

  // Freemail domains that never identify a company.
  FREEMAIL_DOMAINS: [
    'gmail.com', 'googlemail.com', 'yahoo.com', 'hotmail.com', 'outlook.com',
    'live.com', 'aol.com', 'icloud.com', 'me.com', 'proton.me', 'protonmail.com'
  ],

  // Recruiting-agency / ATS domains: real senders, but the domain is not the
  // hiring company, so prefer company names found in the text instead.
  ATS_DOMAINS: [
    'greenhouse.io', 'greenhouse-mail.io', 'lever.co', 'hire.lever.co',
    'ashbyhq.com', 'myworkday.com', 'myworkdayjobs.com', 'smartrecruiters.com',
    'icims.com', 'jobvite.com', 'bamboohr.com', 'rippling.com', 'gem.com'
  ],

  // Ordered pipeline stages, most-advanced first. The first pattern that
  // matches anywhere in the thread's recent text wins.
  STAGES: [
    { name: 'Rejected',            re: /(unfortunately|not (be )?moving forward|other candidates|position has been filled|decided not to proceed|no longer under consideration)/i },
    { name: 'Offer',               re: /(offer letter|extend(ing)? (you )?an offer|pleased to offer|compensation package)/i },
    { name: 'Onsite / Final',      re: /(onsite|on-site|final round|final interview|panel interview|virtual onsite)/i },
    { name: 'Technical Interview', re: /(technical interview|coding (interview|challenge|assessment)|take-?home|system design|pair programming)/i },
    { name: 'Recruiter Screen',    re: /(phone screen|recruiter (screen|call|chat)|intro(ductory)? call|initial (call|conversation)|quick (call|chat))/i },
    { name: 'Applied',             re: /(your application|thank you for applying|application (received|for))/i },
    { name: 'Initial Contact',     re: /./ } // fallback
  ]
};

/** Column layout of the Recruiters tab. Order here = order in the sheet. */
var RECRUITER_COLUMNS = [
  'Recruiter Name',
  'Recruiter Email',
  'Company',
  'Job Title',
  'Recruiter Title',
  'Phone',
  'First Contact',
  'Last Contact',
  'Interview Date(s)',
  'Next Interview',
  'Current Stage',
  'Notes'
];
