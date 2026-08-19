import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../../context/AuthContext";
import { ackNotification, fetchNotifications, retryNotification } from "../api/renewalsApi";
import { renewalsPath } from "../basePath";
import { canEditRenewals } from "../constants";
import { LogStatusBadge } from "./StatusBadge";
import { AlertBanner, Button, Card, EmptyState, LoadingState, PageHeader } from "./ui";

export function Failures({ onChanged }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const canEdit = canEditRenewals(user?.role);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState("");

  function reload() {
    return fetchNotifications({ unacked: true }).then(setRows);
  }

  useEffect(() => {
    fetchNotifications({ unacked: true })
      .then(setRows)
      .catch((err) => setError(err.response?.data?.message || "Failed to load failures"))
      .finally(() => setLoading(false));
  }, []);

  async function handleRetry(id) {
    setBusyId(id);
    try {
      await retryNotification(id);
      await reload();
      onChanged?.();
    } catch (err) {
      window.alert(err.response?.data?.message || "Retry failed");
    } finally {
      setBusyId(null);
    }
  }

  async function handleAck(id) {
    setBusyId(id);
    try {
      await ackNotification(id);
      await reload();
      onChanged?.();
    } catch (err) {
      window.alert(err.response?.data?.message || "Could not acknowledge");
    } finally {
      setBusyId(null);
    }
  }

  if (loading) return <LoadingState label="Loading delivery failures…" />;

  return (
    <>
      <PageHeader
        title="Delivery failures"
        subtitle="Failed SMS/email sends that have not been acknowledged. Retry after fixing the contact, or acknowledge once handled offline."
      />
      {error ? <AlertBanner tone="warning">{error}</AlertBanner> : null}
      {rows.length === 0 ? (
        <EmptyState title="No open failures">Every send either succeeded or has been acknowledged.</EmptyState>
      ) : (
        <Card padding={false}>
          <div className="adt-table-wrap">
            <table className="adt-table">
              <thead>
                <tr>
                  <th>Insured</th>
                  <th>Milestone</th>
                  <th>Channel</th>
                  <th>Recipient</th>
                  <th>Error</th>
                  <th>When</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <button type="button" className="adt-link-btn" onClick={() => navigate(renewalsPath(`policy/${row.policyId}`))}>
                        {row.insuredName}
                      </button>
                    </td>
                    <td>T-{row.milestone}</td>
                    <td className="rn-channel">{row.channel}</td>
                    <td>
                      {row.recipientType}
                      <div className="rn-muted">{row.recipientAddress || row.recipientName || "no address"}</div>
                    </td>
                    <td>{row.errorMessage || "—"}</td>
                    <td>{row.createdAt ? new Date(row.createdAt).toLocaleString() : "—"}</td>
                    <td>
                      {canEdit ? (
                        <div style={{ display: "flex", gap: 6 }}>
                          <Button tone="primary" size="sm" disabled={busyId === row.id} onClick={() => handleRetry(row.id)}>
                            Retry
                          </Button>
                          <Button tone="ghost" size="sm" disabled={busyId === row.id} onClick={() => handleAck(row.id)}>
                            Ack
                          </Button>
                        </div>
                      ) : (
                        <LogStatusBadge status={row.status} />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  );
}
