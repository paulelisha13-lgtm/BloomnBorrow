import { test } from "node:test";
import assert from "node:assert/strict";
import { paymentStatusFor } from "../lib/paymentStatus.js";

test("nothing paid is unpaid (never 'refunded')", () => {
  // Regression: an unpaid booking used to show "refunded" after a reschedule or void.
  assert.equal(paymentStatusFor({ paid: 0, refunded: 0, total: 5000 }), "unpaid");
});

test("part of the total is partial, all of it is paid", () => {
  assert.equal(paymentStatusFor({ paid: 2000, total: 5000 }), "partial");
  assert.equal(paymentStatusFor({ paid: 5000, total: 5000 }), "paid");
  assert.equal(paymentStatusFor({ paid: 5500, total: 5000 }), "paid");
});

test("a deposit refund at completion keeps a fully paid booking 'paid'", () => {
  // Regression: this used to drop to "partial".
  assert.equal(paymentStatusFor({ paid: 5000, refunded: 1500, total: 5000 }), "paid");
});

test("refunding everything that was paid is 'refunded'", () => {
  assert.equal(paymentStatusFor({ paid: 5000, refunded: 5000, total: 5000 }), "refunded");
});

test("database strings are handled like numbers", () => {
  assert.equal(paymentStatusFor({ paid: "5000.00", refunded: "0.00", total: "5000.00" }), "paid");
});
