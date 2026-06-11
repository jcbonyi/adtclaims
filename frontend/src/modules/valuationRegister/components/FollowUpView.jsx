import { useMemo, useState } from "react";
import { useAuth } from "../../../context/AuthContext";
import { FOLLOW_UP_METHODS, FOLLOW_UP_STATUSES, canEditValuations } from "../constants";
import { useValuations } from "../context/useValuations";
import { StatusBadge } from "./StatusBadge";
import { Button, EmptyState, LinkButton, PageHeader } from "./ui";

export function FollowUpView({ onOpenValuation }) {
  const { user } = useAuth();
  const { state, dispatch } = useValuations();
  const [logFor, setLogFor] = useState(null);
  const [form, setForm] = useState({
    followUpDate: new Date().toISOString().slice(0, 10),
    method: "Call",
    responseReceived: false,
    nextActionDate: "",
    remarks: "",
  });

  const rows = useMemo(() => {
    return state.valuations
      .filter((v) => FOLLOW_UP_STATUSES.has(v.status) || v.isOverdue)
      .sort((a, b) => {
        const aDate = a.valuationRequestDate || "";
        const bDate = b.valuationRequestDate || "";
        return aDate.localeCompare(bDate);
      });
  }, [state.valuations]);

  async function submitFollowUp(e) {
    e.preventDefault();
    if (!logFor) return;
    await dispatch({
      type: "LOG_FOLLOW_UP",
      payload: { id: logFor, ...form, responseReceived: !!form.responseReceived },
    });
    setLogFor(null);
    setForm({
      followUpDate: new Date().toISOString().slice(0, 10),
      method: "Call",
      responseReceived: false,
      nextActionDate: "",
      remarks: "",
    });
  }

  return (
    <>
      <PageHeader
        title="Follow-Up Queue"
        subtitle="Valuations requiring officer follow-up, sorted by urgency."
      />

      {rows.length === 0 ? (
        <EmptyState>No valuations in the follow-up queue.</EmptyState>
      ) : (
        <div className="adt-table-wrap">
          <table className="adt-table">
            <thead>
              <tr>
                <th>Insured</th>
                <th>Reg</th>
                <th>Insurer</th>
                <th>Status</th>
                <th>Request Date</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className={row.isOverdue ? "adt-row--danger" : ""}>
                  <td>
                    <LinkButton onClick={() => onOpenValuation(row.id)}>{row.insuredName}</LinkButton>
                  </td>
                  <td>{row.vehicleRegistration}</td>
                  <td>{row.insuranceCompany}</td>
                  <td><StatusBadge status={row.status} /></td>
                  <td>{row.valuationRequestDate || "—"}</td>
                  <td style={{ display: "flex", gap: 8 }}>
                    {canEditValuations(user?.role) ? (
                      <Button tone="primary" onClick={() => setLogFor(row.id)}>Log Follow-up</Button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {logFor ? (
        <div className="adt-modal-backdrop" role="dialog">
          <div className="adt-modal">
            <h3>Log Follow-up</h3>
            <form onSubmit={submitFollowUp} className="adt-form-grid">
              <label>
                Date
                <input type="date" className="adt-input" required value={form.followUpDate} onChange={(e) => setForm((f) => ({ ...f, followUpDate: e.target.value }))} />
              </label>
              <label>
                Method
                <select className="adt-input" value={form.method} onChange={(e) => setForm((f) => ({ ...f, method: e.target.value }))}>
                  {FOLLOW_UP_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </label>
              <label>
                Next action
                <input type="date" className="adt-input" value={form.nextActionDate} onChange={(e) => setForm((f) => ({ ...f, nextActionDate: e.target.value }))} />
              </label>
              <label style={{ gridColumn: "1 / -1" }}>
                <input type="checkbox" checked={form.responseReceived} onChange={(e) => setForm((f) => ({ ...f, responseReceived: e.target.checked }))} />
                {" "}Response received
              </label>
              <label style={{ gridColumn: "1 / -1" }}>
                Remarks
                <textarea className="adt-input" required rows={3} value={form.remarks} onChange={(e) => setForm((f) => ({ ...f, remarks: e.target.value }))} />
              </label>
              <div style={{ display: "flex", gap: 8 }}>
                <Button tone="primary" type="submit">Save</Button>
                <Button tone="ghost" onClick={() => setLogFor(null)}>Cancel</Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
