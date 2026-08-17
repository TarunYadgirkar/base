/**
 * Recruiter CRM — chunked historical backfill.
 *
 * Apps Script kills executions after ~6 minutes, and a 2-year import (search +
 * extraction + one LLM call per thread) takes far longer than that. So the
 * backfill processes a chunk of threads, saves a cursor, and schedules itself
 * to continue one minute later — repeating until the whole window is done.
 *
 * Progress is visible in the spreadsheet as rows appear, and the cursor lives
 * in Script Properties (BACKFILL_CURSOR).
 */

function startBackfill() {
  var props = PropertiesService.getScriptProperties();
  props.setProperty('BACKFILL_CURSOR', JSON.stringify({
    offset: 0,
    startedAt: new Date().toISOString()
  }));
  removeBackfillTriggers_();
  Logger.log('Backfill started: last ' + CONFIG.INITIAL_LOOKBACK_DAYS + ' days.');
  continueBackfill();
}

/** One chunk of the backfill; re-arms itself until the window is exhausted. */
function continueBackfill() {
  var props = PropertiesService.getScriptProperties();
  var raw = props.getProperty('BACKFILL_CURSOR');
  if (!raw) return; // nothing in progress
  var cursor = JSON.parse(raw);

  var startedMs = Date.now();
  var ss = getSpreadsheet();
  var state = loadState(ss);
  var calendarEvents = loadCalendarEvents();
  var newActivity = [];

  var query = 'newer_than:' + CONFIG.INITIAL_LOOKBACK_DAYS +
    'd -in:spam -in:trash -category:promotions ' +
    '(' + CONFIG.GMAIL_QUERY_TERMS.join(' OR ') + ')';

  var exhausted = false;
  while (Date.now() - startedMs < CONFIG.BACKFILL_TIME_BUDGET_MS) {
    var page = GmailApp.search(query, cursor.offset, CONFIG.BACKFILL_CHUNK_THREADS);
    if (!page.length) { exhausted = true; break; }

    page.forEach(function (thread) {
      if (!isRecruitingThread(thread)) return;
      var record = extractFromThread(thread, /* isBackfill */ true);
      if (!record) return;
      matchCalendarEvents(record, calendarEvents);
      newActivity = newActivity.concat(upsertRecruiterRow(ss, record, state));
    });

    cursor.offset += page.length;
    if (page.length < CONFIG.BACKFILL_CHUNK_THREADS) { exhausted = true; break; }
  }

  appendActivity(ss, newActivity);
  saveState(ss, state);

  if (exhausted) {
    finishBackfill_(props, cursor);
  } else {
    props.setProperty('BACKFILL_CURSOR', JSON.stringify(cursor));
    ScriptApp.newTrigger('continueBackfill').timeBased().after(60 * 1000).create();
    Logger.log('Backfill checkpoint: ' + cursor.offset + ' threads scanned; continuing in ~1 min.');
  }
}

function finishBackfill_(props, cursor) {
  props.deleteProperty('BACKFILL_CURSOR');
  props.setProperty('LAST_RUN_TIME', new Date().toISOString());
  removeBackfillTriggers_();
  refreshCalendarSweep_();
  Logger.log('Backfill COMPLETE. Scanned ' + cursor.offset + ' threads since ' + cursor.startedAt + '.');
}

/** Final calendar pass over everything the backfill imported. */
function refreshCalendarSweep_() {
  var ss = getSpreadsheet();
  var state = loadState(ss);
  var activity = [];
  refreshCalendarColumns(ss, loadCalendarEvents(), state, activity);
  appendActivity(ss, activity);
  saveState(ss, state);
}

function isBackfillRunning() {
  return !!PropertiesService.getScriptProperties().getProperty('BACKFILL_CURSOR');
}

function removeBackfillTriggers_() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'continueBackfill') ScriptApp.deleteTrigger(t);
  });
}

/** Run by hand if you ever want to abort a backfill mid-flight. */
function cancelBackfill() {
  PropertiesService.getScriptProperties().deleteProperty('BACKFILL_CURSOR');
  removeBackfillTriggers_();
  Logger.log('Backfill cancelled.');
}
