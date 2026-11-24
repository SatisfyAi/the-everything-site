// ===================== Habits =====================
// Data: habits-data.json  { habits: [...], log: { "YYYY-MM-DD": { <habitId>: number } } }
// Three kinds of habit:
//   done    one tick a day                    (a sudoku puzzle)
//   count   N times a day, segmented ring     (brush teeth, 2 a day)
//   amount  a number with a unit and a target (water 2000 ml, read 30 pages)
// A day is done when the logged number reaches the goal (1 for "done", N for
// "count", the target for "amount"). Days a habit is not scheduled never break
// its streak, and neither does today while it is still open.

const HAB_COLORS = [
	'#f0c808',
	'#ff5e8a',
	'#7b6cff',
	'#ff9f1c',
	'#3b82f6',
	'#5ccf8a',
];
const HAB_DOW = [1, 2, 3, 4, 5, 6, 0]; // Monday first, values are Date#getDay()
const HAB_DOW_LETTER = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const HAB_DOW_NAME = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const HAB_MAX_COUNT = 12;

let habTab = 'today'; // today | stats | manage
let habOpen = null; // habit id shown in the detail page (under Stats)
let habCustom = null; // habit id whose custom-amount box is open
let habMonth = null; // first day of the month shown in the detail calendar
let habLogDate = null; // date picked in the detail page
let habEditId = null;
let habForm = { color: HAB_COLORS[0], type: 'done', days: [0, 1, 2, 3, 4, 5, 6] };

/* ---------- small helpers ---------- */
const habPd = (s) => {
	const p = String(s).split('-').map(Number);
	return new Date(p[0], (p[1] || 1) - 1, p[2] || 1);
};
const habNum = (v) => {
	const n = parseFloat(String(v).replace(',', '.'));
	return isFinite(n) ? n : NaN;
};
const habFmt = (n) => String(Number(Number(n).toFixed(2)));
const habData = () => S.hab || { habits: [], log: {} };
const habActive = () => habData().habits.filter((h) => !h.archived);
const habById = (id) => habData().habits.find((h) => h.id === id);
const habGoal = (h) =>
	h.type === 'done' ? 1 : Math.max(1, Number(h.target) || 1);
const habVal = (k, id) => {
	const day = habData().log[k];
	return (day && Number(day[id])) || 0;
};
const habSched = (h, k) => {
	if (h.start && k < h.start) return false;
	return !h.days || h.days.indexOf(habPd(k).getDay()) >= 0;
};
const habDone = (h, k) => habVal(k, h.id) >= habGoal(h);
const habUnit = (h) => (h.unit ? ' ' + h.unit : '');

function habStats(h) {
	const today = ymd(new Date());
	const end = habPd(today);
	let d = habPd(h.start || today);
	let run = 0;
	let best = 0;
	let total = 0;
	let sched30 = 0;
	let done30 = 0;
	const from30 = ymd(addD(end, -29));
	for (let n = 0; d <= end && n < 4000; n++, d = addD(d, 1)) {
		const k = ymd(d);
		if (!habSched(h, k)) continue;
		const ok = habDone(h, k);
		if (ok) {
			run++;
			total++;
			if (run > best) best = run;
		} else if (k !== today) run = 0;
		if (k >= from30 && (k !== today || ok)) {
			sched30++;
			if (ok) done30++;
		}
	}
	return {
		cur: run,
		best,
		total,
		rate: sched30 ? Math.round((100 * done30) / sched30) : null,
	};
}

// Streak of days where every scheduled habit was finished.
function habOverall() {
	const list = habActive();
	if (!list.length) return { cur: 0, today: [0, 0] };
	const today = ymd(new Date());
	const end = habPd(today);
	let d = habPd(list.reduce((m, h) => (h.start && h.start < m ? h.start : m), today));
	let run = 0;
	for (let n = 0; d <= end && n < 4000; n++, d = addD(d, 1)) {
		const k = ymd(d);
		const s = list.filter((h) => habSched(h, k));
		if (!s.length) continue;
		if (s.every((h) => habDone(h, k))) run++;
		else if (k !== today) run = 0;
	}
	const t = list.filter((h) => habSched(h, today));
	return { cur: run, today: [t.filter((h) => habDone(h, today)).length, t.length] };
}

