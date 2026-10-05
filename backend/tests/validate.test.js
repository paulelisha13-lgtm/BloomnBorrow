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

test("staff accounts can be created with the admin, manager or staff role only", () => {
  const user = { full_name: "Ana", email: "ana@example.com", password: "Str0ng-Passw0rd!x" };
  assert.equal(schemas.createUser.safeParse({ ...user, role: "staff" }).success, true);
  assert.equal(schemas.createUser.safeParse({ ...user, role: "admin" }).success, true);
  assert.equal(schemas.createUser.safeParse({ ...user, role: "manager" }).success, true);
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

test("GCash proof approval needs an amount and reference while rejection needs a reason", () => {
  assert.equal(schemas.gcashProofReview.safeParse({action:"approve",verified_amount:1000,gcash_reference:"123456789"}).success, true);
  assert.equal(schemas.gcashProofReview.safeParse({action:"approve",verified_amount:1000,gcash_reference:""}).success, false);
  assert.equal(schemas.gcashProofReview.safeParse({action:"reject",review_note:"Screenshot is unreadable."}).success, true);
  assert.equal(schemas.gcashProofReview.safeParse({action:"reject",review_note:""}).success, false);
});

const calendar = { title: "Wedding set reservation", entry_date: "2026-12-05", entry_type: "reservation" };

test("a calendar entry needs a title, a valid date and a known type", () => {
  assert.equal(schemas.calendarEntry.safeParse(calendar).success, true);
  assert.equal(schemas.calendarEntry.safeParse({ ...calendar, title: "" }).success, false);
  assert.equal(schemas.calendarEntry.safeParse({ ...calendar, entry_date: "05-12-2026" }).success, false);
  assert.equal(schemas.calendarEntry.safeParse({ ...calendar, entry_type: "task" }).success, false);
  assert.equal(schemas.calendarEntry.safeParse({ ...calendar, status: "archived" }).success, false);
});

test("a calendar entry cannot end before it starts", () => {
  assert.equal(schemas.calendarEntry.safeParse({ ...calendar, start_time: "14:00", end_time: "09:00" }).success, false);
  assert.equal(schemas.calendarEntry.safeParse({ ...calendar, start_time: "09:00", end_time: "14:00" }).success, true);
  assert.equal(schemas.calendarEntry.safeParse({ ...calendar, start_time: "9:00" }).success, false, "24h time only");
});

test("a blank calendar time or reminder becomes null, not an empty string", () => {
  const r = schemas.calendarEntry.safeParse({ ...calendar, start_time: "", end_time: "", reminder_at: "" });
  assert.equal(r.success, true);
  assert.equal(r.data.start_time, null);
  assert.equal(r.data.end_time, null);
  assert.equal(r.data.reminder_at, null);
});

test("a calendar email is optional but must be valid when given", () => {
  assert.equal(schemas.calendarEntry.safeParse({ ...calendar, customer_email: "" }).success, true);
  assert.equal(schemas.calendarEntry.safeParse({ ...calendar, customer_email: "not-an-email" }).success, false);
  assert.equal(schemas.calendarEntry.safeParse({ ...calendar, customer_email: "Party@Example.com" }).data.customer_email, "party@example.com");
});

const inventoryItem = { sku: "RF-CAM-001", name: "Camera", category: "Camera", daily_price: 2200, security_deposit: 3000, total_quantity: 2 };

test("an item's compare-at original price is optional and display-only", () => {
  const without = schemas.inventoryItem.safeParse(inventoryItem);
  assert.equal(without.success, true);
  assert.equal(without.data.original_price, null, "absent means no discount, stored as null");
  const cleared = schemas.inventoryItem.safeParse({ ...inventoryItem, original_price: "" });
  assert.equal(cleared.success, true, "cleared field from the admin form is valid");
  assert.equal(cleared.data.original_price, null, "cleared field becomes null, not 0");
  const discounted = schemas.inventoryItem.safeParse({ ...inventoryItem, original_price: "2400" });
  assert.equal(discounted.success, true);
  assert.equal(discounted.data.original_price, 2400, "decimal strings are coerced");
});

test("an original price must be a non-negative number", () => {
  assert.equal(schemas.inventoryItem.safeParse({ ...inventoryItem, original_price: -5 }).success, false);
  assert.equal(schemas.inventoryItem.safeParse({ ...inventoryItem, original_price: "lots" }).success, false);
});

test("an item with no package contents stays a plain item", () => {
  for (const missing of [undefined, "", null, [], "{}", "not json"]) {
    const r = schemas.inventoryItem.safeParse({ ...inventoryItem, bundle_items: missing });
    assert.equal(r.success, true, `${JSON.stringify(missing)} is accepted`);
    assert.deepEqual(r.data.bundle_items, [], `${JSON.stringify(missing)} reads as no contents`);
  }
});

test("package contents round-trip with quantities coerced to numbers", () => {
  const fromForm = schemas.inventoryItem.safeParse({
    ...inventoryItem,
    bundle_items: [{ name: " Folding table ", quantity: "1" }, { name: "Folding chair", quantity: 4 }]
  });
  assert.equal(fromForm.success, true);
  assert.deepEqual(fromForm.data.bundle_items, [
    { name: "Folding table", quantity: 1 },
    { name: "Folding chair", quantity: 4 }
  ]);

  const fromDb = schemas.inventoryItem.safeParse({
    ...inventoryItem,
    bundle_items: JSON.stringify([{ name: "HD projector", quantity: 1 }])
  });
  assert.equal(fromDb.success, true);
  assert.deepEqual(fromDb.data.bundle_items, [{ name: "HD projector", quantity: 1 }]);
});

test("package contents need a name and a whole quantity of at least one", () => {
  assert.equal(schemas.inventoryItem.safeParse({ ...inventoryItem, bundle_items: [{ name: "", quantity: 1 }] }).success, false);
  assert.equal(schemas.inventoryItem.safeParse({ ...inventoryItem, bundle_items: [{ name: "Chair", quantity: 0 }] }).success, false);
  assert.equal(schemas.inventoryItem.safeParse({ ...inventoryItem, bundle_items: [{ name: "Chair", quantity: 1.5 }] }).success, false);
  assert.equal(
    schemas.inventoryItem.safeParse({
      ...inventoryItem,
      bundle_items: Array.from({ length: 51 }, (_, i) => ({ name: `piece-${i}`, quantity: 1 }))
    }).success,
    false
  );
});
