import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fetchDashboard } from "../api/valuationsApi";
import { valuationPath } from "../basePath";
import { StatusBadge } from "./StatusBadge";
import {
  Card,
  EmptyState,
  KpiCard,
  KpiRow,
  LinkButton,
  LoadingState,
  PageHeader,
} from "./ui";
import { REPORT_TURNAROUND_DAYS } from "../constants";
import { formatDisplayDate } from "../utils/format";

const chartColors = ["#0078c8", "#72bf44", "#d97706", "#7c3aed", "#dc2626"];

export function Dashboard({ onOpenValuation }) {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboard()
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  function openKpiView(kpi) {
    navigate(valuationPath(`register?kpi=${encodeURIComponent(kpi)}`));
  }

  if (loading) return <LoadingState label="Loading dashboard…" />;
  if (!data) return <EmptyState title="No data">Dashboard data is unavailable. Check your connection and try again.</EmptyState>;

  const { kpis, statusBreakdown, insurerBreakdown, valuerBreakdown, monthlyTrend, renewalAlerts } =
    data;

  return (
    <>
      <PageHeader
        title="Valuation Dashboard"
        subtitle={`Track compliance and performance. Valuation report turnaround: ${REPORT_TURNAROUND_DAYS} days from request date. Click any KPI card to open the filtered register.`}
      />

      <KpiRow>
        <KpiCard
          label="Requiring Valuation"
          value={kpis.total_requiring}
          onClick={() => openKpiView("total_requiring")}
        />
        <KpiCard
          label="Pending"
          value={kpis.pending}
          onClick={() => openKpiView("pending")}
        />
        <KpiCard
          label="Scheduled"
          value={kpis.scheduled}
          onClick={() => openKpiView("scheduled")}
        />
        <KpiCard
          label="Completed"
          value={kpis.completed}
          onClick={() => openKpiView("completed")}
        />
        <KpiCard
          label="Overdue"
          value={kpis.overdue}
          onClick={() => openKpiView("overdue")}
        />
      </KpiRow>

      <KpiRow>
        <KpiCard
          label="Compliance %"
          value={`${kpis.compliance_pct}%`}
          onClick={() => navigate(valuationPath("analytics"))}
        />
        <KpiCard
          label="Value Increased"
          value={kpis.value_increased}
          onClick={() => openKpiView("value_increased")}
        />
        <KpiCard
          label="Value Decreased"
          value={kpis.value_decreased}
          onClick={() => openKpiView("value_decreased")}
        />
        <KpiCard
          label="Avg Turnaround (days)"
          value={kpis.avg_turnaround_days}
          onClick={() => openKpiView("completed")}
        />
      </KpiRow>

      <div className="val-charts-grid">
        <Card className="val-chart-card">
          <h3 className="adt-card-header">By Status</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={statusBreakdown.slice(0, 8)}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={0} angle={-25} textAnchor="end" height={60} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="value" fill={chartColors[0]} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
        <Card className="val-chart-card">
          <h3 className="adt-card-header">By Insurer</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={insurerBreakdown.slice(0, 8)}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="value" fill={chartColors[1]} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
        <Card className="val-chart-card">
          <h3 className="adt-card-header">By Valuer</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={valuerBreakdown.slice(0, 8)}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="value" fill={chartColors[2]} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
        <Card className="val-chart-card">
          <h3 className="adt-card-header">Monthly Trend</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={monthlyTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="month" tick={{ fontSize: 10 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="value" fill={chartColors[3]} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>

      {renewalAlerts?.length ? (
        <Card className="mt-4">
          <h3 className="adt-card-header">Renewal Alerts — action required</h3>
          <div className="adt-table-wrap">
            <table className="adt-table">
              <thead>
                <tr>
                  <th>Insured</th>
                  <th>Renewal</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {renewalAlerts.map((row) => (
                  <tr key={row.id} className="val-row-clickable" onClick={() => onOpenValuation(row.id)}>
                    <td className="val-insured-cell">{row.insuredName}</td>
                    <td>{formatDisplayDate(row.policyRenewalDate)}</td>
                    <td><StatusBadge status={row.status} /></td>
                    <td>
                      <LinkButton onClick={(e) => { e.stopPropagation(); onOpenValuation(row.id); }}>
                        Open
                      </LinkButton>
                    </td>
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
