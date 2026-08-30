// ===================== State =====================

const APP_KEY = 'hydrationtracker';
const ITEMS_KEY = 'entries';
const PRESET_AMOUNTS = [100, 200, 400, 500, 800, 1000];

// Repo details are fixed since they won't change device to device.
// >>> EDIT THESE THREE VALUES to match your own GitHub repo <<<
const REPO_CONFIG = {
	owner: 'SatisfyAi',
	repo: 'the-everything-site_data',
	branch: 'main',
	path: 'hydration-data.json',
};

function EMPTY_DATA() {
	return { categories: DEFAULT_CATEGORIES.slice(), entries: [] };
}

const state = {
	data: EMPTY_DATA(),
	sha: null,
	dashboard: { period: 'day', offset: 0 },
	editingId: null,
};

let entrySelectedCategory = null;
let entryAmount = null;

// Formats a millilitre amount for display.
// Plain ml below 1000 (e.g. "250ml"); switches to litres with one decimal
// at 1000+ (e.g. "1.2L"), which keeps large daily/weekly/yearly totals readable.
function formatMl(totalMl) {
	const rounded = Math.round(totalMl);
	if (rounded < 1000) return `${rounded}ml`;
	return `${(rounded / 1000).toFixed(1)}L`;
}

// Hydration entries are dated by their logged timestamp.
function getItemDate(entry) {
	return new Date(entry.date);
}

// ===================== Init =====================
// (Global error reporting lives in shared-app.js)

document.addEventListener('DOMContentLoaded', init);

async function init() {
	setupTabs();
	setupSettingsForm();
	setupEntryTab();
	setupDashboardNav('Hydration');
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
}

function renderAll() {
	renderEntryTab();
	renderDashboardTab();
	renderHistoryTab();
	renderCategoriesTab();
}

// ===================== Add / edit entry tab =====================

function setupEntryTab() {
	document.getElementById('entry-date').valueAsDate = new Date();
	document.getElementById('entry-time').value = toTimeInputValue(new Date());

	renderPresetButtons();

	document.getElementById('entry-amount').addEventListener('input', (e) => {
		entryAmount = e.target.value ? Number(e.target.value) : null;
		updatePresetSelection();
	});

	document.getElementById('entry-save').onclick = saveManualEntry;
	document.getElementById('entry-cancel-edit').onclick = resetEntryForm;
}

function renderPresetButtons() {
	const container = document.getElementById('entry-presets');
	container.innerHTML = '';
	PRESET_AMOUNTS.forEach((amount) => {
		const btn = document.createElement('button');
		btn.type = 'button';
		btn.className = 'preset-chip';
		btn.textContent = `${amount}ml`;
		btn.dataset.amount = String(amount);
		btn.onclick = () => {
			entryAmount = amount;
			document.getElementById('entry-amount').value = amount;
			updatePresetSelection();
		};
		container.appendChild(btn);
	});
}

