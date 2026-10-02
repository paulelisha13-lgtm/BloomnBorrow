// End-to-end API checks against a running server and its database.
// Skipped unless an admin login is provided:
//   BB_TEST_ADMIN_EMAIL=you@example.com BB_TEST_ADMIN_PASSWORD=... npm run test:api
// Optional: BB_TEST_API_URL (default http://localhost:4000/api).
// Everything it creates (a staff account, a customer, bookings, payments) uses
// e2e-*@example.com emails and is deleted again at the end.
import { test, after } from "node:test";
import assert from "node:assert/strict";

const API = process.env.BB_TEST_API_URL || "http://localhost:4000/api";
const adminEmail = process.env.BB_TEST_ADMIN_EMAIL;
const adminPassword = process.env.BB_TEST_ADMIN_PASSWORD;
const skip = !adminEmail || !adminPassword ? "set BB_TEST_ADMIN_EMAIL and BB_TEST_ADMIN_PASSWORD to run" : false;

function client() {
  const jar = {};
  return async (path, { method = "GET", body } = {}) => {
    const headers = { "Content-Type": "application/json" };
    const cookie = Object.entries(jar).map(([k, v]) => `${k}=${v}`).join("; ");
    if (cookie) headers.Cookie = cookie;
    if (jar.bloom_borrow_staff_csrf && method !== "GET") headers["X-CSRF-Token"] = decodeURIComponent(jar.bloom_borrow_staff_csrf);
    const res = await fetch(API + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
    for (const c of res.headers.getSetCookie?.() || []) {
      const [kv] = c.split(";");
      const i = kv.indexOf("=");
      jar[kv.slice(0, i)] = kv.slice(i + 1);
    }
    return { status: res.status, data: await res.json().catch(() => ({})) };
  };
}

const stamp = Date.now();
const staffEmail = `e2e-staff-${stamp}@example.com`;
const staffPassword = `Staff-${stamp}-Test#Aa1`;
const customerEmail = `e2e-customer-${stamp}@example.com`;
const admin = client();
const staff = client();
const created = { bookings: [], staffId: null };

async function newBooking(start, end, extra = {}) {
  const r = await admin("/admin/bookings", { method: "POST", body: {
    full_name: "E2E Customer", email: customerEmail, phone: "09170000000", fulfillment: "pickup",
    start_date: start, end_date: end, items: [{ item_id: extra.itemId || 1, quantity: extra.quantity || 1, delivery_fee_per_piece: 0 }],
    ...(created.customerId ? { customer_id: created.customerId } : {})
  } });
  assert.equal(r.status, 201, r.data.message);
  created.bookings.push(r.data.booking.id);
  created.customerId = r.data.booking.customer_id;
  return r.data.booking;
}

after(async () => {
  if (skip) return;
  const { db } = await import("../lib/db.js");
  for (const id of created.bookings) {
    await db.query("DELETE FROM payments WHERE booking_id=?", [id]);
    await db.query("DELETE FROM bookings WHERE id=?", [id]);
  }
  await db.query("DELETE FROM customers WHERE email=?", [customerEmail]);
  await db.query("DELETE FROM users WHERE email=?", [staffEmail]);
  await db.end();
});

test("API workflow and permissions", { skip }, async (t) => {
  await t.test("admin signs in and creates a staff account", async () => {
    assert.equal((await admin("/auth/login", { method: "POST", body: { email: adminEmail, password: adminPassword } })).status, 200);
    const r = await admin("/users", { method: "POST", body: { full_name: "E2E Staff", email: staffEmail, role: "staff", password: staffPassword } });
    assert.equal(r.status, 201, r.data.message);
  });

  await t.test("late return: fee per late day, deposit refund keeps booking paid", async () => {
    const b = await newBooking("2026-01-05", "2026-01-06");
    for (const status of ["confirmed", "ready", "rented"]) {
      assert.equal((await admin(`/admin/bookings/${b.id}/status`, { method: "PATCH", body: { status } })).status, 200);
    }
    const { late_fee_per_day } = (await admin("/admin/settings")).data.settings;
    const inspection = await admin(`/admin/bookings/${b.id}/return-inspection`, { method: "POST", body: { condition_after: "Good", damage_charge: 0 } });
    assert.equal(inspection.status, 200, inspection.data.message);
    assert.ok(inspection.data.late_days > 0, "a booking that ended in January is late");
    assert.equal(inspection.data.late_fee, inspection.data.late_days * Number(late_fee_per_day));

    await admin(`/admin/bookings/${b.id}/payments`, { method: "POST", body: { amount: b.grand_total, method: "cash" } });
    assert.equal((await admin(`/admin/bookings/${b.id}/complete`, { method: "POST", body: {} })).status, 200);
    const done = (await admin(`/admin/bookings/${b.id}`)).data.booking;
    assert.equal(done.status, "completed");
    assert.equal(done.payment_status, "paid");
  });

  await t.test("reschedule keeps an unpaid booking unpaid", async () => {
    const b = await newBooking("2026-12-01", "2026-12-02");
    assert.equal((await admin(`/admin/bookings/${b.id}/reschedule`, { method: "PATCH", body: { start_date: "2026-12-02", end_date: "2026-12-03" } })).status, 200);
    assert.equal((await admin(`/admin/bookings/${b.id}`)).data.booking.payment_status, "unpaid");
  });

  await t.test("payments are voided with a reason, never deleted", async () => {
    const b = await newBooking("2026-12-10", "2026-12-11");
    const p = (await admin(`/admin/bookings/${b.id}/payments`, { method: "POST", body: { amount: 100, method: "cash" } })).data;
    assert.equal((await admin(`/admin/bookings/${b.id}`, { method: "DELETE" })).status, 409, "booking with payments cannot be deleted");
    assert.equal((await admin(`/admin/payments/${p.id}`, { method: "DELETE" })).status, 404, "no payment delete endpoint");
    assert.equal((await admin(`/admin/payments/${p.id}/void`, { method: "PATCH", body: {} })).status, 400, "reason required");
    assert.equal((await admin(`/admin/payments/${p.id}/void`, { method: "PATCH", body: { reason: "E2E test" } })).status, 200);
    assert.equal((await admin(`/admin/payments/${p.id}/void`, { method: "PATCH", body: { reason: "again" } })).status, 409, "cannot void twice");
    const after = (await admin(`/admin/bookings/${b.id}`)).data.booking;
    assert.equal(after.payments.find(x => x.id === p.id).status, "void");
    assert.equal(after.payment_status, "unpaid");
    assert.equal((await admin("/admin/customers", { method: "DELETE" })).status, 404, "no delete-all-customers endpoint");
  });

  await t.test("staff can do day-to-day work", async () => {
    assert.equal((await staff("/auth/login", { method: "POST", body: { email: staffEmail, password: staffPassword } })).status, 200);
    for (const path of ["/admin/dashboard", "/admin/inventory", "/admin/bookings", "/admin/customers", "/admin/payments", "/admin/calendar?from=2026-12-01&to=2026-12-31", "/admin/maintenance"]) {
      assert.equal((await staff(path)).status, 200, path);
    }
    assert.equal((await staff("/admin/calendar")).status, 400, "calendar needs a from/to range");
    const b = await newBooking("2026-12-20", "2026-12-21");
    assert.equal((await staff(`/admin/bookings/${b.id}/status`, { method: "PATCH", body: { status: "confirmed" } })).status, 200);
    assert.equal((await staff(`/admin/bookings/${b.id}/payments`, { method: "POST", body: { amount: 50, method: "gcash" } })).status, 201);

    // Staff keep the calendar up to date, but deleting stays admin-only.
    const entry = await staff("/admin/calendar", { method: "POST", body: { title: "E2E reservation", entry_date: "2026-12-20", entry_type: "reservation" } });
    assert.equal(entry.status, 201, entry.data.message);
    const entryId = entry.data.id;
    assert.equal((await staff(`/admin/calendar/${entryId}`, { method: "PATCH", body: { title: "E2E reservation", entry_date: "2026-12-20", status: "cancelled" } })).status, 200);
    assert.equal((await staff(`/admin/calendar/${entryId}`, { method: "DELETE" })).status, 403, "staff cannot delete");
    assert.equal((await admin(`/admin/calendar/${entryId}`, { method: "DELETE" })).status, 200);
  });

  await t.test("staff cannot do admin-only actions", async () => {
    const item = { sku: "X", name: "X", category: "X", daily_price: 1, security_deposit: 1, total_quantity: 1 };
    const blocked = [
      ["PATCH", "/admin/payments/1/void", { reason: "x" }], ["DELETE", "/admin/bookings/1"], ["POST", "/admin/inventory", item],
      ["PATCH", "/admin/inventory/1", item], ["DELETE", "/admin/inventory/1"], ["DELETE", "/admin/customers/1"],
      ["DELETE", "/admin/calendar/1"], ["GET", "/admin/reports"], ["GET", "/admin/settings"], ["PUT", "/admin/settings", { delivery_fee: 1 }],
      ["GET", "/users"], ["GET", "/access/audit"]
    ];
    for (const [method, path, body] of blocked) {
      assert.equal((await staff(path, { method, body })).status, 403, `${method} ${path}`);
    }
  });

  await t.test("customer deletion removes identifiers but preserves booking history", async () => {
    const bookingId = created.bookings[0];
    const deleted = await admin(`/admin/customers/${created.customerId}`, { method: "DELETE" });
    assert.equal(deleted.status, 200, deleted.data.message);
    const retained = await admin(`/admin/bookings/${bookingId}`);
    assert.equal(retained.status, 200, retained.data.message);
    assert.equal(retained.data.booking.customer_id, null);
    assert.equal(retained.data.booking.customer_name, "Deleted customer");
    assert.equal(retained.data.booking.customer_email, `deleted-${bookingId}@invalid.local`);
    assert.equal(retained.data.booking.customer_phone, "");
    assert.equal(retained.data.booking.delivery_address, null);
    assert.equal(retained.data.booking.id_document_path, null);
    assert.ok(retained.data.booking.payments.length > 0, "payment history is retained");
  });

  await t.test("customer-facing endpoints are gone", async () => {
    for (const [method, path] of [["GET", "/rentals"], ["POST", "/bookings/guest"], ["GET", "/bookings/track"], ["GET", "/settings/public"]]) {
      assert.equal((await client()(path, { method, body: method === "POST" ? {} : undefined })).status, 404, path);
    }
  });
});
