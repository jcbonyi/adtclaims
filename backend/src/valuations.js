const { z } = require("zod");
const { canEditValuations, canManageValuers, requirePermission } = require("./permissions");
const { buildValuationsWorkbookBuffer, buildValuationsCsv } = require("./valuationExport");

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

const COMPLETED_STATUSES = new Set(["Valuation Report Received", "Closed"]);
const SCHEDULED_STATUSES = new Set(["Appointment Scheduled", "Awaiting Inspection"]);

const FOLLOW_UP_METHODS = ["Call", "Email", "Visit"];

const valuationBodySchema = z.object({
  insuredName: z.string().min(1),
  insuranceCompany: z.string().optional().default(""),
  policyRenewalDate: z.string().nullable().optional(),
  vehicleRegistration: z.string().optional().default(""),
  vehicleMakeModel: z.string().optional().default(""),
  financialInterest: z.string().optional().default(""),
  sumInsuredBefore: z.number().nullable().optional(),
  assignedValuerId: z.number().nullable().optional(),
  valuationRequestDate: z.string().nullable().optional(),
  inspectionDate: z.string().nullable().optional(),
  valuationValue: z.number().nullable().optional(),
  status: z.enum(VALUATION_STATUSES),
  assignedOfficerId: z.number().nullable().optional(),
  relationshipManager: z.string().optional().default(""),
  quotationId: z.number().nullable().optional(),
  claimId: z.number().nullable().optional(),
  policyNumber: z.string().optional().default(""),
  requiresValuation: z.boolean().optional().default(true),
});

function parseDateOnly(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function daysBetween(fromDate, toDate) {
  if (!fromDate) return 0;
  const start = new Date(fromDate);
  const end = toDate ? new Date(toDate) : new Date();
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
  const startUtc = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
  const endUtc = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());
  return Math.floor((endUtc - startUtc) / (1000 * 60 * 60 * 24));
}

function computeValueMetrics(sumInsuredBefore, valuationValue) {
  if (sumInsuredBefore == null || valuationValue == null) {
    return { valueDifference: null, percentageVariance: null };
  }
  const before = Number(sumInsuredBefore);
  const after = Number(valuationValue);
  if (!Number.isFinite(before) || !Number.isFinite(after)) {
    return { valueDifference: null, percentageVariance: null };
  }
  const valueDifference = Number((after - before).toFixed(2));
  const percentageVariance =
    before === 0 ? null : Number(((valueDifference / before) * 100).toFixed(2));
  return { valueDifference, percentageVariance };
}

function isComplianceOverdue(row, settings) {
  if (COMPLETED_STATUSES.has(row.status)) return false;
  if (!row.valuation_request_date) return false;
  if (row.inspection_date) return false;
  const overdueDays = settings?.inspection_overdue_days ?? 2;
  return daysBetween(row.valuation_request_date) > overdueDays;
}

function isRenewalAtRisk(row, settings) {
  if (COMPLETED_STATUSES.has(row.status)) return false;
  if (!row.policy_renewal_date) return false;
  const alertDays = settings?.renewal_alert_days ?? 30;
  const daysUntilRenewal = daysBetween(new Date().toISOString().slice(0, 10), row.policy_renewal_date);
  return daysUntilRenewal >= 0 && daysUntilRenewal <= alertDays;
}

function rowToClient(row, extras = {}) {
  const { valueDifference, percentageVariance } = computeValueMetrics(
    row.sum_insured_before != null ? Number(row.sum_insured_before) : null,
    row.valuation_value != null ? Number(row.valuation_value) : null
  );
  return {
    id: row.id,
    insuredName: row.insured_name,
    insuranceCompany: row.insurance_company || "",
    policyRenewalDate: row.policy_renewal_date,
    vehicleRegistration: row.vehicle_registration || "",
    vehicleMakeModel: row.vehicle_make_model || "",
    financialInterest: row.financial_interest || "",
    sumInsuredBefore: row.sum_insured_before != null ? Number(row.sum_insured_before) : null,
    assignedValuerId: row.assigned_valuer_id,
    valuerName: extras.valuerName || row.valuer_name || null,
    valuationRequestDate: row.valuation_request_date,
    inspectionDate: row.inspection_date,
    valuationValue: row.valuation_value != null ? Number(row.valuation_value) : null,
    valueDifference: row.value_difference != null ? Number(row.value_difference) : valueDifference,
    percentageVariance:
      row.percentage_variance != null ? Number(row.percentage_variance) : percentageVariance,
    status: row.status,
    assignedOfficerId: row.assigned_officer_id,
    officerName: extras.officerName || row.officer_name || null,
    relationshipManager: row.relationship_manager || "",
    quotationId: row.quotation_id,
    claimId: row.claim_id,
    policyNumber: row.policy_number || "",
    requiresValuation: !!row.requires_valuation,
    isOverdue: !!row.is_overdue,
    renewalAtRisk: !!extras.renewalAtRisk,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    followUps: extras.followUps || [],
    statusHistory: extras.statusHistory || [],
    auditLogs: extras.auditLogs || [],
  };
}

