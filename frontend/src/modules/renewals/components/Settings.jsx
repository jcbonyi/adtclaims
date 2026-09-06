import { useEffect, useState } from "react";
import {
  fetchRenewalSettings,
  pollDelivery,
  runReminders,
  sendTestEmail,
  sendTestSms,
  sendTestWhatsApp,
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

  function patch(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSave() {
    setBusy(true);
    setMessage("");
    try {
      await updateRenewalSettings({
        opsEmailList: form.opsEmailList,
        smsEnabled: form.smsEnabled,
        emailEnabled: form.emailEnabled,
        whatsappEnabled: form.whatsappEnabled,
        smsTemplate: form.smsTemplate,
        whatsappTemplate: form.whatsappTemplate,
        emailSubjectTemplate: form.emailSubjectTemplate,
        emailBodyTemplate: form.emailBodyTemplate,
        financierSmsTemplate: form.financierSmsTemplate,
        callbackNumber: form.callbackNumber,
        quietStartHour: Number(form.quietStartHour),
        quietEndHour: Number(form.quietEndHour),
        smsPerMinute: Number(form.smsPerMinute),
        tililApiKey: form.tililApiKey || undefined,
        tililShortcode: form.tililShortcode,
        tililServiceId: form.tililServiceId,
      });
      const refreshed = await fetchRenewalSettings();
      setForm({ ...refreshed, tililApiKey: "" });
      setMessage(refreshed.smsConfigured ? "Settings saved. Tilil SMS is ready." : "Settings saved. Tilil SMS is still not configured — add the API key below or on Vercel.");
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
      if (summary.skipped) {
        setMessage(summary.reason || "Job skipped (quiet hours).");
      } else {
        setMessage(
          `Job finished: ${summary.duePolicies} due policies, ${summary.sent} sent, ${summary.failed} failed, ${summary.skipped || 0} skipped, ${summary.alreadySent} already sent.`
        );
      }
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

  async function handleTestWhatsApp() {
    setBusy(true);
    try {
      const result = await sendTestWhatsApp(testPhone);
      setMessage(result.sent ? `Test WhatsApp sent to ${result.phone}.` : `WhatsApp not sent: ${result.reason}`);
    } catch (err) {
      setMessage(err.response?.data?.message || "Test WhatsApp failed");
    } finally {
      setBusy(false);
    }
  }

  async function handlePoll() {
    setBusy(true);
    try {
      const result = await pollDelivery();
      setMessage(`Delivery poll: checked ${result.checked}, updated ${result.updated}.`);
    } catch (err) {
      setMessage(err.response?.data?.message || "Poll failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Renewal settings"
        subtitle="SMS reminders via Tilil (WhatsApp/email optional later). Ops digests still use SMTP."
      />

      {message ? <AlertBanner tone="info">{message}</AlertBanner> : null}

      <div className="rn-config-pills">
        <span className={`rn-pill${form.smsConfigured ? " rn-pill--ok" : " rn-pill--warn"}`}>
          SMS (Tilil) {form.smsConfigured ? "ready" : "not configured"}
        </span>
        <span className={`rn-pill${form.whatsappConfigured ? " rn-pill--ok" : " rn-pill--warn"}`}>
          WhatsApp {form.whatsappConfigured ? "ready" : "later"}
        </span>
        <span className={`rn-pill${form.smtpConfigured ? " rn-pill--ok" : " rn-pill--warn"}`}>
          SMTP {form.smtpConfigured ? "ready" : "not configured"}
        </span>
        <span className="rn-pill">Last run: {form.lastRunAt ? new Date(form.lastRunAt).toLocaleString() : "never"}</span>
      </div>

      <Card>
        <h3 className="adt-card-header">Tilil SMS (required for client reminders)</h3>
        <p className="rn-muted">
          Phone numbers in the register are fine — failures with <code>sms_not_configured</code> mean the Tilil API key was missing on the server. Save it here (stored in the database) or set <code>TILIL_*</code> on the Vercel backend service.
        </p>
        <div className="adt-form-grid">
          <FormField
            label="Tilil API key"
            hint={form.tililApiKeySet ? "Key is saved. Leave blank to keep the current key." : "Paste your Tilil api_key"}
          >
            <input
              className="adt-input"
              type="password"
              autoComplete="off"
              value={form.tililApiKey || ""}
              onChange={(e) => patch("tililApiKey", e.target.value)}
              placeholder={form.tililApiKeySet ? "•••••••• (unchanged if blank)" : "Tilil api_key"}
            />
          </FormField>
          <FormField label="Shortcode / sender ID">
            <input
              className="adt-input"
              value={form.tililShortcode || "ADT_INS.LTD"}
              onChange={(e) => patch("tililShortcode", e.target.value)}
            />
          </FormField>
          <FormField label="Service ID">
            <input
              className="adt-input"
              value={form.tililServiceId ?? "0"}
              onChange={(e) => patch("tililServiceId", e.target.value)}
            />
          </FormField>
        </div>
      </Card>

      <Card>
        <h3 className="adt-card-header">Channels & quiet hours</h3>
        <label className="val-field" style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input type="checkbox" checked={form.smsEnabled} onChange={(e) => patch("smsEnabled", e.target.checked)} />
          Enable SMS reminders
        </label>
        <label className="val-field" style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input type="checkbox" checked={form.emailEnabled} onChange={(e) => patch("emailEnabled", e.target.checked)} />
          Enable email reminders (optional — leave off for SMS-only)
        </label>
        <label className="val-field" style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input type="checkbox" checked={form.whatsappEnabled} onChange={(e) => patch("whatsappEnabled", e.target.checked)} />
          Enable WhatsApp reminders (configure later)
        </label>
        <div className="adt-form-grid">
          <FormField label="Callback number" hint="Inserted into templates as {callbackNumber}">
            <input className="adt-input" value={form.callbackNumber || ""} onChange={(e) => patch("callbackNumber", e.target.value)} />
          </FormField>
          <FormField label="Quiet start (EAT hour)">
            <input className="adt-input" type="number" min="0" max="23" value={form.quietStartHour} onChange={(e) => patch("quietStartHour", e.target.value)} />
          </FormField>
          <FormField label="Quiet end (EAT hour)">
            <input className="adt-input" type="number" min="0" max="23" value={form.quietEndHour} onChange={(e) => patch("quietEndHour", e.target.value)} />
          </FormField>
          <FormField label="SMS per minute">
            <input className="adt-input" type="number" min="1" max="300" value={form.smsPerMinute} onChange={(e) => patch("smsPerMinute", e.target.value)} />
          </FormField>
        </div>
        <FormField
          label="Ops / renewals team emails"
          hint="Comma-separated. Receives the run summary email (successful SMS/email deliveries + failures)."
        >
          <input
            className="adt-input"
            value={form.opsEmailList}
            onChange={(e) => patch("opsEmailList", e.target.value)}
            placeholder="ops@adtinsurance.co.ke, renewals@adtinsurance.co.ke"
          />
        </FormField>
        <Button tone="primary" onClick={handleSave} disabled={busy}>
          Save settings
        </Button>
      </Card>

      <Card>
        <h3 className="adt-card-header">Message templates</h3>
        <p className="rn-muted">
          Placeholders: {"{insuredName} {registrations} {renewalDate} {daysUntil} {insurer} {policyNumber} {financierName} {callbackNumber}"}
        </p>
        <FormField label="SMS template">
          <textarea className="adt-input" rows={3} value={form.smsTemplate || ""} onChange={(e) => patch("smsTemplate", e.target.value)} />
        </FormField>
        <FormField label="WhatsApp template">
          <textarea className="adt-input" rows={3} value={form.whatsappTemplate || ""} onChange={(e) => patch("whatsappTemplate", e.target.value)} />
        </FormField>
        <FormField label="Financier SMS template">
          <textarea className="adt-input" rows={3} value={form.financierSmsTemplate || ""} onChange={(e) => patch("financierSmsTemplate", e.target.value)} />
        </FormField>
        <FormField label="Email subject">
          <input className="adt-input" value={form.emailSubjectTemplate || ""} onChange={(e) => patch("emailSubjectTemplate", e.target.value)} />
        </FormField>
        <FormField label="Email body">
          <textarea className="adt-input" rows={8} value={form.emailBodyTemplate || ""} onChange={(e) => patch("emailBodyTemplate", e.target.value)} />
        </FormField>
        <Button tone="primary" onClick={handleSave} disabled={busy}>
          Save templates
        </Button>
      </Card>

      <Card>
        <h3 className="adt-card-header">Run reminder job</h3>
        <p className="rn-muted">
          Automatic run is at 08:00 EAT, only during quiet hours (default 08:00–18:00). Active policies due in exactly 60, 30, 15, 7, or 1 days are notified. Bound/Lost pipeline stages are skipped.
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Button tone="accent" onClick={() => handleRun(false)} disabled={busy}>
            Run now
          </Button>
          <Button tone="danger" onClick={() => handleRun(true)} disabled={busy}>
            Run outside hours / resend
          </Button>
          <Button tone="secondary" onClick={handlePoll} disabled={busy}>
            Poll SMS delivery receipts
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
        <FormField label="Test SMS / WhatsApp" hint="Kenyan number; normalized to +254">
          <input className="adt-input" value={testPhone} onChange={(e) => setTestPhone(e.target.value)} placeholder="722111333" />
        </FormField>
        <div style={{ display: "flex", gap: 8 }}>
          <Button tone="secondary" onClick={handleTestSms} disabled={busy || !testPhone}>
            Send test SMS
          </Button>
          <Button tone="secondary" onClick={handleTestWhatsApp} disabled={busy || !testPhone}>
            Send test WhatsApp
          </Button>
        </div>
      </Card>
    </>
  );
}
