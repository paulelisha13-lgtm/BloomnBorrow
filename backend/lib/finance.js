import { z } from "zod";

// What counts as income, used by the Dashboard, Reports and Profit & Loss so
// they always agree. Only money earned from renting counts: rental, delivery
// and other payments. Security deposits are held money, not income, so deposit
// payments and their refunds (payment_type 'refund') are left out. Callers also
// filter on p.status='completed' (voids excluded) and on bookings that were not
// cancelled/rejected. Use as SUM(${INCOME_AMOUNT_SQL}) with payments aliased `p`.
export const INCOME_AMOUNT_SQL = "CASE WHEN p.payment_type IN ('rental','delivery','other') THEN p.amount ELSE 0 END";

// Finance rules live here (pure, no database) so they can be unit-tested.

export const EXPENSE_CATEGORIES = [
  "Delivery / Transport",
  "Cleaning / Laundry",
  "Repairs & Maintenance",
  "Damage & Loss",
  "Supplies",
  "Rent & Utilities",
  "Marketing",
  "Staff",
  "Item Purchase",
  "Other"
];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const emptyToNull = v => (v === "" || v === undefined || v === null ? null : v);
const optId = z.preprocess(emptyToNull, z.coerce.number().int("must be a whole number").positive("must be a positive id").nullable());
const amount = z.coerce.number("must be a number").finite("must be a number").gt(0, "must be greater than zero").max(100_000_000, "is too large");
const validDate = z.string().trim().regex(DATE_RE, "must be in YYYY-MM-DD format").refine(
  v => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v,
  "is not a real date"
);
const category = z.enum(EXPENSE_CATEGORIES, { error: "is not a valid category" });
const description = z.string().trim().min(1, "is required").max(255, "is too long");

export const expenseInputSchema = z.object({
  expense_date: validDate,
  category,
  amount,
  description,
  booking_id: optId.optional().default(null),
  rental_item_id: optId.optional().default(null)
});

export const expenseUpdateSchema = expenseInputSchema.extend({
  remove_receipt: z.preprocess(v => v === true || v === "true" || v === "1", z.boolean()).optional().default(false)
});

export const suggestionSourceSchema = z.object({
  source_type: z.enum(["maintenance", "incident"], { error: "must be maintenance or incident" }),
  source_id: z.coerce.number().int().positive("must be a positive id")
});

export const suggestionConfirmSchema = suggestionSourceSchema.extend({
  expense_date: validDate.optional(),
  category: category.optional(),
  amount: amount.optional(),
  description: description.optional()
});

export const isMonth = value => MONTH_RE.test(String(value || ""));

// ["2026-05", ..., "2026-10"] ending at `endMonth` (inclusive), oldest first.
export function monthRange(endMonth, count = 12) {
  const [year, month] = endMonth.split("-").map(Number);
  const out = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(year, month - 1 - i, 1));
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

const round2 = n => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

// incomeRows/expenseRows: [{month:"YYYY-MM", total:number}]. Months without any
// rows are present with zeros so the chart and table have no gaps.
export function buildProfitAndLoss(months, incomeRows = [], expenseRows = []) {
  const income = new Map(), expenses = new Map();
  for (const r of incomeRows) income.set(r.month, (income.get(r.month) || 0) + Number(r.total || 0));
  for (const r of expenseRows) expenses.set(r.month, (expenses.get(r.month) || 0) + Number(r.total || 0));
  const rows = months.map(month => {
    const inc = round2(income.get(month) || 0), exp = round2(expenses.get(month) || 0);
    const net = round2(inc - exp);
    return { month, income: inc, expenses: exp, net_profit: net, margin: inc > 0 ? round2((net / inc) * 100) : null };
  });
  const totalIncome = round2(rows.reduce((s, r) => s + r.income, 0));
  const totalExpenses = round2(rows.reduce((s, r) => s + r.expenses, 0));
  const totalNet = round2(totalIncome - totalExpenses);
  return {
    months: rows,
    totals: { income: totalIncome, expenses: totalExpenses, net_profit: totalNet, margin: totalIncome > 0 ? round2((totalNet / totalIncome) * 100) : null }
  };
}
