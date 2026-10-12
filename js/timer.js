// ===================== Running timer =====================
// The "currently running" Discord-time timer. Persisted to localStorage so it
// survives page reloads (but is local to this browser/device only).
// Same storage key and shape as the old Time Tracker page, so a timer that
// is running while you update keeps going.

const TIMER_KEY = 'tt_active_timer';

function timerGetState() {
	try {
		return JSON.parse(localStorage.getItem(TIMER_KEY)) || null;
	} catch {
		return null;
	}
}

function timerSetState(state) {
	if (state) localStorage.setItem(TIMER_KEY, JSON.stringify(state));
	else localStorage.removeItem(TIMER_KEY);
}

// Starts a brand new timer for the given category key.
function timerStart(categoryKey) {
	const now = new Date().toISOString();
	const state = {
		category: categoryKey,
		originalStart: now,
		segmentStart: now,
		accumulatedSeconds: 0,
		running: true,
	};
	timerSetState(state);
	return state;
}

// Pauses the running timer, folding the current segment into accumulatedSeconds.
function timerPause() {
	const state = timerGetState();
	if (!state || !state.running) return state;
	const segStart = new Date(state.segmentStart).getTime();
	state.accumulatedSeconds += Math.floor((Date.now() - segStart) / 1000);
	state.segmentStart = null;
	state.running = false;
	timerSetState(state);
	return state;
}

// Resumes a paused timer, starting a new segment.
function timerResume() {
	const state = timerGetState();
	if (!state || state.running) return state;
	state.segmentStart = new Date().toISOString();
	state.running = true;
	timerSetState(state);
	return state;
}

// Total elapsed seconds right now (including the running segment).
function timerElapsedSeconds(state) {
	if (!state) return 0;
	let total = state.accumulatedSeconds || 0;
	if (state.running && state.segmentStart) {
		total += Math.floor(
			(Date.now() - new Date(state.segmentStart).getTime()) / 1000,
		);
	}
	return total;
}

// Stops the timer and clears it. Returns:
//  - a session object if at least 1 minute was tracked
//  - { discarded: true, elapsedSeconds } if it was under a minute
//  - null if there was no active timer
function timerStop(note) {
	const state = timerGetState();
	if (!state) return null;
	const elapsed = timerElapsedSeconds(state);
	timerSetState(null);

	if (elapsed < 60) return { discarded: true, elapsedSeconds: elapsed };

	const session = {
		id: cryptoRandomId(),
		category: state.category,
		startDate: state.originalStart,
		endDate: new Date().toISOString(),
		minutes: Math.round(elapsed / 60),
	};
	if (note) session.note = note;
	return session;
}

// Discards the active timer without creating a session.
function timerCancel() {
	timerSetState(null);
}
