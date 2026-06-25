// ===================== State =====================

const APP_KEY = 'timetracker';
const ITEMS_KEY = 'sessions';

// Repo details are fixed since they won't change device to device.
// >>> EDIT THESE THREE VALUES to match your own GitHub repo <<<
const REPO_CONFIG = {
  owner: 'SatisfyAi',
  repo: 'the-everything-site_data',
  branch: 'main',
  path: 'data.json',
};

function EMPTY_DATA() {
  return { categories: DEFAULT_CATEGORIES.slice(), sessions: [] };
}

const state = {
  data: EMPTY_DATA(),
  sha: null,
  dashboard: { period: 'month', offset: 0 },
  editingId: null,
};

let timerSelectedCategory = null;
let entrySelectedCategory = null;

// Time Tracker sessions are dated by their start time.
function getItemDate(session) {
  return new Date(session.startDate);
}

// ===================== Init =====================
// (Global error reporting lives in shared-app.js)

document.addEventListener('DOMContentLoaded', init);

async function init() {
  setupTabs();
  setupSettingsForm();
  setupTimerTab();
  setupEntryTab();
  setupDashboardNav('TT');
  setupHistoryTab();
  setupCategoriesTab();
  updateConfigBanner();

  if (ghConfigured(APP_KEY)) {
    setStatus('Loading…', 'busy');
    try {
      await loadFromGitHub();
      setStatus('Synced', 'ok');
    } catch (e) {
      setStatus('Load failed: ' + e.message, 'error');
    }
  }

  renderAll();
  startTimerTick();
}

function renderAll() {
  renderTimerTab();
  renderEntryTab();
  renderDashboardTab();
  renderHistoryTab();
  renderCategoriesTab();
}

// ===================== Timer tab =====================

function setupTimerTab() {
  document.getElementById('timer-start').onclick = () => {
    if (!timerSelectedCategory) {
      setStatus('Pick a category first.', 'error');
      return;
    }
    timerStart(timerSelectedCategory);
    renderTimerTab();
  };
  document.getElementById('timer-pause').onclick = () => {
    timerPause();
    renderTimerTab();
  };
  document.getElementById('timer-resume').onclick = () => {
    timerResume();
    renderTimerTab();
  };
  document.getElementById('timer-stop').onclick = async () => {
    const result = timerStop();
    if (result && result.discarded) {
      setStatus(
        `Only ${result.elapsedSeconds}s - not saved (entries under 1 minute are discarded).`,
        'warn',
      );
    } else if (result) {
      await persist(
        (d) => d.sessions.push(result),
        `Add session: ${result.category}`,
      );
      renderDashboardTab();
      renderHistoryTab();
    }
    renderTimerTab();
  };
  document.getElementById('timer-cancel').onclick = () => {
    if (confirm('Discard this timer without saving it?')) {
      timerCancel();
      renderTimerTab();
    }
  };
}

function renderTimerTab() {
  if (!timerSelectedCategory && state.data.categories.length) {
    timerSelectedCategory = state.data.categories[0].key;
  }

  const ts = timerGetState();
  const selKey = ts ? ts.category : timerSelectedCategory;
  const locked = !!ts; // can't switch categories while a timer is active

  renderCategoryPicker(
    document.getElementById('timer-category-picker'),
    selKey,
    (key) => {
      timerSelectedCategory = key;
      renderTimerTab();
    },
    locked,
  );

  document.getElementById('timer-display').textContent = formatHMS(
    timerElapsedSeconds(ts),
  );

  const startBtn = document.getElementById('timer-start');
  const pauseBtn = document.getElementById('timer-pause');
  const resumeBtn = document.getElementById('timer-resume');
  const stopBtn = document.getElementById('timer-stop');
  const cancelBtn = document.getElementById('timer-cancel');
  const statusEl = document.getElementById('timer-state-label');

  if (!ts) {
    startBtn.hidden = false;
    pauseBtn.hidden = true;
    resumeBtn.hidden = true;
    stopBtn.hidden = true;
    cancelBtn.hidden = true;
    statusEl.textContent = 'Ready';
  } else if (ts.running) {
    startBtn.hidden = true;
    pauseBtn.hidden = false;
    resumeBtn.hidden = true;
    stopBtn.hidden = false;
    cancelBtn.hidden = false;
    statusEl.textContent = 'Running';
  } else {
    startBtn.hidden = true;
    pauseBtn.hidden = true;
    resumeBtn.hidden = false;
    stopBtn.hidden = false;
    cancelBtn.hidden = false;
    statusEl.textContent = 'Paused';
  }
}

