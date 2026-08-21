const DEFAULT_SMS_TEMPLATE =
  "Dear {insuredName}, your ADT policy for {registrations} is due for renewal on {renewalDate} ({daysUntil} days). Call {callbackNumber} to renew. Reply STOP to opt out.";

const DEFAULT_WHATSAPP_TEMPLATE =
  "Dear {insuredName}, your ADT insurance for {registrations} renews on {renewalDate} ({daysUntil} days left). Contact ADT Africa Brokers on {callbackNumber} to renew.";

const DEFAULT_EMAIL_SUBJECT = "Policy renewal reminder — {insuredName} (T-{daysUntil})";

const DEFAULT_EMAIL_BODY = `Dear {insuredName},

This is a reminder that your insurance policy is approaching renewal.

Insured: {insuredName}
Vehicle(s): {registrations}
Insurer: {insurer}
Policy number: {policyNumber}
Renewal / expiry date: {renewalDate}
Days remaining: {daysUntil}

Please contact ADT Africa Insurance Brokers Ltd on {callbackNumber} to arrange renewal.

Reply STOP by SMS to opt out of reminders.`;

const DEFAULT_FINANCIER_SMS =
  "ADT Africa Brokers: Policy for {insuredName} ({registrations}) renews on {renewalDate} ({daysUntil} days). Financial interest: {financierName}. Contact {callbackNumber}.";

const PIPELINE_STAGES = ["Not contacted", "Quoted", "Awaiting payment", "Bound", "Lost"];
const FOLLOW_UP_METHODS = ["Call", "Visit", "Email", "SMS", "WhatsApp", "Note"];
const MILESTONES = [60, 30, 15, 7, 1];

function formatDisplayDate(iso) {
  if (!iso) return "—";
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  return String(iso);
}

function applyTemplate(template, vars) {
  const source = template || "";
  return source.replace(/\{([a-zA-Z0-9_]+)\}/g, (_, key) => {
    const value = vars[key];
    if (value === null || value === undefined || value === "") return "";
    return String(value);
  });
}

function templateVars(ctx) {
  return {
    insuredName: ctx.insuredName || "",
    registrations: ctx.registrations || "your vehicle(s)",
    renewalDate: formatDisplayDate(ctx.renewalDate),
    daysUntil: ctx.daysUntil ?? "",
    insurer: ctx.insurer || "—",
    policyNumber: ctx.policyNumber || "—",
    financierName: ctx.financierName || "",
    phone: ctx.phone || "",
    callbackNumber: ctx.callbackNumber || process.env.RENEWAL_CALLBACK_NUMBER || "ADT",
    officerName: ctx.officerName || "",
  };
}

function nairobiHour() {
  const hour = new Date().toLocaleString("en-GB", {
    timeZone: "Africa/Nairobi",
    hour: "2-digit",
    hour12: false,
  });
  return Number(hour);
}

function inQuietHours(settings) {
  const start = Number(settings.quiet_start_hour ?? 8);
  const end = Number(settings.quiet_end_hour ?? 18);
  const hour = nairobiHour();
  if (start === end) return true;
  if (start < end) return hour >= start && hour < end;
  return hour >= start || hour < end;
}

