import { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useAuth } from "../../../context/AuthContext";
import {
  REPORT_TURNAROUND_DAYS,
  VALUATION_STATUSES,
  canEditValuations,
} from "../constants";
import { useValuations } from "../context/useValuations";
import { fetchValuation, prefillFromClaim, prefillFromQuotation } from "../api/valuationsApi";
import { valuationPath } from "../basePath";
import { formatCurrency, formatDisplayDate } from "../utils/format";
import { StatusBadge } from "./StatusBadge";
import {
  AlertBanner,
  Button,
  Card,
  FormField,
  FormSection,
  LoadingState,
  PageHeader,
  Timeline,
  VarianceBadge,
} from "./ui";

const emptyForm = {
  insuredName: "",
  insuranceCompany: "",
  policyRenewalDate: "",
  vehicleRegistration: "",
  financialInterest: "",
  sumInsuredBefore: "",
  assignedValuerId: "",
  valuationRequestDate: "",
  valuationValue: "",
  status: "Pending Appointment",
  assignedOfficerId: "",
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
  const [loading, setLoading] = useState(!isNew);
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
      setLoading(true);
      try {
        const data = await fetchValuation(id);
        setDetail(data);
        setForm({
          insuredName: data.insuredName || "",
          insuranceCompany: data.insuranceCompany || "",
          policyRenewalDate: data.policyRenewalDate || "",
          vehicleRegistration: data.vehicleRegistration || "",
          financialInterest: data.financialInterest || "",
          sumInsuredBefore: data.sumInsuredBefore ?? "",
          assignedValuerId: data.assignedValuerId ?? "",
          valuationRequestDate: data.valuationRequestDate || "",
          valuationValue: data.valuationValue ?? "",
          status: data.status,
          assignedOfficerId: data.assignedOfficerId ?? "",
          quotationId: data.quotationId,
          claimId: data.claimId,
          requiresValuation: data.requiresValuation,
        });
      } finally {
        setLoading(false);
      }
    }
    load().catch((err) => setError(err.response?.data?.message || "Failed to load"));
  }, [id, isNew, searchParams]);

  function setField(name, value) {
    setForm((f) => ({ ...f, [name]: value }));
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

  if (loading) return <LoadingState label="Loading valuation…" />;

  const followUpItems = (detail?.followUps || []).map((f) => ({
    id: f.id,
    meta: formatDisplayDate(f.followUpDate),
    title: `${f.method}${f.responseReceived ? " · Response received" : ""}`,
    detail: [
      f.remarks,
      f.nextActionDate ? `Next action: ${formatDisplayDate(f.nextActionDate)}` : null,
    ].filter(Boolean).join(" · "),
  }));

  const historyItems = (detail?.statusHistory || []).map((h) => ({
    id: h.id,
    meta: h.changedAt,
    title: `${h.fromStatus || "—"} → ${h.toStatus}`,
    detail: h.changedBy ? `By ${h.changedBy}` : "System",
  }));

  return (
    <>
      <PageHeader
        title={isNew ? "New Valuation" : form.insuredName || "Valuation"}
        subtitle={
          detail?.isOverdue
            ? `Overdue — valuation report not received within ${REPORT_TURNAROUND_DAYS} days of the request.`
            : `Valuation report turnaround: ${REPORT_TURNAROUND_DAYS} days from request date.`
        }
        actions={
          <Button tone="ghost" onClick={() => navigate(valuationPath("register"))}>
            ← Back to register
          </Button>
        }
      />

      {error ? (
        <AlertBanner tone="danger">{error}</AlertBanner>
      ) : null}

      {detail?.isOverdue ? (
        <AlertBanner tone="warning">
          Overdue — the valuation report was not received within {REPORT_TURNAROUND_DAYS} days of the request date.
        </AlertBanner>
      ) : null}

      {detail ? (
        <div className="val-detail-summary">
          <StatusBadge status={detail.status} />
          {detail.percentageVariance != null ? (
            <VarianceBadge
              value={detail.valueDifference}
              percentage={detail.percentageVariance}
            />
          ) : null}
          {detail.sumInsuredBefore != null ? (
            <span className="val-detail-meta">
              Sum insured: {formatCurrency(detail.sumInsuredBefore)}
            </span>
          ) : null}
          {detail.valuationValue != null ? (
            <span className="val-detail-meta">
              Valuation: {formatCurrency(detail.valuationValue)}
            </span>
          ) : null}
        </div>
      ) : null}

      <form onSubmit={handleSave}>
        <FormSection title="Insured & Policy" description="Client and policy information.">
          <div className="adt-form-grid">
            <FormField label="Insured Name" required>
              <input
                className="adt-input"
                value={form.insuredName}
                disabled={!canEdit}
                onChange={(e) => setField("insuredName", e.target.value)}
                required
              />
            </FormField>
            <FormField label="Insurance Company">
              <input
                className="adt-input"
                value={form.insuranceCompany}
                disabled={!canEdit}
                onChange={(e) => setField("insuranceCompany", e.target.value)}
              />
            </FormField>
            <FormField label="Policy Renewal Date">
              <input
                type="date"
                className="adt-input"
                value={form.policyRenewalDate}
                disabled={!canEdit}
                onChange={(e) => setField("policyRenewalDate", e.target.value)}
              />
            </FormField>
          </div>
        </FormSection>

        <FormSection title="Vehicle" description="Registration and financial interest.">
          <div className="adt-form-grid">
            <FormField label="Vehicle Registration">
              <input
                className="adt-input"
                value={form.vehicleRegistration}
                disabled={!canEdit}
                onChange={(e) => setField("vehicleRegistration", e.target.value)}
              />
            </FormField>
            <FormField label="Financial Interest">
              <input
                className="adt-input"
                value={form.financialInterest}
                disabled={!canEdit}
                onChange={(e) => setField("financialInterest", e.target.value)}
              />
            </FormField>
          </div>
        </FormSection>

        <FormSection
          title="Valuation"
          description={`Request and reported value. Report due within ${REPORT_TURNAROUND_DAYS} days of request date.`}
        >
          <div className="adt-form-grid">
            <FormField label="Sum Insured Before">
              <input
                type="number"
                className="adt-input"
                value={form.sumInsuredBefore}
                disabled={!canEdit}
                onChange={(e) => setField("sumInsuredBefore", e.target.value)}
              />
            </FormField>
            <FormField label="Valuation Request Date">
              <input
                type="date"
                className="adt-input"
                value={form.valuationRequestDate}
                disabled={!canEdit}
                onChange={(e) => setField("valuationRequestDate", e.target.value)}
              />
            </FormField>
            <FormField
              label="Valuation Value"
              hint={
                form.valuationValue !== "" && !Number.isNaN(Number(form.valuationValue))
                  ? "Report received — status will be set to Valuation Report Received on save."
                  : undefined
              }
            >
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
            </FormField>
            <FormField label="Assigned Valuer">
              <select
                className="adt-input"
                disabled={!canEdit}
                value={form.assignedValuerId}
                onChange={(e) => setField("assignedValuerId", e.target.value)}
              >
                <option value="">—</option>
                {state.valuers.map((v) => (
                  <option key={v.id} value={v.id}>{v.name}</option>
                ))}
              </select>
            </FormField>
            <FormField label="Status">
              <select
                className="adt-input"
                disabled={!canEdit}
                value={form.status}
                onChange={(e) => setField("status", e.target.value)}
              >
                {VALUATION_STATUSES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </FormField>
          </div>
        </FormSection>

        {detail?.quotationId || detail?.claimId ? (
          <Card className="mt-4">
            <h3 className="adt-card-header">Linked records</h3>
            {detail.quotationId ? (
              <p>
                Quotation:{" "}
                <Link to={`/quotations/client/${detail.quotationId}`}>#{detail.quotationId}</Link>
              </p>
            ) : null}
            {detail.claimId ? (
              <p>
                Claim: <Link to={`/claims/${detail.claimId}`}>#{detail.claimId}</Link>
              </p>
            ) : null}
          </Card>
        ) : null}

        {canEdit ? (
          <div className="val-form-actions">
            <Button tone="primary" type="submit" disabled={saving}>
              {saving ? "Saving…" : isNew ? "Create Valuation" : "Save Changes"}
            </Button>
            <Button tone="ghost" type="button" onClick={() => navigate(valuationPath("register"))}>
              Cancel
            </Button>
          </div>
        ) : null}
      </form>

      {!isNew && (followUpItems.length > 0 || historyItems.length > 0) ? (
        <div className="val-detail-timelines">
          {followUpItems.length > 0 ? (
            <Card>
              <h3 className="adt-card-header">Follow-up Log</h3>
              <Timeline items={followUpItems} />
            </Card>
          ) : null}
          {historyItems.length > 0 ? (
            <Card>
              <h3 className="adt-card-header">Status History</h3>
              <Timeline items={historyItems} />
            </Card>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
