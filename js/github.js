// ===================== GitHub storage =====================
//
// Everything is saved as JSON files in a private GitHub repo through the
// GitHub Contents API. The token lives only in this browser's localStorage.
//
// How saving works:
//  - Every change is an "op": a function that edits the file's data. The UI
//    applies pending ops on top of the last copy from GitHub, so it updates
//    instantly.
//  - Ops are batched per file and written after a short pause (one commit
//    per file per batch).
//  - If GitHub says the file changed in the meantime (409/422), the file is
//    fetched again and the same ops are re-applied to the fresh copy. Edits
//    made on two devices are merged, and a delete never brings an entry back.
//  - Without a token the same files are kept in localStorage instead, so the
//    site works from the first visit.

// >>> The private data repo. Edit these if you ever move it. <<<
const REPO_CONFIG = {
	owner: 'SatisfyAi',
	repo: 'the-everything-site_data',
	branch: 'main',
	files: {
		work: 'data.json',
		hydration: 'hydration-data.json',
		clock: 'clock-data.json',
		staff: 'staff-data.json',
	},
};

const Store = (function () {
	const TOKEN_KEY = 'gh_settings_daybook';
	// Tokens saved by the previous separate Time Tracker / Hydration pages.
	const LEGACY_KEYS = [
		'gh_settings_timetracker',
		'gh_settings_hydrationtracker',
	];
	const CACHE_KEY = 'daybook-cache-v1';
	const LOCAL_PREFIX = 'daybook:f:';
	const NAMES = ['work', 'hydration', 'clock', 'staff'];

	const S = {
		mode: 'local', // 'github' once a token is saved
		status: 'loading', // loading | synced | saving | error | local
		lastError: null,
		remote: {}, // name -> { sha, data }: last copy confirmed by GitHub
		queue: [], // pending ops { name, mutate, msg }
		writes: 0, // counts successful writes (guards against stale loads)
		onChange: function () {},
		onStatus: function () {},
	};

	let views = {};
	let flushing = false;
	let flushTimer = null;
	let retryTimer = null;

	const invalidate = () => {
		views = {};
	};
	const delay = (ms) => new Promise((r) => setTimeout(r, ms));
	const b64 = (s) => btoa(unescape(encodeURIComponent(s)));
	const unb64 = (s) => decodeURIComponent(escape(atob(s.replace(/\n/g, ''))));

	/* ---------- token ---------- */
	function readToken() {
		try {
			const s = JSON.parse(localStorage.getItem(TOKEN_KEY));
			if (s && s.token) return s.token;
		} catch (e) {}
		for (const k of LEGACY_KEYS) {
			try {
				const s = JSON.parse(localStorage.getItem(k));
				if (s && s.token) return s.token;
			} catch (e) {}
		}
		return '';
	}
	S.token = '';
	S.init = function () {
		S.token = readToken();
		if (S.token && !localStorage.getItem(TOKEN_KEY)) {
			try {
				localStorage.setItem(TOKEN_KEY, JSON.stringify({ token: S.token }));
			} catch (e) {}
		}
		S.mode = S.token ? 'github' : 'local';
		S.status = S.mode === 'github' ? 'loading' : 'local';
		if (S.mode === 'github') loadCache();
	};
	S.setToken = function (token) {
		localStorage.setItem(TOKEN_KEY, JSON.stringify({ token }));
		S.token = token;
		S.mode = 'github';
		S.remote = {};
		S.queue = [];
		invalidate();
	};
	S.clearToken = function () {
		[TOKEN_KEY].concat(LEGACY_KEYS).forEach((k) => {
			try {
				localStorage.removeItem(k);
			} catch (e) {}
		});
		try {
			localStorage.removeItem(CACHE_KEY);
		} catch (e) {}
		S.token = '';
		S.mode = 'local';
		S.remote = {};
		S.queue = [];
		S.lastError = null;
		invalidate();
	};

	/* ---------- GitHub adapter ---------- */
	function ghError(res, body) {
		const e = new Error(
			(body && body.message) || `GitHub answered ${res.status}`,
		);
		e.status = res.status;
		return e;
	}
	const repoUrl = () =>
		`https://api.github.com/repos/${encodeURIComponent(REPO_CONFIG.owner)}/${encodeURIComponent(REPO_CONFIG.repo)}`;
	const fileUrl = (path) =>
		`${repoUrl()}/contents/${path.split('/').map(encodeURIComponent).join('/')}`;
	const headers = (extra, token) =>
		Object.assign(
			{
				Authorization: `Bearer ${token || S.token}`,
				Accept: 'application/vnd.github+json',
				'X-GitHub-Api-Version': '2022-11-28',
			},
			extra || {},
		);

	const gh = {
		read(path) {
			const url = `${fileUrl(path)}?ref=${encodeURIComponent(REPO_CONFIG.branch)}`;
			return fetch(url, { cache: 'no-store', headers: headers() }).then(
				(res) => {
					if (res.status === 404) return null;
					return res.json().then((j) => {
						if (!res.ok) throw ghError(res, j);
						if (Array.isArray(j)) return null;
						if (j.content)
							return { sha: j.sha, data: JSON.parse(unb64(j.content)) };
						// Files over 1 MB come back without inline content.
						return fetch(url, {
							cache: 'no-store',
							headers: headers({ Accept: 'application/vnd.github.raw+json' }),
						})
							.then((r2) => r2.text())
							.then((t) => ({ sha: j.sha, data: JSON.parse(t) }));
					});
				},
			);
		},
		write(path, data, sha, message) {
			const body = {
				message: 'Daybook: ' + message,
				content: b64(JSON.stringify(data, null, 2)),
				branch: REPO_CONFIG.branch,
			};
			if (sha) body.sha = sha;
			return fetch(fileUrl(path), {
				method: 'PUT',
				cache: 'no-store',
				headers: headers({ 'Content-Type': 'application/json' }),
				body: JSON.stringify(body),
			}).then((res) =>
				res.json().then((j) => {
					if (res.status === 409 || res.status === 422) {
						const c = ghError(res, j);
						c.conflict = true;
						throw c;
					}
					if (!res.ok) throw ghError(res, j);
					return j.content.sha;
				}),
			);
		},
	};

	/* ---------- localStorage adapter (same file layout) ---------- */
	const lo = {
		read(path) {
			const v = localStorage.getItem(LOCAL_PREFIX + path);
			return Promise.resolve(v ? JSON.parse(v) : null);
		},
		write(path, data) {
			const sha = String(Date.now()) + Math.random().toString(36).slice(2, 6);
			localStorage.setItem(LOCAL_PREFIX + path, JSON.stringify({ sha, data }));
			return Promise.resolve(sha);
		},
	};
	const adapter = () => (S.mode === 'github' ? gh : lo);

	/* ---------- status + cache ---------- */
	function setStatus(s) {
		S.status = s;
		S.onStatus(s);
	}
	const cacheKey = () =>
		[REPO_CONFIG.owner, REPO_CONFIG.repo, REPO_CONFIG.branch].join('/');
	function persistCache() {
		if (S.mode !== 'github') return;
		try {
			localStorage.setItem(
				CACHE_KEY,
				JSON.stringify({ k: cacheKey(), remote: S.remote }),
			);
		} catch (e) {}
	}
	function loadCache() {
		try {
			const c = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
			if (c && c.k === cacheKey() && c.remote) {
				S.remote = c.remote;
				NAMES.forEach((n) => {
					if (S.remote[n]) normalizeFile(n, S.remote[n].data);
				});
				invalidate();
			}
		} catch (e) {}
	}
	const norm = (name, res) => {
		if (res) normalizeFile(name, res.data);
		return res;
	};

	/* ---------- reading ---------- */
	// The current data for a file: the last copy from GitHub with pending
	// edits applied on top. Treat the result as read-only.
	S.get = function (name) {
		if (views[name]) return views[name];
		const pend = S.queue.filter((o) => o.name === name);
		const r = S.remote[name];
		let d;
		if (!pend.length) d = r ? r.data : EMPTY_FILE[name]();
		else {
			d = r ? clone(r.data) : EMPTY_FILE[name]();
			pend.forEach((o) => o.mutate(d));
		}
		views[name] = d;
		return d;
	};

	S.load = function () {
		const a = adapter();
		const stamp = S.writes;
		if (!S.queue.length) setStatus(S.mode === 'github' ? 'loading' : 'local');
		return Promise.all(NAMES.map((n) => a.read(REPO_CONFIG.files[n])))
			.then((res) => {
				// A save finished while we were loading: this copy is already stale.
				if (S.writes !== stamp || flushing) return;
				const next = {};
				NAMES.forEach((n, i) => {
					if (res[i]) next[n] = norm(n, res[i]);
				});
				S.remote = next;
				invalidate();
				persistCache();
				S.lastError = null;
				if (S.queue.length) scheduleFlush(300);
				else setStatus(S.mode === 'github' ? 'synced' : 'local');
				S.onChange();
			})
			.catch((err) => {
				S.lastError = err;
				setStatus('error');
				S.onChange();
				throw err;
			});
	};

	S.refresh = function () {
		if (S.queue.length) return S.flushNow();
		return S.load().catch(() => {});
	};

	/* ---------- writing ---------- */
	function scheduleFlush(ms) {
		clearTimeout(flushTimer);
		flushTimer = setTimeout(
			S.flushNow,
			ms == null ? (S.mode === 'github' ? 900 : 0) : ms,
		);
	}

	// Queue an edit. `mutate(data)` edits the file's data in place and must be
	// safe to run again on a fresh copy (add = upsert by id, delete = filter by id).
	S.commit = function (name, mutate, msg) {
		S.queue.push({ name, mutate, msg });
		invalidate();
		setStatus(S.mode === 'github' ? 'saving' : 'local');
		S.onChange();
		scheduleFlush();
	};

	function writeName(name, ops) {
		const a = adapter();
		const path = REPO_CONFIG.files[name];
		let attempts = 0;
		function attempt(base) {
			attempts++;
			const data = base ? clone(base.data) : EMPTY_FILE[name]();
			ops.forEach((o) => o.mutate(data));
			if (base && JSON.stringify(data) === JSON.stringify(base.data))
				return Promise.resolve(base);
			const msg =
				ops.length === 1
					? ops[0].msg
					: `${ops.length} changes: ${ops[0].msg}, …`;
			return a.write(path, data, base ? base.sha : null, msg).then(
				(sha) => ({ sha, data }),
				(err) => {
					if (err.conflict && attempts < 5) {
						return delay(300 * attempts)
							.then(() => a.read(path))
							.then((fresh) => attempt(norm(name, fresh)));
					}
					throw err;
				},
			);
		}
		return attempt(S.remote[name] || null);
	}

	S.flushNow = function () {
		clearTimeout(flushTimer);
		clearTimeout(retryTimer);
		if (flushing || !S.queue.length) return Promise.resolve();
		flushing = true;
		setStatus(S.mode === 'github' ? 'saving' : 'local');
		const batch = S.queue.slice();
		const byName = {};
		const order = [];
		batch.forEach((o) => {
			if (!byName[o.name]) {
				byName[o.name] = [];
				order.push(o.name);
			}
			byName[o.name].push(o);
		});
		let failed = false;
		let fatal = false;
		return order
			.reduce(
				(chain, name) =>
					chain.then(() => {
						if (fatal) return;
						return writeName(name, byName[name]).then(
							(res) => {
								S.remote[name] = res;
								S.writes++;
								S.queue = S.queue.filter((o) => byName[name].indexOf(o) < 0);
								invalidate();
							},
							(err) => {
								failed = true;
								S.lastError = err;
								if (
									err.status === 401 ||
									err.status === 403 ||
									err.status === 404
								)
									fatal = true;
							},
						);
					}),
				Promise.resolve(),
			)
			.then(() => {
				flushing = false;
				persistCache();
				if (failed) {
					setStatus('error');
					if (!fatal) retryTimer = setTimeout(S.flushNow, 20000);
				} else if (S.queue.length) {
					scheduleFlush(300);
				} else {
					S.lastError = null;
					setStatus(S.mode === 'github' ? 'synced' : 'local');
				}
				S.onChange();
			});
	};

	window.addEventListener('beforeunload', (e) => {
		if (S.mode === 'github' && S.queue.length) {
			e.preventDefault();
			e.returnValue = '';
		}
	});
	document.addEventListener('visibilitychange', () => {
		if (document.visibilityState === 'hidden' && S.queue.length) S.flushNow();
	});

	/* ---------- connection test ---------- */
	// Checks the token can reach the data repo, that the repo is private and
	// writable, and that the branch exists. Resolves { ok, message }.
	S.test = function (token) {
		const h = headers({}, token);
		const base = repoUrl();
		return fetch(base, { cache: 'no-store', headers: h }).then(
			(res) =>
				res
					.json()
					.catch(() => ({}))
					.then((j) => {
						if (res.status === 401)
							return {
								ok: false,
								message:
									'GitHub rejected the token. Check that it is correct and has not expired.',
							};
						if (res.status === 404)
							return {
								ok: false,
								message: `Repository ${REPO_CONFIG.owner}/${REPO_CONFIG.repo} not found, or the token has no access to it.`,
							};
						if (!res.ok)
							return {
								ok: false,
								message: j.message || `GitHub answered ${res.status}`,
							};
						if (j.private === false)
							return {
								ok: false,
								message:
									'This repository is public. Daybook only saves to a private repository so your data stays private.',
							};
						if (j.permissions && j.permissions.push === false)
							return {
								ok: false,
								message:
									'The token can read this repository but not write to it. Give it Contents: Read and write.',
							};
						return fetch(
							`${base}/branches/${encodeURIComponent(REPO_CONFIG.branch)}`,
							{
								cache: 'no-store',
								headers: h,
							},
						).then((b) =>
							b.status === 404
								? {
										ok: false,
										message: `Branch "${REPO_CONFIG.branch}" not found. If the repository is empty, add a README on GitHub first so the branch exists.`,
									}
								: {
										ok: true,
										message: `Connected to ${j.full_name || REPO_CONFIG.repo}.`,
									},
						);
					}),
			() => ({
				ok: false,
				message: 'Could not reach GitHub. Check your connection.',
			}),
		);
	};

	/* ---------- moving device-only data into the repo ---------- */
	// Data saved before a token was added (local mode), keyed by file name.
	S.readLocalAll = function () {
		const out = {};
		NAMES.forEach((n) => {
			try {
				const v = JSON.parse(
					localStorage.getItem(LOCAL_PREFIX + REPO_CONFIG.files[n]) || 'null',
				);
				if (v && v.data) out[n] = normalizeFile(n, v.data);
			} catch (e) {}
		});
		return out;
	};
	S.hasLocalData = function () {
		const l = S.readLocalAll();
		return (
			(l.work && l.work.sessions.length > 0) ||
			(l.hydration && l.hydration.entries.length > 0) ||
			(l.clock && Object.keys(l.clock.days).length > 0) ||
			(l.staff && l.staff.staff.length > 0)
		);
	};
	// Merges device-only records into the repo files. Nothing is overwritten:
	// records are matched by id (or by date / category key) and only added.
	S.importLocal = function (local) {
		if (local.work)
			S.commit(
				'work',
				(d) => {
					local.work.sessions.forEach((s) => {
						if (!d.sessions.some((x) => x.id === s.id)) d.sessions.push(s);
					});
					local.work.categories.forEach((c) => {
						if (!d.categories.some((x) => x.key === c.key))
							d.categories.push(c);
					});
				},
				'import work data from this device',
			);
		if (local.hydration)
			S.commit(
				'hydration',
				(d) => {
					local.hydration.entries.forEach((e) => {
						if (!d.entries.some((x) => x.id === e.id)) d.entries.push(e);
					});
					local.hydration.categories.forEach((c) => {
						if (!d.categories.some((x) => x.key === c.key))
							d.categories.push(c);
					});
				},
				'import hydration data from this device',
			);
		if (local.clock)
			S.commit(
				'clock',
				(d) => {
					Object.keys(local.clock.days).forEach((k) => {
						if (!d.days[k]) d.days[k] = local.clock.days[k];
					});
				},
				'import job clock data from this device',
			);
		if (local.staff)
			S.commit(
				'staff',
				(d) => {
					local.staff.staff.forEach((p) => {
						if (!d.staff.some((x) => x.id === p.id)) d.staff.push(p);
					});
				},
				'import staff list from this device',
			);
	};

	return S;
})();
