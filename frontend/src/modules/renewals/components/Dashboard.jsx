import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fetchRenewalsDashboard } from "../api/renewalsApi";
import { renewalsPath } from "../basePath";
import { daysUntilLabel, daysUntilTone, KPI_FILTER_LABELS } from "../constants";
import { formatDisplayDate } from "../../valuationRegister/utils/format";
import { StatusBadge } from "./StatusBadge";
import { AlertBanner, Button, Card, EmptyState, KpiCard, KpiRow, LoadingState, PageHeader } from "./ui";

export function Dashboard({ onOpenPolicy }) {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchRenewalsDashboard()
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingState label="Loading renewals dashboard…" />;
  if (!data) return <EmptyState title="No data">Dashboard data is unavailable.</EmptyState>;

  const { kpis, upcoming, overdue, failures, channelStats, settings } = data;
  const chartData = [
    { label: "T-60", value: kpis.t60 },
    { label: "T-30", value: kpis.t30 },
    { label: "T-15", value: kpis.t15 },
    { label: "61+", value: kpis.later ?? 0 },
    { label: "Overdue", value: kpis.overdue },
  ];

  return (
    <>
      <PageHeader
        title="Renewals Dashboard"
        subtitle="Upcoming policy expiries and reminder delivery health. Click a KPI to open the filtered register."
      />

      {kpis.open_failures > 0 ? (
        <AlertBanner tone="warning">
          <div className="rn-fail-banner">
            <span>
              <strong>{kpis.open_failures}</strong> unacknowledged delivery failure
              {kpis.open_failures === 1 ? "" : "s"} — clients or financiers may not have received a reminder.
            </span>
            <Button tone="danger" size="sm" onClick={() => navigate(renewalsPath("failures"))}>
              Review failures
            </Button>
          </div>
        </AlertBanner>
      ) : null}

      <div className="rn-config-pills">
        <span className={`rn-pill${settings.smsConfigured ? " rn-pill--ok" : " rn-pill--warn"}`}>
          SMS {settings.smsConfigured ? "configured" : "not configured"}
        </span>
        <span className={`rn-pill${settings.smtpConfigured ? " rn-pill--ok" : " rn-pill--warn"}`}>
          Email {settings.smtpConfigured ? "configured" : "not configured"}
        </span>
        <span className="rn-pill">Last job run: {settings.lastRunAt ? new Date(settings.lastRunAt).toLocaleString() : "never"}</span>
      </div>

      <KpiRow>
        <KpiCard label="Active policies" value={kpis.total_active} onClick={() => navigate(renewalsPath("register"))} />
        <KpiCard label="Due 31–60 days" value={kpis.t60} onClick={() => navigate(renewalsPath("register?window=t60"))} />
        <KpiCard label="Due 16–30 days" value={kpis.t30} onClick={() => navigate(renewalsPath("register?window=t30"))} />
        <KpiCard label="Due 0–15 days" value={kpis.t15} onClick={() => navigate(renewalsPath("register?window=t15"))} />
        <KpiCard label="Due 61+ days" value={kpis.later ?? 0} onClick={() => navigate(renewalsPath("register?window=later"))} />
        <KpiCard label="Overdue" value={kpis.overdue} onClick={() => navigate(renewalsPath("register?window=overdue"))} />
        <KpiCard
          label="Open failures"
          value={kpis.open_failures}
          onClick={() => navigate(renewalsPath("failures"))}
        />
      </KpiRow>

      <div className="val-charts-grid">
        <Card className="val-chart-card">
          <h3 className="adt-card-header">Upcoming windows</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="value" fill="#0078c8" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
        <Card className="val-chart-card">
          <h3 className="adt-card-header">Delivery by channel</h3>
          {channelStats.length === 0 ? (
            <p className="rn-muted">No send attempts yet. The daily job runs at 07:30.</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart
                data={["sms", "email"].map((channel) => ({
                  label: channel.toUpperCase(),
                  sent: channelStats.filter((s) => s.channel === channel && s.status === "sent").reduce((n, s) => n + s.total, 0),
                  failed: channelStats.filter((s) => s.channel === channel && s.status === "failed").reduce((n, s) => n + s.total, 0),
                }))}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="sent" fill="#72bf44" radius={[4, 4, 0, 0]} />
                <Bar dataKey="failed" fill="#dc2626" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>
      </div>

      <Card padding={false}>
        <div style={{ padding: "16px 16px 0" }}>
          <h3 className="adt-card-header" style={{ margin: 0 }}>Due within 60 days</h3>
        </div>
        {upcoming.length === 0 ? (
          <EmptyState title="Nothing in the 60-day window">No active policies renew in the next 60 days.</EmptyState>
        ) : (
          <div className="adt-table-wrap">
            <table className="adt-table">
              <thead>
                <tr>
                  <th>Insured</th>
                  <th>Vehicles</th>
                  <th>Renewal</th>
                  <th>Countdown</th>
                  <th>Phone</th>
                  <th>Financier</th>
                </tr>
              </thead>
              <tbody>
                {upcoming.map((row) => (
                  <tr key={row.id} className="val-row-clickable" onClick={() => onOpenPolicy(row.id)}>
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {overdue.length > 0 ? (
        <Card padding={false}>
          <div style={{ padding: "16px 16px 0" }}>
            <h3 className="adt-card-header" style={{ margin: 0 }}>Overdue / expired</h3>
            <p className="rn-muted">{KPI_FILTER_LABELS.overdue}</p>
          </div>
          <div className="adt-table-wrap">
            <table className="adt-table">
              <thead>
                <tr>
                  <th>Insured</th>
                  <th>Vehicles</th>
                  <th>Renewal</th>
                  <th>Age</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {overdue.map((row) => (
                  <tr key={row.id} className="val-row-clickable adt-row--danger" onClick={() => onOpenPolicy(row.id)}>
                    <td className="val-insured-cell">{row.insuredName}</td>
                    <td>{row.carRegistrations || "—"}</td>
                    <td>{formatDisplayDate(row.renewalDate)}</td>
                    <td>
                      <span className="rn-days rn-days--danger">{daysUntilLabel(row.daysUntilRenewal)}</span>
                    </td>
                    <td>
                      <StatusBadge status={row.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      {failures.length > 0 ? (
        <Card padding={false}>
          <div style={{ padding: "16px 16px 0" }}>
            <h3 className="adt-card-header" style={{ margin: 0 }}>Recent delivery failures</h3>
          </div>
          <div className="adt-table-wrap">
            <table className="adt-table">
              <thead>
                <tr>
                  <th>Insured</th>
                  <th>Milestone</th>
                  <th>Channel</th>
                  <th>Recipient</th>
                  <th>Error</th>
                </tr>
              </thead>
              <tbody>
                {failures.slice(0, 8).map((row) => (
                  <tr key={row.id}>
                    <td>{row.insuredName}</td>
                    <td>T-{row.milestone}</td>
                    <td className="rn-channel">{row.channel}</td>
                    <td>
                      {row.recipientType}: {row.recipientAddress || "none"}
                    </td>
                    <td>{row.errorMessage || "—"}</td>
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
