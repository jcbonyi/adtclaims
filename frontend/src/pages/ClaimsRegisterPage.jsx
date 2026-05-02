import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import client from "../api/client";
import { useAuth } from "../context/AuthContext";
import { AGING_BUCKETS, CLAIM_STATUSES } from "../utils/constants";
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
  const [importResult, setImportResult] = useState(null);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / 20)), [total]);

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

  async function addRemark(claimId) {
    if (!canEdit) return;
    const remark = window.prompt("Add follow-up remark:");
    if (!remark?.trim()) return;
    await client.post(`/claims/${claimId}/remarks`, { remark: remark.trim() });
    await loadClaims(page);
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
      <div className="rounded-xl bg-white p-4 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-slate-900">Claims Register</h2>
          <div className="flex flex-wrap gap-2">
            {canEdit ? (
              <label className="cursor-pointer rounded-md border border-slate-300 px-3 py-2 text-sm">
                {importing ? "Importing..." : "Import Excel"}
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
              className="rounded-md bg-[#0078C8] px-3 py-2 text-sm font-medium text-white hover:bg-[#006BA3] disabled:opacity-60"
            >
              {exporting ? "Exporting..." : "Export Excel"}
            </button>
          </div>
        </div>
        {importResult ? (
          <div className="mb-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
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

        <form onSubmit={onSearchSubmit} className="grid gap-2 md:grid-cols-4">
          <input
            className="rounded-md border border-slate-300 px-2 py-2 text-sm"
            placeholder="Search name / reg / insurer / garage / remarks"
            value={filters.search}
            onChange={(e) => updateFilter("search", e.target.value)}
          />
          <input
            className="rounded-md border border-slate-300 px-2 py-2 text-sm"
            placeholder="Insurer"
            value={filters.insurer}
            onChange={(e) => updateFilter("insurer", e.target.value)}
          />
          <input
            className="rounded-md border border-slate-300 px-2 py-2 text-sm"
            placeholder="Garage / repairer"
            value={filters.garage}
            onChange={(e) => updateFilter("garage", e.target.value)}
          />
          <select
            className="rounded-md border border-slate-300 px-2 py-2 text-sm"
            value={filters.lifecycle}
            onChange={(e) => updateFilter("lifecycle", e.target.value)}
          >
            <option value="">All claims (open + closed)</option>
            <option value="open">Open claims only</option>
            <option value="closed">Closed claims only</option>
          </select>
          <select
            className="rounded-md border border-slate-300 px-2 py-2 text-sm"
            value={filters.claimType}
            onChange={(e) => updateFilter("claimType", e.target.value)}
          >
            <option value="">Claim Type</option>
            <option value="MOTOR">MOTOR</option>
            <option value="NON-MOTOR">NON-MOTOR</option>
          </select>
          <input
            className="rounded-md border border-slate-300 px-2 py-2 text-sm"
            placeholder="Cover Type"
            value={filters.coverType}
            onChange={(e) => updateFilter("coverType", e.target.value)}
          />
          <select
            className="rounded-md border border-slate-300 px-2 py-2 text-sm"
            value={filters.status}
            onChange={(e) => updateFilter("status", e.target.value)}
          >
            <option value="">Status</option>
            {CLAIM_STATUSES.map((status) => (
              <option value={status} key={status}>
                {status}
              </option>
            ))}
          </select>
          <select
            className="rounded-md border border-slate-300 px-2 py-2 text-sm"
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
            className="rounded-md border border-slate-300 px-2 py-2 text-sm"
            value={filters.fromDate}
            onChange={(e) => updateFilter("fromDate", e.target.value)}
          />
          <input
            type="date"
            className="rounded-md border border-slate-300 px-2 py-2 text-sm"
            value={filters.toDate}
            onChange={(e) => updateFilter("toDate", e.target.value)}
          />
          <div className="md:col-span-4 flex gap-2">
            <button className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white" type="submit">
              Apply Filters
            </button>
            <button
              className="rounded-md border border-slate-300 px-4 py-2 text-sm"
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
      </div>

      <div className="overflow-x-auto rounded-xl bg-white shadow-sm">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-600">
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
                      className="rounded border border-slate-300 px-2 py-1"
                      value={claim.claimStatus}
                      onChange={(e) => updateStatus(claim.id, e.target.value)}
                    >
                      {CLAIM_STATUSES.map((status) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
                    </select>
                  ) : (
                    claim.claimStatus
                  )}
                </td>
                <td className="px-3 py-2">{claim.lastRemark || "-"}</td>
                <td className="px-3 py-2">
                  <div className="flex gap-2">
                    <Link className="rounded border border-slate-300 px-2 py-1" to={`/claims/${claim.id}`}>
                      View
                    </Link>
                    {canEdit ? (
                      <button
                        className="rounded border border-blue-300 px-2 py-1 text-blue-700"
                        onClick={() => addRemark(claim.id)}
                        type="button"
                      >
                        Remark
                      </button>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {loading ? <p className="p-3 text-sm text-slate-500">Loading...</p> : null}
        {!loading && rows.length === 0 ? <p className="p-3 text-sm text-slate-500">No claims found.</p> : null}
      </div>

      <div className="flex items-center justify-between rounded-xl bg-white p-3 shadow-sm">
        <p className="text-sm text-slate-600">
          Page {page} of {totalPages} ({total} claims)
        </p>
        <div className="flex gap-2">
          <button
            className="rounded border border-slate-300 px-3 py-1 text-sm disabled:opacity-50"
            onClick={() => loadClaims(Math.max(1, page - 1))}
            disabled={page <= 1}
          >
            Previous
          </button>
          <button
            className="rounded border border-slate-300 px-3 py-1 text-sm disabled:opacity-50"
            onClick={() => loadClaims(Math.min(totalPages, page + 1))}
            disabled={page >= totalPages}
          >
            Next
          </button>
        </div>
      </div>
    </section>
  );
}
