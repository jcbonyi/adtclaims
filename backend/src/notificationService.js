const {
  sendWhatsApp,
  isWhatsAppConfigured,
} = require("./renewalOps");

let transporter = null;

function isSmtpConfigured() {
  return !!(process.env.SMTP_HOST && process.env.SMTP_FROM);
}

function isSmsConfigured() {
  return !!(process.env.AFRICASTALKING_USERNAME && process.env.AFRICASTALKING_API_KEY);
}

function getTransporter() {
  if (!isSmtpConfigured()) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === "true",
      auth:
        process.env.SMTP_USER && process.env.SMTP_PASS
          ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
          : undefined,
    });
  }
  return transporter;
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

async function sendEmail({ to, subject, text, html }) {
  const transport = getTransporter();
  if (!transport || !to?.length) {
    console.log(`[notification skipped] ${subject} → ${Array.isArray(to) ? to.join(", ") : to}`);
    return { sent: false, reason: "smtp_not_configured_or_no_recipient" };
  }
  const recipients = Array.isArray(to) ? to.filter(Boolean) : [to];
  if (!recipients.length) return { sent: false, reason: "no_recipient" };

  await transport.sendMail({
    from: process.env.SMTP_FROM,
    to: recipients.join(", "),
    subject,
    text,
    html: html || text.replace(/\n/g, "<br>"),
  });
  return { sent: true };
}

async function sendSms({ to, message }) {
  if (!isSmsConfigured()) {
    console.log(`[sms skipped] ${to}: ${String(message || "").slice(0, 80)}`);
    return { sent: false, reason: "sms_not_configured", providerRef: null };
  }
  const recipients = (Array.isArray(to) ? to : [to]).filter(Boolean);
  if (!recipients.length) return { sent: false, reason: "no_recipient", providerRef: null };

  const username = process.env.AFRICASTALKING_USERNAME;
  const apiKey = process.env.AFRICASTALKING_API_KEY;
  const from = process.env.AFRICASTALKING_SENDER || undefined;
  const sandbox = process.env.AFRICASTALKING_SANDBOX === "true";
  const url = sandbox
    ? "https://api.sandbox.africastalking.com/version1/messaging"
    : "https://api.africastalking.com/version1/messaging";

  const body = new URLSearchParams({
    username,
    to: recipients.join(","),
    message,
  });
  if (from) body.set("from", from);

  const res = await fetch(url, {
    method: "POST",
    headers: {
      apiKey,
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }

  const recipient = json?.SMSMessageData?.Recipients?.[0];
  const statusCode = Number(recipient?.statusCode);
  const ok = res.ok && (statusCode === 100 || statusCode === 101 || recipient?.status === "Success");
  if (!ok) {
    const reason =
      recipient?.status ||
      json?.SMSMessageData?.Message ||
      json?.raw ||
      `http_${res.status}`;
    return { sent: false, reason: String(reason), providerRef: recipient?.messageId || null, raw: json };
  }
  return { sent: true, providerRef: recipient?.messageId || null, raw: json };
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

async function sendRenewalFailureDigest({ to, failures, generatedAt }) {
  const count = failures.length;
  const subject = `ADT Renewals — ${count} delivery failure${count === 1 ? "" : "s"}`;
  const lines = failures.slice(0, 80).map((f) => {
    return `• ${f.insuredName} | T-${f.milestone} | ${f.channel.toUpperCase()} → ${f.recipientType} ${f.recipientAddress || "(no address)"} | ${f.errorMessage || f.status}`;
  });
  const text = [
    `The renewal reminder job recorded ${count} failed send(s). No client renewal should be silently missed.`,
    `Generated: ${generatedAt}`,
    "",
    ...lines,
    failures.length > 80 ? `…and ${failures.length - 80} more` : "",
    "",
    "Open the Renewals portal → Delivery Failures to retry or acknowledge.",
  ]
    .filter((line) => line !== "")
    .join("\n");

  return sendEmail({ to, subject, text });
}

async function sendTestEmail(to) {
  return sendEmail({
    to,
    subject: "ADT Motor Valuations — SMTP test",
    text: "This is a test email from the ADT Motor Valuation Tracking system.",
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
  isSmsConfigured,
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
  parseEmailList,
};
