const ExcelJS = require("exceljs");

const BRAND = {
  blue: "FF0078C8",
  blueDeep: "FF006BA3",
  green: "FF8BC63A",
  white: "FFFFFFFF",
  text: "FF0F172A",
  muted: "FF64748B",
  zebra: "FFF1F5F9",
  border: "FFCBD5E1",
};

const thinBorder = {
  top: { style: "thin", color: { argb: BRAND.border } },
  left: { style: "thin", color: { argb: BRAND.border } },
  bottom: { style: "thin", color: { argb: BRAND.border } },
  right: { style: "thin", color: { argb: BRAND.border } },
};

const CHART_COLORS = ["FF0078C8", "FF8BC63A", "FF006BA3", "FF72BF44", "FFF59E0B", "FF7C3AED", "FFDB2777"];

function excelColumnLetters(colIndex1Based) {
  let n = colIndex1Based;
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function formatGeneratedAt(d = new Date()) {
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()} at ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function countBy(items, keyFn) {
  const map = new Map();
  for (const item of items) {
    const key = keyFn(item) || "—";
    map.set(key, (map.get(key) || 0) + 1);
  }
  return [...map.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
}

function topN(breakdown, n = 10) {
  if (breakdown.length <= n) return breakdown;
  const head = breakdown.slice(0, n);
  const rest = breakdown.slice(n).reduce((sum, row) => sum + row.value, 0);
  if (rest > 0) head.push({ label: "Other", value: rest });
  return head;
}

function styleHeaderCell(cell) {
  cell.font = { name: "Calibri", size: 11, bold: true, color: { argb: BRAND.white } };
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND.green } };
  cell.alignment = { vertical: "middle", horizontal: "center" };
  cell.border = thinBorder;
}

function styleTitleBand(sheet, row, lastCol, title, subtitle, filterSummary) {
  sheet.mergeCells(row, 1, row, lastCol);
  const c1 = sheet.getCell(row, 1);
  c1.value = title;
  c1.font = { name: "Calibri", size: 18, bold: true, color: { argb: BRAND.white } };
  c1.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND.blue } };
  c1.alignment = { vertical: "middle", horizontal: "center" };
  sheet.getRow(row).height = 34;

  sheet.mergeCells(row + 1, 1, row + 1, lastCol);
  const c2 = sheet.getCell(row + 1, 1);
  c2.value = subtitle;
  c2.font = { name: "Calibri", size: 11, color: { argb: BRAND.white } };
  c2.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND.blueDeep } };
  c2.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  sheet.getRow(row + 1).height = 22;

  sheet.mergeCells(row + 2, 1, row + 2, lastCol);
  const c3 = sheet.getCell(row + 2, 1);
  c3.value = filterSummary || "";
  c3.font = { name: "Calibri", size: 10, italic: true, color: { argb: BRAND.muted } };
  c3.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND.white } };
  c3.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
  sheet.getRow(row + 2).height = filterSummary && filterSummary.length > 80 ? 36 : 22;
}

const BAR_CHART_START_COL = 4;
const BAR_CHART_COLS = 10;

/** In-cell bar chart (ExcelJS has no native chart API). */
function paintBarCells(sheet, row, value, maxVal, chartType, rowIndex) {
  const filled =
    value <= 0 ? 0 : Math.max(1, Math.round((value / maxVal) * BAR_CHART_COLS));
  const barColor = chartType === "pie" ? CHART_COLORS[rowIndex % CHART_COLORS.length] : BRAND.blue;
  for (let b = 0; b < BAR_CHART_COLS; b += 1) {
    const cell = sheet.getCell(row, BAR_CHART_START_COL + b);
    cell.border = thinBorder;
    if (b < filled) {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: barColor } };
    } else if (rowIndex % 2 === 1) {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND.zebra } };
    }
  }
}

