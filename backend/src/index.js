const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const fs = require("fs/promises");
const path = require("path");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { Pool } = require("pg");
const { newDb } = require("pg-mem");
const { z } = require("zod");
const multer = require("multer");
const xlsx = require("xlsx");
require("dotenv").config();

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

const PORT = Number(process.env.PORT || 4000);
const JWT_SECRET = process.env.JWT_SECRET || "change-me-now";
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "8h";
const ADMIN_RESET_KEY = normalizeSecret(process.env.ADMIN_RESET_KEY || "");
const SNAPSHOT_FILE_PATH =
  process.env.INMEMORY_SNAPSHOT_PATH ||
  path.join(__dirname, "..", ".persist", "in-memory-db-snapshot.json");

function createDbPool(options = {}) {
  const { forceInMemory = false } = options;
  if (!forceInMemory && process.env.DATABASE_URL) {
    const conn = process.env.DATABASE_URL;
    const isSupabase =
      typeof conn === "string" && (conn.includes("supabase.co") || conn.includes("pooler.supabase.com"));
    return {
      pool: new Pool({
        connectionString: conn,
        max: 10,
        ...(isSupabase
          ? {
              ssl: { rejectUnauthorized: false },
            }
          : {}),
      }),
      dbMode: "postgres",
    };
  }

  const mem = newDb({ autoCreateForeignKeyIndices: true });
  const adapter = mem.adapters.createPg();
  return {
    pool: new adapter.Pool(),
    dbMode: "in-memory",
  };
}

let { pool, dbMode } = createDbPool();
let snapshotWriteInProgress = false;
let snapshotWriteQueued = false;

const CLAIM_STATUSES = [
  "Reported",
  "Awaiting Assessment",
  "Pending Documents",
  "Under Repair",
  "RA Issued",
  "Released",
  "Closed",
  "Repudiated",
  "Declined",
  "Paid",
  "DV Disputed",
  "Pending CIL Payments",
  "Undocumented",
  "Not Reported",
  "Other",
];

const CLOSED_STATUS_LIST = ["Closed", "Repudiated", "Declined", "Paid"];
const CLOSED_STATUSES = new Set(CLOSED_STATUS_LIST);
const ROLES = ["Admin", "Claims Officer", "Read-Only"];

const claimInputSchema = z.object({
  insurer: z.string().min(1),
  claimType: z.enum(["MOTOR", "NON-MOTOR"]),
  coverType: z.string().min(1),
  insuredName: z.string().min(1),
  registrationNumber: z.string().min(1),
  accidentDate: z.string().nullable().optional(),
  reportedToBrokerDate: z.string().min(1),
  reportedToInsurerDate: z.string().nullable().optional(),
  assessedDate: z.string().nullable().optional(),
  claimStatus: z.enum(CLAIM_STATUSES),
  claimStatusOther: z.string().nullable().optional(),
  dateRaIssued: z.string().nullable().optional(),
  dateVehicleReleased: z.string().nullable().optional(),
  vehicleValue: z.number().nullable().optional(),
  repairEstimate: z.number().nullable().optional(),
  garage: z.string().nullable().optional(),
});

app.use(cors());
app.use(helmet());
app.use(morgan("dev"));
app.use(express.json({ limit: "2mb" }));

function toSnakeCaseClaim(payload) {
  return {
    insurer: payload.insurer,
    claim_type: payload.claimType,
    cover_type: payload.coverType,
    insured_name: payload.insuredName,
    registration_number: payload.registrationNumber,
    accident_date: payload.accidentDate || null,
    reported_to_broker_date: payload.reportedToBrokerDate,
    reported_to_insurer_date: payload.reportedToInsurerDate || null,
    assessed_date: payload.assessedDate || null,
    claim_status: payload.claimStatus,
    claim_status_other: payload.claimStatusOther || null,
    date_ra_issued: payload.dateRaIssued || null,
    date_vehicle_released: payload.dateVehicleReleased || null,
    vehicle_value: payload.vehicleValue ?? null,
    repair_estimate: payload.repairEstimate ?? null,
    garage: payload.garage || null,
  };
}

function calcAgingBucket(daysOpen) {
  if (daysOpen <= 7) return "0-7";
  if (daysOpen <= 14) return "8-14";
  if (daysOpen <= 30) return "15-30";
  return "30+";
}

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

/** CSV export: DD/MM/YYYY (avoid JS Date toString / raw ISO in cells). */
function formatDateForCsv(value) {
  if (value === null || value === undefined || value === "") return "";
  if (typeof value === "string") {
    const m = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yy = date.getFullYear();
  return `${dd}/${mm}/${yy}`;
}

function normalizeSecret(value) {
  return String(value || "")
    .trim()
    .replace(/^"(.*)"$/, "$1")
    .replace(/^'(.*)'$/, "$1");
}

function createToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role, name: user.name },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

async function ensureDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('Admin', 'Claims Officer', 'Read-Only')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS claims (
      id SERIAL PRIMARY KEY,
      insurer TEXT NOT NULL,
      claim_type TEXT NOT NULL CHECK (claim_type IN ('MOTOR', 'NON-MOTOR')),
      cover_type TEXT NOT NULL,
      insured_name TEXT NOT NULL,
      registration_number TEXT NOT NULL,
      accident_date DATE NULL,
      reported_to_broker_date DATE NOT NULL,
      reported_to_insurer_date DATE NULL,
      assessed_date DATE NULL,
      claim_status TEXT NOT NULL,
      claim_status_other TEXT NULL,
      date_ra_issued DATE NULL,
      date_vehicle_released DATE NULL,
      vehicle_value NUMERIC(14, 2) NULL,
      repair_estimate NUMERIC(14, 2) NULL,
      garage TEXT NULL,
      closure_date DATE NULL,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS claim_remarks (
      id SERIAL PRIMARY KEY,
      claim_id INTEGER NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
      remark TEXT NOT NULL,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS claim_status_history (
      id SERIAL PRIMARY KEY,
      claim_id INTEGER NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
      from_status TEXT NULL,
      to_status TEXT NOT NULL,
      changed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_claims_search
      ON claims (insurer, claim_type, cover_type, claim_status, reported_to_broker_date);
  `);

  await pool.query(`
    ALTER TABLE users
      ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
  `);

  await pool.query(`
    ALTER TABLE users
      ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT FALSE;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_audit_logs (
      id SERIAL PRIMARY KEY,
      target_user_id INTEGER NULL REFERENCES users(id) ON DELETE SET NULL,
      target_email TEXT NOT NULL,
      action TEXT NOT NULL,
      details TEXT NULL,
      changed_by INTEGER NULL REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

async function authRequired(req, res, next) {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) {
    return res.status(401).json({ message: "Missing token" });
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const dbUser = await pool.query(
      "SELECT id, name, email, role, is_active, must_change_password FROM users WHERE id = $1",
      [decoded.id]
    );
    if (!dbUser.rows[0]) {
      return res.status(401).json({ message: "User no longer exists" });
    }
    if (!dbUser.rows[0].is_active) {
      return res.status(403).json({ message: "Account is deactivated. Contact an admin." });
    }
    req.user = {
      id: dbUser.rows[0].id,
      name: dbUser.rows[0].name,
      email: dbUser.rows[0].email,
      role: dbUser.rows[0].role,
      isActive: dbUser.rows[0].is_active,
      mustChangePassword: dbUser.rows[0].must_change_password,
    };
    return next();
  } catch (error) {
    return res.status(401).json({ message: "Invalid token" });
  }
}

function requireRole(roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: "Insufficient permissions" });
    }
    return next();
  };
}

