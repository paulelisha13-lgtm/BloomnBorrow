import { test } from "node:test";
import assert from "node:assert/strict";
import { allocateVerifiedGcashPayment } from "../lib/gcashPayment.js";

test("verified GCash money settles rental charges before the deposit", () => {
  assert.deepEqual(allocateVerifiedGcashPayment({
    verifiedAmount: 5000,
    rentalDue: 4000,
    depositDue: 2000,
    rentalPaid: 0,
    depositPaid: 0
  }), {rental:4000,deposit:1000,outstandingBefore:6000,outstandingAfter:1000});
});

test("GCash allocation respects payments that were already recorded", () => {
  assert.deepEqual(allocateVerifiedGcashPayment({
    verifiedAmount: 2000.25,
    rentalDue: 4000.25,
    depositDue: 1500,
    rentalPaid: 3000,
    depositPaid: 500
  }), {rental:1000.25,deposit:1000,outstandingBefore:2000.25,outstandingAfter:0});
});

test("GCash allocation refuses an overpayment", () => {
  assert.throws(() => allocateVerifiedGcashPayment({
    verifiedAmount: 1000.01,
    rentalDue: 1000,
    depositDue: 0,
    rentalPaid: 0,
    depositPaid: 0
  }), /exceeds the remaining balance/);
});