// 0..1 progress of all habits scheduled that day, or null when none were.
function habDayFrac(k) {
	const s = habActive().filter((h) => habSched(h, k));
	if (!s.length) return null;
	return (
		s.reduce((a, h) => a + Math.min(1, habVal(k, h.id) / habGoal(h)), 0) /
		s.length
	);
}

function habSet(id, k, value) {
	const h = habById(id);
	if (!h) return;
	Store.commit(
		'habits',
		(d) => {
			let day = d.log[k];
			if (!day) day = d.log[k] = {};
			const v = Math.round(value * 100) / 100;
			if (v <= 0) delete day[id];
			else day[id] = v;
			if (!Object.keys(day).length) delete d.log[k];
		},
		`habit: ${h.name} ${k}`,
	);
}

/* ---------- the ring ---------- */
// One 40x40 SVG for all three kinds. Count habits get one rounded segment per
// time (gap 6 between segments, stroke 4, round caps).
function habRingSvg(h, v) {
	const c = normHex(h.color);
	const g = habGoal(h);
	const R = 16;
	const C = 2 * Math.PI * R;
	let body = '';
	if (h.type === 'count' && g >= 2 && g <= HAB_MAX_COUNT) {
		const slot = C / g;
		const dash = Math.max(0.1, slot - 10).toFixed(2);
		for (let i = 0; i < g; i++) {
			const on = i < v;
			body += `<circle cx="20" cy="20" r="${R}" fill="none" stroke-width="4" stroke-linecap="round" stroke-dasharray="${dash} 200" stroke-dashoffset="-2" transform="rotate(${((i * 360) / g).toFixed(2)} 20 20)" ${on ? `stroke="${c}"` : 'class="hr-track"'}/>`;
		}
	} else if (h.type === 'done' || g === 1) {
		body = `<circle cx="20" cy="20" r="${R}" fill="none" stroke-width="3" class="hr-track"/>`;
	} else {
		const p = Math.min(1, v / g);
		body =
			`<circle cx="20" cy="20" r="${R}" fill="none" stroke-width="4" class="hr-track"/>` +
			(p > 0
				? `<circle cx="20" cy="20" r="${R}" fill="none" stroke-width="4" stroke-linecap="round" stroke="${c}" stroke-dasharray="${(C * p).toFixed(2)} ${C.toFixed(2)}"/>`
				: '');
	}
	return `<svg class="hr-svg" viewBox="0 0 40 40" aria-hidden="true">${body}</svg>`;
}

function habRing(h, v, px, asButton) {
	const c = normHex(h.color);
	const g = habGoal(h);
	const done = v >= g;
	const tick = `<svg class="hr-tick" viewBox="0 0 24 24" style="stroke:${textOn(c)}" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>`;
	let label = '';
	if (h.type === 'count' && g > 1) label = `${Math.min(v, g)}/${g}`;
	else if (h.type === 'amount' && g > 1)
		label = `${Math.min(100, Math.round((100 * v) / g))}%`;
	const inner = done
		? tick
		: habRingSvg(h, v) + (label ? `<span class="hr-lab">${label}</span>` : '');
	const tag = asButton ? 'button type="button"' : 'div';
	const end = asButton ? 'button' : 'div';
	const aria = asButton
		? ` aria-label="${esc(h.name)}${done ? ', done' : ''}" data-hring="${esc(h.id)}"`
		: '';
	return `<${tag} class="hring${done ? ' full' : ''}" style="--hc:${c};width:${px}px;height:${px}px"${aria}>${inner}</${end}>`;
}

/* ---------- rendering ---------- */
function habDescribe(h) {
	const when = h.days
		? HAB_DOW.filter((d) => h.days.indexOf(d) >= 0)
				.map((d) => HAB_DOW_NAME[d])
				.join(', ')
		: 'Every day';
	let what = 'Done or not done';
	if (h.type === 'count') what = `Count, ${habGoal(h)} a day`;
	if (h.type === 'amount') what = `Amount, ${habFmt(habGoal(h))}${habUnit(h)} a day`;
	return `${when} · ${what}`;
}

function habStreakText(n) {
	return n > 0 ? `${n} day streak` : '';
}

