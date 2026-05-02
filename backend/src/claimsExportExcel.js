const ExcelJS = require("exceljs");

/** ADT Insurance brand — primary blue + lime accent (ARGB, no #). */
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

const thinBorder = {
  top: { style: "thin", color: { argb: BRAND.border } },
  left: { style: "thin", color: { argb: BRAND.border } },
  bottom: { style: "thin", color: { argb: BRAND.border } },
  right: { style: "thin", color: { argb: BRAND.border } },
};

/** 0-based column indices for KES amount columns (Vehicle Value, Repair Estimate). */
const MONEY_COL_CI = new Set([13, 14]);

/**
 * Build a styled management-ready .xlsx buffer.
 * @param {{ headers: string[]; dataRows: (string|number|null|undefined)[][]; filterSummary: string; dataRowCount: number }} opts
 */
async function buildClaimsManagementWorkbookBuffer(opts) {
  const { headers, dataRows, filterSummary, dataRowCount } = opts;
  const colCount = headers.length;
  if (colCount === 0) {
    throw new Error("Export requires at least one column");
  }
  const lastCol = excelColumnLetters(colCount);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "ADT Claims Tracker";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Claims register", {
    properties: { tabColor: { argb: BRAND.blue } },
    views: [{ state: "frozen", ySplit: 4, topLeftCell: "A5", activeCell: "A5" }],
  });

  sheet.pageSetup = {
    paperSize: 9,
    orientation: "landscape",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
  };

  sheet.mergeCells(`A1:${lastCol}1`);
  const c1 = sheet.getCell("A1");
  c1.value = "ADT Insurance — Claims register";
  c1.font = { name: "Calibri", size: 18, bold: true, color: { argb: BRAND.white } };
  c1.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND.blue } };
  c1.alignment = { vertical: "middle", horizontal: "center" };
  sheet.getRow(1).height = 34;

  sheet.mergeCells(`A2:${lastCol}2`);
  const c2 = sheet.getCell("A2");
  c2.value = `Management report · Generated ${formatGeneratedAt()} · ${dataRowCount} claim${dataRowCount === 1 ? "" : "s"}`;
  c2.font = { name: "Calibri", size: 11, color: { argb: BRAND.white } };
  c2.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND.blueDeep } };
  c2.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  sheet.getRow(2).height = 22;

  sheet.mergeCells(`A3:${lastCol}3`);
  const c3 = sheet.getCell("A3");
  c3.value = filterSummary || "";
  c3.font = { name: "Calibri", size: 10, italic: true, color: { argb: BRAND.muted } };
  c3.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND.white } };
  c3.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
  sheet.getRow(3).height = filterSummary && filterSummary.length > 80 ? 36 : 22;

  const headerRowNum = 4;
  headers.forEach((text, i) => {
    const cell = sheet.getCell(headerRowNum, i + 1);
    cell.value = text;
    cell.font = { name: "Calibri", size: 11, bold: true, color: { argb: BRAND.white } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND.green } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = thinBorder;
  });
  sheet.getRow(headerRowNum).height = 22;

  let dataStart = headerRowNum + 1;
  dataRows.forEach((rowVals, ri) => {
    const excelRow = sheet.getRow(dataStart + ri);
    excelRow.height = 16;
    rowVals.forEach((val, ci) => {
      const cell = excelRow.getCell(ci + 1);
      cell.font = { name: "Calibri", size: 10, color: { argb: BRAND.text } };
      cell.border = thinBorder;
      cell.alignment = { vertical: "top", wrapText: true };

      if (ri % 2 === 1) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND.zebra } };
      }

      if (MONEY_COL_CI.has(ci)) {
        if (val !== "" && val !== null && val !== undefined && !Number.isNaN(Number(val))) {
          cell.value = Number(val);
          cell.numFmt = "#,##0";
        } else {
          cell.value = "";
        }
        return;
      }

      if (typeof val === "number" && Number.isFinite(val)) {
        cell.value = val;
        return;
      }
      cell.value = val === null || val === undefined ? "" : String(val);
    });
  });

  for (let c = 1; c <= colCount; c += 1) {
    let maxLen = String(headers[c - 1] ?? "").length;
    for (const dr of dataRows) {
      const v = dr[c - 1];
      const len =
        v !== null && v !== undefined && typeof v === "number"
          ? String(Math.round(v)).length + 3
          : String(v ?? "").length;
      if (len > maxLen) maxLen = len;
    }
    sheet.getColumn(c).width = Math.min(Math.max(maxLen + 2, 11), 52);
  }

  const buf = await workbook.xlsx.writeBuffer();
  return Buffer.from(buf);
}

module.exports = {
  buildClaimsManagementWorkbookBuffer,
};
