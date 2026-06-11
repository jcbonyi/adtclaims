const xlsx = require("xlsx");

const VALUATION_STATUSES = [
  "Pending Appointment",
  "Valuation Requested",
  "Pending Logbook",
  "Pending Valuation Letter",
  "Appointment Scheduled",
  "Awaiting Inspection",
  "Valuation Report Received",
  "Insured Uncooperative",
  "Follow-up Required",
  "Overdue",
  "Closed",
];

const HEADER_ALIASES = {
  insuredName: ["Insured Name", "insuredName", "Insured", "Client Name"],
  insuranceCompany: ["Insurance Company", "insuranceCompany", "Insurer"],
  policyNumber: ["Policy Number", "policyNumber", "Policy No"],
  policyRenewalDate: ["Policy Renewal Date", "policyRenewalDate", "Renewal Date"],
  vehicleRegistration: ["Vehicle Registration", "vehicleRegistration", "Registration", "Reg Number"],
  vehicleMakeModel: ["Make & Model", "vehicleMakeModel", "Make and Model", "Vehicle Make Model"],
  financialInterest: ["Financial Interest", "financialInterest"],
  sumInsuredBefore: ["Sum Insured Before", "sumInsuredBefore", "Sum Insured"],
  assignedValuer: ["Assigned Valuer", "assignedValuer", "Valuer"],
  valuationRequestDate: ["Valuation Request Date", "valuationRequestDate", "Request Date"],
  inspectionDate: ["Inspection Date", "inspectionDate"],
  valuationValue: ["Valuation Value", "valuationValue", "Valuation Amount"],
  status: ["Status", "status"],
  relationshipManager: ["Relationship Manager", "relationshipManager", "RM"],
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
  if (!rawValue) return null;
  if (typeof rawValue === "number") {
    const jsDate = new Date(Math.round((rawValue - 25569) * 86400 * 1000));
    if (Number.isNaN(jsDate.getTime())) return null;
    return jsDate.toISOString().slice(0, 10);
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

function parseMoney(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const normalized = String(value).replace(/,/g, "").trim();
  if (!normalized) return null;
  const asNumber = Number(normalized);
  return Number.isFinite(asNumber) ? asNumber : null;
}

function extractValuationRowsFromWorksheet(worksheet) {
  const matrix = xlsx.utils.sheet_to_json(worksheet, {
    header: 1,
    defval: "",
    raw: true,
  });
  if (!matrix.length) return { rows: [], headerRowIndex: 0 };

  const headerMarkers = ["insuredname", "vehicleregistration", "insurancecompany", "valuationrequestdate"];
  let headerRowIndex = 0;
  let bestScore = -1;

  for (let i = 0; i < Math.min(20, matrix.length); i++) {
    const keys = (matrix[i] || []).map((cell) => normalizeKey(cell));
    const score = headerMarkers.reduce((s, marker) => s + (keys.some((k) => k.includes(marker)) ? 1 : 0), 0);
    if (score > bestScore) {
      bestScore = score;
      headerRowIndex = i;
    }
  }

  if (bestScore < 1) {
    return { rows: [], headerRowIndex };
  }

  const headers = (matrix[headerRowIndex] || []).map((h) => String(h || "").trim());
  const rows = [];
  for (let r = headerRowIndex + 1; r < matrix.length; r++) {
    const line = matrix[r] || [];
    if (line.every((cell) => String(cell ?? "").trim() === "")) continue;
    const obj = {};
    headers.forEach((header, idx) => {
      if (header) obj[header] = line[idx];
    });
    rows.push(obj);
  }

  return { rows, headerRowIndex };
}

function parseValuationImportRow(row, valuerByName) {
  const insuredName = String(pickValue(row, HEADER_ALIASES.insuredName)).trim();
  if (!insuredName) return { error: "missing insured name" };

  const valuerName = String(pickValue(row, HEADER_ALIASES.assignedValuer)).trim();
  const assignedValuerId = valuerName ? valuerByName.get(valuerName.toLowerCase()) || null : null;

  const sumInsuredBefore = parseMoney(pickValue(row, HEADER_ALIASES.sumInsuredBefore));
  const valuationValue = parseMoney(pickValue(row, HEADER_ALIASES.valuationValue));

  const statusRaw = String(pickValue(row, HEADER_ALIASES.status) || "Pending Appointment").trim();
  let status = VALUATION_STATUSES.includes(statusRaw) ? statusRaw : "Pending Appointment";
  if (valuationValue != null) {
    status = "Valuation Report Received";
  }
  let valueDifference = null;
  let percentageVariance = null;
  if (sumInsuredBefore != null && valuationValue != null) {
    valueDifference = Number((valuationValue - sumInsuredBefore).toFixed(2));
    percentageVariance =
      sumInsuredBefore === 0
        ? null
        : Number(((valueDifference / sumInsuredBefore) * 100).toFixed(2));
  }

  return {
    data: {
      insured_name: insuredName,
      insurance_company: String(pickValue(row, HEADER_ALIASES.insuranceCompany)).trim(),
      policy_number: String(pickValue(row, HEADER_ALIASES.policyNumber)).trim(),
      policy_renewal_date: parseDateFromExcel(pickValue(row, HEADER_ALIASES.policyRenewalDate)),
      vehicle_registration: String(pickValue(row, HEADER_ALIASES.vehicleRegistration)).trim(),
      vehicle_make_model: String(pickValue(row, HEADER_ALIASES.vehicleMakeModel)).trim(),
      financial_interest: String(pickValue(row, HEADER_ALIASES.financialInterest)).trim(),
      sum_insured_before: sumInsuredBefore,
      assigned_valuer_id: assignedValuerId,
      valuation_request_date: parseDateFromExcel(pickValue(row, HEADER_ALIASES.valuationRequestDate)),
      inspection_date: parseDateFromExcel(pickValue(row, HEADER_ALIASES.inspectionDate)),
      valuation_value: valuationValue,
      value_difference: valueDifference,
      percentage_variance: percentageVariance,
      status,
      relationship_manager: String(pickValue(row, HEADER_ALIASES.relationshipManager)).trim(),
      requires_valuation: true,
      is_overdue: false,
    },
    valuerWarning: valuerName && !assignedValuerId ? `unknown valuer "${valuerName}"` : null,
  };
}

async function importValuationsFromExcelBuffer(buffer, deps) {
  const { pool, nextSerialId, dbMode, userId, logStatusTransition } = deps;
  const workbook = xlsx.read(buffer, { type: "buffer" });
  const sheetName = workbook.SheetNames[0];
  const { rows, headerRowIndex } = extractValuationRowsFromWorksheet(workbook.Sheets[sheetName]);

  const valuersRes = await pool.query("SELECT id, name FROM valuers");
  const valuerByName = new Map(
    valuersRes.rows.map((v) => [String(v.name).trim().toLowerCase(), v.id])
  );

  const warnings = [];
  let inserted = 0;

  for (const [index, row] of rows.entries()) {
    const parsed = parseValuationImportRow(row, valuerByName);
    if (parsed.error) {
      warnings.push({ row: index + headerRowIndex + 2, reason: parsed.error });
      continue;
    }
    if (parsed.valuerWarning) {
      warnings.push({ row: index + headerRowIndex + 2, reason: parsed.valuerWarning });
    }

    const cols = parsed.data;
    const id = await nextSerialId(pool, "valuations");

    await pool.query(
      `INSERT INTO valuations (
        id, insured_name, insurance_company, policy_renewal_date, vehicle_registration,
        vehicle_make_model, financial_interest, sum_insured_before, assigned_valuer_id,
        valuation_request_date, inspection_date, valuation_value, value_difference,
        percentage_variance, status, relationship_manager, policy_number,
        requires_valuation, is_overdue, created_by
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20
      )`,
      [
        id,
        cols.insured_name,
        cols.insurance_company,
        cols.policy_renewal_date,
        cols.vehicle_registration,
        cols.vehicle_make_model,
        cols.financial_interest,
        cols.sum_insured_before,
        cols.assigned_valuer_id,
        cols.valuation_request_date,
        cols.inspection_date,
        cols.valuation_value,
        cols.value_difference,
        cols.percentage_variance,
        cols.status,
        cols.relationship_manager,
        cols.policy_number,
        cols.requires_valuation,
        cols.is_overdue,
        userId,
      ]
    );

    if (logStatusTransition) {
      await logStatusTransition(pool, id, null, cols.status, userId, nextSerialId, dbMode);
    }

    inserted += 1;
  }

  return { inserted, warnings, totalRows: rows.length, headerRowIndex: headerRowIndex + 1 };
}

module.exports = {
  VALUATION_STATUSES,
  HEADER_ALIASES,
  extractValuationRowsFromWorksheet,
  importValuationsFromExcelBuffer,
};