function bodyToDbColumns(body) {
  const metrics = computeValueMetrics(body.sumInsuredBefore, body.valuationValue);
  return {
    insured_name: body.insuredName.trim(),
    insurance_company: body.insuranceCompany || "",
    policy_renewal_date: body.policyRenewalDate || null,
    vehicle_registration: body.vehicleRegistration || "",
    vehicle_make_model: body.vehicleMakeModel || "",
    financial_interest: body.financialInterest || "",
    sum_insured_before: body.sumInsuredBefore ?? null,
    assigned_valuer_id: body.assignedValuerId ?? null,
    valuation_request_date: body.valuationRequestDate || null,
    inspection_date: body.inspectionDate || null,
    valuation_value: body.valuationValue ?? null,
    value_difference: metrics.valueDifference,
    percentage_variance: metrics.percentageVariance,
    status: body.status,
    assigned_officer_id: body.assignedOfficerId ?? null,
    relationship_manager: body.relationshipManager || "",
    quotation_id: body.quotationId ?? null,
    claim_id: body.claimId ?? null,
    policy_number: body.policyNumber || "",
    requires_valuation: body.requiresValuation !== false,
  };
}

const VALUATION_SNAPSHOT_COLUMNS = [
  "id",
  "insured_name",
  "insurance_company",
  "policy_renewal_date",
  "vehicle_registration",
  "vehicle_make_model",
  "financial_interest",
  "sum_insured_before",
  "assigned_valuer_id",
  "valuation_request_date",
  "inspection_date",
  "valuation_value",
  "value_difference",
  "percentage_variance",
  "status",
  "assigned_officer_id",
  "relationship_manager",
  "quotation_id",
  "claim_id",
  "policy_number",
  "requires_valuation",
  "is_overdue",
  "created_by",
  "created_at",
  "updated_at",
];

const VALUER_SNAPSHOT_COLUMNS = ["id", "name", "email", "company", "is_active", "created_at"];

const FOLLOW_UP_SNAPSHOT_COLUMNS = [
  "id",
  "valuation_id",
  "follow_up_date",
  "officer_id",
  "method",
  "response_received",
  "next_action_date",
  "remarks",
  "created_at",
];

const STATUS_HISTORY_SNAPSHOT_COLUMNS = [
  "id",
  "valuation_id",
  "from_status",
  "to_status",
  "changed_by",
  "changed_at",
];

const AUDIT_SNAPSHOT_COLUMNS = [
  "id",
  "valuation_id",
  "field",
  "old_value",
  "new_value",
  "changed_by",
  "created_at",
];

const SETTINGS_SNAPSHOT_COLUMNS = ["id", "inspection_overdue_days", "renewal_alert_days", "updated_at"];

