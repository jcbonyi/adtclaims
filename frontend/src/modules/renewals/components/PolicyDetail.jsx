import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../../context/AuthContext";
import {
  addFollowUp,
  createRenewal,
  deleteRenewal,
  downloadRenewalAttachment,
  fetchOfficers,
  fetchRenewal,
  rollRenewal,
  updateRenewal,
  uploadRenewalAttachment,
} from "../api/renewalsApi";
import { renewalsPath } from "../basePath";
import {
  canEditRenewals,
  daysUntilLabel,
  daysUntilTone,
  FOLLOW_UP_METHODS,
  formatKes,
  PIPELINE_STAGES,
  POLICY_STATUSES,
} from "../constants";
import { formatDisplayDate } from "../../valuationRegister/utils/format";
import { LogStatusBadge, PipelineBadge, StatusBadge } from "./StatusBadge";
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
  pipelineStage: "Not contacted",
  premium: "",
  assignedOfficerId: "",
  relationshipManager: "",
  smsOptOut: false,
};

function toDateInput(value) {
  if (!value) return "";
  const m = String(value).match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : "";
}

function policyPayload(form) {
  return {
    ...form,
    premium: form.premium === "" || form.premium == null ? null : Number(form.premium),
    assignedOfficerId: form.assignedOfficerId ? Number(form.assignedOfficerId) : null,
    smsOptOut: !!form.smsOptOut,
  };
}

