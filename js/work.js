// ===================== Discord time =====================
// Data: S.work = data.json
//   { categories: [{ key, label, color }],
//     sessions:   [{ id, category, startDate, endDate, minutes, note? }] }
// The running timer itself is in js/timer.js (this device only).

let selCat = null; // category chosen for the next timer
let wrkEditId = null;
let wrkMonth = null; // 'YYYY-MM' | 'all' | null (= current month)
let wrkLimit = 30;
let timerMsgTimer = null;
let wrkMsgTimer = null;

const workCats = () => S.work.categories;

function workCat(key) {
	return (
		workCats().find((c) => c.key === key) || {
			key,
			label: key,
			color: '#666666',
		}
	);
}

const sessionStart = (s) => Date.parse(s.startDate);
function sessionEnd(s) {
	const e = Date.parse(s.endDate);
	return isNaN(e) ? sessionStart(s) + (Number(s.minutes) || 0) * 60000 : e;
}

// Minutes of a session that fall inside [from, to). A session crossing
// midnight is split between the days; `minutes` (which excludes paused
// time) is shared out in proportion to the overlap.
function sessionMinutesIn(s, from, to) {
	const a = sessionStart(s);
	if (isNaN(a)) return 0;
	const e = sessionEnd(s);
	const mins = Number(s.minutes) || 0;
	const dur = e - a;
	if (dur <= 0) return a >= from && a < to ? mins : 0;
	const o = Math.min(e, to) - Math.max(a, from);
	return o > 0 ? (mins * o) / dur : 0;
}

function workMinutesBetween(from, to) {
	return S.work.sessions.reduce(
		(sum, s) => sum + sessionMinutesIn(s, from, to),
		0,
	);
}

/* ---------- timer ---------- */
function timerNote(text) {
	const el = $('#timerMsg');
	el.textContent = text;
	clearTimeout(timerMsgTimer);
	if (text) timerMsgTimer = setTimeout(() => (el.textContent = ''), 6000);
}

function renderTimer() {
	const cats = workCats();
	if (!selCat || !cats.some((c) => c.key === selCat))
		selCat = cats.length ? cats[0].key : null;

	const ts = timerGetState();
	const active = ts ? ts.category : selCat;
	const locked = !!ts;

	$('#catChips').innerHTML = cats
		.map((c) => {
			const on = c.key === active;
			const hex = normHex(c.color);
			return `<button class="chip${on ? ' on' : ''}" type="button" data-cat="${esc(c.key)}" style="--cc:${hex};--onc:${textOn(hex)}"${locked ? ' disabled' : ''}><i class="dotc" style="background:${on ? 'var(--onc)' : hex}"></i>${esc(c.label)}</button>`;
		})
		.join('');

	$('#timerDisp').textContent = formatHMS(timerElapsedSeconds(ts));
	$('#tStart').hidden = !!ts;
	$('#tPause').hidden = !(ts && ts.running);
	$('#tResume').hidden = !(ts && !ts.running);
	$('#tStop').hidden = !ts;
	$('#tCancel').hidden = !ts;
	$('#timerState').textContent = !ts
		? 'Ready'
		: `${ts.running ? 'Running' : 'Paused'} · ${workCat(ts.category).label} · started ${hm(new Date(ts.originalStart))}`;
}

function stopTimerAndSave() {
	const note = ($('#timerNote').value || '').trim();
	const result = timerStop(note);
	if (result && result.discarded) {
		timerNote(
			`Only ${result.elapsedSeconds}s - not saved (entries under 1 minute are discarded).`,
		);
	} else if (result) {
		Store.commit(
			'work',
			(d) => upsertItem(d, 'sessions', result),
			`add session: ${result.category}`,
		);
		timerNote(
			`Saved ${formatMinutesAsHM(result.minutes)} of ${workCat(result.category).label}.`,
		);
	}
	$('#timerNote').value = '';
	renderAll();
}

/* ---------- manual session form ---------- */
function wrkFormTimes() {
	const d = $('#mwDate').value;
	const a = $('#mwStart').value;
	const b = $('#mwEnd').value;
	if (!d || !a || !b) return null;
	const start = new Date(`${d}T${a}`);
	let end = new Date(`${d}T${b}`);
	if ($('#mwNext').checked || end <= start)
		end = new Date(end.getTime() + 864e5);
	return { start, end, minutes: Math.round((end - start) / 60000) };
}

