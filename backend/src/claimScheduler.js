const cron = require("node-cron");
const { runClaimsAutomationJob } = require("./claimsNotifications");

function startClaimScheduler(pool, deps = {}) {
  cron.schedule("15 7 * * *", () => {
    runClaimsAutomationJob(pool, deps).catch((err) =>
      console.error("Claims automation scheduler failed:", err)
    );
  });
  console.log("Claims automation scheduler registered (daily 07:15 Africa/Nairobi if TZ set).");
}

module.exports = { startClaimScheduler };
