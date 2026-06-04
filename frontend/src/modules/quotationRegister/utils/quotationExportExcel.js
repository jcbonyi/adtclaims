import ExcelJS from "exceljs";
import { isPlacedStatus } from "../constants";
import { daysOpen, formatDisplayDate } from "./dates";
import {
  BRAND,
  thinBorder,
  excelColumnLetters,
  formatGeneratedAt,
  countBy,
  topN,
  addDashboardWorksheet,
  styleHeaderCell,
} from "./excelDashboardHelpers";

/** 0-based column indices for KES amount columns (Premium, Sum Insured). */
const MONEY_COL_CI = new Set([12, 13]);

const EXPORT_HEADERS = [
  "ID",
  "Client Name",
  "Cover Type",
  "Contact Person",
  "Source Agent",
  "Date Received",
  "Days Open",
  "Date Sent to Insurer",
  "Insurer",
  "Date from Insurer",
  "Status",
  "Policy Number",
  "Premium (KES)",
  "Sum Insured (KES)",
  "Renewal Date",
  "Last Follow-Up",
  "Notes",
];

export function buildQuotationFilterSummary(filters) {
  const parts = [];
  if (filters.search?.trim()) parts.push(`Search: "${filters.search.trim()}"`);
  if (filters.status) parts.push(`Status: ${filters.status}`);
  if (filters.coverType) parts.push(`Cover: ${filters.coverType}`);
  if (filters.insurer) parts.push(`Insurer: ${filters.insurer}`);
  if (filters.agent) parts.push(`Agent: ${filters.agent}`);
  return parts.length
    ? `Filters applied — ${parts.join(" · ")}`
    : "No register filters applied — export includes all quotations.";
}

function quotationToRow(q) {
  return [
    q.id,
    q.clientName ?? "",
    q.coverType ?? "",
    q.contactPerson ?? "",
    q.sourceAgent ?? "",
    formatDisplayDate(q.dateReceived),
    daysOpen(q.dateReceived),
    formatDisplayDate(q.dateSentToInsurer),
    q.insurer ?? "",
    formatDisplayDate(q.dateReceivedFromInsurer),
    q.status ?? "",
    q.policyNumber ?? "",
    q.premium ?? "",
    q.sumInsured ?? "",
    formatDisplayDate(q.renewalDate),
    formatDisplayDate(q.lastFollowUp),
    q.notes ?? "",
  ];
}

/**
 * Build dashboard summary from quotation objects in the export.
 * @param {object[]} quotations
 */
export function computeQuotationExportSummary(quotations) {
  const total = quotations.length;
  const placed = quotations.filter((q) => isPlacedStatus(q.status)).length;
  const inProgress = total - placed;

  let totalPremium = 0;
  let totalSumInsured = 0;
  const daysList = [];
  for (const q of quotations) {
    if (q.premium != null && !Number.isNaN(Number(q.premium))) {
      totalPremium += Number(q.premium);
    }
    if (q.sumInsured != null && !Number.isNaN(Number(q.sumInsured))) {
      totalSumInsured += Number(q.sumInsured);
    }
    const d = daysOpen(q.dateReceived);
    if (typeof d === "number" && Number.isFinite(d)) daysList.push(d);
  }
  const avgDays =
    daysList.length === 0
      ? 0
      : Number((daysList.reduce((s, d) => s + d, 0) / daysList.length).toFixed(1));

  const sent = quotations.filter((q) => q.dateSentToInsurer).length;
  const back = quotations.filter((q) => q.dateReceivedFromInsurer).length;

  const statusRows = topN(countBy(quotations, (q) => q.status)).map((r) => [r.label, r.value]);
  const insurerRows = topN(countBy(quotations, (q) => q.insurer)).map((r) => [r.label, r.value]);
  const agentRows = topN(countBy(quotations, (q) => q.sourceAgent?.trim() || "—")).map((r) => [
    r.label,
    r.value,
  ]);
  const coverRows = topN(countBy(quotations, (q) => q.coverType)).map((r) => [r.label, r.value]);

  const funnelRows = [
    ["Received", total],
    ["Sent to insurer", sent],
    ["Quote back from insurer", back],
    ["Cover placed", placed],
  ];

  return {
    kpis: [
      { label: "Total quotations in report", value: total },
      { label: "Cover placed", value: placed },
      { label: "In progress / other", value: inProgress },
      { label: "Average days open", value: avgDays },
      { label: "Total premium (KES)", value: totalPremium },
      { label: "Total sum insured (KES)", value: totalSumInsured },
    ],
    sections: [
      {
        title: "Pipeline funnel",
        headers: ["Stage", "Count"],
        rows: funnelRows,
        chartType: "bar",
      },
      {
        title: "Quotations by status",
        headers: ["Status", "Count"],
        rows: statusRows,
        chartType: "pie",
      },
      {
        title: "Quotations by insurer",
        headers: ["Insurer", "Count"],
        rows: insurerRows,
        chartType: "bar",
      },
      {
        title: "Quotations by agent",
        headers: ["Agent", "Count"],
        rows: agentRows,
        chartType: "bar",
      },
      {
        title: "Quotations by cover type",
        headers: ["Cover type", "Count"],
        rows: coverRows,
        chartType: "bar",
      },
    ],
  };
}

function addRegisterWorksheet(workbook, opts) {
  const { headers, dataRows, filterSummary, dataRowCount } = opts;
  const colCount = headers.length;
  const lastCol = excelColumnLetters(colCount);

  const sheet = workbook.addWorksheet("Quotation register", {
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
  c1.value = "ADT Insurance — Quotation register";
  c1.font = { name: "Calibri", size: 18, bold: true, color: { argb: BRAND.white } };
  c1.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND.blue } };
  c1.alignment = { vertical: "middle", horizontal: "center" };
  sheet.getRow(1).height = 34;

  sheet.mergeCells(`A2:${lastCol}2`);
  const c2 = sheet.getCell("A2");
  c2.value = `Detail data · Generated ${formatGeneratedAt()} · ${dataRowCount} quotation${dataRowCount === 1 ? "" : "s"}`;
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
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  });
  sheet.getRow(headerRowNum).height = 22;

  const dataStart = headerRowNum + 1;
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

      if (ci === 6 && typeof val === "number" && Number.isFinite(val)) {
        cell.value = val;
        cell.alignment = { vertical: "top", horizontal: "center" };
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

  return sheet;
}

/**
 * Build a styled management-ready .xlsx buffer with Dashboard + register sheets.
 * @param {{ quotations: object[]; filterSummary: string }} opts
 * @returns {Promise<ArrayBuffer>}
 */
export async function buildQuotationManagementWorkbookBuffer(opts) {
  const { quotations, filterSummary } = opts;
  const dataRows = quotations.map(quotationToRow);
  const dataRowCount = dataRows.length;
  const headers = EXPORT_HEADERS;

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "ADT Quotation Tracker";
  workbook.created = new Date();

  const summary = computeQuotationExportSummary(quotations);
  addDashboardWorksheet(workbook, {
    reportTitle: "ADT Insurance — Quotation dashboard",
    filterSummary,
    recordLabel: dataRowCount === 1 ? "quotation" : "quotations",
    recordCount: dataRowCount,
    kpis: summary.kpis,
    sections: summary.sections,
  });

  addRegisterWorksheet(workbook, { headers, dataRows, filterSummary, dataRowCount });

  return workbook.xlsx.writeBuffer();
}

export function downloadQuotationWorkbook(buffer, filename = "ADT-quotation-register.xlsx") {
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
