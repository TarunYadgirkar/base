# Recruiter Tracker (Google Apps Script)

A tiny, standalone "Recruiter CRM" that runs entirely inside **your own Google
account**. Every morning at ~7 AM it:

1. Searches recent **Gmail** for recruiting-related threads (recruiter,
   interview, phone screen, talent acquisition, …).
2. Extracts recruiter name, email, company, job title, recruiter title, phone,
   and pipeline stage — using headers, sender domains, signatures, and regexes.
   **No AI API, no external services, $0 recurring cost.**
3. Cross-references **Google Calendar** for matching interview events
   (by recruiter email, company domain among guests, or company name in the
   event title/description).
4. Upserts everything into a **Google Sheet** called *Recruiter Tracker*:
   - **Recruiters** tab — one row per company + recruiter:
     `Recruiter Name | Recruiter Email | Company | Job Title | Recruiter Title |
     Phone | First Contact | Last Contact | Interview Date(s) | Next Interview |
     Current Stage | Notes`
   - **Activity Log** tab — an append-only timeline (new contact, emails,
     stage changes, interviews scheduled), so history is kept, never overwritten.
   - The **Notes** column is yours — the script never touches it.

The script is created and authorized by the account it monitors, and the
time-driven trigger runs as that same account. **Nobody else's account —
Claude, ChatGPT, or otherwise — ever gets access to the inbox.**

## Setup (5 minutes, no tools needed)

1. While signed in to the Google account you want tracked, open
   **[script.google.com](https://script.google.com)** → **New project**.
   Name it "Recruiter Tracker".
2. Replace the default `Code.gs` with the contents of `src/Config.js`.
3. For each remaining file in `src/` (`Main.js`, `GmailScanner.js`,
   `Extractor.js`, `CalendarMatcher.js`, `Sheet.js`, `Triggers.js`):
   click **+ → Script**, name it to match, and paste the contents.
   (File names don't affect behavior — Apps Script merges them.)
4. *(Optional but recommended)* Enable the manifest: **Project Settings ⚙ →
   check "Show appsscript.json"**, then paste in `appsscript.json` from this
   repo and fix `timeZone` if you're not on Pacific time.
5. In the editor toolbar, select the function **`install`** and click **Run**.
   Google will ask for authorization — review and allow. The scopes are
   read-only Gmail, read-only Calendar, and Sheets/Drive access for the one
   spreadsheet it creates.
6. Done. `install` performs the initial **90-day backfill**, creates the
   spreadsheet, and installs the daily **7 AM** trigger. The log at the bottom
   prints the spreadsheet URL (it's also in your Drive as "Recruiter Tracker").

### Developer alternative: clasp

If you prefer deploying from this repo directly:

```bash
npm install -g @google/clasp
clasp login                      # as the account being tracked
clasp create --type standalone --title "Recruiter Tracker" --rootDir .
clasp push
```

Then run `install` once from the Apps Script editor (authorization must be
interactive the first time).

## Day-to-day

- Runs automatically each morning; also safe to run `dailySync` by hand.
- Each run only scans mail newer than the last run (plus a 2-day overlap), so
  it stays fast and never double-logs — processed message/event ids are
  remembered in a hidden `_State` tab.
- Interviews added straight to Calendar (no email) are still picked up: every
  run re-sweeps the calendar for all known companies.

## Tuning

Everything adjustable is in `src/Config.js`:

- `DAILY_RUN_HOUR` — change the morning run time.
- `GMAIL_QUERY_TERMS`, `STRONG_SIGNALS` / `WEAK_SIGNALS` — what counts as a
  recruiting email.
- `IGNORED_SENDER_PATTERNS` — job-board noise to skip (LinkedIn job alerts,
  Indeed, no-reply senders, …).
- `STAGES` — the pipeline-stage detection ladder
  (Rejected / Offer / Onsite / Technical Interview / Recruiter Screen /
  Applied / Initial Contact).
- `INITIAL_LOOKBACK_DAYS` — how far the first backfill reaches.

After editing `Config.js`, no reinstall is needed — the next run picks it up.
(Only `DAILY_RUN_HOUR` needs `setupDailyTrigger` re-run.)

## Later: optional AI-assisted extraction

V1 is fully deterministic on purpose. If some recruiter emails parse poorly,
the right upgrade is a *narrow* one: keep the cheap filter, and send **only the
few threads that failed extraction** to an LLM API for structured extraction —
never the whole inbox. That would be a small addition to `Extractor.js` using
`UrlFetchApp` plus an API key stored in Script Properties.

## Privacy model

- Code is public-ish (this repo); data never leaves the Google account.
- Scopes are read-only for Gmail and Calendar. The script writes only to the
  one spreadsheet it created.
- Uninstall = delete the Apps Script project (trigger dies with it). The
  spreadsheet stays yours.
