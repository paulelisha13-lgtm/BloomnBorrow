import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DURATION_DISCOUNT_MIN_DAYS, daysUntilDurationDiscount, durationDiscountPerDay, durationRuleOf, priceRentalLine
} from "../lib/pricing.js";

const percent10 = { type: "percent", value: 10 };
const fixed50 = { type: "fixed", value: 50 };

test("the discount starts at exactly 3 days; 1-2 days charge the regular rate", () => {
  assert.equal(DURATION_DISCOUNT_MIN_DAYS, 3);
  for (const days of [1, 2]) {
    const line = priceRentalLine({ dailyPrice: 500, rule: percent10, days, quantity: 2 });
    assert.equal(line.qualifies, false, `${days} day(s)`);
    assert.equal(line.rental, 500 * 2 * days);
    assert.equal(line.discountTotal, 0);
  }
  const three = priceRentalLine({ dailyPrice: 500, rule: percent10, days: 3, quantity: 2 });
  assert.equal(three.qualifies, true);
  assert.equal(three.effectiveRate, 450);
  assert.equal(three.rental, 450 * 2 * 3);
  assert.equal(three.regularRental, 3000);
  assert.equal(three.discountTotal, 300);
});

test("a fixed discount is pesos off each day, per piece", () => {
  const line = priceRentalLine({ dailyPrice: 500, rule: fixed50, days: 4, quantity: 3 });
  assert.equal(line.discountPerDay, 50);
  assert.equal(line.effectiveRate, 450);
  assert.equal(line.rental, 450 * 3 * 4);
});

test("the discounted rate never goes below zero", () => {
  assert.equal(durationDiscountPerDay(40, { type: "fixed", value: 500 }, 5), 40, "fixed capped at the day rate");
  assert.equal(priceRentalLine({ dailyPrice: 40, rule: { type: "fixed", value: 500 }, days: 5, quantity: 1 }).effectiveRate, 0);
  assert.equal(durationDiscountPerDay(0, percent10, 5), 0);
});

test("percent discounts round to centavos, not fractions of a centavo", () => {
  const line = priceRentalLine({ dailyPrice: 333, rule: { type: "percent", value: 15 }, days: 3, quantity: 1 });
  assert.equal(line.discountPerDay, 49.95);
  assert.equal(line.effectiveRate, 283.05);
  assert.equal(line.rental, 849.15);
});

test("no rule, or an invalid one, means no discount", () => {
  assert.equal(priceRentalLine({ dailyPrice: 500, rule: null, days: 9, quantity: 1 }).rental, 4500);
  for (const item of [
    null, {}, { duration_discount_enabled: 0, duration_discount_type: "percent", duration_discount_value: 10 },
    { duration_discount_enabled: 1, duration_discount_type: "percent", duration_discount_value: 0 },
    { duration_discount_enabled: 1, duration_discount_type: "percent", duration_discount_value: -5 },
    { duration_discount_enabled: 1, duration_discount_type: "percent", duration_discount_value: 95 },
    { duration_discount_enabled: 1, duration_discount_type: "bogus", duration_discount_value: 10 },
    { duration_discount_enabled: 1, duration_discount_type: "fixed", duration_discount_value: "abc" }
  ]) assert.equal(durationRuleOf(item), null, JSON.stringify(item));
});

test("durationRuleOf reads both the DB columns and the public catalog shape", () => {
  assert.deepEqual(durationRuleOf({ duration_discount_enabled: 1, duration_discount_type: "percent", duration_discount_value: "10.00" }), { type: "percent", value: 10 });
  assert.deepEqual(durationRuleOf({ duration_discount_enabled: true, duration_discount_type: "fixed", duration_discount_value: 25 }), { type: "fixed", value: 25 });
  assert.deepEqual(durationRuleOf({ duration_discount: { type: "percent", value: 12, min_days: 3 } }), { type: "percent", value: 12 });
});

test("the Save promo (original_price) is never part of the calculation", () => {
  // Same current price and rule; wildly different compare-at prices -> identical charge.
  const base = { dailyPrice: 500, rule: percent10, days: 3, quantity: 1 };
  const withPromo = priceRentalLine({ ...base, originalPrice: 900 });
  assert.deepEqual(withPromo, priceRentalLine(base));
  assert.equal(withPromo.effectiveRate, 450, "10% of the current 500, not of the 900 compare-at price");
});

test("changing the rental length re-evaluates the discount (reschedule)", () => {
  const rental = days => priceRentalLine({ dailyPrice: 500, rule: percent10, days, quantity: 1 }).rental;
  assert.equal(rental(2), 1000);
  assert.equal(rental(3), 1350);
  assert.equal(rental(2), 1000, "shortening again drops it");
});

test("bad day counts are treated as one day", () => {
  for (const days of [0, -3, NaN, undefined, null]) assert.equal(priceRentalLine({ dailyPrice: 100, rule: percent10, days, quantity: 1 }).days, 1);
});

test("daysUntilDurationDiscount tells the customer how far away the discount is", () => {
  assert.equal(daysUntilDurationDiscount(1), 2);
  assert.equal(daysUntilDurationDiscount(2), 1);
  assert.equal(daysUntilDurationDiscount(3), 0);
  assert.equal(daysUntilDurationDiscount(10), 0);
});
