// ===================== Charts =====================
// Two renderers, both inline SVG (crisp at any zoom):
//  1. drawRingChart: the donut / pie "report" image, with its legend. Kept
//     from the original site, including the PNG export.
//  2. the stacked bar chart used on every section (Day / Week / Month /
//     Year / All time, with the previous/next arrows).

/* ------------------------------------------------------------------ */
/* 1. Ring chart (donut / pie)                                         */
/* ------------------------------------------------------------------ */

const CHART_FONT_FAMILY = "'Poppins', 'Segoe UI', sans-serif";

// A detached canvas used ONLY for text-width measurement (ctx.measureText).
const _chartMeasureCtx = document.createElement('canvas').getContext('2d');

function escapeXml(str) {
	return String(str).replace(
		/[&<>"']/g,
		(c) =>
			({
				'&': '&amp;',
				'<': '&lt;',
				'>': '&gt;',
				'"': '&quot;',
				"'": '&apos;',
			})[c],
	);
}

// Lightens a hex color toward white by `amount` (0-1)
function lightenColor(hex, amount) {
	const r = parseInt(hex.slice(1, 3), 16);
	const g = parseInt(hex.slice(3, 5), 16);
	const b = parseInt(hex.slice(5, 7), 16);
	const nr = Math.round(r + (255 - r) * amount);
	const ng = Math.round(g + (255 - g) * amount);
	const nb = Math.round(b + (255 - b) * amount);
	return `rgb(${nr},${ng},${nb})`;
}

function polarPoint(cx, cy, r, angle) {
	return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
}

// SVG path for one ring slice between two angles. With innerR === 0 this
// degenerates to a normal pie wedge, so the same builder covers pie and donut.
function ringSlicePath(cx, cy, innerR, outerR, startAngle, endAngle) {
	const outerStart = polarPoint(cx, cy, outerR, startAngle);
	const outerEnd = polarPoint(cx, cy, outerR, endAngle);
	const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;

	if (innerR <= 0) {
		return [
			`M ${cx} ${cy}`,
			`L ${outerStart.x} ${outerStart.y}`,
			`A ${outerR} ${outerR} 0 ${largeArc} 1 ${outerEnd.x} ${outerEnd.y}`,
			'Z',
		].join(' ');
	}

	const innerStart = polarPoint(cx, cy, innerR, endAngle);
	const innerEnd = polarPoint(cx, cy, innerR, startAngle);

	return [
		`M ${outerStart.x} ${outerStart.y}`,
		`A ${outerR} ${outerR} 0 ${largeArc} 1 ${outerEnd.x} ${outerEnd.y}`,
		`L ${innerStart.x} ${innerStart.y}`,
		`A ${innerR} ${innerR} 0 ${largeArc} 0 ${innerEnd.x} ${innerEnd.y}`,
		'Z',
	].join(' ');
}

// Vertical gradient scoped to each slice's own bounding box.
function sliceGradientDef(id, baseColor) {
	return `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="${lightenColor(baseColor, 0.28)}" />
    <stop offset="100%" stop-color="${baseColor}" />
  </linearGradient>`;
}

// `container` is a plain element that this function fills with an <svg>.
//   formatTotal(number)  - formats the center total label (donut only)
//   innerRadiusRatio     - 0 for a pie; 0-1 for a donut (hole this fraction
//                          of outerR, with a center total)
let _ringUid = 0;
function drawRingChart(
	container,
	{ title, segments, formatTotal, innerRadiusRatio },
) {
	const W = 1300;
	const topMargin = 130;
	const bottomMargin = 60;

	const cx = 380;
	const outerR = 270;
	const innerR = outerR * innerRadiusRatio;
	const outerDiameter = outerR * 2;

	const legendX = cx + outerR + 100;
	const sideMargin = 60;
	const maxLegendWidth = W - legendX - sideMargin;

	const visible = segments.filter((s) => s.value > 0);
	const total = visible.reduce((sum, s) => sum + s.value, 0);

	const ctx = _chartMeasureCtx;
	// Unique per drawing: charts in hidden sections share the document, and a
	// duplicate gradient id would resolve to the hidden (unrendered) one.
	const uid = 'g' + ++_ringUid + '-';

	// ---- Legend layout ----
	let fontSize = 36;
	const minFontSize = 22;
	const legendRightEdge = W - sideMargin;
	const columnGap = 24;

	function measureLegend(fs) {
		ctx.font = `800 ${fs}px ${CHART_FONT_FAMILY}`;
		const lineH = fs * 1.55;
		const gap = fs * 0.7;
		let totalH = 0;
		const entries = visible.map((seg) => {
			const valueStr = formatTotal(seg.value);
			const valueWidth = ctx.measureText(valueStr).width;
			const labelMaxWidth = Math.max(
				maxLegendWidth * 0.4,
				maxLegendWidth - valueWidth - columnGap,
			);

			const words = seg.label.split(' ');
			const labelLines = [];
			let cur = '';
			for (const w of words) {
				const test = cur ? cur + ' ' + w : w;
				if (ctx.measureText(test).width > labelMaxWidth && cur) {
					labelLines.push(cur);
					cur = w;
				} else {
					cur = test;
				}
			}
			if (cur) labelLines.push(cur);

			const h = labelLines.length * lineH;
			totalH += h + gap;
			return { seg, labelLines, valueStr, h };
		});
		if (entries.length) totalH -= gap;
		return { lineH, gap, entries, totalH };
	}

	let layout = measureLegend(fontSize);
	while (layout.totalH > outerDiameter + 100 && fontSize > minFontSize) {
		fontSize -= 2;
		layout = measureLegend(fontSize);
	}

	const contentHeight = Math.max(outerDiameter, layout.totalH);
	const H = topMargin + contentHeight + bottomMargin;
	const cy = topMargin + contentHeight / 2;

	// ---- Ring / pie ----
	let defs = '';
	let ringMarkup;

	if (total > 0 && visible.length === 1) {
		const gid = uid + '0';
		defs += sliceGradientDef(gid, visible[0].color);
		ringMarkup = `<circle cx="${cx}" cy="${cy}" r="${outerR}" fill="url(#${gid})" />`;
		if (innerR > 0) {
			ringMarkup += `\n      <circle cx="${cx}" cy="${cy}" r="${innerR}" fill="#000000" />`;
		}
	} else if (total > 0) {
		let startAngle = -Math.PI / 2;
		ringMarkup = visible
			.map((seg, i) => {
				const sweep = (seg.value / total) * Math.PI * 2;
				const endAngle = startAngle + sweep;
				const gid = uid + i;
				defs += sliceGradientDef(gid, seg.color);
				const d = ringSlicePath(cx, cy, innerR, outerR, startAngle, endAngle);
				startAngle = endAngle;
				return `<path d="${d}" fill="url(#${gid})" />`;
			})
			.join('\n');
	} else {
		ringMarkup = `<circle cx="${cx}" cy="${cy}" r="${outerR}" fill="#2a2a2a" />`;
		if (innerR > 0) {
			ringMarkup += `\n      <circle cx="${cx}" cy="${cy}" r="${innerR}" fill="#000000" />`;
		}
	}

	// ---- Center total (donut only) ----
	let centerMarkup = '';
	if (innerR > 0) {
		const totalLabel = formatTotal(total);
		let totalFontSize = 60;
		ctx.font = `800 ${totalFontSize}px ${CHART_FONT_FAMILY}`;
		const maxTotalWidth = innerR * 2 - 40;
		while (
			ctx.measureText(totalLabel).width > maxTotalWidth &&
			totalFontSize > 26
		) {
			totalFontSize -= 2;
			ctx.font = `800 ${totalFontSize}px ${CHART_FONT_FAMILY}`;
		}
		const labelFontSize = Math.max(14, Math.round(totalFontSize * (40 / 60)));

		centerMarkup = `<text x="${cx}" y="${cy - totalFontSize * 0.65 + labelFontSize * 0.35}" text-anchor="middle" font-family="${CHART_FONT_FAMILY}" font-weight="800" font-size="${labelFontSize}" fill="#cfcfcf">Total</text>
    <text x="${cx}" y="${cy + totalFontSize * 0.85}" text-anchor="middle" font-family="${CHART_FONT_FAMILY}" font-weight="800" font-size="${totalFontSize}" fill="#cfcfcf">${escapeXml(totalLabel)}</text>`;
	}

	// ---- Title ----
	const titleMarkup = `<text x="60" y="${36 + 56 * 0.8}" font-family="${CHART_FONT_FAMILY}" font-weight="800" font-size="56" fill="#cfcfcf">${escapeXml(title)}</text>`;

	// ---- Legend ----
	let legendY = cy - layout.totalH / 2;
	const legendLines = [];
	layout.entries.forEach(({ seg, labelLines, valueStr, h }) => {
		labelLines.forEach((line, i) => {
			const baseline = legendY + i * layout.lineH + fontSize * 0.8;
			legendLines.push(
				`<text x="${legendX}" y="${baseline}" font-family="${CHART_FONT_FAMILY}" font-weight="800" font-size="${fontSize}" fill="${seg.color}">${escapeXml(line)}</text>`,
			);
		});
		const valueBaseline = legendY + h / 2 - layout.lineH / 2 + fontSize * 0.8;
		legendLines.push(
			`<text x="${legendRightEdge}" y="${valueBaseline}" text-anchor="end" font-family="${CHART_FONT_FAMILY}" font-weight="800" font-size="${fontSize}" fill="#cfcfcf">${escapeXml(valueStr)}</text>`,
		);
		legendY += h + layout.gap;
	});

	container.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <defs>${defs}</defs>
    ${titleMarkup}
    ${ringMarkup}
    ${centerMarkup}
    ${legendLines.join('\n')}
  </svg>`;

	return container.querySelector('svg');
}

// Rasterizes the live <svg> inside `box` onto an offscreen canvas at 2x for a
// crisp save, then hands the PNG to the Web Share API so it saves straight to
// Photos on iOS. Falls back to a plain download on desktop. Nothing here ever
// navigates, so a Home Screen web app's scope handling can't interfere.
async function exportRingAsPng(box, filename) {
	const svg = box.querySelector('svg');
	if (!svg) return;

	const scale = 2;
	const svgWidth = Number(svg.getAttribute('width'));
	const svgHeight = Number(svg.getAttribute('height'));

	const svgString = new XMLSerializer().serializeToString(svg);
	const svgBlob = new Blob([svgString], {
		type: 'image/svg+xml;charset=utf-8',
	});
	const svgUrl = URL.createObjectURL(svgBlob);

	try {
		const img = new Image();
		const loaded = new Promise((resolve, reject) => {
			img.onload = resolve;
			img.onerror = reject;
		});
		img.src = svgUrl;
		await loaded;

		const canvas = document.createElement('canvas');
		canvas.width = svgWidth * scale;
		canvas.height = svgHeight * scale;
		const ctx = canvas.getContext('2d');
		// The SVG itself is transparent (the black card comes from CSS), so
		// paint the background in or the PNG would be transparent.
		ctx.fillStyle = '#000000';
		ctx.fillRect(0, 0, canvas.width, canvas.height);
		ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

		const blob = await new Promise((resolve) =>
			canvas.toBlob(resolve, 'image/png'),
		);
		const file = new File([blob], filename, { type: 'image/png' });

		if (navigator.canShare && navigator.canShare({ files: [file] })) {
			try {
				await navigator.share({ files: [file] });
			} catch (err) {
				if (err.name !== 'AbortError') console.error('Share failed:', err);
			}
			return;
		}

		const url = URL.createObjectURL(blob);
		const link = document.createElement('a');
		link.href = url;
		link.download = filename;
		document.body.appendChild(link);
		link.click();
		link.remove();
		URL.revokeObjectURL(url);
	} finally {
		URL.revokeObjectURL(svgUrl);
	}
}

/* ------------------------------------------------------------------ */
/* 2. Stacked bar chart                                                */
/* ------------------------------------------------------------------ */

const RANGE_LABEL = {
	day: 'Day',
	week: 'Week',
	month: 'Month',
	year: 'Year',
	all: 'All time',
};
const MIN_STEPS = [10, 15, 30, 60, 120, 240, 480, 600, 1200, 2400, 6000, 12000];

const charts = {}; // id -> { cfg, st: { range, off, view }, info }

function weekTitle(monday) {
	const last = addD(monday, 6);
	if (
		monday.getMonth() === last.getMonth() &&
		monday.getFullYear() === last.getFullYear()
	) {
		return `${monday.getDate()} – ${last.getDate()} ${loc(last, { month: 'long' })} ${last.getFullYear()}`;
	}
	return `${loc(monday, { day: 'numeric', month: 'short' })} – ${loc(last, { day: 'numeric', month: 'short' })} ${last.getFullYear()}`;
}

// Time slots for a range. `off` counts periods back from now (0 = current).
// Returns { list: [{ s, e, label, tick, long }], title, report }.
function makeBuckets(range, off, firstT) {
	const T = sod(new Date());
	let list = [];
	let title = '';
	let report = '';

	if (range === 'day') {
		const d = addD(T, off);
		for (let h = 0; h < 24; h++) {
			list.push({
				s: new Date(d.getFullYear(), d.getMonth(), d.getDate(), h).getTime(),
				e: new Date(
					d.getFullYear(),
					d.getMonth(),
					d.getDate(),
					h + 1,
				).getTime(),
				label: String(h),
				tick: h % 3 === 0,
				long: `${loc(d, { weekday: 'short', day: 'numeric', month: 'short' })}, ${pad(h)}:00`,
			});
		}
		report = loc(d, {
			weekday: 'long',
			day: 'numeric',
			month: 'long',
			year: 'numeric',
		});
		title = off === 0 ? 'Today' : report;
	} else if (range === 'week') {
		const m = mondayOf(addD(T, 7 * off));
		for (let i = 0; i < 7; i++) {
			const d = addD(m, i);
			list.push({
				s: d.getTime(),
				e: addD(d, 1).getTime(),
				label: loc(d, { weekday: 'short' }),
				tick: true,
				long: loc(d, { weekday: 'long', day: 'numeric', month: 'long' }),
			});
		}
		report = weekTitle(m);
		title = (off === 0 ? 'This week · ' : '') + report;
	} else if (range === 'month') {
		const f = new Date(T.getFullYear(), T.getMonth() + off, 1);
		const n = new Date(f.getFullYear(), f.getMonth() + 1, 0).getDate();
		for (let i = 1; i <= n; i++) {
			const d = new Date(f.getFullYear(), f.getMonth(), i);
			list.push({
				s: d.getTime(),
				e: addD(d, 1).getTime(),
				label: String(i),
				tick: i === 1 || i % 5 === 0,
				long: loc(d, { weekday: 'short', day: 'numeric', month: 'long' }),
			});
		}
		report = title = loc(f, { month: 'long', year: 'numeric' });
	} else if (range === 'year') {
		const y = T.getFullYear() + off;
		for (let m = 0; m < 12; m++) {
			const d = new Date(y, m, 1);
			list.push({
				s: d.getTime(),
				e: new Date(y, m + 1, 1).getTime(),
				label: loc(d, { month: 'short' }),
				tick: true,
				long: loc(d, { month: 'long', year: 'numeric' }),
			});
		}
		report = title = String(y);
	} else {
		let a = new Date(T.getFullYear(), T.getMonth() - 5, 1);
		if (firstT) {
			const f = new Date(firstT);
			const fm = new Date(f.getFullYear(), f.getMonth(), 1);
			if (fm < a) a = fm;
		}
		const last = new Date(T.getFullYear(), T.getMonth(), 1);
		const total =
			(last.getFullYear() - a.getFullYear()) * 12 +
			last.getMonth() -
			a.getMonth() +
			1;
		const every = total > 24 ? 3 : total > 12 ? 2 : 1;
		for (let i = 0; i < total; i++) {
			const d = new Date(a.getFullYear(), a.getMonth() + i, 1);
			list.push({
				s: d.getTime(),
				e: new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime(),
				label:
					loc(d, { month: 'short' }) +
					(d.getMonth() === 0 ? ' ’' + String(d.getFullYear()).slice(2) : ''),
				tick: i % every === 0,
				long: loc(d, { month: 'long', year: 'numeric' }),
			});
		}
		report = title = 'All time';
	}
	return { list, title, report };
}

// cfg:
//   range, ranges[]            default range and the ones offered
//   series()                   [{ k, n, color }] in stacking order
//   data(list)                 [{ vals: { k: value } }] per time slot
//   first()                    earliest timestamp with data (for All time)
//   steps, emptyStep, axis(v), fmt(v), goal(), aria, stats(info)
//   donut: { inner, prefix }   optional ring/pie view of the same range
function chartInit(id, cfg) {
	charts[id] = {
		cfg,
		st: { range: cfg.range, off: 0, view: 'bars' },
		info: null,
	};
	const donutTabs = cfg.donut
		? `<div class="viewrow">
        <div class="tabs sm" role="group" aria-label="Chart type">
          <button class="tab" type="button" data-view="bars">Bars</button>
          <button class="tab" type="button" data-view="donut">${cfg.donut.inner > 0 ? 'Donut' : 'Pie'}</button>
        </div>
        <button class="btn ghost sm" type="button" data-dl hidden>Download image</button>
      </div>`
		: '';
	$('#chart-' + id).innerHTML = `<div class="chart-head">
      <div class="tabs" role="group" aria-label="Range">${cfg.ranges
				.map(
					(r) =>
						`<button class="tab" type="button" data-range="${r}">${RANGE_LABEL[r]}</button>`,
				)
				.join('')}</div>
      <div class="cnav">
        <button class="icon" type="button" data-nav="-1" aria-label="Earlier">‹</button>
        <span class="ctitle"></span>
        <button class="icon" type="button" data-nav="1" aria-label="Later">›</button>
      </div>
    </div>
    <div class="stats"></div>
    ${donutTabs}
    <div class="plot"></div>
    <div class="readout" aria-live="polite"></div>
    <div class="legend"></div>
    <div class="donutwrap" hidden><div class="donutbox"></div></div>`;
}

function chartDraw(id) {
	const c = charts[id];
	if (!c) return;
	const host = $('#chart-' + id);
	const cfg = c.cfg;
	const st = c.st;

	const bk = makeBuckets(st.range, st.off, cfg.first());
	const list = bk.list;
	const data = cfg.data(list);
	const series = cfg.series();
	const totals = data.map((d) =>
		series.reduce((a, s) => a + (d.vals[s.k] || 0), 0),
	);
	// `shown` (optional) is what a bar means for the readout, when that is not
	// the full stack height (e.g. the red "under target" part is not time worked).
	const shown = cfg.shown ? data.map(cfg.shown) : totals;
	const sum = shown.reduce((a, b) => a + b, 0);

	// Days covered so far (for daily averages).
	const todayEnd = addD(sod(new Date()), 1).getTime();
	let days = 1;
	if (st.range !== 'day') {
		let rs = list[0].s;
		const re = list[list.length - 1].e;
		if (st.range === 'all') {
			const f = cfg.first();
			if (f) rs = sod(new Date(f)).getTime();
		}
		days = Math.max(1, Math.round((Math.min(re, todayEnd) - rs) / 864e5));
	}

	$('.stats', host).innerHTML = cfg
		.stats({ sum, totals, list, days, range: st.range })
		.map(
			(r) =>
				`<div class="stat"><span>${esc(r[0])}</span><b>${esc(r[1])}</b></div>`,
		)
		.join('');
	$$('[data-range]', host).forEach((b) =>
		b.classList.toggle('on', b.dataset.range === st.range),
	);
	$$('[data-view]', host).forEach((b) =>
		b.classList.toggle('on', b.dataset.view === st.view),
	);
	$('.ctitle', host).textContent = bk.title;
	$('.cnav', host).style.visibility = st.range === 'all' ? 'hidden' : 'visible';
	$('[data-nav="1"]', host).disabled = st.off >= 0;

	const donutOn = st.view === 'donut' && !!cfg.donut;
	$('.plot', host).hidden = donutOn;
	$('.readout', host).hidden = donutOn;
	$('.legend', host).hidden = donutOn;
	$('.donutwrap', host).hidden = !donutOn;
	const dl = $('[data-dl]', host);
	if (dl) dl.hidden = !donutOn;

	c.info = null;
	if (donutOn) {
		const segments = series.map((s) => ({
			label: s.n,
			color: normHex(s.color),
			value: data.reduce((a, d) => a + (d.vals[s.k] || 0), 0),
		}));
		drawRingChart($('.donutbox', host), {
			title: bk.report,
			segments,
			formatTotal: cfg.fmt,
			innerRadiusRatio: cfg.donut.inner,
		});
		c.report = bk.report;
		return;
	}

	// ---- bars ----
	const goal = st.range === 'week' || st.range === 'month' ? cfg.goal() : 0;
	const max = Math.max.apply(null, totals.concat([goal, 0]));
	let step;
	let top;
	if (max <= 0) {
		step = cfg.emptyStep;
		top = step * 4;
	} else {
		step = cfg.steps[cfg.steps.length - 1];
		for (let q = 0; q < cfg.steps.length; q++) {
			if (Math.ceil(max / cfg.steps[q]) <= 5) {
				step = cfg.steps[q];
				break;
			}
		}
		top = Math.ceil(max / step) * step;
	}

	const W = 640,
		H = 250,
		L = 52,
		R = 8,
		T = 14,
		B = 28;
	const iw = W - L - R,
		ih = H - T - B;
	const n = list.length;
	const band = iw / n;
	const bw = Math.max(2, Math.min(band * 0.7, 44));
	const Y = (v) => T + ih - (v / top) * ih;

	let g = '';
	for (let v = 0; v <= top + 1e-9; v += step) {
		g += `<line x1="${L}" x2="${W - R}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}" class="grid"/><text x="${L - 8}" y="${(Y(v) + 4).toFixed(1)}" class="ax" text-anchor="end">${cfg.axis(v)}</text>`;
	}
	data.forEach((d, i) => {
		let acc = 0;
		const x = L + i * band + (band - bw) / 2;
		series.forEach((s) => {
			const v = d.vals[s.k] || 0;
			if (v <= 0) return;
			const y1 = Y(acc + v);
			const y0 = Y(acc);
			g += `<rect x="${x.toFixed(1)}" y="${y1.toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(0, y0 - y1 - (acc ? 0.6 : 0)).toFixed(1)}" style="fill:${normHex(s.color)}"/>`;
			acc += v;
		});
		if (list[i].tick) {
			g += `<text x="${(L + i * band + band / 2).toFixed(1)}" y="${H - 9}" class="ax" text-anchor="middle">${esc(list[i].label)}</text>`;
		}
		g += `<rect class="hit" data-i="${i}" x="${(L + i * band).toFixed(1)}" y="${T}" width="${band.toFixed(1)}" height="${ih}"/>`;
	});
	if (goal > 0 && goal <= top) {
		g += `<line class="goal" x1="${L}" x2="${W - R}" y1="${Y(goal).toFixed(1)}" y2="${Y(goal).toFixed(1)}"/><text class="gl" x="${W - R}" y="${(Y(goal) - 5).toFixed(1)}" text-anchor="end">${cfg.goalLabel || 'Goal'} ${cfg.fmt(goal)}</text>`;
	}
	$('.plot', host).innerHTML =
		`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(`${cfg.aria}, ${bk.title}, total ${cfg.fmt(sum)}`)}">${g}</svg>`;

	const lg = series
		.map((s) => ({ s, v: data.reduce((a, d) => a + (d.vals[s.k] || 0), 0) }))
		.filter((x) => x.v > 0)
		.sort((a, b) => b.v - a.v);
	$('.legend', host).innerHTML = !lg.length
		? '<span class="muted">Nothing logged in this period.</span>'
		: cfg.noLegend
			? ''
			: lg
					.map(
						(x) =>
							`<span class="lg"><i style="background:${normHex(x.s.color)}"></i>${esc(x.s.n)} <b>${cfg.fmt(x.v)}</b></span>`,
					)
					.join('');

	const summary = `${bk.title} · ${cfg.fmt(sum)}`;
	$('.readout', host).textContent = summary;
	c.info = { list, data, totals: shown, series, fmt: cfg.fmt, summary };
}

