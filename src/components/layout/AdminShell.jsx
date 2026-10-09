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
  const [mobileNavOpen,setMobileNavOpen] = useState(false);
  const [sidebarCollapsed,setSidebarCollapsed] = useState(()=>{
    try { return localStorage.getItem("bloom_borrow_sidebar_collapsed") === "true"; } catch { return false; }
  });
  const toggleSidebar = () => setSidebarCollapsed(prev=>{
    const next = !prev;
    try { localStorage.setItem("bloom_borrow_sidebar_collapsed",String(next)); } catch {}
    return next;
  });
  useEffect(()=>{
    if(!mobileNavOpen)return;
    const previousOverflow=document.body.style.overflow;
    const onKeyDown=event=>{if(event.key==="Escape")setMobileNavOpen(false)};
    document.body.style.overflow="hidden";
    document.addEventListener("keydown",onKeyDown);
    return()=>{document.body.style.overflow=previousOverflow;document.removeEventListener("keydown",onKeyDown)};
  },[mobileNavOpen]);
  useEffect(()=>{
    const media=window.matchMedia("(max-width: 900px)");
    const onChange=event=>{if(!event.matches)setMobileNavOpen(false)};
    media.addEventListener?.("change",onChange);
    return()=>media.removeEventListener?.("change",onChange);
  },[]);
  useEffect(()=>{document.title=`${title} | Bloom & Borrow`},[title]);
  return <div className={`admin-app ${sidebarCollapsed ? "sidebar-collapsed" : ""}${mobileNavOpen ? " mobile-nav-open" : ""}`}>
    <a className="skip-link" href="#admin-content">Skip to main content</a>
    <AdminSidebar collapsed={sidebarCollapsed && !mobileNavOpen} mobileOpen={mobileNavOpen} onMobileClose={()=>setMobileNavOpen(false)} onToggle={toggleSidebar}/>
    {mobileNavOpen&&<button type="button" className="admin-sidebar-backdrop" aria-label="Close navigation" onClick={()=>setMobileNavOpen(false)}/>}
    <main className="admin-main" id="admin-content" tabIndex="-1">
      <button type="button" className="admin-mobile-menu-trigger" aria-controls="admin-primary-sidebar" aria-expanded={mobileNavOpen} onClick={()=>setMobileNavOpen(true)}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg><span>Menu</span>
      </button>
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