function mapClaim(row) {
  const daysOpen =
    row.days_open === undefined || row.days_open === null
      ? computeDaysOpen(row.reported_to_broker_date, row.closure_date)
      : Number(row.days_open);
  return {
    id: row.id,
    insurer: row.insurer,
    claimType: row.claim_type,
    coverType: row.cover_type,
    insuredName: row.insured_name,
    registrationNumber: row.registration_number,
    accidentDate: row.accident_date,
    reportedToBrokerDate: row.reported_to_broker_date,
    reportedToInsurerDate: row.reported_to_insurer_date,
    assessedDate: row.assessed_date,
    claimStatus: row.claim_status,
    claimStatusOther: row.claim_status_other,
    dateRaIssued: row.date_ra_issued,
    dateVehicleReleased: row.date_vehicle_released,
    vehicleValue: row.vehicle_value ? Number(row.vehicle_value) : null,
    repairEstimate: row.repair_estimate ? Number(row.repair_estimate) : null,
    garage: row.garage,
    closureDate: row.closure_date,
    daysOpen,
    agingBucket: calcAgingBucket(daysOpen),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function logUserAudit({ targetUserId = null, targetEmail, action, details = null, changedBy = null }) {
  if (dbMode === "in-memory") {
    const id = await nextSerialId(pool, "user_audit_logs");
    await pool.query(
      `INSERT INTO user_audit_logs (id, target_user_id, target_email, action, details, changed_by)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, targetUserId, String(targetEmail || ""), action, details ? JSON.stringify(details) : null, changedBy]
    );
    return;
  }
  await pool.query(
    `INSERT INTO user_audit_logs (target_user_id, target_email, action, details, changed_by)
     VALUES ($1, $2, $3, $4, $5)`,
    [targetUserId, String(targetEmail || ""), action, details ? JSON.stringify(details) : null, changedBy]
  );
}

async function writeStatusTransition(client, claimId, oldStatus, newStatus, userId) {
  if (oldStatus !== newStatus) {
    if (dbMode === "in-memory") {
      const id = await nextSerialId(client, "claim_status_history");
      await client.query(
        `INSERT INTO claim_status_history (id, claim_id, from_status, to_status, changed_by)
         VALUES ($1, $2, $3, $4, $5)`,
        [id, claimId, oldStatus, newStatus, userId]
      );
    } else {
      await client.query(
        `INSERT INTO claim_status_history (claim_id, from_status, to_status, changed_by)
         VALUES ($1, $2, $3, $4)`,
        [claimId, oldStatus, newStatus, userId]
      );
    }
  }
}

function buildInClausePlaceholders(values, startAt = 1) {
  return values.map((_, idx) => `$${startAt + idx}`).join(", ");
}

async function fetchLatestRemarksByClaimIds(claimIds) {
  const map = new Map();
  if (!claimIds.length) return map;
  const placeholders = buildInClausePlaceholders(claimIds);
  const result = await pool.query(
    `
      SELECT claim_id, remark, created_at
      FROM claim_remarks
      WHERE claim_id IN (${placeholders})
      ORDER BY claim_id ASC, created_at DESC
    `,
    claimIds
  );
  for (const row of result.rows) {
    if (!map.has(row.claim_id)) {
      map.set(row.claim_id, row.remark);
    }
  }
  return map;
}

async function maybePersistInMemorySnapshot() {
  if (dbMode !== "in-memory") return;

  if (snapshotWriteInProgress) {
    snapshotWriteQueued = true;
    return;
  }

  snapshotWriteInProgress = true;
  try {
    do {
      snapshotWriteQueued = false;
      const [users, claims, claimRemarks, claimStatusHistory, userAuditLogs] = await Promise.all([
        pool.query("SELECT * FROM users ORDER BY id ASC"),
        pool.query("SELECT * FROM claims ORDER BY id ASC"),
        pool.query("SELECT * FROM claim_remarks ORDER BY id ASC"),
        pool.query("SELECT * FROM claim_status_history ORDER BY id ASC"),
        pool.query("SELECT * FROM user_audit_logs ORDER BY id ASC"),
      ]);

      const snapshot = {
        version: 1,
        savedAt: new Date().toISOString(),
        users: users.rows,
        claims: claims.rows,
        claimRemarks: claimRemarks.rows,
        claimStatusHistory: claimStatusHistory.rows,
        userAuditLogs: userAuditLogs.rows,
      };

      await fs.mkdir(path.dirname(SNAPSHOT_FILE_PATH), { recursive: true });
      await fs.writeFile(SNAPSHOT_FILE_PATH, JSON.stringify(snapshot, null, 2), "utf8");
    } while (snapshotWriteQueued);
  } catch (error) {
    console.error("Failed to persist in-memory snapshot:", error.message);
  } finally {
    snapshotWriteInProgress = false;
  }
}

/**
 * pg-mem implements SERIAL with an internal counter that does not advance when rows are inserted
 * with explicit ids (snapshot restore). Real Postgres sequences are separate; setval on "table_id_seq"
 * also does not exist in pg-mem. For in-memory mode, allocate ids with MAX(id)+1.
 */
async function nextSerialId(executor, tableName) {
  const res = await executor.query(`SELECT COALESCE(MAX(id), 0) + 1 AS n FROM ${tableName}`);
  return Number(res.rows[0].n);
}

async function restoreSnapshotRows(tableName, columns, rows) {
  if (!rows?.length) return;
  const columnList = columns.join(", ");
  for (const row of rows) {
    const values = columns.map((column) => row[column]);
    const placeholders = values.map((_, idx) => `$${idx + 1}`).join(", ");
    await pool.query(
      `INSERT INTO ${tableName} (${columnList}) VALUES (${placeholders})`,
      values
    );
  }
}

async function maybeLoadInMemorySnapshot() {
  if (dbMode !== "in-memory") return;
  try {
    const raw = await fs.readFile(SNAPSHOT_FILE_PATH, "utf8");
    const snapshot = JSON.parse(raw);
    if (!snapshot || typeof snapshot !== "object") return;

    await pool.query("BEGIN");
    try {
      await pool.query("DELETE FROM claim_status_history");
      await pool.query("DELETE FROM claim_remarks");
      await pool.query("DELETE FROM user_audit_logs");
      await pool.query("DELETE FROM claims");
      await pool.query("DELETE FROM users");

      const snapshotUsers = (snapshot.users || []).map((row) => ({
        ...row,
        is_active: row.is_active ?? true,
        must_change_password: row.must_change_password ?? false,
      }));

      await restoreSnapshotRows(
        "users",
        [
          "id",
          "name",
          "email",
          "password_hash",
          "role",
          "created_at",
          "is_active",
          "must_change_password",
        ],
        snapshotUsers
      );
      await restoreSnapshotRows(
        "claims",
        [
          "id",
          "insurer",
          "claim_type",
          "cover_type",
          "insured_name",
          "registration_number",
          "accident_date",
          "reported_to_broker_date",
          "reported_to_insurer_date",
          "assessed_date",
          "claim_status",
          "claim_status_other",
          "date_ra_issued",
          "date_vehicle_released",
          "vehicle_value",
          "repair_estimate",
          "garage",
          "closure_date",
          "created_by",
          "created_at",
          "updated_at",
        ],
        snapshot.claims || []
      );
      await restoreSnapshotRows(
        "claim_remarks",
        ["id", "claim_id", "remark", "created_by", "created_at"],
        snapshot.claimRemarks || []
      );
      await restoreSnapshotRows(
        "claim_status_history",
        ["id", "claim_id", "from_status", "to_status", "changed_by", "changed_at"],
        snapshot.claimStatusHistory || []
      );
      await restoreSnapshotRows(
        "user_audit_logs",
        ["id", "target_user_id", "target_email", "action", "details", "changed_by", "created_at"],
        snapshot.userAuditLogs || []
      );

      await pool.query("COMMIT");

      console.log(
        `Loaded in-memory snapshot: ${snapshot.users?.length || 0} users, ${
          snapshot.claims?.length || 0
        } claims.`
      );
    } catch (error) {
      await pool.query("ROLLBACK");
      throw error;
    }
  } catch (error) {
    if (error.code === "ENOENT") return;
    console.error("Failed to load in-memory snapshot:", error.message);
  }
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
    const parsed = new Date(trimmed);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed.toISOString().slice(0, 10);
  }
  return null;
}

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

function parseClaimType(value) {
  const normalized = normalizeKey(value);
  if (!normalized) return null;
  if (normalized.includes("non") && normalized.includes("motor")) return "NON-MOTOR";
  if (normalized === "nm" || normalized === "nonmotor") return "NON-MOTOR";
  if (normalized.includes("motor")) return "MOTOR";
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

function extractRowsFromWorksheet(worksheet) {
  const matrix = xlsx.utils.sheet_to_json(worksheet, {
    header: 1,
    defval: "",
    raw: false,
  });
  if (!matrix.length) return { rows: [], headerRowIndex: 0 };

  const expectedHeaders = [
    "insurer",
    "claimtype",
    "covertype",
    "insuredname",
    "registrationnumbername",
    "datereportedtobrokeradt",
    "datereported",
    "reportedtoadt",
  ];

  let bestIndex = 0;
  let bestScore = -1;
  const scanLimit = Math.min(15, matrix.length);
  for (let i = 0; i < scanLimit; i += 1) {
    const headerRow = matrix[i].map((cell) => normalizeKey(cell));
    const score = expectedHeaders.filter((header) => headerRow.includes(header)).length;
    if (score > bestScore) {
      bestScore = score;
      bestIndex = i;
    }
  }

  const headers = matrix[bestIndex].map((cell) => String(cell || "").trim());
  const rows = matrix
    .slice(bestIndex + 1)
    .filter((row) => row.some((cell) => String(cell || "").trim() !== ""))
    .map((row) => {
      const item = {};
      for (let i = 0; i < headers.length; i += 1) {
        if (!headers[i]) continue;
        item[headers[i]] = row[i] ?? "";
      }
      return item;
    });

  return { rows, headerRowIndex: bestIndex };
}

app.get("/api/health", (_, res) => {
  res.json({ ok: true, dbMode });
});

app.post("/api/auth/register", authRequired, requireRole(["Admin"]), async (req, res) => {
  try {
    const schema = z.object({
      name: z.string().min(2),
      email: z.email(),
      password: z.string().min(8),
      role: z.enum(ROLES),
    });
    const payload = schema.parse(req.body);
    const existing = await pool.query(
      "SELECT id, name, email, role, is_active, must_change_password, created_at FROM users WHERE email = $1",
      [payload.email.toLowerCase()]
    );
    if (existing.rows[0]) {
      return res.status(409).json({
        message: "Email already exists",
        existingUser: {
          id: existing.rows[0].id,
          name: existing.rows[0].name,
          email: existing.rows[0].email,
          role: existing.rows[0].role,
          isActive: existing.rows[0].is_active,
          mustChangePassword: existing.rows[0].must_change_password,
          createdAt: existing.rows[0].created_at,
        },
      });
    }
    const hash = await bcrypt.hash(payload.password, 10);
    let result;
    if (dbMode === "in-memory") {
      const uid = await nextSerialId(pool, "users");
      result = await pool.query(
        `INSERT INTO users (id, name, email, password_hash, role, is_active, must_change_password)
         VALUES ($1, $2, $3, $4, $5, TRUE, TRUE)
         RETURNING id, name, email, role, created_at, is_active, must_change_password`,
        [uid, payload.name, payload.email.toLowerCase(), hash, payload.role]
      );
    } else {
      result = await pool.query(
        `INSERT INTO users (name, email, password_hash, role, is_active, must_change_password)
         VALUES ($1, $2, $3, $4, TRUE, TRUE)
         RETURNING id, name, email, role, created_at, is_active, must_change_password`,
        [payload.name, payload.email.toLowerCase(), hash, payload.role]
      );
    }
    await logUserAudit({
      targetUserId: result.rows[0].id,
      targetEmail: result.rows[0].email,
      action: "USER_CREATED",
      details: { role: payload.role, mustChangePassword: true },
      changedBy: req.user.id,
    });
    await maybePersistInMemorySnapshot();
    res.status(201).json({
      id: result.rows[0].id,
      name: result.rows[0].name,
      email: result.rows[0].email,
      role: result.rows[0].role,
      createdAt: result.rows[0].created_at,
      isActive: result.rows[0].is_active,
      mustChangePassword: result.rows[0].must_change_password,
    });
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
});

app.post("/api/auth/bootstrap-admin", async (req, res) => {
  try {
    const count = await pool.query("SELECT COUNT(*)::int AS total FROM users");
    if (count.rows[0].total > 0) {
      return res.status(409).json({ message: "Bootstrap already completed" });
    }
    const schema = z.object({
      name: z.string().min(2),
      email: z.email(),
      password: z.string().min(8),
    });
    const payload = schema.parse(req.body);
    const hash = await bcrypt.hash(payload.password, 10);
    let created;
    if (dbMode === "in-memory") {
      const uid = await nextSerialId(pool, "users");
      created = await pool.query(
        `INSERT INTO users (id, name, email, password_hash, role, is_active, must_change_password)
         VALUES ($1, $2, $3, $4, 'Admin', TRUE, FALSE)
         RETURNING id, name, email, role, is_active, must_change_password`,
        [uid, payload.name, payload.email.toLowerCase(), hash]
      );
    } else {
      created = await pool.query(
        `INSERT INTO users (name, email, password_hash, role, is_active, must_change_password)
         VALUES ($1, $2, $3, 'Admin', TRUE, FALSE)
         RETURNING id, name, email, role, is_active, must_change_password`,
        [payload.name, payload.email.toLowerCase(), hash]
      );
    }
    const token = createToken(created.rows[0]);
    await logUserAudit({
      targetUserId: created.rows[0].id,
      targetEmail: created.rows[0].email,
      action: "BOOTSTRAP_ADMIN_CREATED",
      details: { role: "Admin" },
      changedBy: created.rows[0].id,
    });
    await maybePersistInMemorySnapshot();
    return res.status(201).json({
      token,
      user: {
        id: created.rows[0].id,
        name: created.rows[0].name,
        email: created.rows[0].email,
        role: created.rows[0].role,
        isActive: created.rows[0].is_active,
        mustChangePassword: created.rows[0].must_change_password,
      },
    });
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const schema = z.object({ email: z.email(), password: z.string().min(1) });
    const { email, password } = schema.parse(req.body);
    const result = await pool.query("SELECT * FROM users WHERE email = $1", [
      email.toLowerCase(),
    ]);
    const user = result.rows[0];
    if (!user) {
      return res.status(401).json({ message: "Invalid email or password" });
    }
    if (!user.is_active) {
      return res.status(403).json({ message: "Account is deactivated. Contact an admin." });
    }
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ message: "Invalid email or password" });
    }
    const slimUser = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      isActive: user.is_active,
      mustChangePassword: user.must_change_password,
    };
    return res.json({ token: createToken(slimUser), user: slimUser });
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
});

app.post("/api/auth/reset-admin-password", async (req, res) => {
  try {
    if (!ADMIN_RESET_KEY) {
      return res.status(501).json({
        message: "ADMIN_RESET_KEY is not configured on the server",
      });
    }

    const schema = z.object({
      email: z.email(),
      newPassword: z.string().min(8),
      resetKey: z.string().min(1),
    });
    const { email, newPassword, resetKey } = schema.parse(req.body);
    const normalizedResetKey = normalizeSecret(resetKey);

    if (normalizedResetKey !== ADMIN_RESET_KEY) {
      return res.status(403).json({ message: "Invalid reset key" });
    }

    const userRes = await pool.query(
      "SELECT id FROM users WHERE email = $1 AND role = 'Admin'",
      [email.toLowerCase()]
    );
    if (!userRes.rows[0]) {
      return res.status(404).json({ message: "Admin user not found for that email" });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await pool.query("UPDATE users SET password_hash = $1 WHERE id = $2", [
      passwordHash,
      userRes.rows[0].id,
    ]);
    await pool.query("UPDATE users SET must_change_password = TRUE WHERE id = $1", [userRes.rows[0].id]);
    await logUserAudit({
      targetUserId: userRes.rows[0].id,
      targetEmail: email.toLowerCase(),
      action: "ADMIN_PASSWORD_RESET_BY_KEY",
      details: { via: "reset-key" },
      changedBy: null,
    });
    await maybePersistInMemorySnapshot();

    return res.json({ ok: true, message: "Admin password reset successfully" });
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
});

app.get("/api/auth/bootstrap-status", async (_, res) => {
  const count = await pool.query("SELECT COUNT(*)::int AS total FROM users");
  return res.json({ bootstrapRequired: count.rows[0].total === 0 });
});

app.get("/api/auth/me", authRequired, async (req, res) => {
  const result = await pool.query(
    "SELECT id, name, email, role, is_active, must_change_password FROM users WHERE id = $1",
    [req.user.id]
  );
  if (!result.rows[0]) return res.status(404).json({ message: "User not found" });
  return res.json({
    id: result.rows[0].id,
    name: result.rows[0].name,
    email: result.rows[0].email,
    role: result.rows[0].role,
    isActive: result.rows[0].is_active,
    mustChangePassword: result.rows[0].must_change_password,
  });
});

app.post("/api/auth/change-password", authRequired, async (req, res) => {
  try {
    const schema = z.object({
      currentPassword: z.string().min(1),
      newPassword: z.string().min(8),
    });
    const { currentPassword, newPassword } = schema.parse(req.body);
    const userRes = await pool.query("SELECT * FROM users WHERE id = $1", [req.user.id]);
    const user = userRes.rows[0];
    if (!user) return res.status(404).json({ message: "User not found" });
    if (!user.is_active) {
      return res.status(403).json({ message: "Account is deactivated. Contact an admin." });
    }

    const valid = await bcrypt.compare(currentPassword, user.password_hash);
    if (!valid) return res.status(401).json({ message: "Current password is incorrect" });

    const hash = await bcrypt.hash(newPassword, 10);
    await pool.query(
      "UPDATE users SET password_hash = $1, must_change_password = FALSE WHERE id = $2",
      [hash, req.user.id]
    );
    await logUserAudit({
      targetUserId: req.user.id,
      targetEmail: user.email,
      action: "PASSWORD_CHANGED_SELF",
      details: null,
      changedBy: req.user.id,
    });
    await maybePersistInMemorySnapshot();
    return res.json({ ok: true });
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
});

app.get("/api/users", authRequired, requireRole(["Admin"]), async (_, res) => {
  const result = await pool.query(
    `SELECT id, name, email, role, created_at, is_active, must_change_password
     FROM users
     ORDER BY created_at DESC`
  );
  return res.json(
    result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      email: row.email,
      role: row.role,
      createdAt: row.created_at,
      isActive: row.is_active,
      mustChangePassword: row.must_change_password,
    }))
  );
});

app.patch("/api/users/:id", authRequired, requireRole(["Admin"]), async (req, res) => {
  try {
    const schema = z.object({
      name: z.string().min(2),
      email: z.email(),
      role: z.enum(ROLES),
    });
    const payload = schema.parse(req.body);
    const userId = Number(req.params.id);
    if (!Number.isFinite(userId)) {
      return res.status(400).json({ message: "Invalid user id" });
    }
    if (userId === req.user.id && payload.role !== "Admin") {
      return res.status(400).json({ message: "You cannot remove your own Admin role" });
    }

    const existing = await pool.query(
      "SELECT id, name, email, role, is_active, must_change_password FROM users WHERE id = $1",
      [userId]
    );
    if (!existing.rows[0]) {
      return res.status(404).json({ message: "User not found" });
    }

    if (existing.rows[0].role === "Admin" && payload.role !== "Admin" && existing.rows[0].is_active) {
      const activeAdmins = await pool.query(
        "SELECT COUNT(*)::int AS total FROM users WHERE role = 'Admin' AND is_active = TRUE"
      );
      if (activeAdmins.rows[0].total <= 1) {
        return res.status(400).json({ message: "At least one active Admin account is required" });
      }
    }

    const updated = await pool.query(
      `UPDATE users
       SET name = $1,
           email = $2,
           role = $3
       WHERE id = $4
       RETURNING id, name, email, role, created_at, is_active, must_change_password`,
      [payload.name, payload.email.toLowerCase(), payload.role, userId]
    );

    await logUserAudit({
      targetUserId: updated.rows[0].id,
      targetEmail: updated.rows[0].email,
      action: "USER_UPDATED",
      details: {
        from: {
          name: existing.rows[0].name,
          email: existing.rows[0].email,
          role: existing.rows[0].role,
        },
        to: {
          name: updated.rows[0].name,
          email: updated.rows[0].email,
          role: updated.rows[0].role,
        },
      },
      changedBy: req.user.id,
    });
    await maybePersistInMemorySnapshot();

    return res.json({
      id: updated.rows[0].id,
      name: updated.rows[0].name,
      email: updated.rows[0].email,
      role: updated.rows[0].role,
      createdAt: updated.rows[0].created_at,
      isActive: updated.rows[0].is_active,
      mustChangePassword: updated.rows[0].must_change_password,
    });
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({ message: "Email already exists" });
    }
    return res.status(400).json({ message: error.message });
  }
});

app.patch("/api/users/:id/role", authRequired, requireRole(["Admin"]), async (req, res) => {
  try {
    const schema = z.object({ role: z.enum(ROLES) });
    const payload = schema.parse(req.body);
    const userId = Number(req.params.id);
    if (!Number.isFinite(userId)) {
      return res.status(400).json({ message: "Invalid user id" });
    }
    if (userId === req.user.id && payload.role !== "Admin") {
      return res.status(400).json({ message: "You cannot remove your own Admin role" });
    }

    const currentUser = await pool.query("SELECT id, email, role, is_active FROM users WHERE id = $1", [userId]);
    if (!currentUser.rows[0]) {
      return res.status(404).json({ message: "User not found" });
    }

    if (
      currentUser.rows[0].role === "Admin" &&
      payload.role !== "Admin" &&
      currentUser.rows[0].is_active
    ) {
      const activeAdmins = await pool.query(
        "SELECT COUNT(*)::int AS total FROM users WHERE role = 'Admin' AND is_active = TRUE"
      );
      if (activeAdmins.rows[0].total <= 1) {
        return res.status(400).json({ message: "At least one active Admin account is required" });
      }
    }

    const updated = await pool.query(
      `UPDATE users
       SET role = $1
       WHERE id = $2
       RETURNING id, name, email, role, created_at, is_active, must_change_password`,
      [payload.role, userId]
    );

    await logUserAudit({
      targetUserId: updated.rows[0].id,
      targetEmail: updated.rows[0].email,
      action: "USER_ROLE_UPDATED",
      details: { fromRole: currentUser.rows[0].role, toRole: payload.role },
      changedBy: req.user.id,
    });

    await maybePersistInMemorySnapshot();
    return res.json({
      id: updated.rows[0].id,
      name: updated.rows[0].name,
      email: updated.rows[0].email,
      role: updated.rows[0].role,
      createdAt: updated.rows[0].created_at,
      isActive: updated.rows[0].is_active,
      mustChangePassword: updated.rows[0].must_change_password,
    });
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
});

app.post(
  "/api/users/:id/reset-password",
  authRequired,
  requireRole(["Admin"]),
  async (req, res) => {
    try {
      const schema = z.object({ newPassword: z.string().min(8) });
      const { newPassword } = schema.parse(req.body);
      const userId = Number(req.params.id);
      if (!Number.isFinite(userId)) {
        return res.status(400).json({ message: "Invalid user id" });
      }

      const hash = await bcrypt.hash(newPassword, 10);
      const existing = await pool.query("SELECT id, email FROM users WHERE id = $1", [userId]);
      if (!existing.rows[0]) {
        return res.status(404).json({ message: "User not found" });
      }
      const updated = await pool.query(
        `UPDATE users
         SET password_hash = $1,
             must_change_password = TRUE
         WHERE id = $2
         RETURNING id`,
        [hash, userId]
      );

      await logUserAudit({
        targetUserId: existing.rows[0].id,
        targetEmail: existing.rows[0].email,
        action: "USER_PASSWORD_RESET_BY_ADMIN",
        details: null,
        changedBy: req.user.id,
      });

      await maybePersistInMemorySnapshot();
      return res.json({ ok: true });
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  }
);

app.patch("/api/users/:id/status", authRequired, requireRole(["Admin"]), async (req, res) => {
  try {
    const schema = z.object({ isActive: z.boolean() });
    const { isActive } = schema.parse(req.body);
    const userId = Number(req.params.id);
    if (!Number.isFinite(userId)) {
      return res.status(400).json({ message: "Invalid user id" });
    }
    if (userId === req.user.id && !isActive) {
      return res.status(400).json({ message: "You cannot deactivate your own account" });
    }

    const existing = await pool.query("SELECT id, email, role, is_active FROM users WHERE id = $1", [userId]);
    if (!existing.rows[0]) return res.status(404).json({ message: "User not found" });

    if (existing.rows[0].role === "Admin" && existing.rows[0].is_active && !isActive) {
      const activeAdmins = await pool.query(
        "SELECT COUNT(*)::int AS total FROM users WHERE role = 'Admin' AND is_active = TRUE"
      );
      if (activeAdmins.rows[0].total <= 1) {
        return res.status(400).json({ message: "At least one active Admin account is required" });
      }
    }

    const updated = await pool.query(
      `UPDATE users
       SET is_active = $1
       WHERE id = $2
       RETURNING id, name, email, role, created_at, is_active, must_change_password`,
      [isActive, userId]
    );

    await logUserAudit({
      targetUserId: existing.rows[0].id,
      targetEmail: existing.rows[0].email,
      action: isActive ? "USER_REACTIVATED" : "USER_DEACTIVATED",
      details: null,
      changedBy: req.user.id,
    });
    await maybePersistInMemorySnapshot();

    return res.json({
      id: updated.rows[0].id,
      name: updated.rows[0].name,
      email: updated.rows[0].email,
      role: updated.rows[0].role,
      createdAt: updated.rows[0].created_at,
      isActive: updated.rows[0].is_active,
      mustChangePassword: updated.rows[0].must_change_password,
    });
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
});

app.delete("/api/users/:id", authRequired, requireRole(["Admin"]), async (req, res) => {
  try {
    const userId = Number(req.params.id);
    if (!Number.isFinite(userId)) return res.status(400).json({ message: "Invalid user id" });
    if (userId === req.user.id) {
      return res.status(400).json({ message: "You cannot delete your own account" });
    }

    const existing = await pool.query("SELECT id, email, role, is_active FROM users WHERE id = $1", [userId]);
    if (!existing.rows[0]) return res.status(404).json({ message: "User not found" });

    if (existing.rows[0].role === "Admin" && existing.rows[0].is_active) {
      const activeAdmins = await pool.query(
        "SELECT COUNT(*)::int AS total FROM users WHERE role = 'Admin' AND is_active = TRUE"
      );
      if (activeAdmins.rows[0].total <= 1) {
        return res.status(400).json({ message: "At least one active Admin account is required" });
      }
    }

    await logUserAudit({
      targetUserId: existing.rows[0].id,
      targetEmail: existing.rows[0].email,
      action: "USER_DELETED",
      details: null,
      changedBy: req.user.id,
    });

    await pool.query("DELETE FROM users WHERE id = $1", [userId]);
    await maybePersistInMemorySnapshot();
    return res.json({ ok: true });
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
});

app.get("/api/users/audit", authRequired, requireRole(["Admin"]), async (req, res) => {
  const limit = Math.min(500, Math.max(1, Number(req.query.limit || 200)));
  const rows = await pool.query(
    `
    SELECT
      l.id,
      l.target_user_id,
      l.target_email,
      l.action,
      l.details,
      l.created_at,
      actor.name AS changed_by_name
    FROM user_audit_logs l
    LEFT JOIN users actor ON actor.id = l.changed_by
    ORDER BY l.created_at DESC
    LIMIT $1
  `,
    [limit]
  );
  return res.json(
    rows.rows.map((row) => ({
      id: row.id,
      targetUserId: row.target_user_id,
      targetEmail: row.target_email,
      action: row.action,
      details: row.details,
      createdAt: row.created_at,
      changedByName: row.changed_by_name || "System",
    }))
  );
});

app.get("/api/meta", authRequired, async (_, res) => {
  const insurersRes = await pool.query(
    `SELECT DISTINCT insurer FROM claims
     WHERE insurer IS NOT NULL AND TRIM(insurer) <> ''
     ORDER BY insurer ASC`
  );
  const insurers = insurersRes.rows.map((r) => r.insurer);
  res.json({
    statuses: CLAIM_STATUSES,
    closedStatuses: [...CLOSED_STATUS_LIST],
    roles: ROLES,
    insurers,
  });
});

app.get("/api/claims", authRequired, async (req, res) => {
  const {
    page = "1",
    limit = "20",
    insurer,
    claimType,
    coverType,
    status,
    agingBucket,
    fromDate,
    toDate,
    search,
    lifecycle,
    garage,
    sortBy = "reported_to_broker_date",
    sortOrder = "desc",
  } = req.query;

  const allowedSortFields = new Set([
    "reported_to_broker_date",
    "insured_name",
    "insurer",
    "claim_status",
    "created_at",
  ]);
  const safeSortField = allowedSortFields.has(sortBy) ? sortBy : "reported_to_broker_date";
  const safeSortOrder = String(sortOrder).toLowerCase() === "asc" ? "ASC" : "DESC";
  const offset = (Math.max(1, Number(page)) - 1) * Math.max(1, Number(limit));

  const params = [];
  const where = [];
  function addFilter(sql, value) {
    params.push(value);
    where.push(sql.replace("$X", `$${params.length}`));
  }

  if (insurer) addFilter("insurer = $X", insurer);
  if (claimType) addFilter("claim_type = $X", claimType);
  if (coverType) addFilter("cover_type = $X", coverType);
  if (status) addFilter("claim_status = $X", status);
  const garageTrim = String(garage || "").trim();
  if (garageTrim) addFilter("garage ILIKE $X", `%${garageTrim}%`);
  if (fromDate) addFilter("reported_to_broker_date >= $X", fromDate);
  if (toDate) addFilter("reported_to_broker_date <= $X", toDate);

  const lifecycleNorm = String(lifecycle || "").toLowerCase();
  if (lifecycleNorm === "open") {
    const start = params.length + 1;
    params.push(...CLOSED_STATUS_LIST);
    const ph = buildInClausePlaceholders(CLOSED_STATUS_LIST, start);
    where.push(`claim_status NOT IN (${ph})`);
  } else if (lifecycleNorm === "closed") {
    const start = params.length + 1;
    params.push(...CLOSED_STATUS_LIST);
    const ph = buildInClausePlaceholders(CLOSED_STATUS_LIST, start);
    where.push(`claim_status IN (${ph})`);
  }

  const whereClause = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const baseSelect = `SELECT * FROM claims ${whereClause}`;

  const listQuery = `
    ${baseSelect}
    ORDER BY ${safeSortField} ${safeSortOrder}
    LIMIT $${params.length + 1}
    OFFSET $${params.length + 2}
  `;

  const countQuery = `SELECT COUNT(*)::int AS total FROM claims ${whereClause}`;
  const listParams = [...params, Number(limit), offset];

  let rows;
  let total;
  if (agingBucket || search) {
    const fullRes = await pool.query(`${baseSelect} ORDER BY ${safeSortField} ${safeSortOrder}`, params);
    const ids = fullRes.rows.map((r) => r.id);
    const latestRemarks = await fetchLatestRemarksByClaimIds(ids);
    const withComputed = fullRes.rows.map((row) => ({
      ...mapClaim(row),
      lastRemark: latestRemarks.get(row.id) || null,
    }));

    const searchNorm = String(search || "").trim().toLowerCase();
    const filtered = withComputed.filter((item) => {
      if (agingBucket && item.agingBucket !== agingBucket) return false;
      if (!searchNorm) return true;
      return (
        String(item.insuredName || "").toLowerCase().includes(searchNorm) ||
        String(item.registrationNumber || "").toLowerCase().includes(searchNorm) ||
        String(item.insurer || "").toLowerCase().includes(searchNorm) ||
        String(item.garage || "").toLowerCase().includes(searchNorm) ||
        String(item.lastRemark || "").toLowerCase().includes(searchNorm)
      );
    });
    total = filtered.length;
    rows = filtered.slice(offset, offset + Number(limit));
  } else {
    const [dataRes, countRes] = await Promise.all([
      pool.query(listQuery, listParams),
      pool.query(countQuery, params),
    ]);
    total = countRes.rows[0].total;
    const ids = dataRes.rows.map((r) => r.id);
    const latestRemarks = await fetchLatestRemarksByClaimIds(ids);
    rows = dataRes.rows.map((row) => ({ ...mapClaim(row), lastRemark: latestRemarks.get(row.id) || null }));
  }

  res.json({
    page: Number(page),
    limit: Number(limit),
    total,
    claims: rows,
  });
});

app.get("/api/claims/:id", authRequired, async (req, res) => {
  const { id } = req.params;
  const claimRes = await pool.query(
    `
    SELECT
      c.*
    FROM claims c
    WHERE c.id = $1
  `,
    [id]
  );
  if (!claimRes.rows[0]) return res.status(404).json({ message: "Claim not found" });

  const [remarksRes, statusRes] = await Promise.all([
    pool.query(
      `SELECT r.id, r.remark, r.created_at, u.name AS created_by_name
       FROM claim_remarks r
       LEFT JOIN users u ON u.id = r.created_by
       WHERE r.claim_id = $1
       ORDER BY r.created_at DESC`,
      [id]
    ),
    pool.query(
      `SELECT h.id, h.from_status, h.to_status, h.changed_at, u.name AS changed_by_name
       FROM claim_status_history h
       LEFT JOIN users u ON u.id = h.changed_by
       WHERE h.claim_id = $1
       ORDER BY h.changed_at DESC`,
      [id]
    ),
  ]);

  return res.json({
    claim: mapClaim(claimRes.rows[0]),
    remarks: remarksRes.rows.map((r) => ({
      id: r.id,
      remark: r.remark,
      createdAt: r.created_at,
      createdByName: r.created_by_name || "Unknown User",
    })),
    statusHistory: statusRes.rows.map((s) => ({
      id: s.id,
      fromStatus: s.from_status,
      toStatus: s.to_status,
      changedAt: s.changed_at,
      changedByName: s.changed_by_name || "Unknown User",
    })),
  });
});

async function createOrUpdateClaim(req, res, mode) {
  const payload = claimInputSchema.parse(req.body);
  const c = toSnakeCaseClaim(payload);
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    let claimId = req.params.id ? Number(req.params.id) : null;
    let oldStatus = null;

    if (mode === "update") {
      const existing = await client.query("SELECT claim_status FROM claims WHERE id = $1", [claimId]);
      if (!existing.rows[0]) {
        await client.query("ROLLBACK");
        return res.status(404).json({ message: "Claim not found" });
      }
      oldStatus = existing.rows[0].claim_status;
      const closureDateSql = CLOSED_STATUSES.has(c.claim_status)
        ? "COALESCE(closure_date, CURRENT_DATE)"
        : "NULL";
      await client.query(
        `
        UPDATE claims
        SET insurer = $1,
            claim_type = $2,
            cover_type = $3,
            insured_name = $4,
            registration_number = $5,
            accident_date = $6,
            reported_to_broker_date = $7,
            reported_to_insurer_date = $8,
            assessed_date = $9,
            claim_status = $10,
            claim_status_other = $11,
            date_ra_issued = $12,
            date_vehicle_released = $13,
            vehicle_value = $14,
            repair_estimate = $15,
            garage = $16,
            closure_date = ${closureDateSql},
            updated_at = NOW()
        WHERE id = $17
      `,
        [
          c.insurer,
          c.claim_type,
          c.cover_type,
          c.insured_name,
          c.registration_number,
          c.accident_date,
          c.reported_to_broker_date,
          c.reported_to_insurer_date,
          c.assessed_date,
          c.claim_status,
          c.claim_status_other,
          c.date_ra_issued,
          c.date_vehicle_released,
          c.vehicle_value,
          c.repair_estimate,
          c.garage,
          claimId,
        ]
      );
    } else {
      const claimValues = [
        c.insurer,
        c.claim_type,
        c.cover_type,
        c.insured_name,
        c.registration_number,
        c.accident_date,
        c.reported_to_broker_date,
        c.reported_to_insurer_date,
        c.assessed_date,
        c.claim_status,
        c.claim_status_other,
        c.date_ra_issued,
        c.date_vehicle_released,
        c.vehicle_value,
        c.repair_estimate,
        c.garage,
        CLOSED_STATUSES.has(c.claim_status) ? new Date().toISOString().slice(0, 10) : null,
        req.user.id,
      ];
      let insert;
      if (dbMode === "in-memory") {
        const cid = await nextSerialId(client, "claims");
        insert = await client.query(
          `
        INSERT INTO claims (
          id,
          insurer, claim_type, cover_type, insured_name, registration_number,
          accident_date, reported_to_broker_date, reported_to_insurer_date,
          assessed_date, claim_status, claim_status_other, date_ra_issued,
          date_vehicle_released, vehicle_value, repair_estimate, garage,
          closure_date, created_by
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
        RETURNING id
      `,
          [cid, ...claimValues]
        );
      } else {
        insert = await client.query(
          `
        INSERT INTO claims (
          insurer, claim_type, cover_type, insured_name, registration_number,
          accident_date, reported_to_broker_date, reported_to_insurer_date,
          assessed_date, claim_status, claim_status_other, date_ra_issued,
          date_vehicle_released, vehicle_value, repair_estimate, garage,
          closure_date, created_by
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
        RETURNING id
      `,
          claimValues
        );
      }
      claimId = insert.rows[0].id;
    }

    await writeStatusTransition(client, claimId, oldStatus, c.claim_status, req.user.id);
    await client.query("COMMIT");
    await maybePersistInMemorySnapshot();
    return res.status(mode === "create" ? 201 : 200).json({ id: claimId });
  } catch (error) {
    await client.query("ROLLBACK");
    return res.status(400).json({ message: error.message });
  } finally {
    client.release();
  }
}

app.post(
  "/api/claims",
  authRequired,
  requireRole(["Admin", "Claims Officer"]),
  async (req, res) => createOrUpdateClaim(req, res, "create")
);

app.put(
  "/api/claims/:id",
  authRequired,
  requireRole(["Admin", "Claims Officer"]),
  async (req, res) => createOrUpdateClaim(req, res, "update")
);

app.patch(
  "/api/claims/:id/status",
  authRequired,
  requireRole(["Admin", "Claims Officer"]),
  async (req, res) => {
    try {
      const schema = z.object({
        status: z.enum(CLAIM_STATUSES),
        statusOther: z.string().nullable().optional(),
        remark: z.string().trim().min(1).optional(),
      });
      const payload = schema.parse(req.body);
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const existing = await client.query("SELECT claim_status FROM claims WHERE id = $1", [
          req.params.id,
        ]);
        if (!existing.rows[0]) {
          await client.query("ROLLBACK");
          return res.status(404).json({ message: "Claim not found" });
        }
        const oldStatus = existing.rows[0].claim_status;
        const closureDateSql = CLOSED_STATUSES.has(payload.status)
          ? "COALESCE(closure_date, CURRENT_DATE)"
          : "NULL";
        await client.query(
          `UPDATE claims
           SET claim_status = $1,
               claim_status_other = $2,
               closure_date = ${closureDateSql},
               updated_at = NOW()
           WHERE id = $3`,
          [payload.status, payload.statusOther || null, req.params.id]
        );
        await writeStatusTransition(client, Number(req.params.id), oldStatus, payload.status, req.user.id);
        if (payload.remark) {
          if (dbMode === "in-memory") {
            const rid = await nextSerialId(client, "claim_remarks");
            await client.query(
              "INSERT INTO claim_remarks (id, claim_id, remark, created_by) VALUES ($1, $2, $3, $4)",
              [rid, req.params.id, payload.remark, req.user.id]
            );
          } else {
            await client.query(
              "INSERT INTO claim_remarks (claim_id, remark, created_by) VALUES ($1, $2, $3)",
              [req.params.id, payload.remark, req.user.id]
            );
          }
        }
        await client.query("COMMIT");
        await maybePersistInMemorySnapshot();
        return res.json({ ok: true });
      } catch (error) {
        await client.query("ROLLBACK");
        return res.status(400).json({ message: error.message });
      } finally {
        client.release();
      }
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  }
);

app.post(
  "/api/claims/:id/remarks",
  authRequired,
  requireRole(["Admin", "Claims Officer"]),
  async (req, res) => {
    try {
      const schema = z.object({ remark: z.string().trim().min(1) });
      const { remark } = schema.parse(req.body);
      let inserted;
      if (dbMode === "in-memory") {
        const rid = await nextSerialId(pool, "claim_remarks");
        inserted = await pool.query(
          `
        INSERT INTO claim_remarks (id, claim_id, remark, created_by)
        VALUES ($1, $2, $3, $4)
        RETURNING id, created_at
      `,
          [rid, req.params.id, remark, req.user.id]
        );
      } else {
        inserted = await pool.query(
          `
        INSERT INTO claim_remarks (claim_id, remark, created_by)
        VALUES ($1, $2, $3)
        RETURNING id, created_at
      `,
          [req.params.id, remark, req.user.id]
        );
      }
      await maybePersistInMemorySnapshot();
      return res.status(201).json(inserted.rows[0]);
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  }
);

app.get("/api/claims-export.csv", authRequired, async (req, res) => {
  const {
    insurer,
    claimType,
    coverType,
    status,
    agingBucket,
    fromDate,
    toDate,
    search,
    lifecycle,
    garage,
    sortBy = "reported_to_broker_date",
    sortOrder = "desc",
  } = req.query;

  const allowedSortFields = new Set([
    "reported_to_broker_date",
    "insured_name",
    "insurer",
    "claim_status",
    "created_at",
  ]);
  const safeSortField = allowedSortFields.has(sortBy) ? sortBy : "reported_to_broker_date";
  const safeSortOrder = String(sortOrder).toLowerCase() === "asc" ? "ASC" : "DESC";

  const params = [];
  const where = [];
  function addFilter(sql, value) {
    params.push(value);
    where.push(sql.replace("$X", `$${params.length}`));
  }

  if (insurer) addFilter("insurer = $X", insurer);
  if (claimType) addFilter("claim_type = $X", claimType);
  if (coverType) addFilter("cover_type = $X", coverType);
  if (status) addFilter("claim_status = $X", status);
  const garageTrimExport = String(garage || "").trim();
  if (garageTrimExport) addFilter("garage ILIKE $X", `%${garageTrimExport}%`);
  if (fromDate) addFilter("reported_to_broker_date >= $X", fromDate);
  if (toDate) addFilter("reported_to_broker_date <= $X", toDate);

  const lifecycleExport = String(lifecycle || "").toLowerCase();
  if (lifecycleExport === "open") {
    const start = params.length + 1;
    params.push(...CLOSED_STATUS_LIST);
    const ph = buildInClausePlaceholders(CLOSED_STATUS_LIST, start);
    where.push(`claim_status NOT IN (${ph})`);
  } else if (lifecycleExport === "closed") {
    const start = params.length + 1;
    params.push(...CLOSED_STATUS_LIST);
    const ph = buildInClausePlaceholders(CLOSED_STATUS_LIST, start);
    where.push(`claim_status IN (${ph})`);
  }

  const whereClause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const result = await pool.query(
    `
      SELECT
        id, insurer, claim_type, cover_type, insured_name, registration_number,
        accident_date, reported_to_broker_date, reported_to_insurer_date, assessed_date,
        claim_status, claim_status_other, date_ra_issued, date_vehicle_released,
        vehicle_value, repair_estimate, garage, closure_date
      FROM claims
      ${whereClause}
      ORDER BY ${safeSortField} ${safeSortOrder}
    `,
    params
  );

  const latestRemarks = await fetchLatestRemarksByClaimIds(result.rows.map((row) => row.id));
  const searchNorm = String(search || "").trim().toLowerCase();
  const rows = result.rows.filter((row) => {
    const daysOpen = computeDaysOpen(row.reported_to_broker_date, row.closure_date);
    const bucket = calcAgingBucket(daysOpen);
    if (agingBucket && bucket !== agingBucket) return false;
    if (!searchNorm) return true;
    return (
      String(row.insured_name || "").toLowerCase().includes(searchNorm) ||
      String(row.registration_number || "").toLowerCase().includes(searchNorm) ||
      String(row.insurer || "").toLowerCase().includes(searchNorm) ||
      String(row.garage || "").toLowerCase().includes(searchNorm) ||
      String(latestRemarks.get(row.id) || "").toLowerCase().includes(searchNorm)
    );
  });

  const header = [
    "ID",
    "Insurer",
    "Claim Type",
    "Cover Type",
    "Insured Name",
    "Reg No",
    "Accident Date",
    "Reported to ADT",
    "Reported to Insurer",
    "Assessed Date",
    "Status",
    "Status Other",
    "RA Date",
    "Released Date",
    "Vehicle Value",
    "Repair Estimate",
    "Garage",
    "Closure Date",
    "Days Open",
  ];

  const lines = [header.join(",")];
  for (const row of rows) {
    const values = [
      row.id,
      row.insurer,
      row.claim_type,
      row.cover_type,
      row.insured_name,
      row.registration_number,
      formatDateForCsv(row.accident_date),
      formatDateForCsv(row.reported_to_broker_date),
      formatDateForCsv(row.reported_to_insurer_date),
      formatDateForCsv(row.assessed_date),
      row.claim_status,
      row.claim_status_other,
      formatDateForCsv(row.date_ra_issued),
      formatDateForCsv(row.date_vehicle_released),
      row.vehicle_value,
      row.repair_estimate,
      row.garage,
      formatDateForCsv(row.closure_date),
      computeDaysOpen(row.reported_to_broker_date, row.closure_date),
    ].map((value) => `"${String(value ?? "").replace(/"/g, '""')}"`);
    lines.push(values.join(","));
  }

  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", "attachment; filename=claims-export.csv");
  res.send(lines.join("\n"));
});

app.get("/api/dashboard/overall", authRequired, async (_, res) => {
  const result = await pool.query(`
    SELECT insurer, claim_status, reported_to_broker_date, closure_date
    FROM claims
  `);
  const claims = result.rows;
  const withDays = claims.map((c) => ({
    ...c,
    days_open: computeDaysOpen(c.reported_to_broker_date, c.closure_date),
  }));

  const totalClaims = withDays.length;
  const totalClosed = withDays.filter((c) => CLOSED_STATUSES.has(c.claim_status)).length;
  const totalOpen = totalClaims - totalClosed;
  const avgDaysOpen =
    totalClaims === 0
      ? 0
      : Number((withDays.reduce((sum, c) => sum + c.days_open, 0) / totalClaims).toFixed(2));
  const over30 = withDays.filter((c) => !CLOSED_STATUSES.has(c.claim_status) && c.days_open >= 31).length;

  const statusMap = new Map();
  const insurerMap = new Map();
  const agingMap = new Map([
    ["0-7", 0],
    ["8-14", 0],
    ["15-30", 0],
    ["30+", 0],
  ]);
  for (const claim of withDays) {
    statusMap.set(claim.claim_status, (statusMap.get(claim.claim_status) || 0) + 1);
    insurerMap.set(claim.insurer, (insurerMap.get(claim.insurer) || 0) + 1);
    const bucket = calcAgingBucket(claim.days_open);
    agingMap.set(bucket, (agingMap.get(bucket) || 0) + 1);
  }

  res.json({
    kpis: {
      total_claims: totalClaims,
      total_closed: totalClosed,
      total_open: totalOpen,
      avg_days_open: avgDaysOpen,
      over_30: over30,
    },
    statusBreakdown: Array.from(statusMap.entries())
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value),
    insurerBreakdown: Array.from(insurerMap.entries())
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value),
    agingBreakdown: ["0-7", "8-14", "15-30", "30+"].map((bucket) => ({
      bucket,
      value: agingMap.get(bucket) || 0,
    })),
  });
});

