/**
 * Recruiter CRM — time-driven trigger management.
 */

/** Creates (or recreates) the daily morning trigger for dailySync(). */
function setupDailyTrigger() {
  removeDailyTrigger();
  ScriptApp.newTrigger('dailySync')
    .timeBased()
    .everyDays(1)
    .atHour(CONFIG.DAILY_RUN_HOUR)
    .create();
  Logger.log('Daily trigger installed for ~' + CONFIG.DAILY_RUN_HOUR + ':00.');
}

/** Removes any existing dailySync triggers (used before reinstalling). */
function removeDailyTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'dailySync') ScriptApp.deleteTrigger(t);
  });
}
