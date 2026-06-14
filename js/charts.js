// Formats a minute count as H:MM (e.g. 48 -> "0:48", 95 -> "1:35").
function formatMinutesAsHM(totalMinutes) {
  const rounded = Math.round(totalMinutes);
  const h = Math.floor(rounded / 60);
  const m = rounded % 60;
  return `${h}:${String(m).padStart(2, '0')}`;
}

// Wraps text to fit within maxWidth, returning an array of lines.
function wrapText(ctx, text, maxWidth) {
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const word of words) {
    const test = line ? line + ' ' + word : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

// Draws a donut chart styled like the user's existing monthly report image:
// black background, segment time labels, center "Total" text, side legend.
// `segments` is an array of { label, color, value } where value is in minutes.
//
// The canvas is sized dynamically: wide enough for the legend text, and tall
// enough to fit either the donut or the (possibly multi-line) legend,
// whichever needs more room. This keeps everything visible - and exportable
// as a single image - no matter how long the category names are or how many
// digits the totals have.
function drawDonutChart(canvas, { title, segments }) {
  const fontFamily = "'Poppins', 'Segoe UI', sans-serif";

  const W = 1300;
  const topMargin = 130; // space reserved for the title
  const bottomMargin = 50;
  const sideMargin = 60;

  const cx = 430;
  const outerR = 290;
  const innerR = 175;
  const donutDiameter = outerR * 2;

  const legendX = cx + outerR + 90;
  const maxLegendWidth = W - legendX - sideMargin;

  const visible = segments.filter((s) => s.value > 0);
  const total = visible.reduce((sum, s) => sum + s.value, 0);

  // Use the canvas's own context for measurement before we know the final size.
  const ctx = canvas.getContext('2d');

  // ---- Work out the legend layout, shrinking the font if it's too tall ----
  let legendFontSize = 36;
  let legendLayout = computeLegendLayout(
    ctx,
    visible,
    legendFontSize,
    maxLegendWidth,
    fontFamily,
  );
  while (
    legendLayout.totalHeight > donutDiameter + 160 &&
    legendFontSize > 22
  ) {
    legendFontSize -= 2;
    legendLayout = computeLegendLayout(
      ctx,
      visible,
      legendFontSize,
      maxLegendWidth,
      fontFamily,
    );
  }

  // ---- Finalize canvas size ----
  const contentHeight = Math.max(donutDiameter, legendLayout.totalHeight);
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

  // ---- Donut ----
  if (total > 0 && visible.length === 1) {
    // A single category covers the whole ring. Draw it as plain filled
    // circles (no start/end seam) instead of an arc path, which would
    // otherwise leave a visible spoke where the arc closes on itself.
    const seg = visible[0];
    ctx.beginPath();
    ctx.arc(cx, cy, outerR, 0, Math.PI * 2);
    ctx.fillStyle = seg.color;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(cx, cy, innerR, 0, Math.PI * 2);
    ctx.fillStyle = '#000000';
    ctx.fill();

    const midR = (outerR + innerR) / 2;
    drawSegmentLabel(
      ctx,
      formatMinutesAsHM(seg.value),
      cx,
      cy - midR,
      outerR - innerR,
      fontFamily,
    );
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

      // Segment value label, sized to fit the slice's width at mid-radius
      const midAngle = (startAngle + endAngle) / 2;
      const midR = (outerR + innerR) / 2;
      const lx = cx + Math.cos(midAngle) * midR;
      const ly = cy + Math.sin(midAngle) * midR;
      const chordWidth = 2 * midR * Math.sin(sweep / 2);
      drawSegmentLabel(
        ctx,
        formatMinutesAsHM(seg.value),
        lx,
        ly,
        chordWidth,
        fontFamily,
      );

      startAngle = endAngle;
    });
  } else {
    // Empty ring placeholder
    ctx.beginPath();
    ctx.arc(cx, cy, outerR, 0, Math.PI * 2);
    ctx.arc(cx, cy, innerR, 0, Math.PI * 2, true);
    ctx.closePath();
    ctx.fillStyle = '#2a2a2a';
    ctx.fill();
  }

  // ---- Center "Total" text, shrinking the value if it's too wide ----
  const totalLabel = formatMinutesAsHM(total);
  let totalFontSize = 56;
  ctx.font = `800 ${totalFontSize}px ${fontFamily}`;
  const maxTotalWidth = innerR * 2 - 50;
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
  ctx.font = `800 44px ${fontFamily}`;
  ctx.fillText('Total', cx, cy - 30);
  ctx.font = `800 ${totalFontSize}px ${fontFamily}`;
  ctx.fillText(totalLabel, cx, cy + Math.max(28, totalFontSize * 0.6));

  // ---- Legend, vertically centered alongside the donut ----
  let legendY = cy - legendLayout.totalHeight / 2;
  legendLayout.entries.forEach(({ seg, lines, height }) => {
    ctx.fillStyle = seg.color;
    ctx.font = `800 ${legendFontSize}px ${fontFamily}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    lines.forEach((line, i) => {
      ctx.fillText(line, legendX, legendY + i * legendLayout.lineHeight);
    });
    legendY += height + legendLayout.entryGap;
  });

  return canvas;
}

// Lays out the legend at a given font size, returning per-entry wrapped
// lines plus the total height the legend would occupy.
function computeLegendLayout(ctx, visible, fontSize, maxWidth, fontFamily) {
  const lineHeight = fontSize + 8;
  const entryGap = fontSize;
  ctx.font = `800 ${fontSize}px ${fontFamily}`;

  let totalHeight = 0;
  const entries = visible.map((seg) => {
    const lines = wrapText(ctx, seg.label, maxWidth);
    const height = lines.length * lineHeight;
    totalHeight += height + entryGap;
    return { seg, lines, height };
  });
  if (entries.length) totalHeight -= entryGap; // no trailing gap after the last entry

  return { lineHeight, entryGap, entries, totalHeight };
}

// Draws a segment's value label, shrinking the font so it fits within
// `availableWidth` (e.g. a thin slice with a large number of hours).
function drawSegmentLabel(ctx, text, x, y, availableWidth, fontFamily) {
  let fontSize = 38;
  ctx.font = `800 ${fontSize}px ${fontFamily}`;
  const maxWidth = Math.max(availableWidth - 12, 24);
  while (ctx.measureText(text).width > maxWidth && fontSize > 16) {
    fontSize -= 2;
    ctx.font = `800 ${fontSize}px ${fontFamily}`;
  }
  ctx.fillStyle = '#000000';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y);
}
