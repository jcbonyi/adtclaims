import { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useAuth } from "../../../context/AuthContext";
import {
  VALUATION_STATUSES,
  canEditValuations,
} from "../constants";
import { useValuations } from "../context/useValuations";
import { fetchValuation, prefillFromClaim, prefillFromQuotation } from "../api/valuationsApi";
import { valuationPath } from "../basePath";
import { StatusBadge } from "./StatusBadge";
import { Button, Card, PageHeader } from "./ui";

const emptyForm = {
  insuredName: "",
  insuranceCompany: "",
  policyRenewalDate: "",
  vehicleRegistration: "",
  vehicleMakeModel: "",
  financialInterest: "",
  sumInsuredBefore: "",
  assignedValuerId: "",
  valuationRequestDate: "",
  inspectionDate: "",
  valuationValue: "",
  status: "Pending Appointment",
  assignedOfficerId: "",
  relationshipManager: "",
  policyNumber: "",
  quotationId: null,
  claimId: null,
  requiresValuation: true,
};

export function ValuationDetail() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const isNew = id === "new";
  const navigate = useNavigate();
  const { user } = useAuth();
  const { state, dispatch } = useValuations();
  const canEdit = canEditValuations(user?.role);

  const [form, setForm] = useState(emptyForm);
  const [detail, setDetail] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      if (isNew) {
        const fromQuotation = searchParams.get("fromQuotation");
        const fromClaim = searchParams.get("fromClaim");
        if (fromQuotation) {
          const { prefill } = await prefillFromQuotation(fromQuotation);
          setForm((f) => ({
            ...f,
            ...prefill,
            sumInsuredBefore: prefill.sumInsuredBefore ?? "",
          }));
        } else if (fromClaim) {
          const { prefill } = await prefillFromClaim(fromClaim);
          setForm((f) => ({
            ...f,
            ...prefill,
            sumInsuredBefore: prefill.sumInsuredBefore ?? "",
          }));
        }
        return;
      }
      const data = await fetchValuation(id);
      setDetail(data);
      setForm({
        insuredName: data.insuredName || "",
        insuranceCompany: data.insuranceCompany || "",
        policyRenewalDate: data.policyRenewalDate || "",
        vehicleRegistration: data.vehicleRegistration || "",
        vehicleMakeModel: data.vehicleMakeModel || "",
        financialInterest: data.financialInterest || "",
        sumInsuredBefore: data.sumInsuredBefore ?? "",
        assignedValuerId: data.assignedValuerId ?? "",
        valuationRequestDate: data.valuationRequestDate || "",
        inspectionDate: data.inspectionDate || "",
        valuationValue: data.valuationValue ?? "",
        status: data.status,
        assignedOfficerId: data.assignedOfficerId ?? "",
        relationshipManager: data.relationshipManager || "",
        policyNumber: data.policyNumber || "",
        quotationId: data.quotationId,
        claimId: data.claimId,
        requiresValuation: data.requiresValuation,
      });
    }
    load().catch((err) => setError(err.response?.data?.message || "Failed to load"));
  }, [id, isNew, searchParams]);

  function field(name, label, type = "text") {
    return (
      <label>
        {label}
        <input
          type={type}
          className="adt-input"
          value={form[name]}
          disabled={!canEdit}
          onChange={(e) => setForm((f) => ({ ...f, [name]: e.target.value }))}
        />
      </label>
    );
  }

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setError("");
    const payload = {
      ...form,
      sumInsuredBefore: form.sumInsuredBefore === "" ? null : Number(form.sumInsuredBefore),
      valuationValue: form.valuationValue === "" ? null : Number(form.valuationValue),
      assignedValuerId: form.assignedValuerId === "" ? null : Number(form.assignedValuerId),
      assignedOfficerId: form.assignedOfficerId === "" ? null : Number(form.assignedOfficerId),
    };
    try {
      if (isNew) {
        await dispatch({ type: "ADD", payload });
        navigate(valuationPath("register"));
      } else {
        await dispatch({ type: "UPDATE", payload: { id: Number(id), patch: payload } });
        const refreshed = await fetchValuation(id);
        setDetail(refreshed);
      }
    } catch (err) {
      setError(err.response?.data?.message || "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader
        title={isNew ? "New Valuation" : `Valuation — ${form.insuredName}`}
        subtitle={detail?.isOverdue ? "This valuation is overdue." : "Policy and valuation details."}
        actions={<Button tone="ghost" onClick={() => navigate(valuationPath("register"))}>← Back</Button>}
      />

      {error ? <p className="adt-error">{error}</p> : null}
      {detail?.isOverdue ? <p className="adt-alert">Overdue — no inspection within compliance window.</p> : null}

      <form onSubmit={handleSave} className="adt-form-grid">
        {field("insuredName", "Insured Name")}
        {field("insuranceCompany", "Insurance Company")}
        {field("policyNumber", "Policy Number")}
        {field("policyRenewalDate", "Policy Renewal Date", "date")}
        {field("vehicleRegistration", "Vehicle Registration")}
        {field("vehicleMakeModel", "Make & Model")}
        {field("financialInterest", "Financial Interest")}
        {field("sumInsuredBefore", "Sum Insured Before", "number")}
        {field("valuationRequestDate", "Valuation Request Date", "date")}
        {field("inspectionDate", "Inspection Date", "date")}
        <label>
          Valuation Value
          <input
            type="number"
            className="adt-input"
            value={form.valuationValue}
            disabled={!canEdit}
            onChange={(e) => {
              const value = e.target.value;
              setForm((f) => ({
                ...f,
                valuationValue: value,
                status:
                  value !== "" && !Number.isNaN(Number(value))
                    ? "Valuation Report Received"
                    : f.status,
              }));
            }}
          />
          {form.valuationValue !== "" && !Number.isNaN(Number(form.valuationValue)) ? (
            <span style={{ fontSize: 12, color: "#047857", marginTop: 4, display: "block" }}>
              Report received — status will be set to Valuation Report Received on save.
            </span>
          ) : null}
        </label>
        {field("relationshipManager", "Relationship Manager")}

        <label>
          Assigned Valuer
          <select
            className="adt-input"
            disabled={!canEdit}
            value={form.assignedValuerId}
            onChange={(e) => setForm((f) => ({ ...f, assignedValuerId: e.target.value }))}
          >
            <option value="">—</option>
            {state.valuers.map((v) => (
              <option key={v.id} value={v.id}>{v.name}</option>
            ))}
          </select>
        </label>

        <label>
          Status
          <select
            className="adt-input"
            disabled={!canEdit}
            value={form.status}
            onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
          >
            {VALUATION_STATUSES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </label>

        {detail ? (
          <div style={{ gridColumn: "1 / -1" }}>
            <StatusBadge status={detail.status} />
            {detail.valueDifference != null ? (
              <span style={{ marginLeft: 12 }}>
                Difference: {detail.valueDifference} ({detail.percentageVariance}%)
              </span>
            ) : null}
          </div>
        ) : null}

        {detail?.quotationId ? (
          <p style={{ gridColumn: "1 / -1" }}>
            Linked quotation: <Link to={`/quotations/client/${detail.quotationId}`}>#{detail.quotationId}</Link>
          </p>
        ) : null}
        {detail?.claimId ? (
          <p style={{ gridColumn: "1 / -1" }}>
            Linked claim: <Link to={`/claims/${detail.claimId}`}>#{detail.claimId}</Link>
          </p>
        ) : null}

        {canEdit ? (
          <div style={{ gridColumn: "1 / -1" }}>
            <Button tone="primary" type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        ) : null}
      </form>

      {detail?.followUps?.length ? (
        <Card style={{ marginTop: 24 }}>
          <h3 className="adt-card-header">Follow-up Log</h3>
          <ul>
            {detail.followUps.map((f) => (
              <li key={f.id}>
                {f.followUpDate} — {f.method}: {f.remarks}
                {f.nextActionDate ? ` (next: ${f.nextActionDate})` : ""}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {detail?.statusHistory?.length ? (
        <Card style={{ marginTop: 16 }}>
          <h3 className="adt-card-header">Status History</h3>
          <ul>
            {detail.statusHistory.map((h) => (
              <li key={h.id}>
                {h.changedAt}: {h.fromStatus || "—"} → {h.toStatus} ({h.changedBy || "system"})
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </>
  );
}
