const nodemailer = require("nodemailer");
const {
  sendWhatsApp,
  isWhatsAppConfigured,
} = require("./renewalOps");

let transporter = null;
let smtpOverride = null;

function envSmtp() {
  return {
    host: String(process.env.SMTP_HOST || "").trim(),
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === "true",
    user: String(process.env.SMTP_USER || "").trim(),
    pass: String(process.env.SMTP_PASS || ""),
    from: String(process.env.SMTP_FROM || "").trim(),
  };
}

function applySmtpSettings(partial) {
  const host = String(partial?.host || "").trim();
  const from = String(partial?.from || "").trim();
  if (!host && !from) {
    smtpOverride = null;
  } else {
    smtpOverride = {
      host,
      port: Number(partial?.port || 587),
      secure: !!partial?.secure,
      user: String(partial?.user || "").trim(),
      pass: String(partial?.pass || ""),
      from,
    };
  }
  resetTransporter();
}

function resolvedSmtp() {
  const env = envSmtp();
  const db = smtpOverride;
  if (db && (db.host || db.from)) {
    return {
      host: db.host || env.host,
      port: Number(db.port || env.port || 587),
      secure: db.host ? !!db.secure : env.secure,
      user: db.user || env.user,
      pass: db.pass || env.pass,
      from: db.from || env.from,
    };
  }
  return env;
}

function isSmtpConfigured() {
  const cfg = resolvedSmtp();
  return !!(cfg.host && cfg.from);
}

let tililOverride = null;

function envTilil() {
  const serviceRaw = process.env.TILIL_SERVICE_ID;
  let serviceId = 0;
  if (serviceRaw !== undefined && serviceRaw !== "") {
    const n = Number(serviceRaw);
    if (Number.isFinite(n)) serviceId = n;
  }
  return {
    apiKey: String(process.env.TILIL_API_KEY || "").trim(),
    shortcode: String(process.env.TILIL_SHORTCODE || process.env.TILIL_SENDER_ID || "").trim(),
    serviceId,
    url: String(process.env.TILIL_SMS_URL || "https://api.tililtech.com/sms/v3/sendsms").trim(),
  };
}

/** Prefer DB-saved Tilil credentials (Vercel UI) over env when apiKey is set. */
function applyTililSettings(partial) {
  const apiKey = String(partial?.apiKey || "").trim();
  if (!apiKey) {
    tililOverride = null;
    return;
  }
  const serviceRaw = partial?.serviceId;
  let serviceId = 0;
  if (serviceRaw !== undefined && serviceRaw !== "" && serviceRaw !== null) {
    const n = Number(serviceRaw);
    if (Number.isFinite(n)) serviceId = n;
  }
  tililOverride = {
    apiKey,
    shortcode: String(partial?.shortcode || "").trim(),
    serviceId,
    url: String(partial?.url || "").trim(),
  };
}

function resolvedTilil() {
  const env = envTilil();
  if (tililOverride?.apiKey) {
    return {
      apiKey: tililOverride.apiKey,
      shortcode: tililOverride.shortcode || env.shortcode,
      serviceId:
        tililOverride.serviceId !== undefined && tililOverride.serviceId !== null
          ? tililOverride.serviceId
          : env.serviceId,
      url: tililOverride.url || env.url,
    };
  }
  return env;
}

function isSmsConfigured() {
  return !!resolvedTilil().apiKey;
}

function tililEndpoint() {
  return resolvedTilil().url || "https://api.tililtech.com/sms/v3/sendsms";
}

function tililShortcode() {
  return resolvedTilil().shortcode;
}

function tililServiceId() {
  return resolvedTilil().serviceId;
}

/** Tilil accepts 07… or 254…; normalize from +254 / 07 / 7… */
function toTililMobile(raw) {
  const cleaned = String(raw || "").replace(/[^\d+]/g, "");
  if (!cleaned) return "";
  let digits = cleaned.replace(/^\+/, "");
  if (digits.startsWith("254") && digits.length >= 12) return digits.slice(0, 12);
  if (digits.startsWith("0") && digits.length >= 10) return `254${digits.slice(1, 10)}`;
  if (/^[17]\d{8}$/.test(digits)) return `254${digits}`;
  if (/^\d{9}$/.test(digits)) return `254${digits}`;
  return digits;
}

