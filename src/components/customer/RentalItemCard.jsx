import React from "react";
import { PriceDisplay } from "../PriceDisplay";

// A rental package/bundle is an item that publishes what it contains. The
// API returns `bundle_items` as [{ name, quantity }]; older rows (or ones the
// shop hasn't filled in yet) simply return [] and render as normal items.
export function packageContents(item) {
  const raw = item?.bundle_items;
  if (!Array.isArray(raw)) return [];
  return raw
    .map(entry => ({
      name: String(entry?.name ?? "").trim(),
      quantity: Math.max(1, Number(entry?.quantity) || 1)
    }))
    .filter(entry => entry.name);
}

// Packages get their own visual treatment (solid badge, tinted border, item
// count) so a customer can tell them apart from single rental items at a
// glance. The category check is a fallback for catalog rows that are already
// labelled as packages but don't list contents yet.
export function isPackageItem(item) {
  if (packageContents(item).length > 0) return true;
  return /package|bundle/i.test(String(item?.category || ""));
}

export function packageLabel(item) {
  const count = packageContents(item).length;
  return count ? `Package · ${count} item${count === 1 ? "" : "s"}` : "Package";
}

// The single catalog card, shared by Browse, Home and the related-items row
// in the details panel. Deliberately compact: image, name, price, stock and
// one action. Everything else (description, specifications, package contents)
// lives behind the details panel -- "show only what users need to decide".
export function RentalItemCard({ item, onOpen, onAdd, added, selected }) {
  const isPackage = isPackageItem(item);
  const out = Number(item.available_quantity) < 1;
  const open = () => onOpen?.(item);

  const classes = [
    "shop-item-card",
    out && "is-unavailable",
    isPackage && "is-package",
    selected && "is-selected"
  ].filter(Boolean).join(" ");

  return (
    <article className={classes} onClick={open}>
      <div className={`shop-item-card-image ${out ? "has-out" : ""}`}>
        {item.image_url
          ? <img src={item.image_url} alt={item.name} loading="lazy" />
          : <div className="inventory-card-noimage" aria-hidden="true">🌸</div>}
        <small className={`shop-item-card-cat ${isPackage ? "is-package" : ""}`}>
          {isPackage ? packageLabel(item) : item.category}
        </small>
        {out
          ? <span className="shop-item-out-badge">Unavailable</span>
          : <span className="shop-item-view-hint" aria-hidden="true">View details ›</span>}
      </div>

      <div className="shop-item-card-body">
        <h3 className="shop-item-card-title">
          <button type="button" className="shop-item-card-link" onClick={e => { e.stopPropagation(); open(); }}>
            {item.name}
          </button>
        </h3>

        <PriceDisplay price={item.daily_price} originalPrice={item.original_price} />

        <div className="shop-item-card-foot">
          <span className={out ? "shop-item-stock is-out" : "shop-item-stock"}>
            {out ? "Unavailable" : `Available: ${item.available_quantity}`}
          </span>
          <button
            type="button"
            className={`primary-button shop-add-btn ${added ? "is-added" : ""}`}
            disabled={out}
            onClick={e => { e.stopPropagation(); onAdd?.(item); }}
            data-no-page-loading
          >
            {added ? "Added ✓" : "Add to Cart"}
          </button>
        </div>
      </div>
    </article>
  );
}
