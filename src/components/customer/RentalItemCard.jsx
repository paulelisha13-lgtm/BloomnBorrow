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

// The single catalog card, shared by Browse, Home and the related-items row.
// It surfaces the decision-making details while keeping full specifications
// and package contents in the details panel.
export function RentalItemCard({ item, onOpen, onAdd, added, selected }) {
  const isPackage = isPackageItem(item);
  const contents = packageContents(item);
  const out = Number(item.available_quantity) < 1;
  const open = () => onOpen?.(item);
  const summary = isPackage
    ? contents.length ? `Includes ${contents.length} curated item${contents.length === 1 ? "" : "s"}` : "Ready-made rental package"
    : `${item.category || "Equipment"} rental`;

  const classes = [
    "shop-item-card",
    out && "is-unavailable",
    isPackage && "is-package",
    selected && "is-selected"
  ].filter(Boolean).join(" ");

  return (
    <article className={classes}>
      <button type="button" className={`shop-item-card-image ${out ? "has-out" : ""}`} onClick={open} aria-label={`View details for ${item.name}`}>
        {item.image_url
          ? <img src={item.image_url} alt={item.name} loading="lazy" />
          : <div className="inventory-card-noimage" aria-hidden="true">🌸</div>}
        <small className={`shop-item-card-cat ${isPackage ? "is-package" : ""}`}>
          {isPackage ? packageLabel(item) : item.category}
        </small>
        {out && <span className="shop-item-out-badge">Currently unavailable</span>}
      </button>

      <div className="shop-item-card-body">
        <div className="shop-item-card-copy">
          <h3 className="shop-item-card-title">{item.name}</h3>
          <p>{summary}</p>
        </div>

        <PriceDisplay price={item.daily_price} originalPrice={item.original_price} />

        <div className="shop-item-card-foot">
          <span className={out ? "shop-item-stock is-out" : "shop-item-stock"}>
            {out ? "Currently unavailable" : `${item.available_quantity} available`}
          </span>
        </div>

        <div className="shop-item-card-actions">
          <button type="button" className="secondary-button shop-details-btn" onClick={open} data-no-page-loading>
            View details
          </button>
          <button
            type="button"
            className={`primary-button shop-add-btn ${added ? "is-added" : ""}`}
            disabled={out}
            aria-label={out?`${item.name} is unavailable`:`Add ${item.name} to cart`}
            onClick={() => onAdd?.(item)}
            data-no-page-loading
          >
            {added ? "Added ✓" : out ? "Unavailable" : "Add to cart"}
          </button>
        </div>
      </div>
    </article>
  );
}
