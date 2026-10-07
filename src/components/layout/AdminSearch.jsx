import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../lib/api";
import { peso } from "../../lib/format";
import { AdminIcon } from "./AdminIcon";

export function AdminSearch() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState({ bookings: [], inventory: [], customers: [] });
  const [loading, setLoading] = useState(false);
  const menuRef = useRef(null);
  const requestRef = useRef(0);

  useEffect(() => {
    const onPointerDown = e => { if (menuRef.current && !menuRef.current.contains(e.target)) setOpen(false); };
    const onKeyDown = e => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => { document.removeEventListener("pointerdown", onPointerDown); document.removeEventListener("keydown", onKeyDown); };
  }, []);

  const search = async (q) => {
    if (!q.trim()) { setResults({ bookings: [], inventory: [], customers: [] }); return; }
    const requestId=++requestRef.current;
    setLoading(true);
    try {
      const [bookingsData, inventoryData, customersData] = await Promise.all([
        api("/admin/bookings").catch(() => ({ bookings: [] })),
        api("/admin/inventory").catch(() => ({ items: [] })),
        api("/admin/customers").catch(() => ({ customers: [] }))
      ]);
      const lq = q.toLowerCase();
      if(requestId!==requestRef.current)return;
      setResults({
        bookings: (bookingsData.bookings || []).filter(b => (b.booking_no || "").toLowerCase().includes(lq) || (b.customer_name || "").toLowerCase().includes(lq)).slice(0, 5),
        inventory: (inventoryData.items || []).filter(i => (i.name || "").toLowerCase().includes(lq) || (i.sku || "").toLowerCase().includes(lq)).slice(0, 5),
        customers: (customersData.customers || []).filter(c => (c.full_name || "").toLowerCase().includes(lq) || (c.email || "").toLowerCase().includes(lq)).slice(0, 5)
      });
    } catch (e) {}
    finally { if(requestId===requestRef.current)setLoading(false); }
  };

  useEffect(()=>{
    if(!query.trim()){
      requestRef.current++;
      setLoading(false);
      setResults({bookings:[],inventory:[],customers:[]});
      return;
    }
    const timer=setTimeout(()=>search(query),250);
    return()=>clearTimeout(timer);
  },[query]);

  const handleInput = (e) => {
    const val = e.target.value;
    setQuery(val);
    setOpen(true);
  };

  const hasResults = results.bookings.length || results.inventory.length || results.customers.length;
  const choose = path => { setOpen(false); setQuery(""); navigate(path); };

  return <div className="admin-search-wrap" ref={menuRef}>
    <div className={`admin-search ${open ? "focused" : ""}`} role="search">
      <AdminIcon name="search" size={18}/>
      <input type="search" aria-label="Search bookings, inventory, and customers" aria-controls="admin-search-results" aria-expanded={open&&Boolean(query)} placeholder="Search workspace..." value={query} onChange={handleInput} onFocus={() => { if (query) setOpen(true); }} />
      {query&&<button type="button" className="admin-search-clear" aria-label="Clear search" onClick={()=>{setQuery("");setOpen(false)}}><AdminIcon name="close" size={15}/></button>}
    </div>
    {open && query && <div className="search-dropdown" id="admin-search-results" aria-label="Search results">
      {loading ? <div className="search-empty" role="status">Searching...</div> :
      !hasResults ? <div className="search-empty" role="status">No results for “{query}”</div> :
      <>
        {results.bookings.length > 0 && <div className="search-section">
          <span className="search-section-label">Bookings</span>
          {results.bookings.map(b => <button type="button" className="search-item" key={`b-${b.id}`} onClick={() => choose("/admin/bookings")}>
            <span><strong>{b.booking_no}</strong><small>{b.customer_name} · {peso(Number(b.grand_total))}</small></span><AdminIcon name="arrowRight" size={16}/>
          </button>)}
        </div>}
        {results.inventory.length > 0 && <div className="search-section">
          <span className="search-section-label">Inventory</span>
          {results.inventory.map(i => <button type="button" className="search-item" key={`i-${i.id}`} onClick={() => choose("/admin/inventory")}>
            <span><strong>{i.name}</strong><small>{i.sku} · {peso(Number(i.daily_price))}/day</small></span><AdminIcon name="arrowRight" size={16}/>
          </button>)}
        </div>}
        {results.customers.length > 0 && <div className="search-section">
          <span className="search-section-label">Customers</span>
          {results.customers.map(c => <button type="button" className="search-item" key={`c-${c.id}`} onClick={() => choose("/admin/customers")}>
            <span><strong>{c.full_name}</strong><small>{c.email}</small></span><AdminIcon name="arrowRight" size={16}/>
          </button>)}
        </div>}
      </>}
    </div>}
  </div>;
}
