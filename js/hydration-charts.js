// Formats a millilitre amount for display.
// Plain ml below 1000 (e.g. "250ml"); switches to litres with one decimal
// at 1000+ (e.g. "1.2L"), which keeps large daily/weekly/yearly totals readable.
function formatMl(totalMl) {
  const rounded = Math.round(totalMl);
  if (rounded < 1000) return `${rounded}ml`;
  return `${(rounded / 1000).toFixed(1)}L`;
}

// Draws a hydration donut chart.
// Clean ring with no in-segment labels. Legend on the right shows
// "Label — value" on a single line per category.
// `segments` is an array of { label, color, value } where value is in millilitres.
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
  // Each entry is one line: "Label — value"
  // Shrink font until everything fits within the donut's vertical span.
  let fontSize = 38;
  const minFontSize = 22;

  function legendTotalHeight(fs) {
    const lineH = fs * 1.55;
    const gap = fs * 0.7;
    return visible.length * lineH + Math.max(0, visible.length - 1) * gap;
  }

  while (
    legendTotalHeight(fontSize) > donutDiameter + 100 &&
    fontSize > minFontSize
  ) {
    fontSize -= 2;
  }

  const lineH = fontSize * 1.55;
  const gap = fontSize * 0.7;

  // ---- Canvas size ----
  const contentHeight = Math.max(donutDiameter, legendTotalHeight(fontSize));
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
    // Full ring — single color, no seam
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
    // Empty placeholder
    ctx.beginPath();
    ctx.arc(cx, cy, outerR, 0, Math.PI * 2);
    ctx.arc(cx, cy, innerR, 0, Math.PI * 2, true);
    ctx.closePath();
    ctx.fillStyle = '#2a2a2a';
    ctx.fill();
  }

  // ---- Center total ----
  const totalLabel = formatMl(total);
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

  // ---- Legend: "Label — value" one line per entry, vertically centered ----
  const blockHeight = legendTotalHeight(fontSize);
  let legendY = cy - blockHeight / 2;

  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';

  const sep = '  —  ';

  visible.forEach((seg) => {
    ctx.font = `800 ${fontSize}px ${fontFamily}`;

    const labelText = seg.label;
    const valueText = formatMl(seg.value);
    const labelWidth = ctx.measureText(labelText).width;
    const sepWidth = ctx.measureText(sep).width;

    ctx.fillStyle = seg.color;
    ctx.fillText(labelText, legendX, legendY);

    ctx.fillStyle = '#666666';
    ctx.fillText(sep, legendX + labelWidth, legendY);

    ctx.fillStyle = '#cfcfcf';
    ctx.fillText(valueText, legendX + labelWidth + sepWidth, legendY);

    legendY += lineH + gap;
  });

  return canvas;
}
