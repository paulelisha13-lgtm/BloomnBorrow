import React from "react";

export function SortControls({ sorts, sortKey, sortDir, setSort }) {
  const keys = Object.keys(sorts);
  if (!keys.length) return null;
  return (
    <div className="sort-controls">
      <span className="sort-controls-label">Sort</span>
      <select className="booking-status-select" value={sortKey} onChange={(e) => setSort(e.target.value)}>
        {keys.map((k) => <option key={k} value={k}>{sorts[k].label}</option>)}
      </select>
      <button type="button" className="sort-dir-btn" onClick={() => setSort(sortKey)}
        aria-label={`Sorted ${sortDir === "asc" ? "ascending" : "descending"} — toggle direction`}
        title={sortDir === "asc" ? "Ascending" : "Descending"}>
        {sortDir === "asc" ? "↑" : "↓"}
      </button>
    </div>
  );
}
