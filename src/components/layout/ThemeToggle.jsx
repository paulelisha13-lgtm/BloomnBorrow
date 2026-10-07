import React, { useEffect, useState } from "react";
import { AdminIcon } from "./AdminIcon";

export function ThemeToggle() {
  const [dark, setDark] = useState(() => {
    try { return localStorage.getItem("bloom_borrow_theme") === "dark"; } catch { return false; }
  });
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
    try { localStorage.setItem("bloom_borrow_theme", dark ? "dark" : "light"); } catch {}
  }, [dark]);
  const label=dark ? "Switch to light mode" : "Switch to dark mode";
  return <button type="button" className="theme-toggle" onClick={() => setDark(d => !d)} title={label} aria-label={label} aria-pressed={dark}>
    <AdminIcon name={dark ? "sun" : "moon"}/>
  </button>;
}
