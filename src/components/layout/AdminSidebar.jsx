import React from "react";
import { NavLink } from "react-router-dom";
import logoImg from "../../assets/logo.png";
import { getStoredUser } from "../../lib/api";
import { isAdminUser } from "../../lib/roles";

const adminNav = [
  ["Dashboard","/admin"],
  ["Inventory","/admin/inventory"],
  ["Bookings","/admin/bookings"],
  ["Customers","/admin/customers"],
  ["Payments","/admin/payments"],
  ["Calendar","/admin/calendar"],
  ["Reports","/admin/reports",true],
  ["Maintenance","/admin/maintenance"],
  ["Access","/admin/access",true],
  ["Audit Log","/admin/audit",true],
  ["Settings","/admin/settings",true]
];

export function AdminSidebar({ collapsed = false, onToggle }) {
  const user = getStoredUser() || {};
  const initials = (user.full_name || "Admin User").split(" ").map(x=>x[0]).join("").slice(0,2).toUpperCase();
  return <aside className={`admin-sidebar ${collapsed ? "collapsed" : ""}`}>
    <button type="button" className="admin-brand-toggle" onClick={onToggle} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} title={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
      <img src={logoImg} alt="Bloom & Borrow" className="logo-img" />
      <span className="admin-brand-text">Bloom<span>&amp;Borrow</span></span>
    </button>
    <nav>{adminNav.filter(([, , adminOnly])=>!adminOnly||isAdminUser()).map(([label,path])=><NavLink end={path==="/admin"} to={path} key={label} aria-label={label} data-tooltip={label}><span className="nav-label">{label}</span></NavLink>)}</nav>
    <div className="sidebar-bottom"><div className="admin-mini" aria-label={`${user.full_name || "Admin User"} profile`} data-tooltip={user.full_name || "Admin User"}><div className="avatar">{initials}</div><div className="admin-mini-copy"><strong>{user.full_name || "Admin User"}</strong><small>{user.role || "admin"}</small></div></div></div>
  </aside>
}
