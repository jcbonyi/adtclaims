import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import client from "../api/client";
import { useAuth } from "../context/AuthContext";
import { canManageClaimSettings, canRunClaimJobs } from "../utils/constants";

const EVENT_LABELS = {
  claim_created: "New claim",
  status_change: "Status change",
  ra_issued: "RA issued",
  released: "Released",
  closed: "Closed",
  aging_8: "Aging 8+ days",
  aging_15: "Aging 15+ days",
  aging_30: "Aging 30+ days",
  pending_assessment: "Pending assessment",
  pending_documents: "Pending documents",
  not_released: "Not released",
  daily_digest: "Daily digest",
  daily_register: "Daily register",
};

export default function ClaimsNotificationsPage() {
  const { user } = useAuth();
  const canSettings = canManageClaimSettings(user?.role);
  const canRun = canRunClaimJobs(user?.role);
  const [form, setForm] = useState(null);
  const [logs, setLogs] = useState([]);
  const [testEmail, setTestEmail] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [statusFilter, setStatusFilter] = useState("");

  async function load(status) {
    const [settingsRes, logRes] = await Promise.all([
      client.get("/claims-notifications/settings"),
      client.get("/claims-notifications/log", { params: status ? { status } : {} }),
    ]);
    setForm(settingsRes.data);
    setLogs(logRes.data);
  }

  useEffect(() => {
    load(statusFilter).catch((err) => setMessage(err.response?.data?.message || "Failed to load"));
  }, [statusFilter]);

  function patch(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSave() {
    setBusy(true);
    setMessage("");
    try {
      await client.put("/claims-notifications/settings", {
        opsEmailList: form.opsEmailList,
        opsPhoneList: form.opsPhoneList,
        emailEnabled: form.emailEnabled,
        smsEnabled: form.smsEnabled,
        notifyAllStatusChanges: form.notifyAllStatusChanges,
        assessmentChaseDays: Number(form.assessmentChaseDays),
        documentsChaseDays: Number(form.documentsChaseDays),
        notReleasedChaseDays: Number(form.notReleasedChaseDays),
        smtpHost: form.smtpHost || "",
        smtpPort: Number(form.smtpPort) || 587,
        smtpSecure: !!form.smtpSecure,
        smtpUser: form.smtpUser || "",
        smtpPass: form.smtpPass || "",
        smtpFrom: form.smtpFrom || "",
      });
      setMessage("Settings saved. Daily register and other claim emails will use these SMTP settings.");
      await load(statusFilter);
    } catch (err) {
      setMessage(err.response?.data?.message || "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleRun() {
    setBusy(true);
    setMessage("");
    try {
      const res = await client.post("/claims-notifications/run");
      const q = res.data.queues || {};
      setMessage(
        `Job finished. Digest ${res.data.digestSent ? "sent" : "paused"}. Queues — assessment ${q.pendingAssessment}, documents ${q.pendingDocuments}, not released ${q.notReleased}, stuck >7d ${q.stuckOver7}, over 30d ${q.over30}.`
      );
      await load(statusFilter);
    } catch (err) {
      setMessage(err.response?.data?.message || "Job failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleSendRegister() {
    setBusy(true);
    setMessage("");
    try {
      const res = await client.post("/claims-notifications/daily-register");
      if (res.data.skipped) {
        setMessage("Register email already sent today. Use this button only if you need a fresh copy — it always resends from here.");
      } else if (res.data.sent) {
        setMessage(
          `Register emailed to ${Array.isArray(res.data.recipients) ? res.data.recipients.join(", ") : "recipients"} (${res.data.rowCount} claims).`
        );
      } else {
        setMessage(`Register email not sent: ${res.data.reason || "unknown"}. Confirm SMTP is configured.`);
      }
      await load(statusFilter);
    } catch (err) {
      setMessage(err.response?.data?.message || "Register email failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleTest() {
    setBusy(true);
    try {
      const res = await client.post("/claims-notifications/test-email", { email: testEmail });
      setMessage(res.data.sent ? "Test email sent." : `Email not sent: ${res.data.reason}`);
    } catch (err) {
      setMessage(err.response?.data?.message || "Test email failed");
    } finally {
      setBusy(false);
    }
  }

  if (!form) {
    return (
      <div className="adt-card p-6">
        <p className="text-sm text-slate-500">Loading claims notifications…</p>
      </div>
    );
  }

  const failedCount = logs.filter((l) => l.status === "failed").length;

  return (
    <section className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Claims notifications</h1>
        <p className="mt-1 text-sm text-slate-600">
          Email (and optional SMS) when claims are logged or move to high-signal statuses, and a daily 17:30 EAT claims-register Excel to Aisha, Jacob, and Communications. The daily ops digest is paused.
        </p>
      </div>

      {message ? (
        <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">{message}</div>
      ) : null}

      <div className="flex flex-wrap gap-2 text-xs">
        <span className={`rounded-full border px-3 py-1 ${form.smtpConfigured ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "border-amber-300 bg-amber-50 text-amber-800"}`}>
          SMTP {form.smtpConfigured ? "configured" : "not configured"}
        </span>
        <span className={`rounded-full border px-3 py-1 ${form.smsConfigured ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "border-slate-200 bg-slate-50 text-slate-600"}`}>
          SMS {form.smsConfigured ? "configured" : "not configured"}
        </span>
        <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-slate-600">
          Last run: {form.lastRunAt ? new Date(form.lastRunAt).toLocaleString() : "never"}
        </span>
        <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-slate-600">
          Last register email: {form.lastRegisterEmailAt ? new Date(form.lastRegisterEmailAt).toLocaleString() : "never"}
        </span>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl bg-white p-4 shadow-sm">
          <h2 className="mb-1 text-base font-semibold text-slate-900">SMTP settings</h2>
          <p className="mb-3 text-sm text-slate-600">
            Used to send the daily 17:30 EAT claims-register Excel and all other claims emails. Saved here (not only in server env).
            For <code>mail.adtinsurance.co.ke</code>, use port <strong>465</strong> with SSL ticked — port 587 often hits a 421 SMTP timeout on this host.
          </p>
          <div className="mb-3 grid gap-3 sm:grid-cols-2">
            <label className="block text-sm sm:col-span-2">
              <span className="mb-1 block text-slate-600">SMTP host</span>
              <input
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                value={form.smtpHost || ""}
                disabled={!canSettings}
                onChange={(e) => patch("smtpHost", e.target.value)}
                placeholder="smtp.office365.com or mail.adtinsurance.co.ke"
                autoComplete="off"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-slate-600">Port</span>
              <input
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                type="number"
                min="1"
                value={form.smtpPort ?? 587}
                disabled={!canSettings}
                onChange={(e) => patch("smtpPort", e.target.value)}
                placeholder="587"
              />
            </label>
            <label className="flex items-end gap-2 pb-2 text-sm">
              <input
                type="checkbox"
                checked={!!form.smtpSecure}
                disabled={!canSettings}
                onChange={(e) => patch("smtpSecure", e.target.checked)}
              />
              Use SSL (port 465). Leave off for STARTTLS on 587.
            </label>
            <label className="block text-sm sm:col-span-2">
              <span className="mb-1 block text-slate-600">From address</span>
              <input
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                value={form.smtpFrom || ""}
                disabled={!canSettings}
                onChange={(e) => patch("smtpFrom", e.target.value)}
                placeholder="claims@adtinsurance.co.ke"
                autoComplete="off"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-slate-600">Username</span>
              <input
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                value={form.smtpUser || ""}
                disabled={!canSettings}
                onChange={(e) => patch("smtpUser", e.target.value)}
                placeholder="SMTP login"
                autoComplete="off"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-slate-600">Password</span>
              <input
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                type="password"
                value={form.smtpPass || ""}
                disabled={!canSettings}
                onChange={(e) => patch("smtpPass", e.target.value)}
                placeholder={form.smtpPassSet ? "Leave blank to keep the saved password" : "SMTP password"}
                autoComplete="new-password"
              />
            </label>
          </div>
          <h2 className="mb-3 mt-2 text-base font-semibold text-slate-900">Notification options</h2>
          <label className="mb-2 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.emailEnabled} disabled={!canSettings} onChange={(e) => patch("emailEnabled", e.target.checked)} />
            Enable email
          </label>
          <label className="mb-2 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.smsEnabled} disabled={!canSettings} onChange={(e) => patch("smsEnabled", e.target.checked)} />
            Enable SMS digest / high-signal alerts
          </label>
          <label className="mb-4 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.notifyAllStatusChanges}
              disabled={!canSettings}
              onChange={(e) => patch("notifyAllStatusChanges", e.target.checked)}
            />
            Email every status change (otherwise only RA issued, released, closed, pending docs, assessment, litigation, payment)
          </label>
          <label className="mb-3 block text-sm">
            <span className="mb-1 block text-slate-600">Ops / claims team emails</span>
            <input
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              value={form.opsEmailList}
              disabled={!canSettings}
              onChange={(e) => patch("opsEmailList", e.target.value)}
              placeholder="claims@adtinsurance.co.ke, ops@adtinsurance.co.ke"
            />
          </label>
          <label className="mb-3 block text-sm">
            <span className="mb-1 block text-slate-600">Ops SMS numbers (optional)</span>
            <input
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              value={form.opsPhoneList}
              disabled={!canSettings}
              onChange={(e) => patch("opsPhoneList", e.target.value)}
              placeholder="+2547…"
            />
          </label>
          <div className="mb-4 grid gap-3 sm:grid-cols-3">
            <label className="text-sm">
              <span className="mb-1 block text-slate-600">Assessment chase (days)</span>
              <input className="w-full rounded-md border border-slate-300 px-3 py-2" type="number" min="1" value={form.assessmentChaseDays} disabled={!canSettings} onChange={(e) => patch("assessmentChaseDays", e.target.value)} />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-slate-600">Documents chase (days)</span>
              <input className="w-full rounded-md border border-slate-300 px-3 py-2" type="number" min="1" value={form.documentsChaseDays} disabled={!canSettings} onChange={(e) => patch("documentsChaseDays", e.target.value)} />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-slate-600">Not released chase (days)</span>
              <input className="w-full rounded-md border border-slate-300 px-3 py-2" type="number" min="1" value={form.notReleasedChaseDays} disabled={!canSettings} onChange={(e) => patch("notReleasedChaseDays", e.target.value)} />
            </label>
          </div>
          {canSettings ? (
            <button type="button" className="adt-btn adt-btn-primary" onClick={handleSave} disabled={busy}>
              Save settings
            </button>
          ) : (
            <p className="text-xs text-slate-500">Only Admin can change these settings.</p>
          )}
        </div>

        <div className="space-y-4">
          <div className="rounded-xl bg-white p-4 shadow-sm">
            <h2 className="mb-2 text-base font-semibold text-slate-900">Run automations</h2>
            <p className="mb-3 text-sm text-slate-600">
              Daily 07:15 EAT still runs aging chases; the ops digest email is paused. Daily 17:30 EAT emails the branded claims-register Excel
              {form.dailyRegisterRecipients?.length
                ? ` to ${form.dailyRegisterRecipients.join(", ")}`
                : ""}
              .
            </p>
            {canRun ? (
              <div className="flex flex-wrap gap-2">
                <button type="button" className="adt-btn adt-btn-primary" onClick={handleRun} disabled={busy}>
                  Run now
                </button>
                <button type="button" className="adt-btn adt-btn-secondary" onClick={handleSendRegister} disabled={busy}>
                  Send register now
                </button>
              </div>
            ) : (
              <p className="text-xs text-slate-500">Your role can view the log but not run the job.</p>
            )}
            <p className="mt-3 text-xs text-slate-500">
              Also see live queues on the <Link className="font-semibold hover:underline" style={{ color: "var(--adt-blue)" }} to="/dashboard">Claims dashboard</Link>.
            </p>
          </div>
          {canSettings ? (
            <div className="rounded-xl bg-white p-4 shadow-sm">
              <h2 className="mb-2 text-base font-semibold text-slate-900">Test email</h2>
              <input
                className="mb-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
                placeholder="you@adtinsurance.co.ke"
              />
              <button type="button" className="adt-btn adt-btn-secondary" onClick={handleTest} disabled={busy || !testEmail}>
                Send test
              </button>
            </div>
          ) : null}
        </div>
      </div>

      <div className="rounded-xl bg-white p-4 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-slate-900">
            Send log {failedCount ? <span className="ml-2 text-sm font-normal text-red-600">{failedCount} failed on this page</span> : null}
          </h2>
          <select className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">All statuses</option>
            <option value="sent">Sent</option>
            <option value="failed">Failed</option>
          </select>
        </div>
        <div className="max-h-[28rem] overflow-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="sticky top-0 bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-2 py-2">When</th>
                <th className="px-2 py-2">Event</th>
                <th className="px-2 py-2">Claim</th>
                <th className="px-2 py-2">Channel</th>
                <th className="px-2 py-2">Recipient</th>
                <th className="px-2 py-2">Status</th>
                <th className="px-2 py-2">Detail</th>
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 ? (
                <tr>
                  <td className="px-2 py-4 text-slate-500" colSpan={7}>
                    No sends yet. Create a claim, change a high-signal status, or run the job.
                  </td>
                </tr>
              ) : (
                logs.map((row) => (
                  <tr key={row.id} className="border-t border-slate-100">
                    <td className="px-2 py-2 whitespace-nowrap">{row.createdAt ? new Date(row.createdAt).toLocaleString() : "—"}</td>
                    <td className="px-2 py-2">{EVENT_LABELS[row.eventType] || row.eventType}</td>
                    <td className="px-2 py-2">
                      {row.claimId ? (
                        <Link className="font-semibold hover:underline" style={{ color: "var(--adt-blue)" }} to={`/claims/${row.claimId}`}>
                          {row.insuredName || `#${row.claimId}`}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-2 py-2 uppercase">{row.channel}</td>
                    <td className="px-2 py-2">{row.recipient || "—"}</td>
                    <td className="px-2 py-2">
                      <span className={row.status === "failed" ? "text-red-700" : "text-emerald-700"}>{row.status}</span>
                    </td>
                    <td className="px-2 py-2 text-slate-500">{row.errorMessage || row.messageBody || "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
