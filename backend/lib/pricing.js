// Rental pricing rules. This file is pure (no imports) and is copied verbatim to
// src/lib/pricing.js for the browser; tests/pricing-parity.test.js fails if the
// two ever differ, so the estimate a customer sees is the amount the server charges.
//
// Two separate price reductions can exist on an item:
//   1. The "Save" promo (rental_items.original_price). It is display-only: the
//      discounted price already IS daily_price, and original_price is just the
//      struck-through reference. It is never an input to any calculation here.
//   2. The rental duration discount (this file). Renting for DURATION_DISCOUNT_MIN_DAYS
//      or more takes a percentage / fixed amount off the per-day rate.
// The duration discount is always taken from daily_price (the current price,
// after any Save promo), and only once, so the two can both apply without ever
// compounding on the compare-at price. Renting 1-2 days charges daily_price.

export const DURATION_DISCOUNT_MIN_DAYS = 3;
export const DURATION_DISCOUNT_MAX_PERCENT = 90;

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const isOn = (v) => v === true || v === 1 || v === "1";

// Normalises a rule to { type, value } or null. Accepts the public catalog
// shape ({ duration_discount: { type, value } }) and the raw admin/DB columns
// (duration_discount_enabled/_type/_value). Anything disabled or invalid -- a
// zero/negative value, an unknown type, a percent above the cap -- is "no rule",
// so bad data can never produce a negative price.
export function durationRuleOf(item) {
  if (!item) return null;
  const nested = item.duration_discount && typeof item.duration_discount === "object" ? item.duration_discount : null;
  const enabled = nested ? true : isOn(item.duration_discount_enabled);
  if (!enabled) return null;
  const type = nested ? nested.type : item.duration_discount_type;
  const value = Number(nested ? nested.value : item.duration_discount_value);
  if (!Number.isFinite(value) || value <= 0) return null;
  if (type === "percent") return value <= DURATION_DISCOUNT_MAX_PERCENT ? { type, value } : null;
  if (type === "fixed") return { type, value };
  return null;
}

// Amount taken off ONE piece for ONE day. 0 below the minimum length. Never
// more than the day rate itself, so the discounted rate floors at 0.
export function durationDiscountPerDay(dailyPrice, rule, days) {
  if (!rule || !(Number(days) >= DURATION_DISCOUNT_MIN_DAYS)) return 0;
  const price = Math.max(0, Number(dailyPrice) || 0);
  const raw = rule.type === "percent" ? (price * rule.value) / 100 : rule.value;
  return round2(Math.min(price, Math.max(0, raw)));
}

// One booking line, priced. `rental` is what is charged; `regularRental` is
// what it would have been without the duration discount (for "you save" text).
export function priceRentalLine({ dailyPrice, rule, days, quantity }) {
  const rate = Math.max(0, Number(dailyPrice) || 0);
  const qty = Math.max(0, Number(quantity) || 0);
  const length = Math.max(1, Math.floor(Number(days)) || 1);
  const discountPerDay = durationDiscountPerDay(rate, rule, length);
  const effectiveRate = round2(rate - discountPerDay);
  const regularRental = round2(rate * qty * length);
  const rental = round2(effectiveRate * qty * length);
  return {
    dailyPrice: rate,
    discountPerDay,
    effectiveRate,
    days: length,
    quantity: qty,
    regularRental,
    rental,
    discountTotal: round2(regularRental - rental),
    qualifies: discountPerDay > 0
  };
}

// How many more days until the discount starts (0 when it already applies).
export function daysUntilDurationDiscount(days) {
  return Math.max(0, DURATION_DISCOUNT_MIN_DAYS - (Math.floor(Number(days)) || 1));
}
