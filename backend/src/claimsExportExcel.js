const ExcelJS = require("exceljs");
const { CLOSED_STATUS_LIST } = require("./claimStatuses");
const {
  BRAND,
  thinBorder,
  excelColumnLetters,
  formatGeneratedAt,
  countBy,
  topN,
  safeAddDashboardWorksheet,
  setWorkbookOpensOnDashboard,
  styleHeaderCell,
} = require("./excelDashboardHelpers");

/** 0-based column indices for KES amount columns (Vehicle Value, Repair Estimate). */
const MONEY_COL_CI = new Set([13, 14]);

const CLOSED_SET = new Set(CLOSED_STATUS_LIST);

function computeDaysOpen(reportedToBrokerDate, closureDate) {
  if (!reportedToBrokerDate) return 0;
  const start = new Date(reportedToBrokerDate);
  const end = closureDate ? new Date(closureDate) : new Date();
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
  const startUtc = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
  const endUtc = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());
  const days = Math.floor((endUtc - startUtc) / (1000 * 60 * 60 * 24));
  return days < 0 ? 0 : days;
}

function calcAgingBucket(daysOpen) {
  if (daysOpen <= 7) return "0-7";
  if (daysOpen <= 14) return "8-14";
  if (daysOpen <= 30) return "15-30";
  return "30+";
}

/**
 * Build dashboard summary from raw claim rows (DB shape).
 * @param {object[]} rows
 */
function computeClaimsExportSummary(rows) {
  const withDays = rows.map((r) => ({
    ...r,
    days_open: computeDaysOpen(r.reported_to_broker_date, r.closure_date),
  }));
  const total = withDays.length;
  const closed = withDays.filter((c) => CLOSED_SET.has(c.claim_status)).length;
  const open = total - closed;
  const avgDays =
    total === 0
      ? 0
      : Number((withDays.reduce((s, c) => s + c.days_open, 0) / total).toFixed(1));
  const over30 = withDays.filter((c) => !CLOSED_SET.has(c.claim_status) && c.days_open >= 31).length;

  const statusRows = topN(countBy(withDays, (c) => c.claim_status)).map((r) => [r.label, r.value]);
  const insurerRows = topN(countBy(withDays, (c) => c.insurer)).map((r) => [r.label, r.value]);
  const typeRows = topN(countBy(withDays, (c) => c.claim_type)).map((r) => [r.label, r.value]);

  const agingOrder = ["0-7", "8-14", "15-30", "30+"];
  const agingMap = new Map(agingOrder.map((b) => [b, 0]));
  for (const c of withDays) {
    const b = calcAgingBucket(c.days_open);
    agingMap.set(b, (agingMap.get(b) || 0) + 1);
  }
  const agingRows = agingOrder.map((b) => [b + " days", agingMap.get(b) || 0]);

  let totalVehicle = 0;
  let totalRepair = 0;
  for (const c of withDays) {
    if (c.vehicle_value != null && !Number.isNaN(Number(c.vehicle_value))) {
      totalVehicle += Number(c.vehicle_value);
    }
    if (c.repair_estimate != null && !Number.isNaN(Number(c.repair_estimate))) {
      totalRepair += Number(c.repair_estimate);
    }
  }

  return {
    kpis: [
      { label: "Total claims in report", value: total },
      { label: "Open claims", value: open },
      { label: "Closed claims", value: closed },
      { label: "Average days open", value: avgDays },
      { label: "Open claims over 30 days", value: over30 },
      { label: "Total vehicle value (KES)", value: totalVehicle },
      { label: "Total repair estimate (KES)", value: totalRepair },
    ],
    sections: [
      {
        title: "Claims by status",
        headers: ["Status", "Count"],
        rows: statusRows,
        chartType: "pie",
      },
      {
        title: "Claims by insurer",
        headers: ["Insurer", "Count"],
        rows: insurerRows,
        chartType: "bar",
      },
      {
        title: "Claims by type",
        headers: ["Claim type", "Count"],
        rows: typeRows,
        chartType: "bar",
      },
      {
        title: "Aging analysis",
        headers: ["Aging bucket", "Count"],
        rows: agingRows,
        chartType: "bar",
      },
    ],
  };
}

