import { useEffect, useState } from "react";
import { fetchReport, downloadValuationsCsv, downloadValuationsExcel } from "../api/valuationsApi";
import { formatVariance } from "../utils/format";
import { StatusBadge } from "./StatusBadge";
import {
  Button,
  Card,
  EmptyState,
  KpiCard,
  KpiRow,
  LoadingState,
  PageHeader,
  ReportTabs,
} from "./ui";

const REPORT_TYPES = [
  { id: "pending", label: "Pending" },
  { id: "completed", label: "Completed" },
  { id: "overdue", label: "Overdue" },
  { id: "by-insurer", label: "By Insurer" },
  { id: "by-valuer", label: "By Valuer" },
  { id: "value-variance", label: "Value Variance" },
  { id: "compliance", label: "Compliance" },
  { id: "trends", label: "Trends" },
];

const AGGREGATE_LABELS = {
  label: "Name",
  insurer: "Insurer",
  valuer: "Valuer",
  month: "Month",
  count: "Count",
  value: "Count",
  total: "Total",
  completed: "Completed",
  overdue: "Overdue",
  compliancePct: "Compliance %",
};

function formatColumnHeader(key) {
  return AGGREGATE_LABELS[key] || key.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase());
}

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

      <ReportTabs items={REPORT_TYPES} active={active} onChange={setActive} />

      {loading ? <LoadingState label="Loading report…" /> : null}

      {!loading && isCompliance && data ? (
        <KpiRow>
          <KpiCard label="Total Requiring" value={data.total} />
          <KpiCard label="Completed" value={data.completed} />
          <KpiCard label="Overdue" value={data.overdue} />
          <KpiCard label="Compliance Rate" value={`${data.compliancePct}%`} />
        </KpiRow>
      ) : null}

      {!loading && rows.length === 0 && !isAggregate && !isCompliance ? (
        <EmptyState title="No records">No records for this report.</EmptyState>
      ) : null}

      {!loading && isAggregate && Array.isArray(data) && data.length > 0 ? (
        <Card padding={false}>
          <div className="adt-table-wrap">
            <table className="adt-table">
              <thead>
                <tr>
                  {Object.keys(data[0]).map((k) => (
                    <th key={k}>{formatColumnHeader(k)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.map((row, i) => (
                  <tr key={i}>
                    {Object.entries(row).map(([k, v]) => (
                      <td key={k}>
                        {k === "compliancePct" || k.endsWith("Pct") ? `${v}%` : String(v)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      {!loading && !isAggregate && rows.length > 0 ? (
        <Card padding={false}>
          <div className="adt-table-wrap">
            <table className="adt-table">
              <thead>
                <tr>
                  <th>Insured</th>
                  <th>Reg</th>
                  <th>Insurer</th>
                  <th>Status</th>
                  <th>Variance</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td className="val-insured-cell">{row.insuredName}</td>
                    <td>{row.vehicleRegistration || "—"}</td>
                    <td>{row.insuranceCompany || "—"}</td>
                    <td><StatusBadge status={row.status} /></td>
                    <td>{formatVariance(row.percentageVariance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}
    </>
  );
}
