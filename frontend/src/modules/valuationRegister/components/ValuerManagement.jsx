import { useState } from "react";
import { createValuer, updateValuer } from "../api/valuationsApi";
import { useValuations } from "../context/useValuations";
import { Button, EmptyState, PageHeader } from "./ui";

export function ValuerManagement() {
  const { state, reloadFromServer } = useValuations();
  const [form, setForm] = useState({ name: "", email: "", company: "" });
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    try {
      if (editingId) {
        await updateValuer(editingId, form);
      } else {
        await createValuer(form);
      }
      setForm({ name: "", email: "", company: "" });
      setEditingId(null);
      await reloadFromServer();
    } catch (err) {
      setError(err.response?.data?.message || "Failed to save valuer");
    }
  }

  return (
    <>
      <PageHeader title="Valuer Management" subtitle="Manage assigned valuers for notifications and reporting." />

      {error ? <p className="adt-error">{error}</p> : null}

      <form onSubmit={handleSubmit} className="adt-form-grid" style={{ marginBottom: 24 }}>
        <label>
          Name
          <input className="adt-input" required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
        </label>
        <label>
          Email
          <input type="email" className="adt-input" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
        </label>
        <label>
          Company
          <input className="adt-input" value={form.company} onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))} />
        </label>
        <div>
          <Button tone="primary" type="submit">{editingId ? "Update" : "Add"} Valuer</Button>
          {editingId ? (
            <Button tone="ghost" onClick={() => { setEditingId(null); setForm({ name: "", email: "", company: "" }); }}>Cancel</Button>
          ) : null}
        </div>
      </form>

      {state.valuers.length === 0 ? (
        <EmptyState>No valuers configured.</EmptyState>
      ) : (
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
              <tr key={v.id}>
                <td>{v.name}</td>
                <td>{v.email}</td>
                <td>{v.company}</td>
                <td>
                  <Button
                    tone="secondary"
                    onClick={() => {
                      setEditingId(v.id);
                      setForm({ name: v.name, email: v.email, company: v.company });
                    }}
                  >
                    Edit
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
