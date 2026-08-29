// Formats a millilitre amount for display.
// Plain ml below 1000 (e.g. "250ml"); switches to litres with one decimal
// at 1000+ (e.g. "1.2L"), which keeps large daily/weekly/yearly totals readable.
function formatMl(totalMl) {
	const rounded = Math.round(totalMl);
	if (rounded < 1000) return `${rounded}ml`;
	return `${(rounded / 1000).toFixed(1)}L`;
}

// Draws the hydration donut chart as SVG. All the actual rendering lives
// in js/donut-chart.js (drawDonutChartCore, shared with Time Tracker) -
// this just supplies the value formatter for the center total.
function drawDonutChart(container, { title, segments }) {
	return drawDonutChartCore(container, {
		title,
		segments,
		formatTotal: formatMl,
	});
}