function renderHabits() {
	$$('#habTabs .tab').forEach((b) => b.classList.toggle('on', b.dataset.ht === habTab));
	const manage = habTab === 'manage';
	$('#habBody').hidden = manage;
	$('#habManage').hidden = !manage;
	if (manage) renderHabManage();
	else if (habTab === 'stats') {
		const h = habOpen && habById(habOpen);
		if (h) renderHabDetail(h);
		else {
			habOpen = null;
			renderHabStats();
		}
	} else renderHabTodayTab();
}

function habEmpty() {
	return `<div class="card habempty"><div class="h2">No habits yet</div><p class="muted">Add one under Manage. It can be a simple tick, a count like brushing teeth twice a day, or an amount like pages read.</p><button class="btn" type="button" data-htab="manage">Add a habit</button></div>`;
}

function habRow(h, k) {
	const v = habVal(k, h.id);
	const g = habGoal(h);
	const st = habStats(h);
	const sub = [];
	if (h.type === 'count') sub.push(`${Math.min(v, g)} of ${g} today`);
	else if (h.type === 'amount') sub.push(`${habFmt(v)} of ${habFmt(g)}${habUnit(h)}`);
	else sub.push(v >= 1 ? 'Done' : 'Not done yet');
	if (st.cur) sub.push(habStreakText(st.cur));
	let acts = '';
	if (h.type === 'count') {
		acts =
			(v > 0
				? `<button class="hbtn" type="button" data-hminus="${esc(h.id)}" aria-label="Remove one">−</button>`
				: '') +
			`<button class="hbtn" type="button" data-hplus="${esc(h.id)}"${v >= g ? ' disabled' : ''}>+1</button>`;
	} else if (h.type === 'amount') {
		const q = h.quick && h.quick.length ? h.quick : [Math.max(1, Math.round(g / 4))];
		acts =
			q
				.slice(0, 3)
				.map(
					(n) =>
						`<button class="hbtn" type="button" data-hadd="${esc(h.id)}" data-amt="${n}">+${habFmt(n)}</button>`,
				)
				.join('') +
			`<button class="hbtn" type="button" data-hcustom="${esc(h.id)}" aria-label="Custom amount">…</button>`;
	}
	const custom =
		habCustom === h.id
			? `<div class="hcustom"><input id="habCustomIn" type="number" inputmode="decimal" step="any" placeholder="Amount${esc(habUnit(h))} (negative removes)" /><button class="btn sm" type="button" data-hcadd="${esc(h.id)}">Add</button></div>`
			: '';
	return `<div class="hrow"><div class="hmain">${habRing(h, v, 52, h.type !== 'amount')}<button type="button" class="hname" data-hopen="${esc(h.id)}"><b>${esc(h.name)}</b><span class="muted small">${esc(sub.join(' · '))}</span></button><div class="hact">${acts}</div></div>${custom}</div>`;
}

function renderHabTodayTab() {
	const k = ymd(new Date());
	const list = habActive();
	if (!list.length) {
		$('#habBody').innerHTML = habEmpty();
		return;
	}
	const sched = list.filter((h) => habSched(h, k));
	const rest = list.filter((h) => !habSched(h, k));
	const o = habOverall();
	const head = `<div class="card habsum"><div><div class="lab">Today</div><div class="p-big">${o.today[0]} of ${o.today[1]}</div></div><div><div class="lab">Streak</div><div class="p-big">${o.cur}<small> day${o.cur === 1 ? '' : 's'}</small></div></div></div>`;
	const rows = sched.length
		? sched.map((h) => habRow(h, k)).join('')
		: '<p class="muted">Nothing is scheduled for today.</p>';
	$('#habBody').innerHTML =
		head +
		`<div class="card habrows">${rows}</div>` +
		(rest.length
			? `<p class="muted small habrest">Not scheduled today: ${rest.map((h) => esc(h.name)).join(', ')}</p>`
			: '');
	if (habCustom) {
		const inp = $('#habCustomIn');
		if (inp && document.activeElement !== inp) inp.focus();
	}
}

