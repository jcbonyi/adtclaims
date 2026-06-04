const CHART_COLORS = ["#0078C8", "#72BF44", "#006BA3", "#F59E0B", "#7C3AED", "#DB2777", "#14B8A6"];
/** System UI fonts — avoid Calibri in canvas (missing on many machines shows as boxes). */
const FONT_TITLE = 'bold 15px "Segoe UI", Helvetica, Arial, sans-serif';
const FONT_BODY = '12px "Segoe UI", Helvetica, Arial, sans-serif';

function toItems(rows) {
  return rows
    .map(([label, value]) => ({ label: String(label ?? "—"), value: Number(value) || 0 }))
    .filter((item) => item.value > 0);
}

function truncate(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let s = text;
  while (s.length > 1 && ctx.measureText(`${s}...`).width > maxWidth) {
    s = s.slice(0, -1);
  }
  return `${s}...`;
}

function drawTitle(ctx, title, width) {
  ctx.fillStyle = "#006BA3";
  ctx.font = FONT_TITLE;
  ctx.fillText(truncate(ctx, title, width - 24), 12, 24);
}

function drawHorizontalBarChart(ctx, items, width, height) {
  const top = 40;
  const left = 118;
  const rightPad = 16;
  const rowH = Math.min(32, (height - top - 12) / items.length);
  const maxVal = Math.max(...items.map((i) => i.value), 1);
  const barMaxW = width - left - rightPad;

  items.forEach((item, i) => {
    const y = top + i * rowH;
    const barW = Math.max(2, (item.value / maxVal) * barMaxW);
    const color = CHART_COLORS[i % CHART_COLORS.length];

    ctx.fillStyle = "#1A2332";
    ctx.font = FONT_BODY;
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.fillText(truncate(ctx, item.label, 100), left - 10, y + rowH * 0.45);

    ctx.fillStyle = color;
    ctx.fillRect(left, y, barW, rowH * 0.62);

    ctx.fillStyle = "#475569";
    ctx.textAlign = "left";
    ctx.fillText(String(item.value), left + barW + 6, y + rowH * 0.45);
  });
}

function drawPieChart(ctx, items, width, height) {
  const cx = width * 0.36;
  const cy = height * 0.55;
  const radius = Math.min(width * 0.28, height * 0.38);
  const total = items.reduce((s, i) => s + i.value, 0) || 1;
  let start = -Math.PI / 2;

  items.forEach((item, i) => {
    const slice = (item.value / total) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, radius, start, start + slice);
    ctx.closePath();
    ctx.fillStyle = CHART_COLORS[i % CHART_COLORS.length];
    ctx.fill();
    start += slice;
  });

  let ly = 44;
  const lx = width * 0.62;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  items.forEach((item, i) => {
    const pct = Math.round((item.value / total) * 1000) / 10;
    ctx.fillStyle = CHART_COLORS[i % CHART_COLORS.length];
    ctx.fillRect(lx, ly - 6, 12, 12);
    ctx.fillStyle = "#1A2332";
    ctx.font = FONT_BODY;
    ctx.fillText(`${truncate(ctx, item.label, 140)} (${pct}%)`, lx + 18, ly);
    ly += 20;
  });
}

function drawChartOnCanvas(canvas, chartType, rows, title) {
  const items = toItems(rows);
  if (!items.length) return false;

  const pieItems = chartType === "pie" ? items.slice(0, 8) : items;
  const width = chartType === "pie" ? 480 : 520;
  const height =
    chartType === "pie"
      ? Math.min(300, Math.max(180, 60 + pieItems.length * 18))
      : Math.min(340, Math.max(160, 52 + items.length * 30));

  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, width, height);
  drawTitle(ctx, title, width);
  if (chartType === "pie") {
    drawPieChart(ctx, pieItems, width, height);
  } else {
    drawHorizontalBarChart(ctx, items.slice(0, 12), width, height);
  }
  return true;
}

/**
 * @param {'pie'|'bar'} chartType
 * @param {(string|number)[][]} rows
 * @param {string} title
 * @returns {Promise<ArrayBuffer|null>}
 */
export function renderChartPng(chartType, rows, title) {
  return new Promise((resolve) => {
    const canvas = document.createElement("canvas");
    if (!drawChartOnCanvas(canvas, chartType, rows, title)) {
      resolve(null);
      return;
    }
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          resolve(null);
          return;
        }
        blob.arrayBuffer().then(resolve).catch(() => resolve(null));
      },
      "image/png",
      1
    );
  });
}
