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
// Job clock bar: worked (grey), doctor/vacation/sick, and against the daily target
// the missing part (red, only once the day is finished) or the extra (green).
function clkBar(day, w) {
	const target = Number(clkSettings().dayTarget) || 0;
	const o = dayOff(day);
	const off = o ? dayOffMinutes(day) : 0;
	let work = w || 0;
	const sum = work + off;
	const seg = (m, col) =>
		`<span style="width:${((m / Math.max(target, sum, 1)) * 100).toFixed(2)}%;background:var(${col})"></span>`;
	let html = '';
	if (sum > target && work > 0) {
		const extra = Math.min(work, sum - target);
		html +=
			seg(work - extra, '--hours') +
			(o ? seg(off, '--' + offKey(o)) : '') +
			seg(extra, '--pos');
	} else {
		html +=
			seg(work, '--hours') +
			(o ? seg(off, '--' + offKey(o)) : '');
		if (day.e && target > sum) html += seg(target - sum, '--neg');
	}
	return html;
}

function renderToday() {
	$('#todayDate').textContent = loc(new Date(), {
		weekday: 'long',
		day: 'numeric',
		month: 'long',
	});

	renderStaffToday();

	// hydration: the same glass as the Hydration tab, at card size
	const { by, total } = hydTotals(todayHydEntries());
	const goal = hydGoal();
	const den = Math.max(total, goal);
	let gy = 193;
	let gsvg = '';
	hydStackOrder(by).forEach((c) => {
		if (!by[c.key]) return;
		const h = (by[c.key] / den) * 185;
		gy -= h;
		gsvg += `<rect x="0" y="${gy.toFixed(1)}" width="120" height="${(h + 0.5).toFixed(1)}" style="fill:${normHex(c.color)}"/><line class="gmark" x1="0" x2="120" y1="${gy.toFixed(1)}" y2="${gy.toFixed(1)}"/>`;
	});
	$('#hubWater').innerHTML =
		`<span class="p-title">Hydration</span>` +
		`<div class="hubviz"><svg viewBox="0 0 120 200" role="img" aria-label="Glass showing today's intake against the goal"><defs><clipPath id="hgclip"><path d="M18 8H102L93 186Q92 193 85 193H35Q28 193 27 186Z"/></clipPath></defs><g clip-path="url(#hgclip)"><rect x="0" y="0" width="120" height="200" class="glassbg"/>${gsvg}</g><path class="glassline" d="M18 8H102L93 186Q92 193 85 193H35Q28 193 27 186Z"/></svg></div>` +
		`<div class="p-big">${formatMl(total)}</div><div class="muted">of ${formatMl(goal)}</div>`;

	renderHubWork();
	renderHubClock();
}

function renderHubWork() {
	// Discord time
	const ts = timerGetState();
	const t0 = sod(new Date()).getTime();
	const t1 = addD(sod(new Date()), 1).getTime();
	// minutes per category today (plus the running timer) -> a full bar
	const wby = {};
	const live = workLiveSession();
	(live ? S.work.sessions.concat(live) : S.work.sessions).forEach((x) => {
		const m = sessionMinutesIn(x, t0, t1);
		if (m > 0) wby[x.category] = (wby[x.category] || 0) + m;
	});
	// this month's split by category -> a small donut
	const mStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
	const mby = {};
	(live ? S.work.sessions.concat(live) : S.work.sessions).forEach((x) => {
		const m = sessionMinutesIn(x, mStart, t1);
		if (m > 0) mby[x.category] = (mby[x.category] || 0) + m;
	});
	const mtot = Object.values(mby).reduce((a, b) => a + b, 0);
	const OR = 48;
	const IR = 31;
	const hubUid = 'hd' + (window._hubDonutUid = (window._hubDonutUid || 0) + 1) + '-';
	let defs = '';
	let ring = '';
	const segs = workCats().filter((c) => mby[c.key] > 0);
	if (!segs.length) {
		ring = `<path fill-rule="evenodd" fill="var(--card2)" d="M50 ${50 - OR}A${OR} ${OR} 0 1 1 49.99 ${50 - OR}ZM50 ${50 - IR}A${IR} ${IR} 0 1 0 50.01 ${50 - IR}Z"/>`;
	} else if (segs.length === 1) {
		defs = sliceGradientDef(hubUid + '0', normHex(segs[0].color));
		ring = `<path fill-rule="evenodd" fill="url(#${hubUid}0)" d="M50 ${50 - OR}A${OR} ${OR} 0 1 1 49.99 ${50 - OR}ZM50 ${50 - IR}A${IR} ${IR} 0 1 0 50.01 ${50 - IR}Z"/>`;
	} else {
		let ang = -Math.PI / 2;
		segs.forEach((c, i) => {
			const end = ang + (mby[c.key] / mtot) * Math.PI * 2;
			defs += sliceGradientDef(hubUid + i, normHex(c.color));
			ring += `<path fill="url(#${hubUid}${i})" stroke="url(#${hubUid}${i})" stroke-width="0.6" stroke-linejoin="round" d="${ringSlicePath(50, 50, IR, OR, ang, end)}"/>`;
			ang = end;
		});
	}
	ring = `<defs>${defs}</defs>` + ring;
	const donut = `<div class="hubviz"><svg viewBox="0 0 100 100" role="img" aria-label="This month by category">${ring}<text x="50" y="54" text-anchor="middle" class="donutlbl">${formatMinutesAsHM(mtot)}</text></svg></div>`;
	let body;
	if (ts) {
		body =
			`<div class="p-big" id="hubTimer">${formatHMS(timerElapsedSeconds(ts))}</div>` +
			`<div class="muted">${ts.running ? 'Running' : 'Paused'} · ${esc(workCat(ts.category).label)}</div>`;
	} else {
		body =
			`<div class="p-big">${formatMinutesAsHM(workMinutesBetween(t0, t1))}</div>` +
			`<div class="muted">today</div>`;
	}
	body = donut + body;
	$('#hubWork').innerHTML = `<span class="p-title">Discord</span>` + body;
}

