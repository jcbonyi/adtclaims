const cron = require("node-cron");
const { runRenewalReminderJob, pollDeliveryReports } = require("./renewals");

function startRenewalScheduler(pool, deps = {}) {
  const NAIROBI = { timezone: "Africa/Nairobi" };
  cron.schedule(
    "0 8 * * *",
    () => {
      runRenewalReminderJob(pool, deps).catch((err) =>
        console.error("Renewal reminder scheduler failed:", err)
      );
    },
    NAIROBI
  );
  cron.schedule("15 * * * *", () => {
    pollDeliveryReports(pool, deps).catch((err) =>
      console.error("Renewal DLR poll failed:", err)
    );
  });
  console.log("Renewal reminder scheduler registered (daily 08:00 Africa/Nairobi + hourly delivery receipts).");
}

module.exports = { startRenewalScheduler };
