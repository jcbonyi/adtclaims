import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import client from "../api/client";

const chartColors = ["#1d4ed8", "#0f766e", "#d97706", "#7c3aed", "#db2777", "#334155", "#16a34a"];

function KpiCard({ label, value }) {
  return (
    <div className="rounded-xl bg-white p-4 shadow-sm">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="text-2xl font-semibold text-slate-900">{value ?? 0}</p>
    </div>
  );
}

function FollowUpPanel({ title, rows, onRemark }) {
  return (
    <div className="rounded-xl bg-white p-4 shadow-sm">
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-600">{title}</h3>
      <div className="max-h-72 overflow-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-2 py-1">Insurer</th>
              <th className="px-2 py-1">Insured</th>
              <th className="px-2 py-1">Reg</th>
              <th className="px-2 py-1">Days</th>
              <th className="px-2 py-1">Last Remark</th>
              <th className="px-2 py-1">Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t">
                <td className="px-2 py-1">{row.insurer}</td>
                <td className="px-2 py-1">{row.insured_name}</td>
                <td className="px-2 py-1">{row.registration_number}</td>
                <td className="px-2 py-1">{row.days_open}</td>
                <td className="px-2 py-1">{row.last_remark || "-"}</td>
                <td className="px-2 py-1">
                  <button
                    type="button"
                    className="rounded border border-blue-300 px-2 py-1 text-xs text-blue-700"
                    onClick={() => onRemark(row.id)}
                  >
                    Add Follow-up
                  </button>
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td className="px-2 py-2 text-xs text-slate-500" colSpan={6}>
                  No records in this panel.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [overall, setOverall] = useState(null);
  const [operations, setOperations] = useState(null);
  const [insurers, setInsurers] = useState([]);
  const [selectedInsurer, setSelectedInsurer] = useState("");
  const [insurerData, setInsurerData] = useState(null);

  async function loadOverall() {
    const [overallRes, operationsRes, metaRes] = await Promise.all([
      client.get("/dashboard/overall"),
      client.get("/dashboard/operations"),
      client.get("/meta"),
    ]);
    setOverall(overallRes.data);
    setOperations(operationsRes.data);
    setInsurers(metaRes.data.insurers || []);
    if (!selectedInsurer && metaRes.data.insurers?.length) {
      setSelectedInsurer(metaRes.data.insurers[0]);
    }
  }

  async function loadInsurer(insurer) {
    if (!insurer) return;
    const res = await client.get("/dashboard/insurer", { params: { insurer } });
    setInsurerData(res.data);
  }

  useEffect(() => {
    let ignore = false;
    async function init() {
      const [overallRes, operationsRes, metaRes] = await Promise.all([
        client.get("/dashboard/overall"),
        client.get("/dashboard/operations"),
        client.get("/meta"),
      ]);
      if (ignore) return;
      setOverall(overallRes.data);
      setOperations(operationsRes.data);
      setInsurers(metaRes.data.insurers || []);
      if (metaRes.data.insurers?.length) {
        setSelectedInsurer((prev) => prev || metaRes.data.insurers[0]);
      }
    }
    init();
    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    if (!selectedInsurer) return;
    let ignore = false;
    async function refreshInsurer() {
      const res = await client.get("/dashboard/insurer", { params: { insurer: selectedInsurer } });
      if (!ignore) setInsurerData(res.data);
    }
    refreshInsurer();
    return () => {
      ignore = true;
    };
  }, [selectedInsurer]);

  async function quickFollowup(claimId) {
    const remark = window.prompt("Add follow-up remark:");
    if (!remark?.trim()) return;
    await client.post(`/claims/${claimId}/remarks`, { remark: remark.trim() });
    await loadOverall();
    await loadInsurer(selectedInsurer);
  }

  const agingRows = useMemo(() => overall?.agingBreakdown || [], [overall]);

  if (!overall || !operations) {
    return <div className="rounded-xl bg-white p-4 shadow-sm">Loading dashboard...</div>;
  }

  return (
    <section className="space-y-4">
      <div className="grid gap-4 md:grid-cols-4">
        <KpiCard label="Total Open Claims" value={overall.kpis.total_open} />
        <KpiCard label="Total Closed Claims" value={overall.kpis.total_closed} />
        <KpiCard label="Avg Days Open" value={overall.kpis.avg_days_open} />
        <KpiCard label="Claims Over 30 Days" value={overall.kpis.over_30} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-xl bg-white p-4 shadow-sm">
          <h3 className="mb-2 text-base font-semibold text-slate-900">Claims by Status</h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={overall.statusBreakdown} dataKey="value" nameKey="label" outerRadius={100}>
                  {overall.statusBreakdown.map((entry, index) => (
                    <Cell key={entry.label} fill={chartColors[index % chartColors.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-xl bg-white p-4 shadow-sm lg:col-span-2">
          <h3 className="mb-2 text-base font-semibold text-slate-900">Claims by Insurer</h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={overall.insurerBreakdown}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="value" fill="#2563eb" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-xl bg-white p-4 shadow-sm lg:col-span-2">
          <h3 className="mb-2 text-base font-semibold text-slate-900">Aging Analysis</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={agingRows}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="bucket" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="value" fill="#f97316" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-xl bg-white p-4 shadow-sm">
          <h3 className="mb-2 text-base font-semibold text-slate-900">Aging Table</h3>
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs uppercase text-slate-500">
              <tr>
                <th className="py-1">Bucket</th>
                <th className="py-1">Claims</th>
              </tr>
            </thead>
            <tbody>
              {agingRows.map((row) => (
                <tr key={row.bucket} className="border-t">
                  <td className="py-2">{row.bucket} days</td>
                  <td className="py-2">{row.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-xl bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-semibold text-slate-900">Insurer Analysis</h3>
          <select
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            value={selectedInsurer}
            onChange={(e) => setSelectedInsurer(e.target.value)}
          >
            {insurers.map((insurer) => (
              <option value={insurer} key={insurer}>
                {insurer}
              </option>
            ))}
          </select>
        </div>
        {insurerData ? (
          <div className="grid gap-4 lg:grid-cols-3">
            <KpiCard label="Open" value={insurerData.kpis.open} />
            <KpiCard label="Closed" value={insurerData.kpis.closed} />
            <KpiCard label="Avg Turnaround" value={insurerData.kpis.avg_turnaround} />
          </div>
        ) : null}
      </div>

      {insurerData ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl bg-white p-4 shadow-sm">
            <h3 className="mb-2 text-base font-semibold text-slate-900">Worst Aging Open Claims</h3>
            <table className="min-w-full text-left text-sm">
              <thead className="text-xs uppercase text-slate-500">
                <tr>
                  <th className="py-1">Insured</th>
                  <th className="py-1">Reg</th>
                  <th className="py-1">Status</th>
                  <th className="py-1">Days</th>
                </tr>
              </thead>
              <tbody>
                {insurerData.worstOpenClaims.map((claim) => (
                  <tr key={claim.id} className="border-t">
                    <td className="py-2">{claim.insured_name}</td>
                    <td className="py-2">{claim.registration_number}</td>
                    <td className="py-2">{claim.claim_status}</td>
                    <td className="py-2">{claim.days_open}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="rounded-xl bg-white p-4 shadow-sm">
            <h3 className="mb-2 text-base font-semibold text-slate-900">Status Breakdown</h3>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={insurerData.statusBreakdown}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="label" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="value" fill="#0f766e" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <FollowUpPanel
          title="Pending Assessment"
          rows={operations.pendingAssessment}
          onRemark={quickFollowup}
        />
        <FollowUpPanel
          title="Stuck > 7 Days"
          rows={operations.stuckOver7Days}
          onRemark={quickFollowup}
        />
        <FollowUpPanel
          title="Pending Documents"
          rows={operations.pendingDocuments}
          onRemark={quickFollowup}
        />
        <FollowUpPanel title="Not Released" rows={operations.notReleased} onRemark={quickFollowup} />
      </div>
    </section>
  );
}
