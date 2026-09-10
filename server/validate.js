import { z } from "zod";

// Centralised request-body validation. Each schema strips unknown keys, caps the
// length of every free-text field, and coerces / range-checks numbers, so no
// endpoint has to trust req.body shape or size on its own.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

const name = z.string().trim().min(1, "is required").max(120, "is too long");
const email = z.string().trim().toLowerCase().max(160).regex(EMAIL_RE, "must be a valid email address");
const phone = z.string().trim().min(5, "is too short").max(32, "is too long");
const optText = (max) => z.string().trim().max(max, "is too long").optional().default("");
const money = z.coerce.number().finite("must be a number").min(0, "cannot be negative").max(100_000_000, "is too large");
const password = (min) => z.string().min(min, `must be at least ${min} characters`).max(200, "is too long");
const dateOnly = z.string().trim().regex(DATE_RE, "must be in YYYY-MM-DD format");
const positiveId = z.coerce.number().int("must be a whole number").positive("must be a positive id");

// "" / null / undefined -> null, otherwise a positive integer id.
const optionalId = z.preprocess(
  (v) => (v === "" || v === undefined || v === null ? null : v),
  positiveId.nullable()
);

function rangeWithinAYear(obj, ctx) {
  const start = Date.parse(obj.start_date);
  const end = Date.parse(obj.end_date);
  if (Number.isNaN(start) || Number.isNaN(end)) return;
  if (end < start) {
    ctx.addIssue({ code: "custom", path: ["end_date"], message: "must be on or after the start date" });
  } else if (end - start > 366 * DAY_MS) {
    ctx.addIssue({ code: "custom", path: ["end_date"], message: "rental period cannot exceed 366 days" });
  }
}

export const schemas = {
  staffLogin: z.object({
    email: z.string().trim().toLowerCase().max(160),
    password: z.string().min(1, "is required").max(200),
  }),

  createUser: z.object({
    full_name: name,
    email,
    phone: z.string().trim().max(32).optional().default(""),
    role: z.enum(["admin"]),
    password: password(8),
  }),

  updateProfile: z.object({
    full_name: name,
    email,
    phone: z.string().trim().max(32).optional().default(""),
  }),

  changePassword: z.object({
    current_password: z.string().min(1, "is required").max(200),
    new_password: password(12),
  }),

  guestBooking: z
    .object({
      full_name: name,
      email,
      phone,
      city: optText(120),
      address: optText(500),
      start_date: dateOnly,
      end_date: dateOnly,
      fulfillment: z.enum(["pickup", "delivery"]).optional().default("delivery"),
      payment_method: z.enum(["cash", "gcash", "bank_transfer", "other"]).optional().default("cash"),
      items: z
        .array(
          z.object({
            item_id: positiveId,
            quantity: z.coerce.number().int().min(1, "must be at least 1").max(1000, "is too large"),
          })
        )
        .min(1, "at least one item is required")
        .max(50, "has too many items"),
    })
    .superRefine(rangeWithinAYear),

  reschedule: z
    .object({ start_date: dateOnly, end_date: dateOnly })
    .superRefine(rangeWithinAYear),

  inventoryItem: z.object({
    sku: z.string().trim().min(1, "is required").max(40, "is too long"),
    name,
    category: z.string().trim().min(1, "is required").max(60, "is too long"),
    description: optText(2000),
    daily_price: money,
    security_deposit: money,
    total_quantity: z.coerce.number().int("must be a whole number").min(0, "cannot be negative").max(1_000_000, "is too large"),
    status: z.enum(["active", "inactive", "maintenance"]).optional().default("active"),
    image_url: optText(500),
  }),

  createIncident: z.object({
    rental_item_id: positiveId,
    booking_id: optionalId,
    customer_id: optionalId,
    incident_type: z
      .enum(["lost", "damaged_minor", "damaged_major", "partially_missing", "other"])
      .optional()
      .default("damaged_minor"),
    description: z.string().trim().min(1, "is required").max(2000, "is too long"),
    replacement_cost: money.optional().default(0),
    charge_amount: money.optional().default(0),
    insurance_claim_amount: money.optional().default(0),
  }),

  updateCustomer: z.object({
    full_name: name,
    email,
    phone,
    city: optText(120),
    address: optText(500),
  }),

  recordPayment: z.object({
    amount: z.coerce.number().finite("must be a number").gt(0, "must be greater than zero").max(100_000_000, "is too large"),
    payment_type: z.enum(["rental", "deposit", "delivery", "other", "refund"]).optional().default("rental"),
    method: z.enum(["cash", "gcash", "bank_transfer", "other"]).optional().default("cash"),
    reference_no: optText(80),
    notes: optText(500),
  }),
};

// Express middleware: validate + normalise req.body, or reply 400 with the first
// problem in "<field> <reason>" form.
export function parseBody(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body ?? {});
    if (!result.success) {
      const issue = result.error.issues[0];
      const field = issue.path.join(".");
      return res.status(400).json({ message: field ? `${field} ${issue.message}` : issue.message });
    }
    req.body = result.data;
    next();
  };
}
