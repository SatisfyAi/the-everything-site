// ===================== Staff & milestones =====================
// Data: S.stf = staff-data.json
//   { staff: [ { id, name, joined: "YYYY-MM-DD", left?: "YYYY-MM-DD" } ] }
//
// Milestones fall on the join date + 6 months, then every full year (1, 2,
// 3 ... years). Nobody gets a milestone after their leave date.
// Reminders on the Today page: 7 days before, 2 days before and on the day.

const REMIND_DAYS = [0, 2, 7];

let stfEditId = null;
let stfFilter = 'current';
let stfRange = '30';
let stfQuery = '';

const isDateKey = (s) =>
	/^\d{4}-\d{2}-\d{2}$/.test(s || '') && !isNaN(new Date(s + 'T00:00'));
const dateOf = (k) => new Date(k + 'T00:00');
const shortDate = (k) =>
	loc(dateOf(k), { weekday: 'short', day: 'numeric', month: 'short' });
const longDate = (k) =>
	loc(dateOf(k), { day: 'numeric', month: 'short', year: 'numeric' });

// "2025-08-31" + 6 months = "2026-02-28" (the day is clamped to the month's end).
function addMonthsKey(k, months) {
	const [y, m, d] = k.split('-').map(Number);
	const t = m - 1 + months;
	const ny = y + Math.floor(t / 12);
	const nm = ((t % 12) + 12) % 12;
	const last = new Date(ny, nm + 1, 0).getDate();
	return `${ny}-${pad(nm + 1)}-${pad(Math.min(d, last))}`;
}

function milestoneLabel(months) {
	if (months === 6) return '6 months';
	const y = months / 12;
	return y === 1 ? '1 year' : `${y} years`;
}

// Milestones of one person falling between two date keys (inclusive).
function personMilestones(p, from, to) {
	const out = [];
	if (!isDateKey(p.joined)) return out;
	for (let k = 0; k < 100; k++) {
		const months = k === 0 ? 6 : 12 * k;
		const date = addMonthsKey(p.joined, months);
		if (date > to || (p.left && date > p.left)) break;
		if (date >= from) out.push({ date, person: p, months });
	}
	return out;
}

function milestonesBetween(from, to) {
	const out = [];
	S.stf.staff.forEach((p) => out.push(...personMilestones(p, from, to)));
	out.sort(
		(a, b) =>
			(a.date < b.date ? -1 : a.date > b.date ? 1 : 0) ||
			a.person.name.localeCompare(b.person.name),
	);
	return out;
}

function nextMilestone(p, from) {
	return personMilestones(p, from, '9999-12-31').slice(0, 1)[0] || null;
}

const isCurrent = (p, today) => !p.left || p.left >= today;

function daysUntil(k) {
	return Math.round((dateOf(k) - sod(new Date())) / 864e5);
}
const inDays = (n) =>
	n === 0 ? 'today' : n === 1 ? 'tomorrow' : `in ${n} days`;

// Whole months between two date keys, shown as "1y 4m" / "5m" / "12d".
function tenure(from, to) {
	const a = dateOf(from);
	const b = dateOf(to);
	let months =
		(b.getFullYear() - a.getFullYear()) * 12 + b.getMonth() - a.getMonth();
	if (b.getDate() < a.getDate()) months--;
	if (months < 0) return '';
	if (months < 1) return `${Math.max(0, Math.round((b - a) / 864e5))}d`;
	const y = Math.floor(months / 12);
	const m = months % 12;
	return y ? `${y}y${m ? ` ${m}m` : ''}` : `${m}m`;
}

/* ---------- Today: milestones under the date ---------- */
// A timeline of the next 7 days (today included). Everything further ahead is
// on the Staff page.
const TODAY_WINDOW = 7;

const whoHtml = (m) =>
	`<span class="rit"><b>${esc(m.person.name)}</b> · ${milestoneLabel(m.months)}</span>`;

// Milestones grouped per date for the next `days` days: [{ date, n, items }]
function milestonesByDay(days) {
	const now = new Date();
	const ms = milestonesBetween(ymd(now), ymd(addD(now, days)));
	const out = [];
	ms.forEach((m) => {
		let g = out[out.length - 1];
		if (!g || g.date !== m.date)
			out.push((g = { date: m.date, n: daysUntil(m.date), items: [] }));
		g.items.push(m);
	});
	return out;
}

