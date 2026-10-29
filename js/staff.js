// ===================== Staff & milestones =====================
// Data: S.stf = staff-data.json
//   { staff: [ { id, name, joined: "YYYY-MM-DD", left?: "YYYY-MM-DD",
//                discord?, reddit?, discordId? } ] }
// discord / reddit are usernames (no @ or u/ needed, stored as typed minus any
// leading "@" / "u/"); discordId is the numeric Discord user ID. The monthly
// report generator reads these from staff-data.json.
//
// Milestones fall on the join date + 6 months, then every full year (1, 2,
// 3 ... years). Nobody gets a milestone after their leave date.
// Reminders on the Today page: 7 days before, 2 days before and on the day.

const REMIND_DAYS = [0, 2, 7];

let stfEditId = null;
let stfFilter = 'current';
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

// Usernames are stored without the "@" / "u/" prefix, so the generator and the
// list can add whatever each platform needs.
const cleanDiscord = (s) => (s || '').trim().replace(/^@+/, '');
const cleanReddit = (s) =>
	(s || '')
		.trim()
		.replace(/^\/?u\//i, '')
		.replace(/^@+/, '');
const cleanDiscordId = (s) => (s || '').trim();
const isDiscordId = (s) => /^\d{15,22}$/.test(s);

// Adds the optional account fields to a person object (only when filled in).
function withAccounts(person, discord, reddit, discordId) {
	if (discord) person.discord = discord;
	if (reddit) person.reddit = reddit;
	if (discordId) person.discordId = discordId;
	return person;
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
function renderStaffList() {
	const today = ymd(new Date());
	const q = stfQuery.trim().toLowerCase();
	let list = S.stf.staff.filter((p) => {
		if (
			q &&
			![p.name, p.discord, p.reddit, p.discordId].some((v) =>
				(v || '').toLowerCase().includes(q),
			)
		)
			return false;
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
			const accounts = [
				p.discord ? `Discord: ${p.discord}` : '',
				p.reddit ? `Reddit: u/${p.reddit}` : '',
			]
				.filter(Boolean)
				.join(' · ');
			return `<div class="srow"><div class="sinfo"><b>${esc(p.name)}</b><span class="muted small">${esc(sub)}</span>${accounts ? `<span class="muted small">${esc(accounts)}</span>` : ''}${meta ? `<span class="small smeta">${esc(meta)}</span>` : ''}</div><button class="x ed" type="button" data-edit="${esc(p.id)}" aria-label="Edit ${esc(p.name)}">✎</button><button class="x del" type="button" data-del="${esc(p.id)}" aria-label="Delete ${esc(p.name)}">×</button></div>`;
		})
		.join('');
}

/* ---------- Share image: one month of milestones ---------- */
// A picture for the team leads (calendar on top, the people under each date).
// It is an SVG shown in the page; "Download image" turns it into a PNG with
// the same exporter the pie charts use.
const STF_FONT = "-apple-system, 'Segoe UI', system-ui, Roboto, sans-serif";
const STF_SHARE_COL = { half: '#f0c808', year: '#8b7dff' };

function stfShareMonths() {
	const now = new Date();
	return [0, 1, 2].map((i) => {
		const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
		return {
			i,
			d,
			label: d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }),
		};
	});
}