async function ensureValuationsTables(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS valuers (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL DEFAULT '',
      company TEXT NOT NULL DEFAULT '',
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS valuations (
      id SERIAL PRIMARY KEY,
      insured_name TEXT NOT NULL,
      insurance_company TEXT NOT NULL DEFAULT '',
      policy_renewal_date DATE NULL,
      vehicle_registration TEXT NOT NULL DEFAULT '',
      vehicle_make_model TEXT NOT NULL DEFAULT '',
      financial_interest TEXT NOT NULL DEFAULT '',
      sum_insured_before NUMERIC(14, 2) NULL,
      assigned_valuer_id INTEGER NULL REFERENCES valuers(id) ON DELETE SET NULL,
      valuation_request_date DATE NULL,
      inspection_date DATE NULL,
      valuation_value NUMERIC(14, 2) NULL,
      value_difference NUMERIC(14, 2) NULL,
      percentage_variance NUMERIC(8, 2) NULL,
      status TEXT NOT NULL,
      assigned_officer_id INTEGER NULL REFERENCES users(id) ON DELETE SET NULL,
      relationship_manager TEXT NOT NULL DEFAULT '',
      quotation_id INTEGER NULL,
      claim_id INTEGER NULL,
      policy_number TEXT NOT NULL DEFAULT '',
      requires_valuation BOOLEAN NOT NULL DEFAULT TRUE,
      is_overdue BOOLEAN NOT NULL DEFAULT FALSE,
      created_by INTEGER NULL REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS valuation_follow_ups (
      id SERIAL PRIMARY KEY,
      valuation_id INTEGER NOT NULL REFERENCES valuations(id) ON DELETE CASCADE,
      follow_up_date DATE NOT NULL,
      officer_id INTEGER NULL REFERENCES users(id) ON DELETE SET NULL,
      method TEXT NOT NULL CHECK (method IN ('Call', 'Email', 'Visit')),
      response_received BOOLEAN NOT NULL DEFAULT FALSE,
      next_action_date DATE NULL,
      remarks TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS valuation_status_history (
      id SERIAL PRIMARY KEY,
      valuation_id INTEGER NOT NULL REFERENCES valuations(id) ON DELETE CASCADE,
      from_status TEXT NULL,
      to_status TEXT NOT NULL,
      changed_by INTEGER NULL REFERENCES users(id) ON DELETE SET NULL,
      changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS valuation_audit_logs (
      id SERIAL PRIMARY KEY,
      valuation_id INTEGER NOT NULL REFERENCES valuations(id) ON DELETE CASCADE,
      field TEXT NOT NULL,
      old_value TEXT NULL,
      new_value TEXT NULL,
      changed_by INTEGER NULL REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS valuation_settings (
      id SERIAL PRIMARY KEY,
      inspection_overdue_days INTEGER NOT NULL DEFAULT 2,
      renewal_alert_days INTEGER NOT NULL DEFAULT 30,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  const settingsCount = await pool.query("SELECT COUNT(*)::int AS n FROM valuation_settings");
  if (settingsCount.rows[0].n === 0) {
    await pool.query(
      `INSERT INTO valuation_settings (inspection_overdue_days, renewal_alert_days) VALUES (2, 30)`
    );
  }

  await pool.query(`CREATE INDEX IF NOT EXISTS idx_valuations_status ON valuations (status);`);
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_valuations_insurer ON valuations (insurance_company);`
  );
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_valuations_valuer ON valuations (assigned_valuer_id);`
  );
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_valuations_renewal ON valuations (policy_renewal_date);`
  );
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_valuations_request ON valuations (valuation_request_date);`
  );
}

async function getSettings(pool) {
  const res = await pool.query("SELECT * FROM valuation_settings ORDER BY id ASC LIMIT 1");
  return res.rows[0] || { inspection_overdue_days: 2, renewal_alert_days: 30 };
}

async function recomputeComplianceFlags(pool, settings) {
  const s = settings || (await getSettings(pool));
  const rows = await pool.query(`
    SELECT id, status, valuation_request_date, inspection_date, policy_renewal_date
    FROM valuations
    WHERE requires_valuation = TRUE
  `);
  for (const row of rows.rows) {
    const overdue = isComplianceOverdue(row, s);
    let newStatus = row.status;
    if (overdue && !COMPLETED_STATUSES.has(row.status) && row.status !== "Overdue") {
      newStatus = "Overdue";
    }
    await pool.query(
      `UPDATE valuations SET is_overdue = $2, status = $3, updated_at = NOW() WHERE id = $1`,
      [row.id, overdue, newStatus]
    );
  }
}

async function logValuationAudit(client, { valuationId, field, oldValue, newValue, changedBy, nextSerialId, dbMode }) {
  const oldStr = oldValue == null ? null : String(oldValue);
  const newStr = newValue == null ? null : String(newValue);
  if (oldStr === newStr) return;
  if (dbMode === "in-memory") {
    const id = await nextSerialId(client, "valuation_audit_logs");
    await client.query(
      `INSERT INTO valuation_audit_logs (id, valuation_id, field, old_value, new_value, changed_by)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, valuationId, field, oldStr, newStr, changedBy]
    );
  } else {
    await client.query(
      `INSERT INTO valuation_audit_logs (valuation_id, field, old_value, new_value, changed_by)
       VALUES ($1, $2, $3, $4, $5)`,
      [valuationId, field, oldStr, newStr, changedBy]
    );
  }
}

async function logStatusTransition(client, valuationId, fromStatus, toStatus, userId, nextSerialId, dbMode) {
  if (fromStatus === toStatus) return;
  if (dbMode === "in-memory") {
    const id = await nextSerialId(client, "valuation_status_history");
    await client.query(
      `INSERT INTO valuation_status_history (id, valuation_id, from_status, to_status, changed_by)
       VALUES ($1, $2, $3, $4, $5)`,
      [id, valuationId, fromStatus, toStatus, userId]
    );
  } else {
    await client.query(
      `INSERT INTO valuation_status_history (valuation_id, from_status, to_status, changed_by)
       VALUES ($1, $2, $3, $4)`,
      [valuationId, fromStatus, toStatus, userId]
    );
  }
}

async function seedValuersIfEmpty(pool, nextSerialId) {
  const count = await pool.query("SELECT COUNT(*)::int AS n FROM valuers");
  if (count.rows[0].n > 0) return;
  const seeds = [
    { name: "Kenya Auto Valuers Ltd", email: "dispatch@kenyaautovaluers.co.ke", company: "Kenya Auto Valuers" },
    { name: "Capital Valuation Services", email: "ops@capitalvaluation.co.ke", company: "Capital Valuation" },
    { name: "East Africa Motor Assessors", email: "bookings@eamotor.co.ke", company: "EAM Assessors" },
  ];
  for (const v of seeds) {
    if (typeof nextSerialId === "function") {
      const id = await nextSerialId(pool, "valuers");
      await pool.query(
        `INSERT INTO valuers (id, name, email, company) VALUES ($1, $2, $3, $4)`,
        [id, v.name, v.email, v.company]
      );
    } else {
      await pool.query(`INSERT INTO valuers (name, email, company) VALUES ($1, $2, $3)`, [
        v.name,
        v.email,
        v.company,
      ]);
    }
  }
  console.log(`Seeded ${seeds.length} valuers.`);
}

async function fetchValuationsList(pool, query = {}) {
  const settings = await getSettings(pool);
  await recomputeComplianceFlags(pool, settings);

  const conditions = ["1=1"];
  const params = [];
  const add = (sql, val) => {
    params.push(val);
    conditions.push(sql.replace("$X", `$${params.length}`));
  };

  if (query.insured) add("v.insured_name ILIKE $X", `%${query.insured}%`);
  if (query.registration) add("v.vehicle_registration ILIKE $X", `%${query.registration}%`);
  if (query.insurer) add("v.insurance_company ILIKE $X", `%${query.insurer}%`);
  if (query.status) add("v.status = $X", query.status);
  if (query.valuerId) add("v.assigned_valuer_id = $X", Number(query.valuerId));
  if (query.renewalFrom) add("v.policy_renewal_date >= $X", query.renewalFrom);
  if (query.renewalTo) add("v.policy_renewal_date <= $X", query.renewalTo);
  if (query.inspectionFrom) add("v.inspection_date >= $X", query.inspectionFrom);
  if (query.inspectionTo) add("v.inspection_date <= $X", query.inspectionTo);
  if (query.q) {
    const term = `%${String(query.q).trim()}%`;
    params.push(term, term, term, term);
    const base = params.length - 3;
    conditions.push(
      `(v.insured_name ILIKE $${base} OR v.vehicle_registration ILIKE $${base + 1} OR v.insurance_company ILIKE $${base + 2} OR v.policy_number ILIKE $${base + 3})`
    );
  }

  const sql = `
    SELECT v.*, vr.name AS valuer_name, u.name AS officer_name
    FROM valuations v
    LEFT JOIN valuers vr ON vr.id = v.assigned_valuer_id
    LEFT JOIN users u ON u.id = v.assigned_officer_id
    WHERE ${conditions.join(" AND ")}
    ORDER BY v.updated_at DESC, v.id DESC
  `;
  const result = await pool.query(sql, params);
  return result.rows.map((row) =>
    rowToClient(row, { renewalAtRisk: isRenewalAtRisk(row, settings) })
  );
}

async function fetchValuationDetail(pool, id) {
  const settings = await getSettings(pool);
  const result = await pool.query(
    `
    SELECT v.*, vr.name AS valuer_name, u.name AS officer_name
    FROM valuations v
    LEFT JOIN valuers vr ON vr.id = v.assigned_valuer_id
    LEFT JOIN users u ON u.id = v.assigned_officer_id
    WHERE v.id = $1
  `,
    [id]
  );
  if (!result.rows[0]) return null;

  const [followUps, statusHistory, auditLogs] = await Promise.all([
    pool.query(
      `SELECT f.*, u.name AS officer_name FROM valuation_follow_ups f
       LEFT JOIN users u ON u.id = f.officer_id
       WHERE f.valuation_id = $1 ORDER BY f.follow_up_date DESC, f.id DESC`,
      [id]
    ),
    pool.query(
      `SELECT h.*, u.name AS changed_by_name FROM valuation_status_history h
       LEFT JOIN users u ON u.id = h.changed_by
       WHERE h.valuation_id = $1 ORDER BY h.changed_at DESC`,
      [id]
    ),
    pool.query(
      `SELECT a.*, u.name AS changed_by_name FROM valuation_audit_logs a
       LEFT JOIN users u ON u.id = a.changed_by
       WHERE a.valuation_id = $1 ORDER BY a.created_at DESC`,
      [id]
    ),
  ]);

  return rowToClient(result.rows[0], {
    renewalAtRisk: isRenewalAtRisk(result.rows[0], settings),
    followUps: followUps.rows.map((f) => ({
      id: f.id,
      followUpDate: f.follow_up_date,
      officerId: f.officer_id,
      officerName: f.officer_name,
      method: f.method,
      responseReceived: f.response_received,
      nextActionDate: f.next_action_date,
      remarks: f.remarks,
      createdAt: f.created_at,
    })),
    statusHistory: statusHistory.rows.map((h) => ({
      id: h.id,
      fromStatus: h.from_status,
      toStatus: h.to_status,
      changedBy: h.changed_by_name,
      changedAt: h.changed_at,
    })),
    auditLogs: auditLogs.rows.map((a) => ({
      id: a.id,
      field: a.field,
      oldValue: a.old_value,
      newValue: a.new_value,
      changedBy: a.changed_by_name,
      createdAt: a.created_at,
    })),
  });
}

async function buildDashboardData(pool) {
  const settings = await getSettings(pool);
  await recomputeComplianceFlags(pool, settings);

  const result = await pool.query(`
    SELECT v.*, vr.name AS valuer_name
    FROM valuations v
    LEFT JOIN valuers vr ON vr.id = v.assigned_valuer_id
    WHERE v.requires_valuation = TRUE
  `);
  const rows = result.rows;

  const totalRequiring = rows.length;
  const completed = rows.filter((r) => COMPLETED_STATUSES.has(r.status)).length;
  const overdue = rows.filter((r) => r.is_overdue || r.status === "Overdue").length;
  const scheduled = rows.filter((r) => SCHEDULED_STATUSES.has(r.status)).length;
  const pending = rows.filter(
    (r) => !COMPLETED_STATUSES.has(r.status) && !SCHEDULED_STATUSES.has(r.status) && r.status !== "Overdue"
  ).length;
  const valueIncreased = rows.filter((r) => Number(r.value_difference) > 0).length;
  const valueDecreased = rows.filter((r) => Number(r.value_difference) < 0).length;
  const compliancePct =
    totalRequiring === 0 ? 100 : Number(((completed / totalRequiring) * 100).toFixed(1));

  const insurerMap = new Map();
  const valuerMap = new Map();
  const statusMap = new Map();
  const monthMap = new Map();

  let turnaroundTotal = 0;
  let turnaroundCount = 0;

  for (const row of rows) {
    statusMap.set(row.status, (statusMap.get(row.status) || 0) + 1);
    const insurer = row.insurance_company?.trim() || "—";
    insurerMap.set(insurer, (insurerMap.get(insurer) || 0) + 1);
    const valuer = row.valuer_name?.trim() || "Unassigned";
    valuerMap.set(valuer, (valuerMap.get(valuer) || 0) + 1);

    if (row.valuation_request_date) {
      const month = row.valuation_request_date.slice(0, 7);
      monthMap.set(month, (monthMap.get(month) || 0) + 1);
    }

    if (row.valuation_request_date && row.inspection_date && COMPLETED_STATUSES.has(row.status)) {
      turnaroundTotal += daysBetween(row.valuation_request_date, row.inspection_date);
      turnaroundCount += 1;
    }
  }

  const renewalAlerts = rows
    .filter((r) => isRenewalAtRisk(r, settings))
    .map((r) => rowToClient(r, { renewalAtRisk: true }))
    .slice(0, 20);

  return {
    kpis: {
      total_requiring: totalRequiring,
      pending,
      scheduled,
      completed,
      overdue,
      value_increased: valueIncreased,
      value_decreased: valueDecreased,
      compliance_pct: compliancePct,
      avg_turnaround_days:
        turnaroundCount === 0 ? 0 : Number((turnaroundTotal / turnaroundCount).toFixed(1)),
    },
    statusBreakdown: Array.from(statusMap.entries())
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value),
    insurerBreakdown: Array.from(insurerMap.entries())
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value),
    valuerBreakdown: Array.from(valuerMap.entries())
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value),
    monthlyTrend: Array.from(monthMap.entries())
      .map(([month, value]) => ({ month, value }))
      .sort((a, b) => a.month.localeCompare(b.month))
      .slice(-12),
    renewalAlerts,
  };
}

function filterByKpiType(rows, kpiType) {
  switch (kpiType) {
    case "pending":
      return rows.filter(
        (r) =>
          !COMPLETED_STATUSES.has(r.status) &&
          !SCHEDULED_STATUSES.has(r.status) &&
          r.status !== "Overdue"
      );
    case "scheduled":
      return rows.filter((r) => SCHEDULED_STATUSES.has(r.status));
    case "completed":
      return rows.filter((r) => COMPLETED_STATUSES.has(r.status));
    case "overdue":
      return rows.filter((r) => r.isOverdue || r.status === "Overdue");
    case "value_increased":
      return rows.filter((r) => (r.valueDifference ?? 0) > 0);
    case "value_decreased":
      return rows.filter((r) => (r.valueDifference ?? 0) < 0);
    case "total_requiring":
    default:
      return rows.filter((r) => r.requiresValuation);
  }
}

async function buildReport(pool, type) {
  const all = await fetchValuationsList(pool);
  switch (type) {
    case "pending":
      return all.filter(
        (v) => !COMPLETED_STATUSES.has(v.status) && v.status !== "Overdue"
      );
    case "completed":
      return all.filter((v) => COMPLETED_STATUSES.has(v.status));
    case "overdue":
      return all.filter((v) => v.isOverdue || v.status === "Overdue");
    case "by-insurer": {
      const map = new Map();
      for (const v of all) {
        const key = v.insuranceCompany || "—";
        if (!map.has(key)) map.set(key, { insurer: key, count: 0, completed: 0, overdue: 0 });
        const entry = map.get(key);
        entry.count += 1;
        if (COMPLETED_STATUSES.has(v.status)) entry.completed += 1;
        if (v.isOverdue) entry.overdue += 1;
      }
      return Array.from(map.values()).sort((a, b) => b.count - a.count);
    }
    case "by-valuer": {
      const map = new Map();
      for (const v of all) {
        const key = v.valuerName || "Unassigned";
        if (!map.has(key)) map.set(key, { valuer: key, count: 0, completed: 0, overdue: 0 });
        const entry = map.get(key);
        entry.count += 1;
        if (COMPLETED_STATUSES.has(v.status)) entry.completed += 1;
        if (v.isOverdue) entry.overdue += 1;
      }
      return Array.from(map.values()).sort((a, b) => b.count - a.count);
    }
    case "value-variance":
      return all.filter((v) => v.valueDifference != null);
    case "compliance": {
      const requiring = all.filter((v) => v.requiresValuation);
      const completed = requiring.filter((v) => COMPLETED_STATUSES.has(v.status));
      return {
        total: requiring.length,
        completed: completed.length,
        overdue: requiring.filter((v) => v.isOverdue).length,
        compliancePct:
          requiring.length === 0
            ? 100
            : Number(((completed.length / requiring.length) * 100).toFixed(1)),
        rows: requiring,
      };
    }
    case "trends": {
      const map = new Map();
      for (const v of all) {
        if (!v.valuationRequestDate) continue;
        const month = v.valuationRequestDate.slice(0, 7);
        if (!map.has(month)) map.set(month, { month, requested: 0, completed: 0 });
        const entry = map.get(month);
        entry.requested += 1;
        if (COMPLETED_STATUSES.has(v.status)) entry.completed += 1;
      }
      return Array.from(map.values()).sort((a, b) => a.month.localeCompare(b.month));
    }
    default:
      return all;
  }
}

function registerValuationRoutes(app, deps) {
  const { pool, authRequired, requireRole, nextSerialId, onPersist, dbMode, notifyValuationEvent } = deps;
  const editGuard = [authRequired, requirePermission(canEditValuations)];
  const valuerGuard = [authRequired, requirePermission(canManageValuers)];

  app.get("/api/valuations/settings", authRequired, async (_, res) => {
    try {
      const settings = await getSettings(pool);
      return res.json({
        inspectionOverdueDays: settings.inspection_overdue_days,
        renewalAlertDays: settings.renewal_alert_days,
      });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: "Failed to load settings" });
    }
  });

  app.put("/api/valuations/settings", authRequired, requireRole(["Admin"]), async (req, res) => {
    try {
      const body = z
        .object({
          inspectionOverdueDays: z.number().int().min(1).max(90),
          renewalAlertDays: z.number().int().min(1).max(365),
        })
        .parse(req.body);
      await pool.query(
        `UPDATE valuation_settings SET
          inspection_overdue_days = $1,
          renewal_alert_days = $2,
          updated_at = NOW()
        WHERE id = (SELECT id FROM valuation_settings ORDER BY id ASC LIMIT 1)`,
        [body.inspectionOverdueDays, body.renewalAlertDays]
      );
      await onPersist?.();
      return res.json({ ok: true });
    } catch (err) {
      if (err?.issues) return res.status(400).json({ message: "Invalid settings" });
      console.error(err);
      return res.status(500).json({ message: "Failed to update settings" });
    }
  });

  app.get("/api/valuers", authRequired, async (_, res) => {
    try {
      const result = await pool.query(
        "SELECT * FROM valuers WHERE is_active = TRUE ORDER BY name ASC"
      );
      return res.json(
        result.rows.map((r) => ({
          id: r.id,
          name: r.name,
          email: r.email,
          company: r.company,
          isActive: r.is_active,
        }))
      );
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: "Failed to load valuers" });
    }
  });

  app.post("/api/valuers", ...valuerGuard, async (req, res) => {
    try {
      const body = z
        .object({
          name: z.string().min(1),
          email: z.string().optional().default(""),
          company: z.string().optional().default(""),
        })
        .parse(req.body);
      const id = await nextSerialId(pool, "valuers");
      const result = await pool.query(
        `INSERT INTO valuers (id, name, email, company) VALUES ($1, $2, $3, $4) RETURNING *`,
        [id, body.name, body.email, body.company]
      );
      await onPersist?.();
      const r = result.rows[0];
      return res.status(201).json({
        id: r.id,
        name: r.name,
        email: r.email,
        company: r.company,
        isActive: r.is_active,
      });
    } catch (err) {
      if (err?.issues) return res.status(400).json({ message: "Invalid valuer data" });
      console.error(err);
      return res.status(500).json({ message: "Failed to create valuer" });
    }
  });

  app.put("/api/valuers/:id", ...valuerGuard, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const body = z
        .object({
          name: z.string().min(1),
          email: z.string().optional().default(""),
          company: z.string().optional().default(""),
          isActive: z.boolean().optional(),
        })
        .parse(req.body);
      const result = await pool.query(
        `UPDATE valuers SET name = $2, email = $3, company = $4,
          is_active = COALESCE($5, is_active)
        WHERE id = $1 RETURNING *`,
        [id, body.name, body.email, body.company, body.isActive ?? null]
      );
      if (!result.rows[0]) return res.status(404).json({ message: "Valuer not found" });
      await onPersist?.();
      const r = result.rows[0];
      return res.json({
        id: r.id,
        name: r.name,
        email: r.email,
        company: r.company,
        isActive: r.is_active,
      });
    } catch (err) {
      if (err?.issues) return res.status(400).json({ message: "Invalid valuer data" });
      console.error(err);
      return res.status(500).json({ message: "Failed to update valuer" });
    }
  });

  app.get("/api/valuations/dashboard/overall", authRequired, async (_, res) => {
    try {
      const data = await buildDashboardData(pool);
      return res.json(data);
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: "Failed to load dashboard" });
    }
  });

  app.get("/api/valuations/dashboard/kpi-detail", authRequired, async (req, res) => {
    try {
      const kpiType = String(req.query.kpi || "total_requiring");
      const all = await fetchValuationsList(pool, req.query);
      const filtered = filterByKpiType(all, kpiType);
      return res.json({ kpi: kpiType, rows: filtered.slice(0, 100), total: filtered.length });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: "Failed to load KPI detail" });
    }
  });

  app.get("/api/valuations/reports/:type", authRequired, async (req, res) => {
    try {
      const data = await buildReport(pool, req.params.type);
      return res.json(data);
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: "Failed to generate report" });
    }
  });

  app.get("/api/valuations-export.xlsx", authRequired, async (req, res) => {
    try {
      const rows = await fetchValuationsList(pool, req.query);
      const buffer = await buildValuationsWorkbookBuffer(rows, {
        title: "ADT Motor Valuations Register",
        filterSummary: req.query.q ? `Search: ${req.query.q}` : "",
      });
      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );
      res.setHeader("Content-Disposition", 'attachment; filename="ADT-motor-valuations.xlsx"');
      res.send(buffer);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Export failed" });
    }
  });

  app.get("/api/valuations-export.csv", authRequired, async (req, res) => {
    try {
      const rows = await fetchValuationsList(pool, req.query);
      const csv = buildValuationsCsv(rows);
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", 'attachment; filename="ADT-motor-valuations.csv"');
      res.send(csv);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Export failed" });
    }
  });

  app.get("/api/valuations", authRequired, async (req, res) => {
    try {
      const valuations = await fetchValuationsList(pool, req.query);
      const maxId = valuations.reduce((m, v) => Math.max(m, Number(v.id) || 0), 0);
      return res.json({ valuations, nextId: maxId + 1 });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: "Failed to load valuations" });
    }
  });

  app.get("/api/valuations/:id", authRequired, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const detail = await fetchValuationDetail(pool, id);
      if (!detail) return res.status(404).json({ message: "Valuation not found" });
      return res.json(detail);
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: "Failed to load valuation" });
    }
  });

  app.post("/api/valuations", ...editGuard, async (req, res) => {
    try {
      const body = valuationBodySchema.parse(req.body);
      const cols = bodyToDbColumns(body);
      const settings = await getSettings(pool);
      const overdue = isComplianceOverdue(
        {
          status: body.status,
          valuation_request_date: cols.valuation_request_date,
          inspection_date: cols.inspection_date,
        },
        settings
      );
      const id = await nextSerialId(pool, "valuations");
      const result = await pool.query(
        `INSERT INTO valuations (
          id, insured_name, insurance_company, policy_renewal_date, vehicle_registration,
          vehicle_make_model, financial_interest, sum_insured_before, assigned_valuer_id,
          valuation_request_date, inspection_date, valuation_value, value_difference,
          percentage_variance, status, assigned_officer_id, relationship_manager,
          quotation_id, claim_id, policy_number, requires_valuation, is_overdue, created_by
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23
        ) RETURNING *`,
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
          overdue ? "Overdue" : cols.status,
          cols.assigned_officer_id,
          cols.relationship_manager,
          cols.quotation_id,
          cols.claim_id,
          cols.policy_number,
          cols.requires_valuation,
          overdue,
          req.user.id,
        ]
      );
      await logStatusTransition(
        pool,
        id,
        null,
        result.rows[0].status,
        req.user.id,
        nextSerialId,
        dbMode
      );
      await onPersist?.();
      notifyValuationEvent?.("assignment", await fetchValuationDetail(pool, id));
      const detail = await fetchValuationDetail(pool, id);
      return res.status(201).json(detail);
    } catch (err) {
      if (err?.issues) {
        return res.status(400).json({ message: "Invalid valuation data", issues: err.issues });
      }
      console.error(err);
      return res.status(500).json({ message: "Failed to create valuation" });
    }
  });

  app.put("/api/valuations/:id", ...editGuard, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const existing = await pool.query("SELECT * FROM valuations WHERE id = $1", [id]);
      if (!existing.rows[0]) return res.status(404).json({ message: "Valuation not found" });

      const current = rowToClient(existing.rows[0]);
      const merged = { ...current, ...req.body };
      const body = valuationBodySchema.parse(merged);
      const cols = bodyToDbColumns(body);
      const settings = await getSettings(pool);
      const overdue = isComplianceOverdue(
        {
          status: body.status,
          valuation_request_date: cols.valuation_request_date,
          inspection_date: cols.inspection_date,
        },
        settings
      );

      const auditFields = [
        ["insured_name", "insuredName"],
        ["insurance_company", "insuranceCompany"],
        ["status", "status"],
        ["valuation_value", "valuationValue"],
        ["assigned_valuer_id", "assignedValuerId"],
      ];
      for (const [dbField, clientField] of auditFields) {
        await logValuationAudit(pool, {
          valuationId: id,
          field: clientField,
          oldValue: existing.rows[0][dbField],
          newValue: cols[dbField],
          changedBy: req.user.id,
          nextSerialId,
          dbMode,
        });
      }

      const newStatus = overdue && !COMPLETED_STATUSES.has(body.status) ? "Overdue" : body.status;
      const result = await pool.query(
        `UPDATE valuations SET
          insured_name = $2, insurance_company = $3, policy_renewal_date = $4,
          vehicle_registration = $5, vehicle_make_model = $6, financial_interest = $7,
          sum_insured_before = $8, assigned_valuer_id = $9, valuation_request_date = $10,
          inspection_date = $11, valuation_value = $12, value_difference = $13,
          percentage_variance = $14, status = $15, assigned_officer_id = $16,
          relationship_manager = $17, quotation_id = $18, claim_id = $19,
          policy_number = $20, requires_valuation = $21, is_overdue = $22, updated_at = NOW()
        WHERE id = $1 RETURNING *`,
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
          newStatus,
          cols.assigned_officer_id,
          cols.relationship_manager,
          cols.quotation_id,
          cols.claim_id,
          cols.policy_number,
          cols.requires_valuation,
          overdue,
        ]
      );

      if (existing.rows[0].status !== newStatus) {
        await logStatusTransition(
          pool,
          id,
          existing.rows[0].status,
          newStatus,
          req.user.id,
          nextSerialId,
          dbMode
        );
      }

      await onPersist?.();
      const detail = await fetchValuationDetail(pool, id);
      return res.json(detail);
    } catch (err) {
      if (err?.issues) {
        return res.status(400).json({ message: "Invalid valuation data", issues: err.issues });
      }
      console.error(err);
      return res.status(500).json({ message: "Failed to update valuation" });
    }
  });

  app.post("/api/valuations/:id/status", ...editGuard, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const { status } = z.object({ status: z.enum(VALUATION_STATUSES) }).parse(req.body);
      const existing = await pool.query("SELECT * FROM valuations WHERE id = $1", [id]);
      if (!existing.rows[0]) return res.status(404).json({ message: "Valuation not found" });

      const result = await pool.query(
        `UPDATE valuations SET status = $2, updated_at = NOW() WHERE id = $1 RETURNING *`,
        [id, status]
      );
      await logStatusTransition(
        pool,
        id,
        existing.rows[0].status,
        status,
        req.user.id,
        nextSerialId,
        dbMode
      );
      await onPersist?.();
      return res.json(await fetchValuationDetail(pool, result.rows[0].id));
    } catch (err) {
      if (err?.issues) return res.status(400).json({ message: "Invalid status" });
      console.error(err);
      return res.status(500).json({ message: "Failed to update status" });
    }
  });

  app.post("/api/valuations/:id/follow-up", ...editGuard, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const body = z
        .object({
          followUpDate: z.string().min(1),
          method: z.enum(FOLLOW_UP_METHODS),
          responseReceived: z.boolean().optional().default(false),
          nextActionDate: z.string().nullable().optional(),
          remarks: z.string().min(1),
        })
        .parse(req.body);

      const existing = await pool.query("SELECT id FROM valuations WHERE id = $1", [id]);
      if (!existing.rows[0]) return res.status(404).json({ message: "Valuation not found" });

      const followUpId = await nextSerialId(pool, "valuation_follow_ups");
      await pool.query(
        `INSERT INTO valuation_follow_ups (
          id, valuation_id, follow_up_date, officer_id, method, response_received, next_action_date, remarks
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          followUpId,
          id,
          body.followUpDate,
          req.user.id,
          body.method,
          body.responseReceived,
          body.nextActionDate || null,
          body.remarks,
        ]
      );
      await onPersist?.();
      return res.json(await fetchValuationDetail(pool, id));
    } catch (err) {
      if (err?.issues) return res.status(400).json({ message: "Invalid follow-up data" });
      console.error(err);
      return res.status(500).json({ message: "Failed to log follow-up" });
    }
  });

  app.post("/api/valuations/from-quotation/:quotationId", ...editGuard, async (req, res) => {
    try {
      const quotationId = Number(req.params.quotationId);
      const qRes = await pool.query("SELECT * FROM quotations WHERE id = $1", [quotationId]);
      if (!qRes.rows[0]) return res.status(404).json({ message: "Quotation not found" });
      const q = qRes.rows[0];
      return res.json({
        prefill: {
          insuredName: q.client_name,
          insuranceCompany: q.insurer || "",
          policyNumber: q.policy_number || "",
          sumInsuredBefore: q.sum_insured != null ? Number(q.sum_insured) : null,
          policyRenewalDate: q.renewal_date,
          quotationId,
          status: "Pending Appointment",
          requiresValuation: true,
        },
      });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: "Failed to prefill from quotation" });
    }
  });

  app.post("/api/valuations/from-claim/:claimId", ...editGuard, async (req, res) => {
    try {
      const claimId = Number(req.params.claimId);
      const cRes = await pool.query("SELECT * FROM claims WHERE id = $1", [claimId]);
      if (!cRes.rows[0]) return res.status(404).json({ message: "Claim not found" });
      const c = cRes.rows[0];
      if (c.claim_type !== "MOTOR") {
        return res.status(400).json({ message: "Valuations can only be created from motor claims" });
      }
      return res.json({
        prefill: {
          insuredName: c.insured_name,
          insuranceCompany: c.insurer || "",
          vehicleRegistration: c.registration_number || "",
          sumInsuredBefore: c.vehicle_value != null ? Number(c.vehicle_value) : null,
          claimId,
          status: "Pending Appointment",
          requiresValuation: true,
        },
      });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: "Failed to prefill from claim" });
    }
  });
}

module.exports = {
  VALUATION_STATUSES,
  VALUATION_SNAPSHOT_COLUMNS,
  VALUER_SNAPSHOT_COLUMNS,
  FOLLOW_UP_SNAPSHOT_COLUMNS,
  STATUS_HISTORY_SNAPSHOT_COLUMNS,
  AUDIT_SNAPSHOT_COLUMNS,
  SETTINGS_SNAPSHOT_COLUMNS,
  ensureValuationsTables,
  seedValuersIfEmpty,
  registerValuationRoutes,
  recomputeComplianceFlags,
  fetchValuationsList,
  getSettings,
  rowToClient,
};
