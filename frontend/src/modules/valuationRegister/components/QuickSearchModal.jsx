import { useState } from "react";
import { Button } from "./ui";

export function QuickSearchModal({ open, onClose, onSearch }) {
  const [query, setQuery] = useState("");
  if (!open) return null;

  return (
    <div className="adt-modal-backdrop" role="dialog">
      <div className="adt-modal">
        <h3>Search valuations</h3>
        <input
          className="adt-input"
          autoFocus
          placeholder="Insured name, registration…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              onSearch(query);
              onClose();
            }
          }}
        />
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <Button
            tone="primary"
            onClick={() => {
              onSearch(query);
              onClose();
            }}
          >
            Search
          </Button>
          <Button tone="ghost" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </div>
  );
}