app.get("/api/dashboard/insurer", authRequired, async (req, res) => {
  const insurer = req.query.insurer;
  if (!insurer) return res.status(400).json({ message: "insurer is required" });

  const claimsRes = await pool.query(
    `SELECT id, insured_name, registration_number, claim_status, reported_to_broker_date, closure_date
     FROM claims
     WHERE insurer = $1`,
    [insurer]
  );
  const claims = claimsRes.rows.map((c) => ({
    ...c,
    days_open: computeDaysOpen(c.reported_to_broker_date, c.closure_date),
  }));

  const totalClaims = claims.length;
  const closed = claims.filter((c) => CLOSED_STATUSES.has(c.claim_status)).length;
  const open = totalClaims - closed;
  const avgTurnaround =
    totalClaims === 0
      ? 0
      : Number((claims.reduce((sum, c) => sum + c.days_open, 0) / totalClaims).toFixed(2));

  const worstOpenClaims = claims
    .filter((c) => !CLOSED_STATUSES.has(c.claim_status))
    .sort((a, b) => b.days_open - a.days_open)
    .slice(0, 20);

  const statusMap = new Map();
  for (const c of claims) {
    statusMap.set(c.claim_status, (statusMap.get(c.claim_status) || 0) + 1);
  }

  res.json({
    kpis: {
      total_claims: totalClaims,
      closed,
      open,
      avg_turnaround: avgTurnaround,
    },
    worstOpenClaims,
    statusBreakdown: Array.from(statusMap.entries())
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value),
  });
});