function parseTililResponse(json) {
  const rows = Array.isArray(json) ? json : json ? [json] : [];
  const first = rows[0] || {};
  const statusCode = String(first.status_code ?? first.statusCode ?? "");
  const ok = statusCode === "1000";
  return {
    ok,
    statusCode,
    statusDesc: String(first.status_desc || first.statusDesc || first.message || "").trim(),
    messageId: first.message_id ?? first.messageId ?? null,
    raw: json,
  };
}

async function sendTililSmsOne({ mobile, message }) {
  const cfg = resolvedTilil();
  const apiKey = cfg.apiKey;
  const shortcode = cfg.shortcode;
  if (!apiKey) {
    return {
      sent: false,
      reason: "sms_not_configured (set TILIL_API_KEY on Vercel backend, or save Tilil key under Renewals → Settings)",
      providerRef: null,
    };
  }
  if (!shortcode) return { sent: false, reason: "tilil_shortcode_missing", providerRef: null };
  if (!mobile) return { sent: false, reason: "no_recipient", providerRef: null };

  const res = await fetch(cfg.url || tililEndpoint(), {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      api_key: apiKey,
      service_id: cfg.serviceId,
      mobile,
      response_type: "json",
      shortcode,
      message: String(message || ""),
    }),
  });

  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }

  const parsed = parseTililResponse(json);
  if (!res.ok && !parsed.ok) {
    return {
      sent: false,
      reason: parsed.statusDesc || `http_${res.status}`,
      providerRef: parsed.messageId != null ? String(parsed.messageId) : null,
      raw: json,
    };
  }
  if (!parsed.ok) {
    return {
      sent: false,
      reason: parsed.statusDesc || `tilil_${parsed.statusCode || "failed"}`,
      providerRef: parsed.messageId != null ? String(parsed.messageId) : null,
      raw: json,
    };
  }
  return {
    sent: true,
    providerRef: parsed.messageId != null ? String(parsed.messageId) : null,
    raw: json,
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function heloName(cfg) {
  const override = String(process.env.SMTP_NAME || "").trim();
  if (override) return override;
  const from = String(cfg.from || "");
  const domain = from.includes("@") ? from.split("@")[1].trim() : "";
  return domain || undefined;
}

function resetTransporter() {
  if (!transporter) return;
  try {
    transporter.close();
  } catch {
    /* ignore */
  }
  transporter = null;
}

function getTransporter() {
  const cfg = resolvedSmtp();
  if (!cfg.host || !cfg.from) return null;
  if (!transporter) {
    const port = Number(cfg.port || 587);
    const secure = !!cfg.secure || port === 465;
    transporter = nodemailer.createTransport({
      host: cfg.host,
      port,
      secure,
      auth: cfg.user && cfg.pass ? { user: cfg.user, pass: cfg.pass } : undefined,
      pool: false,
      connectionTimeout: 25000,
      greetingTimeout: 25000,
      socketTimeout: 90000,
      requireTLS: !secure && port === 587,
      tls: {
        servername: cfg.host,
        minVersion: "TLSv1.2",
      },
      name: heloName(cfg),
      logger: process.env.SMTP_DEBUG === "true",
      debug: process.env.SMTP_DEBUG === "true",
    });
  }
  return transporter;
}

function isTransientSmtpError(err) {
  const code = Number(err?.responseCode || err?.status);
  const text = `${err?.code || ""} ${err?.command || ""} ${err?.response || ""} ${err?.message || ""}`;
  if (code === 421 || code === 450 || code === 451 || code === 452 || code === 454) return true;
  return /421|450|451|452|454|ETIMEDOUT|ECONNECTION|ESOCKET|ECONNRESET|EPIPE|ETLS|EAI_AGAIN|ENOTFOUND|timeout|timed out|socket closed|connection/i.test(
    text
  );
}

function smtpErrorMessage(err) {
  if (!err) return "smtp_send_failed";
  const response = String(err.response || "").trim();
  const message = String(err.message || "").trim();
  if (response && message && !message.includes(response)) return `${message} (${response})`;
  return message || response || "smtp_send_failed";
}

let sendQueue = Promise.resolve();

function enqueueSend(task) {
  const run = () => task();
  const pending = sendQueue.then(run, run);
  sendQueue = pending.then(
    () => undefined,
    () => undefined
  );
  return pending;
}

function managementRecipients() {
  const raw = process.env.MANAGEMENT_EMAIL_LIST || "";
  return raw
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean);
}

