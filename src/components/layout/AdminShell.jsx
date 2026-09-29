import React, { useState } from "react";
import { AdminProfileMenu } from "./AdminProfileMenu";
import { AdminSearch } from "./AdminSearch";
import { AdminSidebar } from "./AdminSidebar";
import { NotificationBell } from "./NotificationBell";
import { ThemeToggle } from "./ThemeToggle";

export function AdminShell({ children, title, subtitle }) {
  const [sidebarCollapsed,setSidebarCollapsed] = useState(()=>{
    try { return localStorage.getItem("bloom_borrow_sidebar_collapsed") === "true"; } catch { return false; }
  });
  const toggleSidebar = () => setSidebarCollapsed(prev=>{
    const next = !prev;
    try { localStorage.setItem("bloom_borrow_sidebar_collapsed",String(next)); } catch {}
    return next;
  });
  return <div className={`admin-app ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}><AdminSidebar collapsed={sidebarCollapsed} onToggle={toggleSidebar}/><main className="admin-main"><header className="admin-topbar"><div className="admin-topbar-left"><small>Welcome back, Admin 👋</small><h1>{title}</h1>{subtitle && <p>{subtitle}</p>}</div><div className="admin-actions"><ThemeToggle/><AdminSearch/><NotificationBell/><AdminProfileMenu/></div></header>{children}</main></div>
}
