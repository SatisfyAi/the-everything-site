// ===================== Job clock =====================
// Data: S.clk = clock-data.json
//   { settings: { startShift, endShift, dayTarget },
//     days:     { "YYYY-MM-DD": { s, ls, le, e } } }     // "HH:MM" strings
//
// A day can also be marked as time off:  days[date].off = { type, min? }
//   vacation            - whole day off (no hours expected), or with { min }
//                         a part of a day
//   doctor              - { min }: that many minutes are taken off the target
// Days with no data at all are simply ignored (weekends, gaps): they never
// count as missing hours.
//
// Four stamps in a fixed order: Start, Lunch start, Lunch end, End.
// Start is recorded as now + startShift minutes, End as now + endShift
// minutes (defaults +5 and -5); lunch uses the exact time.

const CLK_STEPS = [
	{ k: 's', n: 'Start', shift: 'startShift' },
	{ k: 'ls', n: 'Lunch start' },
	{ k: 'le', n: 'Lunch end' },
	{ k: 'e', n: 'End', shift: 'endShift' },
];

let clkWeekOffset = 0;

const clkSettings = () => S.clk.settings;
const clkDay = (k) => S.clk.days[k] || null;

const OFF_TYPES = {
	vacation: 'Vacation',
	holiday: 'Public holiday',
	doctor: 'Doctor',
};
const dayOff = (d) => (d && d.off && OFF_TYPES[d.off.type] ? d.off : null);
const isFullOff = (o) => !!o && o.type !== 'doctor' && !(Number(o.min) > 0);
const offLabel = (o) =>
	Number(o.min) > 0
		? `${OFF_TYPES[o.type]} ${formatMinutesAsHM(Number(o.min))}`
		: OFF_TYPES[o.type];

// Minutes expected on a day (the daily target, less any time off).
function dayTarget(d) {
	const t = Number(clkSettings().dayTarget) || 0;
	const o = dayOff(d);
	if (!o) return t;
	if (isFullOff(o)) return 0;
	return Math.max(0, t - (Number(o.min) || 0));
}

// Minutes worked in a finished day: end - start - lunch.
function dayWorked(d) {
	if (!d || !d.s || !d.e) return null;
	let m = toMin(d.e) - toMin(d.s);
	if (d.ls && d.le) m -= Math.max(0, toMin(d.le) - toMin(d.ls));
	return m > 0 ? m : null;
}

// Minutes worked so far (works while the day is still open).
function liveWorked(d) {
	if (!d || !d.s) return null;
	if (d.e) return dayWorked(d);
	const now = toMin(hm(new Date()));
	let m;
	if (d.ls && !d.le) m = toMin(d.ls) - toMin(d.s);
	else {
		m = now - toMin(d.s);
		if (d.ls && d.le) m -= Math.max(0, toMin(d.le) - toMin(d.ls));
	}
	return Math.max(0, m);
}

const nextStep = (d) => {
	for (const st of CLK_STEPS) if (!d || !d[st.k]) return st;
	return null;
};

// The time a stamp would record right now.
function shiftTime(st) {
	const shift = st.shift ? Number(clkSettings()[st.shift]) || 0 : 0;
	return hm(new Date(Date.now() + shift * 60000));
}

const STEP_LABEL = { s: 'start', ls: 'lunch start', le: 'lunch end', e: 'end' };

function clkSet(date, field, value) {
	Store.commit(
		'clock',
		(d) => {
			const days = d.days || (d.days = {});
			const day = days[date] || (days[date] = {});
			if (value) day[field] = value;
			else delete day[field];
			if (!Object.keys(day).length) delete days[date];
		},
		`${STEP_LABEL[field]} ${date} ${value || 'cleared'}`,
	);
}

function pressStamp(k) {
	const tk = ymd(new Date());
	const nx = nextStep(clkDay(tk));
	if (!nx || nx.k !== k) return;
	clkSet(tk, k, shiftTime(nx));
}

function undoStamp() {
	const tk = ymd(new Date());
	const day = clkDay(tk);
	if (!day) return;
	for (let i = CLK_STEPS.length - 1; i >= 0; i--) {
		if (day[CLK_STEPS[i].k]) {
			clkSet(tk, CLK_STEPS[i].k, null);
			break;
		}
	}
}

