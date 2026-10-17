// ===================== App core =====================
// State, navigation, the Today overview, the status banner and boot.
// The sections live in hydration.js, work.js, clock.js and settings.js.

// If an older copy of a file is still deployed (or cached), say so plainly
// instead of failing with a vague error.
(function () {
	const need = {
		'js/github.js': typeof Store,
		'js/hydration.js': typeof hydInit,
		'js/work.js': typeof workInit,
		'js/clock.js': typeof clockInit,
		'js/settings.js': typeof settingsInit,
		'js/chart.js': typeof chartInit,
	};
	const bad = Object.keys(need).filter((k) => need[k] === 'undefined');
	if (bad.length) {
		const m = `These files are missing or are an old version: ${bad.join(', ')}. Upload the new copies, then hard-refresh (Ctrl+F5).`;
		document.addEventListener('DOMContentLoaded', () => {
			const b = document.getElementById('banner');
			document.getElementById('bannerMsg').textContent = m;
			document.getElementById('bannerBtn').hidden = true;
			b.className = 'banner err';
			b.hidden = false;
		});
		throw new Error(m);
	}
})();

const VIEWS = ['today', 'water', 'discord', 'clock', 'staff', 'settings'];

// Current data for each file (read-only; every change goes through Store.commit).
const S = { work: null, hyd: null, clk: null, stf: null };

let cur = 'today';
let lastRefresh = Date.now();
let lastDay = ymd(new Date());
let runtimeError = null;
let localBannerDismissed = false;

function rebuild() {
	S.work = Store.get('work');
	S.hyd = Store.get('hydration');
	S.clk = Store.get('clock');
	S.stf = Store.get('staff');
}

/* ---------- navigation ---------- */
function show(v) {
	if (VIEWS.indexOf(v) < 0) v = 'today';
	cur = v;
	document.body.dataset.v = v;
	$$('.view').forEach((x) => {
		x.hidden = x.id !== 'v-' + v;
	});
	$$('#nav a').forEach((a) => a.classList.toggle('on', a.dataset.v === v));
	$('#gear').classList.toggle('on', v === 'settings');
	try {
		localStorage.setItem('daybook-view', v);
	} catch (e) {}
	try {
		if (location.hash !== '#' + v) history.replaceState(null, '', '#' + v);
	} catch (e) {}
	window.scrollTo(0, 0);
	renderAll(v === 'settings');
}

/* ---------- banner + sync status ---------- */
const SYNC_TEXT = {
	loading: 'Loading…',
	synced: 'Synced',
	saving: 'Saving…',
	error: 'Sync problem',
	local: 'This device only',
};

function renderSyncStatus() {
	const s = Store.status;
	const el = $('#sync');
	el.textContent = SYNC_TEXT[s] || s;
	el.className =
		'syncbtn' + (s === 'synced' ? ' ok' : s === 'error' ? ' bad' : '');
}

function renderBanner() {
	const el = $('#banner');
	const msg = $('#bannerMsg');
	const btn = $('#bannerBtn');
	let kind = null;
	if (runtimeError) {
		kind = 'err';
		msg.textContent = runtimeError;
		btn.textContent = 'Dismiss';
		btn.dataset.act = 'dismiss';
	} else if (Store.status === 'error') {
		kind = 'err';
		const e = Store.lastError;
		const auth =
			e && (e.status === 401 || e.status === 403 || e.status === 404);
		msg.textContent = e
			? `Couldn't sync with GitHub: ${e.message}${Store.queue.length ? ' Your changes are kept and will be saved once it works.' : ''}`
			: "Couldn't sync with GitHub.";
		btn.textContent = auth ? 'Open settings' : 'Retry';
		btn.dataset.act = auth ? 'settings' : 'retry';
	} else if (Store.mode === 'local' && !localBannerDismissed) {
		kind = 'info';
		msg.textContent =
			"GitHub isn't set up yet, so data is saved on this device only.";
		btn.textContent = 'Connect';
		btn.dataset.act = 'settings';
	}
	el.hidden = !kind;
	el.className = 'banner' + (kind === 'err' ? ' err' : '');
}

window.addEventListener('error', (e) => {
	runtimeError = `Error in ${(e.filename || 'script').split('/').pop()} line ${e.lineno || '?'}: ${e.message || 'unknown error'}`;
	console.error(e.error || e.message);
	try {
		renderBanner();
	} catch (_) {}
});
window.addEventListener('unhandledrejection', (e) => {
	const r = e.reason;
	runtimeError = `Unhandled error: ${(r && r.message) || (typeof r === 'string' ? r : 'promise rejected')}`;
	console.error(r);
	try {
		renderBanner();
	} catch (_) {}
});

