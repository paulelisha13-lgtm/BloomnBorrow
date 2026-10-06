import { useState } from "react";

// ---- shared client-side list sorting ----
function compareValues(a, b) {
  if (typeof a === "number" && typeof b === "number") {
    return (Number.isFinite(a) ? a : 0) - (Number.isFinite(b) ? b : 0);
  }
  return String(a ?? "").localeCompare(String(b ?? ""), undefined, { numeric: true, sensitivity: "base" });
}

// keyDirs optionally sets the direction a key starts in when picked (e.g. a
// "newest first" option should open descending, not ascending).
export function useSort(defaultKey, defaultDir = "asc", keyDirs = {}) {
  const [sortKey, setSortKey] = useState(defaultKey);
  const [sortDir, setSortDir] = useState(defaultDir);
  const setSort = (key) => {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir(keyDirs[key] || (key === defaultKey ? defaultDir : "asc")); }
  };
  return { sortKey, sortDir, setSort };
}

export function sortRows(rows, sorts, sortKey, sortDir) {
  const accessor = sorts[sortKey] && sorts[sortKey].get;
  if (!accessor) return rows;
  const out = [...rows].sort((a, b) => compareValues(accessor(a), accessor(b)));
  return sortDir === "asc" ? out : out.reverse();
}
