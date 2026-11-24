# Daybook (the-everything-site)

A personal dashboard that runs entirely in the browser: no server, no build
step, plain HTML/CSS/JS. Everything you enter is saved as JSON files in a
private GitHub repo, so the same data is on every device.

| Section     | What it does                                                          |
| ----------- | --------------------------------------------------------------------- |
| Today       | One-screen overview: hydration glass, Discord donut, job-clock status, habits, upcoming staff milestones |
| Hydration   | Log drinks, charts per day / week / month / year / all time, history  |
| Habits      | Habit tracker: tick, count or amount habits, streaks, stats, calendar |
| Discord     | Two pages behind one tab, switched with **Time \| Staff** at the top: Time (timer, manual entries, charts, history) and Staff (list, milestones, calendar image) |
| Job clock   | Start / lunch start / lunch end / end stamps, time off, week log, charts |
| Settings    | GitHub connection, theme, hydration goal and drinks, Discord categories, clock numbers |

## Navigation
- The bottom bar (top bar on desktop) has five items: **Hydration**,
  **Habits**, **Today** (in the middle), **Discord** and **Job clock**.
  Discord stays highlighted on both its Time and Staff pages. Settings is the
  sliders icon in the header.
- The Daybook logo in the header also goes to Today.

## Sections

### Today

- **Hydration**: the same glass as the Hydration tab, filled with today's
  drinks (stacked by drink colour) against the daily goal.
- **Discord**: donut of this month's time per category, with the month total.
- **Job clock**: an icon and label for the current status (working, lunch,
  not working, done, vacation, doctor, sick), each with its own colour.
- **Habits**: a row of today's habits as small rings with the count of
  finished ones and the streak. Tap a tick or count ring to log it right there;
  amount habits (and the title) open the Habits tab.
- **Upcoming milestones**: a timeline of the next 5 dates that have a
  staff milestone (today included). Dates today, in 2 days and in 7 days are
  highlighted as the reminder days. On wide screens the milestones card sits
  beside the other cards and both sides are the same height; on phones it sits
  underneath.
- The three cards are display only. Adding things is done on their own tabs.

### Hydration

- **Log a drink**: choose drink, amount (ml), date and time, or tap one of the
  quick-amount buttons (the amounts are set per drink in Settings).
- **Charts**: stacked bars per drink for Day, Week, Month, Year and All time,
  with previous/next navigation, plus the glass view and a donut with the total litres in the middle.
- **History**: every entry, newest first, with edit and delete.
- Daily goal and drinks (colour, name, one-tap amount) are in Settings.

### Discord time

- **Timer**: pick a category (and optionally a note), Start, Pause/Resume,
  Stop & save, or Discard. The running timer is kept in this browser's local
  storage, so closing the tab does not lose it; it is device-local until you
  stop it, then the finished session is saved to GitHub.
- **Add a session you forgot**: category, date, start, end (tick "next day"
  if it passes midnight) and a note.
- **Charts**: donut per category plus stacked bars for Day, Week, Month,
  Year and All time. Donuts are drawn without lines between slices
  and do not depend on the background colour.
- **History**: all sessions with edit and delete.

### Job clock

- **Stamps**: Start, Lunch start, Lunch end, End. Each stamps the current
  time plus the configured shift: Start is now **+5 min** and End is now
  **−5 min** by default (both configurable). Times can be edited afterwards
  and "Undo last" removes the latest stamp.
- **Lunch** is at least 30 minutes: ending lunch earlier than that records
  lunch end 30 minutes after lunch start.
- **Live total**: worked time is calculated with the end shift applied, and the
  line under the clock and the charts update in real time while you are
  working.
- **Time off**: Vacation, Doctor and Sick day all work the same way. Pick a
  date (or a date range, optionally skipping Saturdays and Sundays) and enter
  the hours away, or leave it empty for a whole day. A day's target is
  reduced by the hours off, and time off shows as hours in the charts.
- **Days with no data are ignored**: weekends, public holidays and gaps never
  count as missing hours, so there is no holiday setup.
