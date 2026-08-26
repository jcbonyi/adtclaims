const fs = require("fs");
const path = require("path");
const ExcelJS = require("exceljs");

const HEADER_GREEN = "FF72BF44";
const WHITE = "FFFFFFFF";
const TEXT = "FF1A2332";
const MUTED = "FF475569";
const ZEBRA = "FFF8FAFC";
const BORDER = "FFCBD5E1";

const COMPANY = {
  name: "ADT AFRICA INSURANCE BROKERS LTD",
  wordmark: "adt africa Insurance Brokers Ltd",
  slogan: "Insuring Africa With Confidence.",
  address1: "3rd Floor, Kilindini Plaza, Moi Avenue, Mombasa",
  address2: "P.O. Box 38269-00623, Nairobi, Kenya.",
  tel: "Tel: 0711 533 245 | 0787 820221 | 0785 227 772",
};

const COLUMNS = [
  { header: "Insurer", width: 28 },
  { header: "Cover Type", width: 22 },
  { header: "Insured Name", width: 32 },
  { header: "Reg No", width: 16 },
  { header: "Reported to Insurer", width: 20 },
  { header: "Status", width: 22 },
];

const thinBorder = {
  top: { style: "thin", color: { argb: BORDER } },
  left: { style: "thin", color: { argb: BORDER } },
  bottom: { style: "thin", color: { argb: BORDER } },
  right: { style: "thin", color: { argb: BORDER } },
};

function nairobiDateString(value = new Date()) {
  return new Date(value).toLocaleDateString("en-CA", { timeZone: "Africa/Nairobi" });
}

function nairobiDateTimeLabel(value = new Date()) {
  return new Date(value).toLocaleString("en-GB", {
    timeZone: "Africa/Nairobi",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function formatKenyaDate(value) {
  if (value === null || value === undefined || value === "") return "";
  if (typeof value === "string") {
    const m = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-GB", { timeZone: "Africa/Nairobi" });
}

function resolveLogoPath() {
  const candidates = [
    path.join(__dirname, "..", "assets", "adt-africa-logo.png"),
    path.join(__dirname, "..", "assets", "adt-logo.png"),
    path.join(__dirname, "..", "..", "frontend", "public", "adt-logo.png"),
  ];
  return candidates.find((p) => fs.existsSync(p)) || null;
}

function styleHeaderCell(cell) {
  cell.font = { name: "Calibri", size: 11, bold: true, color: { argb: WHITE } };
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_GREEN } };
  cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  cell.border = thinBorder;
}

function isMotorClaim(row) {
  return String(row.claimType || row.claim_type || "").toUpperCase() === "MOTOR";
}

function addRegisterSheet(workbook, { name, tabColor, rows, generatedAt, logoImageId, sectionLabel }) {
  const sheet = workbook.addWorksheet(name, {
    properties: { tabColor: { argb: tabColor } },
    views: [{ state: "frozen", ySplit: 6, topLeftCell: "A7", activeCell: "A7" }],
  });

  sheet.pageSetup = {
    paperSize: 9,
    orientation: "landscape",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: { left: 0.4, right: 0.4, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 },
  };

  COLUMNS.forEach((col, i) => {
    sheet.getColumn(i + 1).width = col.width;
  });

  sheet.mergeCells("A1:C4");
  sheet.mergeCells("D1:F1");
  sheet.mergeCells("D2:F2");
  sheet.mergeCells("D3:F3");
  sheet.mergeCells("D4:F4");
  sheet.mergeCells("A5:F5");

  if (logoImageId != null) {
    sheet.addImage(logoImageId, {
      tl: { col: 0.05, row: 0.1 },
      ext: { width: 260, height: 88 },
    });
  } else {
    const brand = sheet.getCell("A1");
    brand.value = COMPANY.wordmark;
    brand.font = { name: "Calibri", size: 14, bold: true, color: { argb: "FF0078C8" } };
    brand.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
  }

  const nameCell = sheet.getCell("D1");
  nameCell.value = COMPANY.name;
  nameCell.font = { name: "Calibri", size: 12, bold: true, color: { argb: TEXT } };
  nameCell.alignment = { vertical: "middle", horizontal: "right" };

  const addr1 = sheet.getCell("D2");
  addr1.value = COMPANY.address1;
  addr1.font = { name: "Calibri", size: 9, color: { argb: MUTED } };
  addr1.alignment = { vertical: "middle", horizontal: "right" };

  const addr2 = sheet.getCell("D3");
  addr2.value = COMPANY.address2;
  addr2.font = { name: "Calibri", size: 9, color: { argb: MUTED } };
  addr2.alignment = { vertical: "middle", horizontal: "right" };

  const tel = sheet.getCell("D4");
  tel.value = COMPANY.tel;
  tel.font = { name: "Calibri", size: 9, color: { argb: MUTED } };
  tel.alignment = { vertical: "middle", horizontal: "right" };

  sheet.getRow(1).height = 24;
  sheet.getRow(2).height = 18;
  sheet.getRow(3).height = 18;
  sheet.getRow(4).height = 18;

  const asAt = sheet.getCell("A5");
  asAt.value = `Open ${sectionLabel.toLowerCase()} claims as at ${nairobiDateTimeLabel(generatedAt)} EAT · ${rows.length} claim${
    rows.length === 1 ? "" : "s"
  }`;
  asAt.font = { name: "Calibri", size: 9, italic: true, color: { argb: MUTED } };
  asAt.alignment = { vertical: "middle", horizontal: "left" };
  sheet.getRow(5).height = 18;

  const headerRow = 6;
  COLUMNS.forEach((col, i) => {
    const cell = sheet.getCell(headerRow, i + 1);
    cell.value = col.header;
    styleHeaderCell(cell);
  });
  sheet.getRow(headerRow).height = 22;

  rows.forEach((row, ri) => {
    const excelRow = sheet.getRow(headerRow + 1 + ri);
    const values = [
      row.insurer || "",
      row.coverType || "",
      row.insuredName || "",
      row.regNo || "",
      row.reportedToInsurer || "",
      row.status || "",
    ];
    values.forEach((val, ci) => {
      const cell = excelRow.getCell(ci + 1);
      cell.value = val;
      cell.font = { name: "Calibri", size: 10, color: { argb: TEXT } };
      cell.border = thinBorder;
      cell.alignment = {
        vertical: "middle",
        horizontal: ci === 4 ? "center" : "left",
        wrapText: true,
      };
      if (ri % 2 === 1) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ZEBRA } };
      }
    });
    excelRow.height = 18;
  });

  if (!rows.length) {
    sheet.mergeCells("A7:F7");
    const empty = sheet.getCell("A7");
    empty.value = `No open ${sectionLabel.toLowerCase()} claims in the register.`;
    empty.font = { name: "Calibri", size: 10, italic: true, color: { argb: MUTED } };
    empty.alignment = { vertical: "middle", horizontal: "center" };
  }

  sheet.headerFooter.oddFooter = `&L${COMPANY.slogan}&C${sectionLabel}&RPage &P of &N`;
  return sheet;
}

