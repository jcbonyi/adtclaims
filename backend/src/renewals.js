const fs = require("fs/promises");
const path = require("path");
const { z } = require("zod");
const { canEditRenewals, canManageRenewalSettings, requirePermission } = require("./permissions");
const { importRenewalsFromExcelBuffer } = require("./renewalImport");
const {
  buildRenewalsWorkbookBuffer,
  buildRenewalsTemplateBuffer,
  buildExportFilterSummary,
} = require("./renewalExport");
const { isCronAuthorized } = require("./cronAuth");
const {
  sendEmail,
  sendSms,
  sendWhatsApp,
  sendRenewalFailureDigest,
  sendRenewalTestEmail,
  sendRenewalTestSms,
  sendRenewalTestWhatsApp,
  renewalOpsRecipients,
  isSmtpConfigured,
  isSmsConfigured,
  isWhatsAppConfigured,
} = require("./notificationService");
const {
  DEFAULT_SMS_TEMPLATE,
  DEFAULT_WHATSAPP_TEMPLATE,
  DEFAULT_EMAIL_SUBJECT,
  DEFAULT_EMAIL_BODY,
  DEFAULT_FINANCIER_SMS,
  PIPELINE_STAGES,
  FOLLOW_UP_METHODS,
  MILESTONES,
  applyTemplate,
  templateVars,
  inQuietHours,
  addMonths,
  policyMatchKey,
  parseInboundIntent,
  sleep,
  queryAfricasTalkingMessage,
} = require("./renewalOps");
const POLICY_STATUSES = ["Active", "Renewed", "Lapsed", "Cancelled"];
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
  "pipeline_stage",
  "premium",
  "assigned_officer_id",
  "relationship_manager",
  "sms_opt_out",
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
  "delivery_status",
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
  "whatsapp_enabled",
  "sms_template",
  "whatsapp_template",
  "email_subject_template",
  "email_body_template",
  "financier_sms_template",
  "callback_number",
  "quiet_start_hour",
  "quiet_end_hour",
  "sms_per_minute",
  "last_run_at",
  "last_failure_digest_at",
  "updated_at",
];

const FOLLOW_UP_SNAPSHOT_COLUMNS = [
  "id",
  "policy_id",
  "follow_up_date",
  "officer_id",
  "method",
  "outcome",
  "remarks",
  "created_at",
];

