import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

// The browser prices a rental with src/lib/pricing.js; the server charges it with
// backend/lib/pricing.js. They are separate deploys, so the file is duplicated --
// this test makes sure the two copies can never drift apart.
test("src/lib/pricing.js is identical to backend/lib/pricing.js", () => {
  const read = path => fs.readFileSync(new URL(path, import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.equal(read("../src/lib/pricing.js"), read("../backend/lib/pricing.js"));
});
