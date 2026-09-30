import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CustomerShell } from "../../components/customer/CustomerShell";
import { FilterSidebar } from "../../components/customer/FilterSidebar";
import { useCart } from "../../context/CartContext";
import { publicApi } from "../../lib/publicApi";
import { peso } from "../../lib/format";

export function CustomerCatalog() {
  const navigate = useNavigate();
  const { addItem } = useCart();
  const [items, setItems] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const [added, setAdded] = useState(null);

  useEffect(() => {
    publicApi("/public/items").then(d => setItems(d.items || [])).catch(e => setError(e.message)).finally(() => setLoading(false));
  }, []);

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
    addItem(item, 1);
    setAdded(item.id);
    setTimeout(() => setAdded(id => id === item.id ? null : id), 1200);
  };

  return <CustomerShell title="Browse rentals" subtitle="Available items, pulled live from our current inventory.">
    {error && <div className="login-error">{error}</div>}

    <div className="shop-toolbar">
      <div className="admin-search shop-search">
        <span>⌕</span>
        <input placeholder="Search items…" value={search} onChange={e => setSearch(e.target.value)} />
      </div>
      <button type="button" className="secondary-button shop-filter-toggle" onClick={() => setFilterOpen(true)}>Filters{category && ` · ${category}`}</button>
    </div>

    <div className="shop-catalog-layout">
      <FilterSidebar categories={categories} selected={category} onSelect={c => { setCategory(c); setFilterOpen(false); }} open={filterOpen} onClose={() => setFilterOpen(false)} />

      {loading ? <div className="admin-card inventory-empty">Loading items…</div> :
        filtered.length === 0 ? <div className="admin-card inventory-empty"><h3>No items found</h3><p>{search || category ? "Try adjusting your search or filters." : "Please check back soon."}</p></div> :
        <div className="shop-item-grid">
          {filtered.map(item => <article className="shop-item-card" onClick={() => navigate(`/shop/${item.id}`)} key={item.id}>
            <div className="shop-item-card-image">
              {item.image_url ? <img src={item.image_url} alt={item.name} /> : <div className="inventory-card-noimage">🌸</div>}
            </div>
            <div className="shop-item-card-body">
              <small>{item.category}</small>
              <h3>{item.name}</h3>
              <strong>{peso(Number(item.daily_price))}<span>/day</span></strong>
              <button type="button" className="primary-button full" onClick={e => quickAdd(e, item)}>{added === item.id ? "Added ✓" : "Add to Cart"}</button>
            </div>
          </article>)}
        </div>}
    </div>
  </CustomerShell>;
}
