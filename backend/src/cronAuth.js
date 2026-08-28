function isCronAuthorized(req) {
  const secret = String(process.env.CRON_SECRET || process.env.ADMIN_RESET_KEY || "").trim();
  const auth = String(req.headers.authorization || "");
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  const header = String(req.headers["x-cron-secret"] || "").trim();
  const query = String(req.query.secret || "").trim();
  if (secret && (bearer === secret || header === secret || query === secret)) return true;
  if (process.env.VERCEL && /vercel-cron/i.test(String(req.headers["user-agent"] || ""))) {
    return true;
  }
  return false;
}

module.exports = { isCronAuthorized };
