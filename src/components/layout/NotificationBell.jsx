import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../lib/api";
import { peso } from "../../lib/format";

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);
  const menuRef = useRef(null);

  const loadNotifications = async () => {
    setLoading(true);
    try {
      const [bookingsData, inventoryData, escalationsData] = await Promise.all([
        api("/admin/bookings").catch(()=>({bookings:[]})),
        api("/admin/inventory").catch(()=>({items:[]})),
        api("/admin/escalations").catch(()=>({escalated:[]}))
      ]);
      const bookings = (bookingsData.bookings || []).slice(0, 10);
      const notifs = bookings.map(b => ({
        id: `b-${b.id}`,
        type: b.status === "pending" ? "booking_new" : b.status === "overdue" ? "booking_overdue" : "booking_update",
        title: b.status === "pending" ? "New Booking" : b.status === "overdue" ? "Overdue Rental" : "Booking Updated",
        message: `${b.customer_name} — ${b.items || "No items"}`,
        detail: `${peso(Number(b.grand_total))} · ${String(b.start_date).slice(0,10)} → ${String(b.end_date).slice(0,10)}`,
        status: b.status,
        time: b.created_at,
        read: false
      }));
      const lowStockItems = (inventoryData.items || []).filter(x => x.status === "active" && Number(x.total_quantity) < 5);
      lowStockItems.forEach((item, i) => {
        notifs.push({
          id: `lowstock-${item.id}`,
          type: "low_stock",
          title: "Low Stock Alert",
          message: `${item.name} — only ${item.total_quantity} unit(s) left`,
          detail: `SKU: ${item.sku || "N/A"} · Restock recommended`,
          time: new Date().toISOString(),
          read: false
        });
      });
      (escalationsData.escalated||[]).slice(0,5).forEach(e => {
        notifs.push({
          id: `esc-${e.id}`,
          type: "escalation",
          title: e.level==="final"?"Final Notice Due":e.level==="formal"?"Formal Demand Due":"Follow-up Needed",
          message: `${e.customer_name} — ${e.daysText}`,
          detail: `${e.booking_no} · Late fee: ${peso(e.lateFee)}`,
          status: e.level,
          time: new Date().toISOString(),
          read: false
        });
      });
      notifs.sort((a, b) => new Date(b.time) - new Date(a.time));
      setNotifications(notifs.slice(0, 20));
    } catch (e) {}
    finally { setLoading(false); }
  };

  useEffect(() => { loadNotifications(); }, []);
  useEffect(() => {
    const interval = setInterval(loadNotifications, 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const onPointerDown = e => { if (menuRef.current && !menuRef.current.contains(e.target)) setOpen(false); };
    const onKeyDown = e => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => { document.removeEventListener("pointerdown", onPointerDown); document.removeEventListener("keydown", onKeyDown); };
  }, []);

  const unreadCount = notifications.filter(n => !n.read).length;

  const markAllRead = () => setNotifications(prev => prev.map(n => ({ ...n, read: true })));

  const getIcon = (type) => {
    if (type === "booking_new") return "📋";
    if (type === "booking_overdue") return "⚠";
    if (type === "low_stock") return "🔴";
    return "🔄";
  };

  const getTypeClass = (type) => {
    if (type === "booking_new") return "notif-new";
    if (type === "booking_overdue") return "notif-overdue";
    if (type === "low_stock") return "notif-lowstock";
    return "notif-update";
  };

  return <div className="notification-bell" ref={menuRef}>
    <button type="button" className="notification-trigger" aria-label="Notifications" onClick={() => setOpen(v => !v)}>
      🔔
      {unreadCount > 0 && <span className="notification-badge">{unreadCount}</span>}
    </button>
    {open && <div className="notification-dropdown">
      <div className="notification-header">
        <div><strong>Notifications</strong><small>{unreadCount} unread</small></div>
        {unreadCount > 0 && <button onClick={markAllRead}>Mark all read</button>}
      </div>
      <div className="notification-list">
        {loading && notifications.length === 0 ? <div className="notification-empty">Loading notifications...</div> :
        notifications.length === 0 ? <div className="notification-empty">No notifications yet.</div> :
        notifications.map(n => <div className={`notification-item ${n.read ? "read" : ""} ${getTypeClass(n.type)}`} key={n.id} onClick={() => { n.read = true; setNotifications([...notifications]); }}>
          <span className="notification-icon">{getIcon(n.type)}</span>
          <div className="notification-content">
            <strong>{n.title}</strong>
            <p>{n.message}</p>
            <small>{n.detail}</small>
          </div>
          {!n.read && <span className="notification-dot"></span>}
        </div>)}
      </div>
      <div className="notification-footer">
        {notifications.some(n=>n.type==="low_stock")?
          <Link to="/admin/inventory" onClick={() => setOpen(false)}>View inventory →</Link>:
          <Link to="/admin/bookings" onClick={() => setOpen(false)}>View all bookings</Link>}
      </div>
    </div>}
  </div>;
}
