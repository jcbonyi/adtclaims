import { useState } from "react";
import { createValuer, updateValuer } from "../api/valuationsApi";
import { useValuations } from "../context/useValuations";
import {
  AlertBanner,
  Button,
  Card,
  EmptyState,
  FormField,
  FormSection,
  PageHeader,
} from "./ui";

export function ValuerManagement() {
  const { state, reloadFromServer } = useValuations();
  const [form, setForm] = useState({ name: "", email: "", company: "" });
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  function resetForm() {
    setForm({ name: "", email: "", company: "" });
    setEditingId(null);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      if (editingId) {
        await updateValuer(editingId, form);
      } else {
        await createValuer(form);
      }
      resetForm();
      await reloadFromServer();
    } catch (err) {
      setError(err.response?.data?.message || "Failed to save valuer");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Valuer Management"
        subtitle="Manage assigned valuers for notifications and reporting."
      />

      {error ? <AlertBanner tone="danger">{error}</AlertBanner> : null}

      <Card>
        <FormSection
          title={editingId ? "Edit valuer" : "Add valuer"}
          description="Valuers appear in assignment dropdowns across the register."
        >
          <form onSubmit={handleSubmit}>
            <div className="adt-form-grid">
              <FormField label="Name" required>
                <input
                  className="adt-input"
                  required
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                />
              </FormField>
              <FormField label="Email" hint="Optional — used for notifications when configured.">
                <input
                  type="email"
                  className="adt-input"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                />
              </FormField>
              <FormField label="Company">
                <input
                  className="adt-input"
                  value={form.company}
                  onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))}
                />
              </FormField>
            </div>
            <div className="val-form-actions">
              <Button tone="primary" type="submit" disabled={saving}>
                {saving ? "Saving…" : editingId ? "Update Valuer" : "Add Valuer"}
              </Button>
              {editingId ? (
                <Button tone="ghost" type="button" onClick={resetForm}>
                  Cancel
                </Button>
              ) : null}
            </div>
          </form>
        </FormSection>
      </Card>

      {state.valuers.length === 0 ? (
        <EmptyState title="No valuers">No valuers configured yet. Add one above.</EmptyState>
      ) : (
        <Card padding={false} className="mt-4">
          <div className="adt-table-wrap">
            <table className="adt-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Company</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {state.valuers.map((v) => (
                  <tr key={v.id} className={editingId === v.id ? "val-row--editing" : ""}>
                    <td className="val-insured-cell">{v.name}</td>
                    <td>{v.email || "—"}</td>
                    <td>{v.company || "—"}</td>
                    <td>
                      <Button
                        tone="secondary"
                        size="sm"
                        onClick={() => {
                          setEditingId(v.id);
                          setForm({ name: v.name, email: v.email || "", company: v.company || "" });
                        }}
                      >
                        Edit
                      </Button>
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
