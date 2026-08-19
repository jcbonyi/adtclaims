import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../../context/AuthContext";
import { createRenewal, deleteRenewal, fetchRenewal, updateRenewal } from "../api/renewalsApi";
import { renewalsPath } from "../basePath";
import { canEditRenewals, daysUntilLabel, daysUntilTone, POLICY_STATUSES } from "../constants";
import { formatDisplayDate } from "../../valuationRegister/utils/format";
import { LogStatusBadge, StatusBadge } from "./StatusBadge";
import { AlertBanner, Button, Card, FormField, FormSection, LoadingState, PageHeader } from "./ui";

const emptyForm = {
  insuredName: "",
  phoneRaw: "",
  email: "",
  policyNumber: "",
  insurer: "",
  renewalDate: "",
  carRegistrations: "",
  financialInterest: "",
  status: "Active",
  notes: "",
};

function toDateInput(value) {
  if (!value) return "";
  const m = String(value).match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : "";
}

export function PolicyDetail() {
  const { id } = useParams();
  const isNew = id === "new";
  const navigate = useNavigate();
  const { user } = useAuth();
  const canEdit = canEditRenewals(user?.role);

  const [form, setForm] = useState(emptyForm);
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (isNew) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchRenewal(id);
        if (cancelled) return;
        setDetail(data);
        const p = data.policy;
        setForm({
          insuredName: p.insuredName || "",
          phoneRaw: p.phoneRaw || "",
          email: p.email || "",
          policyNumber: p.policyNumber || "",
          insurer: p.insurer || "",
          renewalDate: toDateInput(p.renewalDate),
          carRegistrations: p.carRegistrations || "",
          financialInterest: p.financialInterest || "",
          status: p.status || "Active",
          notes: p.notes || "",
        });
      } catch (err) {
        if (!cancelled) setError(err.response?.data?.message || "Failed to load policy");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, isNew]);

  function patch(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSave(event) {
    event.preventDefault();
    if (!canEdit) return;
    setSaving(true);
    setError("");
    try {
      const payload = { ...form };
      if (isNew) {
        const created = await createRenewal(payload);
        navigate(renewalsPath(`policy/${created.id}`), { replace: true });
      } else {
        const updated = await updateRenewal(id, payload);
        setDetail((d) => ({ ...d, policy: updated }));
      }
    } catch (err) {
      setError(err.response?.data?.message || "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!canEdit || isNew) return;
    if (!window.confirm("Delete this policy and its notification log?")) return;
    await deleteRenewal(id);
    navigate(renewalsPath("register"));
  }

  if (loading) return <LoadingState label="Loading policy…" />;

  const policy = detail?.policy;

  return (
    <>
      <PageHeader
        title={isNew ? "Add policy" : policy?.insuredName || "Policy"}
        subtitle={
          isNew
            ? "Manual entry. Phone numbers are stored without country code and normalized to +254 on save."
            : `Renews ${formatDisplayDate(policy?.renewalDate)} · ${daysUntilLabel(policy?.daysUntilRenewal)}`
        }
        actions={
          <>
            <Button tone="ghost" onClick={() => navigate(renewalsPath("register"))}>
              ← Register
            </Button>
            {canEdit && !isNew ? (
              <Button tone="danger" onClick={handleDelete}>
                Delete
              </Button>
            ) : null}
          </>
        }
      />

      {error ? <AlertBanner tone="warning">{error}</AlertBanner> : null}

      {!isNew && policy ? (
        <div className="rn-config-pills">
          <StatusBadge status={policy.status} />
          <span className={`rn-days rn-days--${daysUntilTone(policy.daysUntilRenewal)}`}>
            {daysUntilLabel(policy.daysUntilRenewal)}
          </span>
          <span className="rn-pill">SMS: {policy.phoneE164 || "not normalized"}</span>
          <span className="rn-pill">Email: {policy.email || "none"}</span>
          {policy.financierNames.length ? (
            <span className="rn-pill rn-pill--warn">Financier: {policy.financierNames.join(", ")}</span>
          ) : null}
        </div>
      ) : null}

      <form onSubmit={handleSave}>
        <FormSection title="Client & policy" description="Matches the Excel register columns, plus optional email / insurer.">
          <div className="adt-form-grid">
            <FormField label="Insured name" required>
              <input
                className="adt-input"
                value={form.insuredName}
                onChange={(e) => patch("insuredName", e.target.value)}
                required
                disabled={!canEdit}
              />
            </FormField>
            <FormField label="Contacts (phone)" hint="Stored without country code — normalized to +254">
              <input
                className="adt-input"
                value={form.phoneRaw}
                onChange={(e) => patch("phoneRaw", e.target.value)}
                placeholder="722111333"
                disabled={!canEdit}
              />
            </FormField>
            <FormField label="Email">
              <input
                className="adt-input"
                type="email"
                value={form.email}
                onChange={(e) => patch("email", e.target.value)}
                disabled={!canEdit}
              />
            </FormField>
            <FormField label="Policy renewal date" required>
              <input
                className="adt-input"
                type="date"
                value={form.renewalDate}
                onChange={(e) => patch("renewalDate", e.target.value)}
                required
                disabled={!canEdit}
              />
            </FormField>
            <FormField label="Car registration details" hint='Multiple regs separated by "&"'>
              <input
                className="adt-input"
                value={form.carRegistrations}
                onChange={(e) => patch("carRegistrations", e.target.value)}
                placeholder="KBJ 139Q & KCA 001A"
                disabled={!canEdit}
              />
            </FormField>
            <FormField label="Financial interest" hint="Bank/dealer is also notified when populated (not N/A)">
              <input
                className="adt-input"
                value={form.financialInterest}
                onChange={(e) => patch("financialInterest", e.target.value)}
                placeholder="ABSON / N/A"
                disabled={!canEdit}
              />
            </FormField>
            <FormField label="Insurer">
              <input className="adt-input" value={form.insurer} onChange={(e) => patch("insurer", e.target.value)} disabled={!canEdit} />
            </FormField>
            <FormField label="Policy number">
              <input
                className="adt-input"
                value={form.policyNumber}
                onChange={(e) => patch("policyNumber", e.target.value)}
                disabled={!canEdit}
              />
            </FormField>
            <FormField label="Status">
              <select
                className="adt-input"
                value={form.status}
                onChange={(e) => patch("status", e.target.value)}
                disabled={!canEdit}
              >
                {POLICY_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </FormField>
          </div>
          <FormField label="Notes">
            <textarea
              className="adt-input"
              rows={3}
              value={form.notes}
              onChange={(e) => patch("notes", e.target.value)}
              disabled={!canEdit}
            />
          </FormField>
          {canEdit ? (
            <Button tone="primary" type="submit" disabled={saving}>
              {saving ? "Saving…" : isNew ? "Create policy" : "Save changes"}
            </Button>
          ) : null}
        </FormSection>
      </form>

      {!isNew ? (
        <Card>
          <h3 className="adt-card-header">Send attempts</h3>
          {detail?.notifications?.length ? (
            <div className="adt-table-wrap">
              <table className="adt-table">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Milestone</th>
                    <th>Channel</th>
                    <th>Recipient</th>
                    <th>Status</th>
                    <th>Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.notifications.map((n) => (
                    <tr key={n.id}>
                      <td>{n.createdAt ? new Date(n.createdAt).toLocaleString() : "—"}</td>
                      <td>T-{n.milestone}</td>
                      <td className="rn-channel">{n.channel}</td>
                      <td>
                        {n.recipientType}: {n.recipientAddress || n.recipientName || "—"}
                      </td>
                      <td>
                        <LogStatusBadge status={n.status} />
                      </td>
                      <td>{n.errorMessage || n.providerRef || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="rn-muted">No SMS or email attempts yet. The daily job sends at T-60, T-30, and T-15.</p>
          )}
        </Card>
      ) : null}
    </>
  );
}
