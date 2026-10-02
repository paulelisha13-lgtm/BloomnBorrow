import { test } from "node:test";
import assert from "node:assert/strict";
import { redactPrivateDetails } from "../lib/audit.js";

test("audit details redact nested customer contact values", () => {
  const result = redactPrivateDetails({
    booking_id: 42,
    changes: {
      email: { from: "old@example.com", to: "new@example.com" },
      address: { from: null, to: "12 Example Street" },
      phone: "09170000000"
    },
    recipients: [{ to: "customer@example.com" }]
  });

  assert.deepEqual(result, {
    booking_id: 42,
    changes: {
      email: "[redacted]",
      address: "[redacted]",
      phone: "[redacted]"
    },
    recipients: [{ to: "[redacted]" }]
  });
});