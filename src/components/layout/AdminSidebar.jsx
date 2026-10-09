import React, { useEffect, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import logoImg from "../../assets/logo.png";
import { api, getStoredUser } from "../../lib/api";
import { BOOKING_STAGES, stageCounts } from "../../lib/bookingStages";
import { isAdminUser, isFullAdminUser } from "../../lib/roles";
import { AdminIcon } from "./AdminIcon";

// Grouped by the order work happens: bookings -> customers -> money in ->
// money out -> stock -> analysis -> administration. `level` limits who sees an
// entry ("admin" = admin or manager, "full" = admin only); the server enforces
// the same rules, hiding a link is only a convenience.
const adminNav = [
  { label:"Overview", items:[
    { label:"Dashboard", path:"/admin", icon:"dashboard" }
  ]},
  { label:"Operations", items:[
    { label:"Bookings", id:"bookings", icon:"bookings", path:"/admin/bookings", children:[
      ...BOOKING_STAGES.map(s=>({ label:s.label, path:`/admin/bookings?stage=${s.key}`, stage:s.key })),
      { label:"All Bookings", path:"/admin/bookings", stage:"" }
    ]},
    { label:"Calendar", path:"/admin/calendar", icon:"calendar" },
    { label:"Customers", path:"/admin/customers", icon:"customers" },
    { label:"Payments", path:"/admin/payments", icon:"payments" }
  ]},
  { label:"Business", items:[
    { label:"Finance", id:"finance", icon:"finance", path:"/admin/finance/expenses", level:true, children:[
      { label:"Expenses", path:"/admin/finance/expenses" },
      { label:"Profit & Loss", path:"/admin/finance/profit-loss" }
    ]},
    { label:"Inventory", id:"inventory", icon:"inventory", path:"/admin/inventory", children:[
      { label:"Items", path:"/admin/inventory" },
      { label:"Maintenance", path:"/admin/maintenance" }
    ]},
    { label:"Reports", path:"/admin/reports", icon:"reports", level:true }
  ]},
  { label:"System", items:[
    { label:"Administration", id:"administration", icon:"settings", path:"/admin/settings", children:[
      { label:"Settings", path:"/admin/settings", level:true },
      { label:"Users & Access", path:"/admin/access", level:"full" },
      { label:"Audit Log", path:"/admin/audit", level:"full" }
    ]}
  ]}
];

function childIsActive(child, location) {
  const [pathname] = child.path.split("?");
  if (location.pathname !== pathname) return false;
  if (child.stage === undefined) return true;
  return (new URLSearchParams(location.search).get("stage") || "") === child.stage;
}

export function AdminSidebar({ collapsed = false, mobileOpen = false, onMobileClose, onToggle }) {
  const user = getStoredUser() || {};
  const location = useLocation();
  const initials = (user.full_name || "Admin User").split(" ").map(x=>x[0]).join("").slice(0,2).toUpperCase();
  const canView = level => !level || (level === "full" ? isFullAdminUser() : isAdminUser());
  const [counts,setCounts] = useState({ stages:{}, overdue:0 });
  const [openGroups,setOpenGroups] = useState({});

  // Keep the Pending / overdue badges current: reload on navigation, on a
  // timer, and whenever the Bookings page announces that something changed.
  useEffect(()=>{
    let alive = true;
    const load = () => api("/admin/booking-counts").then(d=>{ if(alive) setCounts({ stages:stageCounts(d.counts), overdue:Number(d.overdue||0) }); }).catch(()=>{});
    load();
    const timer = setInterval(load,60000);
    window.addEventListener("bb:bookings-changed",load);
    return ()=>{ alive = false; clearInterval(timer); window.removeEventListener("bb:bookings-changed",load); };
  },[location.pathname]);

  // Navigating into a group opens it; leaving it never force-closes what the user opened.
  useEffect(()=>{
    for (const group of adminNav) for (const item of group.items) {
      if (item.children?.some(child=>childIsActive(child,location))) setOpenGroups(prev=>prev[item.id] ? prev : { ...prev, [item.id]:true });
    }
  },[location.pathname,location.search]);

  const badgeFor = child => {
    if (child.stage === "pending" && counts.stages.pending > 0) return <span className="nav-badge" aria-label={`${counts.stages.pending} pending`}>{counts.stages.pending}</span>;
    if (child.stage === "ongoing" && counts.overdue > 0) return <span className="nav-badge nav-badge-danger" aria-label={`${counts.overdue} overdue`}>{counts.overdue} overdue</span>;
    return null;
  };

  return <aside id="admin-primary-sidebar" className={`admin-sidebar ${collapsed ? "collapsed" : ""}`} aria-label="Admin sidebar">
    <button type="button" className="admin-mobile-sidebar-close" onClick={onMobileClose} aria-label="Close navigation">×</button>
    <button type="button" className="admin-brand-toggle" onClick={mobileOpen ? onMobileClose : onToggle} aria-label={mobileOpen ? "Close navigation" : collapsed ? "Expand sidebar" : "Collapse sidebar"} title={mobileOpen ? "Close navigation" : collapsed ? "Expand sidebar" : "Collapse sidebar"}>
      <img src={logoImg} alt="Bloom & Borrow" className="logo-img" />
      <span className="admin-brand-text">Bloom<span>&amp;Borrow</span></span>
    </button>
    <nav aria-label="Primary navigation" onClick={event=>{if(event.target.closest("a"))onMobileClose?.()}}>{adminNav.map(group=>{
      const items=group.items.filter(item=>canView(item.level));
      if(!items.length)return null;
      return <div className="admin-nav-group" key={group.label}>
        <span className="admin-nav-heading">{group.label}</span>
        {items.map(item=>{
          if(!item.children) return <NavLink end={item.path==="/admin"} to={item.path} key={item.label} aria-label={item.label} data-tooltip={item.label}>
            <AdminIcon name={item.icon}/><span className="nav-label">{item.label}</span>
          </NavLink>;
          const children=item.children.filter(child=>canView(child.level));
          if(!children.length)return null;
          const within=children.some(child=>childIsActive(child,location));
          const open=Boolean(openGroups[item.id]);
          // A collapsed (icon-only) sidebar has no room for a submenu, so the icon opens the group's first page.
          if(collapsed) return <Link to={children[0].path} key={item.label} aria-label={item.label} data-tooltip={item.label} className={within?"active":""}>
            <AdminIcon name={item.icon}/><span className="nav-label">{item.label}</span>
          </Link>;
          return <React.Fragment key={item.label}>
            <button type="button" className={`nav-parent${within?" has-active":""}`} aria-expanded={open} aria-controls={`nav-sub-${item.id}`} onClick={()=>setOpenGroups(prev=>({ ...prev, [item.id]:!open }))}>
              <AdminIcon name={item.icon}/><span className="nav-label">{item.label}</span>
              {item.id==="bookings" && !open && counts.stages.pending>0 && <span className="nav-badge">{counts.stages.pending}</span>}
              {item.id==="bookings" && !open && counts.overdue>0 && <span className="nav-badge nav-badge-danger">{counts.overdue}</span>}
              <AdminIcon name="chevronDown" size={16} className="nav-chevron"/>
            </button>
            {open && <div className="nav-sub-list" id={`nav-sub-${item.id}`}>
              {children.map(child=><Link key={child.path} to={child.path} className={`nav-sub${childIsActive(child,location)?" active":""}`}>
                <span className="nav-label">{child.label}</span>{badgeFor(child)}
              </Link>)}
            </div>}
          </React.Fragment>;
        })}
      </div>;
    })}</nav>
    <div className="sidebar-bottom"><div className="admin-mini" aria-label={`${user.full_name || "Admin User"} profile`} data-tooltip={user.full_name || "Admin User"}><div className="avatar">{initials}</div><div className="admin-mini-copy"><strong>{user.full_name || "Admin User"}</strong><small>{user.role || "admin"}</small></div></div></div>
  </aside>
}
