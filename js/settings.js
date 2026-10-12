// ===================== Settings =====================
// GitHub connection, theme, hydration goal, drink and Discord category
// editors, and the job-clock numbers.

/* ---------- GitHub connection ---------- */
function ghMsg(text, isError) {
	const el = $('#ghMsg');
	el.textContent = text;
	el.className = 'note' + (isError ? ' error' : '');
}

function fillGh() {
	const connected = Store.mode === 'github';
	$('#ghIntro').textContent = connected
		? `Connected to ${REPO_CONFIG.owner}/${REPO_CONFIG.repo}. Every change is saved as a commit to JSON files in that private repository.`
		: 'Not connected. Data is saved on this device only. Add a token for your private data repository to keep it safe and use it on every device.';
	$('#ghToken').placeholder = connected
		? 'Saved on this device. Leave empty to keep it.'
		: 'github_pat_...';
	$('#ghDisconnect').hidden = !connected;
	$('#ghReload').hidden = !connected;
	$('#ghMigrateRow').hidden = connected || !Store.hasLocalData();
}

async function connectGithub() {
	const btn = $('#ghSave');
	const token = $('#ghToken').value.trim() || Store.token;
	if (!token) {
		ghMsg('Personal access token is required.', true);
		return;
	}
	btn.disabled = true;
	ghMsg('Testing connection…');
	const r = await Store.test(token);
	if (!r.ok) {
		ghMsg(r.message, true);
		btn.disabled = false;
		return;
	}
	const local =
		!$('#ghMigrateRow').hidden && $('#ghMigrate').checked
			? Store.readLocalAll()
			: null;
	Store.setToken(token);
	$('#ghToken').value = '';
	ghMsg(`${r.message} Loading your data…`);
	try {
		await Store.load();
		if (local) Store.importLocal(local);
		ghMsg(
			local
				? 'Connected. Data from this device is being copied to the repository.'
				: 'Connected and synced.',
		);
	} catch (e) {
		ghMsg(`Connected, but loading failed: ${e.message}`, true);
	}
	btn.disabled = false;
	fillGh();
	renderAll();
}

/* ---------- category editor (used for drinks and Discord categories) ---------- */
// name: 'work' | 'hydration'. Every change is one small op on the file.
function catOp(name, msg, fn) {
	Store.commit(
		name,
		(d) => {
			fn(d.categories, d);
		},
		msg,
	);
}

function moveCategory(name, fromKey, toKey) {
	if (fromKey === toKey) return;
	catOp(name, 'reorder categories', (cats) => {
		const from = cats.findIndex((c) => c.key === fromKey);
		const to = cats.findIndex((c) => c.key === toKey);
		if (from < 0 || to < 0) return;
		const [m] = cats.splice(from, 1);
		cats.splice(to, 0, m);
	});
}

function nudgeCategory(name, key, dir) {
	catOp(name, 'reorder categories', (cats) => {
		const i = cats.findIndex((c) => c.key === key);
		const j = i + dir;
		if (i < 0 || j < 0 || j >= cats.length) return;
		[cats[i], cats[j]] = [cats[j], cats[i]];
	});
}

function categoryInUse(name, key) {
	return Store.get(name)[ITEMS_KEY[name]].some((x) => x.category === key);
}

