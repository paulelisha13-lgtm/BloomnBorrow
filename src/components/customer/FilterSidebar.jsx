import React from "react";

// Floating, secondary to the item grid -- not a full-width section. On
// mobile it becomes a slide-over drawer, toggled by the caller via `open`.
export function FilterSidebar({ categories, selected, onSelect, open, onClose }) {
  return <>
    {open && <div className="shop-filter-backdrop" onClick={onClose} />}
    <aside className={`shop-filter-panel ${open ? "is-open" : ""}`}>
      <div className="shop-filter-head">
        <strong>Categories</strong>
        <button type="button" className="shop-filter-close" onClick={onClose} aria-label="Close filters">×</button>
      </div>
      <div className="shop-filter-options">
        <label className={`shop-filter-option ${!selected ? "active" : ""}`}>
          <input className="sr-only" type="radio" name="category" checked={!selected} onChange={() => onSelect("")} />
          All
        </label>
        {categories.map(cat => <label className={`shop-filter-option ${selected === cat ? "active" : ""}`} key={cat}>
          <input className="sr-only" type="radio" name="category" checked={selected === cat} onChange={() => onSelect(cat)} />
          {cat}
        </label>)}
      </div>
      {selected && <button type="button" className="secondary-button full" onClick={() => onSelect("")}>Clear Filters</button>}
    </aside>
  </>;
}
