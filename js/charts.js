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

// Draws a time-tracking donut chart.
// Clean ring with no in-segment labels. Legend on the right shows
// "Label — H:MM" on each line (wrapping long labels to a second line
// with the value aligned after).
// `segments` is an array of { label, color, value } where value is in minutes.
//
// Canvas height grows dynamically so the legend is never clipped.
function drawDonutChart(canvas, { title, segments }) {
  const fontFamily = "'Poppins', 'Segoe UI', sans-serif";

  const W = 1300;
  const topMargin = 130;
  const bottomMargin = 60;
  const sideMargin = 60;

  const cx = 380;
  const outerR = 270;
  const innerR = 160;
  const donutDiameter = outerR * 2;

  const legendX = cx + outerR + 100;
  const maxLegendWidth = W - legendX - sideMargin;

  const visible = segments.filter((s) => s.value > 0);
  const total = visible.reduce((sum, s) => sum + s.value, 0);

  const ctx = canvas.getContext('2d');

  // ---- Legend layout ----
  // Each entry: label text wraps if needed, value on the last line after a separator
  let fontSize = 36;
  const minFontSize = 22;

  function measureLegend(fs) {
    ctx.font = `800 ${fs}px ${fontFamily}`;
    const lineH = fs * 1.55;
    const gap = fs * 0.7;
    const sep = '  —  ';
    let totalH = 0;
    const entries = visible.map((seg) => {
      // Try to fit "Label — H:MM" on one line; wrap label if needed
      const valueStr = formatMinutesAsHM(seg.value);
      const fullLine = seg.label + sep + valueStr;
      const fullW = ctx.measureText(fullLine).width;
      let lines;
      if (fullW <= maxLegendWidth) {
        lines = [fullLine];
      } else {
        // Wrap: put label line(s) then "— value" on last line
        const words = seg.label.split(' ');
        const wrapped = [];
        let cur = '';
        for (const w of words) {
          const test = cur ? cur + ' ' + w : w;
          if (ctx.measureText(test).width > maxLegendWidth && cur) {
            wrapped.push(cur);
            cur = w;
          } else {
            cur = test;
          }
        }
        if (cur) wrapped.push(cur);
        wrapped[wrapped.length - 1] += sep + valueStr;
        lines = wrapped;
      }
      const h = lines.length * lineH;
      totalH += h + gap;
      return { seg, lines, h };
    });
    if (entries.length) totalH -= gap;
    return { lineH, gap, entries, totalH };
  }

  let layout = measureLegend(fontSize);
  while (layout.totalH > donutDiameter + 100 && fontSize > minFontSize) {
    fontSize -= 2;
    layout = measureLegend(fontSize);
  }

  // ---- Canvas size ----
  const contentHeight = Math.max(donutDiameter, layout.totalH);
  const H = topMargin + contentHeight + bottomMargin;
  canvas.width = W;
  canvas.height = H;

  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, W, H);

  // Title
  ctx.fillStyle = '#cfcfcf';
  ctx.font = `800 56px ${fontFamily}`;
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  ctx.fillText(title, 60, 36);

  const cy = topMargin + contentHeight / 2;

  // ---- Donut ring (no in-segment labels) ----
  if (total > 0 && visible.length === 1) {
    ctx.beginPath();
    ctx.arc(cx, cy, outerR, 0, Math.PI * 2);
    ctx.fillStyle = visible[0].color;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(cx, cy, innerR, 0, Math.PI * 2);
    ctx.fillStyle = '#000000';
    ctx.fill();
  } else if (total > 0) {
    let startAngle = -Math.PI / 2;
    visible.forEach((seg) => {
      const sweep = (seg.value / total) * Math.PI * 2;
      const endAngle = startAngle + sweep;

      ctx.beginPath();
      ctx.arc(cx, cy, outerR, startAngle, endAngle, false);
      ctx.arc(cx, cy, innerR, endAngle, startAngle, true);
      ctx.closePath();
      ctx.fillStyle = seg.color;
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#000000';
      ctx.stroke();

      startAngle = endAngle;
    });
  } else {
    ctx.beginPath();
    ctx.arc(cx, cy, outerR, 0, Math.PI * 2);
    ctx.arc(cx, cy, innerR, 0, Math.PI * 2, true);
    ctx.closePath();
    ctx.fillStyle = '#2a2a2a';
    ctx.fill();
  }

  // ---- Center total ----
  const totalLabel = formatMinutesAsHM(total);
  let totalFontSize = 60;
  ctx.font = `800 ${totalFontSize}px ${fontFamily}`;
  const maxTotalWidth = innerR * 2 - 40;
  while (
    ctx.measureText(totalLabel).width > maxTotalWidth &&
    totalFontSize > 26
  ) {
    totalFontSize -= 2;
    ctx.font = `800 ${totalFontSize}px ${fontFamily}`;
  }

  ctx.fillStyle = '#cfcfcf';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `800 40px ${fontFamily}`;
  ctx.fillText('Total', cx, cy - totalFontSize * 0.65);
  ctx.font = `800 ${totalFontSize}px ${fontFamily}`;
  ctx.fillText(totalLabel, cx, cy + totalFontSize * 0.5);

  // ---- Legend: "Label — H:MM", vertically centered ----
  let legendY = cy - layout.totalH / 2;
  ctx.textBaseline = 'top';

  layout.entries.forEach(({ seg, lines, h }) => {
    ctx.font = `800 ${fontSize}px ${fontFamily}`;
    lines.forEach((line, i) => {
      // Color each part of the line individually on the last line;
      // pure label lines get the category color.
      const sep = '  —  ';
      const sepIdx = line.indexOf(sep);
      if (sepIdx === -1) {
        // Pure label line
        ctx.fillStyle = seg.color;
        ctx.textAlign = 'left';
        ctx.fillText(line, legendX, legendY + i * layout.lineH);
      } else {
        // Line contains "label part — value"
        const labelPart = line.slice(0, sepIdx);
        const valuePart = line.slice(sepIdx + sep.length);
        let x = legendX;

        ctx.fillStyle = seg.color;
        ctx.textAlign = 'left';
        ctx.fillText(labelPart, x, legendY + i * layout.lineH);
        x += ctx.measureText(labelPart).width;

        ctx.fillStyle = '#666666';
        ctx.fillText(sep, x, legendY + i * layout.lineH);
        x += ctx.measureText(sep).width;

        ctx.fillStyle = '#cfcfcf';
        ctx.fillText(valuePart, x, legendY + i * layout.lineH);
      }
    });
    legendY += h + layout.gap;
  });

  return canvas;
}
