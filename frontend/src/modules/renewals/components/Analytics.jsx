import { useEffect, useState } from "react";
import { downloadMonthlyReport, fetchMonthlyReport } from "../api/renewalsApi";
import { formatKes } from "../constants";
import { AlertBanner, Button, Card, EmptyState, LoadingState, PageHeader } from "./ui";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function Analytics() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [report, setReport] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetchMonthlyReport({ year, month })
      .then(setReport)
      .catch((err) => setError(err.response?.data?.message || "Failed to load report"))
      .finally(() => setLoading(false));
  }, [year, month]);

  return (
    <>
      <PageHeader
        title="Production report"
        subtitle="Renewed vs lapsed vs still open, by insurer and relationship manager, for policies due in the selected month."
        actions={
          <Button tone="primary" onClick={() => downloadMonthlyReport({ year, month })}>
            Export Excel
          </Button>
        }
      />
      <div className="val-filter-bar" style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <select className="adt-input" value={month} onChange={(e) => setMonth(Number(e.target.value))}>
          {MONTHS.map((label, idx) => (
            <option key={label} value={idx + 1}>
              {label}
            </option>
          ))}
        </select>
        <select className="adt-input" value={year} onChange={(e) => setYear(Number(e.target.value))}>
          {[year - 1, year, year + 1].map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </div>
      {error ? <AlertBanner tone="warning">{error}</AlertBanner> : null}
      {loading ? (
        <LoadingState label="Loading report…" />
      ) : !report ? (
        <EmptyState title="No report">Could not load production figures.</EmptyState>
      ) : (
        <>
          <div className="val-kpi-row">
            <Card>
              <p className="rn-muted">Due this month</p>
              <p className="adt-kpi-value">{report.counts.total}</p>
            </Card>
            <Card>
              <p className="rn-muted">Renewed / bound</p>
              <p className="adt-kpi-value">{report.counts.renewed}</p>
            </Card>
            <Card>
              <p className="rn-muted">Lapsed / lost</p>
              <p className="adt-kpi-value">{report.counts.lapsed}</p>
            </Card>
            <Card>
              <p className="rn-muted">Still open</p>
              <p className="adt-kpi-value">{report.counts.open}</p>
            </Card>
            <Card>
              <p className="rn-muted">Conversion</p>
              <p className="adt-kpi-value">{report.conversionPct}%</p>
            </Card>
            <Card>
              <p className="rn-muted">Premium at risk</p>
              <p className="adt-kpi-value">{formatKes(report.premiumAtRisk)}</p>
            </Card>
          </div>
          <Card>
            <h3 className="adt-card-header">By insurer</h3>
            <BreakdownTable rows={report.byInsurer} />
          </Card>
          <Card>
            <h3 className="adt-card-header">By relationship manager</h3>
            <BreakdownTable rows={report.byOfficer} />
          </Card>
        </>
      )}
    </>
  );
}

function BreakdownTable({ rows }) {
  if (!rows?.length) return <p className="rn-muted">No policies in this month.</p>;
  return (
    <div className="adt-table-wrap">
      <table className="adt-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Total</th>
            <th>Renewed</th>
            <th>Lapsed</th>
            <th>Open</th>
            <th>Premium</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label}>
              <td>{row.label}</td>
              <td>{row.total}</td>
              <td>{row.renewed}</td>
              <td>{row.lapsed}</td>
              <td>{row.open}</td>
              <td>{formatKes(row.premium)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
