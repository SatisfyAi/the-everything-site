// ===================== Job clock =====================
// Data: S.clk = clock-data.json
//   { settings: { startShift, endShift, dayTarget },
//     days:     { "YYYY-MM-DD": { s, ls, le, e } } }     // "HH:MM" strings
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
	const t = clkSettings().dayTarget;
	let txt;
	if (!day.s) txt = 'Not started yet.';
	else if (day.e)
		txt = `Done · ${formatMinutesAsHM(w || 0)} worked${w != null ? ` (${formatSignedMinutes(w - t)} vs target)` : ''}`;
	else
		txt = `${day.ls && !day.le ? 'On lunch' : 'On the clock'} · ${formatMinutesAsHM(w || 0)} so far`;
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
				: '–:–';
		const sh = st.shift ? Number(clkSettings()[st.shift]) || 0 : 0;
		el.querySelector('.sh').textContent = done
			? 'Recorded'
			: isNext
				? sh
					? `Press to record now ${sh > 0 ? '+' : '−'}${Math.abs(sh)} min`
					: 'Press to record now'
				: '';
	});
	$('#clkUndo').disabled = !Object.keys(day).length;
	clockLive();
	chartDraw('clock');
	if (force || !$('#clkTable').contains(document.activeElement))
		renderClockTable();
}

function renderClockTable() {
	const m = addD(mondayOf(new Date()), 7 * clkWeekOffset);
	const tk = ymd(new Date());
	const t = clkSettings().dayTarget;
	$('#twTitle').textContent =
		(clkWeekOffset === 0 ? 'This week · ' : '') + weekTitle(m);
	$('[data-tw="1"]').disabled = clkWeekOffset >= 0;
	let rows = '';
	let sum = 0;
	let days = 0;
	for (let i = 0; i < 7; i++) {
		const d = addD(m, i);
		const k = ymd(d);
		const r = clkDay(k) || {};
		const w = dayWorked(r);
		if (w) {
			sum += w;
			days++;
		}
		const inp = (f) =>
			`<td><input class="cell" type="time" data-d="${k}" data-k="${f}" value="${r[f] || ''}" aria-label="${loc(d, { weekday: 'long' })} ${STEP_LABEL[f]}"></td>`;
		rows += `<tr class="${k === tk ? 'today' : ''}"><th scope="row">${loc(d, { weekday: 'short', day: 'numeric', month: 'short' })}</th>${inp('s')}${inp('ls')}${inp('le')}${inp('e')}<td class="num">${w ? formatMinutesAsHM(w) : '–'}</td><td class="num ${w ? (w >= t ? 'pos' : 'neg') : ''}">${w ? formatSignedMinutes(w - t) : '–'}</td></tr>`;
	}
	$('#clkTable').innerHTML =
		`<thead><tr><th>Day</th><th>Start</th><th>Lunch start</th><th>Lunch end</th><th>End</th><th class="num">Worked</th><th class="num">Vs target</th></tr></thead><tbody>${rows}</tbody>` +
		`<tfoot><tr><th colspan="5">Week total</th><td class="num">${formatMinutesAsHM(sum)}</td><td class="num ${days ? (sum >= days * t ? 'pos' : 'neg') : ''}">${days ? formatSignedMinutes(sum - days * t) : '–'}</td></tr></tfoot>`;
}

/* ---------- chart ---------- */
const cssVar = (name) =>
	getComputedStyle(document.documentElement).getPropertyValue(name).trim();

function clkAgg(list) {
	let sum = 0;
	let days = 0;
	list.forEach((b) => {
		for (let d = new Date(b.s); d.getTime() < b.e; d = addD(d, 1)) {
			const w = dayWorked(clkDay(ymd(d)));
			if (w) {
				sum += w;
				days++;
			}
		}
	});
	return { sum, days };
}

const clockChartCfg = {
	range: 'week',
	ranges: ['week', 'month', 'year', 'all'],
	series: () => [
		{ k: 'worked', n: 'Worked', color: cssVar('--clock') || '#f0c808' },
	],
	data: (bs) =>
		bs.map((b) => {
			let t = 0;
			for (let d = new Date(b.s); d.getTime() < b.e; d = addD(d, 1)) {
				const w = dayWorked(clkDay(ymd(d)));
				if (w) t += w;
			}
			return { vals: { worked: t } };
		}),
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
	noLegend: true,
	aria: 'Hours worked',
	stats: (i) => {
		const a = clkAgg(i.list);
		const o = [['Total worked', formatMinutesAsHM(a.sum)]];
		if (a.days) {
			o.push(['Per worked day', formatMinutesAsHM(a.sum / a.days)]);
			o.push([
				'Balance',
				formatSignedMinutes(a.sum - a.days * clkSettings().dayTarget),
			]);
		}
		return o;
	},
};

/* ---------- wiring ---------- */
function clockInit() {
	chartInit('clock', clockChartCfg);
	$('#clkUndo').addEventListener('click', undoStamp);
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
