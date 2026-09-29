import { test } from "node:test";
import assert from "node:assert/strict";
import { schemas } from "../lib/validate.js";

const booking = {
  full_name: "Juan Dela Cruz", email: "juan@example.com", phone: "09170000000", fulfillment: "pickup",
  start_date: "2026-11-10", end_date: "2026-11-12", items: [{ item_id: 1, quantity: 2, delivery_fee_per_piece: 0 }]
};

test("a complete admin booking is accepted", () => {
  assert.equal(schemas.adminBooking.safeParse(booking).success, true);
});

test("a booking cannot end before it starts or last over a year", () => {
  assert.equal(schemas.adminBooking.safeParse({ ...booking, end_date: "2026-11-09" }).success, false);
  assert.equal(schemas.adminBooking.safeParse({ ...booking, end_date: "2027-12-31" }).success, false);
});

test("a new customer needs a name, phone and valid email", () => {
  assert.equal(schemas.adminBooking.safeParse({ ...booking, email: "not-an-email" }).success, false);
  assert.equal(schemas.adminBooking.safeParse({ ...booking, full_name: "" }).success, false);
});

test("an existing customer can be booked by id alone", () => {
  const r = schemas.adminBooking.safeParse({ ...booking, customer_id: 5, full_name: "", email: "", phone: "" });
  assert.equal(r.success, true);
});

test("staff accounts can be created with the admin or staff role only", () => {
  const user = { full_name: "Ana", email: "ana@example.com", password: "Str0ng-Passw0rd!x" };
  assert.equal(schemas.createUser.safeParse({ ...user, role: "staff" }).success, true);
  assert.equal(schemas.createUser.safeParse({ ...user, role: "admin" }).success, true);
  assert.equal(schemas.createUser.safeParse({ ...user, role: "driver" }).success, false);
});

test("weak or predictable passwords are rejected", () => {
  const user = { full_name: "Ana", email: "ana@example.com", role: "staff" };
  assert.equal(schemas.createUser.safeParse({ ...user, password: "short1!A" }).success, false);
  assert.equal(schemas.createUser.safeParse({ ...user, password: "Password1234567!" }).success, false);
});

test("payments must be positive", () => {
  assert.equal(schemas.recordPayment.safeParse({ amount: 0 }).success, false);
  assert.equal(schemas.recordPayment.safeParse({ amount: 100 }).success, true);
});
