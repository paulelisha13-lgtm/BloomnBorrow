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
  const [sort, setSort] = useState(() => readBrowseState().sort || "recommended");
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

  // Keep discovery controls while the customer opens an item and comes back.
  useEffect(() => {
    try { sessionStorage.setItem(STATE_KEY, JSON.stringify({ search, category, sort })); } catch { /* ignore */ }
  }, [search, category, sort]);

  // Categories come from the published inventory so filters never become stale.
  const categories = useMemo(() => [...new Set(items.map(x => x.category).filter(Boolean))].sort(), [items]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const matches = items.filter(item => {
      const matchCategory = !category || item.category === category;
      const matchSearch = !q || [item.name, item.category].some(value => String(value || "").toLowerCase().includes(q));
      return matchCategory && matchSearch;
    });

    if (sort === "price-low") return matches.sort((a, b) => Number(a.daily_price) - Number(b.daily_price));
    if (sort === "price-high") return matches.sort((a, b) => Number(b.daily_price) - Number(a.daily_price));
    return matches;
  }, [items, search, category, sort]);

  const openItem = item => {
    setSelected(item.id);
    navigate(`/shop/${item.id}`, { state: { backgroundLocation: location } });
  };

  const quickAdd = item => {
    if (item.available_quantity < 1) return;
    addItem(item, 1);
    setAdded(item.id);
    setTimeout(() => setAdded(id => id === item.id ? null : id), 1800);
  };

  const clearFilters = () => {
    setSearch("");
    setCategory("");
  };

  const addedItem = added ? items.find(item => item.id === added) : null;
  const headerExtras = <div className="shop-catalog-promises" aria-label="Rental benefits">
    <span>No account required</span>
    <span>Live availability</span>
    <span>Easy booking tracking</span>
  </div>;

  return <CustomerShell
    eyebrow="Rental collection"
    title="Find the right rental for your plans"
    subtitle="Explore equipment and ready-made packages for events, projects, and weekends away."
    pageHeaderExtras={headerExtras}
    mainClassName="shop-catalog-page"
  >
    {error && <div className="shop-inline-alert" role="alert"><div><strong>We couldn't load the catalog.</strong><span>{error}</span></div><button type="button" className="secondary-button" onClick={loadItems}>Try again</button></div>}

    <section className="shop-catalog-tools" aria-label="Find a rental">
      <div className="shop-catalog-search-row">
        <div className="admin-search shop-search">
          <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>
          <input type="search" aria-label="Search rental items" placeholder="Search equipment, packages, or categories" value={search} onChange={e => setSearch(e.target.value)} />
          {search && <button type="button" className="shop-search-clear" aria-label="Clear search" onClick={() => setSearch("")}>×</button>}
        </div>

        <label className="shop-sort-field">
          <span>Sort by</span>
          <select value={sort} onChange={e => setSort(e.target.value)}>
            <option value="recommended">Recommended</option>
            <option value="price-low">Price: low to high</option>
            <option value="price-high">Price: high to low</option>
          </select>
        </label>
      </div>

      <div className="shop-filter-row">
        <span className="shop-filter-label">Browse by category</span>
        <nav className="shop-category-nav" aria-label="Categories">
          <button type="button" className={`shop-chip ${!category ? "active" : ""}`} aria-pressed={!category} onClick={() => setCategory("")}>All rentals</button>
          {categories.map(cat => <button type="button" key={cat} className={`shop-chip ${category === cat ? "active" : ""}`} aria-pressed={category === cat} onClick={() => setCategory(cat)}>{cat}</button>)}
        </nav>
      </div>
    </section>

    {!loading && !error && <div className="shop-results-meta" role="status">
      <div><strong>{filtered.length} rental{filtered.length === 1 ? "" : "s"}</strong><span>{search || category ? " matching your filters" : " available to explore"}</span></div>
      {(search || category) && <button type="button" onClick={clearFilters}>Clear filters</button>}
    </div>}

    {loading ? <div className="shop-catalog-skeleton" role="status" aria-live="polite"><span className="sr-only">Loading rental items</span>{[0,1,2,3,4,5,6,7].map(x => <i key={x}/>)}</div> :
      error ? null : filtered.length === 0 ? <div className="admin-card inventory-empty shop-catalog-empty"><span aria-hidden="true">B&amp;B</span><h3>No rentals match your search</h3><p>{search || category ? "Try another keyword or clear your selected filters." : "Please check back soon for new rental items."}</p>{(search || category) && <button type="button" className="secondary-button" onClick={clearFilters}>Clear filters</button>}</div> :
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

    {addedItem && <div className="shop-add-toast" role="status" aria-live="polite"><span aria-hidden="true">✓</span><div><strong>Added to your cart</strong><small>{addedItem.name}</small></div></div>}
  </CustomerShell>;
}