function parseEmailList(raw) {
  return String(raw || "")
    .split(/[,;\s]+/)
    .map((e) => e.trim())
    .filter((e) => e.includes("@"));
}

function renewalOpsRecipients(settingsOpsList) {
  const fromSettings = parseEmailList(settingsOpsList);
  if (fromSettings.length) return fromSettings;
  const fromEnv = parseEmailList(process.env.RENEWAL_OPS_EMAIL_LIST || "");
  if (fromEnv.length) return fromEnv;
  return managementRecipients();
}

async function sendEmail({ to, subject, text, html, attachments }) {
  return enqueueSend(() => sendEmailNow({ to, subject, text, html, attachments }));
}

async function sendEmailNow({ to, subject, text, html, attachments }) {
  if (!getTransporter() || !to?.length) {
    console.log(`[notification skipped] ${subject} → ${Array.isArray(to) ? to.join(", ") : to}`);
    return { sent: false, reason: "smtp_not_configured_or_no_recipient" };
  }
  const recipients = Array.isArray(to) ? to.filter(Boolean) : [to];
  if (!recipients.length) return { sent: false, reason: "no_recipient" };

  const serverless = Boolean(process.env.VERCEL);
  const maxAttempts = serverless ? 3 : 4;
  const backoffs = serverless ? [1000, 2500] : [2000, 5000, 12000];
  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const transport = getTransporter();
      if (!transport) return { sent: false, reason: "smtp_not_configured_or_no_recipient" };
      await transport.sendMail({
        from: resolvedSmtp().from,
        to: recipients.join(", "),
        subject,
        text,
        html: html || (text ? text.replace(/\n/g, "<br>") : undefined),
        attachments: attachments?.length ? attachments : undefined,
      });
      return { sent: true };
    } catch (err) {
      lastError = err;
      console.error(
        `[smtp] send failed (attempt ${attempt}/${maxAttempts}) ${subject}:`,
        smtpErrorMessage(err)
      );
      resetTransporter();
      if (attempt < maxAttempts && isTransientSmtpError(err)) {
        await sleep(backoffs[attempt - 1] || 5000);
        continue;
      }
      break;
    }
  }

  return { sent: false, reason: smtpErrorMessage(lastError) };
}

async function sendSms({ to, message }) {
  if (!isSmsConfigured()) {
    console.log(`[sms skipped] ${to}: ${String(message || "").slice(0, 80)}`);
    return {
      sent: false,
      reason: "sms_not_configured (set TILIL_API_KEY on Vercel backend, or save Tilil key under Renewals → Settings)",
      providerRef: null,
    };
  }
  if (!tililShortcode()) {
    return { sent: false, reason: "tilil_shortcode_missing", providerRef: null };
  }

  const recipients = (Array.isArray(to) ? to : [to])
    .map((n) => toTililMobile(n))
    .filter(Boolean);
  if (!recipients.length) return { sent: false, reason: "no_recipient", providerRef: null };

  const results = [];
  for (const mobile of recipients) {
    const result = await sendTililSmsOne({ mobile, message });
    results.push({ mobile, ...result });
  }

  const sent = results.filter((r) => r.sent);
  if (!sent.length) {
    const first = results[0] || {};
    return {
      sent: false,
      reason: first.reason || "tilil_send_failed",
      providerRef: first.providerRef || null,
      raw: results,
    };
  }
  return {
    sent: true,
    providerRef: sent.map((r) => r.providerRef).filter(Boolean).join(",") || null,
    raw: results,
    partialFailure: sent.length < results.length,
  };
}

function valuationSummary(v) {
  return `${v.insuredName} | ${v.vehicleRegistration || "—"} | ${v.insuranceCompany || "—"} | Status: ${v.status}`;
}

