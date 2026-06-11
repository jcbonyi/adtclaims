/**
 * Clears all valuation register rows (keeps valuers and settings).
 * Usage: node scripts/clearValuationRegister.js
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");
const { clearValuationRegister } = require("../src/valuations");

const SNAPSHOT_FILE =
  process.env.INMEMORY_SNAPSHOT_PATH ||
  path.join(__dirname, "..", ".persist", "in-memory-db-snapshot.json");

async function clearSnapshotFile() {
  if (!fs.existsSync(SNAPSHOT_FILE)) return;
  const snapshot = JSON.parse(fs.readFileSync(SNAPSHOT_FILE, "utf8"));
  snapshot.valuations = [];
  snapshot.valuationFollowUps = [];
  snapshot.valuationStatusHistory = [];
  snapshot.valuationAuditLogs = [];
  fs.writeFileSync(SNAPSHOT_FILE, JSON.stringify(snapshot, null, 2));
  console.log("Cleared valuation data from in-memory snapshot.");
}

async function main() {
  let deleted = 0;
  if (process.env.DATABASE_URL) {
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      connectionTimeoutMillis: 5000,
    });
    try {
      const result = await clearValuationRegister(pool);
      deleted = result.deleted;
      console.log(`Deleted ${deleted} valuation(s) from database.`);
    } catch (err) {
      if (err.code === "ECONNREFUSED" || err.code === "ENOTFOUND") {
        console.warn("Database unavailable — cleared snapshot file only.");
      } else {
        throw err;
      }
    } finally {
      await pool.end().catch(() => {});
    }
  }
  await clearSnapshotFile();
  console.log("Valuation register is empty. Valuers and settings were kept.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
