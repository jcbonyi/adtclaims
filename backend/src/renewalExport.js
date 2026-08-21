const ExcelJS = require("exceljs");

function formatDateForExport(value) {
  if (value === null || value === undefined || value === "") return "";
  if (typeof value === "string") {
    const m = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${date.getFullYear()}`;
}

function policyToExportRow(p) {
  return {
    "Insured Name": p.insuredName || "",
    Contacts: p.phoneRaw || "",
    Email: p.email || "",
    "Policy Renewal": formatDateForExport(p.renewalDate),
    "Car Registration Details": p.carRegistrations || "",
    "Financial Interest": p.financialInterest || "",
    Insurer: p.insurer || "",
    "Policy Number": p.policyNumber || "",
    Status: p.status || "",
    Pipeline: p.pipelineStage || "",
    Premium: p.premium ?? "",
    "Relationship Manager": p.officerName || p.relationshipManager || "",
    "Days Until Renewal": p.daysUntilRenewal ?? "",
    "Phone (E.164)": p.phoneE164 || "",
  };
}

const EXPORT_COLUMNS = Object.keys(policyToExportRow({}));

const TEMPLATE_COLUMNS = [
  "Insured Name",
  "Contacts",
  "Email",
  "Policy Renewal",
  "Car Registration Details",
  "Financial Interest",
  "Insurer",
  "Policy Number",
  "Premium",
  "Relationship Manager",
];

async function buildRenewalsWorkbookBuffer(rows, { title = "Policy Renewals", filterSummary = "" } = {}) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Renewals");
  sheet.properties.tabColor = { argb: "FF0078C8" };

  sheet.mergeCells(1, 1, 1, EXPORT_COLUMNS.length);
  const titleCell = sheet.getCell(1, 1);
  titleCell.value = title;
  titleCell.font = { bold: true, size: 14, color: { argb: "FF0078C8" } };

  if (filterSummary) {
    sheet.mergeCells(2, 1, 2, EXPORT_COLUMNS.length);
    sheet.getCell(2, 1).value = filterSummary;
    sheet.getCell(2, 1).font = { italic: true, size: 10 };
  }

  const headerRow = filterSummary ? 4 : 3;
  sheet.getRow(headerRow).values = EXPORT_COLUMNS;
  sheet.getRow(headerRow).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(headerRow).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF0078C8" },
  };

  rows.forEach((row, idx) => {
    const exportRow = policyToExportRow(row);
    sheet.getRow(headerRow + 1 + idx).values = EXPORT_COLUMNS.map((col) => exportRow[col]);
  });

  sheet.columns.forEach((col) => {
    col.width = 22;
  });

  return workbook.xlsx.writeBuffer();
}

async function buildRenewalsTemplateBuffer() {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Renewals");
  sheet.properties.tabColor = { argb: "FF72BF44" };

  sheet.mergeCells(1, 1, 1, TEMPLATE_COLUMNS.length);
  sheet.getCell(1, 1).value = "ADT Policy Renewals — Import Template";
  sheet.getCell(1, 1).font = { bold: true, size: 14, color: { argb: "FF0078C8" } };

  sheet.mergeCells(2, 1, 2, TEMPLATE_COLUMNS.length);
  sheet.getCell(2, 1).value =
    "Required: Insured Name, Contacts (phone e.g. 722111333), Email, Policy Renewal date. Re-importing the same insured + vehicle regs + renewal date updates the existing row. Financial Interest (not N/A) also notifies the financier.";
  sheet.getCell(2, 1).font = { italic: true, size: 10 };

  const headerRow = 4;
  sheet.getRow(headerRow).values = TEMPLATE_COLUMNS;
  sheet.getRow(headerRow).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(headerRow).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF0078C8" },
  };

  sheet.getRow(headerRow + 1).values = [
    "MUKYS IMPORTERS LIMITED",
    "722111333",
    "ops@mukys.example",
    "2026-02-01",
    "KBJ 139Q",
    "ABSON / N/A",
    "CIC",
    "POL-001",
    "125000",
    "",
  ];

  sheet.columns.forEach((col) => {
    col.width = 28;
  });

  return workbook.xlsx.writeBuffer();
}

function buildExportFilterSummary(query = {}) {
  const parts = [];
  if (query.q) parts.push(`Search: "${String(query.q).trim()}"`);
  if (query.status) parts.push(`Status: ${query.status}`);
  if (query.window) parts.push(`Window: ${query.window}`);
  return parts.length
    ? `Filters applied — ${parts.join(" · ")}`
    : "No register filters applied — export includes all policies.";
}

module.exports = {
  EXPORT_COLUMNS,
  buildRenewalsWorkbookBuffer,
  buildRenewalsTemplateBuffer,
  buildExportFilterSummary,
  policyToExportRow,
  formatDateForExport,
};
