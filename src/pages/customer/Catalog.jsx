import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CustomerShell } from "../../components/customer/CustomerShell";
import { FilterSidebar } from "../../components/customer/FilterSidebar";
import { useCart } from "../../context/CartContext";
import { publicApi } from "../../lib/publicApi";
import { peso } from "../../lib/format";

const STATE_KEY = "bb_customer_browse_state";
const readBrowseState = () => {
  try { return JSON.parse(sessionStorage.getItem(STATE_KEY) || "{}"); } catch { return {}; }
};

export function CustomerCatalog() {
  const navigate = useNavigate();
  const { addItem } = useCart();
  const [items, setItems] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(() => readBrowseState().search || "");
  const [category, setCategory] = useState(() => readBrowseState().category || "");
  const [filterOpen, setFilterOpen] = useState(false);
  const [added, setAdded] = useState(null);

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

  const quickAdd = (e, item) => {
    e.stopPropagation();
    if (item.available_quantity < 1) return;
    addItem(item, 1);
    setAdded(item.id);
    setTimeout(() => setAdded(id => id === item.id ? null : id), 900);
  };

  return <CustomerShell title="Browse rentals" subtitle="Available items, pulled live from our current inventory.">
    {error && <div className="login-error">{error}</div>}

    <div className="shop-toolbar">
      <div className="admin-search shop-search">
        <span>⌕</span>
        <input placeholder="Search items…" value={search} onChange={e => setSearch(e.target.value)} />
      </div>
      <button type="button" className="secondary-button shop-filter-toggle" onClick={() => setFilterOpen(true)}>Filter{category && ` · ${category}`}</button>
    </div>

    <div className="shop-catalog-layout">
      <FilterSidebar categories={categories} selected={category} onSelect={c => { setCategory(c); setFilterOpen(false); }} open={filterOpen} onClose={() => setFilterOpen(false)} />

      {loading ? <div className="admin-card inventory-empty">Loading items…</div> :
        filtered.length === 0 ? <div className="admin-card inventory-empty"><h3>No items found</h3><p>{search || category ? "Try adjusting your search or filters." : "Please check back soon."}</p></div> :
        <div className="shop-item-grid">
          {filtered.map(item => {
            const out = item.available_quantity < 1;
            return <article className={`shop-item-card ${out ? "is-unavailable" : ""}`} onClick={() => navigate(`/shop/${item.id}`)} key={item.id}>
              <div className="shop-item-card-image">
                {item.image_url ? <img src={item.image_url} alt={item.name} /> : <div className="inventory-card-noimage">🌸</div>}
                {out && <span className="shop-item-out-badge">Unavailable</span>}
              </div>
              <div className="shop-item-card-body">
                <small>{item.category}</small>
                <h3>{item.name}</h3>
                <div className="shop-item-card-meta">
                  <strong>{peso(Number(item.daily_price))}<span>/day</span></strong>
                  <small className={out ? "shop-qty-zero" : ""}>{out ? "Unavailable" : `Available: ${item.available_quantity}`}</small>
                </div>
                <button type="button" className="primary-button shop-add-btn" disabled={out} onClick={e => quickAdd(e, item)}>{added === item.id ? "Added ✓" : "Add to Cart"}</button>
              </div>
            </article>;
          })}
        </div>}
    </div>
  </CustomerShell>;
}
