import { useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../../../context/AuthContext";
import { useValuations } from "../context/useValuations";
import {
  downloadValuationsExcel,
  downloadValuationsTemplate,
  importValuationsExcel,
} from "../api/valuationsApi";
import { VALUATION_STATUSES, canEditValuations } from "../constants";
import { StatusBadge } from "./StatusBadge";
import { Button, EmptyState, PageHeader } from "./ui";

export function Register({ onView, onCreate }) {
  const { user } = useAuth();
  const { state, reloadFromServer } = useValuations();
  const importRef = useRef(null);
  const [searchParams] = useSearchParams();
  const [filters, setFilters] = useState({
    q: searchParams.get("q") || "",
    status: "",
    insurer: "",
    valuerId: "",
  });
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);

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
    return state.valuations.filter((v) => {
      if (filters.status && v.status !== filters.status) return false;
      if (filters.insurer && !v.insuranceCompany?.toLowerCase().includes(filters.insurer.toLowerCase())) return false;
      if (filters.valuerId && String(v.assignedValuerId) !== filters.valuerId) return false;
      if (filters.q) {
        const q = filters.q.toLowerCase();
        const hay = `${v.insuredName} ${v.vehicleRegistration} ${v.insuranceCompany} ${v.policyNumber}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [state.valuations, filters]);

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

  async function handleImportFile(file) {
    if (!file || !canEditValuations(user?.role)) return;
    setImporting(true);
    setImportResult(null);
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
        subtitle={`Showing ${rows.length} of ${state.valuations.length} valuations.`}
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
          </>
        }
      />

      {importResult ? (
        <div
          className="adt-card"
          style={{ marginBottom: 16, padding: 12, background: "#ECFDF5", border: "1px solid #10B981" }}
        >
          <p style={{ margin: 0 }}>
            Imported <strong>{importResult.inserted}</strong> of {importResult.totalRows} rows
            {importResult.headerRowIndex
              ? ` (header row ${importResult.headerRowIndex})`
              : ""}
            .
          </p>
          {importResult.warnings?.length ? (
            <ul style={{ margin: "8px 0 0", paddingLeft: 20, fontSize: 13 }}>
              {importResult.warnings.slice(0, 8).map((w, i) => (
                <li key={i}>Row {w.row}: {w.reason}</li>
              ))}
              {importResult.warnings.length > 8 ? (
                <li>…and {importResult.warnings.length - 8} more</li>
              ) : null}
            </ul>
          ) : null}
        </div>
      ) : null}

      <div className="adt-filter-bar" style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
        <input
          className="adt-input"
          placeholder="Search insured, reg, insurer…"
          value={filters.q}
          onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
        />
        <select
          className="adt-input"
          value={filters.status}
          onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
        >
          <option value="">All statuses</option>
          {VALUATION_STATUSES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <input
          className="adt-input"
          placeholder="Insurer"
          value={filters.insurer}
          onChange={(e) => setFilters((f) => ({ ...f, insurer: e.target.value }))}
        />
        <select
          className="adt-input"
          value={filters.valuerId}
          onChange={(e) => setFilters((f) => ({ ...f, valuerId: e.target.value }))}
        >
          <option value="">All valuers</option>
          {state.valuers.map((v) => (
            <option key={v.id} value={v.id}>{v.name}</option>
          ))}
        </select>
      </div>

      {rows.length === 0 ? (
        <EmptyState>No valuations match your filters.</EmptyState>
      ) : (
        <div className="adt-table-wrap">
          <table className="adt-table">
            <thead>
              <tr>
                <th>Insured</th>
                <th>Reg</th>
                <th>Insurer</th>
                <th>Valuer</th>
                <th>Request</th>
                <th>Inspection</th>
                <th>Variance</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.id}
                  className={row.isOverdue ? "adt-row--danger" : ""}
                  onClick={() => onView(row.id)}
                  style={{ cursor: "pointer" }}
                >
                  <td>{row.insuredName}</td>
                  <td>{row.vehicleRegistration}</td>
                  <td>{row.insuranceCompany}</td>
                  <td>{row.valuerName || "—"}</td>
                  <td>{row.valuationRequestDate || "—"}</td>
                  <td>{row.inspectionDate || "—"}</td>
                  <td>
                    {row.percentageVariance != null ? `${row.percentageVariance}%` : "—"}
                  </td>
                  <td><StatusBadge status={row.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
