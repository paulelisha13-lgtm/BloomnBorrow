import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { CustomerShell } from "../../components/customer/CustomerShell";
import { RentalItemCard } from "../../components/customer/RentalItemCard";
import { useCart } from "../../context/CartContext";
import { publicApi } from "../../lib/publicApi";

const STATE_KEY = "bb_customer_browse_state";
const readBrowseState = () => {
  try { return JSON.parse(sessionStorage.getItem(STATE_KEY) || "{}"); } catch { return {}; }
};

export function CustomerCatalog() {
  const navigate = useNavigate();
  const location = useLocation();
  const { addItem } = useCart();
  const [items, setItems] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(() => readBrowseState().search || "");
  const [category, setCategory] = useState(() => readBrowseState().category || "");
  const [added, setAdded] = useState(null);
  // The card the details panel was opened from stays marked while the panel
  // is up, so the customer can see which item they're looking at.
  const [selected, setSelected] = useState(null);

  const loadItems = () => {
    setLoading(true);
    setError("");
    publicApi("/public/items").then(d => setItems(d.items || [])).catch(e => setError(e.message)).finally(() => setLoading(false));
  };

  useEffect(() => {
    loadItems();
  }, []);

  // So a customer who opens an item and comes back doesn't lose their place
  // -- session-only, not part of the cart/order data.
  useEffect(() => {
    try { sessionStorage.setItem(STATE_KEY, JSON.stringify({ search, category })); } catch { /* ignore */ }
  }, [search, category]);

  // Categories are the existing rental_items.category values -- no separate
  // category table/list exists, so they're derived from what's loaded rather
  // than invented.
  const categories = useMemo(() => [...new Set(items.map(x => x.category).filter(Boolean))].sort(), [items]);

  const filtered = items.filter(item => {
    const matchCategory = !category || item.category === category;
    const q = search.trim().toLowerCase();
    const matchSearch = !q || [item.name, item.category].some(v => String(v || "").toLowerCase().includes(q));
    return matchCategory && matchSearch;
  });

  const openItem = item => {
    setSelected(item.id);
    navigate(`/shop/${item.id}`, { state: { backgroundLocation: location } });
  };

  const quickAdd = item => {
    if (item.available_quantity < 1) return;
    addItem(item, 1);
    setAdded(item.id);
    setTimeout(() => setAdded(id => id === item.id ? null : id), 900);
  };

  const clearFilters=()=>{setSearch("");setCategory("")};

  return <CustomerShell title="Browse rentals" subtitle="Search our current inventory, compare daily rates, and add available items to your cart.">
    {error && <div className="shop-inline-alert" role="alert"><div><strong>We couldn’t load the catalog.</strong><span>{error}</span></div><button type="button" className="secondary-button" onClick={loadItems}>Try again</button></div>}

    <div className="shop-toolbar">
      <div className="admin-search shop-search">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>
        <input type="search" aria-label="Search rental items" placeholder="Search by item or category…" value={search} onChange={e => setSearch(e.target.value)} />
        {search&&<button type="button" className="shop-search-clear" aria-label="Clear search" onClick={()=>setSearch("")}>×</button>}
      </div>

      <nav className="shop-category-nav" aria-label="Categories">
        <button type="button" className={`shop-chip ${!category ? "active" : ""}`} aria-pressed={!category} onClick={() => setCategory("")}>All</button>
        {categories.map(cat => <button type="button" key={cat} className={`shop-chip ${category === cat ? "active" : ""}`} aria-pressed={category===cat} onClick={() => setCategory(cat)}>{cat}</button>)}
      </nav>
    </div>

    {!loading&&!error&&<div className="shop-results-meta" role="status"><span>{filtered.length} rental item{filtered.length===1?"":"s"}</span>{(search||category)&&<button type="button" onClick={clearFilters}>Clear filters</button>}</div>}

    {loading ? <div className="shop-catalog-skeleton" role="status" aria-live="polite"><span className="sr-only">Loading rental items</span>{[0,1,2,3,4,5,6,7].map(x=><i key={x}/>)}</div> :
      error ? null : filtered.length === 0 ? <div className="admin-card inventory-empty"><h3>No matching rentals</h3><p>{search || category ? "Try a different search or clear the selected category." : "Please check back soon."}</p>{(search||category)&&<button type="button" className="secondary-button" onClick={clearFilters}>Clear filters</button>}</div> :
      <div className="shop-item-grid shop-async-reveal">
        {filtered.map(item => <RentalItemCard
          key={item.id}
          item={item}
          selected={selected === item.id}
          onOpen={openItem}
          onAdd={quickAdd}
          added={added === item.id}
        />)}
      </div>}
  </CustomerShell>;
}