function addRegisterWorksheet(workbook, opts) {
  const { headers, dataRows, filterSummary, dataRowCount } = opts;
  const colCount = headers.length;
  const lastCol = excelColumnLetters(colCount);

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
  c2.value = `Detail data · Generated ${formatGeneratedAt()} · ${dataRowCount} claim${dataRowCount === 1 ? "" : "s"}`;
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
    styleHeaderCell(cell);
  });
  sheet.getRow(headerRowNum).height = 22;

  const pendingDocsColIndex = headers.indexOf("Pending Docs");
  const dataStart = headerRowNum + 1;
  dataRows.forEach((rowVals, ri) => {
    const excelRow = sheet.getRow(dataStart + ri);
    let rowHeight = 16;
    rowVals.forEach((val, ci) => {
      const cell = excelRow.getCell(ci + 1);
      const isPendingDocsCol = ci === pendingDocsColIndex;
      cell.font = { name: "Calibri", size: 10, color: { argb: BRAND.text } };
      cell.border = thinBorder;
      cell.alignment = { vertical: "top", horizontal: "left", wrapText: true };

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

      if (isPendingDocsCol && typeof val === "string" && val.includes("\n")) {
        const lineCount = val.split("\n").length;
        rowHeight = Math.max(rowHeight, Math.min(lineCount * 15 + 6, 180));
      }
    });
    excelRow.height = rowHeight;
  });

  for (let c = 1; c <= colCount; c += 1) {
    let maxLen = String(headers[c - 1] ?? "").length;
    for (const dr of dataRows) {
      const v = dr[c - 1];
      if (v !== null && v !== undefined && typeof v === "number") {
        maxLen = Math.max(maxLen, String(Math.round(v)).length + 3);
        continue;
      }
      const text = String(v ?? "");
      if (headers[c - 1] === "Pending Docs" && text.includes("\n")) {
        for (const line of text.split("\n")) {
          maxLen = Math.max(maxLen, line.length);
        }
      } else {
        maxLen = Math.max(maxLen, text.length);
      }
    }
    const headerName = headers[c - 1];
    const minWidth = headerName === "Pending Docs" ? 38 : 11;
    const maxWidth = headerName === "Pending Docs" ? 56 : 52;
    sheet.getColumn(c).width = Math.min(Math.max(maxLen + 2, minWidth), maxWidth);
  }

  return sheet;
}

/**
 * Build a styled management-ready .xlsx buffer with Dashboard + register sheets.
 * @param {{ headers: string[]; dataRows: (string|number|null|undefined)[][]; filterSummary: string; dataRowCount: number; sourceRows?: object[] }} opts
 */
async function buildClaimsManagementWorkbookBuffer(opts) {
  const { headers, dataRows, filterSummary, dataRowCount, sourceRows = [] } = opts;
  if (!headers.length) {
    throw new Error("Export requires at least one column");
  }

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "ADT Claims Tracker";
  workbook.created = new Date();

  addRegisterWorksheet(workbook, { headers, dataRows, filterSummary, dataRowCount });

  const summary = computeClaimsExportSummary(sourceRows);
  await safeAddDashboardWorksheet(workbook, {
    reportTitle: "ADT Insurance — Claims dashboard",
    filterSummary,
    recordLabel: dataRowCount === 1 ? "claim" : "claims",
    recordCount: dataRowCount,
    kpis: summary.kpis,
    sections: summary.sections,
  });
  setWorkbookOpensOnDashboard(workbook);

  const buf = await workbook.xlsx.writeBuffer();
  return Buffer.from(buf);
}

module.exports = {
  buildClaimsManagementWorkbookBuffer,
  computeClaimsExportSummary,
};