function renderHabStats() {
	const list = habActive();
	if (!list.length) {
		$('#habBody').innerHTML = habEmpty();
		return;
	}
	const o = habOverall();
	const all = list.map((h) => ({ h, s: habStats(h) }));
	const rated = all.filter((x) => x.s.rate != null);
	const avg = rated.length
		? Math.round(rated.reduce((a, x) => a + x.s.rate, 0) / rated.length)
		: null;
	const tiles = `<div class="hstats"><div class="card"><div class="lab">Today</div><div class="p-big">${o.today[0]}/${o.today[1]}</div></div><div class="card"><div class="lab">Streak</div><div class="p-big">${o.cur}<small>d</small></div></div><div class="card"><div class="lab">30 days</div><div class="p-big">${avg == null ? '–' : avg + '%'}</div></div></div>`;

	// last 12 weeks, one column per week (Monday on top)
	const today = sod(new Date());
	const first = addD(mondayOf(today), -77);
	let cells = '';
	for (let i = 0; i < 84; i++) {
		const d = addD(first, i);
		const k = ymd(d);
		if (d > today) {
			cells += '<i class="hm fut"></i>';
			continue;
		}
		const f = habDayFrac(k);
		cells +=
			f == null
				? `<i class="hm none" title="${k}"></i>`
				: `<i class="hm" title="${k}" style="--p:${Math.round(f * 100)}%"></i>`;
	}
	const heat = `<div class="card"><div class="chart-head"><div class="lab" style="margin:0">Last 12 weeks</div><span class="muted small">Brighter = more of the day done</span></div><div class="heat">${cells}</div></div>`;

	const rows = all
		.map(({ h, s }) => {
			const c = normHex(h.color);
			return `<button type="button" class="hlist" data-hopen="${esc(h.id)}"><span class="hdot" style="background:${c}"></span><span class="hl-name"><b>${esc(h.name)}</b><span class="muted small">${s.cur} streak · best ${s.best}</span></span><span class="hl-rate"><b>${s.rate == null ? '–' : s.rate + '%'}</b><span class="hbar"><i style="width:${s.rate || 0}%;background:${c}"></i></span></span></button>`;
		})
		.join('');
	$('#habBody').innerHTML =
		tiles +
		heat +
		`<div class="card"><div class="lab">Each habit</div>${rows}</div>`;
}

function renderHabDetail(h) {
	const s = habStats(h);
	const c = normHex(h.color);
	const todayK = ymd(new Date());
	if (!habMonth) habMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
	if (!habLogDate) habLogDate = todayK;
	const y = habMonth.getFullYear();
	const m = habMonth.getMonth();
	const days = new Date(y, m + 1, 0).getDate();
	const lead = (new Date(y, m, 1).getDay() + 6) % 7;
	let grid = HAB_DOW_LETTER.map((l) => `<span class="hcl">${l}</span>`).join('');
	for (let i = 0; i < lead; i++) grid += '<span></span>';
	const g = habGoal(h);
	for (let d = 1; d <= days; d++) {
		const k = `${y}-${pad(m + 1)}-${pad(d)}`;
		const v = habVal(k, h.id);
		let cls = 'hcell';
		if (k > todayK) cls += ' off';
		else if (v >= g) cls += ' ok';
		else if (v > 0) cls += ' part';
		else if (habSched(h, k)) cls += ' miss';
		else cls += ' off';
		if (k === todayK) cls += ' now';
		if (k === habLogDate) cls += ' sel';
		grid += `<button type="button" class="${cls}" data-hday="${k}"${k > todayK ? ' disabled' : ''}>${d}</button>`;
	}
	const cv = habVal(habLogDate, h.id);
	let field;
	if (h.type === 'done')
		field = `<select id="habLogVal"><option value="0"${cv >= 1 ? '' : ' selected'}>Not done</option><option value="1"${cv >= 1 ? ' selected' : ''}>Done</option></select>`;
	else
		field = `<input id="habLogVal" type="number" inputmode="decimal" step="any" min="0" value="${cv ? habFmt(cv) : ''}" placeholder="${h.type === 'count' ? 'Times' : 'Amount' + esc(habUnit(h))}" />`;
	const tile = (l, v) =>
		`<div class="card"><div class="lab">${l}</div><div class="p-big">${v}</div></div>`;
	$('#habBody').innerHTML =
		`<button type="button" class="btn ghost sm hback" data-hback>← All habits</button>` +
		`<div class="hhead"><span class="hdot big" style="background:${c}"></span><div><div class="h2">${esc(h.name)}</div><div class="muted small">${esc(habDescribe(h))}</div></div></div>` +
		`<div class="hstats four">${tile('Streak', s.cur)}${tile('Best', s.best)}${tile('30d', s.rate == null ? '–' : s.rate + '%')}${tile('Total', s.total)}</div>` +
		`<div class="card"><div class="chart-head"><button type="button" class="x" data-hmonth="-1" aria-label="Previous month">‹</button><div class="lab" style="margin:0">${loc(habMonth, { month: 'long', year: 'numeric' })}</div><button type="button" class="x" data-hmonth="1" aria-label="Next month">›</button></div><div class="hcal" style="--hc:${c}">${grid}</div><div class="muted small hlegend">Filled = done, faint = partly, outlined = missed, dim = not scheduled</div></div>` +
		`<div class="card"><div class="lab">Log a day</div><div class="form"><div class="field"><label for="habLogDate">Date</label><input id="habLogDate" type="date" max="${todayK}" value="${habLogDate}" /></div><div class="field"><label for="habLogVal">${h.type === 'done' ? 'Status' : h.type === 'count' ? 'Times' : 'Amount'}</label>${field}</div></div><div class="addrow"><button class="btn" type="button" data-hlogsave="${esc(h.id)}">Save</button></div></div>`;
}

