import { test } from "node:test";
import assert from "node:assert/strict";
import { discountOf, escHtml, peso } from "../src/lib/format.js";
import { sortRows } from "../src/hooks/useSort.js";

test("escHtml neutralises HTML so printed invoices cannot run injected code", () => {
  assert.equal(escHtml(`<img src=x onerror="alert('x')">`), "&lt;img src=x onerror=&quot;alert(&#39;x&#39;)&quot;&gt;");
  assert.equal(escHtml("Tom & Jerry"), "Tom &amp; Jerry");
  assert.equal(escHtml(null), "");
});

test("peso formats whole Philippine pesos", () => {
  assert.match(peso(1500), /^₱1,500$/);
  assert.match(peso(0), /^₱0$/);
});

test("discountOf only reports a saving when the original price is genuinely higher", () => {
  assert.deepEqual(discountOf(2200, 2400), { original: 2400, save: 200 });
  assert.equal(discountOf(2200, null), null, "no original price -> plain price");
  assert.equal(discountOf(2200, undefined), null);
  assert.equal(discountOf(2200, 0), null, "zero is not a discount");
  assert.equal(discountOf(2200, 2200), null, "same price -> no badge");
  assert.equal(discountOf(2200, 2000), null, "stale lower original never shows a negative saving");
  assert.equal(discountOf("2200", "2400")?.save, 200, "DB decimal strings are numbers");
  assert.equal(discountOf("junk", "2400"), null, "unparseable input is ignored");
});

test("sortRows sorts ascending/descending by the chosen column and leaves the input alone", () => {
  const rows = [{ n: "Tent", p: 300 }, { n: "Camera", p: 1200 }, { n: "Speaker", p: 800 }];
  const sorts = { price: { get: r => r.p }, name: { get: r => r.n } };
  assert.deepEqual(sortRows(rows, sorts, "price", "asc").map(r => r.p), [300, 800, 1200]);
  assert.deepEqual(sortRows(rows, sorts, "price", "desc").map(r => r.p), [1200, 800, 300]);
  assert.deepEqual(sortRows(rows, sorts, "name", "asc").map(r => r.n), ["Camera", "Speaker", "Tent"]);
  assert.deepEqual(rows.map(r => r.n), ["Tent", "Camera", "Speaker"], "original array unchanged");
  assert.equal(sortRows(rows, sorts, "unknown", "asc"), rows);
});

import { BOOKING_STAGES, isOverdueBooking, stageByKey, stageCounts } from "../src/lib/bookingStages.js";
import { buildProfitLossCsv } from "../src/lib/profitLossCsv.js";

test("every booking status belongs to exactly one stage", () => {
  const all = ["pending", "confirmed", "ready", "rented", "returned", "completed", "cancelled", "rejected", "overdue"];
  for (const status of all) {
    assert.equal(BOOKING_STAGES.filter(s => s.statuses.includes(status)).length, 1, status);
  }
  assert.equal(BOOKING_STAGES.flatMap(s => s.statuses).length, all.length);
});

test("stage lookup and counts follow booking statuses", () => {
  assert.equal(stageByKey("ongoing").statuses.includes("overdue"), true);
  assert.equal(stageByKey("nope"), null);
  assert.deepEqual(stageCounts({ pending: 3, confirmed: 2, ready: 1, rented: 4, overdue: 1, cancelled: 2, rejected: 1 }),
    { pending: 3, approved: 3, ongoing: 5, completed: 0, closed: 3 });
});

test("a rented booking past its end date counts as overdue", () => {
  assert.equal(isOverdueBooking({ status: "overdue", end_date: "2099-01-01" }), true);
  assert.equal(isOverdueBooking({ status: "rented", end_date: "2000-01-01" }), true);
  assert.equal(isOverdueBooking({ status: "rented", end_date: "2099-01-01" }), false);
  assert.equal(isOverdueBooking({ status: "completed", end_date: "2000-01-01" }), false);
});

test("a rental ending today is not overdue, whatever the timezone", () => {
  const now = new Date();
  const todayText = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  // The API sends DATE columns as UTC midnight.
  assert.equal(isOverdueBooking({ status: "rented", end_date: `${todayText}T00:00:00.000Z` }), false);
  assert.equal(isOverdueBooking({ status: "rented", end_date: "2000-01-01T00:00:00.000Z" }), true);
});

test("profit and loss CSV quotes cells and keeps totals", () => {
  const csv = buildProfitLossCsv({
    months: [{ month: "2026-09", income: 1000, expenses: 250.5, net_profit: 749.5, margin: 74.95 }, { month: "2026-10", income: 0, expenses: 0, net_profit: 0, margin: null }],
    totals: { income: 1000, expenses: 250.5, net_profit: 749.5, margin: 74.95 }
  }).split("\r\n");
  assert.equal(csv[0], '"Month","Income","Expenses","Net profit","Profit margin %"');
  assert.equal(csv[1], '"2026-09","1000.00","250.50","749.50","74.95"');
  assert.equal(csv[2], '"2026-10","0.00","0.00","0.00",""');
  assert.equal(csv[3], '"Total","1000.00","250.50","749.50","74.95"');
});
