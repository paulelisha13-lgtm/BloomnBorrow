import { test } from "node:test";
import assert from "node:assert/strict";
import { EXPENSE_CATEGORIES, buildProfitAndLoss, expenseInputSchema, isMonth, monthRange, suggestionConfirmSchema } from "../lib/finance.js";

test("monthRange lists months oldest first across a year boundary", () => {
  assert.deepEqual(monthRange("2026-02", 4), ["2025-11", "2025-12", "2026-01", "2026-02"]);
  assert.equal(monthRange("2026-10", 12).length, 12);
  assert.equal(monthRange("2026-10", 12)[0], "2025-11");
});

test("buildProfitAndLoss computes net profit and margin per month and in total", () => {
  const months = ["2026-08", "2026-09", "2026-10"];
  const result = buildProfitAndLoss(
    months,
    [{ month: "2026-09", total: "1000.50" }, { month: "2026-10", total: 400 }],
    [{ month: "2026-09", total: 250.25 }, { month: "2026-10", total: 500 }]
  );
  assert.deepEqual(result.months[0], { month: "2026-08", income: 0, expenses: 0, net_profit: 0, margin: null });
  assert.deepEqual(result.months[1], { month: "2026-09", income: 1000.5, expenses: 250.25, net_profit: 750.25, margin: 74.99 });
  assert.equal(result.months[2].net_profit, -100, "a month can run at a loss");
  assert.equal(result.months[2].margin, -25);
  assert.deepEqual(result.totals, { income: 1400.5, expenses: 750.25, net_profit: 650.25, margin: 46.43 });
});

test("buildProfitAndLoss does not double count rows for the same month", () => {
  const result = buildProfitAndLoss(["2026-10"], [{ month: "2026-10", total: 100 }], [{ month: "2026-10", total: 40 }]);
  assert.equal(result.totals.income, 100);
  assert.equal(result.totals.expenses, 40);
  assert.equal(result.totals.net_profit, 60);
});

test("buildProfitAndLoss ignores months outside the requested range", () => {
  const result = buildProfitAndLoss(["2026-10"], [{ month: "2020-01", total: 999 }], [{ month: "2020-01", total: 999 }]);
  assert.equal(result.totals.income, 0);
  assert.equal(result.totals.expenses, 0);
});

test("expense input is validated", () => {
  const ok = { expense_date: "2026-10-05", category: "Supplies", amount: "125.50", description: " Ribbons ", booking_id: "", rental_item_id: "" };
  const parsed = expenseInputSchema.parse(ok);
  assert.equal(parsed.amount, 125.5);
  assert.equal(parsed.description, "Ribbons");
  assert.equal(parsed.booking_id, null);
  for (const bad of [
    { ...ok, amount: "0" }, { ...ok, amount: "-5" }, { ...ok, amount: "abc" }, { ...ok, category: "Gifts" },
    { ...ok, expense_date: "2026-02-31" }, { ...ok, expense_date: "10/05/2026" }, { ...ok, description: "  " },
    { ...ok, description: "x".repeat(256) }, { ...ok, booking_id: "-3" }
  ]) assert.equal(expenseInputSchema.safeParse(bad).success, false, JSON.stringify(bad));
});

test("suggestion confirmation only accepts known sources", () => {
  assert.equal(suggestionConfirmSchema.safeParse({ source_type: "maintenance", source_id: "4" }).success, true);
  assert.equal(suggestionConfirmSchema.safeParse({ source_type: "payment", source_id: 4 }).success, false);
  assert.equal(suggestionConfirmSchema.safeParse({ source_type: "incident", source_id: 0 }).success, false);
});

test("month filter format and categories", () => {
  assert.equal(isMonth("2026-10"), true);
  assert.equal(isMonth("2026-13"), false);
  assert.equal(isMonth("2026-1"), false);
  assert.ok(EXPENSE_CATEGORIES.includes("Repairs & Maintenance") && EXPENSE_CATEGORIES.includes("Damage & Loss"));
});

import fs from "node:fs";
import { INCOME_AMOUNT_SQL } from "../lib/finance.js";

test("income counts rental, delivery and other payments only (no deposits or refunds)", () => {
  assert.match(INCOME_AMOUNT_SQL, /'rental','delivery','other'/);
  assert.doesNotMatch(INCOME_AMOUNT_SQL, /deposit|refund/);
});

test("Dashboard, Reports and Profit & Loss share the one income rule", () => {
  for (const file of ["../routes/reports.js", "../routes/finance.js"]) {
    const source = fs.readFileSync(new URL(file, import.meta.url), "utf8");
    assert.doesNotMatch(source, /payment_type='refund' THEN -p\.amount/, `${file} must not compute its own revenue`);
    assert.match(source, /INCOME_AMOUNT_SQL/, `${file} must use the shared income rule`);
  }
});
