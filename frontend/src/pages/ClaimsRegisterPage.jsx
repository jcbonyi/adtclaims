import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import client from "../api/client";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import EmptyState from "../components/EmptyState";
import Modal from "../components/Modal";
import PageHeader from "../components/PageHeader";
import { AGING_BUCKETS } from "../utils/constants";
import StatusSelectOptions from "../components/StatusSelectOptions";
import { agingClass, formatDate } from "../utils/format";

const defaultFilters = {
  insurer: "",
  claimType: "",
  coverType: "",
  status: "",
  agingBucket: "",
  fromDate: "",
  toDate: "",
  search: "",
  garage: "",
  lifecycle: "",
};

export default function ClaimsRegisterPage() {
  const { user } = useAuth();
  const canEdit = user?.role !== "Read-Only";
  const [filters, setFilters] = useState(defaultFilters);
  const [appliedFilters, setAppliedFilters] = useState(defaultFilters);
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [deletingClaimId, setDeletingClaimId] = useState(null);
  const [importResult, setImportResult] = useState(null);
  const [remarkTarget, setRemarkTarget] = useState(null);
  const [remarkText, setRemarkText] = useState("");
  const [deleteTarget, setDeleteTarget] = useState(null);
  const { notify } = useToast();

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / 20)), [total]);
  const hasActiveFilters = useMemo(
    () => Object.values(appliedFilters).some((v) => String(v || "").trim() !== ""),
    [appliedFilters]
  );

  async function loadClaims(nextPage = page, nextFilters = appliedFilters) {
    setLoading(true);
    try {
      const res = await client.get("/claims", { params: { ...nextFilters, page: nextPage, limit: 20 } });
      setRows(res.data.claims);
      setTotal(res.data.total);
      setPage(nextPage);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let ignore = false;
    async function init() {
      setLoading(true);
      try {
        const res = await client.get("/claims", { params: { ...defaultFilters, page: 1, limit: 20 } });
        if (ignore) return;
        setAppliedFilters(defaultFilters);
        setRows(res.data.claims);
        setTotal(res.data.total);
        setPage(1);
      } finally {
        if (!ignore) setLoading(false);
      }
    }
    init();
    return () => {
      ignore = true;
    };
  }, []);

  async function updateStatus(claimId, status) {
    if (!canEdit) return;
    await client.patch(`/claims/${claimId}/status`, { status });
    await loadClaims(page);
  }

  async function submitRemark() {
    if (!canEdit || !remarkTarget || !remarkText.trim()) return;
    try {
      await client.post(`/claims/${remarkTarget}/remarks`, { remark: remarkText.trim() });
      setRemarkTarget(null);
      setRemarkText("");
      notify("Remark added.", "success");
      await loadClaims(page);
    } catch {
      notify("Could not add remark.", "error");
    }
  }

  async function confirmDelete() {
    if (!canEdit || !deleteTarget) return;
    setDeletingClaimId(deleteTarget);
    try {
      await client.delete(`/claims/${deleteTarget}`);
      setDeleteTarget(null);
      notify("Claim deleted.", "success");
      const nextPage = rows.length === 1 && page > 1 ? page - 1 : page;
      await loadClaims(nextPage);
    } catch {
      notify("Could not delete claim.", "error");
    } finally {
      setDeletingClaimId(null);
    }
  }

  async function handleImportFile(file) {
    if (!file || !canEdit) return;
    setImporting(true);
    setImportResult(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await client.post("/claims/import-excel", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setImportResult(res.data);
      await loadClaims(1);
    } finally {
      setImporting(false);
    }
  }

  async function handleExportExcel() {
    setExporting(true);
    try {
      const res = await client.get("/claims-export.xlsx", {
        responseType: "blob",
        params: appliedFilters,
      });
      const contentType = res.headers["content-type"] || "";
      if (res.status !== 200 || !contentType.includes("spreadsheetml")) {
        throw new Error("Export failed — server did not return an Excel file.");
      }
      const blob = new Blob([res.data], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "ADT-claims-register.xlsx";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Claims Excel export failed:", err);
      window.alert("Excel export failed. Restart the API server if this continues, then try again.");
    } finally {
      setExporting(false);
    }
  }

  function updateFilter(key, value) {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }

  async function onSearchSubmit(e) {
    e.preventDefault();
    setAppliedFilters(filters);
    await loadClaims(1, filters);
  }

  return (
    <section className="space-y-4">
      <PageHeader
        title="Claims Register"
        subtitle={`${total} claim${total === 1 ? "" : "s"}${hasActiveFilters ? " · filters applied" : ""}`}
        actions={
          <>
            {canEdit ? (
              <label className="adt-btn adt-btn-secondary cursor-pointer">
                {importing ? "Importing…" : "Import Excel"}
                <input
                  type="file"
                  accept=".xls,.xlsx"
                  className="hidden"
                  disabled={importing}
                  onChange={(e) => handleImportFile(e.target.files?.[0])}
                />
              </label>
            ) : null}
            <button
              type="button"
              onClick={handleExportExcel}
              disabled={exporting}
              className="adt-btn adt-btn-primary"
            >
              {exporting ? "Exporting…" : "Export Excel"}
            </button>
            {canEdit ? (
              <Link to="/claims/new" className="adt-btn adt-btn-accent">
                + Add claim
              </Link>
            ) : null}
          </>
        }
      />

      <div className="adt-card p-4">
        {importResult ? (
          <div className="adt-alert adt-alert-info mb-3">
            <p>
              Imported {importResult.inserted} rows. Flagged {importResult.warnings.length} rows for manual review.
            </p>
            {importResult.warnings.length > 0 ? (
              <p className="mt-1 text-xs">
                Examples:{" "}
                {importResult.warnings
                  .slice(0, 3)
                  .map((w) => `row ${w.row}: ${w.reason}`)
                  .join(" | ")}
              </p>
            ) : null}
          </div>
        ) : null}

        <details className="adt-filter-panel" open>
          <summary className="mb-3">Search & filters</summary>
        <form onSubmit={onSearchSubmit} className="grid gap-2 md:grid-cols-4">
          <input
            className="adt-input md:col-span-2"
            placeholder="Search name / reg / insurer / garage / remarks"
            value={filters.search}
            onChange={(e) => updateFilter("search", e.target.value)}
          />
          <input
            className="adt-input"
            placeholder="Insurer"
            value={filters.insurer}
            onChange={(e) => updateFilter("insurer", e.target.value)}
          />
          <input
            className="adt-input"
            placeholder="Garage / repairer"
            value={filters.garage}
            onChange={(e) => updateFilter("garage", e.target.value)}
          />
          <select
            className="adt-select"
            value={filters.lifecycle}
            onChange={(e) => updateFilter("lifecycle", e.target.value)}
          >
            <option value="">All claims (open + closed)</option>
            <option value="open">Open claims only</option>
            <option value="closed">Closed claims only</option>
          </select>
          <select
            className="adt-select"
            value={filters.claimType}
            onChange={(e) => updateFilter("claimType", e.target.value)}
          >
            <option value="">Claim Type</option>
            <option value="MOTOR">MOTOR</option>
            <option value="NON-MOTOR">NON-MOTOR</option>
          </select>
          <input
            className="adt-input"
            placeholder="Cover Type"
            value={filters.coverType}
            onChange={(e) => updateFilter("coverType", e.target.value)}
          />
          <select
            className="adt-select"
            value={filters.status}
            onChange={(e) => updateFilter("status", e.target.value)}
          >
            <StatusSelectOptions placeholder="Status" />
          </select>
          <select
            className="adt-select"
            value={filters.agingBucket}
            onChange={(e) => updateFilter("agingBucket", e.target.value)}
          >
            <option value="">Aging Bucket</option>
            {AGING_BUCKETS.map((bucket) => (
              <option value={bucket} key={bucket}>
                {bucket} days
              </option>
            ))}
          </select>
          <input
            type="date"
            className="adt-input"
            value={filters.fromDate}
            onChange={(e) => updateFilter("fromDate", e.target.value)}
          />
          <input
            type="date"
            className="adt-input"
            value={filters.toDate}
            onChange={(e) => updateFilter("toDate", e.target.value)}
          />
          <div className="md:col-span-4 flex gap-2">
            <button className="adt-btn adt-btn-primary" type="submit">
              Apply filters
            </button>
            <button
              className="adt-btn adt-btn-secondary"
              type="button"
              onClick={async () => {
                setFilters(defaultFilters);
                setAppliedFilters(defaultFilters);
                await loadClaims(1, defaultFilters);
              }}
            >
              Reset
            </button>
          </div>
        </form>
        </details>
      </div>

      <div className="adt-table-wrap">
        <table className="adt-table">
          <thead>
            <tr>
              <th className="px-3 py-2">Insurer</th>
              <th className="px-3 py-2">Insured</th>
              <th className="px-3 py-2">Reg/Name</th>
              <th className="px-3 py-2">Reported</th>
              <th className="px-3 py-2">Days</th>
              <th className="px-3 py-2">Aging</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Last Remark</th>
              <th className="px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((claim) => (
              <tr key={claim.id} className={`border-t ${agingClass(claim.agingBucket)}`}>
                <td className="px-3 py-2">{claim.insurer}</td>
                <td className="px-3 py-2">{claim.insuredName}</td>
                <td className="px-3 py-2">{claim.registrationNumber}</td>
                <td className="px-3 py-2">{formatDate(claim.reportedToBrokerDate)}</td>
                <td className="px-3 py-2">{claim.daysOpen}</td>
                <td className="px-3 py-2">{claim.agingBucket}</td>
                <td className="px-3 py-2">
                  {canEdit ? (
                    <select
                      className="max-w-[14rem] rounded border border-slate-300 px-2 py-1 text-xs"
                      value={claim.claimStatus}
                      onChange={(e) => updateStatus(claim.id, e.target.value)}
                    >
                      <StatusSelectOptions />
                    </select>
                  ) : (
                    claim.claimStatus
                  )}
                </td>
                <td className="px-3 py-2">{claim.lastRemark || "-"}</td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-1">
                    <Link className="adt-btn adt-btn-secondary !px-2 !py-1 text-xs" to={`/claims/${claim.id}`}>
                      View
                    </Link>
                    {canEdit ? (
                      <button
                        className="adt-btn adt-btn-ghost !px-2 !py-1 text-xs"
                        onClick={() => {
                          setRemarkTarget(claim.id);
                          setRemarkText("");
                        }}
                        type="button"
                      >
                        Remark
                      </button>
                    ) : null}
                    {canEdit ? (
                      <button
                        className="adt-btn adt-btn-danger !px-2 !py-1 text-xs"
                        onClick={() => setDeleteTarget(claim.id)}
                        type="button"
                        disabled={deletingClaimId === claim.id}
                      >
                        {deletingClaimId === claim.id ? "…" : "Delete"}
                      </button>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {loading ? (
          <div className="space-y-2 p-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="adt-skeleton h-10 w-full" />
            ))}
          </div>
        ) : null}
        {!loading && rows.length === 0 ? (
          <EmptyState
            title="No claims match your filters"
            message="Try adjusting filters or add a new claim to get started."
            action={
              canEdit ? (
                <Link to="/claims/new" className="adt-btn adt-btn-accent">
                  Add claim
                </Link>
              ) : null
            }
          />
        ) : null}
      </div>

      <div className="adt-card flex flex-wrap items-center justify-between gap-3 p-3">
        <p className="text-sm text-slate-600">
          Page {page} of {totalPages} ({total} claims)
        </p>
        <div className="flex gap-2">
          <button
            className="adt-btn adt-btn-secondary"
            onClick={() => loadClaims(Math.max(1, page - 1))}
            disabled={page <= 1 || loading}
          >
            Previous
          </button>
          <button
            className="adt-btn adt-btn-secondary"
            onClick={() => loadClaims(Math.min(totalPages, page + 1))}
            disabled={page >= totalPages || loading}
          >
            Next
          </button>
        </div>
      </div>

      <Modal
        open={remarkTarget != null}
        onClose={() => setRemarkTarget(null)}
        title="Add follow-up remark"
        footer={
          <>
            <button type="button" className="adt-btn adt-btn-secondary" onClick={() => setRemarkTarget(null)}>
              Cancel
            </button>
            <button
              type="button"
              className="adt-btn adt-btn-accent"
              onClick={submitRemark}
              disabled={!remarkText.trim()}
            >
              Save remark
            </button>
          </>
        }
      >
        <label className="adt-label" htmlFor="remark-body">
          Remark
        </label>
        <textarea
          id="remark-body"
          className="adt-input min-h-[100px] resize-y"
          value={remarkText}
          onChange={(e) => setRemarkText(e.target.value)}
          placeholder="Enter follow-up details…"
        />
      </Modal>

      <Modal
        open={deleteTarget != null}
        onClose={() => setDeleteTarget(null)}
        title="Delete claim?"
        footer={
          <>
            <button type="button" className="adt-btn adt-btn-secondary" onClick={() => setDeleteTarget(null)}>
              Cancel
            </button>
            <button
              type="button"
              className="adt-btn adt-btn-danger"
              onClick={confirmDelete}
              disabled={deletingClaimId != null}
            >
              {deletingClaimId ? "Deleting…" : "Delete permanently"}
            </button>
          </>
        }
      >
        <p className="m-0 text-sm text-slate-600">
          This cannot be undone. All remarks and status history for this claim will be removed.
        </p>
      </Modal>
    </section>
  );
}