function startTimerTick() {
  setInterval(() => {
    const ts = timerGetState();
    if (ts && ts.running) {
      document.getElementById('timer-display').textContent = formatHMS(
        timerElapsedSeconds(ts),
      );
    }
  }, 1000);
}

// ===================== Add / edit entry tab =====================

function setupEntryTab() {
  document.getElementById('entry-date').valueAsDate = new Date();

  ['entry-start', 'entry-end', 'entry-next-day'].forEach((id) => {
    document.getElementById(id).addEventListener('input', updateEntryDuration);
  });

  document.getElementById('entry-save').onclick = saveManualEntry;
  document.getElementById('entry-cancel-edit').onclick = resetEntryForm;

  updateEntryDuration();
}

function renderEntryTab() {
  if (!entrySelectedCategory && state.data.categories.length) {
    entrySelectedCategory = state.data.categories[0].key;
  }
  renderCategoryPicker(
    document.getElementById('entry-category-picker'),
    entrySelectedCategory,
    (key) => {
      entrySelectedCategory = key;
      renderEntryTab();
    },
  );
}

function updateEntryDuration() {
  const dateStr = document.getElementById('entry-date').value;
  const startStr = document.getElementById('entry-start').value;
  const endStr = document.getElementById('entry-end').value;
  const nextDay = document.getElementById('entry-next-day').checked;
  const out = document.getElementById('entry-duration');

  if (!dateStr || !startStr || !endStr) {
    out.textContent = '-';
    return;
  }
  const start = new Date(`${dateStr}T${startStr}`);
  let end = new Date(`${dateStr}T${endStr}`);
  if (nextDay || end <= start) end = new Date(end.getTime() + 24 * 3600 * 1000);
  const minutes = Math.round((end - start) / 60000);
  out.textContent = formatMinutesAsHM(minutes);
}

async function saveManualEntry() {
  const dateStr = document.getElementById('entry-date').value;
  const startStr = document.getElementById('entry-start').value;
  const endStr = document.getElementById('entry-end').value;
  const nextDay = document.getElementById('entry-next-day').checked;

  if (!dateStr || !startStr || !endStr || !entrySelectedCategory) {
    setStatus('Fill in category, date, start and end time.', 'error');
    return;
  }

  const start = new Date(`${dateStr}T${startStr}`);
  let end = new Date(`${dateStr}T${endStr}`);
  if (nextDay || end <= start) end = new Date(end.getTime() + 24 * 3600 * 1000);
  const minutes = Math.round((end - start) / 60000);

  if (minutes <= 0) {
    setStatus('End time must be after start time.', 'error');
    return;
  }

  if (state.editingId) {
    const id = state.editingId;
    await persist((d) => {
      const idx = d.sessions.findIndex((s) => s.id === id);
      if (idx >= 0) {
        d.sessions[idx] = {
          id,
          category: entrySelectedCategory,
          startDate: start.toISOString(),
          endDate: end.toISOString(),
          minutes,
        };
      }
    }, `Edit session ${id}`);
    resetEntryForm();
  } else {
    const session = {
      id: cryptoRandomId(),
      category: entrySelectedCategory,
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      minutes,
    };
    await persist(
      (d) => d.sessions.push(session),
      `Add session: ${session.category}`,
    );
    document.getElementById('entry-start').value = '';
    document.getElementById('entry-end').value = '';
    document.getElementById('entry-next-day').checked = false;
    updateEntryDuration();
  }

  renderDashboardTab();
  renderHistoryTab();
}

function resetEntryForm() {
  state.editingId = null;
  document.getElementById('entry-save').textContent = 'Save entry';
  document.getElementById('entry-cancel-edit').hidden = true;
  document.getElementById('entry-date').valueAsDate = new Date();
  document.getElementById('entry-start').value = '';
  document.getElementById('entry-end').value = '';
  document.getElementById('entry-next-day').checked = false;
  updateEntryDuration();
}

function sameDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

// ===================== Dashboard tab =====================

function renderDashboardTab() {
  renderDashboardCommon((range) => {
    const totals = {};
    state.data.sessions.forEach((s) => {
      const d = getItemDate(s);
      if (range.start && (d < range.start || d >= range.end)) return;
      totals[s.category] = (totals[s.category] || 0) + s.minutes;
    });
    return totals;
  });
}

// ===================== History tab =====================

