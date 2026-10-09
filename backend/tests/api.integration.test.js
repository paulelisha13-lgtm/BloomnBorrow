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
const manager = client();
const managerEmail = `e2e-manager-${stamp}@example.com`;
const managerPassword = `Manager-${stamp}-Test#Aa1`;
const created = { bookings: [], staffId: null, maintenanceIds: [] };

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
  const maintenanceIds = created.maintenanceIds.length ? created.maintenanceIds : [0];
  await db.query("DELETE FROM expenses WHERE description LIKE 'e2e-%' OR (source_type='maintenance' AND source_id IN (?))", [maintenanceIds]);
  await db.query("DELETE FROM expense_suggestion_dismissals WHERE source_type='maintenance' AND source_id IN (?)", [maintenanceIds]);
  if (created.maintenanceIds.length) await db.query("DELETE FROM maintenance_records WHERE id IN (?)", [created.maintenanceIds]);
  await db.query("DELETE FROM users WHERE email IN (?,?)", [staffEmail, managerEmail]);
  await db.end();
});

test("API workflow and permissions", { skip }, async (t) => {
  await t.test("admin signs in and creates a staff account", async () => {
    assert.equal((await admin("/auth/login", { method: "POST", body: { email: adminEmail, password: adminPassword } })).status, 200);
    const r = await admin("/users", { method: "POST", body: { full_name: "E2E Staff", email: staffEmail, role: "staff", password: staffPassword } });
    assert.equal(r.status, 201, r.data.message);
    const m = await admin("/users", { method: "POST", body: { full_name: "E2E Manager", email: managerEmail, role: "manager", password: managerPassword } });
    assert.equal(m.status, 201, m.data.message);
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

  await t.test("finance is admin/manager only, enforced by the API", async () => {
    assert.equal((await manager("/auth/login", { method: "POST", body: { email: managerEmail, password: managerPassword } })).status, 200);
    const expense = { expense_date: "2026-10-05", category: "Supplies", amount: 10, description: "e2e-blocked" };
    const blocked = [
      ["GET", "/admin/expenses"], ["POST", "/admin/expenses", expense], ["PATCH", "/admin/expenses/1", expense], ["DELETE", "/admin/expenses/1"],
      ["GET", "/admin/expenses/1/receipt"], ["GET", "/admin/expense-suggestions"],
      ["POST", "/admin/expense-suggestions/confirm", { source_type: "maintenance", source_id: 1 }],
      ["POST", "/admin/expense-suggestions/dismiss", { source_type: "maintenance", source_id: 1 }],
      ["GET", "/admin/finance/profit-loss"], ["GET", "/admin/finance/summary"]
    ];
    for (const [method, path, body] of blocked) {
      assert.equal((await staff(path, { method, body })).status, 403, `staff ${method} ${path}`);
    }
    assert.equal((await client()("/admin/expenses")).status, 401, "signed-out requests are rejected");
    assert.equal((await manager("/admin/expenses")).status, 200, "manager can read");
    assert.equal((await staff("/admin/booking-counts")).status, 200, "staff keep the booking badge counts");
  });

  await t.test("expenses: validation, monthly filter and profit and loss totals", async () => {
    const before = (await admin("/admin/finance/profit-loss?months=12")).data;
    const month = before.current_month;
    const base = { expense_date: `${month}-02`, category: "Supplies", amount: 125.5, description: "e2e-ribbons" };
    assert.equal((await admin("/admin/expenses", { method: "POST", body: { ...base, amount: 0 } })).status, 400);
    assert.equal((await admin("/admin/expenses", { method: "POST", body: { ...base, category: "Gifts" } })).status, 400);
    assert.equal((await admin("/admin/expenses", { method: "POST", body: { ...base, booking_id: 999999999 } })).status, 400);
    const made = await admin("/admin/expenses", { method: "POST", body: base });
    assert.equal(made.status, 201, made.data.message);
    const mgr = await manager("/admin/expenses", { method: "POST", body: { ...base, description: "e2e-manager", amount: 4.5 } });
    assert.equal(mgr.status, 201, mgr.data.message);

    const listed = (await admin(`/admin/expenses?month=${month}&category=Supplies`)).data;
    assert.ok(listed.expenses.some(e => e.id === made.data.id));
    assert.equal((await admin("/admin/expenses?month=2026-13")).status, 400);

    const after = (await admin("/admin/finance/profit-loss?months=12")).data;
    const cur = after.months.at(-1), prev = before.months.at(-1);
    assert.equal(after.months.length, 12);
    assert.equal(Math.round((cur.expenses - prev.expenses) * 100) / 100, 130, "expenses total rises by exactly what was added");
    assert.equal(cur.income, prev.income, "adding expenses never changes income");
    assert.equal(Math.round((cur.income - cur.expenses) * 100) / 100, cur.net_profit);
    const summary = (await admin("/admin/finance/summary")).data;
    assert.equal(summary.month, month);
    assert.equal(summary.net_profit, cur.net_profit);

    assert.equal((await admin(`/admin/expenses/${made.data.id}`, { method: "PATCH", body: { ...base, amount: 200 } })).status, 200);
    const edited = (await admin("/admin/finance/profit-loss")).data.months.at(-1).expenses;
    assert.equal(Math.round((edited - prev.expenses) * 100) / 100, 204.5);
    assert.equal((await admin(`/admin/expenses/${made.data.id}`, { method: "DELETE" })).status, 200);
    assert.equal((await admin(`/admin/expenses/${made.data.id}`, { method: "DELETE" })).status, 404);
    await admin(`/admin/expenses/${mgr.data.id}`, { method: "DELETE" });
  });

  await t.test("suggested expenses count only after confirmation and never twice", async () => {
    const { db } = await import("../lib/db.js");
    const [[item]] = await db.query("SELECT id FROM rental_items LIMIT 1");
    const [r1] = await db.query("INSERT INTO maintenance_records(rental_item_id,reason,status,cost,completed_at) VALUES(?, 'e2e polish', 'completed', 321.50, NOW())", [item.id]);
    const [r2] = await db.query("INSERT INTO maintenance_records(rental_item_id,reason,status,cost,completed_at) VALUES(?, 'e2e dismiss', 'completed', 77, NOW())", [item.id]);
    created.maintenanceIds.push(r1.insertId, r2.insertId);
    const expensesNow = async () => (await admin("/admin/finance/profit-loss")).data.months.at(-1).expenses;
    const start = await expensesNow();

    const listed = (await admin("/admin/expense-suggestions")).data.suggestions;
    assert.ok(listed.some(s => s.source_type === "maintenance" && s.source_id === r1.insertId && s.amount === 321.5));
    assert.equal(await expensesNow(), start, "a suggestion alone changes nothing");

    const confirmed = await admin("/admin/expense-suggestions/confirm", { method: "POST", body: { source_type: "maintenance", source_id: r1.insertId } });
    assert.equal(confirmed.status, 201, confirmed.data.message);
    assert.equal(Math.round((await expensesNow() - start) * 100) / 100, 321.5);
    assert.equal((await admin("/admin/expense-suggestions/confirm", { method: "POST", body: { source_type: "maintenance", source_id: r1.insertId } })).status, 409, "no double add");
    assert.ok(!(await admin("/admin/expense-suggestions")).data.suggestions.some(s => s.source_id === r1.insertId && s.source_type === "maintenance"), "confirmed suggestion disappears");
    assert.equal((await admin("/admin/expense-suggestions/dismiss", { method: "POST", body: { source_type: "maintenance", source_id: r1.insertId } })).status, 409, "cannot dismiss what was confirmed");

    assert.equal((await admin("/admin/expense-suggestions/dismiss", { method: "POST", body: { source_type: "maintenance", source_id: r2.insertId } })).status, 200);
    assert.ok(!(await admin("/admin/expense-suggestions")).data.suggestions.some(s => s.source_id === r2.insertId && s.source_type === "maintenance"));
    assert.equal((await admin("/admin/expense-suggestions/confirm", { method: "POST", body: { source_type: "maintenance", source_id: r2.insertId } })).status, 409, "dismissed stays out");
    assert.equal(Math.round((await expensesNow() - start) * 100) / 100, 321.5, "dismissed amounts never count");

    // A new maintenance record does not touch the books by itself.
    const [r3] = await db.query("INSERT INTO maintenance_records(rental_item_id,reason,status,cost,completed_at) VALUES(?, 'e2e later', 'completed', 50, NOW())", [item.id]);
    created.maintenanceIds.push(r3.insertId);
    assert.equal(Math.round((await expensesNow() - start) * 100) / 100, 321.5);
  });

  await t.test("booking counts match the bookings list for every status", async () => {
    const counts = (await admin("/admin/booking-counts")).data.counts;
    const rows = (await admin("/admin/bookings")).data.bookings;
    for (const status of ["pending", "confirmed", "ready", "rented", "returned", "completed", "cancelled", "rejected", "overdue"]) {
      assert.equal(counts[status] || 0, rows.filter(b => b.status === status).length, status);
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
