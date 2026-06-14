// Manages the "currently running" timer. Persisted to localStorage so it
// survives page reloads (but is local to this browser/device only).

const TIMER_KEY = 'tt_active_timer';

function timerGetState() {
  try {
    return JSON.parse(localStorage.getItem(TIMER_KEY)) || null;
  } catch {
    return null;
  }
}

function timerSetState(state) {
  if (state) {
    localStorage.setItem(TIMER_KEY, JSON.stringify(state));
  } else {
    localStorage.removeItem(TIMER_KEY);
  }
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
  const now = Date.now();
  const segStart = new Date(state.segmentStart).getTime();
  state.accumulatedSeconds += Math.floor((now - segStart) / 1000);
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

// Returns total elapsed seconds right now (including the current running segment).
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

// Stops the timer. Returns:
//  - a session object if the tracked time was at least 1 minute
//  - { discarded: true, elapsedSeconds } if it was under 1 minute (too short to log)
//  - null if there was no active timer
// Either way, the active timer state is cleared.
function timerStop() {
  const state = timerGetState();
  if (!state) return null;
  const elapsed = timerElapsedSeconds(state);
  timerSetState(null);

  if (elapsed < 60) {
    return { discarded: true, elapsedSeconds: elapsed };
  }

  return {
    id: cryptoRandomId(),
    category: state.category,
    startDate: state.originalStart,
    endDate: new Date().toISOString(),
    minutes: Math.round(elapsed / 60),
  };
}

// Discards the active timer without creating a session.
function timerCancel() {
  timerSetState(null);
}

function cryptoRandomId() {
  if (window.crypto && window.crypto.randomUUID)
    return window.crypto.randomUUID();
  return 'id-' + Date.now() + '-' + Math.random().toString(16).slice(2);
}

function formatHMS(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}