function updateWrkDuration() {
	const t = wrkFormTimes();
	$('#mwDur').textContent = t ? formatMinutesAsHM(t.minutes) : '';
}

function wrkMsg(text) {
	const el = $('#mwMsg');
	el.textContent = text;
	clearTimeout(wrkMsgTimer);
	if (text) wrkMsgTimer = setTimeout(() => (el.textContent = ''), 6000);
}

function wrkResetForm() {
	wrkEditId = null;
	$('#mwStart').value = '';
	$('#mwEnd').value = '';
	$('#mwNext').checked = false;
	$('#mwNote').value = '';
	$('#mwDate').value = ymd(new Date());
	$('#mwAdd').textContent = 'Add session';
	$('#mwCancel').hidden = true;
	$('#wrkMoreTitle').textContent = 'Add a session you forgot to track';
	updateWrkDuration();
}

function wrkStartEdit(id) {
	const s = S.work.sessions.find((x) => x.id === id);
	if (!s) return;
	wrkEditId = id;
	renderWork();
	const a = new Date(s.startDate);
	const b = new Date(sessionEnd(s));
	$('#mwCat').value = s.category;
	$('#mwDate').value = ymd(a);
	$('#mwStart').value = hm(a);
	$('#mwEnd').value = hm(b);
	$('#mwNext').checked = ymd(a) !== ymd(b);
	$('#mwNote').value = s.note || '';
	$('#mwAdd').textContent = 'Update session';
	$('#mwCancel').hidden = false;
	$('#wrkMoreTitle').textContent = 'Edit session';
	$('#wrkMore').open = true;
	updateWrkDuration();
	$('#wrkMore').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function saveWrkForm() {
	const t = wrkFormTimes();
	const key = $('#mwCat').value;
	if (!key || !t) {
		wrkMsg('Fill in the category, date, start and end time.');
		return;
	}
	if (t.minutes <= 0) {
		wrkMsg('The end time has to be after the start time.');
		return;
	}
	const note = ($('#mwNote').value || '').trim();
	const session = {
		id: wrkEditId || cryptoRandomId(),
		category: key,
		startDate: t.start.toISOString(),
		endDate: t.end.toISOString(),
		minutes: t.minutes,
	};
	if (note) session.note = note;
	Store.commit(
		'work',
		(d) => upsertItem(d, 'sessions', session),
		`${wrkEditId ? 'edit' : 'add'} session: ${key}`,
	);
	if (wrkEditId) {
		wrkResetForm();
		wrkMsg('Session updated.');
	} else {
		$('#mwStart').value = '';
		$('#mwEnd').value = '';
		$('#mwNext').checked = false;
		$('#mwNote').value = '';
		updateWrkDuration();
		wrkMsg('Session added.');
	}
}

function removeSession(id) {
	Store.commit('work', (d) => removeItem(d, 'sessions', id), 'remove session');
}

/* ---------- rendering ---------- */
function wrkMonthOptions() {
	const months = new Set([ymKey(new Date())]);
	S.work.sessions.forEach((s) => {
		const t = sessionStart(s);
		if (!isNaN(t)) months.add(ymKey(new Date(t)));
	});
	return Array.from(months).sort().reverse();
}

function renderWork() {
	renderTimer();
	setOptions(
		$('#mwCat'),
		workCats().map((c) => ({ value: c.key, label: c.label })),
	);

	const months = wrkMonthOptions();
	const sel = $('#wrkMonth');
	const cur = wrkMonth || ymKey(new Date());
	sel.innerHTML =
		`<option value="all">All time</option>` +
		months
			.map((m) => {
				const [yy, mm] = m.split('-').map(Number);
				return `<option value="${m}">${loc(new Date(yy, mm - 1, 1), { month: 'long', year: 'numeric' })}</option>`;
			})
			.join('');
	sel.value = cur === 'all' || months.includes(cur) ? cur : 'all';

	let items = S.work.sessions.filter((s) => !isNaN(sessionStart(s)));
	if (sel.value !== 'all')
		items = items.filter((s) => ymKey(new Date(sessionStart(s))) === sel.value);
	items.sort((a, b) => sessionStart(b) - sessionStart(a));
	const shown = items.slice(0, wrkLimit);
	$('#wrkList').innerHTML = shown.length
		? shown
				.map((s) => {
					const c = workCat(s.category);
					const a = sessionStart(s);
					const b = sessionEnd(s);
					return `<div class="row"><span class="when">${dateLabel(a)} ${hm(new Date(a))}-${hm(new Date(b))}</span><span class="what"><i class="dotc" style="background:${normHex(c.color)}"></i><span>${esc(c.label)}${s.note ? ' · ' + esc(s.note) : ''}</span></span><span class="val">${formatMinutesAsHM(Number(s.minutes) || 0)}</span><button class="x ed" type="button" data-edit="${esc(s.id)}" aria-label="Edit session">✎</button><button class="x del" type="button" data-del="${esc(s.id)}" aria-label="Delete session">×</button></div>`;
				})
				.join('')
		: '<div class="empty">No sessions for this period. Pick a category and press Start.</div>';
	$('#wrkMoreBtn').hidden = items.length <= wrkLimit;

	chartDraw('work');
}

/* ---------- chart ---------- */
function workSeries() {
	const s = workCats().map((c) => ({ k: c.key, n: c.label, color: c.color }));
	const known = new Set(s.map((x) => x.k));
	S.work.sessions.forEach((e) => {
		if (!known.has(e.category)) {
			known.add(e.category);
			s.push({ k: e.category, n: e.category, color: '#666666' });
		}
	});
	return s;
}

const workChartCfg = {
	range: 'week',
	ranges: ['day', 'week', 'month', 'year', 'all'],
	series: workSeries,
	data: (bs) => {
		const out = bs.map(() => ({ vals: {} }));
		S.work.sessions.forEach((s) => {
			if (isNaN(sessionStart(s))) return;
			bs.forEach((b, i) => {
				const m = sessionMinutesIn(s, b.s, b.e);
				if (m > 0) out[i].vals[s.category] = (out[i].vals[s.category] || 0) + m;
			});
		});
		return out;
	},
	first: () => {
		let m = Infinity;
		S.work.sessions.forEach((s) => {
			const t = sessionStart(s);
			if (t < m) m = t;
		});
		return isFinite(m) ? m : null;
	},
	steps: MIN_STEPS,
	emptyStep: 60,
	axis: (v) => formatMinutesAsHM(v),
	fmt: formatMinutesAsHM,
	goal: () => 0,
	aria: 'Time on Discord work',
	donut: { inner: 0.593, prefix: 'TT' },
	stats: (i) => {
		const o = [['Total', formatMinutesAsHM(i.sum)]];
		if (i.range !== 'day')
			o.push(['Daily average', formatMinutesAsHM(i.sum / i.days)]);
		return o;
	},
};

/* ---------- wiring ---------- */
function workInit() {
	chartInit('work', workChartCfg);
	$('#mwDate').value = ymd(new Date());

	$('#tStart').addEventListener('click', () => {
		if (!selCat) {
			timerNote('Pick a category first.');
			return;
		}
		timerStart(selCat);
		renderAll();
	});
	$('#tPause').addEventListener('click', () => {
		timerPause();
		renderAll();
	});
	$('#tResume').addEventListener('click', () => {
		timerResume();
		renderAll();
	});
	$('#tStop').addEventListener('click', stopTimerAndSave);
	$('#tCancel').addEventListener('click', (e) => {
		if (!confirmArm(e.currentTarget, 'Sure?')) return;
		timerCancel();
		$('#timerNote').value = '';
		renderAll();
	});

	['mwDate', 'mwStart', 'mwEnd', 'mwNext'].forEach((id) =>
		$('#' + id).addEventListener('input', updateWrkDuration),
	);
	$('#mwAdd').addEventListener('click', saveWrkForm);
	$('#mwCancel').addEventListener('click', wrkResetForm);
	$('#wrkMonth').addEventListener('change', () => {
		wrkMonth = $('#wrkMonth').value;
		wrkLimit = 30;
		renderWork();
	});
	$('#wrkMoreBtn').addEventListener('click', () => {
		wrkLimit += 30;
		renderWork();
	});

	$('#v-discord').addEventListener('click', (e) => {
		const t = e.target.closest('button');
		if (!t) return;
		if (t.dataset.cat) {
			selCat = t.dataset.cat;
			renderTimer();
		} else if (t.dataset.edit) {
			wrkStartEdit(t.dataset.edit);
		} else if (t.dataset.del) {
			if (confirmArm(t)) removeSession(t.dataset.del);
		}
	});
}