/* ---------- rendering ---------- */
function clockLive() {
	const day = clkDay(ymd(new Date())) || {};
	const w = liveWorked(day);
	const t = dayTarget(day);
	const o = dayOff(day);
	let txt;
	if (!day.s)
		txt = o
			? isFullOff(o)
				? `${offLabel(o)} · day off`
				: `${offLabel(o)} · target ${formatMinutesAsHM(t)}`
			: 'Not started yet.';
	else if (day.e)
		txt = `Done · ${formatMinutesAsHM(w || 0)} worked${w != null ? ` (${formatSignedMinutes(w - t)} vs target)` : ''}`;
	else
		txt = `${day.ls && !day.le ? 'On lunch' : 'On the clock'} · ${formatMinutesAsHM(w || 0)} so far`;
	if (o && day.s) txt = `${offLabel(o)} · ${txt}`;
	const el = $('#clkSum');
	if (el.textContent !== txt) el.textContent = txt;
}

function renderClock(force) {
	const tk = ymd(new Date());
	const day = clkDay(tk) || {};
	const nx = nextStep(day);
	$('#clkDate').textContent = loc(new Date(), {
		weekday: 'long',
		day: 'numeric',
		month: 'long',
	});
	CLK_STEPS.forEach((st) => {
		const el = $('#st-' + st.k);
		const done = !!day[st.k];
		const isNext = !!nx && nx.k === st.k;
		el.className = 'stamp' + (isNext ? ' next' : '');
		el.disabled = !isNext;
		el.querySelector('.sv').textContent = done
			? day[st.k]
			: isNext
				? shiftTime(st)
				: '-:-';
		const sh = st.shift ? Number(clkSettings()[st.shift]) || 0 : 0;
		el.querySelector('.sh').textContent = done
			? 'Recorded'
			: isNext
				? sh
					? `Press to record now ${sh > 0 ? '+' : '−'}${Math.abs(sh)} min`
					: 'Press to record now'
				: '';
	});
	$('#clkUndo').disabled = !CLK_STEPS.some((st) => day[st.k]);
	clockLive();
	chartDraw('clock');
	renderOffList();
	if (force || !$('#clkTable').contains(document.activeElement))
		renderClockTable();
}

function renderClockTable() {
	const m = addD(mondayOf(new Date()), 7 * clkWeekOffset);
	const tk = ymd(new Date());
	$('#twTitle').textContent =
		(clkWeekOffset === 0 ? 'This week · ' : '') + weekTitle(m);
	$('[data-tw="1"]').disabled = clkWeekOffset >= 0;
	let rows = '';
	let sum = 0;
	let bal = 0;
	let counted = 0;
	for (let i = 0; i < 7; i++) {
		const d = addD(m, i);
		const k = ymd(d);
		const r = clkDay(k) || {};
		const w = dayWorked(r);
		const t = dayTarget(r);
		const o = dayOff(r);
		if (w) {
			sum += w;
			bal += w - t;
			counted++;
		}
		const inp = (f) =>
			`<td><input class="cell" type="time" data-d="${k}" data-k="${f}" value="${r[f] || ''}" aria-label="${loc(d, { weekday: 'long' })} ${STEP_LABEL[f]}"></td>`;
		const badge = o
			? ` <span class="badge off-${o.type}">${esc(offLabel(o))}</span>`
			: '';
		rows += `<tr class="${k === tk ? 'today' : ''}"><th scope="row">${loc(d, { weekday: 'short', day: 'numeric', month: 'short' })}${badge}</th>${inp('s')}${inp('ls')}${inp('le')}${inp('e')}<td class="num">${w ? formatMinutesAsHM(w) : '-'}</td><td class="num ${w ? (w >= t ? 'pos' : 'neg') : ''}">${w ? formatSignedMinutes(w - t) : '-'}</td></tr>`;
	}
	$('#clkTable').innerHTML =
		`<thead><tr><th>Day</th><th>Start</th><th>Lunch start</th><th>Lunch end</th><th>End</th><th class="num">Worked</th><th class="num">Vs target</th></tr></thead><tbody>${rows}</tbody>` +
		`<tfoot><tr><th colspan="5">Week total</th><td class="num">${formatMinutesAsHM(sum)}</td><td class="num ${counted ? (bal >= 0 ? 'pos' : 'neg') : ''}">${counted ? formatSignedMinutes(bal) : '-'}</td></tr></tfoot>`;
}

/* ---------- time off (vacation, holidays, doctor) ---------- */
function offDates(from, to, skipWeekends) {
	const out = [];
	let d = new Date(from + 'T00:00');
	const end = new Date((to || from) + 'T00:00');
	for (let n = 0; d <= end && n < 400; n++, d = addD(d, 1)) {
		const wd = d.getDay();
		if (skipWeekends && (wd === 0 || wd === 6)) continue;
		out.push(ymd(d));
	}
	return out;
}

function offMsg(text, isError) {
	const el = $('#offMsg');
	el.textContent = text || '';
	el.className = 'note' + (isError ? ' error' : '');
}