function chartReadout(host, i) {
	const id = host.id.slice(6);
	const f = charts[id] && charts[id].info;
	if (!f) return;
	const ro = $('.readout', host);
	if (i == null) {
		ro.textContent = f.summary;
		return;
	}
	const parts =
		f.series.length > 1
			? f.series
					.filter((s) => (f.data[i].vals[s.k] || 0) > 0)
					.map((s) => `${s.n} ${f.fmt(f.data[i].vals[s.k])}`)
			: [];
	ro.textContent = `${f.list[i].long} · ${f.fmt(f.totals[i])}${parts.length ? ` (${parts.join(', ')})` : ''}`;
}

// Chart controls (range tabs, arrows, bars/donut, download) and bar hover.
document.addEventListener('click', (e) => {
	const t = e.target.closest(
		'[data-range],[data-nav],[data-view],[data-dl],.hit',
	);
	if (!t) return;
	const host = t.closest('[id^="chart-"]');
	if (!host) return;
	const id = host.id.slice(6);
	const c = charts[id];
	if (!c) return;
	if (t.classList.contains('hit')) {
		chartReadout(host, Number(t.dataset.i));
		return;
	}
	if (t.dataset.range) {
		c.st.range = t.dataset.range;
		c.st.off = 0;
	} else if (t.dataset.nav) {
		c.st.off = Math.min(0, c.st.off + Number(t.dataset.nav));
	} else if (t.dataset.view) {
		c.st.view = t.dataset.view;
	} else if ('dl' in t.dataset) {
		const slug = String(c.report || 'report')
			.replace(/[^a-zA-Z0-9]+/g, '-')
			.replace(/^-+|-+$/g, '');
		exportRingAsPng($('.donutbox', host), `${c.cfg.donut.prefix}-${slug}.png`);
		return;
	}
	chartDraw(id);
});
document.addEventListener('pointerover', (e) => {
	const h = e.target.closest && e.target.closest('.hit');
	if (h) chartReadout(h.closest('[id^="chart-"]'), Number(h.dataset.i));
});
document.addEventListener('pointerout', (e) => {
	const h = e.target.closest && e.target.closest('.hit');
	if (h) chartReadout(h.closest('[id^="chart-"]'), null);
});
