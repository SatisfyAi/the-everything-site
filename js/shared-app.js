// ===================== Global error reporting =====================
// Surfaces uncaught errors and promise rejections in the sync-status bar,
// which is much easier to read on a phone than the browser console.

window.addEventListener('error', (event) => {
  const file = event.filename || 'unknown file';
  const line = event.lineno || '?';
  const column = event.colno || '?';
  const message = event.message || 'Unknown error';

  console.error(`[${file}:${line}:${column}] ${message}`, event.error);

  try {
    setStatus(
      `Error in ${file} at line ${line}:${column} - ${message}`,
      'error',
    );
  } catch (_) {}
});

window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason;
  const message =
    reason?.message ||
    (typeof reason === 'string' ? reason : 'Unhandled Promise rejection');

  const stackLine = reason?.stack?.split('\n')?.[1]?.trim() || '';

  console.error('Unhandled Promise Rejection:', reason);

  try {
    setStatus(
      `Unhandled Promise Rejection: ${message}${
        stackLine ? ` (${stackLine})` : ''
      }`,
      'error',
    );
  } catch (_) {}
});

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

function cryptoRandomId() {
  if (window.crypto && window.crypto.randomUUID)
    return window.crypto.randomUUID();
  return 'id-' + Date.now() + '-' + Math.random().toString(16).slice(2);
}

// ===================== Status messages =====================

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

function updateConfigBanner() {
  const banner = document.getElementById('config-banner');
  banner.hidden = ghConfigured(APP_KEY);
}

// ===================== GitHub sync =====================
// Relies on each app's own js file defining, before this file's functions
// are called: APP_KEY (string), EMPTY_DATA() (returns a fresh empty data
// object), ITEMS_KEY (string, e.g. 'sessions' or 'entries'), and the global
// `state` object with `state.data` / `state.sha`.

async function loadFromGitHub() {
  const { data, sha } = await ghLoad(APP_KEY, EMPTY_DATA());
  state.data = data;
  state.sha = sha;
  if (!state.data.categories || !state.data.categories.length) {
    state.data.categories = DEFAULT_CATEGORIES.slice();
  }
  if (!state.data[ITEMS_KEY]) state.data[ITEMS_KEY] = [];
}

// Merge strategy used after a save conflict: union items/categories by id/key,
// with local (in-memory) values winning over remote for matching ids/keys.
// Note: if an entry is deleted on one device at the exact moment another device
// pushes an unrelated change, the merge can resurrect the deleted entry. If that
// ever happens, just delete it again.
function mergeData(local, remote) {
  const itemMap = new Map();
  (remote[ITEMS_KEY] || []).forEach((item) => itemMap.set(item.id, item));
  (local[ITEMS_KEY] || []).forEach((item) => itemMap.set(item.id, item));

  const catMap = new Map();
  (remote.categories || []).forEach((c) => catMap.set(c.key, c));
  (local.categories || []).forEach((c) => catMap.set(c.key, c));

  return {
    categories: Array.from(catMap.values()),
    [ITEMS_KEY]: Array.from(itemMap.values()),
  };
}

