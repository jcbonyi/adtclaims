import { useMemo, useState } from "react";
import { useAuth } from "../../../context/AuthContext";
import { FOLLOW_UP_METHODS, FOLLOW_UP_STATUSES, REPORT_TURNAROUND_DAYS, canEditValuations } from "../constants";
import { useValuations } from "../context/useValuations";
import { formatDisplayDate } from "../utils/format";
import { StatusBadge } from "./StatusBadge";
import {
  Button,
  Card,
  EmptyState,
  FormField,
  LinkButton,
  Modal,
  PageHeader,
} from "./ui";

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
        if (a.isOverdue !== b.isOverdue) return a.isOverdue ? -1 : 1;
        const aDate = a.valuationRequestDate || "";
        const bDate = b.valuationRequestDate || "";
        return aDate.localeCompare(bDate);
      });
  }, [state.valuations]);

  const logForRow = rows.find((r) => r.id === logFor);

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
        subtitle={`${rows.length} valuation${rows.length === 1 ? "" : "s"} requiring follow-up. Overdue = report not received within ${REPORT_TURNAROUND_DAYS} days.`}
      />

      {rows.length === 0 ? (
        <EmptyState title="All caught up">
          No valuations in the follow-up queue right now.
        </EmptyState>
      ) : (
        <Card padding={false}>
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
                    <td className="val-insured-cell">
                      <LinkButton onClick={() => onOpenValuation(row.id)}>
                        {row.insuredName}
                      </LinkButton>
                      {row.isOverdue ? (
                        <span className="val-overdue-tag">Overdue</span>
                      ) : null}
                    </td>
                    <td>{row.vehicleRegistration || "—"}</td>
                    <td>{row.insuranceCompany || "—"}</td>
                    <td><StatusBadge status={row.status} /></td>
                    <td>{formatDisplayDate(row.valuationRequestDate)}</td>
                    <td>
                      <div className="val-row-actions">
                        <Button tone="ghost" size="sm" onClick={() => onOpenValuation(row.id)}>
                          Open
                        </Button>
                        {canEditValuations(user?.role) ? (
                          <Button tone="primary" size="sm" onClick={() => setLogFor(row.id)}>
                            Log Follow-up
                          </Button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Modal
        title={logForRow ? `Log Follow-up — ${logForRow.insuredName}` : "Log Follow-up"}
        open={Boolean(logFor)}
        onClose={() => setLogFor(null)}
        footer={
          <>
            <Button tone="primary" type="submit" form="follow-up-form">
              Save Follow-up
            </Button>
            <Button tone="ghost" onClick={() => setLogFor(null)}>
              Cancel
            </Button>
          </>
        }
      >
        <form id="follow-up-form" onSubmit={submitFollowUp} className="adt-form-grid">
          <FormField label="Date" required>
            <input
              type="date"
              className="adt-input"
              required
              value={form.followUpDate}
              onChange={(e) => setForm((f) => ({ ...f, followUpDate: e.target.value }))}
            />
          </FormField>
          <FormField label="Method">
            <select
              className="adt-input"
              value={form.method}
              onChange={(e) => setForm((f) => ({ ...f, method: e.target.value }))}
            >
              {FOLLOW_UP_METHODS.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </FormField>
          <FormField label="Next action date">
            <input
              type="date"
              className="adt-input"
              value={form.nextActionDate}
              onChange={(e) => setForm((f) => ({ ...f, nextActionDate: e.target.value }))}
            />
          </FormField>
          <FormField label="Response received">
            <label className="val-checkbox-label">
              <input
                type="checkbox"
                checked={form.responseReceived}
                onChange={(e) => setForm((f) => ({ ...f, responseReceived: e.target.checked }))}
              />
              Valuer or insured responded
            </label>
          </FormField>
          <FormField label="Remarks" required>
            <textarea
              className="adt-input"
              required
              rows={3}
              value={form.remarks}
              onChange={(e) => setForm((f) => ({ ...f, remarks: e.target.value }))}
            />
          </FormField>
        </form>
      </Modal>
    </>
  );
}
