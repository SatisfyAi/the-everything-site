// ===================== Data shapes and defaults =====================
//
// Three JSON files live in the private data repo (names set in js/github.js):
//
//   data.json            Discord time (unchanged format)
//     { categories: [{ key, label, color }],
//       sessions:   [{ id, category, startDate, endDate, minutes, note? }] }
//
//   hydration-data.json  Hydration (unchanged, plus a "settings" block)
//     { categories: [{ key, label, color }],
//       entries:    [{ id, category, date, amount }],
//       settings:   { goal, amounts: { <categoryKey>: ml } } }
//
//   clock-data.json      Job clock (new)
//     { settings: { startShift, endShift, dayTarget },
//       days:     { "YYYY-MM-DD": { s, ls, le, e } } }     // "HH:MM" strings

const DEFAULT_WORK_CATEGORIES = [
	{ key: 'Notion', label: 'Notion and Tracking', color: '#f0c808' },
	{ key: 'Recruitment', label: 'Recruitment and Onboarding', color: '#ff5e8a' },
	{ key: 'Admin', label: 'Admin and Communication', color: '#7b6cff' },
	{ key: 'Staff', label: 'Staff Management', color: '#ff9f1c' },
	{ key: 'Reporting', label: 'Reporting', color: '#3b82f6' },
	{ key: 'Misc', label: 'Miscellaneous', color: '#9aa0a6' },
];

const DEFAULT_DRINKS = [
	{ key: 'Water', label: 'Water', color: '#4fc3f7' },
	{ key: 'Milk', label: 'Milk', color: '#e0e0e0' },
	{ key: 'Tea', label: 'Tea', color: '#81c784' },
	{ key: 'Juice', label: 'Juice', color: '#ffb74d' },
	{ key: 'Soda', label: 'Soda', color: '#ba68c8' },
	{ key: 'Coffee', label: 'Coffee', color: '#6f4e37' },
];

// Amount logged by one tap on a drink (editable in Settings).
const DEFAULT_TAP = {
	Water: 250,
	Tea: 200,
	Juice: 200,
	Milk: 200,
	Coffee: 150,
	Soda: 330,
};
const DEFAULT_TAP_FALLBACK = 250;
const HYDRATION_PRESETS = [200, 400, 500, 1000, 1500, 2000];

const DEFAULT_CLOCK_SETTINGS = { startShift: 5, endShift: -5, dayTarget: 480 };

const EMPTY_FILE = {
	work: () => ({ categories: clone(DEFAULT_WORK_CATEGORIES), sessions: [] }),
	hydration: () => ({
		categories: clone(DEFAULT_DRINKS),
		entries: [],
		settings: { goal: 2000, amounts: clone(DEFAULT_TAP) },
	}),
	clock: () => ({ settings: clone(DEFAULT_CLOCK_SETTINGS), days: {} }),
};

// Which list inside each file holds the records.
const ITEMS_KEY = { work: 'sessions', hydration: 'entries' };

// Fills in anything missing (new file, older file format) without touching
// what is there. Mutates and returns `data`.
function normalizeFile(name, data) {
	const d = data && typeof data === 'object' ? data : {};
	if (name === 'work') {
		if (!Array.isArray(d.categories) || !d.categories.length)
			d.categories = clone(DEFAULT_WORK_CATEGORIES);
		if (!Array.isArray(d.sessions)) d.sessions = [];
	} else if (name === 'hydration') {
		if (!Array.isArray(d.categories) || !d.categories.length)
			d.categories = clone(DEFAULT_DRINKS);
		if (!Array.isArray(d.entries)) d.entries = [];
		if (!d.settings || typeof d.settings !== 'object') d.settings = {};
		if (!(Number(d.settings.goal) > 0)) d.settings.goal = 2000;
		if (!d.settings.amounts || typeof d.settings.amounts !== 'object')
			d.settings.amounts = clone(DEFAULT_TAP);
	} else if (name === 'clock') {
		if (!d.settings || typeof d.settings !== 'object') d.settings = {};
		['startShift', 'endShift', 'dayTarget'].forEach((k) => {
			if (typeof d.settings[k] !== 'number' || isNaN(d.settings[k]))
				d.settings[k] = DEFAULT_CLOCK_SETTINGS[k];
		});
		if (!d.days || typeof d.days !== 'object' || Array.isArray(d.days))
			d.days = {};
	}
	return d;
}

// Short, stable-ish unique key for a new category, derived from its label.
function categoryKeyFromLabel(label, existingKeys) {
	const base =
		label
			.trim()
			.replace(/[^a-zA-Z0-9]+/g, '')
			.slice(0, 16) || 'Category';
	let key = base;
	let i = 2;
	while (existingKeys.includes(key)) {
		key = base + i;
		i++;
	}
	return key;
}