function stfShareSvg(offset) {
	const now = new Date();
	const first = new Date(now.getFullYear(), now.getMonth() + offset, 1);
	const y = first.getFullYear();
	const mo = first.getMonth();
	const days = new Date(y, mo + 1, 0).getDate();
	const ms = milestonesBetween(ymd(first), ymd(new Date(y, mo, days)));
	const byDate = {};
	ms.forEach((m) => (byDate[m.date] = byDate[m.date] || []).push(m));
	const dates = Object.keys(byDate).sort();
	const people = new Set(ms.map((m) => m.person.id)).size;

	const W = 720;
	const P = 36;
	const ctx = _chartMeasureCtx;
	const measure = (txt, font) => {
		ctx.font = font;
		return ctx.measureText(txt).width;
	};
	const fit = (txt, font, max) => {
		if (measure(txt, font) <= max) return txt;
		while (txt.length > 1 && measure(txt + '…', font) > max)
			txt = txt.slice(0, -1);
		return txt.trimEnd() + '…';
	};
	let o = '';
	const t = (x, yy, txt, size, weight, fill, extra) =>
		(o += `<text x="${x}" y="${yy}" font-size="${size}" font-weight="${weight}" fill="${fill}" ${extra || ''}>${esc(txt)}</text>`);

	// header
	t(P, 58, 'STAFF MILESTONES', 13, 600, '#8c95a5', 'letter-spacing="2"');
	t(
		P,
		102,
		first.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }),
		36,
		700,
		'#eceff4',
	);
	t(
		P,
		130,
		ms.length
			? `${ms.length} milestone${ms.length === 1 ? '' : 's'} · ${people} ${people === 1 ? 'person' : 'people'}`
			: 'No milestones this month',
		16,
		400,
		'#8c95a5',
	);

	// calendar
	const cw = (W - 2 * P) / 7;
	const ch = 46;
	let yy = 176;
	['M', 'T', 'W', 'T', 'F', 'S', 'S'].forEach((d, i) =>
		t(P + cw * i + cw / 2, yy, d, 12, 600, '#8c95a5', 'text-anchor="middle"'),
	);
	yy += 14;
	const lead = (first.getDay() + 6) % 7;
	const rows = Math.ceil((lead + days) / 7);
	for (let d = 1; d <= days; d++) {
		const idx = lead + d - 1;
		const cx = P + cw * (idx % 7) + cw / 2;
		const cy = yy + Math.floor(idx / 7) * ch + ch / 2;
		const key = `${y}-${pad(mo + 1)}-${pad(d)}`;
		const g = byDate[key];
		if (g) {
			const col = g.some((m) => m.months !== 6)
				? STF_SHARE_COL.year
				: STF_SHARE_COL.half;
			o += `<circle cx="${cx}" cy="${cy}" r="17" fill="${col}"/>`;
			t(cx, cy + 5.5, d, 16, 700, '#10131a', 'text-anchor="middle"');
		} else
			t(
				cx,
				cy + 5.5,
				d,
				16,
				400,
				idx % 7 > 4 ? '#5d6675' : '#b6bdca',
				'text-anchor="middle"',
			);
	}
	yy += rows * ch + 14;

	// legend
	const lf = `400 14px ${STF_FONT}`;
	o += `<circle cx="${P + 6}" cy="${yy}" r="6" fill="${STF_SHARE_COL.half}"/>`;
	t(P + 20, yy + 5, '6 Month milestone', 14, 400, '#8c95a5');
	const lx = P + 20 + measure('6 Month milestone', lf) + 28;
	o += `<circle cx="${lx + 6}" cy="${yy}" r="6" fill="${STF_SHARE_COL.year}"/>`;
	t(lx + 20, yy + 5, 'Annual milestone', 14, 400, '#8c95a5');
	yy += 30;

	// list
	dates.forEach((k) => {
		const items = byDate[k];
		const gh = Math.max(items.length * 34, 48) + 26;
		o += `<line x1="${P}" x2="${W - P}" y1="${yy}" y2="${yy}" stroke="#262d39" stroke-width="1"/>`;
		const dd = dateOf(k);
		t(P, yy + 44, dd.getDate(), 32, 700, '#eceff4');
		t(
			P + 52,
			yy + 36,
			dd.toLocaleDateString('en-GB', { weekday: 'long' }),
			14,
			600,
			'#b6bdca',
		);
		t(
			P + 52,
			yy + 54,
			dd.toLocaleDateString('en-GB', { month: 'long' }),
			13,
			400,
			'#8c95a5',
		);
		items.forEach((m, i) => {
			const ry = yy + 40 + i * 34;
			const lab = milestoneLabel(m.months);
			const col = m.months === 6 ? STF_SHARE_COL.half : STF_SHARE_COL.year;
			const pf = `600 14px ${STF_FONT}`;
			const pw = measure(lab, pf) + 24;
			const px = W - P - pw;
			o += `<rect x="${px}" y="${ry - 19}" width="${pw}" height="28" rx="14" fill="${col}" fill-opacity="0.18"/>`;
			t(px + pw / 2, ry, lab, 14, 600, col, 'text-anchor="middle"');
			const nx = P + 150;
			t(
				nx,
				ry,
				fit(m.person.name, `600 19px ${STF_FONT}`, px - 14 - nx),
				19,
				600,
				'#eceff4',
			);
		});
		yy += gh;
	});
	const H = yy + 28;
	const head = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${Math.ceil(H)}" viewBox="0 0 ${W} ${Math.ceil(H)}" font-family="${STF_FONT.replace(/"/g, "'")}"><rect width="${W}" height="${Math.ceil(H)}" fill="#10131a"/>`;
	return { svg: head + o + '</svg>', first, count: ms.length };
}

let stfShareOffset = 1; // next month by default

function renderShare() {
	const sel = $('#stfShareMonth');
	if (!sel) return;
	const months = stfShareMonths();
	const sig = months.map((m) => m.label).join('|');
	if (sel.dataset.sig !== sig) {
		sel.dataset.sig = sig;
		sel.innerHTML = months
			.map(
				(m) =>
					`<option value="${m.i}">${m.i === 0 ? 'This month' : m.i === 1 ? 'Next month' : 'In 2 months'} · ${esc(m.label)}</option>`,
			)
			.join('');
	}
	sel.value = String(stfShareOffset);
	$('#stfShareBox').innerHTML = stfShareSvg(stfShareOffset).svg;
}

function renderStaff() {
	renderShare();
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
	$('#stfDiscord').value = '';
	$('#stfReddit').value = '';
	$('#stfDiscordId').value = '';
	$('#stfAdd').textContent = 'Add';
	$('#stfCancel').hidden = true;
	$('#stfFormTitle').textContent = 'Add a staff member';
}

function saveStaff() {
	const name = $('#stfName').value.trim();
	const joined = $('#stfJoined').value;
	const left = $('#stfLeft').value;
	const discord = cleanDiscord($('#stfDiscord').value);
	const reddit = cleanReddit($('#stfReddit').value);
	const discordId = cleanDiscordId($('#stfDiscordId').value);
	if (!name) return stfMsg('Enter a name.', true);
	if (!isDateKey(joined)) return stfMsg('Pick the date they joined.', true);
	if (left && left < joined)
		return stfMsg('The leave date is before the join date.', true);
	if (discordId && !isDiscordId(discordId))
		return stfMsg('A Discord ID is 15-22 digits (numbers only).', true);
	const person = { id: stfEditId || cryptoRandomId(), name, joined };
	if (left) person.left = left;
	withAccounts(person, discord, reddit, discordId);
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
	$('#stfDiscord').value = p.discord || '';
	$('#stfReddit').value = p.reddit || '';
	$('#stfDiscordId').value = p.discordId || '';
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
		const discord = cleanDiscord(parts[3]);
		const reddit = cleanReddit(parts[4]);
		const discordId = cleanDiscordId(parts[5]);
		if (
			!name ||
			!joined ||
			left === null ||
			(left && left < joined) ||
			(discordId && !isDiscordId(discordId))
		) {
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
		withAccounts(p, discord, reddit, discordId);
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
	$('#stfShareMonth').addEventListener('change', (e) => {
		stfShareOffset = Number(e.target.value) || 0;
		renderShare();
	});
	$('#stfShareDl').addEventListener('click', () => {
		const { first } = stfShareSvg(stfShareOffset);
		exportRingAsPng(
			$('#stfShareBox'),
			`milestones-${first.getFullYear()}-${pad(first.getMonth() + 1)}.png`,
		);
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