const HUB_ICONS = {
	work: '<rect x="3" y="8" width="18" height="12" rx="2"/><path d="M9 8V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 13h18"/>',
	lunch: '<path d="M5 9h11v5a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4zM16 10h1.5a2 2 0 0 1 0 4H16M8 3v2M12 3v2"/>',
	idle: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
	done: '<circle cx="12" cy="12" r="9"/><path d="M8 12.5l3 3 5-6"/>',
	vacation: '<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6L7 7M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4"/>',
	doctor: '<rect x="4" y="4" width="16" height="16" rx="4"/><path d="M12 8v8M8 12h8"/>',
	sick: '<path d="M14 14.8V5a2 2 0 0 0-4 0v9.8a4 4 0 1 0 4 0z"/>',
};

function renderHubClock() {
	// job clock: what you are doing right now, as an icon, with its time
	const day = clkDay(ymd(new Date())) || {};
	const w = liveWorked(day);
	const off = dayOff(day);
	const nowHM = hm(new Date());
	let icon, color, label, time;
	if (off && isFullOff(off) && !day.s) {
		icon = off.type === 'doctor' || off.type === 'sick' ? off.type : 'vacation';
		color = `var(--${offKey(off)})`;
		label = offLabel(off);
		time = 'all day';
	} else if (day.e) {
		icon = 'done';
		color = 'var(--pos)';
		label = 'Done';
		time = `ended ${day.e}`;
	} else if (day.ls && !day.le) {
		icon = 'lunch';
		color = 'var(--clock)';
		label = 'On lunch';
		time = `since ${day.ls}`;
	} else if (day.s) {
		icon = 'work';
		color = 'var(--clock)';
		label = 'Working';
		time = `since ${day.s}`;
	} else {
		icon = 'idle';
		color = 'var(--muted)';
		label = 'Not working';
		time = nowHM;
	}
	const extra =
		off && !isFullOff(off) ? ` · ${esc(offLabel(off))}` : '';
	$('#hubClock').innerHTML =
		`<span class="p-title">Job clock</span>` +
		`<div class="hubviz status" style="color:${color}"><svg viewBox="0 0 24 24" aria-hidden="true">${HUB_ICONS[icon]}</svg></div>` +
		`<div class="p-big hubstate">${label}</div>` +
		`<div class="muted">${time}</div>` +
		(w != null || extra
			? `<div class="muted">${w != null ? formatMinutesAsHM(w) + ' worked' : ''}${w != null ? extra : extra.replace(/^ · /, '')}</div>`
			: '');
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
// Bars and charts that include "now" are redrawn every few seconds.
let tickN = 0;
function tick() {
	const ts = timerGetState();
	tickN++;
	if (ts && ts.running && tickN % 5 === 0) {
		renderHubWork();
		if (cur === 'discord') chartDraw('work');
	}
	if (tickN % 15 === 0) {
		renderHubClock();
		if (cur === 'clock') chartDraw('clock');
	}
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