const ATTACHMENT_SNAPSHOT_COLUMNS = [
  "id",
  "policy_id",
  "stored_name",
  "original_name",
  "mime_type",
  "size_bytes",
  "uploaded_by",
  "created_at",
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
  pipelineStage: z.enum(PIPELINE_STAGES).optional().default("Not contacted"),
  premium: z.number().nullable().optional(),
  assignedOfficerId: z.number().nullable().optional(),
  relationshipManager: z.string().optional().default(""),
  smsOptOut: z.boolean().optional().default(false),
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
    pipelineStage: row.pipeline_stage || "Not contacted",
    premium: row.premium != null ? Number(row.premium) : null,
    assignedOfficerId: row.assigned_officer_id || null,
    officerName: row.officer_name || extrasOfficerName(row) || null,
    relationshipManager: row.relationship_manager || "",
    smsOptOut: !!row.sms_opt_out,
    financierNeedsContact: false,
    daysUntilRenewal: days,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function extrasOfficerName(row) {
  return row.officer_name || null;
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
    deliveryStatus: row.delivery_status || row.status || "",
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
    needsContact: !row.phone_e164 && !row.email,
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
    ALTER TABLE renewal_policies
      ADD COLUMN IF NOT EXISTS pipeline_stage TEXT NOT NULL DEFAULT 'Not contacted';
  `);
  await pool.query(`ALTER TABLE renewal_policies ADD COLUMN IF NOT EXISTS premium NUMERIC(14, 2) NULL;`);
  await pool.query(`ALTER TABLE renewal_policies ADD COLUMN IF NOT EXISTS assigned_officer_id INTEGER NULL;`);
  await pool.query(`ALTER TABLE renewal_policies ADD COLUMN IF NOT EXISTS relationship_manager TEXT NOT NULL DEFAULT '';`);
  await pool.query(`ALTER TABLE renewal_policies ADD COLUMN IF NOT EXISTS sms_opt_out BOOLEAN NOT NULL DEFAULT FALSE;`);
  await pool.query(`ALTER TABLE renewal_notification_logs ADD COLUMN IF NOT EXISTS delivery_status TEXT NULL;`);
  await pool.query(`ALTER TABLE renewal_settings ADD COLUMN IF NOT EXISTS whatsapp_enabled BOOLEAN NOT NULL DEFAULT FALSE;`);
  await pool.query(`ALTER TABLE renewal_settings ADD COLUMN IF NOT EXISTS sms_template TEXT NOT NULL DEFAULT '';`);
  await pool.query(`ALTER TABLE renewal_settings ADD COLUMN IF NOT EXISTS whatsapp_template TEXT NOT NULL DEFAULT '';`);
  await pool.query(`ALTER TABLE renewal_settings ADD COLUMN IF NOT EXISTS email_subject_template TEXT NOT NULL DEFAULT '';`);
  await pool.query(`ALTER TABLE renewal_settings ADD COLUMN IF NOT EXISTS email_body_template TEXT NOT NULL DEFAULT '';`);
  await pool.query(`ALTER TABLE renewal_settings ADD COLUMN IF NOT EXISTS financier_sms_template TEXT NOT NULL DEFAULT '';`);
  await pool.query(`ALTER TABLE renewal_settings ADD COLUMN IF NOT EXISTS callback_number TEXT NOT NULL DEFAULT '';`);
  await pool.query(`ALTER TABLE renewal_settings ADD COLUMN IF NOT EXISTS quiet_start_hour INTEGER NOT NULL DEFAULT 8;`);
  await pool.query(`ALTER TABLE renewal_settings ADD COLUMN IF NOT EXISTS quiet_end_hour INTEGER NOT NULL DEFAULT 18;`);
  await pool.query(`ALTER TABLE renewal_settings ADD COLUMN IF NOT EXISTS sms_per_minute INTEGER NOT NULL DEFAULT 30;`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS renewal_follow_ups (
      id SERIAL PRIMARY KEY,
      policy_id INTEGER NOT NULL REFERENCES renewal_policies(id) ON DELETE CASCADE,
      follow_up_date DATE NOT NULL DEFAULT CURRENT_DATE,
      officer_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      method TEXT NOT NULL DEFAULT 'Call',
      outcome TEXT NOT NULL DEFAULT '',
      remarks TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS renewal_attachments (
      id SERIAL PRIMARY KEY,
      policy_id INTEGER NOT NULL REFERENCES renewal_policies(id) ON DELETE CASCADE,
      stored_name TEXT NOT NULL,
      original_name TEXT NOT NULL,
      mime_type TEXT NOT NULL DEFAULT '',
      size_bytes INTEGER NOT NULL DEFAULT 0,
      uploaded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
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
  const row = result.rows[0] || {};
  return {
    id: row.id || 1,
    ops_email_list: row.ops_email_list || "",
    sms_enabled: row.sms_enabled !== false,
    email_enabled: row.email_enabled !== false,
    whatsapp_enabled: !!row.whatsapp_enabled,
    sms_template: row.sms_template || DEFAULT_SMS_TEMPLATE,
    whatsapp_template: row.whatsapp_template || DEFAULT_WHATSAPP_TEMPLATE,
    email_subject_template: row.email_subject_template || DEFAULT_EMAIL_SUBJECT,
    email_body_template: row.email_body_template || DEFAULT_EMAIL_BODY,
    financier_sms_template: row.financier_sms_template || DEFAULT_FINANCIER_SMS,
    callback_number: row.callback_number || process.env.RENEWAL_CALLBACK_NUMBER || "",
    quiet_start_hour: row.quiet_start_hour ?? 8,
    quiet_end_hour: row.quiet_end_hour ?? 18,
    sms_per_minute: row.sms_per_minute ?? 30,
    last_run_at: row.last_run_at || null,
    last_failure_digest_at: row.last_failure_digest_at || null,
  };
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

async function autoCreateFinanciers(pool, nextSerialId, financialInterest) {
  const financiers = (await pool.query("SELECT * FROM renewal_financiers")).rows;
  for (const name of parseFinancierNames(financialInterest)) {
    if (matchFinancier(financiers, name)) continue;
    const fid = await nextSerialId(pool, "renewal_financiers");
    await pool.query(
      `INSERT INTO renewal_financiers (id, name, phone, phone_e164, email, notes)
       VALUES ($1,$2,'','','',$3)`,
      [fid, name, "Auto-created — add phone or email so they can be notified."]
    );
    financiers.push({ name });
  }
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
    row.delivery_status || row.status || null,
    row.sent_at || null,
  ];
  if (dbMode === "in-memory") {
    const id = await nextSerialId(pool, "renewal_notification_logs");
    const inserted = await pool.query(
      `INSERT INTO renewal_notification_logs (
        id, policy_id, milestone, channel, recipient_type, recipient_name, recipient_address,
        status, error_message, message_body, provider_ref, delivery_status, sent_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
      RETURNING *`,
      [id, ...values]
    );
    return inserted.rows[0];
  }
  const inserted = await pool.query(
    `INSERT INTO renewal_notification_logs (
      policy_id, milestone, channel, recipient_type, recipient_name, recipient_address,
      status, error_message, message_body, provider_ref, delivery_status, sent_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
    RETURNING *`,
    values
  );
  return inserted.rows[0];
}

function buildAttemptsForPolicy(policy, financiers, settings) {
  const attempts = [];
  const vars = templateVars({
    insuredName: policy.insured_name,
    registrations: policy.car_registrations,
    renewalDate: policy.renewal_date,
    daysUntil: policy.daysUntil,
    financierName: parseFinancierNames(policy.financial_interest).join(", "),
    phone: policy.phone_e164 || policy.phone_raw,
    insurer: policy.insurer,
    policyNumber: policy.policy_number,
    callbackNumber: settings.callback_number,
  });
  const optedOut = !!policy.sms_opt_out;

  if (settings.sms_enabled) {
    attempts.push({
      channel: "sms",
      recipientType: "client",
      recipientName: policy.insured_name,
      recipientAddress: policy.phone_e164 || "",
      message: applyTemplate(settings.sms_template || DEFAULT_SMS_TEMPLATE, vars),
      missingReason: optedOut
        ? "Client opted out of SMS"
        : policy.phone_e164
          ? null
          : "Client phone missing or could not be normalized to +254",
    });
  }
  if (settings.whatsapp_enabled) {
    attempts.push({
      channel: "whatsapp",
      recipientType: "client",
      recipientName: policy.insured_name,
      recipientAddress: policy.phone_e164 || "",
      message: applyTemplate(settings.whatsapp_template || DEFAULT_WHATSAPP_TEMPLATE, vars),
      missingReason: optedOut
        ? "Client opted out of SMS/WhatsApp"
        : policy.phone_e164
          ? null
          : "Client phone missing for WhatsApp",
    });
  }
  if (settings.email_enabled && policy.email) {
    const subject = applyTemplate(settings.email_subject_template || DEFAULT_EMAIL_SUBJECT, vars);
    const text = applyTemplate(settings.email_body_template || DEFAULT_EMAIL_BODY, vars);
    attempts.push({
      channel: "email",
      recipientType: "client",
      recipientName: policy.insured_name,
      recipientAddress: policy.email,
      message: { subject, text, html: text.replace(/\n/g, "<br>") },
      missingReason: null,
    });
  }

  const names = parseFinancierNames(policy.financial_interest);
  for (const name of names) {
    const match = matchFinancier(financiers, name);
    const phone = match?.phone_e164 || "";
    const email = match?.email || "";
    const fVars = { ...vars, financierName: name };
    if (!phone && !email) {
      attempts.push({
        channel: settings.sms_enabled ? "sms" : "email",
        recipientType: "financier",
        recipientName: name,
        recipientAddress: "",
        message: applyTemplate(settings.financier_sms_template || DEFAULT_FINANCIER_SMS, fVars),
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
        message: applyTemplate(settings.financier_sms_template || DEFAULT_FINANCIER_SMS, fVars),
        missingReason: null,
      });
    }
    if (settings.whatsapp_enabled && phone) {
      attempts.push({
        channel: "whatsapp",
        recipientType: "financier",
        recipientName: name,
        recipientAddress: phone,
        message: applyTemplate(settings.whatsapp_template || DEFAULT_WHATSAPP_TEMPLATE, fVars),
        missingReason: null,
      });
    }
    if (settings.email_enabled && email) {
      const subject = applyTemplate(settings.email_subject_template || DEFAULT_EMAIL_SUBJECT, fVars);
      const text = applyTemplate(settings.email_body_template || DEFAULT_EMAIL_BODY, fVars);
      attempts.push({
        channel: "email",
        recipientType: "financier",
        recipientName: name,
        recipientAddress: email,
        message: { subject, text, html: text.replace(/\n/g, "<br>") },
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
  if (attempt.channel === "whatsapp" && !settings.whatsapp_enabled) {
    return { status: "skipped", error: "WhatsApp disabled in settings", providerRef: null };
  }
  if (attempt.missingReason) {
    return { status: "failed", error: attempt.missingReason, providerRef: null, deliveryStatus: "failed" };
  }

  if (attempt.channel === "sms") {
    const result = await sendSms({ to: attempt.recipientAddress, message: attempt.message });
    if (result.sent) return { status: "sent", error: null, providerRef: result.providerRef, deliveryStatus: "sent" };
    return {
      status: "failed",
      error: result.reason || "SMS send failed",
      providerRef: result.providerRef || null,
      deliveryStatus: "failed",
    };
  }
  if (attempt.channel === "whatsapp") {
    const result = await sendWhatsApp({ to: attempt.recipientAddress, message: attempt.message });
    if (result.sent) return { status: "sent", error: null, providerRef: result.providerRef, deliveryStatus: "sent" };
    return {
      status: "failed",
      error: result.reason || "WhatsApp send failed",
      providerRef: result.providerRef || null,
      deliveryStatus: "failed",
    };
  }

  const { subject, text, html } = attempt.message;
  try {
    const result = await sendEmail({ to: attempt.recipientAddress, subject, text, html });
    if (result.sent) return { status: "sent", error: null, providerRef: null, deliveryStatus: "sent" };
    return { status: "failed", error: result.reason || "Email send failed", providerRef: null, deliveryStatus: "failed" };
  } catch (err) {
    return { status: "failed", error: err.message || "Email send failed", providerRef: null, deliveryStatus: "failed" };
  }
}

async function runRenewalReminderJob(pool, { nextSerialId, dbMode, onPersist, force = false } = {}) {
  const settings = await getSettings(pool);
  if (!force && !inQuietHours(settings)) {
    return {
      ranAt: new Date().toISOString(),
      skipped: true,
      reason: `Outside quiet hours (${settings.quiet_start_hour}:00–${settings.quiet_end_hour}:00 EAT). Use force to override.`,
      duePolicies: 0,
      attempted: 0,
      sent: 0,
      failed: 0,
      alreadySent: 0,
    };
  }
  const today = todayNairobi();
  const policies = await pool.query(
    `SELECT * FROM renewal_policies WHERE status = 'Active'
     AND COALESCE(pipeline_stage, 'Not contacted') NOT IN ('Bound', 'Lost')`
  );
  const financiersRes = await pool.query("SELECT * FROM renewal_financiers");
  const financiers = financiersRes.rows;
  const delayMs = Math.max(0, Math.floor(60000 / Math.max(1, Number(settings.sms_per_minute || 30))));

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
        delivery_status: result.deliveryStatus || result.status,
        sent_at: result.status === "sent" ? new Date().toISOString() : null,
      });
      if (attempt.channel === "email") {
        await sleep(result.status === "sent" ? 700 : 2000);
      } else if ((attempt.channel === "sms" || attempt.channel === "whatsapp") && delayMs && result.status === "sent") {
        await sleep(delayMs);
      }
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
  const officerEmails = await pool.query(
    `SELECT DISTINCT u.email
     FROM renewal_notification_logs l
     JOIN renewal_policies p ON p.id = l.policy_id
     JOIN users u ON u.id = p.assigned_officer_id
     WHERE l.status = 'failed' AND l.acknowledged_at IS NULL AND u.email IS NOT NULL AND u.email <> ''`
  );
  const digestTo = [...new Set([...ops, ...officerEmails.rows.map((r) => r.email)])];
  if (failures.rows.length && digestTo.length) {
    await sendRenewalFailureDigest({
      to: digestTo,
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
  const { q, status, window, pipeline, officerId } = query;
  const params = [];
  const where = [];
  if (status) {
    params.push(status);
    where.push(`p.status = $${params.length}`);
  }
  if (pipeline) {
    params.push(pipeline);
    where.push(`COALESCE(p.pipeline_stage, 'Not contacted') = $${params.length}`);
  }
  if (officerId) {
    params.push(Number(officerId));
    where.push(`p.assigned_officer_id = $${params.length}`);
  }
  const whereClause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const result = await pool.query(
    `SELECT p.*, u.name AS officer_name
     FROM renewal_policies p
     LEFT JOIN users u ON u.id = p.assigned_officer_id
     ${whereClause}
     ORDER BY p.renewal_date ASC, p.insured_name ASC`,
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
      const hay = `${p.insuredName} ${p.phoneRaw} ${p.phoneE164} ${p.email} ${p.carRegistrations} ${p.financialInterest} ${p.insurer} ${p.policyNumber} ${p.relationshipManager} ${p.officerName || ""}`.toLowerCase();
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
    quoted: policies.filter((p) => p.pipelineStage === "Quoted").length,
    awaiting_payment: policies.filter((p) => p.pipelineStage === "Awaiting payment").length,
    bound: policies.filter((p) => p.pipelineStage === "Bound").length,
    lost: policies.filter((p) => p.pipelineStage === "Lost").length,
    premium_at_risk: Number(
      active
        .filter((p) => p.pipelineStage !== "Bound" && p.pipelineStage !== "Lost")
        .reduce((sum, p) => sum + (Number(p.premium) || 0), 0)
        .toFixed(2)
    ),
  };
  kpis.pipeline = PIPELINE_STAGES.map((label) => ({
    label,
    value: policies.filter((p) => p.pipelineStage === label).length,
  }));

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
      whatsappEnabled: !!settings.whatsapp_enabled,
      lastRunAt: settings.last_run_at,
      lastFailureDigestAt: settings.last_failure_digest_at,
      smtpConfigured: isSmtpConfigured(),
      smsConfigured: isSmsConfigured(),
      whatsappConfigured: isWhatsAppConfigured(),
    },
  };
}

function webhookAuthorized(req) {
  const secret = process.env.RENEWAL_WEBHOOK_SECRET;
  if (!secret) return true;
  return req.query.secret === secret || req.headers["x-webhook-secret"] === secret;
}

function attachmentDir() {
  return path.join(__dirname, "..", ".persist", "renewal-files");
}

async function fetchClient360(pool, query) {
  const like = `%${query}%`;
  const [claims, quotations, valuations, renewals] = await Promise.all([
    pool
      .query(
        `SELECT id, insured_name, registration_number, claim_status, insurer, accident_date
         FROM claims WHERE insured_name ILIKE $1 ORDER BY id DESC LIMIT 20`,
        [like]
      )
      .catch(() => ({ rows: [] })),
    pool
      .query(
        `SELECT id, client_name, status, insurer, policy_number, premium, renewal_date
         FROM quotations WHERE client_name ILIKE $1 ORDER BY id DESC LIMIT 20`,
        [like]
      )
      .catch(() => ({ rows: [] })),
    pool
      .query(
        `SELECT id, insured_name, vehicle_registration, status, insurance_company, policy_renewal_date
         FROM valuations WHERE insured_name ILIKE $1 ORDER BY id DESC LIMIT 20`,
        [like]
      )
      .catch(() => ({ rows: [] })),
    pool.query(
      `SELECT * FROM renewal_policies WHERE insured_name ILIKE $1 ORDER BY renewal_date DESC LIMIT 20`,
      [like]
    ),
  ]);
  return {
    query,
    claims: claims.rows,
    quotations: quotations.rows,
    valuations: valuations.rows,
    renewals: renewals.rows.map((row) => rowToPolicy(row)),
  };
}

async function buildMonthlyReport(pool, query = {}) {
  const now = new Date();
  const year = Number(query.year) || now.getFullYear();
  const month = Number(query.month) || now.getMonth() + 1;
  const start = `${year}-${String(month).padStart(2, "0")}-01`;
  const endDate = new Date(Date.UTC(year, month, 0));
  const end = `${year}-${String(month).padStart(2, "0")}-${String(endDate.getUTCDate()).padStart(2, "0")}`;
  const policies = (await fetchPolicies(pool, {})).filter((p) => {
    const d = p.renewalDate;
    return d && d >= start && d <= end;
  });
  const group = (keyFn) => {
    const map = {};
    for (const p of policies) {
      const key = keyFn(p) || "Unassigned";
      if (!map[key]) {
        map[key] = { label: key, total: 0, renewed: 0, lapsed: 0, open: 0, bound: 0, lost: 0, premium: 0 };
      }
      map[key].total += 1;
      if (p.status === "Renewed" || p.pipelineStage === "Bound") map[key].renewed += 1;
      else if (p.status === "Lapsed" || p.pipelineStage === "Lost") map[key].lapsed += 1;
      else map[key].open += 1;
      if (p.pipelineStage === "Bound") map[key].bound += 1;
      if (p.pipelineStage === "Lost") map[key].lost += 1;
      map[key].premium += Number(p.premium) || 0;
    }
    return Object.values(map).sort((a, b) => b.total - a.total);
  };
  const counts = {
    total: policies.length,
    renewed: policies.filter((p) => p.status === "Renewed" || p.pipelineStage === "Bound").length,
    lapsed: policies.filter((p) => p.status === "Lapsed" || p.pipelineStage === "Lost").length,
    open: policies.filter((p) => p.status === "Active" && p.pipelineStage !== "Bound" && p.pipelineStage !== "Lost")
      .length,
  };
  const conversionDenom = counts.renewed + counts.lapsed;
  return {
    year,
    month,
    from: start,
    to: end,
    counts,
    conversionPct: conversionDenom ? Math.round((counts.renewed / conversionDenom) * 1000) / 10 : 0,
    premiumAtRisk: policies
      .filter((p) => p.status === "Active" && p.pipelineStage !== "Bound" && p.pipelineStage !== "Lost")
      .reduce((s, p) => s + (Number(p.premium) || 0), 0),
    byInsurer: group((p) => p.insurer),
    byOfficer: group((p) => p.officerName || p.relationshipManager),
    policies,
  };
}

async function pollDeliveryReports(pool, { onPersist } = {}) {
  const pending = await pool.query(
    `SELECT id, provider_ref FROM renewal_notification_logs
     WHERE channel = 'sms' AND status = 'sent' AND provider_ref IS NOT NULL
       AND COALESCE(delivery_status, 'sent') IN ('sent', 'queued')
     ORDER BY created_at DESC LIMIT 80`
  );
  let updated = 0;
  for (const row of pending.rows) {
    const result = await queryAfricasTalkingMessage(row.provider_ref);
    if (result.status && result.status !== "unknown") {
      await pool.query(`UPDATE renewal_notification_logs SET delivery_status = $2 WHERE id = $1`, [
        row.id,
        result.status,
      ]);
      updated += 1;
    }
  }
  await onPersist?.();
  return { checked: pending.rows.length, updated };
}

async function handleInboundSms(pool, { from, text, nextSerialId, onPersist }) {
  const e164 = normalizeKenyaPhone(from) || String(from || "").replace(/\s/g, "");
  const parsed = parseInboundIntent(text);
  const policyRes = await pool.query(
    `SELECT * FROM renewal_policies
     WHERE phone_e164 = $1 OR phone_raw = $2
     ORDER BY renewal_date DESC LIMIT 1`,
    [e164, String(from || "")]
  );
  const policy = policyRes.rows[0];
  if (!policy) return { ok: true, matched: false, intent: parsed.intent };

  if (parsed.intent === "stop") {
    await pool.query(`UPDATE renewal_policies SET sms_opt_out = TRUE, updated_at = NOW() WHERE id = $1`, [policy.id]);
  }
  if (parsed.intent === "start") {
    await pool.query(`UPDATE renewal_policies SET sms_opt_out = FALSE, updated_at = NOW() WHERE id = $1`, [policy.id]);
  }
  if (parsed.intent === "renewed") {
    await pool.query(
      `UPDATE renewal_policies SET status = 'Renewed', pipeline_stage = 'Bound', updated_at = NOW() WHERE id = $1`,
      [policy.id]
    );
  }
  const id = await nextSerialId(pool, "renewal_follow_ups");
  await pool.query(
    `INSERT INTO renewal_follow_ups (id, policy_id, follow_up_date, method, outcome, remarks)
     VALUES ($1,$2,CURRENT_DATE,'SMS',$3,$4)`,
    [id, policy.id, parsed.intent, parsed.raw]
  );
  await onPersist?.();
  return { ok: true, matched: true, policyId: policy.id, intent: parsed.intent };
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
        whatsappEnabled: !!settings.whatsapp_enabled,
        smsTemplate: settings.sms_template,
        whatsappTemplate: settings.whatsapp_template,
        emailSubjectTemplate: settings.email_subject_template,
        emailBodyTemplate: settings.email_body_template,
        financierSmsTemplate: settings.financier_sms_template,
        callbackNumber: settings.callback_number || "",
        quietStartHour: settings.quiet_start_hour,
        quietEndHour: settings.quiet_end_hour,
        smsPerMinute: settings.sms_per_minute,
        lastRunAt: settings.last_run_at,
        lastFailureDigestAt: settings.last_failure_digest_at,
        smtpConfigured: isSmtpConfigured(),
        smsConfigured: isSmsConfigured(),
        whatsappConfigured: isWhatsAppConfigured(),
        defaultTemplates: {
          sms: DEFAULT_SMS_TEMPLATE,
          whatsapp: DEFAULT_WHATSAPP_TEMPLATE,
          emailSubject: DEFAULT_EMAIL_SUBJECT,
          emailBody: DEFAULT_EMAIL_BODY,
          financierSms: DEFAULT_FINANCIER_SMS,
        },
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
          whatsappEnabled: z.boolean().optional().default(false),
          smsTemplate: z.string().optional().default(""),
          whatsappTemplate: z.string().optional().default(""),
          emailSubjectTemplate: z.string().optional().default(""),
          emailBodyTemplate: z.string().optional().default(""),
          financierSmsTemplate: z.string().optional().default(""),
          callbackNumber: z.string().optional().default(""),
          quietStartHour: z.number().int().min(0).max(23).optional().default(8),
          quietEndHour: z.number().int().min(0).max(23).optional().default(18),
          smsPerMinute: z.number().int().min(1).max(300).optional().default(30),
        })
        .parse(req.body);
      await pool.query(
        `UPDATE renewal_settings SET
          ops_email_list = $1, sms_enabled = $2, email_enabled = $3, whatsapp_enabled = $4,
          sms_template = $5, whatsapp_template = $6, email_subject_template = $7,
          email_body_template = $8, financier_sms_template = $9, callback_number = $10,
          quiet_start_hour = $11, quiet_end_hour = $12, sms_per_minute = $13, updated_at = NOW()
         WHERE id = (SELECT id FROM renewal_settings ORDER BY id ASC LIMIT 1)`,
        [
          body.opsEmailList,
          body.smsEnabled,
          body.emailEnabled,
          body.whatsappEnabled,
          body.smsTemplate || DEFAULT_SMS_TEMPLATE,
          body.whatsappTemplate || DEFAULT_WHATSAPP_TEMPLATE,
          body.emailSubjectTemplate || DEFAULT_EMAIL_SUBJECT,
          body.emailBodyTemplate || DEFAULT_EMAIL_BODY,
          body.financierSmsTemplate || DEFAULT_FINANCIER_SMS,
          body.callbackNumber,
          body.quietStartHour,
          body.quietEndHour,
          body.smsPerMinute,
        ]
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

  app.get("/api/renewals/cron/reminders", async (req, res) => {
    if (!isCronAuthorized(req)) {
      return res.status(401).json({ message: "Unauthorized cron request" });
    }
    try {
      const summary = await runRenewalReminderJob(pool, { nextSerialId, dbMode, onPersist, force: false });
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

  app.post("/api/renewals/notifications/test-whatsapp", ...settingsGuard, async (req, res) => {
    try {
      const { phone } = z.object({ phone: z.string().min(6) }).parse(req.body);
      const e164 = normalizeKenyaPhone(phone);
      if (!e164) return res.status(400).json({ message: "Could not normalize phone to +254" });
      const result = await sendRenewalTestWhatsApp(e164);
      return res.json({ ...result, phone: e164 });
    } catch (err) {
      if (err?.issues) return res.status(400).json({ message: "Invalid phone" });
      console.error(err);
      return res.status(500).json({ message: "Failed to send test WhatsApp" });
    }
  });

  app.post("/api/renewals/poll-delivery", ...settingsGuard, async (_, res) => {
    try {
      const summary = await pollDeliveryReports(pool, { onPersist });
      return res.json(summary);
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: "Delivery poll failed" });
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
      const preview = String(req.query.preview || req.body?.preview || "") === "true";
      const parsed = importRenewalsFromExcelBuffer(req.file.buffer);
      const existing = await pool.query("SELECT id, insured_name, car_registrations, renewal_date FROM renewal_policies");
      const byKey = new Map();
      for (const row of existing.rows) {
        byKey.set(
          policyMatchKey({
            insuredName: row.insured_name,
            carRegistrations: row.car_registrations,
            renewalDate: toDateOnly(row.renewal_date),
          }),
          row
        );
      }
      const financiers = (await pool.query("SELECT * FROM renewal_financiers")).rows;
      const warnings = [];
      const newFinanciers = new Set();
      let wouldInsert = 0;
      let wouldUpdate = 0;
      let missingEmail = 0;
      const dates = [];

      const prepared = [];
      for (const [index, row] of parsed.rows.entries()) {
        const excelRow = index + parsed.headerRowIndex + 2;
        if (!row.insuredName || !row.renewalDate) {
          const reasons = [];
          if (!row.insuredName) reasons.push("missing insured name");
          if (!row.renewalDate) reasons.push("invalid/missing policy renewal date");
          warnings.push({ row: excelRow, reason: reasons.join(", ") });
          continue;
        }
        const phoneE164 = normalizeKenyaPhone(row.contacts);
        if (row.contacts && !phoneE164) {
          warnings.push({ row: excelRow, reason: `phone "${row.contacts}" could not be normalized to +254` });
        }
        if (!row.email) {
          missingEmail += 1;
          warnings.push({ row: excelRow, reason: "email missing — SMS/WhatsApp only until an email is added" });
        }
        dates.push(row.renewalDate);
        const key = policyMatchKey({
          insuredName: row.insuredName,
          carRegistrations: row.registrations,
          renewalDate: row.renewalDate,
        });
        const match = byKey.get(key);
        if (match) wouldUpdate += 1;
        else wouldInsert += 1;
        for (const name of parseFinancierNames(row.financialInterest)) {
          if (!matchFinancier(financiers, name) && ![...newFinanciers].some((n) => n.toLowerCase() === name.toLowerCase())) {
            newFinanciers.add(name);
          }
        }
        prepared.push({ row, phoneE164, match, excelRow });
      }

      const dateRange =
        dates.length > 0
          ? { from: dates.slice().sort()[0], to: dates.slice().sort()[dates.length - 1] }
          : null;

      if (preview) {
        return res.json({
          preview: true,
          totalRows: parsed.totalRows,
          headerRowIndex: parsed.headerRowIndex + 1,
          wouldInsert,
          wouldUpdate,
          skipped: warnings.filter((w) => w.reason.includes("missing")).length,
          missingEmail,
          newFinanciers: [...newFinanciers],
          dateRange,
          warnings: warnings.slice(0, 50),
        });
      }

      for (const name of newFinanciers) {
        const fid = await nextSerialId(pool, "renewal_financiers");
        await pool.query(
          `INSERT INTO renewal_financiers (id, name, phone, phone_e164, email, notes)
           VALUES ($1,$2,'','','',$3)`,
          [fid, name, "Auto-created from import — add phone or email so they can be notified."]
        );
      }

      let inserted = 0;
      let updated = 0;
      for (const item of prepared) {
        const { row, phoneE164, match } = item;
        if (match) {
          await pool.query(
            `UPDATE renewal_policies SET
              phone_raw = $2, phone_e164 = $3, email = COALESCE(NULLIF($4, ''), email),
              policy_number = COALESCE(NULLIF($5, ''), policy_number),
              insurer = COALESCE(NULLIF($6, ''), insurer),
              car_registrations = $7, financial_interest = $8,
              premium = COALESCE($9, premium),
              relationship_manager = COALESCE(NULLIF($10, ''), relationship_manager),
              updated_at = NOW()
             WHERE id = $1`,
            [
              match.id,
              row.contacts,
              phoneE164,
              row.email,
              row.policyNumber,
              row.insurer,
              row.registrations,
              row.financialInterest,
              row.premium,
              row.relationshipManager,
            ]
          );
          updated += 1;
        } else {
          const id = await nextSerialId(pool, "renewal_policies");
          await pool.query(
            `INSERT INTO renewal_policies (
              id, insured_name, phone_raw, phone_e164, email, policy_number, insurer,
              renewal_date, car_registrations, financial_interest, status, premium,
              relationship_manager, created_by
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'Active',$11,$12,$13)`,
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
              row.premium,
              row.relationshipManager || "",
              req.user.id,
            ]
          );
          inserted += 1;
        }
      }

      await onPersist?.();
      return res.json({
        inserted,
        updated,
        warnings,
        totalRows: parsed.totalRows,
        headerRowIndex: parsed.headerRowIndex + 1,
        newFinanciers: [...newFinanciers],
        missingEmail,
        dateRange,
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

  app.get("/api/renewals/officers", authRequired, async (_, res) => {
    try {
      const result = await pool.query(
        `SELECT id, name, email, role FROM users WHERE is_active = TRUE ORDER BY name ASC`
      );
      return res.json(result.rows);
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: "Failed to load officers" });
    }
  });

  app.get("/api/renewals/client-360", authRequired, async (req, res) => {
    try {
      const q = String(req.query.q || "").trim();
      if (q.length < 2) return res.status(400).json({ message: "Enter at least 2 characters" });
      return res.json(await fetchClient360(pool, q));
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: "Failed to load client 360" });
    }
  });

  app.get("/api/renewals/reports/monthly", authRequired, async (req, res) => {
    try {
      return res.json(await buildMonthlyReport(pool, req.query));
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: "Failed to load report" });
    }
  });

  app.get("/api/renewals/reports/monthly.xlsx", authRequired, async (req, res) => {
    try {
      const report = await buildMonthlyReport(pool, req.query);
      const buffer = await buildRenewalsWorkbookBuffer(report.policies, {
        title: `ADT Renewals production — ${report.year}-${String(report.month).padStart(2, "0")}`,
        filterSummary: `Renewed ${report.counts.renewed} · Lapsed ${report.counts.lapsed} · Open ${report.counts.open}`,
      });
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", 'attachment; filename="ADT-renewals-monthly.xlsx"');
      res.send(Buffer.from(buffer));
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: "Report export failed" });
    }
  });

  app.post("/api/renewals/webhooks/africastalking", async (req, res) => {
    try {
      if (!webhookAuthorized(req)) return res.status(401).json({ message: "Unauthorized webhook" });
      const from = req.body.from || req.body.phoneNumber || req.query.from;
      const text = req.body.text || req.body.message || req.query.text || "";
      const result = await handleInboundSms(pool, { from, text, nextSerialId, dbMode, onPersist });
      return res.json(result);
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: "Inbound SMS handling failed" });
    }
  });

  app.post("/api/renewals/webhooks/dlr", async (req, res) => {
    try {
      if (!webhookAuthorized(req)) return res.status(401).json({ message: "Unauthorized webhook" });
      const messageId = req.body.id || req.body.messageId || req.query.id;
      const status = String(req.body.status || req.query.status || "").toLowerCase();
      if (messageId) {
        const mapped = status.includes("deliver")
          ? "delivered"
          : status.includes("fail") || status.includes("reject") || status.includes("undeliver")
            ? "undelivered"
            : status || "sent";
        await pool.query(
          `UPDATE renewal_notification_logs SET delivery_status = $2 WHERE provider_ref = $1`,
          [String(messageId), mapped]
        );
        await onPersist?.();
      }
      return res.json({ ok: true });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: "DLR webhook failed" });
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
      const result = await pool.query(
        `SELECT p.*, u.name AS officer_name
         FROM renewal_policies p
         LEFT JOIN users u ON u.id = p.assigned_officer_id
         WHERE p.id = $1`,
        [id]
      );
      if (!result.rows[0]) return res.status(404).json({ message: "Policy not found" });
      const logs = await pool.query(
        `SELECT l.*, p.insured_name FROM renewal_notification_logs l
         JOIN renewal_policies p ON p.id = l.policy_id
         WHERE l.policy_id = $1 ORDER BY l.created_at DESC`,
        [id]
      );
      const followUps = await pool.query(
        `SELECT f.*, u.name AS officer_name
         FROM renewal_follow_ups f
         LEFT JOIN users u ON u.id = f.officer_id
         WHERE f.policy_id = $1 ORDER BY f.created_at DESC`,
        [id]
      );
      const attachments = await pool.query(
        `SELECT a.*, u.name AS uploaded_by_name
         FROM renewal_attachments a
         LEFT JOIN users u ON u.id = a.uploaded_by
         WHERE a.policy_id = $1 ORDER BY a.created_at DESC`,
        [id]
      );
      const policy = rowToPolicy(result.rows[0]);
      const client360 = await fetchClient360(pool, policy.insuredName);
      return res.json({
        policy,
        notifications: logs.rows.map(rowToLog),
        followUps: followUps.rows.map((row) => ({
          id: row.id,
          date: toDateOnly(row.follow_up_date),
          officerId: row.officer_id,
          officerName: row.officer_name || "",
          method: row.method,
          outcome: row.outcome || "",
          remarks: row.remarks || "",
          createdAt: row.created_at,
        })),
        attachments: attachments.rows.map((row) => ({
          id: row.id,
          originalName: row.original_name,
          mimeType: row.mime_type,
          sizeBytes: row.size_bytes,
          uploadedBy: row.uploaded_by_name || "",
          createdAt: row.created_at,
        })),
        client360,
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
          renewal_date, car_registrations, financial_interest, status, notes,
          pipeline_stage, premium, assigned_officer_id, relationship_manager, sms_opt_out, created_by
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
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
          body.pipelineStage,
          body.premium ?? null,
          body.assignedOfficerId || null,
          body.relationshipManager.trim(),
          body.smsOptOut,
          req.user.id,
        ]
      );
      await autoCreateFinanciers(pool, nextSerialId, body.financialInterest);
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
          status = $11, notes = $12, pipeline_stage = $13, premium = $14,
          assigned_officer_id = $15, relationship_manager = $16, sms_opt_out = $17, updated_at = NOW()
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
          body.pipelineStage,
          body.premium ?? null,
          body.assignedOfficerId || null,
          body.relationshipManager.trim(),
          body.smsOptOut,
        ]
      );
      if (!updated.rows[0]) return res.status(404).json({ message: "Policy not found" });
      await autoCreateFinanciers(pool, nextSerialId, body.financialInterest);
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

  app.post("/api/renewals/:id/roll", ...editGuard, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const existing = await pool.query("SELECT * FROM renewal_policies WHERE id = $1", [id]);
      if (!existing.rows[0]) return res.status(404).json({ message: "Policy not found" });
      const current = toDateOnly(existing.rows[0].renewal_date);
      const nextDate = addMonths(current, 12);
      if (!nextDate) return res.status(400).json({ message: "Could not roll renewal date" });
      const updated = await pool.query(
        `UPDATE renewal_policies SET
          renewal_date = $2, status = 'Active', pipeline_stage = 'Not contacted', updated_at = NOW()
         WHERE id = $1 RETURNING *`,
        [id, nextDate]
      );
      const fid = await nextSerialId(pool, "renewal_follow_ups");
      await pool.query(
        `INSERT INTO renewal_follow_ups (id, policy_id, follow_up_date, officer_id, method, outcome, remarks)
         VALUES ($1,$2,CURRENT_DATE,$3,'Note','Renewed', $4)`,
        [fid, id, req.user.id, `Rolled renewal date from ${current} to ${nextDate}`]
      );
      await onPersist?.();
      return res.json(rowToPolicy(updated.rows[0]));
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: "Failed to roll renewal date" });
    }
  });

  app.post("/api/renewals/:id/follow-ups", ...editGuard, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const body = z
        .object({
          date: z.string().optional(),
          method: z.enum(FOLLOW_UP_METHODS).optional().default("Call"),
          outcome: z.string().optional().default(""),
          remarks: z.string().optional().default(""),
        })
        .parse(req.body);
      const existing = await pool.query("SELECT id FROM renewal_policies WHERE id = $1", [id]);
      if (!existing.rows[0]) return res.status(404).json({ message: "Policy not found" });
      const fid = await nextSerialId(pool, "renewal_follow_ups");
      const inserted = await pool.query(
        `INSERT INTO renewal_follow_ups (id, policy_id, follow_up_date, officer_id, method, outcome, remarks)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [fid, id, body.date || todayNairobi(), req.user.id, body.method, body.outcome, body.remarks]
      );
      await onPersist?.();
      return res.status(201).json(inserted.rows[0]);
    } catch (err) {
      if (err?.issues) return res.status(400).json({ message: "Invalid follow-up" });
      console.error(err);
      return res.status(500).json({ message: "Failed to add follow-up" });
    }
  });

  app.post("/api/renewals/:id/attachments", ...editGuard, upload.single("file"), async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!req.file) return res.status(400).json({ message: "Missing file" });
      const existing = await pool.query("SELECT id FROM renewal_policies WHERE id = $1", [id]);
      if (!existing.rows[0]) return res.status(404).json({ message: "Policy not found" });
      const dir = attachmentDir();
      await fs.mkdir(dir, { recursive: true });
      const storedName = `${id}-${Date.now()}-${(req.file.originalname || "file").replace(/[^\w.\-]+/g, "_")}`;
      await fs.writeFile(path.join(dir, storedName), req.file.buffer);
      const aid = await nextSerialId(pool, "renewal_attachments");
      const inserted = await pool.query(
        `INSERT INTO renewal_attachments (id, policy_id, stored_name, original_name, mime_type, size_bytes, uploaded_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [
          aid,
          id,
          storedName,
          req.file.originalname || storedName,
          req.file.mimetype || "",
          req.file.size || 0,
          req.user.id,
        ]
      );
      await onPersist?.();
      return res.status(201).json({
        id: inserted.rows[0].id,
        originalName: inserted.rows[0].original_name,
        mimeType: inserted.rows[0].mime_type,
        sizeBytes: inserted.rows[0].size_bytes,
      });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: "Failed to upload attachment" });
    }
  });

  app.get("/api/renewals/:id/attachments/:fileId", authRequired, async (req, res) => {
    try {
      const fileId = Number(req.params.fileId);
      const result = await pool.query("SELECT * FROM renewal_attachments WHERE id = $1 AND policy_id = $2", [
        fileId,
        Number(req.params.id),
      ]);
      if (!result.rows[0]) return res.status(404).json({ message: "Attachment not found" });
      const filePath = path.join(attachmentDir(), result.rows[0].stored_name);
      return res.download(filePath, result.rows[0].original_name);
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: "Failed to download attachment" });
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
  FOLLOW_UP_SNAPSHOT_COLUMNS,
  ATTACHMENT_SNAPSHOT_COLUMNS,
  ensureRenewalsTables,
  seedRenewalsIfEmpty,
  registerRenewalRoutes,
  runRenewalReminderJob,
  pollDeliveryReports,
  normalizeKenyaPhone,
  parseFinancierNames,
  hasFinancialInterest,
  daysUntilRenewal,
  toDateOnly,
  todayNairobi,
};
