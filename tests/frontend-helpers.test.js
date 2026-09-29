import { test } from "node:test";
import assert from "node:assert/strict";
import { escHtml, peso } from "../src/lib/format.js";
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

test("sortRows sorts ascending/descending by the chosen column and leaves the input alone", () => {
  const rows = [{ n: "Tent", p: 300 }, { n: "Camera", p: 1200 }, { n: "Speaker", p: 800 }];
  const sorts = { price: { get: r => r.p }, name: { get: r => r.n } };
  assert.deepEqual(sortRows(rows, sorts, "price", "asc").map(r => r.p), [300, 800, 1200]);
  assert.deepEqual(sortRows(rows, sorts, "price", "desc").map(r => r.p), [1200, 800, 300]);
  assert.deepEqual(sortRows(rows, sorts, "name", "asc").map(r => r.n), ["Camera", "Speaker", "Tent"]);
  assert.deepEqual(rows.map(r => r.n), ["Tent", "Camera", "Speaker"], "original array unchanged");
  assert.equal(sortRows(rows, sorts, "unknown", "asc"), rows);
});