function renderStaffToday() {
	const el = $('#stfToday');
	if (!el) return;
	const days = milestonesByDay(TODAY_WINDOW);
	const html = days
		.map(
			(g) =>
				`<div class="tline${g.n === 0 ? ' now' : ''}${REMIND_DAYS.includes(g.n) ? ' rem' : ''}"><i class="tdot"></i><div class="tdate">${esc(shortDate(g.date))}<span class="muted"> · ${inDays(g.n)}</span></div><div class="tnames">${g.items.map(whoHtml).join('')}</div></div>`,
		)
		.join('');
	const wrap = $('#stfWrap');
	if (wrap) wrap.hidden = !html;
	el.innerHTML = html ? `<div class="tl-wrap">${html}</div>` : '';
}

/* ---------- Staff page ---------- */
function stfRangeDates() {
	const now = new Date();
	const today = ymd(now);
	if (stfRange === 'thisMonth') {
		return [today, ymd(new Date(now.getFullYear(), now.getMonth() + 1, 0))];
	}
	if (stfRange === 'nextMonth') {
		return [
			ymd(new Date(now.getFullYear(), now.getMonth() + 1, 1)),
			ymd(new Date(now.getFullYear(), now.getMonth() + 2, 0)),
		];
	}
	return [today, ymd(addD(now, Number(stfRange) || 30))];
}

function renderUpcoming() {
	const [from, to] = stfRangeDates();
	const ms = milestonesBetween(from, to);
	if (!ms.length) {
		$('#stfUpcoming').innerHTML =
			'<div class="empty">No milestones in this period.</div>';
		return;
	}
	let html = '';
	let last = '';
	ms.forEach((m) => {
		if (m.date !== last) {
			last = m.date;
			const n = daysUntil(m.date);
			html += `<div class="mdate">${esc(shortDate(m.date))}<span class="muted"> · ${inDays(n)}</span></div>`;
		}
		html += `<div class="mrow"><span class="mname">${esc(m.person.name)}</span><span class="badge">${milestoneLabel(m.months)}</span></div>`;
	});
	$('#stfUpcoming').innerHTML = html;
}

function renderStaffList() {
	const today = ymd(new Date());
	const q = stfQuery.trim().toLowerCase();
	let list = S.stf.staff.filter((p) => {
		if (q && !p.name.toLowerCase().includes(q)) return false;
		if (stfFilter === 'current') return isCurrent(p, today);
		if (stfFilter === 'former') return !isCurrent(p, today);
		return true;
	});
	list = list.slice().sort((a, b) => a.name.localeCompare(b.name));
	$$('#stfTabs [data-f]').forEach((b) =>
		b.classList.toggle('on', b.dataset.f === stfFilter),
	);
	if (!list.length) {
		$('#stfList').innerHTML = `<div class="empty">${
			S.stf.staff.length
				? 'Nobody matches.'
				: 'No staff yet. Add someone above, or import your list.'
		}</div>`;
		return;
	}
	$('#stfList').innerHTML = list
		.map((p) => {
			const cur = isCurrent(p, today);
			let meta;
			if (cur) {
				const nx = nextMilestone(p, today);
				meta = nx
					? `Next: ${milestoneLabel(nx.months)} · ${longDate(nx.date)} (${inDays(daysUntil(nx.date))})`
					: '';
			} else meta = `Was here ${tenure(p.joined, p.left)}`;
			const sub =
				`Joined ${longDate(p.joined)}` +
				(p.left ? ` · Left ${longDate(p.left)}` : '') +
				(cur && isDateKey(p.joined) ? ` · ${tenure(p.joined, today)} in` : '');
			return `<div class="srow"><div class="sinfo"><b>${esc(p.name)}</b><span class="muted small">${esc(sub)}</span>${meta ? `<span class="small smeta">${esc(meta)}</span>` : ''}</div><button class="x ed" type="button" data-edit="${esc(p.id)}" aria-label="Edit ${esc(p.name)}">✎</button><button class="x del" type="button" data-del="${esc(p.id)}" aria-label="Delete ${esc(p.name)}">×</button></div>`;
		})
		.join('');
}

function renderStaff() {
	renderUpcoming();
	renderStaffList();
}

/* ---------- add / edit ---------- */
function stfMsg(text, isError, id) {
	const el = $(id || '#stfMsg');
	el.textContent = text || '';
	el.className = 'note' + (isError ? ' error' : '');
}

function stfResetForm() {
	stfEditId = null;
	$('#stfName').value = '';
	$('#stfJoined').value = '';
	$('#stfLeft').value = '';
	$('#stfAdd').textContent = 'Add';
	$('#stfCancel').hidden = true;
	$('#stfFormTitle').textContent = 'Add a staff member';
}