export function PolicyDetail() {
  const { id } = useParams();
  const isNew = id === "new";
  const navigate = useNavigate();
  const { user } = useAuth();
  const canEdit = canEditRenewals(user?.role);

  const [form, setForm] = useState(emptyForm);
  const [detail, setDetail] = useState(null);
  const [officers, setOfficers] = useState([]);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [followUp, setFollowUp] = useState({ method: "Call", outcome: "", remarks: "" });

  async function load() {
    const [data, staff] = await Promise.all([fetchRenewal(id), fetchOfficers().catch(() => [])]);
    setDetail(data);
    setOfficers(staff);
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
      pipelineStage: p.pipelineStage || "Not contacted",
      premium: p.premium ?? "",
      assignedOfficerId: p.assignedOfficerId || "",
      relationshipManager: p.relationshipManager || "",
      smsOptOut: !!p.smsOptOut,
    });
  }

  useEffect(() => {
    fetchOfficers().then(setOfficers).catch(() => setOfficers([]));
    if (isNew) return undefined;
    let cancelled = false;
    (async () => {
      try {
        await load();
      } catch (err) {
        if (!cancelled) setError(err.response?.data?.message || "Failed to load policy");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      const payload = policyPayload(form);
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

  async function handleRoll() {
    if (!canEdit || isNew) return;
    if (!window.confirm("Mark as renewed and roll the expiry date forward 12 months? T-60/30/15/7/1 will restart.")) return;
    setSaving(true);
    try {
      const updated = await rollRenewal(id);
      setDetail((d) => ({ ...d, policy: updated }));
      setForm((f) => ({
        ...f,
        renewalDate: toDateInput(updated.renewalDate),
        status: updated.status,
        pipelineStage: updated.pipelineStage,
      }));
    } catch (err) {
      setError(err.response?.data?.message || "Could not roll date");
    } finally {
      setSaving(false);
    }
  }

  async function handleFollowUp(event) {
    event.preventDefault();
    if (!canEdit) return;
    await addFollowUp(id, followUp);
    setFollowUp({ method: "Call", outcome: "", remarks: "" });
    await load();
  }

  async function handleUpload(file) {
    if (!file || !canEdit) return;
    await uploadRenewalAttachment(id, file);
    await load();
  }

  if (loading) return <LoadingState label="Loading policy…" />;

  const policy = detail?.policy;
  const client360 = detail?.client360;

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
              <>
                <Button tone="accent" onClick={handleRoll} disabled={saving}>
                  Mark renewed +12 months
                </Button>
                <Button tone="danger" onClick={handleDelete}>
                  Delete
                </Button>
              </>
            ) : null}
          </>
        }
      />

      {error ? <AlertBanner tone="warning">{error}</AlertBanner> : null}

      {!isNew && policy ? (
        <div className="rn-config-pills">
          <StatusBadge status={policy.status} />
          <PipelineBadge stage={policy.pipelineStage} />
          <span className={`rn-days rn-days--${daysUntilTone(policy.daysUntilRenewal)}`}>
            {daysUntilLabel(policy.daysUntilRenewal)}
          </span>
          <span className="rn-pill">SMS: {policy.phoneE164 || "not normalized"}</span>
          <span className="rn-pill">Email: {policy.email || "none"}</span>
          <span className="rn-pill">Premium: {formatKes(policy.premium)}</span>
          {policy.smsOptOut ? <span className="rn-pill rn-pill--warn">SMS opted out</span> : null}
          {policy.officerName ? <span className="rn-pill">RM: {policy.officerName}</span> : null}
          {policy.financierNames.length ? (
            <span className="rn-pill rn-pill--warn">Financier: {policy.financierNames.join(", ")}</span>
          ) : null}
        </div>
      ) : null}

      <form onSubmit={handleSave}>
        <FormSection title="Client & policy" description="Matches the Excel register columns, plus pipeline, RM, and premium at risk.">
          <div className="adt-form-grid">
            <FormField label="Insured name" required>
              <input className="adt-input" value={form.insuredName} onChange={(e) => patch("insuredName", e.target.value)} required disabled={!canEdit} />
            </FormField>
            <FormField label="Contacts (phone)" hint="Stored without country code — normalized to +254">
              <input className="adt-input" value={form.phoneRaw} onChange={(e) => patch("phoneRaw", e.target.value)} placeholder="722111333" disabled={!canEdit} />
            </FormField>
            <FormField label="Email">
              <input className="adt-input" type="email" value={form.email} onChange={(e) => patch("email", e.target.value)} disabled={!canEdit} />
            </FormField>
            <FormField label="Policy renewal date" required>
              <input className="adt-input" type="date" value={form.renewalDate} onChange={(e) => patch("renewalDate", e.target.value)} required disabled={!canEdit} />
            </FormField>
            <FormField label="Car registration details" hint='Multiple regs separated by "&"'>
              <input className="adt-input" value={form.carRegistrations} onChange={(e) => patch("carRegistrations", e.target.value)} placeholder="KBJ 139Q & KCA 001A" disabled={!canEdit} />
            </FormField>
            <FormField label="Financial interest" hint="Bank/dealer is also notified when populated (not N/A)">
              <input className="adt-input" value={form.financialInterest} onChange={(e) => patch("financialInterest", e.target.value)} placeholder="ABSON / N/A" disabled={!canEdit} />
            </FormField>
            <FormField label="Insurer">
              <input className="adt-input" value={form.insurer} onChange={(e) => patch("insurer", e.target.value)} disabled={!canEdit} />
            </FormField>
            <FormField label="Policy number">
              <input className="adt-input" value={form.policyNumber} onChange={(e) => patch("policyNumber", e.target.value)} disabled={!canEdit} />
            </FormField>
            <FormField label="Status">
              <select className="adt-input" value={form.status} onChange={(e) => patch("status", e.target.value)} disabled={!canEdit}>
                {POLICY_STATUSES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </FormField>
            <FormField label="Pipeline">
              <select className="adt-input" value={form.pipelineStage} onChange={(e) => patch("pipelineStage", e.target.value)} disabled={!canEdit}>
                {PIPELINE_STAGES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </FormField>
            <FormField label="Premium (KES)">
              <input className="adt-input" type="number" value={form.premium} onChange={(e) => patch("premium", e.target.value)} disabled={!canEdit} />
            </FormField>
            <FormField label="Assigned officer / RM">
              <select className="adt-input" value={form.assignedOfficerId} onChange={(e) => patch("assignedOfficerId", e.target.value)} disabled={!canEdit}>
                <option value="">Unassigned</option>
                {officers.map((o) => (
                  <option key={o.id} value={o.id}>{o.name}</option>
                ))}
              </select>
            </FormField>
            <FormField label="Relationship manager (text)">
              <input className="adt-input" value={form.relationshipManager} onChange={(e) => patch("relationshipManager", e.target.value)} disabled={!canEdit} />
            </FormField>
          </div>
          <label className="val-field" style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}>
            <input type="checkbox" checked={form.smsOptOut} onChange={(e) => patch("smsOptOut", e.target.checked)} disabled={!canEdit} />
            Client opted out of SMS / WhatsApp (STOP)
          </label>
          <FormField label="Notes">
            <textarea className="adt-input" rows={3} value={form.notes} onChange={(e) => patch("notes", e.target.value)} disabled={!canEdit} />
          </FormField>
          {canEdit ? (
            <Button tone="primary" type="submit" disabled={saving}>
              {saving ? "Saving…" : isNew ? "Create policy" : "Save changes"}
            </Button>
          ) : null}
        </FormSection>
      </form>

      {!isNew ? (
        <>
          <Card>
            <h3 className="adt-card-header">Call / follow-up log</h3>
            {canEdit ? (
              <form onSubmit={handleFollowUp} className="adt-form-grid" style={{ marginBottom: 16 }}>
                <FormField label="Method">
                  <select className="adt-input" value={followUp.method} onChange={(e) => setFollowUp((f) => ({ ...f, method: e.target.value }))}>
                    {FOLLOW_UP_METHODS.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </FormField>
                <FormField label="Outcome">
                  <input className="adt-input" value={followUp.outcome} onChange={(e) => setFollowUp((f) => ({ ...f, outcome: e.target.value }))} placeholder="Quoted / will pay / no answer" />
                </FormField>
                <FormField label="Remarks">
                  <input className="adt-input" value={followUp.remarks} onChange={(e) => setFollowUp((f) => ({ ...f, remarks: e.target.value }))} />
                </FormField>
                <div style={{ display: "flex", alignItems: "flex-end" }}>
                  <Button tone="secondary" type="submit">Add follow-up</Button>
                </div>
              </form>
            ) : null}
            {detail?.followUps?.length ? (
              <div className="adt-table-wrap">
                <table className="adt-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Officer</th>
                      <th>Method</th>
                      <th>Outcome</th>
                      <th>Remarks</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.followUps.map((item) => (
                      <tr key={item.id}>
                        <td>{formatDisplayDate(item.date)}</td>
                        <td>{item.officerName || "—"}</td>
                        <td>{item.method}</td>
                        <td>{item.outcome || "—"}</td>
                        <td>{item.remarks || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="rn-muted">No calls or inbound STOP/RENEWED messages yet.</p>
            )}
          </Card>

          <Card>
            <h3 className="adt-card-header">Attachments</h3>
            {canEdit ? (
              <input type="file" onChange={(e) => handleUpload(e.target.files?.[0])} style={{ marginBottom: 12 }} />
            ) : null}
            {detail?.attachments?.length ? (
              <ul>
                {detail.attachments.map((file) => (
                  <li key={file.id}>
                    <button type="button" className="adt-link-btn" onClick={() => downloadRenewalAttachment(id, file.id, file.originalName)}>
                      {file.originalName}
                    </button>
                    <span className="rn-muted"> · {file.uploadedBy || "—"}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="rn-muted">Debit notes, schedules, and logbook copies can be stored here.</p>
            )}
          </Card>

          <Card>
            <h3 className="adt-card-header">Client 360</h3>
            {client360 ? (
              <div className="adt-form-grid">
                <div>
                  <p className="rn-muted">Claims</p>
                  {(client360.claims || []).length ? client360.claims.map((c) => (
                    <p key={c.id}><Link to={`/claims/${c.id}`}>{c.insured_name}</Link> · {c.claim_status} · {c.registration_number}</p>
                  )) : <p>—</p>}
                </div>
                <div>
                  <p className="rn-muted">Quotations</p>
                  {(client360.quotations || []).length ? client360.quotations.map((q) => (
                    <p key={q.id}><Link to={`/quotations`}>{q.client_name}</Link> · {q.status} · {q.insurer || "—"}</p>
                  )) : <p>—</p>}
                </div>
                <div>
                  <p className="rn-muted">Valuations</p>
                  {(client360.valuations || []).length ? client360.valuations.map((v) => (
                    <p key={v.id}><Link to={`/valuations/valuation/${v.id}`}>{v.insured_name}</Link> · {v.status} · {v.vehicle_registration}</p>
                  )) : <p>—</p>}
                </div>
              </div>
            ) : (
              <p className="rn-muted">No related records.</p>
            )}
          </Card>

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
                      <th>Delivery</th>
                      <th>Detail</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.notifications.map((n) => (
                      <tr key={n.id}>
                        <td>{n.createdAt ? new Date(n.createdAt).toLocaleString() : "—"}</td>
                        <td>T-{n.milestone}</td>
                        <td className="rn-channel">{n.channel}</td>
                        <td>{n.recipientType}: {n.recipientAddress || n.recipientName || "—"}</td>
                        <td><LogStatusBadge status={n.status} /></td>
                        <td>{n.deliveryStatus || "—"}</td>
                        <td>{n.errorMessage || n.providerRef || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="rn-muted">No send attempts yet. The daily job notifies at T-60, T-30, T-15, T-7, and T-1.</p>
            )}
          </Card>
        </>
      ) : null}
    </>
  );
}
