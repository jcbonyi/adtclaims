import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import client from "../api/client";
import { useAuth } from "../context/AuthContext";
import { CLAIM_STATUSES } from "../utils/constants";
import { formatCurrency, formatDate } from "../utils/format";

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

  const title = useMemo(
    () => (mode === "create" ? "Create New Claim" : `Claim #${id}`),
    [mode, id]
  );

  async function loadClaim() {
    if (mode !== "edit") return;
    const res = await client.get(`/claims/${id}`);
    setClaim({
      insurer: res.data.claim.insurer || "",
      claimType: res.data.claim.claimType || "MOTOR",
      coverType: res.data.claim.coverType || "",
      insuredName: res.data.claim.insuredName || "",
      registrationNumber: res.data.claim.registrationNumber || "",
      accidentDate: res.data.claim.accidentDate || "",
      reportedToBrokerDate: res.data.claim.reportedToBrokerDate || "",
      reportedToInsurerDate: res.data.claim.reportedToInsurerDate || "",
      assessedDate: res.data.claim.assessedDate || "",
      claimStatus: res.data.claim.claimStatus || "Reported",
      claimStatusOther: res.data.claim.claimStatusOther || "",
      dateRaIssued: res.data.claim.dateRaIssued || "",
      dateVehicleReleased: res.data.claim.dateVehicleReleased || "",
      vehicleValue: res.data.claim.vehicleValue ?? "",
      repairEstimate: res.data.claim.repairEstimate ?? "",
      garage: res.data.claim.garage || "",
    });
    setRemarks(res.data.remarks);
    setHistory(res.data.statusHistory);
  }

  useEffect(() => {
    if (mode !== "edit") return;
    let ignore = false;
    async function init() {
      const res = await client.get(`/claims/${id}`);
      if (ignore) return;
      setClaim({
        insurer: res.data.claim.insurer || "",
        claimType: res.data.claim.claimType || "MOTOR",
        coverType: res.data.claim.coverType || "",
        insuredName: res.data.claim.insuredName || "",
        registrationNumber: res.data.claim.registrationNumber || "",
        accidentDate: res.data.claim.accidentDate || "",
        reportedToBrokerDate: res.data.claim.reportedToBrokerDate || "",
        reportedToInsurerDate: res.data.claim.reportedToInsurerDate || "",
        assessedDate: res.data.claim.assessedDate || "",
        claimStatus: res.data.claim.claimStatus || "Reported",
        claimStatusOther: res.data.claim.claimStatusOther || "",
        dateRaIssued: res.data.claim.dateRaIssued || "",
        dateVehicleReleased: res.data.claim.dateVehicleReleased || "",
        vehicleValue: res.data.claim.vehicleValue ?? "",
        repairEstimate: res.data.claim.repairEstimate ?? "",
        garage: res.data.claim.garage || "",
      });
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
        navigate(`/claims/${res.data.id}`);
      } else {
        await client.put(`/claims/${id}`, payload);
        await loadClaim();
      }
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

  const fieldClass = "w-full rounded-md border border-slate-300 px-3 py-2 text-sm";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between rounded-xl bg-white p-4 shadow-sm">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
          {mode === "edit" ? <p className="text-sm text-slate-500">Status and remarks are fully audited.</p> : null}
        </div>
        <Link to="/claims" className="rounded-md border border-slate-300 px-3 py-2 text-sm">
          Back to Register
        </Link>
      </div>

      <form className="grid gap-4 rounded-xl bg-white p-4 shadow-sm md:grid-cols-2" onSubmit={saveClaim}>
        <label>
          <span className="mb-1 block text-sm text-slate-700">Insurer</span>
          <input
            className={fieldClass}
            value={claim.insurer}
            onChange={(e) => setClaim((prev) => ({ ...prev, insurer: e.target.value }))}
            required
            disabled={!canEdit}
          />
        </label>
        <label>
          <span className="mb-1 block text-sm text-slate-700">Claim Type</span>
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
          <span className="mb-1 block text-sm text-slate-700">Cover Type</span>
          <input
            className={fieldClass}
            value={claim.coverType}
            onChange={(e) => setClaim((prev) => ({ ...prev, coverType: e.target.value }))}
            required
            disabled={!canEdit}
          />
        </label>
        <label>
          <span className="mb-1 block text-sm text-slate-700">Insured Name</span>
          <input
            className={fieldClass}
            value={claim.insuredName}
            onChange={(e) => setClaim((prev) => ({ ...prev, insuredName: e.target.value }))}
            required
            disabled={!canEdit}
          />
        </label>
        <label>
          <span className="mb-1 block text-sm text-slate-700">Registration Number / Name</span>
          <input
            className={fieldClass}
            value={claim.registrationNumber}
            onChange={(e) => setClaim((prev) => ({ ...prev, registrationNumber: e.target.value }))}
            required
            disabled={!canEdit}
          />
        </label>
        <label>
          <span className="mb-1 block text-sm text-slate-700">Status</span>
          <select
            className={fieldClass}
            value={claim.claimStatus}
            onChange={(e) => setClaim((prev) => ({ ...prev, claimStatus: e.target.value }))}
            disabled={!canEdit}
          >
            {CLAIM_STATUSES.map((status) => (
              <option value={status} key={status}>
                {status}
              </option>
            ))}
          </select>
        </label>

        {claim.claimStatus === "Other" ? (
          <label className="md:col-span-2">
            <span className="mb-1 block text-sm text-slate-700">Other Status Text</span>
            <input
              className={fieldClass}
              value={claim.claimStatusOther}
              onChange={(e) => setClaim((prev) => ({ ...prev, claimStatusOther: e.target.value }))}
              disabled={!canEdit}
            />
          </label>
        ) : null}

        {[
          ["accidentDate", "Date of Accident/Loss"],
          ["reportedToBrokerDate", "Date Reported to Broker (ADT)"],
          ["reportedToInsurerDate", "Date Reported to Insurer"],
          ["assessedDate", "Date Assessed"],
          ["dateRaIssued", "Date RA Issued"],
          ["dateVehicleReleased", "Date Vehicle Released"],
        ].map(([key, label]) => (
          <label key={key}>
            <span className="mb-1 block text-sm text-slate-700">{label}</span>
            <input
              type="date"
              className={fieldClass}
              value={claim[key]}
              onChange={(e) => setClaim((prev) => ({ ...prev, [key]: e.target.value }))}
              disabled={!canEdit}
            />
          </label>
        ))}

        <label>
          <span className="mb-1 block text-sm text-slate-700">Vehicle Value (KES)</span>
          <input
            type="number"
            className={fieldClass}
            value={claim.vehicleValue}
            onChange={(e) => setClaim((prev) => ({ ...prev, vehicleValue: e.target.value }))}
            disabled={!canEdit}
          />
        </label>
        <label>
          <span className="mb-1 block text-sm text-slate-700">Repair Estimate (KES)</span>
          <input
            type="number"
            className={fieldClass}
            value={claim.repairEstimate}
            onChange={(e) => setClaim((prev) => ({ ...prev, repairEstimate: e.target.value }))}
            disabled={!canEdit}
          />
        </label>
        <label className="md:col-span-2">
          <span className="mb-1 block text-sm text-slate-700">Garage / Repairer</span>
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
            className="md:col-span-2 rounded-md bg-blue-600 px-4 py-2 font-medium text-white disabled:opacity-60"
          >
            {saving ? "Saving..." : mode === "create" ? "Create Claim" : "Save Changes"}
          </button>
        ) : null}
      </form>

      {mode === "edit" ? (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-xl bg-white p-4 shadow-sm">
            <h3 className="mb-2 text-base font-semibold text-slate-900">Activity Remarks (Append-Only)</h3>
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
                  className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white"
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

          <div className="rounded-xl bg-white p-4 shadow-sm">
            <h3 className="mb-2 text-base font-semibold text-slate-900">Status Transition History</h3>
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
        <div className="rounded-xl bg-white p-4 text-sm text-slate-600 shadow-sm">
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
