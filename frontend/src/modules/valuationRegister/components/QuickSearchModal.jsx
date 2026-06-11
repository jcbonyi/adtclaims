import { useEffect, useState } from "react";
import { Button, FormField, Modal } from "./ui";

export function QuickSearchModal({ open, onClose, onSearch }) {
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  function submit() {
    onSearch(query);
    onClose();
  }

  return (
    <Modal
      title="Quick search"
      open={open}
      onClose={onClose}
      footer={
        <>
          <Button tone="primary" onClick={submit}>
            Search register
          </Button>
          <Button tone="ghost" onClick={onClose}>
            Cancel
          </Button>
        </>
      }
    >
      <p className="val-search-hint">Search by insured name, registration, or insurer.</p>
      <FormField label="Search query">
        <input
          className="adt-input"
          autoFocus
          placeholder="e.g. KAA 123A or John Doe"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
            if (e.key === "Escape") onClose();
          }}
        />
      </FormField>
      <p className="val-search-shortcut">
        Tip: Press <kbd>Ctrl</kbd>+<kbd>K</kbd> anytime to open this search.
      </p>
    </Modal>
  );
}
