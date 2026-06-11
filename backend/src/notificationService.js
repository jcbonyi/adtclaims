const nodemailer = require("nodemailer");

let transporter = null;

function isSmtpConfigured() {
  return !!(process.env.SMTP_HOST && process.env.SMTP_FROM);
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
    case "inspection_reminder":
      await sendEmail({
        to: [officerEmail, valuerEmail].filter(Boolean),
        subject: `Inspection reminder: ${valuation.insuredName}`,
        text: `Inspection is scheduled for ${valuation.inspectionDate || "soon"}.\n\n${summary}`,
      });
      break;
    case "overdue":
      await sendEmail({
        to: [officerEmail, ...managementRecipients()],
        subject: `Overdue valuation: ${valuation.insuredName}`,
        text: `This valuation is overdue (no inspection within the compliance window).\n\n${summary}`,
      });
      break;
    case "missing_report":
      await sendEmail({
        to: officerEmail,
        subject: `Missing valuation report: ${valuation.insuredName}`,
        text: `Inspection was completed but the valuation report has not been received.\n\n${summary}`,
      });
      break;
    case "renewal_risk":
      await sendEmail({
        to: valuation.relationshipManager
          ? [valuation.relationshipManager]
          : managementRecipients(),
        subject: `Renewal approaching — valuation pending: ${valuation.insuredName}`,
        text: `Policy renewal is approaching and valuation is not yet complete.\n\n${summary}\nRenewal: ${valuation.policyRenewalDate || "—"}`,
      });
      break;
    default:
      break;
  }
}

async function sendTestEmail(to) {
  return sendEmail({
    to,
    subject: "ADT Motor Valuations — SMTP test",
    text: "This is a test email from the ADT Motor Valuation Tracking system.",
  });
}

module.exports = {
  isSmtpConfigured,
  notifyValuationEvent,
  sendTestEmail,
  sendEmail,
};
