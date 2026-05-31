import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import client from "../api/client";
import { useAuth } from "../context/AuthContext";
import PageHeader from "../components/PageHeader";
import StatusSelectOptions from "../components/StatusSelectOptions";
import { useToast } from "../context/ToastContext";
import { formatCurrency, formatDate, toDateInputString } from "../utils/format";

const blankClaim = {
  insurer: "",
  claimType: "MOTOR",
  coverType: "",
  insuredName: "",
  registrationNumber: "",
  accidentDate: "",
  reportedToBrokerDate: "",
  reportedToInsurerDate: "",
  assessedDate: "",
  claimStatus: "Reported",
  claimStatusOther: "",
  dateRaIssued: "",
  dateVehicleReleased: "",
  vehicleValue: "",
  repairEstimate: "",
  garage: "",
};

function claimStateFromApi(c) {
  return {
    insurer: c.insurer || "",
    claimType: c.claimType || "MOTOR",
    coverType: c.coverType || "",
    insuredName: c.insuredName || "",
    registrationNumber: c.registrationNumber || "",
    accidentDate: toDateInputString(c.accidentDate),
    reportedToBrokerDate: toDateInputString(c.reportedToBrokerDate),
    reportedToInsurerDate: toDateInputString(c.reportedToInsurerDate),
    assessedDate: toDateInputString(c.assessedDate),
    claimStatus: c.claimStatus || "Reported",
    claimStatusOther: c.claimStatusOther || "",
    dateRaIssued: toDateInputString(c.dateRaIssued),
    dateVehicleReleased: toDateInputString(c.dateVehicleReleased),
    vehicleValue: c.vehicleValue ?? "",
    repairEstimate: c.repairEstimate ?? "",
    garage: c.garage || "",
  };
}

