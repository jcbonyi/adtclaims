import { useDeferredValue, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "../../../context/AuthContext";
import {
  clearRenewalRegister,
  downloadRenewalsExcel,
  downloadRenewalsTemplate,
  importRenewalsExcel,
} from "../api/renewalsApi";
import { renewalsPath } from "../basePath";
import { canEditRenewals, canManageRenewalSettings, daysUntilLabel, daysUntilTone, isDayCount, KPI_FILTER_LABELS, POLICY_STATUSES } from "../constants";
import { formatDisplayDate } from "../../valuationRegister/utils/format";
import { StatusBadge } from "./StatusBadge";
import { AlertBanner, Button, Card, EmptyState, FilterBar, PageHeader } from "./ui";

export function Register({ policies, onView, onCreate, onReload }) {
  const { user } = useAuth();
  const importRef = useRef(null);
  const [searchParams] = useSearchParams();
  const windowFilter = searchParams.get("window") || "";
  const [filters, setFilters] = useState({
    q: searchParams.get("q") || "",
    status: "",
  });
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [clearResult, setClearResult] = useState(null);

  const deferredQ = useDeferredValue(filters.q);
  const hasActiveFilters = Boolean(filters.q || filters.status || windowFilter);

  const rows = useMemo(() => {
    return policies.filter((p) => {
      if (filters.status && p.status !== filters.status) return false;
      if (windowFilter === "t60" && !(p.status === "Active" && isDayCount(p.daysUntilRenewal) && p.daysUntilRenewal > 30 && p.daysUntilRenewal <= 60)) return false;
      if (windowFilter === "t30" && !(p.status === "Active" && isDayCount(p.daysUntilRenewal) && p.daysUntilRenewal > 15 && p.daysUntilRenewal <= 30)) return false;
      if (windowFilter === "t15" && !(p.status === "Active" && isDayCount(p.daysUntilRenewal) && p.daysUntilRenewal >= 0 && p.daysUntilRenewal <= 15)) return false;
      if (windowFilter === "later" && !(p.status === "Active" && isDayCount(p.daysUntilRenewal) && p.daysUntilRenewal > 60)) return false;
      if (windowFilter === "overdue" && !(p.status === "Active" && isDayCount(p.daysUntilRenewal) && p.daysUntilRenewal < 0)) return false;
      if (deferredQ) {
        const q = deferredQ.toLowerCase();
        const hay = `${p.insuredName} ${p.carRegistrations} ${p.phoneRaw} ${p.phoneE164} ${p.financialInterest} ${p.insurer}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [policies, filters.status, deferredQ, windowFilter]);

  const kpiLabel = KPI_FILTER_LABELS[windowFilter];

  async function handleExportExcel() {
    setExporting(true);
    try {
      await downloadRenewalsExcel({
        q: filters.q || undefined,
        status: filters.status || undefined,
        window: windowFilter || undefined,
      });
    } catch (err) {
      console.error(err);
      window.alert("Excel export failed.");
    } finally {
      setExporting(false);
    }
  }

  async function handleImportFile(file) {
    if (!file || !canEditRenewals(user?.role)) return;
    setImporting(true);
    setImportResult(null);
    try {
      const result = await importRenewalsExcel(file);
      setImportResult(result);
      await onReload?.();
    } catch (err) {
      console.error(err);
      window.alert(err.response?.data?.message || "Excel import failed.");
    } finally {
      setImporting(false);
      if (importRef.current) importRef.current.value = "";
    }
  }

  async function handleClearRegister() {
    if (!canManageRenewalSettings(user?.role)) return;
    const confirmed = window.confirm(
      `Clear the entire renewals register?\n\nThis deletes all ${policies.length} policy record(s) and send logs.`
    );
    if (!confirmed) return;
    const typed = window.prompt("Type CLEAR to confirm:");
    if (typed?.trim().toUpperCase() !== "CLEAR") return;
    setClearing(true);
    try {
      const result = await clearRenewalRegister();
      setClearResult(result);
      await onReload?.();
    } catch (err) {
      window.alert(err.response?.data?.message || "Failed to clear register.");
    } finally {
      setClearing(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Policy Register"
        subtitle={
          kpiLabel
            ? `${kpiLabel} — showing ${rows.length} record${rows.length === 1 ? "" : "s"}`
            : `Showing ${rows.length} of ${policies.length} policies. Import the Excel sheet or add records manually.`
        }
        actions={
          <>
            <Button tone="primary" onClick={handleExportExcel} disabled={exporting}>
              {exporting ? "Exporting…" : "Export Excel"}
            </Button>
            {canEditRenewals(user?.role) ? (
              <>
                <Button tone="secondary" onClick={() => importRef.current?.click()} disabled={importing}>
                  {importing ? "Importing…" : "Import Excel"}
                </Button>
                <input
                  ref={importRef}
                  type="file"
                  accept=".xls,.xlsx"
                  style={{ display: "none" }}
                  onChange={(e) => handleImportFile(e.target.files?.[0])}
                />
                <Button tone="ghost" onClick={() => downloadRenewalsTemplate().catch(() => window.alert("Could not download template."))}>
                  Download template
                </Button>
                <Button tone="accent" onClick={onCreate}>
                  Add policy
                </Button>
              </>
            ) : null}
            {canManageRenewalSettings(user?.role) ? (
              <Button tone="danger" onClick={handleClearRegister} disabled={clearing || policies.length === 0}>
                {clearing ? "Clearing…" : "Clear Register"}
              </Button>
            ) : null}
          </>
        }
      />

      {kpiLabel ? (
        <AlertBanner tone="info">
          Dashboard filter: <strong>{kpiLabel}</strong>{" "}
          <Link to={renewalsPath("register")} className="adt-link-btn" style={{ marginLeft: 8 }}>
            Clear filter
          </Link>
        </AlertBanner>
      ) : null}

      {clearResult ? (
        <AlertBanner tone="success" onDismiss={() => setClearResult(null)}>
          Register cleared — removed <strong>{clearResult.deleted ?? 0}</strong> policy record(s).
        </AlertBanner>
      ) : null}

      {importResult ? (
        <AlertBanner tone="success" onDismiss={() => setImportResult(null)}>
          <p style={{ margin: 0 }}>
            Imported <strong>{importResult.inserted}</strong> of {importResult.totalRows} rows
            {importResult.headerRowIndex ? ` (header row ${importResult.headerRowIndex})` : ""}.
          </p>
          {importResult.warnings?.length ? (
            <ul className="val-alert-list">
              {importResult.warnings.slice(0, 8).map((w, i) => (
                <li key={i}>
                  Row {w.row}: {w.reason}
                </li>
              ))}
              {importResult.warnings.length > 8 ? <li>…and {importResult.warnings.length - 8} more</li> : null}
            </ul>
          ) : null}
        </AlertBanner>
      ) : null}

      <FilterBar
        showClear={hasActiveFilters}
        onClear={() => setFilters({ q: "", status: "" })}
      >
        <input
          className="adt-input val-filter-input"
          placeholder="Search insured, reg, phone, financier…"
          value={filters.q}
          onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
          aria-label="Search policies"
        />
        <select
          className="adt-input val-filter-input"
          value={filters.status}
          onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
          aria-label="Filter by status"
        >
          <option value="">All statuses</option>
          {POLICY_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </FilterBar>

      {rows.length === 0 ? (
        <EmptyState title="No results">
          {hasActiveFilters
            ? "No policies match your filters."
            : "No policies yet. Import the Excel register or add a policy."}
        </EmptyState>
      ) : (
        <Card padding={false}>
          <div className="adt-table-wrap">
            <table className="adt-table val-register-table">
              <thead>
                <tr>
                  <th>Insured</th>
                  <th>Vehicles</th>
                  <th>Renewal</th>
                  <th>Countdown</th>
                  <th>Phone</th>
                  <th>Financier</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.id}
                    className={`val-row-clickable${row.daysUntilRenewal < 0 ? " adt-row--danger" : ""}`}
                    onClick={() => onView(row.id)}
                  >
                    <td className="val-insured-cell">{row.insuredName}</td>
                    <td>{row.carRegistrations || "—"}</td>
                    <td>{formatDisplayDate(row.renewalDate)}</td>
                    <td>
                      <span className={`rn-days rn-days--${daysUntilTone(row.daysUntilRenewal)}`}>
                        {daysUntilLabel(row.daysUntilRenewal)}
                      </span>
                    </td>
                    <td>{row.phoneE164 || row.phoneRaw || "—"}</td>
                    <td>{row.financierNames.join(", ") || "—"}</td>
                    <td>
                      <StatusBadge status={row.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  );
}
