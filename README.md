# Recruiter Tracker (Google Apps Script)

A tiny, standalone "Recruiter CRM" that runs entirely inside **your own Google
account**. Every morning at ~7 AM it:

1. Searches recent **Gmail** for recruiting-related threads (recruiter,
   interview, phone screen, talent acquisition, …).
2. Extracts recruiter name, email, company, job title, recruiter title, phone,
   and pipeline stage — using headers, sender domains, signatures, and regexes,
   **optionally upgraded by an LLM** (see "AI-assisted extraction" below).
   Without any API key it runs fully deterministic at $0 recurring cost.
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
5. *(Optional — AI keys, see below)* **Project Settings ⚙ → Script Properties**:
   add `ANTHROPIC_API_KEY` (for the one-time 2-year backfill) and/or
   `GEMINI_API_KEY` (free tier, for daily runs). Do this **before** step 6 so
   the backfill uses the good model.
6. In the editor toolbar, select the function **`install`** and click **Run**.
   Google will ask for authorization — review and allow. The scopes are
   read-only Gmail, read-only Calendar, Sheets/Drive access for the one
   spreadsheet it creates, and (only if you use AI keys) external requests.
7. Done. `install` creates the spreadsheet, installs the daily **7 AM**
   trigger, and starts the **2-year backfill**. Because Apps Script limits a
   single run to ~6 minutes, the backfill processes email in chunks and
   automatically re-schedules itself every minute until it finishes — expect
   it to take a while (often an hour or more for two years of mail). Watch
   rows appear in the spreadsheet; the Executions panel (left sidebar) shows
   each chunk, and the final one logs "Backfill COMPLETE". Daily syncs start
   automatically once it's done.

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
- `INITIAL_LOOKBACK_DAYS` — how far the first backfill reaches (default 730 = 2 years).
- `LLM` — which models the two AI tiers use, token caps, input truncation.
- Backfill controls: `cancelBackfill()` aborts a backfill mid-flight;
  `startBackfill()` re-runs it (already-imported rows are updated, not duplicated).

After editing `Config.js`, no reinstall is needed — the next run picks it up.
(Only `DAILY_RUN_HOUR` needs `setupDailyTrigger` re-run.)

## AI-assisted extraction (optional, two-tier)

The cheap keyword filter always runs first, so only likely-recruiting threads
are ever sent to an AI — never the whole inbox. On top of that, two optional
keys enable two different tiers:

| Script Property | Used for | Model | Cost |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | **One-time 2-year backfill only** | `claude-opus-5` (top-tier) | Paid. Roughly $3–7 per 1,000 threads analyzed; a typical 2-year backfill lands in the $5–30 range depending on volume. **Delete the key after the backfill** and it's never billed again. |
| `GEMINI_API_KEY` | Daily runs | `gemini-2.5-flash` | Google AI Studio ([aistudio.google.com](https://aistudio.google.com) → Get API key) has a **free tier** whose daily limits are far beyond the handful of recruiter emails a day this processes. |
| *(neither)* | Everything | — | $0 — pure regex/heuristic extraction. |

The LLM fills fields the regexes missed, corrects the pipeline stage, and
vetoes threads that only *looked* recruiting-related. If an API call fails,
the run falls back to the regex result — the daily sync never breaks because
a quota ran out. There is no Anthropic free tier, which is why daily runs use
Gemini (free) or nothing; note that a Claude/ChatGPT *subscription* is not an
API key — API billing is separate and pay-per-token.

Models are configurable in `src/Config.js` under `LLM`.

## Privacy model

- Code is public-ish (this repo); with no AI keys set, data never leaves the
  Google account. With keys set, only the filtered recruiting-candidate
  threads (truncated) are sent to the chosen AI provider — never the inbox
  at large.
- Scopes are read-only for Gmail and Calendar. The script writes only to the
  one spreadsheet it created.
- Uninstall = delete the Apps Script project (trigger dies with it). The
  spreadsheet stays yours.