function addOff() {
	const type = $('#offType').value;
	const from = $('#offFrom').value;
	const to = type === 'doctor' ? '' : $('#offTo').value;
	const hours = $('#offDur').value;
	if (!from) return offMsg('Pick a date.', true);
	if (to && to < from)
		return offMsg('The end date is before the start date.', true);
	const off = { type };
	if (type === 'doctor' || hours !== '') {
		const min = Math.round(Number(hours) * 60);
		if (!(min > 0 && min <= 1440))
			return offMsg('Enter how many hours you are away, e.g. 1.5.', true);
		off.min = min;
	}
	const dates = offDates(from, to, type !== 'doctor' && $('#offWk').checked);
	if (!dates.length) return offMsg('Those dates are all weekend days.', true);
	Store.commit(
		'clock',
		(d) => {
			const days = d.days || (d.days = {});
			dates.forEach((k) => {
				(days[k] || (days[k] = {})).off = clone(off);
			});
		},
		`${OFF_TYPES[type].toLowerCase()} ${dates[0]}${dates.length > 1 ? ' to ' + dates[dates.length - 1] : ''}`,
	);
	offMsg(
		`${OFF_TYPES[type]} added for ${dates.length} day${dates.length === 1 ? '' : 's'}.`,
	);
	$('#offTo').value = '';
	$('#offDur').value = '';
}

function removeOff(dates) {
	Store.commit(
		'clock',
		(d) => {
			dates.forEach((k) => {
				const day = d.days && d.days[k];
				if (!day) return;
				delete day.off;
				if (!Object.keys(day).length) delete d.days[k];
			});
		},
		`remove time off ${dates[0]}${dates.length > 1 ? ' to ' + dates[dates.length - 1] : ''}`,
	);
}

// Consecutive days with the same entry (weekends in between allowed) show as one row.
function offGroups() {
	const keys = Object.keys(S.clk.days)
		.filter((k) => dayOff(S.clk.days[k]))
		.sort();
	const groups = [];
	keys.forEach((k) => {
		const o = S.clk.days[k].off;
		const g = groups[groups.length - 1];
		if (g && g.o.type === o.type && (g.o.min || 0) === (o.min || 0)) {
			let d = addD(new Date(g.dates[g.dates.length - 1] + 'T00:00'), 1);
			const kd = new Date(k + 'T00:00');
			while (d < kd && (d.getDay() === 0 || d.getDay() === 6)) d = addD(d, 1);
			if (ymd(d) === k) {
				g.dates.push(k);
				return;
			}
		}
		groups.push({ o, dates: [k] });
	});
	return groups;
}

function renderOffList() {
	const el = $('#offList');
	if (!el) return;
	const from = ymd(addD(new Date(), -30));
	const groups = offGroups().filter((g) => g.dates[g.dates.length - 1] >= from);
	const fmt = (k) =>
		loc(new Date(k + 'T00:00'), {
			weekday: 'short',
			day: 'numeric',
			month: 'short',
		});
	el.innerHTML = groups.length
		? groups
				.map((g) => {
					const a = g.dates[0];
					const b = g.dates[g.dates.length - 1];
					const when = a === b ? fmt(a) : `${fmt(a)} - ${fmt(b)}`;
					const n = g.dates.length;
					return `<div class="offrow"><span class="when">${when}</span><span class="what"><span class="badge off-${g.o.type}">${esc(offLabel(g.o))}</span>${n > 1 ? `<span class="muted">${n} days</span>` : ''}</span><button class="x del" type="button" data-offdel="${g.dates.join(',')}" aria-label="Remove">×</button></div>`;
				})
				.join('')
		: '<div class="empty">No time off added. Days without any data are ignored anyway, so only add days you want to see marked.</div>';
}

/* ---------- chart ---------- */
const cssVar = (name) =>
	getComputedStyle(document.documentElement).getPropertyValue(name).trim();

// Minutes of a day that are time off (a whole vacation day counts as the daily target).
function dayOffMinutes(r) {
	const o = dayOff(r);
	if (!o) return 0;
	return isFullOff(o)
		? Number(clkSettings().dayTarget) || 0
		: Number(o.min) || 0;
}

// Totals for a list of buckets. Days with no data are ignored.
function clkAgg(list) {
	const a = { sum: 0, days: 0, bal: 0, doctor: 0, vacation: 0 };
	list.forEach((b) => {
		for (let d = new Date(b.s); d.getTime() < b.e; d = addD(d, 1)) {
			const r = clkDay(ymd(d));
			const w = dayWorked(r);
			if (w) {
				a.sum += w;
				a.days++;
				a.bal += w - dayTarget(r);
			}
			const o = dayOff(r);
			if (o) a[o.type === 'doctor' ? 'doctor' : 'vacation'] += dayOffMinutes(r);
		}
	});
	return a;
}

