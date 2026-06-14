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
function drawDonutChart(canvas, { title, segments }) {
  const W = (canvas.width = 1200);
  const H = (canvas.height = 800);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, W, H);

  const fontFamily = "'Poppins', 'Segoe UI', sans-serif";

  // Title
  ctx.fillStyle = '#cfcfcf';
  ctx.font = `800 56px ${fontFamily}`;
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  ctx.fillText(title, 60, 36);

  const visible = segments.filter((s) => s.value > 0);
  const total = visible.reduce((sum, s) => sum + s.value, 0);

  const cx = 430;
  const cy = 470;
  const outerR = 290;
  const innerR = 175;

  if (total > 0) {
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

      // Segment value label
      const midAngle = (startAngle + endAngle) / 2;
      const midR = (outerR + innerR) / 2;
      const lx = cx + Math.cos(midAngle) * midR;
      const ly = cy + Math.sin(midAngle) * midR;
      ctx.fillStyle = '#000000';
      ctx.font = `800 38px ${fontFamily}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(formatMinutesAsHM(seg.value), lx, ly);

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

  // Center text
  ctx.fillStyle = '#cfcfcf';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `800 44px ${fontFamily}`;
  ctx.fillText('Total', cx, cy - 30);
  ctx.font = `800 56px ${fontFamily}`;
  ctx.fillText(formatMinutesAsHM(total), cx, cy + 35);

  // Legend (all categories with time > 0, in original order)
  const legendX = 870;
  let legendY = 260;
  const maxLegendWidth = W - legendX - 40;

  visible.forEach((seg) => {
    ctx.fillStyle = seg.color;
    ctx.font = `800 36px ${fontFamily}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    const lines = wrapText(ctx, seg.label, maxLegendWidth);
    lines.forEach((line, i) => {
      ctx.fillText(line, legendX, legendY + i * 44);
    });
    legendY += lines.length * 44 + 36;
  });

  return canvas;
}

// Renders/updates a Chart.js stacked bar chart for period comparisons.
// `categories` is the full category list (for color/label lookup).
// `buckets` is an array of { label, totals: { categoryKey: minutes } }.
// Returns the Chart instance so the caller can destroy it later.
function renderBarChart(canvas, categories, buckets, existingChart) {
  if (existingChart) existingChart.destroy();

  const datasets = categories.map((cat) => ({
    label: cat.label,
    backgroundColor: cat.color,
    data: buckets.map((b) => +((b.totals[cat.key] || 0) / 60).toFixed(2)),
    stack: 'time',
  }));

  const ctx = canvas.getContext('2d');
  return new Chart(ctx, {
    type: 'bar',
    data: {
      labels: buckets.map((b) => b.label),
      datasets,
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          stacked: true,
          ticks: { color: '#cfcfcf' },
          grid: { color: '#2a2a2a' },
        },
        y: {
          stacked: true,
          beginAtZero: true,
          title: { display: true, text: 'Hours', color: '#cfcfcf' },
          ticks: { color: '#cfcfcf' },
          grid: { color: '#2a2a2a' },
        },
      },
      plugins: {
        legend: {
          position: 'bottom',
          labels: { color: '#cfcfcf' },
        },
        tooltip: {
          callbacks: {
            label: (ctx) => `${ctx.dataset.label}: ${ctx.formattedValue}h`,
          },
        },
      },
    },
  });
}
