const fs = require("fs");
const path = require("path");
const { createCanvas } = require("canvas");
const opentype = require("opentype.js");

const CHART_COLORS = ["#0078C8", "#72BF44", "#006BA3", "#F59E0B", "#7C3AED", "#DB2777", "#14B8A6"];
const FONT_DIR = path.join(__dirname, "..", "node_modules", "dejavu-fonts-ttf", "ttf");

let regularFont = null;
let boldFont = null;

function loadFontFile(filename) {
  return opentype.parse(fs.readFileSync(path.join(FONT_DIR, filename)));
}

function ensureChartFonts() {
  if (regularFont && boldFont) return;
  regularFont = loadFontFile("DejaVuSans.ttf");
  boldFont = loadFontFile("DejaVuSans-Bold.ttf");
}

function glyphAdvance(face, glyph, fontSize) {
  return (glyph.advanceWidth * fontSize) / face.unitsPerEm;
}

/** Per-glyph layout avoids opentype.js bidi errors on DejaVu. */
function measureText(face, text, fontSize) {
  let width = 0;
  for (const ch of text) {
    width += glyphAdvance(face, face.charToGlyph(ch), fontSize);
  }
  return width;
}

function truncateText(face, text, fontSize, maxWidth) {
  if (measureText(face, text, fontSize) <= maxWidth) return text;
  let s = text;
  while (s.length > 1 && measureText(face, `${s}...`, fontSize) > maxWidth) {
    s = s.slice(0, -1);
  }
  return `${s}...`;
}

function drawText(ctx, face, text, x, y, fontSize, fillStyle) {
  let cursor = x;
  for (const ch of text) {
    const glyph = face.charToGlyph(ch);
    const glyphPath = glyph.getPath(cursor, y, fontSize);
    glyphPath.fill = fillStyle;
    glyphPath.draw(ctx);
    cursor += glyphAdvance(face, glyph, fontSize);
  }
}

function toItems(rows) {
  return rows
    .map(([label, value]) => ({ label: String(label ?? "—"), value: Number(value) || 0 }))
    .filter((item) => item.value > 0);
}

function drawTitle(ctx, face, title, width) {
  const size = 15;
  const text = truncateText(face, title, size, width - 24);
  drawText(ctx, face, text, 12, 24, size, "#006BA3");
}

function drawHorizontalBarChart(ctx, regular, items, width, height) {
  const top = 40;
  const left = 118;
  const rightPad = 16;
  const rowH = Math.min(32, (height - top - 12) / items.length);
  const maxVal = Math.max(...items.map((i) => i.value), 1);
  const barMaxW = width - left - rightPad;
  const labelSize = 12;

  items.forEach((item, i) => {
    const y = top + i * rowH;
    const barW = Math.max(2, (item.value / maxVal) * barMaxW);
    const color = CHART_COLORS[i % CHART_COLORS.length];
    const midY = y + rowH * 0.45;

    const label = truncateText(regular, item.label, labelSize, 100);
    const labelW = measureText(regular, label, labelSize);
    drawText(ctx, regular, label, left - 10 - labelW, midY + labelSize * 0.35, labelSize, "#1A2332");

    ctx.fillStyle = color;
    ctx.fillRect(left, y, barW, rowH * 0.62);

    drawText(ctx, regular, String(item.value), left + barW + 6, midY + labelSize * 0.35, labelSize, "#475569");
  });
}

function drawPieChart(ctx, regular, items, width, height) {
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
  const labelSize = 12;

  items.forEach((item, i) => {
    const pct = Math.round((item.value / total) * 1000) / 10;
    ctx.fillStyle = CHART_COLORS[i % CHART_COLORS.length];
    ctx.fillRect(lx, ly - 6, 12, 12);
    const legend = `${truncateText(regular, item.label, labelSize, 140)} (${pct}%)`;
    drawText(ctx, regular, legend, lx + 18, ly + labelSize * 0.35, labelSize, "#1A2332");
    ly += 20;
  });
}

/**
 * Render a PNG chart for embedding in Excel.
 * @param {'pie'|'bar'} chartType
 * @param {(string|number)[][]} rows — [label, count] pairs
 * @param {string} title
 * @returns {Buffer|null}
 */
function renderChartPng(chartType, rows, title) {
  const items = toItems(rows);
  if (!items.length) return null;

  ensureChartFonts();

  const pieItems = chartType === "pie" ? items.slice(0, 8) : items;
  const width = chartType === "pie" ? 480 : 520;
  const height =
    chartType === "pie"
      ? Math.min(300, Math.max(180, 60 + pieItems.length * 18))
      : Math.min(340, Math.max(160, 52 + items.length * 30));

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, width, height);

  drawTitle(ctx, boldFont, title, width);
  if (chartType === "pie") {
    drawPieChart(ctx, regularFont, pieItems, width, height);
  } else {
    drawHorizontalBarChart(ctx, regularFont, items.slice(0, 12), width, height);
  }

  return canvas.toBuffer("image/png");
}

module.exports = { renderChartPng };
