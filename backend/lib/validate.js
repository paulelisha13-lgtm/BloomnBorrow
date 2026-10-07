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
// One rule for every password a person sets (create, change, admin reset). It
// matches bootstrap-admin.js so no path accepts a weaker staff password.
export const PASSWORD_RULE = "Use at least 14 characters with uppercase, lowercase, a number, and a symbol.";
const password = z.string().max(200, "is too long").superRefine((value, ctx) => {
  const strong = value.length >= 14 && /[A-Z]/.test(value) && /[a-z]/.test(value) && /[0-9]/.test(value) && /[^A-Za-z0-9]/.test(value);
  if (!strong) ctx.addIssue({ code: "custom", message: `is too weak. ${PASSWORD_RULE}` });
  else if (/admin123|password|bloom_borrow|changeme/i.test(value)) ctx.addIssue({ code: "custom", message: "is too predictable." });
});
const dateOnly = z.string().trim().regex(DATE_RE, "must be in YYYY-MM-DD format");
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATETIME_RE = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2})?$/;
// "" / null / undefined -> null, so a cleared time or reminder is stored as NULL
// rather than an empty string the MySQL TIME/DATETIME columns would reject.
const optTime = z.preprocess(
  (v) => (v === "" || v === undefined || v === null ? null : v),
  z.string().trim().regex(TIME_RE, "must be in HH:MM format").nullable()
);
const optDateTime = z.preprocess(
  (v) => (v === "" || v === undefined || v === null ? null : v),
  z.string().trim().regex(DATETIME_RE, "must be in YYYY-MM-DDTHH:MM format").nullable()
);
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

