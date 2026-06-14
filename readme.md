# Time Tracker

A small personal time-tracking web app. It runs entirely in the browser
(no server) and stores all your data as a JSON file in a GitHub repo, so the
same data is available on every device you use it from.

## 1. Create a private GitHub repo for your data

1. Create a **new private repo** (e.g. `time-tracker-data`). This can be the
   same repo you host the app from, or a separate one — separate is a bit
   tidier, but either works. The app will create `data.json` in it
   automatically the first time you save something.

## 2. Create a fine-grained personal access token

1. Go to **GitHub → Settings → Developer settings → Personal access tokens
   → Fine-grained tokens → Generate new token**.
2. Give it a name, set an expiry (you'll need to regenerate it when it
   expires).
3. Under **Repository access**, choose **Only select repositories** and pick
   your data repo.
4. Under **Permissions → Repository permissions**, set **Contents** to
   **Read and write**. Everything else can stay "No access".
5. Generate the token and copy it — you won't be able to see it again.

⚠️ This token lives in your browser's local storage. Anyone with access to
your browser/device (or who reads it out of local storage) could use it to
read/write that repo. Keep the repo private and only grant the token access
to that one repo.

## 3. Host the app on GitHub Pages

1. Push the contents of this folder (`index.html`, `style.css`, `js/`) to a
   repo — this can be the same data repo or a different one, it doesn't
   matter to the app.
2. In that repo, go to **Settings → Pages**, set the source to your branch
   (e.g. `main`) and root folder.
3. GitHub will give you a URL like
   `https://yourusername.github.io/your-repo/`.

## 4. Configure the app

1. Open the GitHub Pages URL.
2. Go to the **Settings** tab inside the app and fill in:
   - **Personal access token** — from step 2
   - **Repo owner** — your GitHub username
   - **Repo name** — the data repo from step 1
   - **Branch** — usually `main`
   - **File path** — `data.json` (default is fine)
3. Click **Save & connect**. It will create `data.json` the first time you
   add or edit something.

## 5. Use it on your iPhone

- Open the same GitHub Pages URL in Safari.
- Tap the Share button → **Add to Home Screen** to get an app-like icon.
- Go to **Settings** and enter the _same_ GitHub token/repo details (local
  storage isn't shared between devices, so this is a one-time setup per
  device).

## How it works / things to know

- **Timer tab**: pick a category, hit Start. You can Pause/Resume, and Stop
  & Save when done. The timer keeps running even if you close the tab —
  it's stored locally until you stop it.
- **Add Entry tab**: for logging things you forgot to track. Pick a category,
  date, start and end time (tick "next day" if it runs past midnight).
- **Dashboard tab**: a donut chart for the selected month, styled like your
  existing monthly report, with a **Download as image** button. Below it,
  bar charts comparing time per category across recent days/weeks/months/years.
- **History tab**: every logged session, filterable by month, with edit and
  delete.
- **Categories tab**: add, rename, recolour, or remove categories (you can't
  delete one that's already used by logged entries — rename or recolour it
  instead).

## Syncing across devices

Saves are written as commits to `data.json` via the GitHub API. If two
devices save at nearly the same time, the app will detect the conflict,
re-fetch the latest version, merge in your change, and retry automatically.
The one edge case this doesn't handle perfectly: if you _delete_ an entry on
one device at the exact same moment another device saves something else, the
merge could bring the deleted entry back — if that ever happens, just delete
it again.