function updatePresetSelection() {
	document.querySelectorAll('.preset-chip').forEach((btn) => {
		btn.classList.toggle(
			'selected',
			Number(btn.dataset.amount) === entryAmount,
		);
	});
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

async function saveManualEntry() {
	const dateStr = document.getElementById('entry-date').value;
	const timeStr = document.getElementById('entry-time').value;
	const amountInput = document.getElementById('entry-amount').value;
	const amount = amountInput ? Number(amountInput) : null;

	if (!dateStr || !timeStr || !entrySelectedCategory) {
		setStatus('Fill in category, date and time.', 'error');
		return;
	}
	if (!amount || amount <= 0) {
		setStatus('Enter an amount greater than 0ml, or pick a preset.', 'error');
		return;
	}

	const when = new Date(`${dateStr}T${timeStr}`);

	if (state.editingId) {
		const id = state.editingId;
		await persist((d) => {
			const idx = d.entries.findIndex((e) => e.id === id);
			if (idx >= 0) {
				d.entries[idx] = {
					id,
					category: entrySelectedCategory,
					date: when.toISOString(),
					amount,
				};
			}
		}, `Edit entry ${id}`);
		resetEntryForm();
	} else {
		const entry = {
			id: cryptoRandomId(),
			category: entrySelectedCategory,
			date: when.toISOString(),
			amount,
		};
		await persist((d) => d.entries.push(entry), `Add entry: ${entry.category}`);

		// Reset amount only, keep category/date/time so logging several drinks in a row is fast.
		entryAmount = null;
		document.getElementById('entry-amount').value = '';
		updatePresetSelection();
		document.getElementById('entry-date').valueAsDate = new Date();
		document.getElementById('entry-time').value = toTimeInputValue(new Date());
	}

	renderDashboardTab();
	renderHistoryTab();
}

function resetEntryForm() {
	state.editingId = null;
	entryAmount = null;
	document.getElementById('entry-save').textContent = 'Save entry';
	document.getElementById('entry-cancel-edit').hidden = true;
	document.getElementById('entry-date').valueAsDate = new Date();
	document.getElementById('entry-time').value = toTimeInputValue(new Date());
	document.getElementById('entry-amount').value = '';
	updatePresetSelection();
}

// ===================== Dashboard tab =====================

function renderDashboardTab() {
	renderDashboardCommon(
		(range) => {
			const totals = {};
			state.data.entries.forEach((e) => {
				const d = getItemDate(e);
				if (range.start && (d < range.start || d >= range.end)) return;
				totals[e.category] = (totals[e.category] || 0) + e.amount;
			});
			return totals;
		},
		{ formatTotal: formatMl, innerRadiusRatio: 0 },
	);
}

// ===================== History tab =====================

function renderHistoryTab() {
	const entries = getFilteredHistoryItems(getItemDate);

	const catMap = {};
	state.data.categories.forEach((c) => (catMap[c.key] = c));

	const tbody = document.getElementById('history-tbody');
	tbody.innerHTML = '';

	if (entries.length === 0) {
		tbody.innerHTML = `<tr><td colspan="5" class="empty">No entries for this period.</td></tr>`;
		return;
	}

	entries.forEach((e) => {
		const cat = catMap[e.category] || { label: e.category, color: '#666666' };
		const when = new Date(e.date);

		const tr = document.createElement('tr');

		const dateTd = document.createElement('td');
		dateTd.textContent = when.toLocaleDateString(undefined, {
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

		const timeTd = document.createElement('td');
		timeTd.textContent = when.toLocaleTimeString(undefined, {
			hour: '2-digit',
			minute: '2-digit',
		});

		const amountTd = document.createElement('td');
		amountTd.textContent = formatMl(e.amount);

		const actionsTd = document.createElement('td');
		actionsTd.className = 'actions';

		const editBtn = document.createElement('button');
		editBtn.className = 'icon-btn';
		editBtn.title = 'Edit';
		editBtn.textContent = '✎';
		editBtn.onclick = () => editEntry(e.id);

		const delBtn = document.createElement('button');
		delBtn.className = 'icon-btn';
		delBtn.title = 'Delete';
		delBtn.textContent = '🗑';
		delBtn.onclick = () => deleteEntry(e.id);

		actionsTd.append(editBtn, delBtn);
		tr.append(dateTd, catTd, timeTd, amountTd, actionsTd);
		tbody.appendChild(tr);
	});
}

function editEntry(id) {
	const e = state.data.entries.find((x) => x.id === id);
	if (!e) return;

	state.editingId = id;
	entrySelectedCategory = e.category;
	entryAmount = e.amount;

	const when = new Date(e.date);

	document.getElementById('entry-date').value = toDateInputValue(when);
	document.getElementById('entry-time').value = toTimeInputValue(when);
	document.getElementById('entry-amount').value = e.amount;
	document.getElementById('entry-save').textContent = 'Update entry';
	document.getElementById('entry-cancel-edit').hidden = false;

	switchTab('entry');
	renderEntryTab();
	updatePresetSelection();
}

async function deleteEntry(id) {
	if (!confirm('Delete this entry?')) return;
	await persist((d) => {
		d.entries = d.entries.filter((e) => e.id !== id);
	}, `Delete entry ${id}`);
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
