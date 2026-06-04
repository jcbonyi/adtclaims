import { renderChartPng } from "./excelChartPng";

const BRAND = {
  blue: "FF0078C8",
  blueDeep: "FF006BA3",
  green: "FF72BF44",
  white: "FFFFFFFF",
  text: "FF1A2332",
  muted: "FF64748B",
  zebra: "FFF0F4F9",
  border: "FFDDE4EE",
};

const thinBorder = {
  top: { style: "thin", color: { argb: BRAND.border } },
  left: { style: "thin", color: { argb: BRAND.border } },
  bottom: { style: "thin", color: { argb: BRAND.border } },
  right: { style: "thin", color: { argb: BRAND.border } },
};

export function excelColumnLetters(colIndex1Based) {
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

export function formatGeneratedAt(d = new Date()) {
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()} at ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export function countBy(items, keyFn) {
  const map = new Map();
  for (const item of items) {
    const key = keyFn(item) || "—";
    map.set(key, (map.get(key) || 0) + 1);
  }
  return [...map.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
}

export function topN(breakdown, n = 10) {
  if (breakdown.length <= n) return breakdown;
  const head = breakdown.slice(0, n);
  const rest = breakdown.slice(n).reduce((sum, row) => sum + row.value, 0);
  if (rest > 0) head.push({ label: "Other", value: rest });
  return head;
}

export function styleHeaderCell(cell) {
  cell.font = { name: "Calibri", size: 11, bold: true, color: { argb: BRAND.white } };
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND.green } };
  cell.alignment = { vertical: "middle", horizontal: "center" };
  cell.border = thinBorder;
}

const CHART_IMAGE_START_COL = 3;

function applyCountDataBars(sheet, dataStart, dataEnd) {
  if (dataEnd < dataStart) return;
  sheet.addConditionalFormatting({
    ref: `B${dataStart}:B${dataEnd}`,
    rules: [
      {
        type: "dataBar",
        cfvo: [{ type: "min" }, { type: "max" }],
        color: { argb: BRAND.blue },
        showValue: true,
        gradient: false,
      },
    ],
  });
}

function writeTableBlock(sheet, startRow, title, headers, dataRows, chartType) {
  let row = startRow;
  const tableCols = chartType ? 3 : 2;
  sheet.mergeCells(row, 1, row, tableCols);
  const titleCell = sheet.getCell(row, 1);
  titleCell.value = title;
  titleCell.font = { name: "Calibri", size: 12, bold: true, color: { argb: BRAND.blueDeep } };
  row += 1;

  const tableHeaders = chartType ? [...headers, "%"] : headers;
  tableHeaders.forEach((text, i) => {
    const cell = sheet.getCell(row, i + 1);
    cell.value = text;
    styleHeaderCell(cell);
  });
  row += 1;

  const dataStart = row;
  const total = dataRows.reduce((sum, r) => sum + (Number(r[1]) || 0), 0) || 1;
  dataRows.forEach((vals, ri) => {
    const count = Number(vals[1]) || 0;
    const rowVals = chartType
      ? [vals[0], count, `${Math.round((count / total) * 1000) / 10}%`]
      : vals;
    rowVals.forEach((val, ci) => {
      const cell = sheet.getCell(row, ci + 1);
      cell.value = val;
      cell.font = { name: "Calibri", size: 10, color: { argb: BRAND.text } };
      cell.border = thinBorder;
      cell.alignment = { vertical: "middle" };
      if (ri % 2 === 1) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND.zebra } };
      }
    });
    sheet.getRow(row).height = chartType ? 20 : 16;
    row += 1;
  });

  if (chartType) {
    applyCountDataBars(sheet, dataStart, row - 1);
  }

  return { nextRow: row + 1, dataStart, dataEnd: row - 1, dataCount: dataRows.length, chartType };
}

