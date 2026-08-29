// Formats a minute count as a human-readable duration.
// Shows only the parts that are non-zero:
//   45  -> "45m"
//   60  -> "1h"
//   90  -> "1h 30m"
//   120 -> "2h"
function formatMinutesAsHM(totalMinutes) {
	const rounded = Math.round(totalMinutes);
	const h = Math.floor(rounded / 60);
	const m = rounded % 60;
	if (h === 0) return `${m}m`;
	if (m === 0) return `${h}h`;
	return `${h}h ${m}m`;
}

// Draws the time-tracking donut chart as SVG. All the actual rendering
// lives in js/donut-chart.js (drawDonutChartCore, shared with Hydration
// Tracker) - this just supplies the value formatter for the center total.
function drawDonutChart(container, { title, segments }) {
	return drawDonutChartCore(container, {
		title,
		segments,
		formatTotal: formatMinutesAsHM,
	});
}
