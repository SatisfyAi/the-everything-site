// ===================== Hydration =====================
// Data: S.hyd = hydration-data.json
//   { categories: [{ key, label, color }],
//     entries:    [{ id, category, date, amount }],
//     settings:   { goal, amounts: { <key>: ml } } }

let hydEditId = null;
let hydMonth = null; // 'YYYY-MM' | 'all' | null (= current month)
let hydLimit = 30;
let hydLastAdded = null;
let hydNoteTimer = null;

const hydCats = () => S.hyd.categories;
const entryTime = (e) => Date.parse(e.date);

function hydCat(key) {
	return (
		hydCats().find((c) => c.key === key) || {
			key,
			label: key,
			color: '#666666',
		}
	);
}

// How much one tap on a drink logs.
function tapAmount(key) {
	const a = (S.hyd.settings && S.hyd.settings.amounts) || {};
	const v = Number(a[key]);
	return v > 0 ? v : DEFAULT_TAP[key] || DEFAULT_TAP_FALLBACK;
}

function hydGoal() {
	const g = Number(S.hyd.settings && S.hyd.settings.goal);
	return g > 0 ? g : 2000;
}

// The drink the "+ water" shortcut on Today uses.
function quickDrink() {
	return hydCats().find((c) => c.key === 'Water') || hydCats()[0];
}

function todayHydEntries() {
	const a = sod(new Date()).getTime();
	const b = addD(sod(new Date()), 1).getTime();
	return S.hyd.entries.filter((e) => {
		const t = entryTime(e);
		return t >= a && t < b;
	});
}

function hydTotals(list) {
	const by = {};
	let total = 0;
	list.forEach((e) => {
		const v = Number(e.amount) || 0;
		by[e.category] = (by[e.category] || 0) + v;
		total += v;
	});
	return { by, total };
}

/* ---------- actions ---------- */
function hydNote(html) {
	const el = $('#hydNote');
	el.innerHTML = html;
	clearTimeout(hydNoteTimer);
	hydNoteTimer = setTimeout(() => {
		el.innerHTML = '';
		hydLastAdded = null;
	}, 7000);
}

function addDrink(key, ml, whenMs) {
	ml = Math.round(ml);
	if (!(ml > 0)) return;
	const entry = {
		id: cryptoRandomId(),
		category: key,
		date: new Date(whenMs || Date.now()).toISOString(),
		amount: ml,
	};
	hydLastAdded = entry.id;
	Store.commit(
		'hydration',
		(d) => upsertItem(d, 'entries', entry),
		`add ${key} ${ml}ml`,
	);
	hydNote(
		`Added ${formatMl(ml)} ${esc(hydCat(key).label.toLowerCase())}. <button type="button" data-undo="1">Undo</button>`,
	);
}

function removeEntry(id) {
	Store.commit(
		'hydration',
		(d) => removeItem(d, 'entries', id),
		'remove entry',
	);
}

function hydNowIntoForm() {
	const n = new Date();
	$('#mdDate').value = ymd(n);
	$('#mdTime').value = hm(n);
}

function hydResetForm() {
	hydEditId = null;
	$('#mdMl').value = '';
	$('#mdAdd').textContent = 'Add entry';
	$('#mdCancel').hidden = true;
	$('#hydMoreTitle').textContent = 'Different amount or time';
	hydNowIntoForm();
	renderPresets();
}