async function notifyValuationEvent(event, valuation, extras = {}) {
  if (!valuation) return;
  const officerEmail = extras.officerEmail;
  const valuerEmail = extras.valuerEmail;
  const summary = valuationSummary(valuation);

  switch (event) {
    case "assignment":
      await sendEmail({
        to: [officerEmail, valuerEmail].filter(Boolean),
        subject: `New valuation assignment: ${valuation.insuredName}`,
        text: `A motor valuation has been assigned.\n\n${summary}\n\nPlease log in to the ADT system to review.`,
      });
      break;
    case "overdue":
      await sendEmail({
        to: [officerEmail, ...managementRecipients()],
        subject: `Overdue valuation: ${valuation.insuredName}`,
        text: `This valuation is overdue — the valuation report was not received within the 2-day turnaround.\n\n${summary}`,
      });
      break;
    case "renewal_risk":
      await sendEmail({
        to: managementRecipients(),
        subject: `Renewal approaching — valuation pending: ${valuation.insuredName}`,
        text: `Policy renewal is approaching and valuation is not yet complete.\n\n${summary}\nRenewal: ${valuation.policyRenewalDate || "—"}`,
      });
      break;
    default:
      break;
  }
}

function formatDisplayDate(iso) {
  if (!iso) return "—";
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  return String(iso);
}

function buildRenewalSms({ insuredName, registrations, renewalDate, daysUntil, recipientType, financierName }) {
  const regs = registrations || "your vehicle(s)";
  const date = formatDisplayDate(renewalDate);
  if (recipientType === "financier") {
    return (
      `ADT Africa Brokers: Policy for ${insuredName} (${regs}) renews on ${date} (${daysUntil} days). ` +
      `Financial interest: ${financierName || "noted"}. Please contact ADT to confirm renewal.`
    );
  }
  return (
    `Dear ${insuredName}, your ADT insurance policy for ${regs} is due for renewal on ${date} ` +
    `(${daysUntil} days remaining). Please contact ADT Africa Insurance Brokers to renew. Thank you.`
  );
}

function buildRenewalEmail({ insuredName, registrations, renewalDate, daysUntil, recipientType, financierName, phone }) {
  const date = formatDisplayDate(renewalDate);
  const regs = registrations || "—";
  const subject = `Policy renewal reminder — ${insuredName} (T-${daysUntil})`;
  const greeting =
    recipientType === "financier"
      ? `This is a courtesy notice that a policy in which ${financierName || "you"} hold a financial interest is approaching renewal.`
      : `This is a reminder that your insurance policy is approaching renewal.`;
  const text = [
    `Dear ${recipientType === "financier" ? financierName || "Financier" : insuredName},`,
    "",
    greeting,
    "",
    `Insured: ${insuredName}`,
    `Vehicle(s): ${regs}`,
    `Renewal / expiry date: ${date}`,
    `Days remaining: ${daysUntil}`,
    phone ? `Client contact: ${phone}` : "",
    financierName && recipientType === "client" ? `Financial interest: ${financierName}` : "",
    "",
    "Please contact ADT Africa Insurance Brokers Ltd to arrange renewal.",
    "",
    "This is an automated message from the ADT Renewals portal.",
  ]
    .filter((line) => line !== "")
    .join("\n");

  const html = `
    <div style="font-family:Segoe UI,Arial,sans-serif;color:#1a2332;line-height:1.5">
      <p>${greeting}</p>
      <table style="border-collapse:collapse;margin:16px 0">
        <tr><td style="padding:4px 12px 4px 0;color:#64748b">Insured</td><td><strong>${insuredName}</strong></td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#64748b">Vehicle(s)</td><td>${regs}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#64748b">Renewal date</td><td>${date}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#64748b">Days remaining</td><td>T-${daysUntil}</td></tr>
      </table>
      <p>Please contact <strong>ADT Africa Insurance Brokers Ltd</strong> to arrange renewal.</p>
      <p style="color:#64748b;font-size:12px">Automated reminder from the ADT Renewals portal.</p>
    </div>
  `;
  return { subject, text, html };
}