async function trySave(message, attempts = 3) {
  for (let i = 0; i < attempts; i++) {
    try {
      return await ghSave(APP_KEY, state.data, state.sha, message);
    } catch (e) {
      if (e.conflict && i < attempts - 1) {
        const fresh = await ghLoad(APP_KEY, EMPTY_DATA());
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

  if (!ghConfigured(APP_KEY)) {
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

// ===================== Categories tab: shared row rendering =====================
// Both apps use an identical editable category list (drag handle, color
// picker, hex input, label input, delete button) with drag-and-drop
// reordering. `onAfterChange` is called after any edit/reorder so each app
// can re-render its own app-specific tabs (e.g. Timer tab category chips).

function renderCategoryRows(listEl, onAfterChange) {
  listEl.innerHTML = '';

  state.data.categories.forEach((cat) => {
    const row = document.createElement('div');
    row.className = 'category-row';
    row.draggable = true;
    row.dataset.key = cat.key;

    const handle = document.createElement('span');
    handle.className = 'drag-handle';
    handle.textContent = '⠿';
    handle.title = 'Drag to reorder';

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
      commitCategory(cat.key, { color: colorPicker.value }, onAfterChange);
    };
    hexInput.onchange = () => {
      const v = hexInput.value.trim();
      if (!/^#[0-9a-fA-F]{6}$/.test(v)) {
        hexInput.value = cat.color;
        return;
      }
      colorPicker.value = v;
      commitCategory(cat.key, { color: v }, onAfterChange);
    };
    labelInput.onchange = () => {
      const v = labelInput.value.trim();
      if (v) commitCategory(cat.key, { label: v }, onAfterChange);
      else labelInput.value = cat.label;
    };
    delBtn.onclick = () => deleteCategory(cat.key, onAfterChange);

    // ---- Drag-and-drop reordering ----
    row.addEventListener('dragstart', (e) => {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', cat.key);
      row.classList.add('dragging');
    });
    row.addEventListener('dragend', () => {
      row.classList.remove('dragging');
      listEl
        .querySelectorAll('.category-row')
        .forEach((r) => r.classList.remove('drag-over'));
    });
    row.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      listEl
        .querySelectorAll('.category-row')
        .forEach((r) => r.classList.remove('drag-over'));
      row.classList.add('drag-over');
    });
    row.addEventListener('dragleave', () => {
      row.classList.remove('drag-over');
    });
    row.addEventListener('drop', async (e) => {
      e.preventDefault();
      row.classList.remove('drag-over');
      const fromKey = e.dataTransfer.getData('text/plain');
      const toKey = cat.key;
      if (fromKey === toKey) return;
      await persist((d) => {
        const fromIdx = d.categories.findIndex((c) => c.key === fromKey);
        const toIdx = d.categories.findIndex((c) => c.key === toKey);
        if (fromIdx === -1 || toIdx === -1) return;
        const [moved] = d.categories.splice(fromIdx, 1);
        d.categories.splice(toIdx, 0, moved);
      }, 'Reorder categories');
      onAfterChange();
    });

    row.append(handle, colorPicker, hexInput, labelInput, delBtn);
    listEl.appendChild(row);
  });
}

async function commitCategory(key, changes, onAfterChange) {
  await persist((d) => {
    const c = d.categories.find((c) => c.key === key);
    if (c) Object.assign(c, changes);
  }, `Update category ${key}`);
  onAfterChange();
}

// `itemUsesCategory(item, key)` lets each app define what "in use" means
// (Time Tracker checks session.category, Hydration checks entry.category -
// currently identical, but kept as a hook in case that ever diverges).
async function deleteCategory(key, onAfterChange) {
  const cat = state.data.categories.find((c) => c.key === key);
  if (!cat) return;
  const inUse = state.data[ITEMS_KEY].some((item) => item.category === key);
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
  onAfterChange();
}

function setupCategoryAddButton(onAfterChange) {
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
    onAfterChange();
  };
}

// ===================== Dashboard: period navigation =====================

function setupDashboardNav(downloadPrefix) {
  document.querySelectorAll('.period-btn').forEach((btn) => {
    btn.onclick = () => {
      state.dashboard.period = btn.dataset.period;
      state.dashboard.offset = 0;
      document
        .querySelectorAll('.period-btn')
        .forEach((b) => b.classList.toggle('active', b === btn));
      renderDashboardTab();
    };
  });

  document.getElementById('dashboard-prev').onclick = () => {
    state.dashboard.offset++;
    renderDashboardTab();
  };
  document.getElementById('dashboard-next').onclick = () => {
    if (state.dashboard.offset > 0) {
      state.dashboard.offset--;
      renderDashboardTab();
    }
  };

  document.getElementById('download-donut').onclick = () => {
    const canvas = document.getElementById('donut-canvas');
    const range = getDashboardRange();
    const slug = range.title
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    const link = document.createElement('a');
    link.download = `${downloadPrefix}-${slug}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };
}

// Start-of-period helpers, used for the dashboard range.
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

// Computes { start, end, title } for the current dashboard period + offset.
// start/end are null for "all" (no date filtering).
function getDashboardRange() {
  const { period, offset } = state.dashboard;

  if (period === 'all') {
    return { start: null, end: null, title: 'All time' };
  }

  const base = startOfPeriod(new Date(), period);
  const start = addPeriods(base, period, -offset);
  const end = addPeriods(start, period, 1);
  return { start, end, title: formatRangeTitle(start, end, period) };
}

function formatRangeTitle(start, end, period) {
  if (period === 'day') {
    return start.toLocaleDateString(undefined, {
      weekday: 'short',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  }
  if (period === 'month') {
    return start.toLocaleDateString(undefined, {
      month: 'long',
      year: 'numeric',
    });
  }
  if (period === 'year') {
    return String(start.getFullYear());
  }

  // week: end is exclusive, so the last day shown is end - 1 day
  const lastDay = new Date(end.getTime() - 24 * 3600 * 1000);
  const sameMonth =
    start.getMonth() === lastDay.getMonth() &&
    start.getFullYear() === lastDay.getFullYear();
  const sameYear = start.getFullYear() === lastDay.getFullYear();

  if (sameMonth) {
    return `${start.getDate()} – ${lastDay.getDate()} ${lastDay.toLocaleDateString(undefined, { month: 'long' })} ${lastDay.getFullYear()}`;
  }
  if (sameYear) {
    return `${start.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} – ${lastDay.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} ${lastDay.getFullYear()}`;
  }
  return `${start.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })} – ${lastDay.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}`;
}

// Updates the dashboard's donut chart + range label + nav button states.
// `getTotals(range)` returns a { categoryKey: value } map for the given
// range, letting each app define its own filtering/summing
// (Time Tracker sums minutes by startDate, Hydration sums ml by date).
function renderDashboardCommon(getTotals) {
  const range = getDashboardRange();
  const totals = getTotals(range);

  const segments = state.data.categories.map((c) => ({
    label: c.label,
    color: c.color,
    value: totals[c.key] || 0,
  }));
  drawDonutChart(document.getElementById('donut-canvas'), {
    title: range.title,
    segments,
  });

  document.getElementById('dashboard-range-label').textContent = range.title;

  const isAll = state.dashboard.period === 'all';
  document.getElementById('dashboard-prev').hidden = isAll;
  document.getElementById('dashboard-next').hidden = isAll;
  if (!isAll) {
    document.getElementById('dashboard-next').disabled =
      state.dashboard.offset === 0;
  }
}

// ===================== History tab: month filter =====================

function setupHistoryTab() {
  document.getElementById('history-month-select').onchange = renderHistoryTab;
}

// `getItemDate(item)` extracts the Date used to bucket an item by month
// (Time Tracker: item.startDate, Hydration: item.date).
function getMonthsWithData(getItemDate) {
  const months = new Set(
    state.data[ITEMS_KEY].map((item) => monthKey(getItemDate(item))),
  );
  months.add(monthKey(new Date()));
  return Array.from(months).sort().reverse();
}

// Populates the month <select> and returns the filtered, date-descending
// list of items for the currently selected month (or all items if "All time").
function getFilteredHistoryItems(getItemDate) {
  const monthSelect = document.getElementById('history-month-select');
  const months = getMonthsWithData(getItemDate);
  const current = monthSelect.value || monthKey(new Date());

  monthSelect.innerHTML =
    `<option value="all">All time</option>` +
    months
      .map((m) => `<option value="${m}">${monthLabel(m)}</option>`)
      .join('');
  monthSelect.value = months.includes(current) ? current : 'all';

  const filterMonth = monthSelect.value;
  let items = [...state.data[ITEMS_KEY]];
  if (filterMonth !== 'all') {
    items = items.filter((item) => monthKey(getItemDate(item)) === filterMonth);
  }
  items.sort((a, b) => getItemDate(b) - getItemDate(a));
  return items;
}
