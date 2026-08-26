const cron = require("node-cron");
const { runClaimsAutomationJob, runDailyClaimsRegisterEmail } = require("./claimsNotifications");

const NAIROBI = { timezone: "Africa/Nairobi" };

function startClaimScheduler(pool, deps = {}) {
  cron.schedule(
    "15 7 * * *",
    () => {
      runClaimsAutomationJob(pool, deps).catch((err) =>
        console.error("Claims automation scheduler failed:", err)
      );
    },
    NAIROBI
  );

  cron.schedule(
    "30 17 * * *",
    () => {
      runDailyClaimsRegisterEmail(pool, deps).catch((err) =>
        console.error("Daily claims register email failed:", err)
      );
    },
    NAIROBI
  );

  console.log(
    "Claims schedulers registered: 07:15 digest and 17:30 register email (Africa/Nairobi)."
  );
}

module.exports = { startClaimScheduler };