async function sendRenewalFailureDigest({ to, failures = [], successes = [], summary = {}, generatedAt }) {
  const failCount = failures.length;
  const successCount = successes.length;
  const smsOk = successes.filter((s) => String(s.channel || "").toLowerCase() === "sms");
  const emailOk = successes.filter((s) => String(s.channel || "").toLowerCase() === "email");
  const waOk = successes.filter((s) => String(s.channel || "").toLowerCase() === "whatsapp");

  const subjectParts = [];
  if (successCount) subjectParts.push(`${successCount} delivered`);
  if (failCount) subjectParts.push(`${failCount} failure${failCount === 1 ? "" : "s"}`);
  const subject = `ADT Renewals — ${subjectParts.length ? subjectParts.join(", ") : "run summary"}`;

  const overview = [
    `Renewal reminder job summary`,
    `Generated: ${generatedAt || new Date().toISOString()}`,
    `Due policies: ${summary.duePolicies ?? "—"}`,
    `Attempted: ${summary.attempted ?? successCount + failCount}`,
    `Delivered: ${summary.sent ?? successCount} (SMS ${smsOk.length}, Email ${emailOk.length}${waOk.length ? `, WhatsApp ${waOk.length}` : ""})`,
    `Failed: ${summary.failed ?? failCount}`,
    `Already sent (skipped): ${summary.alreadySent ?? 0}`,
    `Skipped: ${summary.skipped ?? 0}`,
  ];

  const successLines = successes.slice(0, 100).map((s) => {
    const name = s.insuredName || s.recipientName || "—";
    const milestone =
      s.extended || (typeof s.milestone === "number" && s.milestone <= 0)
        ? `Ext+${Math.max(0, -(Number(s.milestone) || 0))}d`
        : `T-${s.milestone}`;
    const channel = String(s.channel || "").toUpperCase() || "—";
    const who = `${s.recipientType || "recipient"} ${s.recipientAddress || "(no address)"}`;
    return `• ${name} | ${milestone} | ${channel} → ${who}`;
  });

  const failureLines = failures.slice(0, 80).map((f) => {
    const milestone =
      typeof f.milestone === "number" && f.milestone <= 0
        ? `Ext+${Math.max(0, -f.milestone)}d`
        : `T-${f.milestone}`;
    return `• ${f.insuredName} | ${milestone} | ${String(f.channel || "").toUpperCase()} → ${f.recipientType} ${f.recipientAddress || "(no address)"} | ${f.errorMessage || f.status}`;
  });

  const text = [
    ...overview,
    "",
    successCount
      ? `DELIVERED (${successCount}) — SMS ${smsOk.length}, Email ${emailOk.length}${waOk.length ? `, WhatsApp ${waOk.length}` : ""}`
      : "DELIVERED — none in this run",
    ...successLines,
    successes.length > 100 ? `…and ${successes.length - 100} more successes` : "",
    "",
    failCount
      ? `FAILURES (${failCount}) — no client renewal should be silently missed`
      : "FAILURES — none open",
    ...failureLines,
    failures.length > 80 ? `…and ${failures.length - 80} more failures` : "",
    "",
    "Open the Renewals portal → Delivery Failures to retry or acknowledge failed sends.",
  ]
    .filter((line) => line !== "")
    .join("\n");

  const htmlSuccessRows = successes
    .slice(0, 100)
    .map((s) => {
      const name = s.insuredName || s.recipientName || "—";
      const milestone =
        s.extended || (typeof s.milestone === "number" && s.milestone <= 0)
          ? `Ext+${Math.max(0, -(Number(s.milestone) || 0))}d`
          : `T-${s.milestone ?? "—"}`;
      return `<tr>
        <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0">${name}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0">${milestone}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0">${String(s.channel || "").toUpperCase()}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0">${s.recipientType || ""} ${s.recipientAddress || ""}</td>
      </tr>`;
    })
    .join("");

  const htmlFailRows = failures
    .slice(0, 80)
    .map((f) => {
      const milestone =
        typeof f.milestone === "number" && f.milestone <= 0
          ? `Ext+${Math.max(0, -f.milestone)}d`
          : `T-${f.milestone ?? "—"}`;
      return `<tr>
        <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0">${f.insuredName || "—"}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0">${milestone}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0">${String(f.channel || "").toUpperCase()}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0">${f.recipientType || ""} ${f.recipientAddress || ""}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;color:#b91c1c">${f.errorMessage || f.status || ""}</td>
      </tr>`;
    })
    .join("");

  const html = `
    <div style="font-family:Segoe UI,Arial,sans-serif;color:#1a2332;line-height:1.5;max-width:720px">
      <h2 style="margin:0 0 8px;font-size:18px">ADT Renewals — run summary</h2>
      <p style="margin:0 0 16px;color:#64748b;font-size:13px">Generated ${generatedAt || ""}</p>
      <table style="border-collapse:collapse;margin-bottom:20px">
        <tr><td style="padding:4px 16px 4px 0;color:#64748b">Due policies</td><td><strong>${summary.duePolicies ?? "—"}</strong></td></tr>
        <tr><td style="padding:4px 16px 4px 0;color:#64748b">Attempted</td><td><strong>${summary.attempted ?? "—"}</strong></td></tr>
        <tr><td style="padding:4px 16px 4px 0;color:#64748b">Delivered</td><td><strong style="color:#047857">${summary.sent ?? successCount}</strong> (SMS ${smsOk.length}, Email ${emailOk.length})</td></tr>
        <tr><td style="padding:4px 16px 4px 0;color:#64748b">Failed</td><td><strong style="color:#b91c1c">${summary.failed ?? failCount}</strong></td></tr>
        <tr><td style="padding:4px 16px 4px 0;color:#64748b">Already sent</td><td>${summary.alreadySent ?? 0}</td></tr>
      </table>
      <h3 style="margin:16px 0 8px;font-size:15px;color:#047857">Delivered (${successCount})</h3>
      ${
        successCount
          ? `<table style="border-collapse:collapse;width:100%;font-size:13px">
              <thead><tr style="background:#ecfdf5;text-align:left">
                <th style="padding:6px 8px">Insured</th><th style="padding:6px 8px">Milestone</th>
                <th style="padding:6px 8px">Channel</th><th style="padding:6px 8px">Recipient</th>
              </tr></thead>
              <tbody>${htmlSuccessRows}</tbody>
            </table>`
          : `<p style="color:#64748b">No successful deliveries in this run.</p>`
      }
      <h3 style="margin:24px 0 8px;font-size:15px;color:#b91c1c">Failures (${failCount})</h3>
      ${
        failCount
          ? `<table style="border-collapse:collapse;width:100%;font-size:13px">
              <thead><tr style="background:#fef2f2;text-align:left">
                <th style="padding:6px 8px">Insured</th><th style="padding:6px 8px">Milestone</th>
                <th style="padding:6px 8px">Channel</th><th style="padding:6px 8px">Recipient</th>
                <th style="padding:6px 8px">Error</th>
              </tr></thead>
              <tbody>${htmlFailRows}</tbody>
            </table>`
          : `<p style="color:#64748b">No open failures.</p>`
      }
      <p style="margin-top:20px;color:#64748b;font-size:12px">Open Renewals → Delivery Failures to retry or acknowledge failed sends.</p>
    </div>
  `;

  return sendEmail({ to, subject, text, html });
}

