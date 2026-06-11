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

function valuationToExportRow(v) {
  return {
    "Insured Name": v.insuredName || "",
    "Insurance Company": v.insuranceCompany || "",
    "Policy Number": v.policyNumber || "",
    "Policy Renewal Date": formatDateForExport(v.policyRenewalDate),
    "Vehicle Registration": v.vehicleRegistration || "",
    "Make & Model": v.vehicleMakeModel || "",
    "Financial Interest": v.financialInterest || "",
    "Sum Insured Before": v.sumInsuredBefore ?? "",
    "Assigned Valuer": v.valuerName || "",
    "Valuation Request Date": formatDateForExport(v.valuationRequestDate),
    "Inspection Date": formatDateForExport(v.inspectionDate),
    "Valuation Value": v.valuationValue ?? "",
    "Value Difference": v.valueDifference ?? "",
    "Variance %": v.percentageVariance ?? "",
    Status: v.status || "",
    Overdue: v.isOverdue ? "Yes" : "No",
    "Relationship Manager": v.relationshipManager || "",
    "Assigned Officer": v.officerName || "",
  };
}

const EXPORT_COLUMNS = Object.keys(valuationToExportRow({}));

async function buildValuationsWorkbookBuffer(rows, { title = "Motor Valuations", filterSummary = "" } = {}) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Valuations");
  sheet.mergeCells(1, 1, 1, EXPORT_COLUMNS.length);
  const titleCell = sheet.getCell(1, 1);
  titleCell.value = title;
  titleCell.font = { bold: true, size: 14, color: { argb: "FF1D4ED8" } };

  if (filterSummary) {
    sheet.mergeCells(2, 1, 2, EXPORT_COLUMNS.length);
    sheet.getCell(2, 1).value = filterSummary;
    sheet.getCell(2, 1).font = { italic: true, size: 10 };
  }

  const headerRow = filterSummary ? 4 : 3;
  sheet.getRow(headerRow).values = EXPORT_COLUMNS;
  sheet.getRow(headerRow).font = { bold: true };
  sheet.getRow(headerRow).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF1D4ED8" },
  };
  sheet.getRow(headerRow).font = { bold: true, color: { argb: "FFFFFFFF" } };

  rows.forEach((row, idx) => {
    const exportRow = valuationToExportRow(row);
    sheet.getRow(headerRow + 1 + idx).values = EXPORT_COLUMNS.map((col) => exportRow[col]);
  });

  sheet.columns.forEach((col) => {
    col.width = 18;
  });

  return workbook.xlsx.writeBuffer();
}

function buildValuationsCsv(rows) {
  const escape = (val) => {
    const s = String(val ?? "");
    if (s.includes(",") || s.includes('"') || s.includes("\n")) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };
  const lines = [EXPORT_COLUMNS.join(",")];
  for (const row of rows) {
    const exportRow = valuationToExportRow(row);
    lines.push(EXPORT_COLUMNS.map((col) => escape(exportRow[col])).join(","));
  }
  return lines.join("\n");
}

module.exports = {
  buildValuationsWorkbookBuffer,
  buildValuationsCsv,
  valuationToExportRow,
  formatDateForExport,
};