/* ---------- manage ---------- */
function habFormShow() {
	const t = habForm.type;
	$$('#habType .tab').forEach((b) => b.classList.toggle('on', b.dataset.hty === t));
	$('#habTargetWrap').hidden = t === 'done';
	$('#habUnitWrap').hidden = t !== 'amount';
	$('#habQuickWrap').hidden = t !== 'amount';
	$('#habTargetLab').textContent = t === 'count' ? 'Times per day' : 'Daily target';
	$('#habColors').innerHTML = HAB_COLORS.map(
		(c) =>
			`<button type="button" class="sw${habForm.color === c ? ' on' : ''}" data-hcol="${c}" style="background:${c}" aria-label="Colour ${c}"></button>`,
	).join('');
	$('#habDays').innerHTML = HAB_DOW.map(
		(d, i) =>
			`<button type="button" class="hday${habForm.days.indexOf(d) >= 0 ? ' on' : ''}" data-hdow="${d}" aria-label="${HAB_DOW_NAME[d]}">${HAB_DOW_LETTER[i]}</button>`,
	).join('');
	$('#habSave').textContent = habEditId ? 'Save changes' : 'Add habit';
	$('#habCancel').hidden = !habEditId;
}

function habMsg(text, bad) {
	const n = $('#habMsg');
	n.textContent = text || '';
	n.classList.toggle('error', !!bad);
}

function habResetForm() {
	habEditId = null;
	habForm = { color: HAB_COLORS[0], type: 'done', days: [0, 1, 2, 3, 4, 5, 6] };
	$('#habName').value = '';
	$('#habTarget').value = '';
	$('#habUnit').value = '';
	$('#habQuick').value = '';
	$('#habStart').value = ymd(new Date());
	habFormShow();
}

function habStartEdit(id) {
	const h = habById(id);
	if (!h) return;
	habEditId = id;
	habForm = {
		color: normHex(h.color),
		type: h.type,
		days: h.days ? h.days.slice() : [0, 1, 2, 3, 4, 5, 6],
	};
	$('#habName').value = h.name;
	$('#habTarget').value = h.type === 'done' ? '' : habFmt(habGoal(h));
	$('#habUnit').value = h.unit || '';
	$('#habQuick').value = (h.quick || []).map(habFmt).join(', ');
	$('#habStart').value = h.start || ymd(new Date());
	habFormShow();
	habMsg('');
	$('#habName').scrollIntoView({ block: 'center', behavior: 'smooth' });
	$('#habName').focus();
}

