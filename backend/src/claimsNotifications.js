const { z } = require("zod");
const { CLOSED_STATUS_LIST } = require("./claimStatuses");
const {
  canManageClaimSettings,
  canRunClaimJobs,
  requirePermission,
} = require("./permissions");
const {
  sendEmail,
  sendSms,
  sendClaimEventEmail,
  sendClaimsOpsDigest,
  sendClaimsTestEmail,
  claimsOpsRecipients,
  isSmtpConfigured,
  isSmsConfigured,
  applySmtpSettings,
} = require("./notificationService");
const {
  COMPANY,
  nairobiDateString,
  nairobiDateTimeLabel,
  mapClaimRow,
  isMotorClaim,
  buildDailyClaimsRegisterWorkbookBuffer,
} = require("./dailyClaimsRegisterExcel");

const DEFAULT_DAILY_REGISTER_RECIPIENTS = [
  "aisha@adtinsurance.co.ke",
  "jacob@adtinsurance.co.ke",
  "communications@adtinsurance.co.ke",
];

const CLOSED = new Set(CLOSED_STATUS_LIST);
const HIGH_SIGNAL = new Set([
  "Awaiting Assessment",
  "Pending Documents",
  "Pending RA",
  "RA Issued",
  "Under Repair",
  "Released",
  "Payment Processing",
  "Litigation",
  "Paid",
  "Closed",
  "Closed With Payment",
  "Closed Without Payment",
  "Repudiated",
  "Declined",
  "Withdrawn",
  "Time Barred",
]);

const SETTINGS_SNAPSHOT_COLUMNS = [
  "id",
  "ops_email_list",
  "ops_phone_list",
  "email_enabled",
  "sms_enabled",
  "notify_all_status_changes",
  "assessment_chase_days",
  "documents_chase_days",
  "not_released_chase_days",
  "last_run_at",
  "last_digest_at",
  "last_register_email_at",
  "smtp_host",
  "smtp_port",
  "smtp_secure",
  "smtp_user",
  "smtp_pass",
  "smtp_from",
  "updated_at",
];

const LOG_SNAPSHOT_COLUMNS = [
  "id",
  "claim_id",
  "event_type",
  "channel",
  "recipient",
  "status",
  "error_message",
  "message_body",
  "created_at",
];

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

function eventForStatus(toStatus) {
  if (toStatus === "RA Issued") return "ra_issued";
  if (toStatus === "Released" || toStatus === "Cargo Released") return "released";
  if (CLOSED.has(toStatus)) return "closed";
  return "status_change";
}