function saveStaff() {
	const name = $('#stfName').value.trim();
	const joined = $('#stfJoined').value;
	const left = $('#stfLeft').value;
	if (!name) return stfMsg('Enter a name.', true);
	if (!isDateKey(joined)) return stfMsg('Pick the date they joined.', true);
	if (left && left < joined)
		return stfMsg('The leave date is before the join date.', true);
	const person = { id: stfEditId || cryptoRandomId(), name, joined };
	if (left) person.left = left;
	const editing = !!stfEditId;
	Store.commit(
		'staff',
		(d) => upsertItem(d, 'staff', person),
		`${editing ? 'edit' : 'add'} staff: ${name}`,
	);
	stfResetForm();
	stfMsg(editing ? 'Saved.' : `${name} added.`);
}

function startEdit(id) {
	const p = S.stf.staff.find((x) => x.id === id);
	if (!p) return;
	stfEditId = id;
	$('#stfName').value = p.name;
	$('#stfJoined').value = p.joined || '';
	$('#stfLeft').value = p.left || '';
	$('#stfAdd').textContent = 'Save changes';
	$('#stfCancel').hidden = false;
	$('#stfFormTitle').textContent = 'Edit staff member';
	stfMsg('');
	$('#stfName').scrollIntoView({ behavior: 'smooth', block: 'center' });
	$('#stfName').focus({ preventScroll: true });
}

// Accepts 2025-03-14 and 14.03.2025 / 14/03/2025 (day first).
function parseDateText(s) {
	s = (s || '').trim();
	if (!s) return '';
	if (isDateKey(s)) return s;
	const m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
	if (m) {
		const k = `${m[3]}-${pad(Number(m[2]))}-${pad(Number(m[1]))}`;
		if (isDateKey(k) && dateOf(k).getDate() === Number(m[1])) return k;
	}
	return null;
}

function importList() {
	const lines = $('#stfBulk').value.split('\n');
	const add = [];
	const bad = [];
	let dup = 0;
	lines.forEach((line, i) => {
		if (!line.trim()) return;
		const parts = line.split(/[,;\t]/).map((x) => x.trim());
		const name = parts[0];
		const joined = parseDateText(parts[1]);
		const left = parseDateText(parts[2]);
		if (!name || !joined || left === null || (left && left < joined)) {
			bad.push(i + 1);
			return;
		}
		const same = (x) =>
			x.name.toLowerCase() === name.toLowerCase() && x.joined === joined;
		if (S.stf.staff.some(same) || add.some(same)) {
			dup++;
			return;
		}
		const p = { id: cryptoRandomId(), name, joined };
		if (left) p.left = left;
		add.push(p);
	});
	if (!add.length) {
		stfMsg(
			bad.length
				? `Nothing imported. Check line${bad.length > 1 ? 's' : ''} ${bad.join(', ')}.`
				: dup
					? 'Everyone in the list is already added.'
					: 'Paste a list first.',
			true,
			'#stfBulkMsg',
		);
		return;
	}
	Store.commit(
		'staff',
		(d) => add.forEach((p) => upsertItem(d, 'staff', p)),
		`import ${add.length} staff`,
	);
	let msg = `Imported ${add.length}.`;
	if (dup) msg += ` Skipped ${dup} already added.`;
	if (bad.length)
		msg += ` Couldn't read line${bad.length > 1 ? 's' : ''} ${bad.join(', ')} (kept in the box).`;
	// keep only the lines that failed so they can be fixed and retried
	$('#stfBulk').value = bad.length
		? bad.map((n) => lines[n - 1]).join('\n')
		: '';
	stfMsg(msg, bad.length > 0, '#stfBulkMsg');
}

function staffInit() {
	$('#stfRange').addEventListener('change', (e) => {
		stfRange = e.target.value;
		renderUpcoming();
	});
	$('#stfSearch').addEventListener('input', (e) => {
		stfQuery = e.target.value;
		renderStaffList();
	});
	$('#stfTabs').addEventListener('click', (e) => {
		const b = e.target.closest('[data-f]');
		if (!b) return;
		stfFilter = b.dataset.f;
		renderStaffList();
	});
	$('#stfAdd').addEventListener('click', saveStaff);
	$('#stfCancel').addEventListener('click', () => {
		stfResetForm();
		stfMsg('');
	});
	$('#stfName').addEventListener('keydown', (e) => {
		if (e.key === 'Enter') saveStaff();
	});
	$('#stfBulkAdd').addEventListener('click', importList);
	$('#stfList').addEventListener('click', (e) => {
		const b = e.target.closest('button');
		if (!b) return;
		if (b.dataset.edit) startEdit(b.dataset.edit);
		else if (b.dataset.del && confirmArm(b, 'Delete?')) {
			const id = b.dataset.del;
			if (stfEditId === id) stfResetForm();
			Store.commit(
				'staff',
				(d) => removeItem(d, 'staff', id),
				'delete staff member',
			);
		}
	});
}