// The end of a calendar entry cannot be before its start. A cross-midnight
// range is rejected rather than silently re-ordered, because an overnight
// booking is far more likely to be a typo than an intent.
function calendarTimesInOrder(obj, ctx) {
  if (!obj.start_time || !obj.end_time) return;
  if (obj.end_time < obj.start_time) {
    ctx.addIssue({ code: "custom", path: ["end_time"], message: "must not be before the start time" });
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
    role: z.enum(["admin", "manager", "staff"]),
    password,
  }),

  resetPassword: z.object({
    password,
  }),

  updateProfile: z.object({
    full_name: name,
    email,
    phone: z.string().trim().max(32).optional().default(""),
  }),

  changePassword: z.object({
    current_password: z.string().min(1, "is required").max(200),
    new_password: password,
  }),

  adminBooking: z
    .object({
      customer_id: optionalId,
      full_name: z.string().trim().max(120).optional().default(""),
      email: z.string().trim().toLowerCase().max(160).optional().default(""),
      phone: z.string().trim().max(32).optional().default(""),
      address: optText(500),
      city: optText(120),
      province: optText(120),
      postal_code: optText(20),
      start_date: dateOnly,
      end_date: dateOnly,
      fulfillment: z.enum(["pickup", "delivery"]),
      payment_method: z.enum(["cash", "gcash", "bank_transfer", "other"]).optional().default("cash"),
      notes: optText(1000),
      items: z.array(z.object({
        item_id: positiveId,
        quantity: z.coerce.number().int().min(1).max(1000),
        delivery_fee_per_piece: money,
      })).min(1).max(50),
    })
    .superRefine((obj,ctx)=>{
      rangeWithinAYear(obj,ctx);
      if (!obj.customer_id) {
        if (!obj.full_name) ctx.addIssue({code:"custom",path:["full_name"],message:"is required"});
        if (!obj.phone || obj.phone.length < 5) ctx.addIssue({code:"custom",path:["phone"],message:"must be a valid contact number"});
        if (!EMAIL_RE.test(obj.email)) ctx.addIssue({code:"custom",path:["email"],message:"must be a valid email address"});
      }
    }),

  // Customer Side self-service booking. Same shape/limits as adminBooking's
  // items/dates, but there is no customer_id branch: a guest cannot assert an
  // existing DB id, so full_name/phone/email/address are always required.
  customerBooking: z
    .object({
      full_name: z.string().trim().min(1, "is required").max(120, "is too long"),
      email: z.string().trim().toLowerCase().max(160).regex(EMAIL_RE, "must be a valid email address"),
      phone: z.string().trim().min(7, "must be a valid contact number").max(32, "is too long").refine(value => {
        const digits=value.replace(/\D/g,"").length;
        return digits>=7&&digits<=15;
      }, "must contain 7 to 15 digits"),
      address: z.string().trim().min(1, "is required").max(500, "is too long"),
      city: z.string().trim().min(1, "is required").max(120, "is too long"),
      province: z.string().trim().min(1, "is required").max(120, "is too long"),
      postal_code: optText(20),
      start_date: dateOnly,
      end_date: dateOnly,
      fulfillment: z.enum(["pickup", "delivery"]),
      payment_method: z.enum(["cash", "gcash", "bank_transfer", "other"]).optional().default("cash"),
      notes: optText(1000),
      terms_accepted: z.preprocess(
        value => value === true || String(value).toLowerCase() === "true",
        z.boolean().refine(value => value === true, { message: "must be accepted" })
      ),
      items: z.array(z.object({
        item_id: positiveId,
        quantity: z.coerce.number().int().min(1).max(1000),
        delivery_fee_per_piece: money,
      })).min(1).max(50),
    })
    .superRefine(rangeWithinAYear),

  // Stock pre-check for the Add Booking form: bounded item list and date range
  // so one request cannot make the server run an unbounded number of queries.
  availabilityCheck: z
    .object({
      start_date: dateOnly,
      end_date: dateOnly,
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

  deliveryQuote: z.object({
    amount: money,
  }),

  inventoryItem: z.object({
    sku: z.string().trim().min(1, "is required").max(40, "is too long"),
    name,
    category: z.string().trim().min(1, "is required").max(60, "is too long"),
    description: optText(2000),
    daily_price: money,
    // Optional compare-at price for the "Save ₱X" display. Display-only: a
    // value at or below daily_price is simply not shown as a discount, so it
    // never affects what a booking charges. "" / missing -> NULL, matching how
    // the other nullable columns are stored rather than coercing to 0.
    original_price: z.preprocess(
      (v) => (v === "" || v === undefined || v === null ? null : v),
      money.nullable()
    ),
    security_deposit: money,
    total_quantity: z.coerce.number().int("must be a whole number").min(0, "cannot be negative").max(1_000_000, "is too large"),
    status: z.enum(["active", "inactive", "maintenance"]).optional().default("active"),
    image_url: optText(500),
    // Optional package/bundle manifest: [{ name, quantity }, ...]. An empty
    // list or a missing value means the row is a plain rental item (stored as
    // NULL); a non-empty list makes it a package on the customer catalog.
    // Display-only -- it never changes pricing, stock or booking lines. A JSON
    // string is accepted too, because MySQL hands the column back to the admin
    // edit form as text on some drivers.
    bundle_items: z.preprocess(
      (v) => {
        if (v === "" || v === undefined || v === null) return [];
        if (typeof v === "string") {
          try { const parsed = JSON.parse(v); return Array.isArray(parsed) ? parsed : []; }
          catch { return []; }
        }
        return v;
      },
      z.array(
        z.object({
          name: z.string().trim().min(1, "is required").max(120, "is too long"),
          quantity: z.coerce.number().int("must be a whole number").min(1, "cannot be zero").max(10000, "is too large"),
        })
      ).max(50, "has too many items")
    ),
  }),

  // Calendar Reservation & Booking module. One shape covers bookings,
  // reservations, events and notes; the fields that do not apply to a type are
  // simply left blank. Times are "HH:MM" and must not end before they start.
  calendarEntry: z
    .object({
      entry_type: z.enum(["booking", "reservation", "note", "event"]).optional().default("reservation"),
      title: z.string().trim().min(1, "is required").max(160, "is too long"),
      customer_name: optText(160),
      customer_email: z
        .union([z.literal(""), email])
        .optional()
        .default(""),
      customer_phone: optText(50),
      entry_date: dateOnly,
      start_time: optTime,
      end_time: optTime,
      guests: z.coerce.number().int("must be a whole number").min(0, "cannot be negative").max(10000, "is too large").optional().default(0),
      location: optText(160),
      status: z.enum(["pending", "confirmed", "cancelled", "completed"]).optional().default("pending"),
      category: optText(40),
      reminder_at: optDateTime,
      details: optText(2000),
      notes: optText(2000),
    })
    .superRefine(calendarTimesInOrder),

  updateCustomer: z.object({
    full_name: name,
    email,
    phone,
    city: optText(120),
    address: optText(500),
    province: optText(120),
    postal_code: optText(20),
  }),

  recordPayment: z.object({
    amount: z.coerce.number().finite("must be a number").gt(0, "must be greater than zero").max(100_000_000, "is too large"),
    payment_type: z.enum(["rental", "deposit", "delivery", "other", "refund"]).optional().default("rental"),
    method: z.enum(["cash", "gcash", "bank_transfer", "other"]).optional().default("cash"),
    reference_no: optText(80),
    notes: optText(500),
  }),

  gcashProofReview: z
    .object({
      action: z.enum(["approve", "reject"]),
      verified_amount: z.preprocess(
        value => value === "" || value === null || value === undefined ? undefined : value,
        z.coerce.number().finite("must be a number").gt(0, "must be greater than zero").max(100_000_000, "is too large").optional()
      ),
      gcash_reference: optText(120),
      review_note: optText(500),
    })
    .superRefine((value, ctx) => {
      if (value.action === "approve") {
        if (value.verified_amount === undefined) ctx.addIssue({code:"custom",path:["verified_amount"],message:"is required when approving proof"});
        if (!value.gcash_reference) ctx.addIssue({code:"custom",path:["gcash_reference"],message:"is required when approving proof"});
      }
      if (value.action === "reject" && !value.review_note) {
        ctx.addIssue({code:"custom",path:["review_note"],message:"is required when rejecting proof"});
      }
    }),

  sendInvoice: z.object({
    // Defaults to the booking's customer_email when omitted; only present to
    // let staff redirect a resend to a corrected address.
    email: z.string().trim().toLowerCase().max(160).regex(EMAIL_RE, "must be a valid email address").optional(),
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
