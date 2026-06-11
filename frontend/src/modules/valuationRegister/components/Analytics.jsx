import { useEffect, useState } from "react";
import { fetchReport, downloadValuationsCsv, downloadValuationsExcel } from "../api/valuationsApi";
import { Button, Card, EmptyState, PageHeader } from "./ui";

const REPORT_TYPES = [
  { id: "pending", label: "Pending Valuations" },
  { id: "completed", label: "Completed Valuations" },
  { id: "overdue", label: "Overdue Valuations" },
  { id: "by-insurer", label: "By Insurer" },
  { id: "by-valuer", label: "By Valuer" },
  { id: "value-variance", label: "Value Variance" },
  { id: "compliance", label: "Compliance Performance" },
  { id: "trends", label: "Monthly Trends" },
];

export function Analytics() {
  const [active, setActive] = useState("pending");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  async function handleExport(format) {
    setExporting(true);
    try {
      if (format === "csv") await downloadValuationsCsv();
      else await downloadValuationsExcel();
    } catch (err) {
      console.error(err);
      window.alert("Export failed.");
    } finally {
      setExporting(false);
    }
  }

  useEffect(() => {
    setLoading(true);
    fetchReport(active)
      .then(setData)
      .finally(() => setLoading(false));
  }, [active]);

  const isAggregate = active === "by-insurer" || active === "by-valuer" || active === "trends";
  const isCompliance = active === "compliance";
  const rows = isCompliance ? data?.rows || [] : Array.isArray(data) ? data : [];

  return (
    <>
      <PageHeader
        title="Reports & Analytics"
        subtitle="Compliance reports with Excel and CSV export."
        actions={
          <>
            <Button tone="secondary" onClick={() => handleExport("xlsx")} disabled={exporting}>
              {exporting ? "Exporting…" : "Export Excel"}
            </Button>
            <Button tone="secondary" onClick={() => handleExport("csv")} disabled={exporting}>
              Export CSV
            </Button>
          </>
        }
      />

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
        {REPORT_TYPES.map((r) => (
          <Button
            key={r.id}
            tone={active === r.id ? "primary" : "secondary"}
            onClick={() => setActive(r.id)}
          >
            {r.label}
          </Button>
        ))}
      </div>

      {loading ? <p>Loading report…</p> : null}

      {isCompliance && data ? (
        <Card>
          <p>Total requiring: {data.total} · Completed: {data.completed} · Overdue: {data.overdue}</p>
          <p><strong>Compliance rate: {data.compliancePct}%</strong></p>
        </Card>
      ) : null}

      {!loading && rows.length === 0 && !isAggregate ? (
        <EmptyState>No records for this report.</EmptyState>
      ) : null}

      {isAggregate && Array.isArray(data) && data.length > 0 ? (
        <div className="adt-table-wrap">
          <table className="adt-table">
            <thead>
              <tr>
                {Object.keys(data[0]).map((k) => (
                  <th key={k}>{k}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((row, i) => (
                <tr key={i}>
                  {Object.values(row).map((v, j) => (
                    <td key={j}>{String(v)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {!isAggregate && rows.length > 0 ? (
        <div className="adt-table-wrap">
          <table className="adt-table">
            <thead>
              <tr>
                <th>Insured</th>
                <th>Reg</th>
                <th>Insurer</th>
                <th>Status</th>
                <th>Variance %</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>{row.insuredName}</td>
                  <td>{row.vehicleRegistration}</td>
                  <td>{row.insuranceCompany}</td>
                  <td>{row.status}</td>
                  <td>{row.percentageVariance ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </>
  );
}