function writeTableBlock(sheet, startRow, title, headers, dataRows, chartType) {
  let row = startRow;
  const titleEndCol = chartType ? BAR_CHART_START_COL + BAR_CHART_COLS - 1 : 4;
  sheet.mergeCells(row, 1, row, titleEndCol);
  const titleCell = sheet.getCell(row, 1);
  titleCell.value = title;
  titleCell.font = { name: "Calibri", size: 12, bold: true, color: { argb: BRAND.blueDeep } };
  row += 1;

  headers.forEach((text, i) => {
    const cell = sheet.getCell(row, i + 1);
    cell.value = text;
    styleHeaderCell(cell);
  });
  if (chartType) {
    sheet.mergeCells(row, BAR_CHART_START_COL, row, BAR_CHART_START_COL + BAR_CHART_COLS - 1);
    const chartHeader = sheet.getCell(row, BAR_CHART_START_COL);
    chartHeader.value = chartType === "pie" ? "Distribution" : "Visual";
    styleHeaderCell(chartHeader);
  }
  row += 1;

  const dataStart = row;
  const maxVal = Math.max(...dataRows.map((r) => Number(r[1]) || 0), 1);
  dataRows.forEach((vals, ri) => {
    vals.forEach((val, ci) => {
      const cell = sheet.getCell(row, ci + 1);
      cell.value = val;
      cell.font = { name: "Calibri", size: 10, color: { argb: BRAND.text } };
      cell.border = thinBorder;
      if (ri % 2 === 1) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND.zebra } };
      }
    });
    if (chartType) {
      paintBarCells(sheet, row, Number(vals[1]) || 0, maxVal, chartType, ri);
    }
    row += 1;
  });

  return { nextRow: row + 1, dataStart, dataEnd: row - 1, dataCount: dataRows.length };
}

/**
 * @param {ExcelJS.Workbook} workbook
 * @param {{ reportTitle: string; filterSummary: string; recordLabel: string; recordCount: number; kpis: {label:string;value:string|number}[]; sections: { title: string; headers: string[]; rows: (string|number)[][]; chartType?: 'pie'|'bar' }[] }} opts
 */
function addDashboardWorksheet(workbook, opts) {
  const { reportTitle, filterSummary, recordLabel, recordCount, kpis, sections } = opts;
  const sheet = workbook.addWorksheet("Dashboard", {
    properties: { tabColor: { argb: BRAND.green } },
    views: [{ showGridLines: false }],
  });

  const lastCol = 12;
  styleTitleBand(
    sheet,
    1,
    lastCol,
    reportTitle,
    `Executive summary · Generated ${formatGeneratedAt()} · ${recordCount} ${recordLabel}`,
    filterSummary
  );

  let row = 5;
  sheet.mergeCells(row, 1, row, 4);
  sheet.getCell(row, 1).value = "Key metrics";
  sheet.getCell(row, 1).font = { name: "Calibri", size: 12, bold: true, color: { argb: BRAND.blueDeep } };
  row += 1;

  const kpiHeaderRow = row;
  ["Metric", "Value"].forEach((text, i) => {
    const cell = sheet.getCell(row, i + 1);
    cell.value = text;
    styleHeaderCell(cell);
  });
  row += 1;

  kpis.forEach((kpi, ri) => {
    sheet.getCell(row, 1).value = kpi.label;
    sheet.getCell(row, 2).value = kpi.value;
    [1, 2].forEach((ci) => {
      const cell = sheet.getCell(row, ci);
      cell.font = { name: "Calibri", size: 10, color: { argb: BRAND.text } };
      cell.border = thinBorder;
      if (ri % 2 === 1) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND.zebra } };
      }
    });
    row += 1;
  });

  row += 1;

  for (const section of sections) {
    if (!section.rows.length) continue;
    const block = writeTableBlock(
      sheet,
      row,
      section.title,
      section.headers,
      section.rows,
      section.chartType
    );
    row = block.nextRow + 1;
  }

  sheet.getColumn(1).width = 28;
  sheet.getColumn(2).width = 16;
  sheet.getColumn(3).width = 4;
  sheet.getColumn(4).width = 4;
  for (let c = 5; c <= lastCol; c += 1) {
    sheet.getColumn(c).width = 12;
  }

  return sheet;
}

module.exports = {
  BRAND,
  thinBorder,
  excelColumnLetters,
  formatGeneratedAt,
  countBy,
  topN,
  addDashboardWorksheet,
  styleHeaderCell,
};