async function embedSectionChart(workbook, sheet, block, section) {
  if (!block.chartType || block.dataCount < 1) return;
  const png = await renderChartPng(block.chartType, section.rows, section.title);
  if (!png) return;

  const imageId = workbook.addImage({ buffer: png, extension: "png" });
  const rowCount = block.dataEnd - block.dataStart + 1;
  sheet.addImage(imageId, {
    tl: { col: CHART_IMAGE_START_COL, row: block.dataStart - 1.15 },
    ext: { width: 460, height: Math.max(110, rowCount * 26 + 48) },
  });
}

function styleTitleBand(sheet, lastCol, title, subtitle, filterSummary) {
  sheet.mergeCells(1, 1, 1, lastCol);
  const c1 = sheet.getCell(1, 1);
  c1.value = title;
  c1.font = { name: "Calibri", size: 18, bold: true, color: { argb: BRAND.white } };
  c1.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND.blue } };
  c1.alignment = { vertical: "middle", horizontal: "center" };
  sheet.getRow(1).height = 34;

  sheet.mergeCells(2, 1, 2, lastCol);
  const c2 = sheet.getCell(2, 1);
  c2.value = subtitle;
  c2.font = { name: "Calibri", size: 11, color: { argb: BRAND.white } };
  c2.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND.blueDeep } };
  c2.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  sheet.getRow(2).height = 22;

  sheet.mergeCells(3, 1, 3, lastCol);
  const c3 = sheet.getCell(3, 1);
  c3.value = filterSummary || "";
  c3.font = { name: "Calibri", size: 10, italic: true, color: { argb: BRAND.muted } };
  c3.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND.white } };
  c3.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
  sheet.getRow(3).height = filterSummary && filterSummary.length > 80 ? 36 : 22;
}

export async function addDashboardWorksheet(workbook, opts) {
  const { reportTitle, filterSummary, recordLabel, recordCount, kpis, sections } = opts;
  const sheet = workbook.addWorksheet("Dashboard", {
    properties: { tabColor: { argb: BRAND.green } },
    views: [{ showGridLines: false }],
  });

  const lastCol = 12;
  styleTitleBand(
    sheet,
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
    await embedSectionChart(workbook, sheet, block, section);
    row = block.nextRow + 2;
  }

  sheet.getColumn(1).width = 28;
  sheet.getColumn(2).width = 14;
  sheet.getColumn(3).width = 10;
  for (let c = 4; c <= lastCol; c += 1) {
    sheet.getColumn(c).width = 14;
  }

  return sheet;
}

export async function safeAddDashboardWorksheet(workbook, opts) {
  try {
    return await addDashboardWorksheet(workbook, opts);
  } catch (err) {
    console.warn("Dashboard worksheet build failed, using fallback:", err);
    const existing = workbook.getWorksheet("Dashboard");
    if (existing) {
      workbook.removeWorksheet(existing.id);
    }
    const sheet = workbook.addWorksheet("Dashboard");
    sheet.getCell(1, 1).value = opts.reportTitle || "Dashboard";
    sheet.getCell(2, 1).value =
      opts.filterSummary ||
      `Summary · ${opts.recordCount ?? 0} ${opts.recordLabel ?? "records"}`;
    return sheet;
  }
}

function pinDashboardTabFirst(workbook) {
  const dashboard = workbook.getWorksheet("Dashboard");
  if (!dashboard) return;
  dashboard.orderNo = 0;
  let n = 1;
  for (const sheet of workbook.worksheets) {
    if (sheet.name === "Dashboard") continue;
    sheet.orderNo = n;
    n += 1;
  }
}

export function setWorkbookOpensOnDashboard(workbook) {
  pinDashboardTabFirst(workbook);
  workbook.views = [
    {
      x: 0,
      y: 0,
      width: 20000,
      height: 12000,
      firstSheet: 0,
      activeTab: 0,
      visibility: "visible",
    },
  ];
}

export { BRAND, thinBorder };