app.get("/api/dashboard/operations", authRequired, async (_, res) => {
  const claimsRes = await pool.query(`
    SELECT
      id,
      insurer,
      insured_name,
      registration_number,
      reported_to_broker_date,
      claim_status,
      closure_date,
      date_vehicle_released
    FROM claims
  `);
  const latestRemarks = await fetchLatestRemarksByClaimIds(claimsRes.rows.map((c) => c.id));
  const claims = claimsRes.rows.map((c) => ({
    ...c,
    last_remark: latestRemarks.get(c.id) || null,
    days_open: computeDaysOpen(c.reported_to_broker_date, c.closure_date),
  }));

  const orderByDays = (a, b) => b.days_open - a.days_open;
  const pendingAssessment = claims
    .filter((c) => c.claim_status === "Awaiting Assessment")
    .sort(orderByDays)
    .slice(0, 50);
  const stuckOver7 = claims
    .filter((c) => !CLOSED_STATUSES.has(c.claim_status) && c.days_open > 7)
    .sort(orderByDays)
    .slice(0, 50);
  const pendingDocuments = claims
    .filter((c) => c.claim_status === "Pending Documents")
    .sort(orderByDays)
    .slice(0, 50);
  const notReleased = claims
    .filter((c) => ["RA Issued", "Under Repair"].includes(c.claim_status) && !c.date_vehicle_released)
    .sort(orderByDays)
    .slice(0, 50);

  res.json({
    pendingAssessment,
    stuckOver7Days: stuckOver7,
    pendingDocuments,
    notReleased,
  });
});

