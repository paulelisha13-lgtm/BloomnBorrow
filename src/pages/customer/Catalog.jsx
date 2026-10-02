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

  useEffect(() => {
    publicApi("/public/items").then(d => setItems(d.items || [])).catch(e => setError(e.message)).finally(() => setLoading(false));
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

  return <CustomerShell title="Browse Rentals" subtitle="Available items from our current inventory.">
    {error && <div className="login-error">{error}</div>}

    <div className="shop-toolbar">
      <div className="admin-search shop-search">
        <span>⌕</span>
        <input placeholder="Search items…" value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      <nav className="shop-category-nav" aria-label="Categories">
        <button type="button" className={`shop-chip ${!category ? "active" : ""}`} onClick={() => setCategory("")}>All</button>
        {categories.map(cat => <button type="button" key={cat} className={`shop-chip ${category === cat ? "active" : ""}`} onClick={() => setCategory(cat)}>{cat}</button>)}
      </nav>
    </div>

    {loading ? <div className="admin-card inventory-empty" role="status" aria-live="polite">Loading items…</div> :
      filtered.length === 0 ? <div className="admin-card inventory-empty"><h3>No items found</h3><p>{search || category ? "Try adjusting your search or filters." : "Please check back soon."}</p></div> :
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
