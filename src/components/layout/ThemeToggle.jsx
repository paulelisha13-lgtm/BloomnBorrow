import React, { useEffect, useState } from "react";

export function ThemeToggle() {
  const [dark, setDark] = useState(() => {
    try { return localStorage.getItem("bloom_borrow_theme") === "dark"; } catch { return false; }
  });
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
    try { localStorage.setItem("bloom_borrow_theme", dark ? "dark" : "light"); } catch {}
  }, [dark]);
  return <button className="theme-toggle" onClick={() => setDark(d => !d)} title={dark ? "Switch to light mode" : "Switch to dark mode"}>{dark ? "☀️" : "🌙"}</button>;
}