function hydStartEdit(id) {
	const e = S.hyd.entries.find((x) => x.id === id);
	if (!e) return;
	hydEditId = id;
	renderWater();
	const when = new Date(e.date);
	$('#mdDrink').value = e.category;
	$('#mdMl').value = e.amount;
	$('#mdDate').value = ymd(when);
	$('#mdTime').value = hm(when);
	$('#mdAdd').textContent = 'Update entry';
	$('#mdCancel').hidden = false;
	$('#hydMoreTitle').textContent = 'Edit entry';
	$('#hydMore').open = true;
	renderPresets();
	$('#hydMore').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function saveHydForm() {
	const ml = Number($('#mdMl').value);
	const d = $('#mdDate').value;
	const t = $('#mdTime').value;
	const key = $('#mdDrink').value;
	if (!key) {
		hydNote('Pick a drink first.');
		return;
	}
	if (!(ml > 0)) {
		hydNote('Enter an amount greater than 0ml, or pick a quick amount.');
		return;
	}
	let when = d && t ? new Date(`${d}T${t}`).getTime() : Date.now();
	if (isNaN(when)) when = Date.now();

	if (hydEditId) {
		const entry = {
			id: hydEditId,
			category: key,
			date: new Date(when).toISOString(),
			amount: Math.round(ml),
		};
		Store.commit(
			'hydration',
			(dd) => upsertItem(dd, 'entries', entry),
			`edit ${key} entry`,
		);
		hydResetForm();
	} else {
		addDrink(key, ml, when);
		// Keep the drink so several in a row are quick; reset amount and time.
		$('#mdMl').value = '';
		hydNowIntoForm();
		renderPresets();
	}
}

/* ---------- rendering ---------- */
function renderPresets() {
	const cur = Number($('#mdMl').value) || null;
	$('#mdPresets').innerHTML = HYDRATION_PRESETS.map(
		(a) =>
			`<button class="chip${cur === a ? ' on' : ''}" type="button" data-amt="${a}" style="--cc:var(--accent);--onc:var(--on)">${a}ml</button>`,
	).join('');
}

function hydStackOrder(by) {
	const order = hydCats().slice();
	Object.keys(by).forEach((k) => {
		if (!order.some((c) => c.key === k))
			order.push({ key: k, label: k, color: '#666666' });
	});
	return order;
}

function hydMonthOptions() {
	const months = new Set([ymKey(new Date())]);
	S.hyd.entries.forEach((e) => {
		const t = entryTime(e);
		if (!isNaN(t)) months.add(ymKey(new Date(t)));
	});
	return Array.from(months).sort().reverse();
}

function renderWater() {
	const { by, total } = hydTotals(todayHydEntries());
	const goal = hydGoal();
	const den = Math.max(total, goal);
	const H = 185;
	let y = 193;
	let svg = '';
	hydStackOrder(by).forEach((c) => {
		if (!by[c.key]) return;
		const h = (by[c.key] / den) * H;
		y -= h;
		svg += `<rect x="0" y="${y.toFixed(1)}" width="120" height="${(h + 0.5).toFixed(1)}" style="fill:${normHex(c.color)}"/><line class="gmark" x1="0" x2="120" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}"/>`;
	});
	$('#glassFill').innerHTML = svg;
	$('#gTotal').textContent = formatMl(total);
	$('#gOf').textContent =
		`${Math.round((total / goal) * 100)}% of ${formatMl(goal)}`;

	$('#drinkChips').innerHTML = hydCats()
		.map(
			(c) =>
				`<button class="drink" type="button" data-drink="${esc(c.key)}"><b><i style="background:${normHex(c.color)}"></i>${esc(c.label)}</b><small>+${tapAmount(c.key)}ml</small></button>`,
		)
		.join('');

	const opts = hydCats().map((c) => ({ value: c.key, label: c.label }));
	if (hydEditId) {
		const e = S.hyd.entries.find((x) => x.id === hydEditId);
		if (e && !opts.some((o) => o.value === e.category))
			opts.push({ value: e.category, label: e.category });
	}
	setOptions($('#mdDrink'), opts);

	// history
	const months = hydMonthOptions();
	const sel = $('#hydMonth');
	const cur = hydMonth || ymKey(new Date());
	const prev = sel.value;
	sel.innerHTML =
		`<option value="all">All time</option>` +
		months
			.map((m) => {
				const [yy, mm] = m.split('-').map(Number);
				return `<option value="${m}">${loc(new Date(yy, mm - 1, 1), { month: 'long', year: 'numeric' })}</option>`;
			})
			.join('');
	sel.value = cur === 'all' || months.includes(cur) ? cur : 'all';
	if (!sel.value && prev) sel.value = prev;

	let items = S.hyd.entries.filter((e) => !isNaN(entryTime(e)));
	if (sel.value !== 'all')
		items = items.filter((e) => ymKey(new Date(entryTime(e))) === sel.value);
	items.sort((a, b) => entryTime(b) - entryTime(a));
	const shown = items.slice(0, hydLimit);
	$('#hydList').innerHTML = shown.length
		? shown
				.map((e) => {
					const c = hydCat(e.category);
					const t = entryTime(e);
					return `<div class="row"><span class="when">${dateLabel(t)} ${hm(new Date(t))}</span><span class="what"><i class="dotc" style="background:${normHex(c.color)}"></i><span>${esc(c.label)}</span></span><span class="val">${formatMl(Number(e.amount) || 0)}</span><button class="x ed" type="button" data-edit="${esc(e.id)}" aria-label="Edit entry">✎</button><button class="x del" type="button" data-del="${esc(e.id)}" aria-label="Delete entry">×</button></div>`;
				})
				.join('')
		: '<div class="empty">Nothing logged for this period. Tap a drink above to add an entry.</div>';
	$('#hydMoreBtn').hidden = items.length <= hydLimit;

	chartDraw('water');
}

function dateLabel(t) {
	const d = sod(new Date(t));
	const diff = Math.round((sod(new Date()) - d) / 864e5);
	if (diff === 0) return 'Today';
	if (diff === 1) return 'Yesterday';
	return loc(d, { weekday: 'short', day: 'numeric', month: 'short' });
}

/* ---------- chart ---------- */
function hydSeries() {
	const s = hydCats().map((c) => ({ k: c.key, n: c.label, color: c.color }));
	const known = new Set(s.map((x) => x.k));
	S.hyd.entries.forEach((e) => {
		if (!known.has(e.category)) {
			known.add(e.category);
			s.push({ k: e.category, n: e.category, color: '#666666' });
		}
	});
	return s;
}

const hydChartCfg = {
	range: 'week',
	ranges: ['day', 'week', 'month', 'year', 'all'],
	series: hydSeries,
	data: (bs) =>
		bs.map((b) => {
			const vals = {};
			S.hyd.entries.forEach((e) => {
				const t = entryTime(e);
				if (t >= b.s && t < b.e)
					vals[e.category] = (vals[e.category] || 0) + (Number(e.amount) || 0);
			});
			return { vals };
		}),
	first: () => {
		let m = Infinity;
		S.hyd.entries.forEach((e) => {
			const t = entryTime(e);
			if (t < m) m = t;
		});
		return isFinite(m) ? m : null;
	},
	steps: [100, 250, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000, 200000],
	emptyStep: 500,
	axis: (v) => (v >= 1000 ? `${v / 1000}L` : String(v)),
	fmt: formatMl,
	goal: hydGoal,
	goalLabel: 'Goal',
	aria: 'Drinks logged',
	donut: { inner: 0, prefix: 'Hydration' },
	stats: (i) => {
		const o = [['Total', formatMl(i.sum)]];
		if (i.range !== 'day') o.push(['Daily average', formatMl(i.sum / i.days)]);
		if (i.range === 'week' || i.range === 'month') {
			const g = hydGoal();
			const n = Date.now();
			const ok = i.list.filter((b, k) => b.s <= n && i.totals[k] >= g).length;
			o.push(['Goal reached', `${ok} of ${i.days} days`]);
		}
		return o;
	},
};

/* ---------- wiring ---------- */
function hydInit() {
	chartInit('water', hydChartCfg);
	hydNowIntoForm();
	renderPresets();

	$('#mdAdd').addEventListener('click', saveHydForm);
	$('#mdCancel').addEventListener('click', hydResetForm);
	$('#mdMl').addEventListener('input', renderPresets);
	$('#hydMore').addEventListener('toggle', () => {
		if ($('#hydMore').open && !hydEditId) hydNowIntoForm();
	});
	$('#hydMonth').addEventListener('change', () => {
		hydMonth = $('#hydMonth').value;
		hydLimit = 30;
		renderWater();
	});
	$('#hydMoreBtn').addEventListener('click', () => {
		hydLimit += 30;
		renderWater();
	});

	$('#v-water').addEventListener('click', (e) => {
		const t = e.target.closest('button');
		if (!t) return;
		if (t.dataset.drink) {
			addDrink(t.dataset.drink, tapAmount(t.dataset.drink));
		} else if (t.dataset.undo) {
			if (hydLastAdded) removeEntry(hydLastAdded);
			hydLastAdded = null;
			$('#hydNote').innerHTML = '';
		} else if (t.dataset.amt) {
			$('#mdMl').value = t.dataset.amt;
			renderPresets();
		} else if (t.dataset.edit) {
			hydStartEdit(t.dataset.edit);
		} else if (t.dataset.del) {
			if (confirmArm(t)) removeEntry(t.dataset.del);
		}
	});
}
