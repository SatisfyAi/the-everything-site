// ===================== State =====================

const state = {
  data: { categories: DEFAULT_CATEGORIES.slice(), sessions: [] },
  sha: null,
  dashboardMonth: monthKey(new Date()),
  comparison: { period: 'week', offset: 0 },
  barChart: null,
  editingId: null,
};

let timerSelectedCategory = null;
let entrySelectedCategory = null;

// ===================== Init =====================

document.addEventListener('DOMContentLoaded', init);

async function init() {
  setupTabs();
  setupSettingsForm();
  setupTimerTab();
  setupEntryTab();
  setupDashboardNav();
  setupHistoryTab();
  setupCategoriesTab();
  updateConfigBanner();

  if (ghConfigured()) {
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

function updateConfigBanner() {
  const banner = document.getElementById('config-banner');
  banner.hidden = ghConfigured();
}

// ===================== Date / format helpers =====================

function monthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(mk) {
  const [y, m] = mk.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  });
}

function toDateInputValue(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function toTimeInputValue(date) {
  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

function sameDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

// ===================== Status / sync =====================

let statusTimeout;
function setStatus(message, type = 'info') {
  const el = document.getElementById('sync-status');
  el.textContent = message;
  el.className = 'sync-status ' + type;
  clearTimeout(statusTimeout);
  if (type === 'ok') {
    statusTimeout = setTimeout(() => {
      el.textContent = '';
      el.className = 'sync-status';
    }, 3000);
  }
}

function setSettingsStatus(message, isError = false) {
  const el = document.getElementById('settings-status');
  el.textContent = message;
  el.className = isError ? 'settings-status error' : 'settings-status';
}

async function loadFromGitHub() {
  const { data, sha } = await ghLoad();
  state.data = data;
  state.sha = sha;
  if (!state.data.categories || !state.data.categories.length) {
    state.data.categories = DEFAULT_CATEGORIES.slice();
  }
}

// Merge strategy used after a save conflict: union sessions/categories by id/key,
// with local (in-memory) values winning over remote for matching ids/keys.
// Note: if an entry is deleted on one device at the exact moment another device
// pushes an unrelated change, the merge can resurrect the deleted entry. If that
// ever happens, just delete it again.
function mergeData(local, remote) {
  const sessionMap = new Map();
  (remote.sessions || []).forEach((s) => sessionMap.set(s.id, s));
  (local.sessions || []).forEach((s) => sessionMap.set(s.id, s));

  const catMap = new Map();
  (remote.categories || []).forEach((c) => catMap.set(c.key, c));
  (local.categories || []).forEach((c) => catMap.set(c.key, c));

  return {
    categories: Array.from(catMap.values()),
    sessions: Array.from(sessionMap.values()),
  };
}

async function trySave(message, attempts = 3) {
  for (let i = 0; i < attempts; i++) {
    try {
      return await ghSave(state.data, state.sha, message);
    } catch (e) {
      if (e.conflict && i < attempts - 1) {
        const fresh = await ghLoad();
        state.data = mergeData(state.data, fresh.data);
        state.sha = fresh.sha;
        continue;
      }
      throw e;
    }
  }
}

// Applies a local mutation, re-renders optimistically, then syncs to GitHub
// (with conflict-merge retries). If GitHub isn't configured, the change is
// kept locally only (in memory for this session).
async function persist(mutateFn, message) {
  mutateFn(state.data);

  if (!ghConfigured()) {
    setStatus(
      'Not synced - set up GitHub in Settings to save permanently.',
      'warn',
    );
    return;
  }

  setStatus('Saving…', 'busy');
  try {
    state.sha = await trySave(message);
    setStatus('Saved', 'ok');
  } catch (e) {
    setStatus('Save failed: ' + e.message, 'error');
  }
}

// ===================== Tabs =====================

function setupTabs() {
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.onclick = () => switchTab(btn.dataset.tab);
  });
}

function switchTab(tab) {
  document
    .querySelectorAll('.tab-btn')
    .forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  document
    .querySelectorAll('.tab-panel')
    .forEach((p) => p.classList.toggle('active', p.id === 'tab-' + tab));
}

function renderAll() {
  renderTimerTab();
  renderEntryTab();
  renderDashboardTab();
  renderHistoryTab();
  renderCategoriesTab();
}

// ===================== Category picker (shared widget) =====================

