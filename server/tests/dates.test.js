import { test } from "node:test";
import assert from "node:assert/strict";
import { lateDaysSince, parseDateOnly, rentalDays, toDateOnly } from "../lib/dates.js";

test("toDateOnly reads both MySQL Date objects and YYYY-MM-DD strings", () => {
  // mysql2 hands DATE columns back as Date objects at UTC midnight.
  assert.equal(toDateOnly(new Date("2026-09-30T00:00:00Z")), "2026-09-30");
  assert.equal(toDateOnly("2026-09-30"), "2026-09-30");
  assert.equal(toDateOnly(new Date("invalid")), "");
  assert.equal(toDateOnly(null), "");
});

test("lateDaysSince: returning on the end date is on time", () => {
  assert.equal(lateDaysSince("2026-09-25", "2026-09-25"), 0);
  assert.equal(lateDaysSince("2026-09-25", "2026-09-20"), 0);
});

test("lateDaysSince counts whole days after the end date", () => {
  assert.equal(lateDaysSince("2026-09-25", "2026-09-26"), 1);
  assert.equal(lateDaysSince("2026-09-25", "2026-09-29"), 4);
  // Regression: a Date object from MySQL used to give 0 late days (and ₱0 late fee).
  assert.equal(lateDaysSince(new Date("2026-09-25T00:00:00Z"), "2026-09-29"), 4);
});

test("lateDaysSince is 0 for a missing or broken date", () => {
  assert.equal(lateDaysSince(null, "2026-09-29"), 0);
  assert.equal(lateDaysSince("not-a-date", "2026-09-29"), 0);
});

test("rentalDays counts both the first and the last day", () => {
  assert.equal(rentalDays(parseDateOnly("2026-11-10"), parseDateOnly("2026-11-10")), 1);
  assert.equal(rentalDays(parseDateOnly("2026-11-10"), parseDateOnly("2026-11-12")), 3);
});

test("parseDateOnly accepts only YYYY-MM-DD", () => {
  assert.ok(parseDateOnly("2026-11-10") instanceof Date);
  assert.equal(parseDateOnly("11/10/2026"), null);
  assert.equal(parseDateOnly(""), null);
});