async function ensureClaimsNotificationTables(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS claim_settings (
      id INTEGER PRIMARY KEY DEFAULT 1,
      ops_email_list TEXT NOT NULL DEFAULT '',
      ops_phone_list TEXT NOT NULL DEFAULT '',
      email_enabled BOOLEAN NOT NULL DEFAULT TRUE,
      sms_enabled BOOLEAN NOT NULL DEFAULT FALSE,
      notify_all_status_changes BOOLEAN NOT NULL DEFAULT FALSE,
      assessment_chase_days INTEGER NOT NULL DEFAULT 3,
      documents_chase_days INTEGER NOT NULL DEFAULT 5,
      not_released_chase_days INTEGER NOT NULL DEFAULT 5,
      last_run_at TIMESTAMPTZ NULL,
      last_digest_at TIMESTAMPTZ NULL,
      last_register_email_at TIMESTAMPTZ NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(`
    ALTER TABLE claim_settings
      ADD COLUMN IF NOT EXISTS last_register_email_at TIMESTAMPTZ NULL;
  `);
  await pool.query(`
    ALTER TABLE claim_settings
      ADD COLUMN IF NOT EXISTS smtp_host TEXT NOT NULL DEFAULT '';
  `);
  await pool.query(`
    ALTER TABLE claim_settings
      ADD COLUMN IF NOT EXISTS smtp_port INTEGER NOT NULL DEFAULT 587;
  `);
  await pool.query(`
    ALTER TABLE claim_settings
      ADD COLUMN IF NOT EXISTS smtp_secure BOOLEAN NOT NULL DEFAULT FALSE;
  `);
  await pool.query(`
    ALTER TABLE claim_settings
      ADD COLUMN IF NOT EXISTS smtp_user TEXT NOT NULL DEFAULT '';
  `);
  await pool.query(`
    ALTER TABLE claim_settings
      ADD COLUMN IF NOT EXISTS smtp_pass TEXT NOT NULL DEFAULT '';
  `);
  await pool.query(`
    ALTER TABLE claim_settings
      ADD COLUMN IF NOT EXISTS smtp_from TEXT NOT NULL DEFAULT '';
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS claim_notification_logs (
      id SERIAL PRIMARY KEY,
      claim_id INTEGER NULL REFERENCES claims(id) ON DELETE SET NULL,
      event_type TEXT NOT NULL,
      channel TEXT NOT NULL,
      recipient TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL,
      error_message TEXT NULL,
      message_body TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_claim_notification_logs_event
    ON claim_notification_logs (claim_id, event_type, status);
  `);
  const count = await pool.query("SELECT COUNT(*)::int AS total FROM claim_settings");
  if (count.rows[0].total === 0) {
    await pool.query(
      `INSERT INTO claim_settings (id, ops_email_list, email_enabled)
       VALUES (1, '', TRUE)`
    );
  }
}

async function getSettings(pool) {
  const result = await pool.query("SELECT * FROM claim_settings ORDER BY id ASC LIMIT 1");
  if (!result.rows[0]) {
    await pool.query(`INSERT INTO claim_settings (id, ops_email_list, email_enabled) VALUES (1, '', TRUE)`);
    return getSettings(pool);
  }
  const row = result.rows[0] || {};
  return {
    id: row.id || 1,
    ops_email_list: row.ops_email_list || "",
    ops_phone_list: row.ops_phone_list || "",
    email_enabled: row.email_enabled !== false,
    sms_enabled: !!row.sms_enabled,
    notify_all_status_changes: !!row.notify_all_status_changes,
    assessment_chase_days: row.assessment_chase_days ?? 3,
    documents_chase_days: row.documents_chase_days ?? 5,
    not_released_chase_days: row.not_released_chase_days ?? 5,
    last_run_at: row.last_run_at || null,
    last_digest_at: row.last_digest_at || null,
    last_register_email_at: row.last_register_email_at || null,
    smtp_host: row.smtp_host || "",
    smtp_port: row.smtp_port ?? 587,
    smtp_secure: !!row.smtp_secure,
    smtp_user: row.smtp_user || "",
    smtp_pass: row.smtp_pass || "",
    smtp_from: row.smtp_from || "",
  };
}

function applySmtpFromSettings(settings) {
  applySmtpSettings({
    host: settings.smtp_host,
    port: settings.smtp_port,
    secure: settings.smtp_secure,
    user: settings.smtp_user,
    pass: settings.smtp_pass,
    from: settings.smtp_from,
  });
}

async function loadSmtpFromDb(pool) {
  try {
    applySmtpFromSettings(await getSettings(pool));
  } catch (error) {
    console.warn("Could not load SMTP settings from database:", error.message);
  }
}

function parseEmailList(raw) {
  return String(raw || "")
    .split(/[,;\s]+/)
    .map((e) => e.trim())
    .filter((e) => e.includes("@"));
}

function dailyRegisterRecipients() {
  const fromEnv = parseEmailList(process.env.CLAIMS_DAILY_REGISTER_EMAIL_LIST || "");
  return fromEnv.length ? fromEnv : [...DEFAULT_DAILY_REGISTER_RECIPIENTS];
}

function alreadySentRegisterToday(settings) {
  if (!settings?.last_register_email_at) return false;
  return nairobiDateString(settings.last_register_email_at) === nairobiDateString();
}

function isCronAuthorized(req) {
  const secret = String(process.env.CRON_SECRET || process.env.ADMIN_RESET_KEY || "").trim();
  const auth = String(req.headers.authorization || "");
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  const header = String(req.headers["x-cron-secret"] || "").trim();
  const query = String(req.query.secret || "").trim();
  if (secret && (bearer === secret || header === secret || query === secret)) return true;
  if (process.env.VERCEL && /vercel-cron/i.test(String(req.headers["user-agent"] || ""))) {
    return true;
  }
  return false;
}

async function runDailyClaimsRegisterEmail(pool, deps = {}) {
  const { force = false } = deps;
  const settings = await getSettings(pool);
  const to = dailyRegisterRecipients();
  if (!force && alreadySentRegisterToday(settings)) {
    return {
      sent: false,
      skipped: true,
      reason: "already_sent_today",
      recipients: to,
      rowCount: 0,
    };
  }

  const claimsRes = await pool.query(`
    SELECT insurer, cover_type, insured_name, registration_number,
           reported_to_insurer_date, claim_status, claim_type
    FROM claims
    ORDER BY reported_to_broker_date DESC, id DESC
  `);
  const rows = claimsRes.rows.map(mapClaimRow);
  const motorCount = rows.filter(isMotorClaim).length;
  const nonMotorCount = rows.length - motorCount;
  const generatedAt = new Date();
  const asAt = nairobiDateTimeLabel(generatedAt);
  const dateLabel = nairobiDateString(generatedAt);
  const filename = `ADT-claims-register-${dateLabel}.xlsx`;
  const buffer = await buildDailyClaimsRegisterWorkbookBuffer(rows, generatedAt);
  const subject = `ADT Claims Register — ${dateLabel}`;
  const text =
    `Please find attached the ADT claims register as at ${asAt} EAT.\n\n` +
    `${rows.length} claim${rows.length === 1 ? "" : "s"} included ` +
    `(Motor ${motorCount}, Non-Motor ${nonMotorCount}) on separate tabs.\n\n` +
    `${COMPANY.name}\n${COMPANY.tel}`;
  const html = `
    <p>Please find attached the <strong>ADT claims register</strong> as at ${asAt} EAT.</p>
    <p>${rows.length} claim${rows.length === 1 ? "" : "s"} included (Motor ${motorCount}, Non-Motor ${nonMotorCount}). See the <strong>Motor</strong> and <strong>Non-Motor</strong> tabs (Insurer, Cover Type, Insured Name, Reg No, Reported to Insurer, Status).</p>
    <p style="color:#475569;font-size:13px">${COMPANY.name}<br>${COMPANY.address1}<br>${COMPANY.address2}<br>${COMPANY.tel}</p>
  `;

  const result = await sendEmail({
    to,
    subject,
    text,
    html,
    attachments: [
      {
        filename,
        content: Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer),
        contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      },
    ],
  });

  await insertLog(pool, deps.nextSerialId, deps.dbMode, {
    claim_id: null,
    event_type: "daily_register",
    channel: "email",
    recipient: to.join(", "),
    status: result.sent ? "sent" : "failed",
    error_message: result.sent ? null : result.reason || "not sent",
    message_body: `${filename} · ${rows.length} claims`,
  });

  if (result.sent) {
    await pool.query(
      `UPDATE claim_settings SET last_register_email_at = NOW(), updated_at = NOW()
       WHERE id = (SELECT id FROM claim_settings ORDER BY id ASC LIMIT 1)`
    );
  }
  await deps.onPersist?.();

  return {
    sent: !!result.sent,
    skipped: false,
    reason: result.sent ? null : result.reason || "not sent",
    recipients: to,
    rowCount: rows.length,
    filename,
    asAt,
  };
}