function habSave() {
	const name = $('#habName').value.trim();
	if (!name) return habMsg('Give the habit a name.', true);
	const type = habForm.type;
	let target = 1;
	if (type !== 'done') {
		target = habNum($('#habTarget').value);
		if (!(target > 0))
			return habMsg(
				type === 'count' ? 'Enter how many times a day.' : 'Enter a daily target.',
				true,
			);
		if (type === 'count') {
			target = Math.round(target);
			if (target > HAB_MAX_COUNT)
				return habMsg(`A count habit can be up to ${HAB_MAX_COUNT} times a day. Use an amount instead.`, true);
		}
	}
	if (!habForm.days.length) return habMsg('Pick at least one day.', true);
	const start = $('#habStart').value || ymd(new Date());
	const old = habEditId && habById(habEditId);
	const h = {
		id: old ? old.id : cryptoRandomId(),
		name,
		color: habForm.color,
		type,
		target,
		start,
	};
	if (habForm.days.length < 7) h.days = habForm.days.slice();
	if (type === 'amount') {
		h.unit = $('#habUnit').value.trim();
		const q = $('#habQuick')
			.value.split(/[,\s]+/)
			.map(habNum)
			.filter((n) => n > 0)
			.slice(0, 3);
		h.quick = q.length ? q : [Math.max(1, Math.round(target / 4))];
	}
	if (old && old.archived) h.archived = true;
	const editing = !!old;
	Store.commit(
		'habits',
		(d) => upsertItem(d, 'habits', h),
		`${editing ? 'edit' : 'add'} habit: ${name}`,
	);
	habResetForm();
	habMsg(editing ? 'Saved.' : `${name} added.`);
}

function renderHabManage() {
	const all = habData().habits;
	const row = (h) => {
		const c = normHex(h.color);
		return `<div class="srow${h.archived ? ' arch' : ''}"><div class="sinfo"><b><i class="hdot" style="background:${c}"></i> ${esc(h.name)}${h.archived ? ' (archived)' : ''}</b><span class="muted small">${esc(habDescribe(h))}</span></div><button class="x ed" type="button" data-hedit="${esc(h.id)}" aria-label="Edit ${esc(h.name)}">✎</button><button class="btn ghost sm" type="button" data-harch="${esc(h.id)}">${h.archived ? 'Restore' : 'Archive'}</button><button class="x del" type="button" data-hdel="${esc(h.id)}" aria-label="Delete ${esc(h.name)}">×</button></div>`;
	};
	$('#habList').innerHTML = all.length
		? all.map(row).join('')
		: '<p class="muted">No habits yet.</p>';
}

/* ---------- Today view card ---------- */
function renderHabToday() {
	const host = $('#habToday');
	if (!host) return;
	const k = ymd(new Date());
	const list = habActive().filter((h) => habSched(h, k));
	if (!habActive().length) {
		host.innerHTML = `<article class="card habcard"><div class="habcard-h"><button type="button" class="p-title" data-hgo>Habits</button></div><button type="button" class="habadd" data-hgo>Track your first habit</button></article>`;
		return;
	}
	const o = habOverall();
	const items = list
		.map((h) => {
			const v = habVal(k, h.id);
			const asBtn = h.type !== 'amount';
			return `<div class="hitem">${habRing(h, v, 42, asBtn)}<button type="button" class="hlabel" ${asBtn ? `data-hopen="${esc(h.id)}"` : 'data-hgo'}>${esc(h.name)}</button></div>`;
		})
		.join('');
	host.innerHTML = `<article class="card habcard"><div class="habcard-h"><button type="button" class="p-title" data-hgo>Habits</button><span class="muted small">${o.today[0]} of ${o.today[1]} done${o.cur ? ' · ' + o.cur + ' day streak' : ''}</span></div>${items ? `<div class="habstrip">${items}</div>` : '<p class="muted small">Nothing scheduled today.</p>'}</article>`;
}

