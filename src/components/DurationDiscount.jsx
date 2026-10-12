import React from "react";
import { pesoExact } from "../lib/format";
import { DURATION_DISCOUNT_MIN_DAYS, durationDiscountPerDay, durationRuleOf } from "../lib/pricing";

// Customer-facing display of an item's rental duration discount. It is its own
// pricing rule, separate from the "Save" promo (PriceDisplay): the discount is
// taken off the current daily price once the rental reaches the minimum length.
// Every component takes anything durationRuleOf() understands (a catalog item,
// a cart line, or an admin inventory row) and renders nothing when there is no rule.

const trim = n => String(Number(n.toFixed(2)));
const ruleText = rule => rule.type === "percent" ? `${trim(rule.value)}% off` : `${pesoExact(rule.value)} off per day`;

// "3+ days: 10% off" -- the small pill used on cards and in the cart.
export function DurationChip({ item }) {
  const rule = durationRuleOf(item);
  if (!rule) return null;
  return <span className="duration-chip" title={`Rent for ${DURATION_DISCOUNT_MIN_DAYS} days or more and pay less per day`}>
    {DURATION_DISCOUNT_MIN_DAYS}+ days: {ruleText(rule)}
  </span>;
}

// The two-row price table on the item details page: the regular rate for short
// rentals, and the lower rate (with what it saves) once the rental qualifies.
export function DurationTiers({ item }) {
  const rule = durationRuleOf(item);
  if (!rule) return null;
  const price = Number(item.daily_price);
  const off = durationDiscountPerDay(price, rule, DURATION_DISCOUNT_MIN_DAYS);
  if (!(off > 0)) return null;
  return <div className="duration-tiers" aria-label="Rental duration pricing">
    <strong className="duration-tiers-title">Rental duration discount</strong>
    <div className="duration-tier">
      <span>1–{DURATION_DISCOUNT_MIN_DAYS - 1} days</span>
      <b>{pesoExact(price)}<small>/day</small></b>
    </div>
    <div className="duration-tier is-deal">
      <span>{DURATION_DISCOUNT_MIN_DAYS}+ days</span>
      <b>{pesoExact(price - off)}<small>/day</small> <s>{pesoExact(price)}</s> <em>{rule.type === "percent" ? `${trim(rule.value)}% off · ` : ""}save {pesoExact(off)}/day</em></b>
    </div>
  </div>;
}
