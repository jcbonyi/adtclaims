const xlsx = require("xlsx");

const HEADER_ALIASES = {
  insuredName: [
    "Insured Name",
    "Insured Name Example",
    "insuredName",
    "Insured",
    "Client Name",
    "Policyholder",
  ],
  contacts: ["Contacts", "Contact", "Phone", "Mobile", "Telephone", "Phone Number"],
  renewalDate: [
    "Policy Renewal",
    "Policy Renewal Example",
    "Policy Renewal Date",
    "Renewal Date",
    "Expiry Date",
    "Expiry",
    "Policy Expiry",
  ],
  registrations: [
    "Car Registration Details",
    "Car Registration",
    "Vehicle Registration",
    "Registration",
    "Reg Number",
    "Reg No",
  ],
  financialInterest: [
    "Financial Interest",
    "Financial Interest Example",
    "Financier",
    "Bank",
    "Logbook Holder",
  ],
  email: ["Email", "Email Address", "Client Email"],
  policyNumber: ["Policy Number", "Policy No", "Policy #"],
  insurer: ["Insurer", "Insurance Company", "Underwriter"],
};

function normalizeKey(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function pickValue(row, aliases) {
  const lookup = {};
  for (const key of Object.keys(row)) {
    lookup[normalizeKey(key)] = row[key];
  }
  for (const alias of aliases) {
    const value = lookup[normalizeKey(alias)];
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return value;
    }
  }
  return "";
}

function parseDateFromExcel(rawValue) {
  if (!rawValue && rawValue !== 0) return null;
  if (typeof rawValue === "number") {
    const jsDate = new Date(Math.round((rawValue - 25569) * 86400 * 1000));
    if (Number.isNaN(jsDate.getTime())) return null;
    return jsDate.toISOString().slice(0, 10);
  }
  if (rawValue instanceof Date && !Number.isNaN(rawValue.getTime())) {
    return rawValue.toISOString().slice(0, 10);
  }
  if (typeof rawValue === "string") {
    const trimmed = rawValue.trim();
    if (!trimmed) return null;
    const dayFirst = /^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/;
    const match = trimmed.match(dayFirst);
    if (match) {
      let day = Number(match[1]);
      let month = Number(match[2]);
      const yearRaw = Number(match[3]);
      const year = yearRaw < 100 ? 2000 + yearRaw : yearRaw;
      if (day <= 12 && month > 12) {
        const temp = day;
        day = month;
        month = temp;
      }
      const parsedDayFirst = new Date(Date.UTC(year, month - 1, day));
      if (!Number.isNaN(parsedDayFirst.getTime())) {
        return parsedDayFirst.toISOString().slice(0, 10);
      }
    }
    const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
    const parsed = new Date(trimmed);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed.toISOString().slice(0, 10);
  }
  return null;
}

function extractRowsFromWorksheet(worksheet) {
  const matrix = xlsx.utils.sheet_to_json(worksheet, {
    header: 1,
    defval: "",
    raw: true,
  });
  if (!matrix.length) return { rows: [], headerRowIndex: 0 };

  const headerMarkers = ["insuredname", "contacts", "policyrenewal", "carregistration", "financialinterest"];
  let headerRowIndex = 0;
  let bestScore = -1;

  for (let i = 0; i < Math.min(20, matrix.length); i += 1) {
    const keys = (matrix[i] || []).map((cell) => normalizeKey(cell));
    const score = headerMarkers.reduce(
      (sum, marker) => sum + (keys.some((k) => k.includes(marker.replace(/example$/, ""))) ? 1 : 0),
      0
    );
    if (score > bestScore) {
      bestScore = score;
      headerRowIndex = i;
    }
  }

  if (bestScore < 1) {
    return { rows: [], headerRowIndex };
  }

  const headers = (matrix[headerRowIndex] || []).map((h) => String(h || "").trim());
  const rows = matrix
    .slice(headerRowIndex + 1)
    .filter((row) => (row || []).some((cell) => String(cell || "").trim() !== ""))
    .map((row) => {
      const item = {};
      for (let i = 0; i < headers.length; i += 1) {
        if (!headers[i]) continue;
        item[headers[i]] = row[i] ?? "";
      }
      return item;
    });

  return { rows, headerRowIndex };
}

function parseRenewalRow(row) {
  const insuredName = String(pickValue(row, HEADER_ALIASES.insuredName) || "").trim();
  const contacts = String(pickValue(row, HEADER_ALIASES.contacts) || "").trim();
  const renewalDate = parseDateFromExcel(pickValue(row, HEADER_ALIASES.renewalDate));
  const registrations = String(pickValue(row, HEADER_ALIASES.registrations) || "").trim();
  const financialInterest = String(pickValue(row, HEADER_ALIASES.financialInterest) || "").trim();
  const email = String(pickValue(row, HEADER_ALIASES.email) || "").trim();
  const policyNumber = String(pickValue(row, HEADER_ALIASES.policyNumber) || "").trim();
  const insurer = String(pickValue(row, HEADER_ALIASES.insurer) || "").trim();

  return {
    insuredName,
    contacts,
    renewalDate,
    registrations,
    financialInterest,
    email,
    policyNumber,
    insurer,
  };
}

function importRenewalsFromExcelBuffer(buffer) {
  const workbook = xlsx.read(buffer, { type: "buffer", cellDates: true });
  const firstSheet = workbook.SheetNames[0];
  if (!firstSheet) {
    return { rows: [], headerRowIndex: 0, totalRows: 0 };
  }
  const { rows, headerRowIndex } = extractRowsFromWorksheet(workbook.Sheets[firstSheet]);
  return {
    rows: rows.map(parseRenewalRow),
    headerRowIndex,
    totalRows: rows.length,
  };
}

module.exports = {
  importRenewalsFromExcelBuffer,
  parseDateFromExcel,
  parseRenewalRow,
};