/* ---------- events ---------- */
function habClick(e) {
	const b = e.target.closest('button');
	if (!b) return;
	const d = b.dataset;
	const k = ymd(new Date());
	if (d.hgo !== undefined) {
		habTab = 'today';
		habOpen = null;
		show('habits');
	} else if (d.htab) {
		habTab = d.htab;
		habOpen = null;
		renderHabits();
	} else if (d.hring) {
		const h = habById(d.hring);
		if (!h) return;
		const v = habVal(k, h.id);
		if (h.type === 'done') habSet(h.id, k, v >= 1 ? 0 : 1);
		else if (v < habGoal(h)) habSet(h.id, k, v + 1);
		else habSet(h.id, k, v - 1);
	} else if (d.hplus) {
		const h = habById(d.hplus);
		if (h) habSet(h.id, k, Math.min(habGoal(h), habVal(k, h.id) + 1));
	} else if (d.hminus) {
		const h = habById(d.hminus);
		if (h) habSet(h.id, k, Math.max(0, habVal(k, h.id) - 1));
	} else if (d.hadd) {
		const h = habById(d.hadd);
		if (h) habSet(h.id, k, habVal(k, h.id) + Number(d.amt));
	} else if (d.hcustom) {
		habCustom = habCustom === d.hcustom ? null : d.hcustom;
		renderHabits();
	} else if (d.hcadd) {
		const h = habById(d.hcadd);
		const n = habNum($('#habCustomIn').value);
		if (h && isFinite(n) && n !== 0) {
			habCustom = null;
			habSet(h.id, k, Math.max(0, habVal(k, h.id) + n));
		}
	} else if (d.hopen) {
		habOpen = d.hopen;
		habTab = 'stats';
		habMonth = null;
		habLogDate = null;
		if (cur !== 'habits') show('habits');
		else renderHabits();
		window.scrollTo(0, 0);
	} else if (d.hback !== undefined) {
		habOpen = null;
		renderHabits();
	} else if (d.hmonth) {
		habMonth = new Date(habMonth.getFullYear(), habMonth.getMonth() + Number(d.hmonth), 1);
		renderHabits();
	} else if (d.hday) {
		habLogDate = d.hday;
		renderHabits();
	} else if (d.hlogsave) {
		const h = habById(d.hlogsave);
		const date = $('#habLogDate').value || habLogDate;
		if (!h || date > k) return;
		const raw = $('#habLogVal').value;
		const n = raw === '' ? 0 : habNum(raw);
		if (!isFinite(n) || n < 0) return;
		habLogDate = date;
		habSet(h.id, date, h.type === 'count' ? Math.round(n) : n);
	} else if (d.hty) {
		habForm.type = d.hty;
		habFormShow();
	} else if (d.hcol) {
		habForm.color = d.hcol;
		habFormShow();
	} else if (d.hdow !== undefined) {
		const n = Number(d.hdow);
		const i = habForm.days.indexOf(n);
		if (i >= 0) habForm.days.splice(i, 1);
		else habForm.days.push(n);
		habFormShow();
	} else if (d.hedit) {
		habStartEdit(d.hedit);
	} else if (d.harch) {
		const id = d.harch;
		const h = habById(id);
		if (h)
			Store.commit(
				'habits',
				(x) => {
					const t = x.habits.find((y) => y.id === id);
					if (t) {
						if (t.archived) delete t.archived;
						else t.archived = true;
					}
				},
				`${h.archived ? 'restore' : 'archive'} habit: ${h.name}`,
			);
	} else if (d.hdel && confirmArm(b, 'Delete?')) {
		const id = d.hdel;
		if (habEditId === id) habResetForm();
		Store.commit(
			'habits',
			(x) => {
				removeItem(x, 'habits', id);
				Object.keys(x.log).forEach((day) => {
					delete x.log[day][id];
					if (!Object.keys(x.log[day]).length) delete x.log[day];
				});
			},
			'delete habit',
		);
	}
}

function habitsInit() {
	$('#habTabs').addEventListener('click', (e) => {
		const b = e.target.closest('[data-ht]');
		if (!b) return;
		habTab = b.dataset.ht;
		habOpen = null;
		renderHabits();
	});
	$('#v-habits').addEventListener('click', habClick);
	$('#habToday').addEventListener('click', habClick);
	$('#habSave').addEventListener('click', habSave);
	$('#habCancel').addEventListener('click', () => {
		habResetForm();
		habMsg('');
	});
	$('#habName').addEventListener('keydown', (e) => {
		if (e.key === 'Enter') habSave();
	});
	$('#habBody').addEventListener('change', (e) => {
		if (e.target.id === 'habLogDate' && e.target.value) {
			habLogDate = e.target.value;
			const h = habOpen && habById(habOpen);
			if (h) {
				habMonth = new Date(habPd(habLogDate).getFullYear(), habPd(habLogDate).getMonth(), 1);
				renderHabDetail(h);
			}
		}
	});
	$('#habBody').addEventListener('keydown', (e) => {
		if (e.key === 'Enter' && e.target.id === 'habCustomIn') {
			const b = $('[data-hcadd]');
			if (b) b.click();
		}
	});
	habResetForm();
}