async function sendTestEmail(to) {
  return sendEmail({
    to,
    subject: "ADT Motor Valuations — SMTP test",
    text: "This is a test email from the ADT Motor Valuation Tracking system.",
  });
}

function claimsOpsRecipients(settingsOpsList) {
  const fromSettings = parseEmailList(settingsOpsList);
  if (fromSettings.length) return fromSettings;
  const fromEnv = parseEmailList(process.env.CLAIMS_OPS_EMAIL_LIST || "");
  if (fromEnv.length) return fromEnv;
  return managementRecipients();
}

function claimLine(claim) {
  return `${claim.insuredName || claim.insured_name} | ${claim.registrationNumber || claim.registration_number || "—"} | ${claim.insurer || "—"} | ${claim.claimStatus || claim.claim_status || "—"}`;
}

async function sendClaimEventEmail({ to, event, claim, extra = {} }) {
  const insured = claim.insuredName || claim.insured_name || "Claim";
  const line = claimLine(claim);
  const days = extra.daysOpen != null ? extra.daysOpen : claim.daysOpen ?? claim.days_open;
  const titles = {
    claim_created: `New claim: ${insured}`,
    status_change: `Claim status: ${insured} → ${extra.toStatus || claim.claimStatus || claim.claim_status}`,
    ra_issued: `RA issued: ${insured}`,
    released: `Vehicle released: ${insured}`,
    closed: `Claim closed: ${insured}`,
    aging_8: `Claim aging 8+ days: ${insured}`,
    aging_15: `Claim aging 15+ days: ${insured}`,
    aging_30: `Claim aging 30+ days: ${insured}`,
    pending_assessment: `Pending assessment: ${insured}`,
    pending_documents: `Pending documents: ${insured}`,
    not_released: `Not released: ${insured}`,
  };
  const subject = titles[event] || `ADT Claims — ${insured}`;
  const text = [
    `ADT Claims Tracker`,
    "",
    extra.intro || "",
    line,
    days != null ? `Days open: ${days}` : "",
    extra.fromStatus ? `Previous status: ${extra.fromStatus}` : "",
    extra.toStatus ? `New status: ${extra.toStatus}` : "",
    extra.actorName ? `Updated by: ${extra.actorName}` : "",
    extra.remark ? `Remark: ${extra.remark}` : "",
    extra.garage ? `Garage: ${extra.garage}` : "",
    "",
    "Open the Claims Tracker to follow up.",
  ]
    .filter((lineText) => lineText !== "")
    .join("\n");
  return sendEmail({ to, subject, text });
}