function parsePhoneList(raw) {
  return String(raw || "")
    .split(/[,;\s]+/)
    .map((p) => p.trim())
    .filter((p) => p.length >= 8);
}

async function alreadySent(pool, { claimId, eventType }) {
  const result = await pool.query(
    `SELECT id FROM claim_notification_logs
     WHERE claim_id = $1 AND event_type = $2 AND status = 'sent'
     LIMIT 1`,
    [claimId, eventType]
  );
  return !!result.rows[0];
}

async function insertLog(pool, nextSerialId, dbMode, row) {
  const values = [
    row.claim_id || null,
    row.event_type,
    row.channel,
    row.recipient || "",
    row.status,
    row.error_message || null,
    row.message_body || "",
  ];
  if (dbMode === "in-memory") {
    const id = await nextSerialId(pool, "claim_notification_logs");
    const inserted = await pool.query(
      `INSERT INTO claim_notification_logs (
        id, claim_id, event_type, channel, recipient, status, error_message, message_body
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [id, ...values]
    );
    return inserted.rows[0];
  }
  const inserted = await pool.query(
    `INSERT INTO claim_notification_logs (
      claim_id, event_type, channel, recipient, status, error_message, message_body
    ) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    values
  );
  return inserted.rows[0];
}

function rowToLog(row) {
  return {
    id: row.id,
    claimId: row.claim_id,
    insuredName: row.insured_name || "",
    registrationNumber: row.registration_number || "",
    eventType: row.event_type,
    channel: row.channel,
    recipient: row.recipient || "",
    status: row.status,
    errorMessage: row.error_message || "",
    messageBody: row.message_body || "",
    createdAt: row.created_at,
  };
}

async function loadClaim(pool, claimId) {
  const result = await pool.query("SELECT * FROM claims WHERE id = $1", [claimId]);
  return result.rows[0] || null;
}

function toClientClaim(row) {
  if (!row) return null;
  return {
    id: row.id,
    insurer: row.insurer,
    insuredName: row.insured_name,
    registrationNumber: row.registration_number,
    claimStatus: row.claim_status,
    garage: row.garage,
    daysOpen: computeDaysOpen(row.reported_to_broker_date, row.closure_date),
  };
}

async function deliverAndLog(pool, deps, { claimId, eventType, channel, to, sendFn, body }) {
  const { nextSerialId, dbMode } = deps;
  const recipients = Array.isArray(to) ? to.filter(Boolean) : [to].filter(Boolean);
  const recipient = recipients.join(", ");
  try {
    const result = await sendFn();
    const status = result?.sent ? "sent" : "failed";
    await insertLog(pool, nextSerialId, dbMode, {
      claim_id: claimId,
      event_type: eventType,
      channel,
      recipient,
      status,
      error_message: result?.sent ? null : result?.reason || "not sent",
      message_body: body,
    });
    return { status };
  } catch (err) {
    await insertLog(pool, nextSerialId, dbMode, {
      claim_id: claimId,
      event_type: eventType,
      channel,
      recipient,
      status: "failed",
      error_message: err.message,
      message_body: body,
    });
    return { status: "failed", error: err.message };
  }
}

async function notifyClaimCreated(pool, deps, { claimId, actor }) {
  const settings = await getSettings(pool);
  if (!settings.email_enabled) return { skipped: true };
  const claim = toClientClaim(await loadClaim(pool, claimId));
  const to = claimsOpsRecipients(settings.ops_email_list);
  if (!claim || !to.length) return { skipped: true };
  const extra = { intro: "A new claim was logged.", actorName: actor?.name };
  await deliverAndLog(pool, deps, {
    claimId,
    eventType: "claim_created",
    channel: "email",
    to,
    body: `New claim ${claim.insuredName}`,
    sendFn: () => sendClaimEventEmail({ to, event: "claim_created", claim, extra }),
  });
  await deps.onPersist?.();
}

async function notifyClaimStatusChange(pool, deps, { claimId, fromStatus, toStatus, actor, remark }) {
  if (!fromStatus || fromStatus === toStatus) return { skipped: true };
  const settings = await getSettings(pool);
  if (!settings.email_enabled) return { skipped: true };
  const shouldSend = settings.notify_all_status_changes || HIGH_SIGNAL.has(toStatus);
  if (!shouldSend) return { skipped: true };

  const claim = toClientClaim(await loadClaim(pool, claimId));
  const to = claimsOpsRecipients(settings.ops_email_list);
  if (!claim || !to.length) return { skipped: true };
  const event = eventForStatus(toStatus);
  const extra = {
    intro: `Status changed from ${fromStatus} to ${toStatus}.`,
    fromStatus,
    toStatus,
    actorName: actor?.name,
    remark,
    garage: claim.garage,
    daysOpen: claim.daysOpen,
  };
  await deliverAndLog(pool, deps, {
    claimId,
    eventType: event,
    channel: "email",
    to,
    body: `${fromStatus} → ${toStatus}`,
    sendFn: () => sendClaimEventEmail({ to, event, claim, extra }),
  });

  if (settings.sms_enabled) {
    const phones = parsePhoneList(settings.ops_phone_list);
    if (phones.length) {
      const message = `ADT Claims: ${claim.insuredName} (${claim.registrationNumber || "—"}) ${fromStatus} → ${toStatus}. ${claim.daysOpen}d open.`;
      await deliverAndLog(pool, deps, {
        claimId,
        eventType: event,
        channel: "sms",
        to: phones,
        body: message,
        sendFn: () => sendSms({ to: phones, message }),
      });
    }
  }
  await deps.onPersist?.();
}

async function collectOpsQueues(pool) {
  const claimsRes = await pool.query(`
    SELECT id, insurer, insured_name, registration_number, reported_to_broker_date,
           claim_status, closure_date, date_vehicle_released, garage
    FROM claims
  `);
  const claims = claimsRes.rows.map((c) => ({
    ...c,
    days_open: computeDaysOpen(c.reported_to_broker_date, c.closure_date),
  }));
  const orderByDays = (a, b) => b.days_open - a.days_open;
  const pendingAssessmentRows = claims
    .filter((c) => c.claim_status === "Awaiting Assessment")
    .sort(orderByDays);
  const pendingDocumentsRows = claims
    .filter((c) => c.claim_status === "Pending Documents")
    .sort(orderByDays);
  const notReleasedRows = claims
    .filter((c) => ["RA Issued", "Under Repair"].includes(c.claim_status) && !c.date_vehicle_released)
    .sort(orderByDays);
  const stuckOver7Rows = claims
    .filter((c) => !CLOSED.has(c.claim_status) && c.days_open > 7)
    .sort(orderByDays);
  const over30 = claims.filter((c) => !CLOSED.has(c.claim_status) && c.days_open >= 31).length;
  return {
    claims,
    pendingAssessmentRows,
    pendingDocumentsRows,
    notReleasedRows,
    stuckOver7Rows,
    over30,
    pendingAssessment: pendingAssessmentRows.length,
    pendingDocuments: pendingDocumentsRows.length,
    notReleased: notReleasedRows.length,
    stuckOver7: stuckOver7Rows.length,
  };
}

async function chaseQueue(pool, deps, settings, rows, { eventType, minDays, extraIntro }) {
  let sent = 0;
  let skipped = 0;
  const to = claimsOpsRecipients(settings.ops_email_list);
  if (!settings.email_enabled || !to.length) return { sent, skipped };
  for (const row of rows) {
    if (row.days_open < minDays) continue;
    if (await alreadySent(pool, { claimId: row.id, eventType })) {
      skipped += 1;
      continue;
    }
    const claim = toClientClaim(row);
    const extra = { intro: extraIntro, daysOpen: row.days_open };
    await deliverAndLog(pool, deps, {
      claimId: row.id,
      eventType,
      channel: "email",
      to,
      body: extraIntro,
      sendFn: () => sendClaimEventEmail({ to, event: eventType, claim, extra }),
    });
    sent += 1;
  }
  return { sent, skipped };
}

async function runClaimsAutomationJob(pool, deps = {}) {
  const settings = await getSettings(pool);
  const queues = await collectOpsQueues(pool);
  const openClaims = queues.claims.filter((c) => !CLOSED.has(c.claim_status));

  const aging8 = await chaseQueue(
    pool,
    deps,
    settings,
    openClaims.filter((c) => c.days_open >= 8),
    { eventType: "aging_8", minDays: 8, extraIntro: "This open claim has crossed 8 days." }
  );
  const aging15 = await chaseQueue(
    pool,
    deps,
    settings,
    openClaims.filter((c) => c.days_open >= 15),
    { eventType: "aging_15", minDays: 15, extraIntro: "This open claim has crossed 15 days." }
  );
  const aging30 = await chaseQueue(
    pool,
    deps,
    settings,
    openClaims.filter((c) => c.days_open >= 31),
    { eventType: "aging_30", minDays: 31, extraIntro: "This open claim has been open 30+ days." }
  );
  const assessment = await chaseQueue(pool, deps, settings, queues.pendingAssessmentRows, {
    eventType: "pending_assessment",
    minDays: settings.assessment_chase_days,
    extraIntro: `Still awaiting assessment after ${settings.assessment_chase_days} day(s).`,
  });
  const documents = await chaseQueue(pool, deps, settings, queues.pendingDocumentsRows, {
    eventType: "pending_documents",
    minDays: settings.documents_chase_days,
    extraIntro: `Still pending documents after ${settings.documents_chase_days} day(s).`,
  });
  const notReleased = await chaseQueue(pool, deps, settings, queues.notReleasedRows, {
    eventType: "not_released",
    minDays: settings.not_released_chase_days,
    extraIntro: `RA issued / under repair but vehicle not released after ${settings.not_released_chase_days} day(s).`,
  });

  const digestTo = claimsOpsRecipients(settings.ops_email_list);
  let digestSent = false;
  if (settings.email_enabled && digestTo.length) {
    const generatedAt = new Date().toISOString();
    const result = await sendClaimsOpsDigest({
      to: digestTo,
      generatedAt,
      digest: {
        pendingAssessment: queues.pendingAssessment,
        pendingDocuments: queues.pendingDocuments,
        notReleased: queues.notReleased,
        stuckOver7: queues.stuckOver7,
        over30: queues.over30,
        pendingAssessmentRows: queues.pendingAssessmentRows,
        pendingDocumentsRows: queues.pendingDocumentsRows,
        notReleasedRows: queues.notReleasedRows,
        stuckOver7Rows: queues.stuckOver7Rows.slice(0, 40),
      },
    });
    digestSent = !!result.sent;
    await insertLog(pool, deps.nextSerialId, deps.dbMode, {
      claim_id: null,
      event_type: "daily_digest",
      channel: "email",
      recipient: digestTo.join(", "),
      status: result.sent ? "sent" : "failed",
      error_message: result.sent ? null : result.reason || "not sent",
      message_body: `Digest: assessment ${queues.pendingAssessment}, docs ${queues.pendingDocuments}, not released ${queues.notReleased}, stuck ${queues.stuckOver7}`,
    });
    if (settings.sms_enabled) {
      const phones = parsePhoneList(settings.ops_phone_list);
      if (phones.length) {
        const message =
          `ADT Claims digest: ${queues.pendingAssessment} assessment, ${queues.pendingDocuments} documents, ` +
          `${queues.notReleased} not released, ${queues.stuckOver7} stuck >7d, ${queues.over30} over 30d.`;
        const sms = await sendSms({ to: phones, message });
        await insertLog(pool, deps.nextSerialId, deps.dbMode, {
          claim_id: null,
          event_type: "daily_digest",
          channel: "sms",
          recipient: phones.join(", "),
          status: sms.sent ? "sent" : "failed",
          error_message: sms.sent ? null : sms.reason || "not sent",
          message_body: message,
        });
      }
    }
  }

  await pool.query(
    `UPDATE claim_settings SET last_run_at = NOW(), last_digest_at = NOW(), updated_at = NOW()
     WHERE id = (SELECT id FROM claim_settings ORDER BY id ASC LIMIT 1)`
  );
  await deps.onPersist?.();

  return {
    ranAt: new Date().toISOString(),
    digestSent,
    queues: {
      pendingAssessment: queues.pendingAssessment,
      pendingDocuments: queues.pendingDocuments,
      notReleased: queues.notReleased,
      stuckOver7: queues.stuckOver7,
      over30: queues.over30,
    },
    chases: { aging8, aging15, aging30, assessment, documents, notReleased },
  };
}

function registerClaimsNotificationRoutes(app, deps) {
  const { pool, authRequired, nextSerialId, onPersist, dbMode } = deps;
  const notifyDeps = { nextSerialId, onPersist, dbMode };
  const settingsGuard = [authRequired, requirePermission(canManageClaimSettings)];
  const runGuard = [authRequired, requirePermission(canRunClaimJobs)];

  app.get("/api/claims-notifications/settings", authRequired, async (_, res) => {
    try {
      const settings = await getSettings(pool);
      applySmtpFromSettings(settings);
      return res.json({
        opsEmailList: settings.ops_email_list || "",
        opsPhoneList: settings.ops_phone_list || "",
        emailEnabled: settings.email_enabled,
        smsEnabled: settings.sms_enabled,
        notifyAllStatusChanges: settings.notify_all_status_changes,
        assessmentChaseDays: settings.assessment_chase_days,
        documentsChaseDays: settings.documents_chase_days,
        notReleasedChaseDays: settings.not_released_chase_days,
        lastRunAt: settings.last_run_at,
        lastDigestAt: settings.last_digest_at,
        lastRegisterEmailAt: settings.last_register_email_at,
        dailyRegisterRecipients: dailyRegisterRecipients(),
        smtpHost: settings.smtp_host || "",
        smtpPort: settings.smtp_port ?? 587,
        smtpSecure: !!settings.smtp_secure,
        smtpUser: settings.smtp_user || "",
        smtpPassSet: Boolean(settings.smtp_pass),
        smtpFrom: settings.smtp_from || "",
        smtpConfigured: isSmtpConfigured() || Boolean(settings.smtp_host && settings.smtp_from),
        smsConfigured: isSmsConfigured(),
      });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: "Failed to load claims notification settings" });
    }
  });

  app.put("/api/claims-notifications/settings", ...settingsGuard, async (req, res) => {
    try {
      const body = z
        .object({
          opsEmailList: z.string().optional().default(""),
          opsPhoneList: z.string().optional().default(""),
          emailEnabled: z.boolean(),
          smsEnabled: z.boolean().optional().default(false),
          notifyAllStatusChanges: z.boolean().optional().default(false),
          assessmentChaseDays: z.number().int().min(1).max(90).optional().default(3),
          documentsChaseDays: z.number().int().min(1).max(90).optional().default(5),
          notReleasedChaseDays: z.number().int().min(1).max(90).optional().default(5),
          smtpHost: z.string().optional().default(""),
          smtpPort: z.number().int().min(1).max(65535).optional().default(587),
          smtpSecure: z.boolean().optional().default(false),
          smtpUser: z.string().optional().default(""),
          smtpPass: z.string().optional(),
          smtpFrom: z.string().optional().default(""),
        })
        .parse(req.body);
      const current = await getSettings(pool);
      const nextPass =
        body.smtpPass === undefined || body.smtpPass === "" ? current.smtp_pass : body.smtpPass;
      await pool.query(
        `UPDATE claim_settings SET
          ops_email_list = $1, ops_phone_list = $2, email_enabled = $3, sms_enabled = $4,
          notify_all_status_changes = $5, assessment_chase_days = $6, documents_chase_days = $7,
          not_released_chase_days = $8,
          smtp_host = $9, smtp_port = $10, smtp_secure = $11, smtp_user = $12, smtp_pass = $13, smtp_from = $14,
          updated_at = NOW()
         WHERE id = (SELECT id FROM claim_settings ORDER BY id ASC LIMIT 1)`,
        [
          body.opsEmailList,
          body.opsPhoneList,
          body.emailEnabled,
          body.smsEnabled,
          body.notifyAllStatusChanges,
          body.assessmentChaseDays,
          body.documentsChaseDays,
          body.notReleasedChaseDays,
          body.smtpHost.trim(),
          body.smtpPort,
          body.smtpSecure,
          body.smtpUser.trim(),
          nextPass,
          body.smtpFrom.trim(),
        ]
      );
      applySmtpFromSettings({
        ...current,
        smtp_host: body.smtpHost.trim(),
        smtp_port: body.smtpPort,
        smtp_secure: body.smtpSecure,
        smtp_user: body.smtpUser.trim(),
        smtp_pass: nextPass,
        smtp_from: body.smtpFrom.trim(),
      });
      await onPersist?.();
      return res.json({ ok: true, smtpConfigured: isSmtpConfigured() });
    } catch (err) {
      if (err?.issues) return res.status(400).json({ message: "Invalid settings" });
      console.error(err);
      return res.status(500).json({ message: "Failed to update settings" });
    }
  });

  app.get("/api/claims-notifications/log", authRequired, async (req, res) => {
    try {
      const params = [];
      const where = [];
      if (req.query.status) {
        params.push(req.query.status);
        where.push(`l.status = $${params.length}`);
      }
      if (req.query.eventType) {
        params.push(req.query.eventType);
        where.push(`l.event_type = $${params.length}`);
      }
      const whereClause = where.length ? `WHERE ${where.join(" AND ")}` : "";
      const result = await pool.query(
        `SELECT l.*, c.insured_name, c.registration_number
         FROM claim_notification_logs l
         LEFT JOIN claims c ON c.id = l.claim_id
         ${whereClause}
         ORDER BY l.created_at DESC
         LIMIT 300`,
        params
      );
      return res.json(result.rows.map(rowToLog));
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: "Failed to load notification log" });
    }
  });

  app.post("/api/claims-notifications/run", ...runGuard, async (_, res) => {
    try {
      const summary = await runClaimsAutomationJob(pool, notifyDeps);
      return res.json(summary);
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: "Claims automation job failed" });
    }
  });

  app.post("/api/claims-notifications/test-email", ...settingsGuard, async (req, res) => {
    try {
      const { email } = z.object({ email: z.email() }).parse(req.body);
      const result = await sendClaimsTestEmail(email);
      return res.json(result);
    } catch (err) {
      if (err?.issues) return res.status(400).json({ message: "Invalid email" });
      console.error(err);
      return res.status(500).json({ message: "Failed to send test email" });
    }
  });

  async function handleDailyRegister(req, res, { force }) {
    try {
      const summary = await runDailyClaimsRegisterEmail(pool, { ...notifyDeps, force });
      return res.json(summary);
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: "Daily claims register email failed" });
    }
  }

  app.post("/api/claims-notifications/daily-register", ...runGuard, async (req, res) => {
    return handleDailyRegister(req, res, { force: true });
  });

  app.get("/api/claims-notifications/cron/daily-register", async (req, res) => {
    if (!isCronAuthorized(req)) {
      return res.status(401).json({ message: "Unauthorized cron request" });
    }
    return handleDailyRegister(req, res, { force: String(req.query.force || "") === "1" });
  });
}

module.exports = {
  SETTINGS_SNAPSHOT_COLUMNS: SETTINGS_SNAPSHOT_COLUMNS,
  CLAIM_SETTINGS_SNAPSHOT_COLUMNS: SETTINGS_SNAPSHOT_COLUMNS,
  CLAIM_LOG_SNAPSHOT_COLUMNS: LOG_SNAPSHOT_COLUMNS,
  ensureClaimsNotificationTables,
  registerClaimsNotificationRoutes,
  runClaimsAutomationJob,
  runDailyClaimsRegisterEmail,
  loadSmtpFromDb,
  notifyClaimCreated,
  notifyClaimStatusChange,
  getSettings,
};