function addMonths(iso, months) {
  const dateOnly = String(iso).slice(0, 10);
  const match = dateOnly.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const target = new Date(Date.UTC(year, month - 1 + Number(months), 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  const safeDay = Math.min(day, lastDay);
  return `${target.getUTCFullYear()}-${String(target.getUTCMonth() + 1).padStart(2, "0")}-${String(safeDay).padStart(2, "0")}`;
}

function normalizeMatchName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizeRegKey(value) {
  return String(value || "")
    .split(/\s*(?:&|,|;|\+)\s*/)
    .map((part) => part.replace(/[^a-z0-9]/gi, "").toUpperCase())
    .filter(Boolean)
    .sort()
    .join("|");
}

function policyMatchKey({ insuredName, carRegistrations, renewalDate }) {
  return `${normalizeMatchName(insuredName)}::${normalizeRegKey(carRegistrations)}::${String(renewalDate || "").slice(0, 10)}`;
}

function parseInboundIntent(text) {
  const raw = String(text || "").trim();
  const upper = raw.toUpperCase().replace(/[^A-Z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  if (!upper) return { intent: "note", raw };
  if (/\b(STOP|UNSUBSCRIBE|CANCEL|OPTOUT|OPT OUT)\b/.test(upper)) return { intent: "stop", raw };
  if (/\b(START|UNSTOP|RESUME|SUBSCRIBE)\b/.test(upper)) return { intent: "start", raw };
  if (/\b(RENEWED|RENEW|YES|PAID)\b/.test(upper)) return { intent: "renewed", raw };
  return { intent: "note", raw };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isWhatsAppConfigured() {
  if (process.env.WHATSAPP_PHONE_ID && process.env.WHATSAPP_TOKEN) return true;
  return !!(process.env.AFRICASTALKING_USERNAME && process.env.AFRICASTALKING_API_KEY && process.env.AFRICASTALKING_WHATSAPP_FROM);
}

async function sendWhatsApp({ to, message }) {
  if (!isWhatsAppConfigured()) {
    return { sent: false, reason: "whatsapp_not_configured", providerRef: null };
  }
  const recipients = (Array.isArray(to) ? to : [to]).filter(Boolean);
  if (!recipients.length) return { sent: false, reason: "no_recipient", providerRef: null };
  const dest = recipients[0];

  if (process.env.WHATSAPP_PHONE_ID && process.env.WHATSAPP_TOKEN) {
    const url = `https://graph.facebook.com/v20.0/${process.env.WHATSAPP_PHONE_ID}/messages`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: dest.replace(/^\+/, ""),
        type: "text",
        text: { body: message },
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { sent: false, reason: json?.error?.message || `http_${res.status}`, providerRef: null, raw: json };
    }
    return { sent: true, providerRef: json?.messages?.[0]?.id || null, raw: json };
  }

  const username = process.env.AFRICASTALKING_USERNAME;
  const apiKey = process.env.AFRICASTALKING_API_KEY;
  const from = process.env.AFRICASTALKING_WHATSAPP_FROM;
  const sandbox = process.env.AFRICASTALKING_SANDBOX === "true";
  const url = sandbox
    ? "https://api.sandbox.africastalking.com/version1/messaging"
    : "https://api.africastalking.com/version1/messaging";
  const body = new URLSearchParams({
    username,
    to: dest,
    message,
    from,
    channel: "whatsapp",
  });
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
  const ok = res.ok && (recipient?.status === "Success" || Number(recipient?.statusCode) === 101 || Number(recipient?.statusCode) === 100);
  if (!ok) {
    return {
      sent: false,
      reason: recipient?.status || json?.SMSMessageData?.Message || `http_${res.status}`,
      providerRef: recipient?.messageId || null,
      raw: json,
    };
  }
  return { sent: true, providerRef: recipient?.messageId || null, raw: json };
}

async function queryAfricasTalkingMessage(messageId) {
  if (!process.env.AFRICASTALKING_USERNAME || !process.env.AFRICASTALKING_API_KEY || !messageId) {
    return { status: "unknown" };
  }
  const sandbox = process.env.AFRICASTALKING_SANDBOX === "true";
  const url = new URL(
    sandbox
      ? "https://api.sandbox.africastalking.com/version1/messaging"
      : "https://api.africastalking.com/version1/messaging"
  );
  url.searchParams.set("username", process.env.AFRICASTALKING_USERNAME);
  url.searchParams.set("messageId", messageId);
  const res = await fetch(url, {
    headers: {
      apiKey: process.env.AFRICASTALKING_API_KEY,
      Accept: "application/json",
    },
  });
  const json = await res.json().catch(() => ({}));
  const recipient = json?.SMSMessageData?.Recipients?.[0];
  const rawStatus = String(recipient?.status || json?.status || "").toLowerCase();
  if (rawStatus.includes("deliver")) return { status: "delivered", raw: json };
  if (rawStatus.includes("reject") || rawStatus.includes("fail") || rawStatus.includes("undeliver")) {
    return { status: "undelivered", raw: json };
  }
  if (rawStatus.includes("sent") || rawStatus.includes("success")) return { status: "sent", raw: json };
  return { status: "unknown", raw: json };
}

module.exports = {
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
  formatDisplayDate,
  nairobiHour,
  inQuietHours,
  addMonths,
  policyMatchKey,
  parseInboundIntent,
  sleep,
  isWhatsAppConfigured,
  sendWhatsApp,
  queryAfricasTalkingMessage,
};