async function sendClaimsOpsDigest({ to, digest, generatedAt }) {
  const subject = `ADT Claims — daily ops digest (${digest.pendingAssessment} assessment, ${digest.pendingDocuments} documents, ${digest.notReleased} not released, ${digest.stuckOver7} stuck >7d)`;
  const section = (title, rows) => {
    if (!rows.length) return [`${title}: none`];
    return [
      `${title} (${rows.length})`,
      ...rows.slice(0, 25).map(
        (r) =>
          `• ${r.insured_name} | ${r.registration_number || "—"} | ${r.insurer} | ${r.claim_status} | ${r.days_open}d`
      ),
      rows.length > 25 ? `…and ${rows.length - 25} more` : "",
    ].filter(Boolean);
  };
  const text = [
    `Daily claims operations digest.`,
    `Generated: ${generatedAt}`,
    `Open >30 days: ${digest.over30}`,
    "",
    ...section("Pending assessment", digest.pendingAssessmentRows),
    "",
    ...section("Pending documents", digest.pendingDocumentsRows),
    "",
    ...section("Not released (RA Issued / Under Repair)", digest.notReleasedRows),
    "",
    ...section("Stuck > 7 days", digest.stuckOver7Rows),
    "",
    "Open the Claims Tracker → Dashboard for the live queues.",
  ].join("\n");
  return sendEmail({ to, subject, text });
}

async function sendClaimsTestEmail(to) {
  return sendEmail({
    to,
    subject: "ADT Claims — SMTP test",
    text: "This is a test email from the ADT Claims Tracker notification system.",
  });
}

async function sendRenewalTestEmail(to) {
  return sendEmail({
    to,
    subject: "ADT Renewals — SMTP test",
    text: "This is a test email from the ADT Policy Renewals notification system.",
  });
}

async function sendRenewalTestSms(to) {
  return sendSms({
    to,
    message: "ADT Renewals — SMS test. This is a test message from the ADT Policy Renewals notification system.",
  });
}

async function sendRenewalTestWhatsApp(to) {
  return sendWhatsApp({
    to,
    message: "ADT Renewals — WhatsApp test. This is a test message from the ADT Policy Renewals notification system.",
  });
}

module.exports = {
  isSmtpConfigured,
  applySmtpSettings,
  resolvedSmtp,
  isSmsConfigured,
  applyTililSettings,
  resolvedTilil,
  isWhatsAppConfigured,
  notifyValuationEvent,
  sendTestEmail,
  sendRenewalTestEmail,
  sendRenewalTestSms,
  sendRenewalTestWhatsApp,
  sendEmail,
  sendSms,
  sendWhatsApp,
  buildRenewalSms,
  buildRenewalEmail,
  sendRenewalFailureDigest,
  renewalOpsRecipients,
  claimsOpsRecipients,
  sendClaimEventEmail,
  sendClaimsOpsDigest,
  sendClaimsTestEmail,
  parseEmailList,
};
