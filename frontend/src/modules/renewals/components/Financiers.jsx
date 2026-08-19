import { useEffect, useState } from "react";
import { useAuth } from "../../../context/AuthContext";
import { createFinancier, deleteFinancier, fetchFinanciers, updateFinancier } from "../api/renewalsApi";
import { canEditRenewals } from "../constants";
import { AlertBanner, Button, Card, EmptyState, FormField, LoadingState, Modal, PageHeader } from "./ui";

const emptyForm = { name: "", phone: "", email: "", notes: "" };

export function Financiers() {
  const { user } = useAuth();
  const canEdit = canEditRenewals(user?.role);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState("");

  function load() {
    return fetchFinanciers().then(setRows);
  }

  useEffect(() => {
    fetchFinanciers()
      .then(setRows)
      .catch((err) => setError(err.response?.data?.message || "Failed to load financiers"))
      .finally(() => setLoading(false));
  }, []);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setOpen(true);
  }

  function openEdit(row) {
    setEditing(row);
    setForm({ name: row.name, phone: row.phone, email: row.email, notes: row.notes });
    setOpen(true);
  }

  async function handleSave() {
    try {
      if (editing) await updateFinancier(editing.id, form);
      else await createFinancier(form);
      setOpen(false);
      await load();
    } catch (err) {
      window.alert(err.response?.data?.message || "Save failed");
    }
  }

  async function handleDelete(row) {
    if (!window.confirm(`Delete financier ${row.name}?`)) return;
    await deleteFinancier(row.id);
    await load();
  }

  if (loading) return <LoadingState label="Loading financiers…" />;

  return (
    <>
      <PageHeader
        title="Financiers"
        subtitle="Banks and dealers with a logbook interest are notified at T-60 / T-30 / T-15 when Financial Interest is populated. Add their SMS and email contacts here."
        actions={
          canEdit ? (
            <Button tone="accent" onClick={openCreate}>
              Add financier
            </Button>
          ) : null
        }
      />
      {error ? <AlertBanner tone="warning">{error}</AlertBanner> : null}
      {rows.length === 0 ? (
        <EmptyState title="No financiers yet">
          Example from the Excel sheet: ABSON. Add a phone (normalized to +254) and/or email so they can be notified.
        </EmptyState>
      ) : (
        <Card padding={false}>
          <div className="adt-table-wrap">
            <table className="adt-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Phone</th>
                  <th>Normalized</th>
                  <th>Email</th>
                  <th>Notes</th>
                  {canEdit ? <th></th> : null}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>{row.name}</td>
                    <td>{row.phone || "—"}</td>
                    <td>{row.phoneE164 || "—"}</td>
                    <td>{row.email || "—"}</td>
                    <td>{row.notes || "—"}</td>
                    {canEdit ? (
                      <td>
                        <Button tone="ghost" size="sm" onClick={() => openEdit(row)}>
                          Edit
                        </Button>{" "}
                        <Button tone="danger" size="sm" onClick={() => handleDelete(row)}>
                          Delete
                        </Button>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Modal
        title={editing ? "Edit financier" : "Add financier"}
        open={open}
        onClose={() => setOpen(false)}
        footer={
          <>
            <Button tone="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button tone="primary" onClick={handleSave}>
              Save
            </Button>
          </>
        }
      >
        <FormField label="Name" required>
          <input className="adt-input" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
        </FormField>
        <FormField label="Phone" hint="Without country code is fine — stored as +254">
          <input className="adt-input" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
        </FormField>
        <FormField label="Email">
          <input className="adt-input" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
        </FormField>
        <FormField label="Notes">
          <textarea className="adt-input" rows={2} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
        </FormField>
      </Modal>
    </>
  );
}
