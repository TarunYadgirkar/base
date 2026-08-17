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

  // How far back the very first run looks in Gmail. After that, each daily run
  // only scans messages newer than the last successful run (minus a 2-day
  // overlap so nothing slips through).
  INITIAL_LOOKBACK_DAYS: 90,
  INCREMENTAL_OVERLAP_DAYS: 2,

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
