import { useEffect, useState } from "react";
import {
  fetchRenewalSettings,
  runReminders,
  sendTestEmail,
  sendTestSms,
  updateRenewalSettings,
} from "../api/renewalsApi";
import { AlertBanner, Button, Card, FormField, LoadingState, PageHeader } from "./ui";

export function Settings() {
  const [form, setForm] = useState(null);
  const [testEmail, setTestEmail] = useState("");
  const [testPhone, setTestPhone] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetchRenewalSettings().then(setForm);
  }, []);

  if (!form) return <LoadingState label="Loading settings…" />;

  async function handleSave() {
    setBusy(true);
    setMessage("");
    try {
      await updateRenewalSettings({
        opsEmailList: form.opsEmailList,
        smsEnabled: form.smsEnabled,
        emailEnabled: form.emailEnabled,
      });
      setMessage("Settings saved.");
    } catch (err) {
      setMessage(err.response?.data?.message || "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleRun(force) {
    setBusy(true);
    setMessage("");
    try {
      const summary = await runReminders(force);
      setMessage(
        `Job finished: ${summary.duePolicies} due policies, ${summary.sent} sent, ${summary.failed} failed, ${summary.skipped} skipped, ${summary.alreadySent} already sent.`
      );
      const refreshed = await fetchRenewalSettings();
      setForm(refreshed);
    } catch (err) {
      setMessage(err.response?.data?.message || "Job failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleTestEmail() {
    setBusy(true);
    try {
      const result = await sendTestEmail(testEmail);
      setMessage(result.sent ? "Test email sent." : `Email not sent: ${result.reason}`);
    } catch (err) {
      setMessage(err.response?.data?.message || "Test email failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleTestSms() {
    setBusy(true);
    try {
      const result = await sendTestSms(testPhone);
      setMessage(result.sent ? `Test SMS sent to ${result.phone}.` : `SMS not sent: ${result.reason}`);
    } catch (err) {
      setMessage(err.response?.data?.message || "Test SMS failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Renewal settings"
        subtitle="Configure channels and who receives the daily failure-summary email. SMS uses Africa's Talking; email uses SMTP."
      />

      {message ? <AlertBanner tone="info">{message}</AlertBanner> : null}

      <div className="rn-config-pills">
        <span className={`rn-pill${form.smsConfigured ? " rn-pill--ok" : " rn-pill--warn"}`}>
          SMS provider {form.smsConfigured ? "ready" : "not configured"}
        </span>
        <span className={`rn-pill${form.smtpConfigured ? " rn-pill--ok" : " rn-pill--warn"}`}>
          SMTP {form.smtpConfigured ? "ready" : "not configured"}
        </span>
        <span className="rn-pill">Last run: {form.lastRunAt ? new Date(form.lastRunAt).toLocaleString() : "never"}</span>
      </div>

      <Card>
        <h3 className="adt-card-header">Channels</h3>
        <label className="val-field" style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            type="checkbox"
            checked={form.smsEnabled}
            onChange={(e) => setForm((f) => ({ ...f, smsEnabled: e.target.checked }))}
          />
          Enable SMS reminders
        </label>
        <label className="val-field" style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            type="checkbox"
            checked={form.emailEnabled}
            onChange={(e) => setForm((f) => ({ ...f, emailEnabled: e.target.checked }))}
          />
          Enable email reminders
        </label>
        <FormField
          label="Ops / renewals team emails"
          hint="Comma-separated. Receives the daily failure-summary so no missed send is silent. Falls back to RENEWAL_OPS_EMAIL_LIST then MANAGEMENT_EMAIL_LIST."
        >
          <input
            className="adt-input"
            value={form.opsEmailList}
            onChange={(e) => setForm((f) => ({ ...f, opsEmailList: e.target.value }))}
            placeholder="ops@adtinsurance.co.ke, renewals@adtinsurance.co.ke"
          />
        </FormField>
        <Button tone="primary" onClick={handleSave} disabled={busy}>
          Save settings
        </Button>
      </Card>

      <Card>
        <h3 className="adt-card-header">Run reminder job</h3>
        <p className="rn-muted">
          Daily automatic run is at 07:30. Active policies whose expiry is exactly 60, 30, or 15 days away are notified.
          Failed sends appear on Delivery Failures and in the ops digest email.
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Button tone="accent" onClick={() => handleRun(false)} disabled={busy}>
            Run now
          </Button>
          <Button tone="danger" onClick={() => handleRun(true)} disabled={busy}>
            Run and resend already-sent
          </Button>
        </div>
      </Card>

      <Card>
        <h3 className="adt-card-header">Test delivery</h3>
        <FormField label="Test email">
          <input className="adt-input" value={testEmail} onChange={(e) => setTestEmail(e.target.value)} placeholder="you@adtinsurance.co.ke" />
        </FormField>
        <Button tone="secondary" onClick={handleTestEmail} disabled={busy || !testEmail}>
          Send test email
        </Button>
        <div style={{ height: 12 }} />
        <FormField label="Test SMS" hint="Kenyan number; normalized to +254">
          <input className="adt-input" value={testPhone} onChange={(e) => setTestPhone(e.target.value)} placeholder="722111333" />
        </FormField>
        <Button tone="secondary" onClick={handleTestSms} disabled={busy || !testPhone}>
          Send test SMS
        </Button>
      </Card>
    </>
  );
}
