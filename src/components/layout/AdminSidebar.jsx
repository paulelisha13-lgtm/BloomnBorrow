import React from "react";
import { NavLink } from "react-router-dom";
import logoImg from "../../assets/logo.png";
import { getStoredUser } from "../../lib/api";
import { isAdminUser, isFullAdminUser } from "../../lib/roles";
import { AdminIcon } from "./AdminIcon";

const adminNav = [
  { label:"Overview", items:[
    ["Dashboard","/admin","dashboard"]
  ]},
  { label:"Operations", items:[
    ["Inventory","/admin/inventory","inventory"],
    ["Bookings","/admin/bookings","bookings"],
    ["Customers","/admin/customers","customers"],
    ["Payments","/admin/payments","payments"],
    ["Calendar","/admin/calendar","calendar"],
    ["Maintenance","/admin/maintenance","maintenance"]
  ]},
  { label:"Insights", items:[
    ["Reports","/admin/reports","reports",true]
  ]},
  { label:"Administration", items:[
    ["Access","/admin/access","access","full"],
    ["Audit Log","/admin/audit","audit","full"],
    ["Settings","/admin/settings","settings",true]
  ]}
];

export function AdminSidebar({ collapsed = false, onToggle }) {
  const user = getStoredUser() || {};
  const initials = (user.full_name || "Admin User").split(" ").map(x=>x[0]).join("").slice(0,2).toUpperCase();
  const canView = level => !level || (level === "full" ? isFullAdminUser() : isAdminUser());
  return <aside className={`admin-sidebar ${collapsed ? "collapsed" : ""}`} aria-label="Admin sidebar">
    <button type="button" className="admin-brand-toggle" onClick={onToggle} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} title={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
      <img src={logoImg} alt="Bloom & Borrow" className="logo-img" />
      <span className="admin-brand-text">Bloom<span>&amp;Borrow</span></span>
    </button>
    <nav aria-label="Primary navigation">{adminNav.map(group=>{
      const items=group.items.filter(([, , , level])=>canView(level));
      if(!items.length)return null;
      return <div className="admin-nav-group" key={group.label}>
        <span className="admin-nav-heading">{group.label}</span>
        {items.map(([label,path,icon])=><NavLink end={path==="/admin"} to={path} key={label} aria-label={label} data-tooltip={label}>
          <AdminIcon name={icon}/><span className="nav-label">{label}</span>
        </NavLink>)}
      </div>;
    })}</nav>
    <div className="sidebar-bottom"><div className="admin-mini" aria-label={`${user.full_name || "Admin User"} profile`} data-tooltip={user.full_name || "Admin User"}><div className="avatar">{initials}</div><div className="admin-mini-copy"><strong>{user.full_name || "Admin User"}</strong><small>{user.role || "admin"}</small></div></div></div>
  </aside>
}
