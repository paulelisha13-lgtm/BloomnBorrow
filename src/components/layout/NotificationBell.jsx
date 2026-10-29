import React, { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../../lib/api";
import { peso } from "../../lib/format";
import { AdminIcon } from "./AdminIcon";

const READ_STORAGE_KEY = "bnb_admin_notifications_read";

// A notification counts as read only while its content is unchanged.
const notifSignature = n => `${n.type}|${n.status || ""}|${n.title}|${n.message}`;

function loadReadMap() {
  try { return JSON.parse(localStorage.getItem(READ_STORAGE_KEY)) || {}; } catch { return {}; }
}

function saveReadMap(map) {
  try { localStorage.setItem(READ_STORAGE_KEY, JSON.stringify(map)); } catch {}
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);
  const menuRef = useRef(null);
  const triggerRef = useRef(null);
  const dropdownRef = useRef(null);
  const navigate = useNavigate();

  const loadNotifications = async () => {
    setLoading(true);
    try {
      // Already sorted and trimmed by the API (payment proofs first, 10 bookings).
      const alerts = await api("/admin/alerts");
      const notifs = (alerts.bookings || []).map(b => ({
        id: `b-${b.id}`,
        type: b.gcash_proof_status === "submitted" ? "payment_proof" : b.status === "pending" ? "booking_new" : b.status === "overdue" ? "booking_overdue" : "booking_update",
        title: b.gcash_proof_status === "submitted" ? "Payment Proof to Review" : b.status === "pending" ? "New Booking" : b.status === "overdue" ? "Overdue Rental" : "Booking Updated",
        message: b.gcash_proof_status === "submitted" ? `${b.booking_no} — ${b.customer_name}` : `${b.customer_name} — ${b.items || "No items"}`,
        detail: b.gcash_proof_status === "submitted" ? "GCash screenshot uploaded · Open Bookings to review" : `${peso(Number(b.grand_total))} · ${String(b.start_date).slice(0,10)} → ${String(b.end_date).slice(0,10)}`,
        status: b.status,
        link: "/admin/bookings",
        time: b.gcash_proof_uploaded_at || b.created_at,
        read: false
      }));
      (alerts.low_stock || []).forEach(item => {
        notifs.push({
          id: `lowstock-${item.id}`,
          type: "low_stock",
          title: "Low Stock Alert",
          message: `${item.name} — only ${item.total_quantity} unit(s) left`,
          detail: `SKU: ${item.sku || "N/A"} · Restock recommended`,
          link: "/admin/inventory",
          time: new Date().toISOString(),
          read: false
        });
      });
      (alerts.escalated || []).forEach(e => {
        notifs.push({
          id: `esc-${e.id}`,
          type: "escalation",
          title: e.level==="final"?"Final Notice Due":e.level==="formal"?"Formal Demand Due":"Follow-up Needed",
          message: `${e.customer_name} — ${e.daysText}`,
          detail: `${e.booking_no} · Late fee: ${peso(e.lateFee)}`,
          status: e.level,
          link: "/admin/bookings",
          time: new Date().toISOString(),
          read: false
        });
      });
      notifs.sort((a, b) => new Date(b.time) - new Date(a.time));
      const readMap = loadReadMap();
      const visible = notifs.slice(0, 20).map(n => ({ ...n, read: readMap[n.id] === notifSignature(n) }));
      // Drop stored entries for notifications that no longer exist.
      const pruned = {};
      visible.forEach(n => { if (n.read) pruned[n.id] = readMap[n.id]; });
      saveReadMap(pruned);
      setNotifications(visible);
    } catch (e) {}
    finally { setLoading(false); }
  };

  useEffect(() => { loadNotifications(); }, []);
  // Skip polling while the tab is hidden; catch up as soon as it is shown again.
  useEffect(() => {
    const interval = setInterval(() => { if (!document.hidden) loadNotifications(); }, 60000);
    const onVisible = () => { if (!document.hidden) loadNotifications(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { clearInterval(interval); document.removeEventListener("visibilitychange", onVisible); };
  }, []);

  useEffect(() => {
    const onPointerDown = e => { if (menuRef.current && !menuRef.current.contains(e.target)) setOpen(false); };
    const onKeyDown = e => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => { document.removeEventListener("pointerdown", onPointerDown); document.removeEventListener("keydown", onKeyDown); };
  }, []);

  useEffect(() => {
    if (!open) return;
    const mobile = window.matchMedia("(max-width: 680px)").matches;
    const previousOverflow = document.body.style.overflow;
    if (mobile) document.body.style.overflow = "hidden";
    requestAnimationFrame(() => dropdownRef.current?.focus());
    return () => {
      if (mobile) document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  const unreadCount = notifications.filter(n => !n.read).length;

  const markRead = items => {
    const map = loadReadMap();
    items.forEach(n => { map[n.id] = notifSignature(n); });
    saveReadMap(map);
  };

  const markAllRead = () => {
    markRead(notifications);
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  };

  const goTo = (n) => {
    markRead([n]);
    setNotifications(prev => prev.map(x => x.id === n.id ? { ...x, read: true } : x));
    setOpen(false);
    if (n.link) navigate(n.link);
  };

  const getIcon = (type) => {
    if (type === "payment_proof") return "receipt";
    if (type === "booking_new") return "bookings";
    if (type === "booking_overdue") return "alert";
    if (type === "low_stock") return "inventory";
    return "refresh";
  };

  const getTypeClass = (type) => {
    if (type === "payment_proof") return "notif-new";
    if (type === "booking_new") return "notif-new";
    if (type === "booking_overdue") return "notif-overdue";
    if (type === "low_stock") return "notif-lowstock";
    return "notif-update";
  };

  return <div className={`notification-bell${open ? " is-open" : ""}`} ref={menuRef}>
    <button ref={triggerRef} type="button" className="notification-trigger" aria-label={unreadCount?`Notifications, ${unreadCount} unread`:"Notifications"} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(v => !v)}>
      <AdminIcon name="bell"/>
      {unreadCount > 0 && <span className="notification-badge" aria-hidden="true">{unreadCount>99?"99+":unreadCount}</span>}
    </button>
    {open && <>
      <button type="button" className="notification-backdrop" aria-label="Close notifications" onClick={() => { setOpen(false); triggerRef.current?.focus(); }}/>
      <div ref={dropdownRef} className="notification-dropdown" role="dialog" aria-label="Notifications" tabIndex="-1">
      <div className="notification-header">
        <div className="notification-header-copy"><strong>Notifications</strong><small>{unreadCount} unread</small></div>
        <div className="notification-header-actions">
          {unreadCount > 0 && <button type="button" onClick={markAllRead}>Mark all read</button>}
          <button type="button" className="notification-close" aria-label="Close notifications" onClick={() => { setOpen(false); triggerRef.current?.focus(); }}><span aria-hidden="true">&times;</span></button>
        </div>
      </div>
      <div className="notification-list">
        {loading && notifications.length === 0 ? <div className="notification-empty">Loading notifications...</div> :
        notifications.length === 0 ? <div className="notification-empty">No notifications yet.</div> :
        notifications.map(n => <button type="button" className={`notification-item ${n.read ? "read" : ""} ${getTypeClass(n.type)}`} key={n.id} aria-label={`${n.title}${n.read?"":", unread"}. ${n.message}`} onClick={() => goTo(n)}>
          <span className="notification-icon"><AdminIcon name={getIcon(n.type)} size={18}/></span>
          <div className="notification-content">
            <strong>{n.title}</strong>
            <p>{n.message}</p>
            <small>{n.detail}</small>
          </div>
          {n.read ? <AdminIcon name="arrowRight" size={16} className="notification-go"/> : <span className="notification-dot" aria-hidden="true"></span>}
        </button>)}
      </div>
      <div className="notification-footer">
        {notifications.some(n=>n.type==="low_stock")?
          <Link to="/admin/inventory" onClick={() => setOpen(false)}>View inventory →</Link>:
          <Link to="/admin/bookings" onClick={() => setOpen(false)}>View all bookings</Link>}
      </div>
    </div></>}
  </div>;
}
