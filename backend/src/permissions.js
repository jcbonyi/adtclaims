const ROLES = ["Admin", "Claims Officer", "Operations Team", "Management", "Read-Only"];

const ROLE_SQL_LIST = ROLES.map((r) => `'${r}'`).join(", ");

function canEditClaims(role) {
  return ["Admin", "Claims Officer"].includes(role);
}

function canEditValuations(role) {
  return ["Admin", "Claims Officer", "Operations Team"].includes(role);
}

function canViewValuationReports(role) {
  return ROLES.includes(role);
}

function canManageValuers(role) {
  return role === "Admin";
}

function canManageUsers(role) {
  return role === "Admin";
}

function canEditRenewals(role) {
  return ["Admin", "Claims Officer", "Operations Team"].includes(role);
}

function canViewRenewals(role) {
  return ROLES.includes(role);
}

function canManageRenewalSettings(role) {
  return role === "Admin";
}

function canManageClaimSettings(role) {
  return role === "Admin";
}

function canRunClaimJobs(role) {
  return ["Admin", "Claims Officer", "Operations Team"].includes(role);
}

function requirePermission(checkFn) {
  return (req, res, next) => {
    if (!checkFn(req.user?.role)) {
      return res.status(403).json({ message: "Insufficient permissions" });
    }
    return next();
  };
}

module.exports = {
  ROLES,
  ROLE_SQL_LIST,
  canEditClaims,
  canEditValuations,
  canViewValuationReports,
  canManageValuers,
  canManageUsers,
  canEditRenewals,
  canViewRenewals,
  canManageRenewalSettings,
  canManageClaimSettings,
  canRunClaimJobs,
  requirePermission,
};
