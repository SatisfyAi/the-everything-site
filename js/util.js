// ===================== Shared helpers =====================
// Plain globals (no build step), like the rest of the site.

const $ = (sel, root) => (root || document).querySelector(sel);
const $$ = (sel, root) =>
	Array.prototype.slice.call((root || document).querySelectorAll(sel));

const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) =>
	`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const ymKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
const hm = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const sod = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addD = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const mondayOf = (d) => {
	const s = sod(d);
	return addD(s, -((s.getDay() + 6) % 7));
};
const toMin = (h) => {
	if (!h) return null;
	const p = h.split(':');
	return Number(p[0]) * 60 + Number(p[1]);
};
const clone = (x) => (x == null ? x : JSON.parse(JSON.stringify(x)));
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const loc = (d, opts) => d.toLocaleDateString('en-GB', opts);

function cryptoRandomId() {
	if (window.crypto && window.crypto.randomUUID)
		return window.crypto.randomUUID();
	return 'id-' + Date.now() + '-' + Math.random().toString(16).slice(2);
}

function esc(s) {
	return String(s).replace(
		/[&<>"']/g,
		(c) =>
			({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
				c
			],
	);
}

// 45 -> "45m", 60 -> "1h", 90 -> "1h 30m"
function formatMinutesAsHM(totalMinutes) {
	const rounded = Math.round(totalMinutes);
	if (rounded <= 0) return '0m';
	const h = Math.floor(rounded / 60);
	const m = rounded % 60;
	if (h === 0) return `${m}m`;
	if (m === 0) return `${h}h`;
	return `${h}h ${m}m`;
}

function formatSignedMinutes(m) {
	return (m >= 0 ? '+' : '−') + formatMinutesAsHM(Math.abs(m));
}

// 250 -> "250ml", 1250 -> "1.25L"
function formatMl(totalMl) {
	const rounded = Math.round(totalMl);
	if (rounded < 1000) return `${rounded}ml`;
	return `${Number((rounded / 1000).toFixed(2))}L`;
}

function formatHMS(totalSeconds) {
	const h = Math.floor(totalSeconds / 3600);
	const m = Math.floor((totalSeconds % 3600) / 60);
	const s = totalSeconds % 60;
	return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

// Accepts "#abc" or "#aabbcc"; anything else becomes a neutral grey.
function normHex(c) {
	if (typeof c !== 'string') return '#9aa0a6';
	let v = c.trim();
	if (/^#[0-9a-fA-F]{3}$/.test(v)) {
		v = '#' + v[1] + v[1] + v[2] + v[2] + v[3] + v[3];
	}
	return /^#[0-9a-fA-F]{6}$/.test(v) ? v.toLowerCase() : '#9aa0a6';
}

// Readable text colour (dark or light) for a given background colour.
function textOn(hex) {
	const h = normHex(hex);
	const r = parseInt(h.slice(1, 3), 16);
	const g = parseInt(h.slice(3, 5), 16);
	const b = parseInt(h.slice(5, 7), 16);
	return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? '#111111' : '#ffffff';
}

// Replaces a <select>'s options but keeps the current choice if it still exists.
function setOptions(sel, items) {
	const prev = sel.value;
	sel.innerHTML = items
		.map((i) => `<option value="${esc(i.value)}">${esc(i.label)}</option>`)
		.join('');
	if (items.some((i) => i.value === prev)) sel.value = prev;
}

// Two-tap confirm: the first tap arms the button ("Delete?"), the second confirms.
function confirmArm(btn, text) {
	if (btn.classList.contains('arm')) return true;
	const label = btn.textContent;
	btn.classList.add('arm');
	btn.textContent = text || 'Delete?';
	setTimeout(() => {
		if (btn.isConnected) {
			btn.classList.remove('arm');
			btn.textContent = label;
		}
	}, 2600);
	return false;
}

// Adds or replaces an item (matched by id) inside d[listKey].
function upsertItem(d, listKey, item) {
	const list = d[listKey] || (d[listKey] = []);
	const i = list.findIndex((x) => x.id === item.id);
	if (i >= 0) list[i] = item;
	else list.push(item);
}

function removeItem(d, listKey, id) {
	d[listKey] = (d[listKey] || []).filter((x) => x.id !== id);
}