function renderCategoryPicker(
  container,
  selectedKey,
  onSelect,
  disabled = false,
) {
  container.innerHTML = '';
  state.data.categories.forEach((cat) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'cat-chip' + (cat.key === selectedKey ? ' selected' : '');
    btn.style.setProperty('--cat-color', cat.color);
    btn.textContent = cat.label;
    btn.disabled = disabled;
    btn.onclick = () => onSelect(cat.key);
    container.appendChild(btn);
  });
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
    const session = timerStop();
    if (session) {
      await persist(
        (d) => d.sessions.push(session),
        `Add session: ${session.category}`,
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
  out.textContent = `${formatMinutesAsHM(minutes)} (${minutes} min)`;
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

// ===================== Dashboard tab =====================

function setupDashboardNav() {
  document.getElementById('dashboard-prev-month').onclick = () => {
    const [y, m] = state.dashboardMonth.split('-').map(Number);
    state.dashboardMonth = monthKey(new Date(y, m - 2, 1));
    renderDashboardTab();
    renderHistoryTab();
  };
  document.getElementById('dashboard-next-month').onclick = () => {
    const [y, m] = state.dashboardMonth.split('-').map(Number);
    state.dashboardMonth = monthKey(new Date(y, m, 1));
    renderDashboardTab();
    renderHistoryTab();
  };
  document.getElementById('download-donut').onclick = () => {
    const canvas = document.getElementById('donut-canvas');
    const link = document.createElement('a');
    link.download = `TT-${state.dashboardMonth}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  document.querySelectorAll('.period-btn').forEach((btn) => {
    btn.onclick = () => {
      state.comparison.period = btn.dataset.period;
      state.comparison.offset = 0;
      document
        .querySelectorAll('.period-btn')
        .forEach((b) => b.classList.toggle('active', b === btn));
      renderComparisonChart();
    };
  });
  document.getElementById('comparison-prev').onclick = () => {
    state.comparison.offset++;
    renderComparisonChart();
  };
  document.getElementById('comparison-next').onclick = () => {
    if (state.comparison.offset > 0) {
      state.comparison.offset--;
      renderComparisonChart();
    }
  };
}

function renderDashboardTab() {
  const [y, m] = state.dashboardMonth.split('-').map(Number);
  const monthStart = new Date(y, m - 1, 1);
  const monthEnd = new Date(y, m, 1);

  document.getElementById('dashboard-month-label').textContent = monthLabel(
    state.dashboardMonth,
  );

  const totals = {};
  state.data.sessions.forEach((s) => {
    const d = new Date(s.startDate);
    if (d >= monthStart && d < monthEnd) {
      totals[s.category] = (totals[s.category] || 0) + s.minutes;
    }
  });

  const segments = state.data.categories.map((c) => ({
    label: c.label,
    color: c.color,
    value: totals[c.key] || 0,
  }));
  drawDonutChart(document.getElementById('donut-canvas'), {
    title: monthLabel(state.dashboardMonth),
    segments,
  });

  renderComparisonChart();
}

// ----- Comparison chart -----

const PERIOD_COUNTS = { day: 7, week: 8, month: 12, year: 5 };

function startOfPeriod(date, period) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  if (period === 'week') {
    const dow = (d.getDay() + 6) % 7; // 0 = Monday
    d.setDate(d.getDate() - dow);
  } else if (period === 'month') {
    d.setDate(1);
  } else if (period === 'year') {
    d.setMonth(0, 1);
  }
  return d;
}

function addPeriods(date, period, n) {
  const d = new Date(date);
  if (period === 'day') d.setDate(d.getDate() + n);
  else if (period === 'week') d.setDate(d.getDate() + n * 7);
  else if (period === 'month') d.setMonth(d.getMonth() + n);
  else if (period === 'year') d.setFullYear(d.getFullYear() + n);
  return d;
}

function periodLabel(date, period) {
  if (period === 'day')
    return date.toLocaleDateString(undefined, {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    });
  if (period === 'week')
    return date.toLocaleDateString(undefined, {
      day: 'numeric',
      month: 'short',
    });
  if (period === 'month')
    return date.toLocaleDateString(undefined, {
      month: 'short',
      year: '2-digit',
    });
  return String(date.getFullYear());
}

function renderComparisonChart() {
  const period = state.comparison.period;
  const count = PERIOD_COUNTS[period];
  const base = startOfPeriod(new Date(), period);

  const buckets = [];
  for (let i = 0; i < count; i++) {
    const stepsBack = state.comparison.offset * count + (count - 1 - i);
    const periodStart = addPeriods(base, period, -stepsBack);
    const periodEnd = addPeriods(periodStart, period, 1);

    const totals = {};
    state.data.sessions.forEach((s) => {
      const d = new Date(s.startDate);
      if (d >= periodStart && d < periodEnd) {
        totals[s.category] = (totals[s.category] || 0) + s.minutes;
      }
    });
    buckets.push({ label: periodLabel(periodStart, period), totals });
  }

  state.barChart = renderBarChart(
    document.getElementById('bar-canvas'),
    state.data.categories,
    buckets,
    state.barChart,
  );

  const first = buckets[0];
  const last = buckets[buckets.length - 1];
  document.getElementById('comparison-range-label').textContent =
    `${first.label} – ${last.label}`;
  document.getElementById('comparison-next').disabled =
    state.comparison.offset === 0;
}

// ===================== History tab =====================

function setupHistoryTab() {
  document.getElementById('history-month-select').onchange = renderHistoryTab;
}

function getMonthsWithData() {
  const months = new Set(
    state.data.sessions.map((s) => monthKey(new Date(s.startDate))),
  );
  months.add(state.dashboardMonth);
  return Array.from(months).sort().reverse();
}

function renderHistoryTab() {
  const monthSelect = document.getElementById('history-month-select');
  const months = getMonthsWithData();
  const current = monthSelect.value || state.dashboardMonth;

  monthSelect.innerHTML =
    `<option value="all">All time</option>` +
    months
      .map((m) => `<option value="${m}">${monthLabel(m)}</option>`)
      .join('');
  monthSelect.value = months.includes(current) ? current : 'all';

  const filterMonth = monthSelect.value;
  let sessions = [...state.data.sessions];
  if (filterMonth !== 'all') {
    sessions = sessions.filter(
      (s) => monthKey(new Date(s.startDate)) === filterMonth,
    );
  }
  sessions.sort((a, b) => new Date(b.startDate) - new Date(a.startDate));

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
  document.getElementById('add-category-btn').onclick = async () => {
    const labelInput = document.getElementById('new-category-label');
    const colorInput = document.getElementById('new-category-color');
    const label = labelInput.value.trim();
    if (!label) {
      setStatus('Enter a name for the new category.', 'error');
      return;
    }
    const key = categoryKeyFromLabel(
      label,
      state.data.categories.map((c) => c.key),
    );
    await persist(
      (d) => d.categories.push({ key, label, color: colorInput.value }),
      `Add category ${key}`,
    );
    labelInput.value = '';
    renderCategoriesTab();
    renderTimerTab();
    renderEntryTab();
  };
}

function renderCategoriesTab() {
  const list = document.getElementById('categories-list');
  list.innerHTML = '';

  state.data.categories.forEach((cat) => {
    const row = document.createElement('div');
    row.className = 'category-row';

    const colorPicker = document.createElement('input');
    colorPicker.type = 'color';
    colorPicker.className = 'cat-color-picker';
    colorPicker.value = cat.color;

    const hexInput = document.createElement('input');
    hexInput.type = 'text';
    hexInput.className = 'cat-hex-input';
    hexInput.value = cat.color;
    hexInput.maxLength = 7;

    const labelInput = document.createElement('input');
    labelInput.type = 'text';
    labelInput.className = 'cat-label-input';
    labelInput.value = cat.label;

    const delBtn = document.createElement('button');
    delBtn.className = 'icon-btn';
    delBtn.title = 'Delete category';
    delBtn.textContent = '🗑';

    colorPicker.oninput = () => {
      hexInput.value = colorPicker.value;
      commitCategory(cat.key, { color: colorPicker.value });
    };
    hexInput.onchange = () => {
      const v = hexInput.value.trim();
      if (!/^#[0-9a-fA-F]{6}$/.test(v)) {
        hexInput.value = cat.color;
        return;
      }
      colorPicker.value = v;
      commitCategory(cat.key, { color: v });
    };
    labelInput.onchange = () => {
      const v = labelInput.value.trim();
      if (v) commitCategory(cat.key, { label: v });
      else labelInput.value = cat.label;
    };
    delBtn.onclick = () => deleteCategory(cat.key);

    row.append(colorPicker, hexInput, labelInput, delBtn);
    list.appendChild(row);
  });
}

async function commitCategory(key, changes) {
  await persist((d) => {
    const c = d.categories.find((c) => c.key === key);
    if (c) Object.assign(c, changes);
  }, `Update category ${key}`);
  renderDashboardTab();
  renderHistoryTab();
  renderTimerTab();
  renderEntryTab();
}

async function deleteCategory(key) {
  const cat = state.data.categories.find((c) => c.key === key);
  if (!cat) return;
  const inUse = state.data.sessions.some((s) => s.category === key);
  if (inUse) {
    alert(
      `"${cat.label}" is used by existing entries, so it can't be deleted. You can still rename it or change its color.`,
    );
    return;
  }
  if (!confirm(`Delete category "${cat.label}"?`)) return;
  await persist((d) => {
    d.categories = d.categories.filter((c) => c.key !== key);
  }, `Delete category ${key}`);
  renderCategoriesTab();
  renderTimerTab();
  renderEntryTab();
}

// ===================== Settings tab =====================

function setupSettingsForm() {
  const s = ghGetSettings() || {};
  document.getElementById('settings-token').value = s.token || '';
  document.getElementById('settings-owner').value = s.owner || '';
  document.getElementById('settings-repo').value = s.repo || '';
  document.getElementById('settings-path').value = s.path || 'data.json';
  document.getElementById('settings-branch').value = s.branch || 'main';

  document.getElementById('settings-save').onclick = async () => {
    const settings = {
      token: document.getElementById('settings-token').value.trim(),
      owner: document.getElementById('settings-owner').value.trim(),
      repo: document.getElementById('settings-repo').value.trim(),
      path:
        document.getElementById('settings-path').value.trim() || 'data.json',
      branch: document.getElementById('settings-branch').value.trim() || 'main',
    };
    if (!settings.token || !settings.owner || !settings.repo) {
      setSettingsStatus('Token, owner and repo are required.', true);
      return;
    }
    ghSaveSettings(settings);
    updateConfigBanner();
    setSettingsStatus('Testing connection…');
    try {
      await ghTestConnection();
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