/**
 * Excel matching the ADT claims-register letterhead, with Motor and Non-Motor tabs.
 */
async function buildDailyClaimsRegisterWorkbookBuffer(rows, generatedAt = new Date()) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = COMPANY.name;
  workbook.created = generatedAt;
  workbook.modified = generatedAt;

  const logoPath = resolveLogoPath();
  const logoImageId = logoPath
    ? workbook.addImage({ filename: logoPath, extension: "png" })
    : null;

  const motorRows = rows.filter(isMotorClaim);
  const nonMotorRows = rows.filter((row) => !isMotorClaim(row));

  addRegisterSheet(workbook, {
    name: "Motor",
    tabColor: "FF0078C8",
    rows: motorRows,
    generatedAt,
    logoImageId,
    sectionLabel: "Motor",
  });
  addRegisterSheet(workbook, {
    name: "Non-Motor",
    tabColor: HEADER_GREEN,
    rows: nonMotorRows,
    generatedAt,
    logoImageId,
    sectionLabel: "Non-Motor",
  });

  return workbook.xlsx.writeBuffer();
}

function mapClaimRow(row) {
  return {
    claimType: row.claim_type || "",
    insurer: row.insurer || "",
    coverType: row.cover_type || "",
    insuredName: row.insured_name || "",
    regNo: row.registration_number || "",
    reportedToInsurer: formatKenyaDate(row.reported_to_insurer_date),
    status: row.claim_status || "",
  };
}

module.exports = {
  COMPANY,
  nairobiDateString,
  nairobiDateTimeLabel,
  formatKenyaDate,
  mapClaimRow,
  isMotorClaim,
  buildDailyClaimsRegisterWorkbookBuffer,
};
