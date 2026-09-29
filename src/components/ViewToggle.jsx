import React from "react";

export function ViewToggle({ view, onChange }) {
  return (
    <div className="view-toggle" role="group" aria-label="View mode">
      <button type="button" className={view === "cards" ? "active" : ""} aria-pressed={view === "cards"}
        onClick={() => onChange("cards")} title="Card view" aria-label="Card view">▦</button>
      <button type="button" className={view === "table" ? "active" : ""} aria-pressed={view === "table"}
        onClick={() => onChange("table")} title="Table view" aria-label="Table view">☰</button>
    </div>
  );
}
