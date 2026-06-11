const cron = require("node-cron");
const { recomputeComplianceFlags, getSettings, rowToClient } = require("./valuations");
const { notifyValuationEvent } = require("./notificationService");

const COMPLETED_STATUSES = new Set(["Valuation Report Received", "Closed"]);

function daysBetween(fromDate, toDate) {
  if (!fromDate) return 0;
  const start = new Date(fromDate);
  const end = toDate ? new Date(toDate) : new Date();
  const startUtc = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
  const endUtc = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());
  return Math.floor((endUtc - startUtc) / (1000 * 60 * 60 * 24));
}

function isRenewalAtRisk(row, settings) {
  if (COMPLETED_STATUSES.has(row.status)) return false;
  if (!row.policy_renewal_date) return false;
  const alertDays = settings?.renewal_alert_days ?? 30;
  const daysUntil = daysBetween(new Date().toISOString().slice(0, 10), row.policy_renewal_date);
  return daysUntil >= 0 && daysUntil <= alertDays;
}

async function runComplianceChecks(pool) {
  const settings = await getSettings(pool);
  await recomputeComplianceFlags(pool, settings);

  const rows = await pool.query(`
    SELECT v.*, vr.email AS valuer_email, vr.name AS valuer_name,
           u.email AS officer_email, u.name AS officer_name
    FROM valuations v
    LEFT JOIN valuers vr ON vr.id = v.assigned_valuer_id
    LEFT JOIN users u ON u.id = v.assigned_officer_id
    WHERE v.requires_valuation = TRUE
  `);

  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

  for (const row of rows.rows) {
    const valuation = rowToClient(row, {
      valuerName: row.valuer_name,
      officerName: row.officer_name,
    });
    const extras = { officerEmail: row.officer_email, valuerEmail: row.valuer_email };

    if (row.is_overdue) {
      await notifyValuationEvent("overdue", valuation, extras);
    }

    if (row.inspection_date === tomorrow) {
      await notifyValuationEvent("inspection_reminder", valuation, extras);
    }

    if (
      row.inspection_date &&
      !COMPLETED_STATUSES.has(row.status) &&
      daysBetween(row.inspection_date) >= 3
    ) {
      await notifyValuationEvent("missing_report", valuation, extras);
    }

    if (isRenewalAtRisk(row, settings)) {
      await notifyValuationEvent("renewal_risk", valuation, extras);
    }
  }
}

function startValuationScheduler(pool) {
  cron.schedule("0 7 * * *", () => {
    runComplianceChecks(pool).catch((err) =>
      console.error("Valuation compliance scheduler failed:", err)
    );
  });
  console.log("Valuation compliance scheduler registered (daily 07:00).");
}

module.exports = { startValuationScheduler, runComplianceChecks };
