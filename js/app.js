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
		html += seg(work, '--hours') + (o ? seg(off, '--' + offKey(o)) : '');
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
	const mStart = new Date(
		new Date().getFullYear(),
		new Date().getMonth(),
		1,
	).getTime();
	const mby = {};
	(live ? S.work.sessions.concat(live) : S.work.sessions).forEach((x) => {
		const m = sessionMinutesIn(x, mStart, t1);
		if (m > 0) mby[x.category] = (mby[x.category] || 0) + m;
	});
	const mtot = Object.values(mby).reduce((a, b) => a + b, 0);
	const OR = 48;
	const IR = 31;
	const hubUid =
		'hd' + (window._hubDonutUid = (window._hubDonutUid || 0) + 1) + '-';
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

// Font Awesome Free 7 icons (CC BY 4.0, fontawesome.com/license/free): [viewBox, path]
const HUB_ICONS = {
	vacation: [
		'0 0 512 512',
		'M497.5 341.1c-5.9 16.7-25.3 23-41.1 15.1l-178.2-89.1-1.6 3.2-88.8 177.7 292.2 0c17.7 0 32 14.3 32 32s-14.3 32-32 32L32 512c-17.7 0-32-14.3-32-32s14.3-32 32-32l84.2 0 103.2-206.3 1.6-3.2-165.4-82.7c-15.8-7.9-22.4-27.3-12.5-42 45.9-68.6 124.1-113.8 212.9-113.8 141.4 0 256 114.6 256 256 0 29.8-5.1 58.5-14.5 85.1z',
	],
	doctor: [
		'0 0 512 512',
		'M200 48l112 0c4.4 0 8 3.6 8 8l0 40-128 0 0-40c0-4.4 3.6-8 8-8zm-56 8l0 40-80 0C28.7 96 0 124.7 0 160L0 416c0 35.3 28.7 64 64 64l384 0c35.3 0 64-28.7 64-64l0-256c0-35.3-28.7-64-64-64l-80 0 0-40c0-30.9-25.1-56-56-56L200 0c-30.9 0-56 25.1-56 56zm80 160c0-8.8 7.2-16 16-16l32 0c8.8 0 16 7.2 16 16l0 40 40 0c8.8 0 16 7.2 16 16l0 32c0 8.8-7.2 16-16 16l-40 0 0 40c0 8.8-7.2 16-16 16l-32 0c-8.8 0-16-7.2-16-16l0-40-40 0c-8.8 0-16-7.2-16-16l0-32c0-8.8 7.2-16 16-16l40 0 0-40z',
	],
	sick: [
		'0 0 512 512',
		'M296 40c0-22.1-17.9-40-40-40s-40 17.9-40 40c0 44.1-53.3 66.1-84.5 35-15.6-15.6-40.9-15.6-56.6 0s-15.6 40.9 0 56.6c31.2 31.2 9.1 84.5-35 84.5-22.1 0-40 17.9-40 40s17.9 40 40 40c44.1 0 66.1 53.3 35 84.5-15.6 15.6-15.6 40.9 0 56.6s40.9 15.6 56.6 0c31.2-31.2 84.5-9.1 84.5 35 0 22.1 17.9 40 40 40s40-17.9 40-40c0-44.1 53.3-66.1 84.5-35 15.6 15.6 40.9 15.6 56.6 0s15.6-40.9 0-56.6c-31.2-31.2-9.1-84.5 35-84.5 22.1 0 40-17.9 40-40s-17.9-40-40-40c-44.1 0-66.1-53.3-35-84.5 15.6-15.6 15.6-40.9 0-56.6s-40.9-15.6-56.6 0C349.3 106.1 296 84.1 296 40zM160 224a32 32 0 1 1 64 0 32 32 0 1 1 -64 0zm160 32a32 32 0 1 1 0 64 32 32 0 1 1 0-64z',
	],
	idle: [
		'0 0 512 512',
		'M277.8 8.6c-12.3-11.4-31.3-11.4-43.5 0l-224 208c-9.6 9-12.8 22.9-8 35.1S18.8 272 32 272l16 0 0 176c0 35.3 28.7 64 64 64l288 0c35.3 0 64-28.7 64-64l0-176 16 0c13.2 0 25-8.1 29.8-20.3s1.6-26.2-8-35.1l-224-208zM200 256a56 56 0 1 1 112 0 56 56 0 1 1 -112 0zM144 432c0-44.2 35.8-80 80-80l64 0c44.2 0 80 35.8 80 80 0 8.8-7.2 16-16 16l-192 0c-8.8 0-16-7.2-16-16z',
	],
	lunch: [
		'0 0 512 512',
		'M0 176c0-35.3 28.7-64 64-64 .5 0 1.1 0 1.6 0 7.4-36.5 39.7-64 78.4-64 15 0 29 4.1 40.9 11.2 13.3-25.7 40.1-43.2 71.1-43.2s57.8 17.6 71.1 43.2c12-7.1 26-11.2 40.9-11.2 38.7 0 71 27.5 78.4 64 .5 0 1.1 0 1.6 0 35.3 0 64 28.7 64 64 0 11.7-3.1 22.6-8.6 32L8.6 208C3.1 198.6 0 187.7 0 176zM0 283.4C0 268.3 12.3 256 27.4 256l457.1 0c15.1 0 27.4 12.3 27.4 27.4 0 70.5-44.4 130.7-106.7 154.1L403.5 452c-2 16-15.6 28-31.8 28l-231.5 0c-16.1 0-29.8-12-31.8-28l-1.8-14.4C44.4 414.1 0 353.9 0 283.4z',
	],
	work: [
		'0 0 576 512',
		'M32 0C14.3 0 0 14.3 0 32S14.3 64 32 64l72.9 0 92.1 276.2c-22.5 17.6-37 45-37 75.8 0 53 43 96 96 96 52.4 0 95.1-42 96-94.3l202.1-67.4c16.8-5.6 25.8-23.7 20.2-40.5s-23.7-25.8-40.5-20.2L331.8 357c-17.2-22.1-43.9-36.5-74-37L165.7 43.8C156.9 17.6 132.5 0 104.9 0L32 0zM208 416a48 48 0 1 1 96 0 48 48 0 1 1 -96 0zM280.5 89.3c-25.2 8.2-39 35.3-30.8 60.5l39.6 121.7c8.2 25.2 35.3 39 60.5 30.8l121.7-39.6c25.2-8.2 39-35.3 30.8-60.5L462.8 80.5c-8.2-25.2-35.3-39-60.5-30.8L280.5 89.3z',
	],
	done: [
		'0 0 512 512',
		'M256 512a256 256 0 1 0 0-512 256 256 0 1 0 0 512zM374 145.7c10.7 7.8 13.1 22.8 5.3 33.5L260.7 342.9c-4.6 6.3-11.7 10.3-19.5 10.9s-15.5-2.1-21-7.7l-80-80c-9.4-9.4-9.4-24.6 0-33.9s24.6-9.4 33.9 0l57.5 57.5 102-140.2c7.8-10.7 22.8-13.1 33.5-5.3z',
	],
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
		label = 'Work done';
		time = `ended ${day.e}`;
	} else if (day.ls && !day.le) {
		icon = 'lunch';
		color = 'var(--clock)';
		label = 'Having lunch';
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
	const extra = off && !isFullOff(off) ? ` · ${esc(offLabel(off))}` : '';
	$('#hubClock').innerHTML =
		`<span class="p-title">Job clock</span>` +
		`<div class="hubviz status" style="color:${color}"><svg viewBox="${HUB_ICONS[icon][0]}" aria-hidden="true"><path d="${HUB_ICONS[icon][1]}"/></svg></div>` +
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
