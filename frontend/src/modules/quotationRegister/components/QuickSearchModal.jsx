import { useEffect, useRef, useState } from "react";

export function QuickSearchModal({ open, onClose, onSearch }) {
  const [query, setQuery] = useState("");
  const inputRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    const t = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  function handleSubmit(e) {
    e.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;
    onSearch(trimmed);
    onClose();
  }

  return (
    <div className="adt-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="adt-modal"
        role="dialog"
        aria-labelledby="qr-search-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="adt-modal-header">
          <h2 id="qr-search-title" className="adt-modal-title">
            Quick search client
          </h2>
          <p style={{ margin: "6px 0 0", fontSize: "0.8rem", color: "var(--adt-muted)" }}>
            Shortcut: <kbd>Ctrl</kbd>+<kbd>K</kbd>
          </p>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="adt-modal-body">
            <label className="adt-label" htmlFor="qr-search-input">
              Client name
            </label>
            <input
              id="qr-search-input"
              ref={inputRef}
              className="adt-input"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Start typing a client name…"
              autoComplete="off"
            />
          </div>
          <div className="adt-modal-footer">
            <button type="button" className="adt-btn adt-btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="adt-btn adt-btn-primary">
              Search
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
