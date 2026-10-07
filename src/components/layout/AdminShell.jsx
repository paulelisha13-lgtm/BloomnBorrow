import React, { useEffect, useState } from "react";
import { getStoredUser } from "../../lib/api";
import { AdminProfileMenu } from "./AdminProfileMenu";
import { AdminSearch } from "./AdminSearch";
import { AdminSidebar } from "./AdminSidebar";
import { NotificationBell } from "./NotificationBell";
import { ThemeToggle } from "./ThemeToggle";

export function AdminShell({ children, title, subtitle }) {
  const user=getStoredUser()||{};
  const firstName=String(user.full_name||"").trim().split(/\s+/)[0]||"there";
  const [sidebarCollapsed,setSidebarCollapsed] = useState(()=>{
    try { return localStorage.getItem("bloom_borrow_sidebar_collapsed") === "true"; } catch { return false; }
  });
  const toggleSidebar = () => setSidebarCollapsed(prev=>{
    const next = !prev;
    try { localStorage.setItem("bloom_borrow_sidebar_collapsed",String(next)); } catch {}
    return next;
  });
  useEffect(()=>{document.title=`${title} | Bloom & Borrow`},[title]);
  return <div className={`admin-app ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
    <a className="skip-link" href="#admin-content">Skip to main content</a>
    <AdminSidebar collapsed={sidebarCollapsed} onToggle={toggleSidebar}/>
    <main className="admin-main" id="admin-content" tabIndex="-1">
      <header className="admin-topbar">
        <div className="admin-topbar-left">
          <small>Welcome back, {firstName}</small>
          <h1 id="admin-page-title">{title}</h1>
          {subtitle && <p>{subtitle}</p>}
        </div>
        <div className="admin-actions" aria-label="Workspace tools"><AdminSearch/><ThemeToggle/><NotificationBell/><AdminProfileMenu/></div>
      </header>
      <div className="admin-page-content" aria-labelledby="admin-page-title">{children}</div>
    </main>
  </div>
}
