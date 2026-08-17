/**
 * Recruiter CRM — entry points.
 *
 * install()   → run ONCE by hand: authorizes scopes, creates the spreadsheet,
 *               does the initial 90-day backfill, and installs the daily 7 AM trigger.
 * dailySync() → what the trigger runs every morning. Safe to run by hand too.
 */

function install() {
  setupDailyTrigger();
  dailySync();
  Logger.log('Install complete. Spreadsheet: ' + getSpreadsheet().getUrl());
}

function dailySync() {
  var ss = getSpreadsheet();
  var state = loadState(ss);

  var threads = findRecruitingThreads(state.lastRunTime);
  Logger.log('Candidate threads: ' + threads.length);

  var calendarEvents = loadCalendarEvents();
  var newActivity = [];

  threads.forEach(function (thread) {
    var record = extractFromThread(thread);
    if (!record) return;

    matchCalendarEvents(record, calendarEvents);
    var activity = upsertRecruiterRow(ss, record, state);
    newActivity = newActivity.concat(activity);
  });

  // Calendar events can matter even with no new email (e.g. an interview was
  // added directly to the calendar), so refresh interview columns for every
  // known company each run.
  refreshCalendarColumns(ss, calendarEvents, state, newActivity);

  appendActivity(ss, newActivity);
  state.lastRunTime = new Date().toISOString();
  saveState(ss, state);

  Logger.log('Done. New activity entries: ' + newActivity.length);
}
