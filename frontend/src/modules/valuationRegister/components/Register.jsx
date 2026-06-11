import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../../../context/AuthContext";
import { useValuations } from "../context/useValuations";
import { VALUATION_STATUSES, canEditValuations } from "../constants";
import { StatusBadge } from "./StatusBadge";
import { Button, EmptyState, PageHeader } from "./ui";

export function Register({ onView, onCreate }) {
  const { user } = useAuth();
  const { state } = useValuations();
  const [searchParams] = useSearchParams();
  const [filters, setFilters] = useState({
    q: searchParams.get("q") || "",
    status: "",
    insurer: "",
    valuerId: "",
  });

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

  return (
    <>
      <PageHeader
        title="Valuation Register"
        subtitle="All motor valuations with status, compliance flags, and value variance."
        actions={
          canEditValuations(user?.role) ? (
            <Button tone="primary" onClick={onCreate}>Add Valuation</Button>
          ) : null
        }
      />

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