function renderHistoryTab() {
  const sessions = getFilteredHistoryItems(getItemDate);

  const catMap = {};
  state.data.categories.forEach((c) => (catMap[c.key] = c));

  const tbody = document.getElementById('history-tbody');
  tbody.innerHTML = '';

  if (sessions.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="empty">No entries for this period.</td></tr>`;
    return;
  }

  sessions.forEach((s) => {
    const cat = catMap[s.category] || { label: s.category, color: '#666666' };
    const start = new Date(s.startDate);
    const end = new Date(s.endDate);

    const tr = document.createElement('tr');

    const dateTd = document.createElement('td');
    dateTd.textContent = start.toLocaleDateString(undefined, {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    });

    const catTd = document.createElement('td');
    const badge = document.createElement('span');
    badge.className = 'cat-badge';
    badge.style.setProperty('--cat-color', cat.color);
    badge.textContent = cat.label;
    catTd.appendChild(badge);

    const startTd = document.createElement('td');
    startTd.textContent = start.toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
    });

    const endTd = document.createElement('td');
    endTd.textContent = end.toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
    });

    const durTd = document.createElement('td');
    durTd.textContent = formatMinutesAsHM(s.minutes);

    const actionsTd = document.createElement('td');
    actionsTd.className = 'actions';

    const editBtn = document.createElement('button');
    editBtn.className = 'icon-btn';
    editBtn.title = 'Edit';
    editBtn.textContent = '✎';
    editBtn.onclick = () => editSession(s.id);

    const delBtn = document.createElement('button');
    delBtn.className = 'icon-btn';
    delBtn.title = 'Delete';
    delBtn.textContent = '🗑';
    delBtn.onclick = () => deleteSession(s.id);

    actionsTd.append(editBtn, delBtn);
    tr.append(dateTd, catTd, startTd, endTd, durTd, actionsTd);
    tbody.appendChild(tr);
  });
}

function editSession(id) {
  const s = state.data.sessions.find((x) => x.id === id);
  if (!s) return;

  state.editingId = id;
  entrySelectedCategory = s.category;

  const start = new Date(s.startDate);
  const end = new Date(s.endDate);

  document.getElementById('entry-date').value = toDateInputValue(start);
  document.getElementById('entry-start').value = toTimeInputValue(start);
  document.getElementById('entry-end').value = toTimeInputValue(end);
  document.getElementById('entry-next-day').checked = !sameDay(start, end);
  document.getElementById('entry-save').textContent = 'Update entry';
  document.getElementById('entry-cancel-edit').hidden = false;

  switchTab('entry');
  renderEntryTab();
  updateEntryDuration();
}

async function deleteSession(id) {
  if (!confirm('Delete this entry?')) return;
  await persist((d) => {
    d.sessions = d.sessions.filter((s) => s.id !== id);
  }, `Delete session ${id}`);
  renderHistoryTab();
  renderDashboardTab();
}

// ===================== Categories tab =====================

function setupCategoriesTab() {
  setupCategoryAddButton(categoriesChanged);
}

function renderCategoriesTab() {
  renderCategoryRows(
    document.getElementById('categories-list'),
    categoriesChanged,
  );
}

// Called after any category add/edit/delete/reorder to refresh every tab
// that displays category chips or relies on category data.
function categoriesChanged() {
  renderCategoriesTab();
  renderTimerTab();
  renderEntryTab();
  renderDashboardTab();
  renderHistoryTab();
}

// ===================== Settings tab =====================

function setupSettingsForm() {
  const s = ghGetSettings(APP_KEY) || {};
  document.getElementById('settings-token').value = s.token || '';

  document.getElementById('settings-save').onclick = async () => {
    const token = document.getElementById('settings-token').value.trim();
    if (!token) {
      setSettingsStatus('Personal access token is required.', true);
      return;
    }
    const settings = { token, ...REPO_CONFIG };
    ghSaveSettings(APP_KEY, settings);
    updateConfigBanner();
    setSettingsStatus('Testing connection…');
    try {
      await ghTestConnection(APP_KEY);
      setSettingsStatus('Connected - loading data…');
      await loadFromGitHub();
      setSettingsStatus('Connected and synced.');
      setStatus('Synced', 'ok');
      renderAll();
    } catch (e) {
      setSettingsStatus('Error: ' + e.message, true);
    }
  };

  document.getElementById('settings-reload').onclick = async () => {
    setSettingsStatus('Reloading…');
    try {
      await loadFromGitHub();
      setSettingsStatus('Reloaded from GitHub.');
      setStatus('Synced', 'ok');
      renderAll();
    } catch (e) {
      setSettingsStatus('Error: ' + e.message, true);
    }
  };

  document.getElementById('config-banner-link').onclick = () =>
    switchTab('settings');
}
