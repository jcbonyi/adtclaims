import { useEffect, useState } from "react";
import { fetchNotifications } from "../api/renewalsApi";
import { LogStatusBadge } from "./StatusBadge";
import { Button, Card, EmptyState, FilterBar, LoadingState, PageHeader } from "./ui";

export function NotificationLog() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ status: "", channel: "" });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetchNotifications({
      status: filters.status || undefined,
      channel: filters.channel || undefined,
    })
      .then((data) => {
        if (!cancelled) setRows(data);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [filters.status, filters.channel, tick]);

  return (
    <>
      <PageHeader
        title="Send log"
        subtitle="Every SMS and email attempt is recorded with delivery status."
      />
      <FilterBar
        showClear={Boolean(filters.status || filters.channel)}
        onClear={() => setFilters({ status: "", channel: "" })}
      >
        <select
          className="adt-input val-filter-input"
          value={filters.status}
          onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
        >
          <option value="">All statuses</option>
          <option value="sent">Sent</option>
          <option value="failed">Failed</option>
          <option value="skipped">Skipped</option>
        </select>
        <select
          className="adt-input val-filter-input"
          value={filters.channel}
          onChange={(e) => setFilters((f) => ({ ...f, channel: e.target.value }))}
        >
          <option value="">All channels</option>
          <option value="sms">SMS</option>
          <option value="email">Email</option>
        </select>
        <Button tone="ghost" size="sm" onClick={() => setTick((n) => n + 1)}>
          Refresh
        </Button>
      </FilterBar>
      {loading ? (
        <LoadingState label="Loading send log…" />
      ) : rows.length === 0 ? (
        <EmptyState title="No attempts yet">The daily reminder job writes a row here for every send.</EmptyState>
      ) : (
        <Card padding={false}>
          <div className="adt-table-wrap">
            <table className="adt-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Insured</th>
                  <th>T-</th>
                  <th>Channel</th>
                  <th>Recipient</th>
                  <th>Status</th>
                  <th>Detail</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>{row.createdAt ? new Date(row.createdAt).toLocaleString() : "—"}</td>
                    <td>{row.insuredName}</td>
                    <td>{row.milestone}</td>
                    <td className="rn-channel">{row.channel}</td>
                    <td>
                      {row.recipientType}: {row.recipientAddress || "—"}
                    </td>
                    <td>
                      <LogStatusBadge status={row.status} />
                    </td>
                    <td>{row.errorMessage || row.providerRef || "—"}</td>
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