- **Week log**: each day with its status icon, times (editable), and the plus
  or minus against the daily target.
- **Charts**: Week, Month, Year, All time. Week and Month colour hours grey,
  the shortfall to the daily target red and the overtime green, with doctor,
  vacation and sick time in their own colours. Year and All time show only the
  grey hours plus doctor/vacation/sick, with no red or green.

### Habits

Three tabs at the top: **Today | Stats | Manage**.

- **Three kinds of habit**:
  - *Done / not done*: one tap ticks the day (for example a sudoku puzzle).
  - *Count*: a number of times a day (for example brushing teeth, 2 a day).
    The ring is split into that many rounded segments (2 to 12) and each tap
    fills the next one; **−** takes one back. The day is done when all are filled.
  - *Amount*: a daily target with a unit (for example 2000 ml or 30 pages).
    The ring fills as you add. Quick-add buttons (up to three, for example
    `250, 500`) and a **…** box for any amount (negative removes some). Going
    over the target is kept. The day is done when the target is reached.
- **Today**: today's habits with their rings, the number done and the streak
  across all of them. Habits not scheduled today are listed in grey underneath.
- **Stats**: today, overall streak and 30-day completion, a 12-week heat map
  (brighter = more of that day done) and a list per habit with streak, best
  streak and 30-day rate. Tap a habit for its page: streak, best, 30 days,
  total, a month calendar and a **Log a day** form to fix or fill in past days.
- **Manage**: add, edit, archive/restore and delete habits. A habit has a name,
  colour, type, target (and unit), the days it applies to and a start date.
  Archived habits disappear from Today and Stats but keep their history.
  Deleting also removes the habit's history.
- **Streak rules**: days a habit is not scheduled are skipped and never break
  the streak, and neither does today while it is still open. Whether a day
  counts is always judged against the habit's current target, so changing a
  target also changes how past days are judged.

### Staff (the second page of the Discord tab)

- **List** with Current / Former / All filters, search, edit and delete. A
  person has a name, a join date, an optional leave date and optional Discord
  username, Reddit username and Discord user ID (search matches all of them;
  the ID is 15-22 digits and is not shown in the list).
- **Import**: one person per line as
  `name, joined, left, discord, reddit, discord id`. Everything after the join
  date is optional (leave a column empty to skip it). Dates can be
  `2025-03-14` or `14.03.2025`.
- **Milestones**: at 6 months, then every year on the join date (a date that
  does not exist that month is moved to the month end). They stop after the
  leave date. They are labelled "6 Month milestone" and "Annual milestone".
- **Upcoming milestones image**: shows a calendar of upcoming milestones for
  a chosen period and can be downloaded as a PNG to send to team leads.

### Settings

- **GitHub sync**: personal access token, "Save & connect", "Reload from
  GitHub", "Disconnect", and a button to copy data saved on this device into the
  repo. The token is stored only in this browser.
- **Appearance**: Dark, Light or Match device.
- **Hydration**: daily goal and drinks (colour, name, one-tap amount; drag to
  reorder). A drink that already has entries cannot be deleted, only renamed
  or recoloured.
- **Discord categories**: add, rename, recolour; categories with logged time
  cannot be deleted.
- **Job clock**: start shift (minutes), end shift (minutes, negative goes back
  in time) and the daily target in hours.

## Downloads

Chart and calendar images use the share sheet on touch devices (phones and
tablets), where you can save to Photos or send straight to an app, and are
downloaded as a normal file on desktop.

## Data files

All data lives in the private data repo (`the-everything-site_data`), one file
per section. The file names and repo are set in `REPO_CONFIG` at the top of
`js/github.js`.