export default function ClaimDetailPage({ mode }) {
  const navigate = useNavigate();
  const { id } = useParams();
  const { user } = useAuth();
  const canEdit = user?.role !== "Read-Only";
  const [claim, setClaim] = useState(blankClaim);
  const [remarks, setRemarks] = useState([]);
  const [history, setHistory] = useState([]);
  const [newRemark, setNewRemark] = useState("");
  const [saving, setSaving] = useState(false);
  const { notify } = useToast();

  const title = useMemo(
    () => (mode === "create" ? "Create New Claim" : `Claim #${id}`),
    [mode, id]
  );

  async function loadClaim() {
    if (mode !== "edit") return;
    const res = await client.get(`/claims/${id}`);
    setClaim(claimStateFromApi(res.data.claim));
    setRemarks(res.data.remarks);
    setHistory(res.data.statusHistory);
  }

  useEffect(() => {
    if (mode !== "edit") return;
    let ignore = false;
    async function init() {
      const res = await client.get(`/claims/${id}`);
      if (ignore) return;
      setClaim(claimStateFromApi(res.data.claim));
      setRemarks(res.data.remarks);
      setHistory(res.data.statusHistory);
    }
    init();
    return () => {
      ignore = true;
    };
  }, [id, mode]);

  async function saveClaim(e) {
    e.preventDefault();
    if (!canEdit) return;
    setSaving(true);
    try {
      const payload = {
        ...claim,
        vehicleValue: claim.vehicleValue === "" ? null : Number(claim.vehicleValue),
        repairEstimate: claim.repairEstimate === "" ? null : Number(claim.repairEstimate),
      };
      if (mode === "create") {
        const res = await client.post("/claims", payload);
        notify("Claim created.", "success");
        navigate(`/claims/${res.data.id}`);
      } else {
        await client.put(`/claims/${id}`, payload);
        await loadClaim();
        notify("Changes saved.", "success");
      }
    } catch {
      notify("Could not save claim.", "error");
    } finally {
      setSaving(false);
    }
  }

  async function appendRemark() {
    if (!canEdit || !newRemark.trim()) return;
    await client.post(`/claims/${id}/remarks`, { remark: newRemark.trim() });
    setNewRemark("");
    await loadClaim();
  }

  const fieldClass = "adt-input";
  const labelClass = "adt-label";

  return (
    <div className="space-y-4">
      <PageHeader
        title={title}
        subtitle={mode === "edit" ? "Status changes and remarks are fully audited." : "Enter claim details below."}
        actions={
          <Link to="/claims" className="adt-btn adt-btn-secondary">
            ← Register
          </Link>
        }
      >
        <nav className="adt-breadcrumb mb-2">
          <Link to="/dashboard">Dashboard</Link>
          <span aria-hidden="true">/</span>
          <Link to="/claims">Claims</Link>
          {mode === "edit" ? (
            <>
              <span aria-hidden="true">/</span>
              <span>#{id}</span>
            </>
          ) : (
            <>
              <span aria-hidden="true">/</span>
              <span>New</span>
            </>
          )}
        </nav>
      </PageHeader>

      <form className="adt-card grid gap-4 p-4 md:grid-cols-2" onSubmit={saveClaim}>
        <p className="md:col-span-2 text-xs font-bold uppercase tracking-wide text-slate-500">Policy & parties</p>
        <label>
          <span className={labelClass}>Insurer</span>
          <input
            className={fieldClass}
            value={claim.insurer}
            onChange={(e) => setClaim((prev) => ({ ...prev, insurer: e.target.value }))}
            required
            disabled={!canEdit}
          />
        </label>
        <label>
          <span className={labelClass}>Claim Type</span>
          <select
            className={fieldClass}
            value={claim.claimType}
            onChange={(e) => setClaim((prev) => ({ ...prev, claimType: e.target.value }))}
            disabled={!canEdit}
          >
            <option value="MOTOR">MOTOR</option>
            <option value="NON-MOTOR">NON-MOTOR</option>
          </select>
        </label>
        <label>
          <span className={labelClass}>Cover Type</span>
          <input
            className={fieldClass}
            value={claim.coverType}
            onChange={(e) => setClaim((prev) => ({ ...prev, coverType: e.target.value }))}
            required
            disabled={!canEdit}
          />
        </label>
        <label>
          <span className={labelClass}>Insured Name</span>
          <input
            className={fieldClass}
            value={claim.insuredName}
            onChange={(e) => setClaim((prev) => ({ ...prev, insuredName: e.target.value }))}
            required
            disabled={!canEdit}
          />
        </label>
        <label>
          <span className={labelClass}>Registration Number / Name</span>
          <input
            className={fieldClass}
            value={claim.registrationNumber}
            onChange={(e) => setClaim((prev) => ({ ...prev, registrationNumber: e.target.value }))}
            required
            disabled={!canEdit}
          />
        </label>
        <label>
          <span className={labelClass}>Status</span>
          <select
            className={fieldClass}
            value={claim.claimStatus}
            onChange={(e) => setClaim((prev) => ({ ...prev, claimStatus: e.target.value }))}
            disabled={!canEdit}
          >
            <StatusSelectOptions />
          </select>
        </label>

        {claim.claimStatus === "Other" ? (
          <label className="md:col-span-2">
            <span className={labelClass}>Other Status Text</span>
            <input
              className={fieldClass}
              value={claim.claimStatusOther}
              onChange={(e) => setClaim((prev) => ({ ...prev, claimStatusOther: e.target.value }))}
              disabled={!canEdit}
            />
          </label>
        ) : null}

        <p className="md:col-span-2 mt-2 text-xs font-bold uppercase tracking-wide text-slate-500">Key dates</p>
        {[
          ["accidentDate", "Date of Accident/Loss"],
          ["reportedToBrokerDate", "Date Reported to Broker (ADT)"],
          ["reportedToInsurerDate", "Date Reported to Insurer"],
          ["assessedDate", "Date Assessed"],
          ["dateRaIssued", "Date RA Issued"],
          ["dateVehicleReleased", "Date Vehicle Released"],
        ].map(([key, label]) => (
          <label key={key}>
            <span className={labelClass}>{label}</span>
            <input
              type="date"
              className={fieldClass}
              value={claim[key]}
              onChange={(e) => setClaim((prev) => ({ ...prev, [key]: e.target.value }))}
              disabled={!canEdit}
            />
          </label>
        ))}

        <p className="md:col-span-2 mt-2 text-xs font-bold uppercase tracking-wide text-slate-500">Financials</p>
        <label>
          <span className={labelClass}>Vehicle Value (KES)</span>
          <input
            type="number"
            className={fieldClass}
            value={claim.vehicleValue}
            onChange={(e) => setClaim((prev) => ({ ...prev, vehicleValue: e.target.value }))}
            disabled={!canEdit}
          />
        </label>
        <label>
          <span className={labelClass}>Repair Estimate (KES)</span>
          <input
            type="number"
            className={fieldClass}
            value={claim.repairEstimate}
            onChange={(e) => setClaim((prev) => ({ ...prev, repairEstimate: e.target.value }))}
            disabled={!canEdit}
          />
        </label>
        <label className="md:col-span-2">
          <span className={labelClass}>Garage / Repairer</span>
          <input
            className={fieldClass}
            value={claim.garage}
            onChange={(e) => setClaim((prev) => ({ ...prev, garage: e.target.value }))}
            disabled={!canEdit}
          />
        </label>

        {canEdit ? (
          <button
            type="submit"
            disabled={saving}
            className={`adt-btn md:col-span-2 ${mode === "create" ? "adt-btn-accent" : "adt-btn-primary"}`}
          >
            {saving ? "Saving..." : mode === "create" ? "Create Claim" : "Save Changes"}
          </button>
        ) : null}
      </form>

      {mode === "edit" ? (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="adt-card p-4">
            <h3 className="mb-2 text-base font-semibold text-slate-900">Activity remarks</h3>
            {canEdit ? (
              <div className="mb-3 flex gap-2">
                <input
                  className={fieldClass}
                  placeholder="Add follow-up remark"
                  value={newRemark}
                  onChange={(e) => setNewRemark(e.target.value)}
                />
                <button
                  type="button"
                  className="adt-btn adt-btn-accent shrink-0"
                  onClick={appendRemark}
                >
                  Add
                </button>
              </div>
            ) : null}
            <ul className="space-y-2">
              {remarks.map((item) => (
                <li key={item.id} className="rounded border border-slate-200 p-2 text-sm">
                  <p className="mb-1 text-slate-900">{item.remark}</p>
                  <p className="text-xs text-slate-500">
                    {item.createdByName} - {formatDate(item.createdAt)}
                  </p>
                </li>
              ))}
              {remarks.length === 0 ? <li className="text-sm text-slate-500">No remarks yet.</li> : null}
            </ul>
          </div>

          <div className="adt-card p-4">
            <h3 className="mb-2 text-base font-semibold text-slate-900">Status history</h3>
            <ul className="space-y-2">
              {history.map((item) => (
                <li key={item.id} className="rounded border border-slate-200 p-2 text-sm">
                  <p className="text-slate-900">
                    {item.fromStatus || "N/A"} {"->"} {item.toStatus}
                  </p>
                  <p className="text-xs text-slate-500">
                    {item.changedByName} - {formatDate(item.changedAt)}
                  </p>
                </li>
              ))}
              {history.length === 0 ? <li className="text-sm text-slate-500">No status changes logged.</li> : null}
            </ul>
          </div>
        </div>
      ) : null}

      {mode === "edit" ? (
        <div className="adt-card p-4 text-sm text-slate-600">
          <p>
            Vehicle Value: <span className="font-medium text-slate-900">{formatCurrency(claim.vehicleValue)}</span>
          </p>
          <p>
            Repair Estimate:{" "}
            <span className="font-medium text-slate-900">{formatCurrency(claim.repairEstimate)}</span>
          </p>
        </div>
      ) : null}
    </div>
  );
}