app.post(
  "/api/claims/import-excel",
  authRequired,
  requireRole(["Admin", "Claims Officer"]),
  upload.single("file"),
  async (req, res) => {
    if (!req.file) return res.status(400).json({ message: "Missing file" });
    const workbook = xlsx.read(req.file.buffer, { type: "buffer" });
    const firstSheet = workbook.SheetNames[0];
    const { rows, headerRowIndex } = extractRowsFromWorksheet(workbook.Sheets[firstSheet]);

    const warnings = [];
    let inserted = 0;

    for (const [index, row] of rows.entries()) {
      const reportedDateRaw = pickValue(row, [
        "Date Reported to Broker (ADT)",
        "Date Reported to Broker",
        "Date Reported",
        "Reported to ADT",
        "Date Reported to ADT",
      ]);
      const reportedDate = parseDateFromExcel(reportedDateRaw);
      const insurer = String(pickValue(row, ["Insurer", "Insurance Company", "Underwriter"]) || "").trim();
      const claimType = parseClaimType(pickValue(row, ["Claim Type", "Type", "Class"]));
      const status = String(pickValue(row, ["Claim Status", "Status"]) || "Reported").trim();

      if (!reportedDate || !insurer || !claimType) {
        const reasons = [];
        if (!insurer) reasons.push("missing insurer");
        if (!reportedDate) reasons.push(`invalid/missing reported date (${reportedDateRaw || "blank"})`);
        if (!claimType) reasons.push("unrecognized claim type");
        warnings.push({
          row: index + headerRowIndex + 2,
          reason: reasons.join(", "),
        });
        continue;
      }
      const safeStatus = CLAIM_STATUSES.includes(status) ? status : "Other";
      const importClaimValues = [
        insurer,
        claimType,
        String(pickValue(row, ["Cover Type", "Policy Cover", "Cover"]) || "Not Specified").trim(),
        String(pickValue(row, ["Insured Name", "Client Name", "Name"]) || "Unknown").trim(),
        String(
          pickValue(row, [
            "Registration Number / Name",
            "Registration Number/Name",
            "Registration Number",
            "Reg Number",
            "Reg No",
            "Registration",
            "Vehicle Registration",
          ]) || "Unknown"
        ).trim(),
        parseDateFromExcel(
          pickValue(row, ["Date of Accident/Loss", "Date of Accident", "Date of Loss"])
        ),
        reportedDate,
        parseDateFromExcel(
          pickValue(row, ["Date Reported to Insurer", "Reported to Insurer Date"])
        ),
        parseDateFromExcel(pickValue(row, ["Date Assessed", "Assessment Date"])),
        safeStatus,
        safeStatus === "Other" ? status : null,
        parseDateFromExcel(pickValue(row, ["Date RA Issued", "RA Date"])),
        parseDateFromExcel(pickValue(row, ["Date Vehicle Released", "Released Date"])),
        parseMoney(pickValue(row, ["Vehicle Value (KES)", "Vehicle Value", "Sum Insured"])),
        parseMoney(pickValue(row, ["Repair Estimate (KES)", "Repair Estimate", "Estimate"])),
        String(pickValue(row, ["Garage / Repairer", "Garage", "Repairer"]) || "").trim() || null,
        CLOSED_STATUSES.has(safeStatus) ? new Date().toISOString().slice(0, 10) : null,
        req.user.id,
      ];
      if (dbMode === "in-memory") {
        const cid = await nextSerialId(pool, "claims");
        await pool.query(
          `
        INSERT INTO claims (
          id,
          insurer, claim_type, cover_type, insured_name, registration_number,
          accident_date, reported_to_broker_date, reported_to_insurer_date,
          assessed_date, claim_status, claim_status_other, date_ra_issued,
          date_vehicle_released, vehicle_value, repair_estimate, garage,
          closure_date, created_by
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
      `,
          [cid, ...importClaimValues]
        );
      } else {
        await pool.query(
          `
        INSERT INTO claims (
          insurer, claim_type, cover_type, insured_name, registration_number,
          accident_date, reported_to_broker_date, reported_to_insurer_date,
          assessed_date, claim_status, claim_status_other, date_ra_issued,
          date_vehicle_released, vehicle_value, repair_estimate, garage,
          closure_date, created_by
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
      `,
          importClaimValues
        );
      }
      inserted += 1;
    }

    await maybePersistInMemorySnapshot();
    return res.json({ inserted, warnings, totalRows: rows.length, headerRowIndex: headerRowIndex + 1 });
  }
);

app.use((error, _, res, __) => {
  res.status(500).json({ message: error.message || "Internal server error" });
});

async function startServer() {
  try {
    await ensureDb();
    await maybeLoadInMemorySnapshot();
  } catch (error) {
    const isConnectionIssue =
      dbMode === "postgres" && (error.code === "ECONNREFUSED" || error.code === "ENOTFOUND");
    if (!isConnectionIssue) {
      throw error;
    }

    console.warn("Postgres unavailable. Falling back to in-memory database for local development.");
    if (typeof pool.end === "function") {
      await pool.end().catch(() => {});
    }
    const fallback = createDbPool({ forceInMemory: true });
    pool = fallback.pool;
    dbMode = fallback.dbMode;
    await ensureDb();
    await maybeLoadInMemorySnapshot();
  }

  app.listen(PORT, () => {
    if (dbMode === "in-memory") {
      console.warn(
        `Running with in-memory fallback + local snapshot persistence at ${SNAPSHOT_FILE_PATH}. Set DATABASE_URL for full Postgres persistence.`
      );
    }
    console.log(`API listening on http://localhost:${PORT}`);
  });
}

startServer().catch((error) => {
  console.error("Failed to initialize database:", error);
  process.exit(1);
});