| File                  | Contents                                                                                                                                                                                                                                                |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `data.json`           | Discord time: `{ categories: [{key, label, color}], sessions: [{id, category, startDate, endDate, minutes, note?}] }`                                                                                                                                   |
| `hydration-data.json` | `{ categories, entries: [{id, category, date, amount}], settings: { goal, amounts } }`                                                                                                                                                                  |
| `clock-data.json`     | `{ settings: { startShift, endShift, dayTarget }, days: { "YYYY-MM-DD": { s, ls, le, e, off?: { type, min? } } } }`. `s/ls/le/e` are the four stamps; `off.type` is `vacation`, `doctor` or `sick`; `off.min` is the minutes away (missing = whole day) |
| `habits-data.json`    | `{ habits: [{ id, name, color, type: 'done'\|'count'\|'amount', target, unit?, quick?: [numbers], days?: [0-6] (0 = Sunday, missing = every day), start, archived? }], log: { "YYYY-MM-DD": { <habitId>: number } } }` |
| `staff-data.json`     | `{ staff: [{ id, name, joined, left?, discord?, reddit?, discordId? }] }` with ISO dates                                                                                                                                                                                               |

The files are created automatically the first time something is saved.
`staff-data.json` can be read by other tools (for example a report
generator) for names and join/leave dates.

## How saving works

- Changes are queued per file and written as commits through the GitHub
  Contents API, batched so quick edits become one commit.
- If two devices save at nearly the same time, the app re-fetches the latest
  file, re-applies your change and retries. The one edge case: deleting an
  entry on one device at the very moment another device saves can bring the
  deleted entry back; delete it again.
- With no token connected, the same files are kept in this browser's local
  storage, and can be copied into the repo from Settings once connected.
- The header shows the sync status, with a Retry button if a save failed.

## Setup

### 1. Private data repo

Create a **private** repo, e.g. `the-everything-site_data`. It can be empty.

### 2. Access token

GitHub → Settings → Developer settings → Personal access tokens →
Fine-grained tokens → Generate new token.

- Repository access: **Only select repositories** → the private data repo
  (not the app repo).
- Permissions → Repository permissions → **Contents: Read and write**.

The token is kept in your browser's local storage. Anyone with access to your
browser could use it on that one repo, so keep the data repo private and
scope the token to it only.

### 3. Public app repo and Pages

Create a **public** repo, e.g. `the-everything-site`, and push this folder to
it. The code contains nothing personal. Then Settings → Pages, source
`main`. The included workflow (`.github/workflows/pages.yml`) publishes `main`
at the site root and, if it exists, the `dev` branch at `/dev/`.

### 4. Connect

Open the site, go to Settings, paste the token and press **Save & connect**.
If your repo, branch or file names differ, edit `REPO_CONFIG` in
`js/github.js` first. On each new device, enter the token once.

### 5. iPhone

Open the Pages URL in Safari, Share → **Add to Home Screen**. `manifest.json`
sets the name, icon and start URL (change `/the-everything-site/` in it if
your repo is named differently).

## Project layout

- `index.html`: all views (Today, Hydration, Habits, Discord, Job clock, Staff, Settings)
- `style.css`: the whole design
- `js/github.js`: GitHub store, queue and local fallback, `REPO_CONFIG`
- `js/data.js`: defaults and data helpers
- `js/app.js`: navigation, Today view, status icons, live refresh
- `js/chart.js`: stacked-bar and donut charts and PNG export
- `js/hydration.js`, `js/work.js`, `js/clock.js`, `js/staff.js`, `js/habits.js`: the sections
- `js/timer.js`: the running Discord timer
- `js/settings.js`: settings page
- `js/util.js`: small helpers
- `hydration-tracker.html`, `time-tracker.html`: old links that redirect into the app

## Notes

- **Cache busting**: scripts and the stylesheet are loaded with `?v=N`
  (currently `v=39`). After changing a file, raise the number in
  `index.html` so phones do not use an old copy.
- **Fonts**: Outfit (headings, logo, big numbers), Inter (body text) and
  Roboto Mono (labels and numbers), loaded from Google Fonts in `index.html`.
- **Icons**: the Today and Job clock status icons are Font Awesome Free
  (CC BY 4.0 for icons); keep the licence comment above `HUB_ICONS` in
  `js/app.js`.