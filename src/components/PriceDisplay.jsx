import React from "react";
import { discountOf, peso } from "../lib/format";

// The daily-rate block shown wherever an item's price appears. Renders the
// current price exactly like the old markup, and when the item has a
// compare-at price that is actually higher (see discountOf) adds the
// struck-through original and the green "Save ₱X" pill from the design.
//
// size="detail" -> the large ItemDetail price row (.shop-detail-price)
// size="card"   -> compact grid-card price (.shop-item-card-price child)
export function PriceDisplay({ price, originalPrice, size = "card" }) {
  const discount = discountOf(price, originalPrice);
  const detail = size === "detail";

  if (detail) {
    return (
      <div className="shop-detail-price">
        <strong>{peso(Number(price))}</strong>
        <span>/day</span>
        {discount && (
          <span className="price-tag-sale">
            <s className="price-tag-original">{peso(discount.original)}</s>
            <span className="price-tag-save">Save {peso(discount.save)}</span>
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="price-tag price-tag-card">
      <strong>{peso(Number(price))}<span>/day</span></strong>
      {discount && (
        <span className="price-tag-sale">
          <s className="price-tag-original">{peso(discount.original)}</s>
          <span className="price-tag-save">Save {peso(discount.save)}</span>
        </span>
      )}
    </div>
  );
}