function renderCatEditor(listEl, name) {
	const cats = Store.get(name).categories;
	listEl.innerHTML = '';
	cats.forEach((cat, idx) => {
		const row = document.createElement('div');
		row.className = 'catrow';
		row.draggable = true;
		row.dataset.key = cat.key;

		const handle = document.createElement('span');
		handle.className = 'handle';
		handle.textContent = '⠿';
		handle.title = 'Drag to reorder';

		const color = document.createElement('input');
		color.type = 'color';
		color.className = 'cpick';
		color.value = normHex(cat.color);
		color.setAttribute('aria-label', 'Colour');

		const hex = document.createElement('input');
		hex.type = 'text';
		hex.className = 'hex';
		hex.value = normHex(cat.color);
		hex.maxLength = 7;
		hex.setAttribute('aria-label', 'Colour code');

		const label = document.createElement('input');
		label.type = 'text';
		label.className = 'lbl';
		label.value = cat.label;
		label.maxLength = 40;
		label.setAttribute('aria-label', 'Name');

		const setColor = (v) =>
			catOp(name, `recolour ${cat.key}`, (cs) => {
				const c = cs.find((x) => x.key === cat.key);
				if (c) c.color = v;
			});
		color.addEventListener('input', () => {
			hex.value = color.value;
		});
		color.addEventListener('change', () => setColor(color.value));
		hex.addEventListener('change', () => {
			let v = hex.value.trim();
			if (v && v[0] !== '#') v = '#' + v;
			if (!/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v)) {
				hex.value = normHex(cat.color);
				return;
			}
			v = normHex(v);
			hex.value = v;
			color.value = v;
			setColor(v);
		});
		label.addEventListener('change', () => {
			const v = label.value.trim();
			if (!v) {
				label.value = cat.label;
				return;
			}
			catOp(name, `rename ${cat.key}`, (cs) => {
				const c = cs.find((x) => x.key === cat.key);
				if (c) c.label = v;
			});
		});

		const parts = [handle, color, hex, label];

		if (name === 'hydration') {
			const tap = document.createElement('input');
			tap.type = 'number';
			tap.className = 'tap';
			tap.min = '10';
			tap.step = '10';
			tap.value = tapAmount(cat.key);
			tap.title = 'One-tap amount (ml)';
			tap.setAttribute('aria-label', `${cat.label} one-tap amount in ml`);
			tap.addEventListener('change', () => {
				const v = Math.round(Number(tap.value));
				if (!(v >= 10)) {
					tap.value = tapAmount(cat.key);
					return;
				}
				Store.commit(
					'hydration',
					(d) => {
						d.settings.amounts[cat.key] = v;
					},
					`${cat.key} tap amount ${v}ml`,
				);
			});
			const unit = document.createElement('span');
			unit.className = 'unit';
			unit.textContent = 'ml';
			parts.push(tap, unit);
		}

		const mk = (cls, text, aria, fn, disabled) => {
			const b = document.createElement('button');
			b.type = 'button';
			b.className = 'x ' + cls;
			b.textContent = text;
			b.setAttribute('aria-label', aria);
			b.disabled = !!disabled;
			b.addEventListener('click', fn);
			return b;
		};
		parts.push(
			mk(
				'up',
				'▲',
				'Move up',
				() => nudgeCategory(name, cat.key, -1),
				idx === 0,
			),
			mk(
				'down',
				'▼',
				'Move down',
				() => nudgeCategory(name, cat.key, 1),
				idx === cats.length - 1,
			),
			mk(
				'del',
				'×',
				'Delete',
				(e) => {
					if (categoryInUse(name, cat.key)) {
						ghMsgFor(
							listEl,
							`"${cat.label}" has entries, so it can't be deleted. You can still rename or recolour it.`,
						);
						return;
					}
					if (cats.length < 2) return;
					if (!confirmArm(e.currentTarget)) return;
					catOp(name, `delete category ${cat.key}`, (cs, d) => {
						d.categories = cs.filter((c) => c.key !== cat.key);
						if (d.settings && d.settings.amounts)
							delete d.settings.amounts[cat.key];
					});
				},
				cats.length < 2,
			),
		);
		row.append(...parts);

		// Drag-and-drop reordering (desktop). On touch screens use the arrows.
		row.addEventListener('dragstart', (e) => {
			e.dataTransfer.effectAllowed = 'move';
			e.dataTransfer.setData('text/plain', cat.key);
			row.classList.add('dragging');
		});
		row.addEventListener('dragend', () => {
			row.classList.remove('dragging');
			$$('.catrow', listEl).forEach((r) => r.classList.remove('drag-over'));
		});
		row.addEventListener('dragover', (e) => {
			e.preventDefault();
			e.dataTransfer.dropEffect = 'move';
			$$('.catrow', listEl).forEach((r) => r.classList.remove('drag-over'));
			row.classList.add('drag-over');
		});
		row.addEventListener('dragleave', () => row.classList.remove('drag-over'));
		row.addEventListener('drop', (e) => {
			e.preventDefault();
			row.classList.remove('drag-over');
			moveCategory(name, e.dataTransfer.getData('text/plain'), cat.key);
		});

		listEl.appendChild(row);
	});
}

// Small inline message under an editor list.
function ghMsgFor(listEl, text) {
	let el = listEl.nextElementSibling;
	if (!el || !el.classList.contains('catmsg')) {
		el = document.createElement('div');
		el.className = 'note error catmsg';
		listEl.after(el);
	}
	el.textContent = text;
	setTimeout(() => el.isConnected && (el.textContent = ''), 6000);
}

