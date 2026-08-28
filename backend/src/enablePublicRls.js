/** Tables in public that the Express API owns. Enable RLS so PostgREST anon/authenticated cannot read them. The backend DATABASE_URL role (postgres / service_role) still bypasses RLS. */
const PUBLIC_APP_TABLES = [
  "users",
  "claims",
  "claim_remarks",
  "claim_status_history",
  "user_audit_logs",
  "quotations",
  "valuers",
  "valuations",
  "valuation_follow_ups",
  "valuation_status_history",
  "valuation_audit_logs",
  "valuation_settings",
  "renewal_policies",
  "renewal_financiers",
  "renewal_notification_logs",
  "renewal_settings",
  "renewal_follow_ups",
  "renewal_attachments",
  "claim_settings",
  "claim_notification_logs",
];

async function enablePublicRowLevelSecurity(pool) {
  for (const table of PUBLIC_APP_TABLES) {
    try {
      await pool.query(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`);
    } catch {
      /* table missing, or pg-mem */
    }
    try {
      await pool.query(`REVOKE ALL ON TABLE public.${table} FROM anon, authenticated`);
    } catch {
      /* anon/authenticated exist only on Supabase */
    }
  }
}

module.exports = { PUBLIC_APP_TABLES, enablePublicRowLevelSecurity };
