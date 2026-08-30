// ===================== Shared SVG ring chart engine =====================
// Renders the dashboard chart as inline SVG - crisp at any zoom level,
// unlike a rasterized <canvas>. One function draws either a pie (no hole)
// or a donut (with a hole showing the total), controlled by
// `innerRadiusRatio`. Both Time Tracker and Hydration Tracker call this
// directly from their own app.js file - there's no per-app wrapper file
// anymore, just this one shared renderer.

const CHART_FONT_FAMILY = "'Poppins', 'Segoe UI', sans-serif";

// A detached canvas used ONLY for text-width measurement (ctx.measureText).
// Nothing is ever drawn to it or shown on screen - SVG needs no canvas to
// render, but measureText is still the simplest reliable way to lay out
// text (legend wrapping, shrink-to-fit) before building the SVG string.
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
// degenerates to a normal pie wedge (both inner points collapse to the
// center), so the same path builder covers pie and donut alike.
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

// Vertical gradient scoped to each slice's own bounding box, via SVG's
// default objectBoundingBox units: 0% (top of that slice) is lightened,
// 100% (bottom of that slice) is the solid base color.
function sliceGradientDef(id, baseColor) {
	return `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="${lightenColor(baseColor, 0.28)}" />
    <stop offset="100%" stop-color="${baseColor}" />
  </linearGradient>`;
}

// `container` is a plain element (e.g. a <div>) that this function fills
// with an <svg>.
//   formatTotal(number)  - formats the center total label (donut only)
//   innerRadiusRatio     - 0 for a pie (no hole, no center total);
//                          0-1 for a donut (hole this fraction of outerR,
//                          with a center total)
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

	// ---- Legend layout ----
	// Label and value sit in two columns: the label wraps within its own
	// column on the left, and the value is right-aligned in its own column
	// on the right - so a value never has to "fit after" whatever the label
	// happened to wrap to, and there's no separator character needed
	// between them at all.
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
			// The label's column shrinks to leave room for this entry's own
			// value width, with a floor so a wide value can't crush it to nothing.
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
		const gid = 'chart-grad-0';
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
				const gid = `chart-grad-${i}`;
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

	// ---- Center total (donut only - a pie has no hole to put it in) ----
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

		// Scale the "Total" caption together with the value so it never ends
		// up looking bigger than the number it's labeling once the value has
		// had to shrink to fit (e.g. a big "all time" total).
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
		// Right-aligned, vertically centered against this entry's whole label
		// height so a 2-line-wrapped label doesn't leave the value looking
		// stuck to the top or bottom edge.
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