function addCategory(name, labelInput, colorInput, listEl) {
	const label = labelInput.value.trim();
	if (!label) {
		ghMsgFor(listEl, 'Enter a name first.');
		return;
	}
	const existing = Store.get(name).categories.map((c) => c.key);
	const key = categoryKeyFromLabel(label, existing);
	const color = normHex(colorInput.value);
	Store.commit(
		name,
		(d) => {
			if (!d.categories.some((c) => c.key === key))
				d.categories.push({ key, label, color });
		},
		`add category ${key}`,
	);
	labelInput.value = '';
}

/* ---------- theme ---------- */
function applyTheme(t) {
	try {
		localStorage.setItem('daybook-theme', t);
	} catch (e) {}
	if (t === 'auto') document.documentElement.removeAttribute('data-theme');
	else document.documentElement.setAttribute('data-theme', t);
	renderAll();
}

function currentTheme() {
	try {
		return localStorage.getItem('daybook-theme') || 'dark';
	} catch (e) {
		return 'dark';
	}
}

/* ---------- render ---------- */
function renderSettings(force) {
	const v = $('#v-settings');
	const ae = document.activeElement;
	if (
		!force &&
		v.contains(ae) &&
		(ae.tagName === 'INPUT' || ae.tagName === 'SELECT')
	)
		return;

	fillGh();
	$$('#themeSeg [data-theme]').forEach((b) =>
		b.classList.toggle('on', b.dataset.theme === currentTheme()),
	);
	$('#setGoal').value = hydGoal();
	renderCatEditor($('#setDrinks'), 'hydration');
	renderCatEditor($('#setCats'), 'work');
	const c = clkSettings();
	$('#setStart').value = c.startShift;
	$('#setEnd').value = c.endShift;
	$('#setTarget').value = c.dayTarget / 60;
}

/* ---------- wiring ---------- */
function settingsInit() {
	$('#ghSave').addEventListener('click', connectGithub);
	$('#ghReload').addEventListener('click', async () => {
		ghMsg('Reloading…');
		try {
			await Store.refresh();
			ghMsg(
				Store.status === 'error'
					? 'Could not reload.'
					: 'Reloaded from GitHub.',
				Store.status === 'error',
			);
		} catch (e) {
			ghMsg(`Error: ${e.message}`, true);
		}
	});
	$('#ghDisconnect').addEventListener('click', (e) => {
		if (!confirmArm(e.currentTarget, 'Remove token?')) return;
		Store.clearToken();
		ghMsg(
			'Disconnected. The token was removed from this device. Data in the repository is untouched.',
		);
		Store.load().catch(() => {});
		fillGh();
		renderAll();
	});

	$('#themeSeg').addEventListener('click', (e) => {
		const b = e.target.closest('[data-theme]');
		if (b) applyTheme(b.dataset.theme);
	});

	$('#setGoal').addEventListener('change', (e) => {
		const v = Math.round(Number(e.target.value));
		if (!(v >= 100)) {
			e.target.value = hydGoal();
			return;
		}
		Store.commit(
			'hydration',
			(d) => {
				d.settings.goal = v;
			},
			`daily goal ${v}ml`,
		);
	});

	$('#addDrink').addEventListener('click', () =>
		addCategory(
			'hydration',
			$('#newDrinkLabel'),
			$('#newDrinkColor'),
			$('#setDrinks'),
		),
	);
	$('#addCat').addEventListener('click', () =>
		addCategory('work', $('#newCatLabel'), $('#newCatColor'), $('#setCats')),
	);
	[
		['newDrinkLabel', 'addDrink'],
		['newCatLabel', 'addCat'],
	].forEach(([i, b]) =>
		$('#' + i).addEventListener('keydown', (e) => {
			if (e.key === 'Enter') $('#' + b).click();
		}),
	);

	const clockSet = (key, fn, msg) => (e) => {
		const raw = Number(e.target.value);
		if (isNaN(raw) || e.target.value === '') {
			renderSettings(true);
			return;
		}
		const v = fn(raw);
		Store.commit(
			'clock',
			(d) => {
				d.settings[key] = v;
			},
			msg(v),
		);
	};
	$('#setStart').addEventListener(
		'change',
		clockSet('startShift', Math.round, (v) => `start shift ${v} min`),
	);
	$('#setEnd').addEventListener(
		'change',
		clockSet('endShift', Math.round, (v) => `end shift ${v} min`),
	);
	$('#setTarget').addEventListener('change', (e) => {
		const h = Number(e.target.value);
		if (isNaN(h) || h < 0 || e.target.value === '') {
			renderSettings(true);
			return;
		}
		Store.commit(
			'clock',
			(d) => {
				d.settings.dayTarget = Math.round(h * 60);
			},
			`daily target ${h}h`,
		);
	});
}
