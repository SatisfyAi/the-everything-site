# Time Tracker

A small personal time-tracking web app. It runs entirely in the browser
(no server) and stores all your data as a JSON file in a GitHub repo, so the
same data is available on every device you use it from.

This guide uses **two repos**:

- a **public** repo that hosts the app itself via GitHub Pages (free plans
  only support Pages on public repos)
- a **private** repo that holds your actual time-tracking data (`data.json`)

The app code contains nothing personal or secret (your token is stored only
in your browser, never in either repo), so there's no downside to the app
repo being public.

## 1. Create the private data repo

1. Create a **new private repo**, e.g. `the-everything-site_data`.
2. You don't need to add anything to it - the app will create `data.json`
   automatically the first time you save a session.

## 2. Create a fine-grained personal access token

1. Go to **GitHub → Settings → Developer settings → Personal access tokens
   → Fine-grained tokens → Generate new token**.
2. Give it a name, set an expiry (you'll need to regenerate it when it
   expires).
3. Under **Repository access**, choose **Only select repositories** and pick
   `the-everything-site_data` (the private repo from step 1) - **not** the app
   repo.
4. Under **Permissions → Repository permissions**, set **Contents** to
   **Read and write**. Everything else can stay "No access".
5. Generate the token and copy it - you won't be able to see it again.

⚠️ This token lives in your browser's local storage. Anyone with access to
your browser/device (or who reads it out of local storage) could use it to
read/write `the-everything-site_data`. Keep that repo private and only grant the
token access to it.

## 3. Create the public app repo and enable Pages

1. Create a **new public repo**, e.g. `the-everything-site`.
2. Push the contents of this folder (`index.html`, `style.css`, `js/`) to it.
3. In that repo, go to **Settings → Pages**, set the source to your branch
   (e.g. `main`) and the root folder.
4. GitHub will give you a URL like
   `https://yourusername.github.io/the-everything-site/`.

## 4. Configure the app

1. Open the GitHub Pages URL from step 3.
2. Go to the **Settings** tab inside the app and fill in:
   - **Personal access token** - from step 2
   - **Repo owner** - your GitHub username
   - **Repo name** - `the-everything-site_data (the **private** repo from step 1,
     not the app repo)
   - **Branch** - usually `main`
   - **File path** - `data.json` (default is fine)
3. Click **Save & connect**. It will create `data.json` in the private repo
   the first time you add or edit something.

## 5. Use it on your iPhone

- Open the same GitHub Pages URL in Safari.
- Tap the Share button → **Add to Home Screen** to get an app-like icon.
- Go to **Settings** and enter the _same_ GitHub token/repo details as step
  4 (local storage isn't shared between devices, so this is a one-time setup
  per device).

## How it works / things to know

- **Timer tab**: pick a category, hit Start. You can Pause/Resume, and Stop
  & Save when done. The timer keeps running even if you close the tab -
  it's stored locally until you stop it.
- **Add Entry tab**: for logging things you forgot to track. Pick a category,
  date, start and end time (tick "next day" if it runs past midnight).
- **Dashboard tab**: a donut chart for the selected month, styled like your
  existing monthly report, with a **Download as image** button. Below it,
  bar charts comparing time per category across recent days/weeks/months/years.
- **History tab**: every logged session, filterable by month, with edit and
  delete.
- **Categories tab**: add, rename, recolour, or remove categories (you can't
  delete one that's already used by logged entries - rename or recolour it
  instead).

## Syncing across devices

Saves are written as commits to `data.json` in the private data repo via the
GitHub API. If two devices save at nearly the same time, the app will detect
the conflict, re-fetch the latest version, merge in your change, and retry
automatically. The one edge case this doesn't handle perfectly: if you
_delete_ an entry on one device at the exact same moment another device saves
something else, the merge could bring the deleted entry back - if that ever
happens, just delete it again.
