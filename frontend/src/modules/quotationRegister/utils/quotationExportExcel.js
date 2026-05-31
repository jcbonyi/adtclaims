import ExcelJS from "exceljs";
import { daysOpen, formatDisplayDate } from "./dates";

/** ADT brand palette (ARGB, no #) — aligned with quotation tracker UI. */
const BRAND = {
  blue: "FF1B5EA8",
  blueDeep: "FF134785",
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
 * Build a styled management-ready .xlsx buffer for the quotation register.
 * @param {{ quotations: object[]; filterSummary: string }} opts
 * @returns {Promise<ArrayBuffer>}
 */
export async function buildQuotationManagementWorkbookBuffer(opts) {
  const { quotations, filterSummary } = opts;
  const dataRows = quotations.map(quotationToRow);
  const dataRowCount = dataRows.length;
  const headers = EXPORT_HEADERS;
  const colCount = headers.length;
  const lastCol = excelColumnLetters(colCount);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "ADT Quotation Tracker";
  workbook.created = new Date();

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
  c2.value = `Management report · Generated ${formatGeneratedAt()} · ${dataRowCount} quotation${dataRowCount === 1 ? "" : "s"}`;
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