const clkWeekView = () =>
	!!(charts.clock && charts.clock.st && charts.clock.st.range === 'week');

// Bars are time worked (grey) with doctor and vacation hours stacked on top.
// Only the week view compares each finished day with its target: the gap up
// to the target in red, anything above it in green (same colours as "Vs
// target" in the week log). Longer ranges just show the hours, because
// plus and minus days cancel out there.
const clockChartCfg = {
	range: 'week',
	ranges: ['week', 'month', 'year', 'all'],
	series: () => {
		const base = [
			{ k: 'worked', n: 'Worked', color: cssVar('--hours') || '#8b94a5' },
			{ k: 'doctor', n: 'Doctor', color: cssVar('--doctor') || '#4fc3f7' },
			{
				k: 'vacation',
				n: 'Vacation',
				color: cssVar('--vacation') || '#7b6cff',
			},
		];
		return clkWeekView()
			? base.concat([
					{
						k: 'missing',
						n: 'Under target',
						color: cssVar('--neg') || '#ff7a7a',
					},
					{ k: 'extra', n: 'Over target', color: cssVar('--pos') || '#6fd08c' },
				])
			: base;
	},
	data: (bs) => {
		const week = clkWeekView();
		return bs.map((b) => {
			const v = { worked: 0, doctor: 0, vacation: 0, missing: 0, extra: 0 };
			for (let d = new Date(b.s); d.getTime() < b.e; d = addD(d, 1)) {
				const r = clkDay(ymd(d));
				const o = dayOff(r);
				if (o)
					v[o.type === 'doctor' ? 'doctor' : 'vacation'] += dayOffMinutes(r);
				const w = dayWorked(r);
				if (!w) continue;
				if (week) {
					const t = dayTarget(r);
					v.worked += Math.min(w, t);
					v.missing += Math.max(0, t - w);
					v.extra += Math.max(0, w - t);
				} else v.worked += w;
			}
			return { vals: v };
		});
	},
	// what the bar "is" for the readout: time actually worked
	shown: (d) => d.vals.worked + d.vals.extra,
	first: () => {
		const k = Object.keys(S.clk.days).sort();
		return k.length ? new Date(k[0] + 'T00:00').getTime() : null;
	},
	steps: MIN_STEPS,
	emptyStep: 120,
	axis: (v) => formatMinutesAsHM(v),
	fmt: formatMinutesAsHM,
	goal: () => clkSettings().dayTarget,
	goalLabel: 'Target',
	aria: 'Hours worked',
	stats: (i) => {
		const a = clkAgg(i.list);
		const o = [['Total worked', formatMinutesAsHM(a.sum)]];
		if (a.days) {
			o.push(['Per worked day', formatMinutesAsHM(a.sum / a.days)]);
			o.push(['Balance', formatSignedMinutes(a.bal)]);
		}
		if (a.doctor) o.push(['Doctor', formatMinutesAsHM(a.doctor)]);
		if (a.vacation) o.push(['Vacation', formatMinutesAsHM(a.vacation)]);
		return o;
	},
};

/* ---------- wiring ---------- */
function clockInit() {
	chartInit('clock', clockChartCfg);
	$('#clkUndo').addEventListener('click', undoStamp);
	$('#offFrom').value = ymd(new Date());
	const syncOffForm = () => {
		const doc = $('#offType').value === 'doctor';
		$('#offToF').hidden = doc;
		$('#offWkF').hidden = doc;
		$('#offDurF label').textContent = doc
			? 'Time away (hours)'
			: 'Hours off (empty = whole day)';
		$('#offDur').placeholder = doc ? 'e.g. 1.5' : 'whole day';
	};
	$('#offType').addEventListener('change', syncOffForm);
	syncOffForm();
	$('#offAdd').addEventListener('click', addOff);
	$('#offList').addEventListener('click', (e) => {
		const b = e.target.closest('[data-offdel]');
		if (b && confirmArm(b, 'Remove?')) removeOff(b.dataset.offdel.split(','));
	});
	$('#v-clock').addEventListener('click', (e) => {
		const t = e.target.closest('button');
		if (!t) return;
		if (t.dataset.stamp) pressStamp(t.dataset.stamp);
		else if (t.dataset.tw) {
			clkWeekOffset = Math.min(0, clkWeekOffset + Number(t.dataset.tw));
			renderClockTable();
		}
	});
	$('#clkTable').addEventListener('change', (e) => {
		const i = e.target;
		if (!i.dataset || !i.dataset.d) return;
		clkSet(i.dataset.d, i.dataset.k, i.value || null);
		renderClockTable();
	});
}
