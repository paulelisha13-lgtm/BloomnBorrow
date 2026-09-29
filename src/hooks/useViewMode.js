import { useState } from "react";

// Per-module Cards/Table preference, remembered across sessions.
export function useViewMode(storageKey, initial = "cards") {
  const [view, setView] = useState(() => {
    try { return localStorage.getItem(storageKey) || initial; } catch { return initial; }
  });
  const set = (v) => {
    setView(v);
    try { localStorage.setItem(storageKey, v); } catch {}
  };
  return [view, set];
}
