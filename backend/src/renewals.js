const { z } = require("zod");
const { canEditRenewals, canManageRenewalSettings, requirePermission } = require("./permissions");
const { importRenewalsFromExcelBuffer } = require("./renewalImport");
const {
  buildRenewalsWorkbookBuffer,
  buildRenewalsTemplateBuffer,
  buildExportFilterSummary,
} = require("./renewalExport");
const {
  sendEmail,
  sendSms,
  buildRenewalSms,
  buildRenewalEmail,
  sendRenewalFailureDigest,
  sendRenewalTestEmail,
  sendRenewalTestSms,
  renewalOpsRecipients,
  isSmtpConfigured,
  isSmsConfigured,
} = require("./notificationService");

const POLICY_STATUSES = ["Active", "Renewed", "Lapsed", "Cancelled"];
const MILESTONES = [60, 30, 15];
const CHANNELS = ["sms", "email"];
const RECIPIENT_TYPES = ["client", "financier"];
const LOG_STATUSES = ["sent", "failed", "skipped"];
const NA_FINANCIER = new Set(["N/A", "NA", "NONE", "NIL", "NULL", "-", "N.A", "N.A."]);

const POLICY_SNAPSHOT_COLUMNS = [
  "id",
  "insured_name",
  "phone_raw",
  "phone_e164",
  "email",
  "policy_number",
  "insurer",
  "renewal_date",
  "car_registrations",
  "financial_interest",
  "status",
  "notes",
  "created_by",
  "created_at",
  "updated_at",
];

const FINANCIER_SNAPSHOT_COLUMNS = [
  "id",
  "name",
  "phone",
  "phone_e164",
  "email",
  "notes",
  "created_at",
];

const LOG_SNAPSHOT_COLUMNS = [
  "id",
  "policy_id",
  "milestone",
  "channel",
  "recipient_type",
  "recipient_name",
  "recipient_address",
  "status",
  "error_message",
  "message_body",
  "provider_ref",
  "sent_at",
  "acknowledged_at",
  "acknowledged_by",
  "created_at",
];

const SETTINGS_SNAPSHOT_COLUMNS = [
  "id",
  "ops_email_list",
  "sms_enabled",
  "email_enabled",
  "last_run_at",
  "last_failure_digest_at",
  "updated_at",
];

const policyBodySchema = z.object({
  insuredName: z.string().min(1),
  phoneRaw: z.string().optional().default(""),
  email: z.string().optional().default(""),
  policyNumber: z.string().optional().default(""),
  insurer: z.string().optional().default(""),
  renewalDate: z.string().min(1),
  carRegistrations: z.string().optional().default(""),
  financialInterest: z.string().optional().default(""),
  status: z.enum(POLICY_STATUSES).optional().default("Active"),
  notes: z.string().optional().default(""),
});

function todayNairobi() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Nairobi" });
}

