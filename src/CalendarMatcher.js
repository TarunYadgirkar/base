/**
 * Recruiter CRM — Google Calendar matching.
 * Interviews on the calendar are matched to companies/recruiters so
 * "when did I interview with X?" comes from the calendar, not guesswork.
 */

var INTERVIEW_EVENT_RE = /(interview|phone screen|recruiter (call|chat|screen)|onsite|on-site|final round|hiring manager|technical screen|coding|system design|intro call)/i;

/**
 * Loads candidate interview events once per run.
 * @return {Array<{id,title,start,end,guests,description}>}
 */
function loadCalendarEvents() {
  var now = new Date();
  var from = new Date(now.getTime() - CONFIG.CALENDAR_PAST_DAYS * 86400000);
  var to = new Date(now.getTime() + CONFIG.CALENDAR_FUTURE_DAYS * 86400000);

  return CalendarApp.getDefaultCalendar().getEvents(from, to)
    .map(function (ev) {
      return {
        id: ev.getId(),
        title: ev.getTitle() || '',
        start: ev.getStartTime(),
        end: ev.getEndTime(),
        description: (ev.getDescription() || '').slice(0, 2000),
        guests: ev.getGuestList(true).map(function (g) { return g.getEmail().toLowerCase(); })
      };
    })
    .filter(function (ev) {
      return INTERVIEW_EVENT_RE.test(ev.title) || INTERVIEW_EVENT_RE.test(ev.description);
    });
}

/**
 * Attaches matching events to a record (mutates record.interviewDates /
 * record.nextInterview). Match rules, any one suffices:
 *   - recruiter's email is a guest on the event
 *   - anyone from the recruiter's company domain is a guest
 *   - the company name appears in the event title or description
 */
function matchCalendarEvents(record, events) {
  var matched = eventsForRecord(record, events);
  record.interviewDates = matched.map(function (ev) { return ev.start; });
  var upcoming = matched.filter(function (ev) { return ev.start > new Date(); });
  record.nextInterview = upcoming.length ? upcoming[0].start : null;
}

function eventsForRecord(record, events) {
  var email = (record.recruiterEmail || '').toLowerCase();
  var domain = email.split('@')[1] || '';
  var isFreemail = CONFIG.FREEMAIL_DOMAINS.indexOf(domain) !== -1;
  var company = (record.company || '').toLowerCase();
  var companyRe = company ? new RegExp('\\b' + escapeRegex(company) + '\\b', 'i') : null;

  return events
    .filter(function (ev) {
      if (email && ev.guests.indexOf(email) !== -1) return true;
      if (domain && !isFreemail && ev.guests.some(function (g) { return g.slice(-domain.length - 1) === '@' + domain; })) return true;
      if (companyRe && (companyRe.test(ev.title) || companyRe.test(ev.description))) return true;
      return false;
    })
    .sort(function (a, b) { return a.start - b.start; });
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
