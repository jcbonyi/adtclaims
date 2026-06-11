import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fetchDashboard, fetchKpiDetail } from "../api/valuationsApi";
import { StatusBadge } from "./StatusBadge";
import { Button, Card, EmptyState, KpiCard, KpiRow, LinkButton, PageHeader } from "./ui";

const chartColors = ["#0078c8", "#72bf44", "#d97706", "#7c3aed", "#dc2626"];

export function Dashboard({ onOpenValuation }) {
  const [data, setData] = useState(null);
  const [kpiFilter, setKpiFilter] = useState(null);
  const [kpiRows, setKpiRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboard()
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  async function drillDown(kpi) {
    setKpiFilter(kpi);
    const detail = await fetchKpiDetail(kpi);
    setKpiRows(detail.rows || []);
  }

  if (loading) return <p>Loading dashboard…</p>;
  if (!data) return <EmptyState>Dashboard data unavailable.</EmptyState>;

  const { kpis, statusBreakdown, insurerBreakdown, valuerBreakdown, monthlyTrend, renewalAlerts } =
    data;

  return (
    <>
      <PageHeader
        title="Valuation Dashboard"
        subtitle="Track compliance, overdue valuations, and performance by insurer and valuer."
      />

      <KpiRow>
        <KpiCard
          label="Requiring Valuation"
          value={kpis.total_requiring}
          onClick={() => drillDown("total_requiring")}
          active={kpiFilter === "total_requiring"}
        />
        <KpiCard
          label="Pending"
          value={kpis.pending}
          onClick={() => drillDown("pending")}
          active={kpiFilter === "pending"}
        />
        <KpiCard
          label="Scheduled"
          value={kpis.scheduled}
          onClick={() => drillDown("scheduled")}
          active={kpiFilter === "scheduled"}
        />
        <KpiCard
          label="Completed"
          value={kpis.completed}
          onClick={() => drillDown("completed")}
          active={kpiFilter === "completed"}
        />
        <KpiCard
          label="Overdue"
          value={kpis.overdue}
          onClick={() => drillDown("overdue")}
          active={kpiFilter === "overdue"}
        />
      </KpiRow>

      <KpiRow>
        <KpiCard label="Compliance %" value={`${kpis.compliance_pct}%`} />
        <KpiCard label="Value Increased" value={kpis.value_increased} onClick={() => drillDown("value_increased")} />
        <KpiCard label="Value Decreased" value={kpis.value_decreased} onClick={() => drillDown("value_decreased")} />
        <KpiCard label="Avg Turnaround (days)" value={kpis.avg_turnaround_days} />
      </KpiRow>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16, marginTop: 16 }}>
        <Card>
          <h3 className="adt-card-header">By Status</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={statusBreakdown.slice(0, 8)}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={0} angle={-25} textAnchor="end" height={60} />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="value" fill={chartColors[0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
        <Card>
          <h3 className="adt-card-header">By Insurer</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={insurerBreakdown.slice(0, 8)}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="value" fill={chartColors[1]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
        <Card>
          <h3 className="adt-card-header">By Valuer</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={valuerBreakdown.slice(0, 8)}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="value" fill={chartColors[2]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
        <Card>
          <h3 className="adt-card-header">Monthly Trend</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={monthlyTrend}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" tick={{ fontSize: 10 }} />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="value" fill={chartColors[3]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>

      {kpiFilter ? (
        <Card style={{ marginTop: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3 className="adt-card-header">KPI Detail: {kpiFilter.replace(/_/g, " ")}</h3>
            <Button tone="ghost" onClick={() => setKpiFilter(null)}>Close</Button>
          </div>
          <table className="adt-table">
            <thead>
              <tr>
                <th>Insured</th>
                <th>Reg</th>
                <th>Insurer</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {kpiRows.map((row) => (
                <tr key={row.id}>
                  <td>{row.insuredName}</td>
                  <td>{row.vehicleRegistration}</td>
                  <td>{row.insuranceCompany}</td>
                  <td><StatusBadge status={row.status} /></td>
                  <td><LinkButton onClick={() => onOpenValuation(row.id)}>Open</LinkButton></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : null}

      {renewalAlerts?.length ? (
        <Card style={{ marginTop: 16 }}>
          <h3 className="adt-card-header">Renewal Alerts</h3>
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
                <tr key={row.id}>
                  <td>{row.insuredName}</td>
                  <td>{row.policyRenewalDate}</td>
                  <td><StatusBadge status={row.status} /></td>
                  <td><LinkButton onClick={() => onOpenValuation(row.id)}>Open</LinkButton></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : null}
    </>
  );
}