/** Calendar YYYY-MM-DD from a DATE column, Date object, or ISO string. */
function toDateOnly(value) {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const y = value.getUTCFullYear();
    const m = String(value.getUTCMonth() + 1).padStart(2, "0");
    const d = String(value.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  const raw = String(value).trim();
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  const y = parsed.getUTCFullYear();
  const m = String(parsed.getUTCMonth() + 1).padStart(2, "0");
  const d = String(parsed.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function daysUntilRenewal(renewalDate, today = todayNairobi()) {
  const iso = toDateOnly(renewalDate);
  const todayIso = toDateOnly(today);
  if (!iso || !todayIso) return null;
  const start = Date.UTC(
    Number(todayIso.slice(0, 4)),
    Number(todayIso.slice(5, 7)) - 1,
    Number(todayIso.slice(8, 10))
  );
  const end = Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
  return Math.round((end - start) / (1000 * 60 * 60 * 24));
}

function isDayCount(value) {
  return Number.isFinite(value);
}

function normalizeKenyaPhone(raw) {
  const cleaned = String(raw || "").replace(/[^\d+]/g, "");
  if (!cleaned) return "";
  let digits = cleaned.replace(/^\+/, "");
  if (digits.startsWith("254")) {
    digits = digits.slice(3);
  } else if (digits.startsWith("0")) {
    digits = digits.slice(1);
  }
  if (/^[17]\d{8}$/.test(digits) || /^\d{9}$/.test(digits)) {
    return `+254${digits}`;
  }
  return "";
}

function parseFinancierNames(raw) {
  const cleaned = String(raw || "")
    .replace(/\bN\s*\/\s*A\b/gi, " ")
    .replace(/\bN\.?\s*A\.?\b/gi, " ");
  return cleaned
    .split(/[/,&+]|(?:\band\b)/i)
    .map((part) => part.trim())
    .filter((part) => {
      if (!part) return false;
      const key = part.replace(/\./g, "").toUpperCase().replace(/\s+/g, " ");
      return !NA_FINANCIER.has(key);
    });
}

function hasFinancialInterest(raw) {
  return parseFinancierNames(raw).length > 0;
}

function splitRegistrations(raw) {
  return String(raw || "")
    .split(/\s*(?:&|,|;|\+)\s*/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function rowToPolicy(row, today = todayNairobi()) {
  const days = daysUntilRenewal(row.renewal_date, today);
  return {
    id: row.id,
    insuredName: row.insured_name,
    phoneRaw: row.phone_raw || "",
    phoneE164: row.phone_e164 || "",
    email: row.email || "",
    policyNumber: row.policy_number || "",
    insurer: row.insurer || "",
    renewalDate: toDateOnly(row.renewal_date),
    carRegistrations: row.car_registrations || "",
    vehicles: splitRegistrations(row.car_registrations),
    financialInterest: row.financial_interest || "",
    financierNames: parseFinancierNames(row.financial_interest),
    status: row.status,
    notes: row.notes || "",
    daysUntilRenewal: days,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToLog(row) {
  return {
    id: row.id,
    policyId: row.policy_id,
    insuredName: row.insured_name || "",
    milestone: row.milestone,
    channel: row.channel,
    recipientType: row.recipient_type,
    recipientName: row.recipient_name || "",
    recipientAddress: row.recipient_address || "",
    status: row.status,
    errorMessage: row.error_message || "",
    messageBody: row.message_body || "",
    providerRef: row.provider_ref || "",
    sentAt: row.sent_at,
    acknowledgedAt: row.acknowledged_at,
    acknowledgedBy: row.acknowledged_by,
    createdAt: row.created_at,
    renewalDate: toDateOnly(row.renewal_date) || null,
    carRegistrations: row.car_registrations || "",
  };
}

function rowToFinancier(row) {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone || "",
    phoneE164: row.phone_e164 || "",
    email: row.email || "",
    notes: row.notes || "",
    createdAt: row.created_at,
  };
}

async function ensureRenewalsTables(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS renewal_policies (
      id SERIAL PRIMARY KEY,
      insured_name TEXT NOT NULL,
      phone_raw TEXT NOT NULL DEFAULT '',
      phone_e164 TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL DEFAULT '',
      policy_number TEXT NOT NULL DEFAULT '',
      insurer TEXT NOT NULL DEFAULT '',
      renewal_date DATE NOT NULL,
      car_registrations TEXT NOT NULL DEFAULT '',
      financial_interest TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'Active',
      notes TEXT NOT NULL DEFAULT '',
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS renewal_financiers (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT NOT NULL DEFAULT '',
      phone_e164 TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS renewal_notification_logs (
      id SERIAL PRIMARY KEY,
      policy_id INTEGER NOT NULL REFERENCES renewal_policies(id) ON DELETE CASCADE,
      milestone INTEGER NOT NULL,
      channel TEXT NOT NULL,
      recipient_type TEXT NOT NULL,
      recipient_name TEXT NOT NULL DEFAULT '',
      recipient_address TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL,
      error_message TEXT NULL,
      message_body TEXT NOT NULL DEFAULT '',
      provider_ref TEXT NULL,
      sent_at TIMESTAMPTZ NULL,
      acknowledged_at TIMESTAMPTZ NULL,
      acknowledged_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS renewal_settings (
      id INTEGER PRIMARY KEY DEFAULT 1,
      ops_email_list TEXT NOT NULL DEFAULT '',
      sms_enabled BOOLEAN NOT NULL DEFAULT TRUE,
      email_enabled BOOLEAN NOT NULL DEFAULT TRUE,
      last_run_at TIMESTAMPTZ NULL,
      last_failure_digest_at TIMESTAMPTZ NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_renewal_policies_date ON renewal_policies (renewal_date, status);
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_renewal_logs_status ON renewal_notification_logs (status, acknowledged_at);
  `);

  const settingsCount = await pool.query("SELECT COUNT(*)::int AS total FROM renewal_settings");
  if (settingsCount.rows[0].total === 0) {
    await pool.query(
      `INSERT INTO renewal_settings (id, ops_email_list, sms_enabled, email_enabled)
       VALUES (1, '', TRUE, TRUE)`
    );
  }
}

async function getSettings(pool) {
  const result = await pool.query("SELECT * FROM renewal_settings ORDER BY id ASC LIMIT 1");
  return (
    result.rows[0] || {
      id: 1,
      ops_email_list: "",
      sms_enabled: true,
      email_enabled: true,
      last_run_at: null,
      last_failure_digest_at: null,
    }
  );
}

async function seedRenewalsIfEmpty(pool, nextSerialId) {
  const count = await pool.query("SELECT COUNT(*)::int AS total FROM renewal_policies");
  if (count.rows[0].total > 0) return;

  const today = todayNairobi();
  const addDays = (n) => {
    const d = new Date(`${today}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  };

  const samples = [
    {
      insured_name: "MUKYS IMPORTERS LIMITED",
      phone_raw: "722111333",
      phone_e164: "+254722111333",
      email: "",
      policy_number: "",
      insurer: "",
      renewal_date: "2026-02-01",
      car_registrations: "KBJ 139Q",
      financial_interest: "ABSON / N/A",
      status: "Active",
      notes: "Seeded from Excel register example.",
    },
    {
      insured_name: "MUKYS IMPORTERS LIMITED",
      phone_raw: "722111333",
      phone_e164: "+254722111333",
      email: "",
      policy_number: "",
      insurer: "",
      renewal_date: addDays(15),
      car_registrations: "KBJ 139Q",
      financial_interest: "ABSON / N/A",
      status: "Active",
      notes: "Demo T-15 reminder window.",
    },
    {
      insured_name: "EASTLAND HAULIERS LTD",
      phone_raw: "722000111",
      phone_e164: "+254722000111",
      email: "",
      policy_number: "",
      insurer: "",
      renewal_date: addDays(30),
      car_registrations: "KCA 221B & KCA 222C",
      financial_interest: "N/A",
      status: "Active",
      notes: "Demo T-30 reminder window. Multi-vehicle policy.",
    },
    {
      insured_name: "SAVANNAH LOGISTICS",
      phone_raw: "711555444",
      phone_e164: "+254711555444",
      email: "",
      policy_number: "",
      insurer: "",
      renewal_date: addDays(60),
      car_registrations: "KDG 009A",
      financial_interest: "ABSON",
      status: "Active",
      notes: "Demo T-60 reminder window.",
    },
  ];

  for (const sample of samples) {
    const id = await nextSerialId(pool, "renewal_policies");
    await pool.query(
      `INSERT INTO renewal_policies (
        id, insured_name, phone_raw, phone_e164, email, policy_number, insurer,
        renewal_date, car_registrations, financial_interest, status, notes
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [
        id,
        sample.insured_name,
        sample.phone_raw,
        sample.phone_e164,
        sample.email,
        sample.policy_number,
        sample.insurer,
        sample.renewal_date,
        sample.car_registrations,
        sample.financial_interest,
        sample.status,
        sample.notes,
      ]
    );
  }

  const financierCount = await pool.query("SELECT COUNT(*)::int AS total FROM renewal_financiers");
  if (financierCount.rows[0].total === 0) {
    const fid = await nextSerialId(pool, "renewal_financiers");
    await pool.query(
      `INSERT INTO renewal_financiers (id, name, phone, phone_e164, email, notes)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        fid,
        "ABSON",
        "",
        "",
        "",
        "Add phone/email so financial-interest reminders can be delivered.",
      ]
    );
  }
}

function matchFinancier(financiers, name) {
  const key = String(name || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  if (!key) return null;
  return (
    financiers.find((f) => {
      const n = String(f.name || "")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");
      return n === key || n.includes(key) || key.includes(n);
    }) || null
  );
}

async function alreadySent(pool, { policyId, milestone, channel, recipientType, recipientAddress }) {
  const result = await pool.query(
    `SELECT id FROM renewal_notification_logs
     WHERE policy_id = $1 AND milestone = $2 AND channel = $3
       AND recipient_type = $4 AND recipient_address = $5 AND status = 'sent'
     LIMIT 1`,
    [policyId, milestone, channel, recipientType, recipientAddress || ""]
  );
  return !!result.rows[0];
}

async function insertLog(pool, nextSerialId, dbMode, row) {
  const values = [
    row.policy_id,
    row.milestone,
    row.channel,
    row.recipient_type,
    row.recipient_name || "",
    row.recipient_address || "",
    row.status,
    row.error_message || null,
    row.message_body || "",
    row.provider_ref || null,
    row.sent_at || null,
  ];
  if (dbMode === "in-memory") {
    const id = await nextSerialId(pool, "renewal_notification_logs");
    const inserted = await pool.query(
      `INSERT INTO renewal_notification_logs (
        id, policy_id, milestone, channel, recipient_type, recipient_name, recipient_address,
        status, error_message, message_body, provider_ref, sent_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      RETURNING *`,
      [id, ...values]
    );
    return inserted.rows[0];
  }
  const inserted = await pool.query(
    `INSERT INTO renewal_notification_logs (
      policy_id, milestone, channel, recipient_type, recipient_name, recipient_address,
      status, error_message, message_body, provider_ref, sent_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
    RETURNING *`,
    values
  );
  return inserted.rows[0];
}

function buildAttemptsForPolicy(policy, financiers, settings) {
  const attempts = [];
  const ctx = {
    insuredName: policy.insured_name,
    registrations: policy.car_registrations,
    renewalDate: policy.renewal_date,
    daysUntil: policy.daysUntil,
    financierName: parseFinancierNames(policy.financial_interest).join(", "),
    phone: policy.phone_e164 || policy.phone_raw,
  };

  if (settings.sms_enabled) {
    attempts.push({
      channel: "sms",
      recipientType: "client",
      recipientName: policy.insured_name,
      recipientAddress: policy.phone_e164 || "",
      message: buildRenewalSms({ ...ctx, recipientType: "client" }),
      missingReason: policy.phone_e164 ? null : "Client phone missing or could not be normalized to +254",
    });
  }
  if (settings.email_enabled && policy.email) {
    attempts.push({
      channel: "email",
      recipientType: "client",
      recipientName: policy.insured_name,
      recipientAddress: policy.email,
      message: buildRenewalEmail({ ...ctx, recipientType: "client" }),
      missingReason: null,
    });
  }

  const names = parseFinancierNames(policy.financial_interest);
  for (const name of names) {
    const match = matchFinancier(financiers, name);
    const phone = match?.phone_e164 || "";
    const email = match?.email || "";
    if (!phone && !email) {
      attempts.push({
        channel: settings.sms_enabled ? "sms" : "email",
        recipientType: "financier",
        recipientName: name,
        recipientAddress: "",
        message: settings.sms_enabled
          ? buildRenewalSms({ ...ctx, recipientType: "financier", financierName: name })
          : buildRenewalEmail({ ...ctx, recipientType: "financier", financierName: name }),
        missingReason: `Financier "${name}" has no SMS or email in the financier directory`,
      });
      continue;
    }
    if (settings.sms_enabled && phone) {
      attempts.push({
        channel: "sms",
        recipientType: "financier",
        recipientName: name,
        recipientAddress: phone,
        message: buildRenewalSms({ ...ctx, recipientType: "financier", financierName: name }),
        missingReason: null,
      });
    }
    if (settings.email_enabled && email) {
      attempts.push({
        channel: "email",
        recipientType: "financier",
        recipientName: name,
        recipientAddress: email,
        message: buildRenewalEmail({ ...ctx, recipientType: "financier", financierName: name }),
        missingReason: null,
      });
    }
  }

  return attempts;
}

async function deliverAttempt(attempt, settings) {
  if (attempt.channel === "sms" && !settings.sms_enabled) {
    return { status: "skipped", error: "SMS disabled in settings", providerRef: null };
  }
  if (attempt.channel === "email" && !settings.email_enabled) {
    return { status: "skipped", error: "Email disabled in settings", providerRef: null };
  }
  if (attempt.missingReason) {
    return { status: "failed", error: attempt.missingReason, providerRef: null };
  }

  if (attempt.channel === "sms") {
    const result = await sendSms({ to: attempt.recipientAddress, message: attempt.message });
    if (result.sent) return { status: "sent", error: null, providerRef: result.providerRef };
    return {
      status: "failed",
      error: result.reason || "SMS send failed",
      providerRef: result.providerRef || null,
    };
  }

  const { subject, text, html } = attempt.message;
  const result = await sendEmail({ to: attempt.recipientAddress, subject, text, html });
  if (result.sent) return { status: "sent", error: null, providerRef: null };
  return { status: "failed", error: result.reason || "Email send failed", providerRef: null };
}

async function runRenewalReminderJob(pool, { nextSerialId, dbMode, onPersist, force = false } = {}) {
  const settings = await getSettings(pool);
  const today = todayNairobi();
  const policies = await pool.query(
    `SELECT * FROM renewal_policies WHERE status = 'Active'`
  );
  const financiersRes = await pool.query("SELECT * FROM renewal_financiers");
  const financiers = financiersRes.rows;

  const due = policies.rows
    .map((row) => ({ ...row, daysUntil: daysUntilRenewal(row.renewal_date, today) }))
    .filter((row) => MILESTONES.includes(row.daysUntil));

  const summary = {
    ranAt: new Date().toISOString(),
    today,
    duePolicies: due.length,
    attempted: 0,
    sent: 0,
    failed: 0,
    skipped: 0,
    alreadySent: 0,
  };

  for (const policy of due) {
    const attempts = buildAttemptsForPolicy(policy, financiers, settings);
    for (const attempt of attempts) {
      const sent = await alreadySent(pool, {
        policyId: policy.id,
        milestone: policy.daysUntil,
        channel: attempt.channel,
        recipientType: attempt.recipientType,
        recipientAddress: attempt.recipientAddress,
      });
      if (sent && !force) {
        summary.alreadySent += 1;
        continue;
      }
      summary.attempted += 1;
      const result = await deliverAttempt(attempt, settings);
      summary[result.status] = (summary[result.status] || 0) + 1;
      const body =
        attempt.channel === "email"
          ? attempt.message?.text || ""
          : String(attempt.message || "");
      await insertLog(pool, nextSerialId, dbMode, {
        policy_id: policy.id,
        milestone: policy.daysUntil,
        channel: attempt.channel,
        recipient_type: attempt.recipientType,
        recipient_name: attempt.recipientName,
        recipient_address: attempt.recipientAddress,
        status: result.status,
        error_message: result.error,
        message_body: body,
        provider_ref: result.providerRef,
        sent_at: result.status === "sent" ? new Date().toISOString() : null,
      });
    }
  }

  const failures = await pool.query(
    `SELECT l.*, p.insured_name, p.renewal_date, p.car_registrations
     FROM renewal_notification_logs l
     JOIN renewal_policies p ON p.id = l.policy_id
     WHERE l.status = 'failed' AND l.acknowledged_at IS NULL
     ORDER BY l.created_at DESC`
  );

  const ops = renewalOpsRecipients(settings.ops_email_list);
  if (failures.rows.length && ops.length) {
    await sendRenewalFailureDigest({
      to: ops,
      failures: failures.rows.map(rowToLog),
      generatedAt: summary.ranAt,
    });
    await pool.query(
      `UPDATE renewal_settings SET last_failure_digest_at = NOW(), last_run_at = NOW(), updated_at = NOW()
       WHERE id = (SELECT id FROM renewal_settings ORDER BY id ASC LIMIT 1)`
    );
  } else {
    await pool.query(
      `UPDATE renewal_settings SET last_run_at = NOW(), updated_at = NOW()
       WHERE id = (SELECT id FROM renewal_settings ORDER BY id ASC LIMIT 1)`
    );
  }

  await onPersist?.();
  return { ...summary, openFailures: failures.rows.length };
}

async function fetchPolicies(pool, query = {}) {
  const { q, status, window } = query;
  const params = [];
  const where = [];
  if (status) {
    params.push(status);
    where.push(`status = $${params.length}`);
  }
  const whereClause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const result = await pool.query(
    `SELECT * FROM renewal_policies ${whereClause} ORDER BY renewal_date ASC, insured_name ASC`,
    params
  );
  const today = todayNairobi();
  let rows = result.rows.map((row) => rowToPolicy(row, today));
  if (window) {
    rows = rows.filter((p) => filterByWindow(p, window));
  }
  const search = String(q || "").trim().toLowerCase();
  if (search) {
    rows = rows.filter((p) => {
      const hay = `${p.insuredName} ${p.phoneRaw} ${p.phoneE164} ${p.email} ${p.carRegistrations} ${p.financialInterest} ${p.insurer} ${p.policyNumber}`.toLowerCase();
      return hay.includes(search);
    });
  }
  return rows;
}

function filterByWindow(policy, window) {
  const days = policy.daysUntilRenewal;
  if (days == null) return false;
  switch (window) {
    case "t60":
      return policy.status === "Active" && days >= 0 && days <= 60 && days > 30;
    case "t30":
      return policy.status === "Active" && days >= 0 && days <= 30 && days > 15;
    case "t15":
      return policy.status === "Active" && days >= 0 && days <= 15;
    case "due_today":
      return policy.status === "Active" && days === 0;
    case "overdue":
      return policy.status === "Active" && days < 0;
    case "later":
      return policy.status === "Active" && days > 60;
    case "failed":
      return true;
    default:
      return true;
  }
}

async function fetchDashboard(pool) {
  const policies = await fetchPolicies(pool, {});
  const active = policies.filter((p) => p.status === "Active");
  const kpis = {
    total_active: active.length,
    t60: active.filter((p) => isDayCount(p.daysUntilRenewal) && p.daysUntilRenewal > 30 && p.daysUntilRenewal <= 60)
      .length,
    t30: active.filter((p) => isDayCount(p.daysUntilRenewal) && p.daysUntilRenewal > 15 && p.daysUntilRenewal <= 30)
      .length,
    t15: active.filter((p) => isDayCount(p.daysUntilRenewal) && p.daysUntilRenewal >= 0 && p.daysUntilRenewal <= 15)
      .length,
    later: active.filter((p) => isDayCount(p.daysUntilRenewal) && p.daysUntilRenewal > 60).length,
    overdue: active.filter((p) => isDayCount(p.daysUntilRenewal) && p.daysUntilRenewal < 0).length,
    with_financier: active.filter((p) => p.financierNames.length > 0).length,
  };

  const failures = await pool.query(
    `SELECT l.*, p.insured_name, p.renewal_date, p.car_registrations
     FROM renewal_notification_logs l
     JOIN renewal_policies p ON p.id = l.policy_id
     WHERE l.status = 'failed' AND l.acknowledged_at IS NULL
     ORDER BY l.created_at DESC
     LIMIT 50`
  );
  kpis.open_failures = Number(
    (
      await pool.query(
        `SELECT COUNT(*)::int AS total FROM renewal_notification_logs
         WHERE status = 'failed' AND acknowledged_at IS NULL`
      )
    ).rows[0].total
  );

  const stats = await pool.query(`
    SELECT channel, status, COUNT(*)::int AS total
    FROM renewal_notification_logs
    GROUP BY channel, status
  `);

  const upcoming = active
    .filter(
      (p) => isDayCount(p.daysUntilRenewal) && p.daysUntilRenewal >= 0 && p.daysUntilRenewal <= 60
    )
    .sort((a, b) => a.daysUntilRenewal - b.daysUntilRenewal)
    .slice(0, 20);

  const settings = await getSettings(pool);

  return {
    kpis,
    upcoming,
    overdue: active
      .filter((p) => isDayCount(p.daysUntilRenewal) && p.daysUntilRenewal < 0)
      .sort((a, b) => a.daysUntilRenewal - b.daysUntilRenewal)
      .slice(0, 20),
    failures: failures.rows.map(rowToLog),
    channelStats: stats.rows.map((r) => ({
      channel: r.channel,
      status: r.status,
      total: r.total,
    })),
    settings: {
      smsEnabled: !!settings.sms_enabled,
      emailEnabled: !!settings.email_enabled,
      lastRunAt: settings.last_run_at,
      lastFailureDigestAt: settings.last_failure_digest_at,
      smtpConfigured: isSmtpConfigured(),
      smsConfigured: isSmsConfigured(),
    },
  };
}

function registerRenewalRoutes(app, deps) {
  const { pool, authRequired, requireRole, nextSerialId, onPersist, dbMode, upload } = deps;
  const editGuard = [authRequired, requirePermission(canEditRenewals)];
  const settingsGuard = [authRequired, requirePermission(canManageRenewalSettings)];

  app.get("/api/renewals/dashboard", authRequired, async (_, res) => {
    try {
      return res.json(await fetchDashboard(pool));
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: "Failed to load renewals dashboard" });
    }
  });

  app.get("/api/renewals/settings", authRequired, async (_, res) => {
    try {
      const settings = await getSettings(pool);
      return res.json({
        opsEmailList: settings.ops_email_list || "",
        smsEnabled: !!settings.sms_enabled,
        emailEnabled: !!settings.email_enabled,
        lastRunAt: settings.last_run_at,
        lastFailureDigestAt: settings.last_failure_digest_at,
        smtpConfigured: isSmtpConfigured(),
        smsConfigured: isSmsConfigured(),
      });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: "Failed to load settings" });
    }
  });

  app.put("/api/renewals/settings", ...settingsGuard, async (req, res) => {
    try {
      const body = z
        .object({
          opsEmailList: z.string().optional().default(""),
          smsEnabled: z.boolean(),
          emailEnabled: z.boolean(),
        })
        .parse(req.body);
      await pool.query(
        `UPDATE renewal_settings
         SET ops_email_list = $1, sms_enabled = $2, email_enabled = $3, updated_at = NOW()
         WHERE id = (SELECT id FROM renewal_settings ORDER BY id ASC LIMIT 1)`,
        [body.opsEmailList, body.smsEnabled, body.emailEnabled]
      );
      await onPersist?.();
      return res.json({ ok: true });
    } catch (err) {
      if (err?.issues) return res.status(400).json({ message: "Invalid settings" });
      console.error(err);
      return res.status(500).json({ message: "Failed to update settings" });
    }
  });

  app.get("/api/renewals/financiers", authRequired, async (_, res) => {
    try {
      const result = await pool.query("SELECT * FROM renewal_financiers ORDER BY name ASC");
      return res.json(result.rows.map(rowToFinancier));
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: "Failed to load financiers" });
    }
  });

  app.post("/api/renewals/financiers", ...editGuard, async (req, res) => {
    try {
      const body = z
        .object({
          name: z.string().min(1),
          phone: z.string().optional().default(""),
          email: z.string().optional().default(""),
          notes: z.string().optional().default(""),
        })
        .parse(req.body);
      const phoneE164 = normalizeKenyaPhone(body.phone);
      const id = await nextSerialId(pool, "renewal_financiers");
      const inserted = await pool.query(
        `INSERT INTO renewal_financiers (id, name, phone, phone_e164, email, notes)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [id, body.name.trim(), body.phone.trim(), phoneE164, body.email.trim(), body.notes]
      );
      await onPersist?.();
      return res.status(201).json(rowToFinancier(inserted.rows[0]));
    } catch (err) {
      if (err?.issues) return res.status(400).json({ message: "Invalid financier data" });
      console.error(err);
      return res.status(500).json({ message: "Failed to create financier" });
    }
  });

  app.put("/api/renewals/financiers/:id", ...editGuard, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const body = z
        .object({
          name: z.string().min(1),
          phone: z.string().optional().default(""),
          email: z.string().optional().default(""),
          notes: z.string().optional().default(""),
        })
        .parse(req.body);
      const phoneE164 = normalizeKenyaPhone(body.phone);
      const updated = await pool.query(
        `UPDATE renewal_financiers
         SET name = $2, phone = $3, phone_e164 = $4, email = $5, notes = $6
         WHERE id = $1 RETURNING *`,
        [id, body.name.trim(), body.phone.trim(), phoneE164, body.email.trim(), body.notes]
      );
      if (!updated.rows[0]) return res.status(404).json({ message: "Financier not found" });
      await onPersist?.();
      return res.json(rowToFinancier(updated.rows[0]));
    } catch (err) {
      if (err?.issues) return res.status(400).json({ message: "Invalid financier data" });
      console.error(err);
      return res.status(500).json({ message: "Failed to update financier" });
    }
  });

  app.delete("/api/renewals/financiers/:id", ...editGuard, async (req, res) => {
    try {
      const id = Number(req.params.id);
      await pool.query("DELETE FROM renewal_financiers WHERE id = $1", [id]);
      await onPersist?.();
      return res.json({ ok: true });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: "Failed to delete financier" });
    }
  });

  app.get("/api/renewals/notifications", authRequired, async (req, res) => {
    try {
      const { status, channel, unacked } = req.query;
      const params = [];
      const where = [];
      if (status) {
        params.push(status);
        where.push(`l.status = $${params.length}`);
      }
      if (channel) {
        params.push(channel);
        where.push(`l.channel = $${params.length}`);
      }
      if (String(unacked) === "true") {
        where.push("l.acknowledged_at IS NULL");
        where.push("l.status = 'failed'");
      }
      const whereClause = where.length ? `WHERE ${where.join(" AND ")}` : "";
      const result = await pool.query(
        `SELECT l.*, p.insured_name, p.renewal_date, p.car_registrations
         FROM renewal_notification_logs l
         JOIN renewal_policies p ON p.id = l.policy_id
         ${whereClause}
         ORDER BY l.created_at DESC
         LIMIT 500`,
        params
      );
      return res.json(result.rows.map(rowToLog));
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: "Failed to load notification log" });
    }
  });

  app.post("/api/renewals/notifications/:id/retry", ...editGuard, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const existing = await pool.query(
        `SELECT l.*, p.insured_name, p.phone_raw, p.phone_e164, p.email, p.renewal_date,
                p.car_registrations, p.financial_interest
         FROM renewal_notification_logs l
         JOIN renewal_policies p ON p.id = l.policy_id
         WHERE l.id = $1`,
        [id]
      );
      if (!existing.rows[0]) return res.status(404).json({ message: "Log entry not found" });
      const row = existing.rows[0];
      const settings = await getSettings(pool);
      const financiers = (await pool.query("SELECT * FROM renewal_financiers")).rows;
      const policy = {
        ...row,
        daysUntil: row.milestone,
      };
      const attempts = buildAttemptsForPolicy(policy, financiers, settings).filter(
        (a) => a.channel === row.channel && a.recipientType === row.recipient_type
      );
      const attempt = attempts[0] || {
        channel: row.channel,
        recipientType: row.recipient_type,
        recipientName: row.recipient_name,
        recipientAddress: row.recipient_address,
        message:
          row.channel === "sms"
            ? row.message_body
            : { subject: `Retry: ${row.insured_name}`, text: row.message_body, html: null },
        missingReason: row.recipient_address ? null : "No recipient address",
      };
      const result = await deliverAttempt(attempt, settings);
      const body =
        attempt.channel === "email" ? attempt.message?.text || row.message_body : String(attempt.message || "");
      const inserted = await insertLog(pool, nextSerialId, dbMode, {
        policy_id: row.policy_id,
        milestone: row.milestone,
        channel: row.channel,
        recipient_type: row.recipient_type,
        recipient_name: attempt.recipientName || row.recipient_name,
        recipient_address: attempt.recipientAddress || row.recipient_address,
        status: result.status,
        error_message: result.error,
        message_body: body,
        provider_ref: result.providerRef,
        sent_at: result.status === "sent" ? new Date().toISOString() : null,
      });
      if (result.status === "sent") {
        await pool.query(
          `UPDATE renewal_notification_logs SET acknowledged_at = NOW(), acknowledged_by = $2 WHERE id = $1`,
          [id, req.user.id]
        );
      }
      await onPersist?.();
      return res.json(rowToLog({ ...inserted, insured_name: row.insured_name }));
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: "Retry failed" });
    }
  });

  app.post("/api/renewals/notifications/:id/ack", ...editGuard, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const updated = await pool.query(
        `UPDATE renewal_notification_logs
         SET acknowledged_at = NOW(), acknowledged_by = $2
         WHERE id = $1 RETURNING *`,
        [id, req.user.id]
      );
      if (!updated.rows[0]) return res.status(404).json({ message: "Log entry not found" });
      await onPersist?.();
      return res.json({ ok: true });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: "Failed to acknowledge" });
    }
  });

  app.post("/api/renewals/run-reminders", ...settingsGuard, async (req, res) => {
    try {
      const force = req.body?.force === true;
      const summary = await runRenewalReminderJob(pool, { nextSerialId, dbMode, onPersist, force });
      return res.json(summary);
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: "Reminder job failed" });
    }
  });

  app.post("/api/renewals/notifications/test-email", ...settingsGuard, async (req, res) => {
    try {
      const { email } = z.object({ email: z.email() }).parse(req.body);
      const result = await sendRenewalTestEmail(email);
      return res.json(result);
    } catch (err) {
      if (err?.issues) return res.status(400).json({ message: "Invalid email" });
      console.error(err);
      return res.status(500).json({ message: "Failed to send test email" });
    }
  });

  app.post("/api/renewals/notifications/test-sms", ...settingsGuard, async (req, res) => {
    try {
      const { phone } = z.object({ phone: z.string().min(6) }).parse(req.body);
      const e164 = normalizeKenyaPhone(phone);
      if (!e164) return res.status(400).json({ message: "Could not normalize phone to +254" });
      const result = await sendRenewalTestSms(e164);
      return res.json({ ...result, phone: e164 });
    } catch (err) {
      if (err?.issues) return res.status(400).json({ message: "Invalid phone" });
      console.error(err);
      return res.status(500).json({ message: "Failed to send test SMS" });
    }
  });

  app.get("/api/renewals/export.xlsx", authRequired, async (req, res) => {
    try {
      const rows = await fetchPolicies(pool, req.query);
      const buffer = await buildRenewalsWorkbookBuffer(rows, {
        title: "ADT Policy Renewals",
        filterSummary: buildExportFilterSummary(req.query),
      });
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", 'attachment; filename="ADT-renewals.xlsx"');
      res.send(Buffer.from(buffer));
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: "Export failed" });
    }
  });

  app.get("/api/renewals/template.xlsx", authRequired, async (_, res) => {
    try {
      const buffer = await buildRenewalsTemplateBuffer();
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", 'attachment; filename="ADT-renewals-import-template.xlsx"');
      res.send(Buffer.from(buffer));
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: "Template download failed" });
    }
  });

  app.post("/api/renewals/import-excel", ...editGuard, upload.single("file"), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ message: "Missing file" });
      const parsed = importRenewalsFromExcelBuffer(req.file.buffer);
      const warnings = [];
      let inserted = 0;

      for (const [index, row] of parsed.rows.entries()) {
        if (!row.insuredName || !row.renewalDate) {
          const reasons = [];
          if (!row.insuredName) reasons.push("missing insured name");
          if (!row.renewalDate) reasons.push("invalid/missing policy renewal date");
          warnings.push({ row: index + parsed.headerRowIndex + 2, reason: reasons.join(", ") });
          continue;
        }
        const phoneE164 = normalizeKenyaPhone(row.contacts);
        if (row.contacts && !phoneE164) {
          warnings.push({
            row: index + parsed.headerRowIndex + 2,
            reason: `phone "${row.contacts}" could not be normalized to +254 — saved anyway`,
          });
        }
        const id = await nextSerialId(pool, "renewal_policies");
        await pool.query(
          `INSERT INTO renewal_policies (
            id, insured_name, phone_raw, phone_e164, email, policy_number, insurer,
            renewal_date, car_registrations, financial_interest, status, created_by
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'Active',$11)`,
          [
            id,
            row.insuredName,
            row.contacts,
            phoneE164,
            row.email,
            row.policyNumber,
            row.insurer,
            row.renewalDate,
            row.registrations,
            row.financialInterest,
            req.user.id,
          ]
        );
        inserted += 1;
      }

      await onPersist?.();
      return res.json({
        inserted,
        warnings,
        totalRows: parsed.totalRows,
        headerRowIndex: parsed.headerRowIndex + 1,
      });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: "Excel import failed" });
    }
  });

  app.delete("/api/renewals", ...settingsGuard, async (_, res) => {
    try {
      const count = await pool.query("SELECT COUNT(*)::int AS total FROM renewal_policies");
      await pool.query("DELETE FROM renewal_notification_logs");
      await pool.query("DELETE FROM renewal_policies");
      await onPersist?.();
      return res.json({ deleted: count.rows[0].total });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: "Failed to clear register" });
    }
  });

  app.get("/api/renewals", authRequired, async (req, res) => {
    try {
      const policies = await fetchPolicies(pool, req.query);
      return res.json({ policies, total: policies.length });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: "Failed to load policies" });
    }
  });

  app.get("/api/renewals/:id", authRequired, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const result = await pool.query("SELECT * FROM renewal_policies WHERE id = $1", [id]);
      if (!result.rows[0]) return res.status(404).json({ message: "Policy not found" });
      const logs = await pool.query(
        `SELECT l.*, p.insured_name FROM renewal_notification_logs l
         JOIN renewal_policies p ON p.id = l.policy_id
         WHERE l.policy_id = $1 ORDER BY l.created_at DESC`,
        [id]
      );
      return res.json({
        policy: rowToPolicy(result.rows[0]),
        notifications: logs.rows.map(rowToLog),
      });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: "Failed to load policy" });
    }
  });

  app.post("/api/renewals", ...editGuard, async (req, res) => {
    try {
      const body = policyBodySchema.parse(req.body);
      const phoneE164 = normalizeKenyaPhone(body.phoneRaw);
      const id = await nextSerialId(pool, "renewal_policies");
      const inserted = await pool.query(
        `INSERT INTO renewal_policies (
          id, insured_name, phone_raw, phone_e164, email, policy_number, insurer,
          renewal_date, car_registrations, financial_interest, status, notes, created_by
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
        RETURNING *`,
        [
          id,
          body.insuredName.trim(),
          body.phoneRaw.trim(),
          phoneE164,
          body.email.trim(),
          body.policyNumber.trim(),
          body.insurer.trim(),
          body.renewalDate,
          body.carRegistrations.trim(),
          body.financialInterest.trim(),
          body.status,
          body.notes.trim(),
          req.user.id,
        ]
      );
      await onPersist?.();
      return res.status(201).json(rowToPolicy(inserted.rows[0]));
    } catch (err) {
      if (err?.issues) return res.status(400).json({ message: "Invalid policy data" });
      console.error(err);
      return res.status(500).json({ message: "Failed to create policy" });
    }
  });

  app.put("/api/renewals/:id", ...editGuard, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const body = policyBodySchema.parse(req.body);
      const phoneE164 = normalizeKenyaPhone(body.phoneRaw);
      const updated = await pool.query(
        `UPDATE renewal_policies SET
          insured_name = $2, phone_raw = $3, phone_e164 = $4, email = $5, policy_number = $6,
          insurer = $7, renewal_date = $8, car_registrations = $9, financial_interest = $10,
          status = $11, notes = $12, updated_at = NOW()
         WHERE id = $1 RETURNING *`,
        [
          id,
          body.insuredName.trim(),
          body.phoneRaw.trim(),
          phoneE164,
          body.email.trim(),
          body.policyNumber.trim(),
          body.insurer.trim(),
          body.renewalDate,
          body.carRegistrations.trim(),
          body.financialInterest.trim(),
          body.status,
          body.notes.trim(),
        ]
      );
      if (!updated.rows[0]) return res.status(404).json({ message: "Policy not found" });
      await onPersist?.();
      return res.json(rowToPolicy(updated.rows[0]));
    } catch (err) {
      if (err?.issues) return res.status(400).json({ message: "Invalid policy data" });
      console.error(err);
      return res.status(500).json({ message: "Failed to update policy" });
    }
  });

  app.delete("/api/renewals/:id", ...editGuard, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const existing = await pool.query("SELECT id FROM renewal_policies WHERE id = $1", [id]);
      if (!existing.rows[0]) return res.status(404).json({ message: "Policy not found" });
      await pool.query("DELETE FROM renewal_policies WHERE id = $1", [id]);
      await onPersist?.();
      return res.json({ ok: true });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: "Failed to delete policy" });
    }
  });
}

module.exports = {
  POLICY_STATUSES,
  MILESTONES,
  POLICY_SNAPSHOT_COLUMNS,
  FINANCIER_SNAPSHOT_COLUMNS,
  LOG_SNAPSHOT_COLUMNS,
  SETTINGS_SNAPSHOT_COLUMNS,
  ensureRenewalsTables,
  seedRenewalsIfEmpty,
  registerRenewalRoutes,
  runRenewalReminderJob,
  normalizeKenyaPhone,
  parseFinancierNames,
  hasFinancialInterest,
  daysUntilRenewal,
  toDateOnly,
  todayNairobi,
};