/* ---------- Today ---------- */
function renderToday() {
	$('#todayDate').textContent = loc(new Date(), {
		weekday: 'long',
		day: 'numeric',
		month: 'long',
	});

	renderStaffToday();

	// hydration
	const { by, total } = hydTotals(todayHydEntries());
	const goal = hydGoal();
	const den = Math.max(total, goal);
	const seg = hydStackOrder(by)
		.filter((c) => by[c.key])
		.map(
			(c) =>
				`<span style="width:${((by[c.key] / den) * 100).toFixed(1)}%;background:${normHex(c.color)}"></span>`,
		)
		.join('');
	$('#hubWater').innerHTML =
		`<span class="p-title">Hydration</span>` +
		`<div class="p-big">${formatMl(total)}</div><div class="muted">of ${formatMl(goal)}</div><div class="seg">${seg}</div>`;

	// Discord time
	const ts = timerGetState();
	const t0 = sod(new Date()).getTime();
	const t1 = addD(sod(new Date()), 1).getTime();
	let body;
	if (ts) {
		body =
			`<div class="p-big" id="hubTimer">${formatHMS(timerElapsedSeconds(ts))}</div>` +
			`<div class="muted">${ts.running ? 'Running' : 'Paused'} · ${esc(workCat(ts.category).label)}</div>`;
	} else {
		body =
			`<div class="p-big">${formatMinutesAsHM(workMinutesBetween(t0, t1))}</div>` +
			`<div class="muted">${formatMinutesAsHM(workMinutesBetween(mondayOf(new Date()).getTime(), t1))} this week</div>`;
	}
	$('#hubWork').innerHTML = `<span class="p-title">Discord</span>` + body;

	// job clock
	const day = clkDay(ymd(new Date())) || {};
	const nx = nextStep(day);
	const dots = CLK_STEPS.map(
		(st) => `<i class="dot${day[st.k] ? ' on' : ''}" title="${st.n}"></i>`,
	).join('');
	const w = liveWorked(day);
	const off = dayOff(day);
	$('#hubClock').innerHTML =
		`<span class="p-title">Job clock</span>` +
		`<div class="p-big">${w != null ? formatMinutesAsHM(w) : '0h'}</div>` +
		(off
			? `<div class="muted">${esc(offLabel(off))}${isFullOff(off) ? ' · day off' : ''}</div>`
			: `<div class="muted">${day.e ? 'worked' : nx ? 'of 8h' : 'done'}</div>`) +
		`<div class="dots">${dots}</div>`;
}

/* ---------- render everything that is visible ---------- */
function renderAll(forceSettings) {
	renderSyncStatus();
	renderBanner();
	renderToday();
	if (cur === 'staff') renderStaff();
	if (cur === 'water') renderWater();
	if (cur === 'discord') renderWork();
	if (cur === 'clock') renderClock(false);
	if (cur === 'settings') renderSettings(!!forceSettings);
}

// Once a second: running timer, live clock, midnight rollover.
function tick() {
	const ts = timerGetState();
	if (ts) {
		const t = formatHMS(timerElapsedSeconds(ts));
		const a = $('#timerDisp');
		const b = $('#hubTimer');
		if (a && a.textContent !== t) a.textContent = t;
		if (b && b.textContent !== t) b.textContent = t;
	} else {
		const a = $('#timerDisp');
		if (a && a.textContent !== '00:00:00') a.textContent = '00:00:00';
	}
	if (cur === 'clock') {
		clockLive();
		const nx = nextStep(clkDay(ymd(new Date())));
		if (nx) {
			const el = $('#st-' + nx.k + ' .sv');
			if (el) el.textContent = shiftTime(nx);
		}
	}
	const today = ymd(new Date());
	if (today !== lastDay) {
		lastDay = today;
		renderAll();
	}
}

/* ---------- events ---------- */
document.addEventListener('click', (e) => {
	const t = e.target.closest('button,a,[data-v]:not(body)');
	if (!t) return;
	if (t.dataset.v) {
		e.preventDefault();
		show(t.dataset.v);
		return;
	}
	const act = t.dataset.act;
	if (act === 'quick-water') {
		const q = quickDrink();
		if (q) addDrink(q.key, tapAmount(q.key));
	} else if (act === 'hub-stamp') {
		const nx = nextStep(clkDay(ymd(new Date())));
		if (nx) pressStamp(nx.k);
	}
});

$('#bannerBtn').addEventListener('click', (e) => {
	const act = e.currentTarget.dataset.act;
	if (act === 'dismiss') {
		runtimeError = null;
		renderBanner();
	} else if (act === 'retry') {
		lastRefresh = Date.now();
		Store.flushNow().then(() => Store.refresh());
	} else if (act === 'settings') {
		show('settings');
	}
});

$('#sync').addEventListener('click', () => {
	if (Store.mode === 'local') {
		show('settings');
		return;
	}
	lastRefresh = Date.now();
	if (Store.queue.length) Store.flushNow();
	else Store.refresh();
});

document.addEventListener('visibilitychange', () => {
	if (
		document.visibilityState === 'visible' &&
		Store.mode === 'github' &&
		!Store.queue.length &&
		Date.now() - lastRefresh > 15000
	) {
		lastRefresh = Date.now();
		Store.refresh();
	}
});

/* ---------- boot ---------- */
function init() {
	Store.init();
	rebuild();
	Store.onChange = () => {
		rebuild();
		renderAll();
	};
	Store.onStatus = () => {
		renderSyncStatus();
		renderBanner();
	};

	hydInit();
	workInit();
	clockInit();
	staffInit();
	settingsInit();

	let start = 'today';
	try {
		const h = location.hash.slice(1);
		start =
			VIEWS.indexOf(h) >= 0
				? h
				: localStorage.getItem('daybook-view') || 'today';
	} catch (e) {}
	show(start);
	setInterval(tick, 1000);
	Store.load().catch(() => {});
}

init();
