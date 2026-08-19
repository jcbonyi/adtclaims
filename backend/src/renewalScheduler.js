const cron = require("node-cron");
const { runRenewalReminderJob } = require("./renewals");

function startRenewalScheduler(pool, deps = {}) {
  cron.schedule("30 7 * * *", () => {
    runRenewalReminderJob(pool, deps).catch((err) =>
      console.error("Renewal reminder scheduler failed:", err)
    );
  });
  console.log("Renewal reminder scheduler registered (daily 07:30 Africa/Nairobi if TZ set).");
}

module.exports = { startRenewalScheduler };
