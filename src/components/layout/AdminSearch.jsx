import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../lib/api";
import { peso } from "../../lib/format";

export function AdminSearch() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState({ bookings: [], inventory: [], customers: [] });
  const [loading, setLoading] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    const onPointerDown = e => { if (menuRef.current && !menuRef.current.contains(e.target)) setOpen(false); };
    const onKeyDown = e => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => { document.removeEventListener("pointerdown", onPointerDown); document.removeEventListener("keydown", onKeyDown); };
  }, []);

  const search = async (q) => {
    if (!q.trim()) { setResults({ bookings: [], inventory: [], customers: [] }); return; }
    setLoading(true);
    try {
      const [bookingsData, inventoryData, customersData] = await Promise.all([
        api("/admin/bookings").catch(() => ({ bookings: [] })),
        api("/admin/inventory").catch(() => ({ items: [] })),
        api("/admin/customers").catch(() => ({ customers: [] }))
      ]);
      const lq = q.toLowerCase();
      setResults({
        bookings: (bookingsData.bookings || []).filter(b => (b.booking_no || "").toLowerCase().includes(lq) || (b.customer_name || "").toLowerCase().includes(lq)).slice(0, 5),
        inventory: (inventoryData.items || []).filter(i => (i.name || "").toLowerCase().includes(lq) || (i.sku || "").toLowerCase().includes(lq)).slice(0, 5),
        customers: (customersData.customers || []).filter(c => (c.full_name || "").toLowerCase().includes(lq) || (c.email || "").toLowerCase().includes(lq)).slice(0, 5)
      });
    } catch (e) {}
    finally { setLoading(false); }
  };

  const handleInput = (e) => {
    const val = e.target.value;
    setQuery(val);
    setOpen(true);
    search(val);
  };

  const hasResults = results.bookings.length || results.inventory.length || results.customers.length;

  return <div className="admin-search-wrap" ref={menuRef}>
    <div className={`admin-search ${open ? "focused" : ""}`}>
      <span>⌕</span>
      <input placeholder="Search bookings, items, customers..." value={query} onChange={handleInput} onFocus={() => { if (query) setOpen(true); }} />
    </div>
    {open && query && <div className="search-dropdown">
      {loading ? <div className="search-empty">Searching...</div> :
      !hasResults ? <div className="search-empty">No results for "{query}"</div> :
      <>
        {results.bookings.length > 0 && <div className="search-section">
          <span className="search-section-label">Bookings</span>
          {results.bookings.map(b => <div className="search-item" key={`b-${b.id}`} onClick={() => { setOpen(false); setQuery(""); navigate("/admin/bookings"); }}>
            <strong>{b.booking_no}</strong><small>{b.customer_name} · {peso(Number(b.grand_total))}</small>
          </div>)}
        </div>}
        {results.inventory.length > 0 && <div className="search-section">
          <span className="search-section-label">Inventory</span>
          {results.inventory.map(i => <div className="search-item" key={`i-${i.id}`} onClick={() => { setOpen(false); setQuery(""); navigate("/admin/inventory"); }}>
            <strong>{i.name}</strong><small>{i.sku} · {peso(Number(i.daily_price))}/day</small>
          </div>)}
        </div>}
        {results.customers.length > 0 && <div className="search-section">
          <span className="search-section-label">Customers</span>
          {results.customers.map(c => <div className="search-item" key={`c-${c.id}`} onClick={() => { setOpen(false); setQuery(""); navigate("/admin/customers"); }}>
            <strong>{c.full_name}</strong><small>{c.email}</small>
          </div>)}
        </div>}
      </>}
    </div>}
  </div>;
}
