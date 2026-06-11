import { useDeferredValue, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "../../../context/AuthContext";
import { useValuations } from "../context/useValuations";
import {
  clearValuationRegister,
  downloadValuationsExcel,
  downloadValuationsTemplate,
  importValuationsExcel,
} from "../api/valuationsApi";
import { valuationPath } from "../basePath";
import {
  KPI_FILTER_LABELS,
  VALUATION_STATUSES,
  canEditValuations,
  canManageValuers,
  filterValuationsByKpi,
} from "../constants";
import { formatDisplayDate } from "../utils/format";
import { StatusBadge } from "./StatusBadge";
import {
  AlertBanner,
  Button,
  Card,
  EmptyState,
  FilterBar,
  PageHeader,
  VarianceBadge,
} from "./ui";

export function Register({ onView, onCreate }) {
  const { user } = useAuth();
  const { state, reloadFromServer } = useValuations();
  const importRef = useRef(null);
  const [searchParams] = useSearchParams();
  const kpiFilter = searchParams.get("kpi") || "";
  const [filters, setFilters] = useState({
    q: searchParams.get("q") || "",
    status: "",
    insurer: "",
    valuerId: "",
  });
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [clearResult, setClearResult] = useState(null);

  const deferredQ = useDeferredValue(filters.q);
  const hasActiveFilters = Boolean(filters.q || filters.status || filters.insurer || filters.valuerId);

  const exportParams = useMemo(
    () => ({
      q: filters.q || undefined,
      status: filters.status || undefined,
      insurer: filters.insurer || undefined,
      valuerId: filters.valuerId || undefined,
    }),
    [filters]
  );

  const rows = useMemo(() => {
    const kpiScoped = kpiFilter
      ? filterValuationsByKpi(state.valuations, kpiFilter)
      : state.valuations;
    return kpiScoped.filter((v) => {
      if (filters.status && v.status !== filters.status) return false;
      if (filters.insurer && !v.insuranceCompany?.toLowerCase().includes(filters.insurer.toLowerCase())) return false;
      if (filters.valuerId && String(v.assignedValuerId) !== filters.valuerId) return false;
      if (deferredQ) {
        const q = deferredQ.toLowerCase();
        const hay = `${v.insuredName} ${v.vehicleRegistration} ${v.insuranceCompany}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [state.valuations, filters.status, filters.insurer, filters.valuerId, deferredQ, kpiFilter]);

  const kpiLabel = KPI_FILTER_LABELS[kpiFilter];

  function clearFilters() {
    setFilters({ q: "", status: "", insurer: "", valuerId: "" });
  }

  async function handleExportExcel() {
    setExporting(true);
    try {
      await downloadValuationsExcel(exportParams);
    } catch (err) {
      console.error(err);
      window.alert("Excel export failed. Please try again.");
    } finally {
      setExporting(false);
    }
  }

  async function handleDownloadTemplate() {
    try {
      await downloadValuationsTemplate();
    } catch (err) {
      console.error(err);
      window.alert("Could not download template.");
    }
  }

  async function handleClearRegister() {
    if (!canManageValuers(user?.role)) return;
    const confirmed = window.confirm(
      `Clear the entire valuation register?\n\nThis will permanently delete all ${state.valuations.length} valuation(s), follow-ups, and history. Valuers will be kept.\n\nUse this before a fresh Excel import if you have duplicate entries.`
    );
    if (!confirmed) return;
    const typed = window.prompt('Type CLEAR to confirm deletion of all valuations:');
    if (typed?.trim().toUpperCase() !== "CLEAR") return;

    setClearing(true);
    setClearResult(null);
    setImportResult(null);
    try {
      const result = await clearValuationRegister();
      setClearResult(result);
      await reloadFromServer();
    } catch (err) {
      console.error(err);
      window.alert(err.response?.data?.message || "Failed to clear register.");
    } finally {
      setClearing(false);
    }
  }

  async function handleImportFile(file) {
    if (!file || !canEditValuations(user?.role)) return;
    setImporting(true);
    setImportResult(null);
    setClearResult(null);
    try {
      const result = await importValuationsExcel(file);
      setImportResult(result);
      await reloadFromServer();
    } catch (err) {
      console.error(err);
      window.alert(err.response?.data?.message || "Excel import failed.");
    } finally {
      setImporting(false);
      if (importRef.current) importRef.current.value = "";
    }
  }

  return (
    <>
      <PageHeader
        title="Valuation Register"
        subtitle={
          kpiLabel
            ? `${kpiLabel} — showing ${rows.length} record${rows.length === 1 ? "" : "s"}`
            : `Showing ${rows.length} of ${state.valuations.length} valuations.`
        }
        actions={
          <>
            <Button tone="primary" onClick={handleExportExcel} disabled={exporting}>
              {exporting ? "Exporting…" : "Export Excel"}
            </Button>
            {canEditValuations(user?.role) ? (
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
                <Button tone="ghost" onClick={handleDownloadTemplate}>
                  Download template
                </Button>
                <Button tone="accent" onClick={onCreate}>
                  Add Valuation
                </Button>
              </>
            ) : null}
            {canManageValuers(user?.role) ? (
              <Button tone="danger" onClick={handleClearRegister} disabled={clearing || state.valuations.length === 0}>
                {clearing ? "Clearing…" : "Clear Register"}
              </Button>
            ) : null}
          </>
        }
      />

      {kpiLabel ? (
        <AlertBanner tone="info">
          Dashboard filter: <strong>{kpiLabel}</strong>{" "}
          <Link to={valuationPath("register")} className="adt-link-btn" style={{ marginLeft: 8 }}>
            Clear filter
          </Link>
        </AlertBanner>
      ) : null}

      {clearResult ? (
        <AlertBanner tone="success" onDismiss={() => setClearResult(null)}>
          Register cleared — removed <strong>{clearResult.deleted ?? 0}</strong> valuation(s). You can import your Excel file now.
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
                <li key={i}>Row {w.row}: {w.reason}</li>
              ))}
              {importResult.warnings.length > 8 ? (
                <li>…and {importResult.warnings.length - 8} more</li>
              ) : null}
            </ul>
          ) : null}
        </AlertBanner>
      ) : null}

      <FilterBar showClear={hasActiveFilters} onClear={clearFilters}>
        <input
          className="adt-input val-filter-input"
          placeholder="Search insured, reg, insurer…"
          value={filters.q}
          onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
          aria-label="Search valuations"
        />
        <select
          className="adt-input val-filter-input"
          value={filters.status}
          onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
          aria-label="Filter by status"
        >
          <option value="">All statuses</option>
          {VALUATION_STATUSES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <input
          className="adt-input val-filter-input"
          placeholder="Insurer"
          value={filters.insurer}
          onChange={(e) => setFilters((f) => ({ ...f, insurer: e.target.value }))}
          aria-label="Filter by insurer"
        />
        <select
          className="adt-input val-filter-input"
          value={filters.valuerId}
          onChange={(e) => setFilters((f) => ({ ...f, valuerId: e.target.value }))}
          aria-label="Filter by valuer"
        >
          <option value="">All valuers</option>
          {state.valuers.map((v) => (
            <option key={v.id} value={v.id}>{v.name}</option>
          ))}
        </select>
      </FilterBar>

      {rows.length === 0 ? (
        <EmptyState title="No results">
          {hasActiveFilters || kpiLabel
            ? "No valuations match your filters. Try clearing filters or adjusting your search."
            : "No valuations in the register yet. Add one manually or import from Excel."}
        </EmptyState>
      ) : (
        <Card padding={false}>
          <div className="adt-table-wrap">
            <table className="adt-table val-register-table">
              <thead>
                <tr>
                  <th>Insured</th>
                  <th>Reg</th>
                  <th>Insurer</th>
                  <th>Valuer</th>
                  <th>Request</th>
                  <th>Variance</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.id}
                    className={`val-row-clickable${row.isOverdue ? " adt-row--danger" : ""}`}
                    onClick={() => onView(row.id)}
                  >
                    <td className="val-insured-cell">{row.insuredName}</td>
                    <td>{row.vehicleRegistration || "—"}</td>
                    <td>{row.insuranceCompany || "—"}</td>
                    <td>{row.valuerName || "—"}</td>
                    <td>{formatDisplayDate(row.valuationRequestDate)}</td>
                    <td>
                      <VarianceBadge
                        value={row.valueDifference}
                        percentage={row.percentageVariance}
                      />
                    </td>
                    <td><StatusBadge status={row.status} /></td>
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
