import { Router } from "express";
import { authenticate, requireRole, requireStaffCsrf } from "../lib/auth.js";
import { db } from "../lib/db.js";
import { audit } from "../lib/audit.js";
import { toDateOnly } from "../lib/dates.js";
import { expenseReceiptUpload, removeUpload, sendUpload } from "../lib/upload.js";
import {
  EXPENSE_CATEGORIES, INCOME_AMOUNT_SQL, buildProfitAndLoss, expenseInputSchema, expenseUpdateSchema, isMonth, monthRange,
  suggestionConfirmSchema, suggestionSourceSchema
} from "../lib/finance.js";

const router = Router();

// Finance is admin/manager only. Every route below repeats the role check so it
// holds even if the route is called directly, not just hidden from the menu.
const financeOnly = [authenticate, requireRole("admin", "manager")];

// Income rule is shared with the Dashboard and Reports (see INCOME_AMOUNT_SQL).
const INCOME_SQL = `
  SELECT DATE_FORMAT(p.created_at,'%Y-%m') AS month,
    COALESCE(SUM(${INCOME_AMOUNT_SQL}),0) AS total
  FROM payments p JOIN bookings b ON b.id=p.booking_id
  WHERE p.status='completed'
    AND b.status NOT IN ('cancelled','rejected')
    AND p.created_at>=? AND p.created_at<?
  GROUP BY DATE_FORMAT(p.created_at,'%Y-%m')`;
const EXPENSE_SQL = `
  SELECT DATE_FORMAT(expense_date,'%Y-%m') AS month, COALESCE(SUM(amount),0) AS total
  FROM expenses WHERE expense_date>=? AND expense_date<?
  GROUP BY DATE_FORMAT(expense_date,'%Y-%m')`;

function nextMonthStart(month) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

async function currentMonth() {
  const [[row]] = await db.query("SELECT DATE_FORMAT(CURDATE(),'%Y-%m') AS month");
  return row.month;
}

async function profitAndLoss(count) {
  const months = monthRange(await currentMonth(), count);
  const from = `${months[0]}-01`, to = nextMonthStart(months[months.length - 1]);
  const [income] = await db.query(INCOME_SQL, [from, to]);
  const [expenses] = await db.query(EXPENSE_SQL, [from, to]);
  return buildProfitAndLoss(months, income, expenses);
}

const shapeExpense = ({ receipt_path, ...row }) => ({
  ...row,
  expense_date: toDateOnly(row.expense_date),
  amount: Number(row.amount),
  has_receipt: Boolean(receipt_path)
});

// Runs the multipart upload for create/update and turns upload errors into 400s.
const receiptUpload = (req, res, next) => expenseReceiptUpload(req, res, err => {
  if (err) return res.status(400).json({ message: err.message || "Could not process the receipt." });
  next();
});

// Validates the (multipart) text fields and deletes a just-uploaded receipt when they are invalid.
const validated = schema => (req, res, next) => {
  const result = schema.safeParse(req.body ?? {});
  if (!result.success) {
    if (req.file) removeUpload("expense-receipts", req.file.filename);
    const issue = result.error.issues[0];
    const field = issue.path.join(".");
    return res.status(400).json({ message: field ? `${field} ${issue.message}` : issue.message });
  }
  req.body = result.data;
  next();
};

async function assertLinks(body) {
  if (body.booking_id) {
    const [[b]] = await db.query("SELECT id FROM bookings WHERE id=?", [body.booking_id]);
    if (!b) return "The linked booking does not exist.";
  }
  if (body.rental_item_id) {
    const [[i]] = await db.query("SELECT id FROM rental_items WHERE id=?", [body.rental_item_id]);
    if (!i) return "The linked rental item does not exist.";
  }
  return null;
}

const EXPENSE_SELECT = `
  SELECT e.id,e.expense_date,e.category,e.amount,e.description,e.receipt_path,e.receipt_original_name,
    e.booking_id,e.rental_item_id,e.source_type,e.source_id,e.created_at,
    b.booking_no,r.name AS item_name,u.full_name AS recorded_by
  FROM expenses e
  LEFT JOIN bookings b ON b.id=e.booking_id
  LEFT JOIN rental_items r ON r.id=e.rental_item_id
  LEFT JOIN users u ON u.id=e.recorded_by_user_id`;

router.get("/api/admin/expenses", ...financeOnly, async (req, res, next) => {
  try {
    const where = [], params = [];
    if (req.query.month) {
      if (!isMonth(req.query.month)) return res.status(400).json({ message: "month must be in YYYY-MM format." });
      where.push("e.expense_date>=? AND e.expense_date<?");
      params.push(`${req.query.month}-01`, nextMonthStart(req.query.month));
    }
    if (req.query.category) {
      if (!EXPENSE_CATEGORIES.includes(req.query.category)) return res.status(400).json({ message: "Unknown category." });
      where.push("e.category=?");
      params.push(req.query.category);
    }
    const whereSql = where.length ? "WHERE " + where.join(" AND ") : "";
    const [rows] = await db.query(`${EXPENSE_SELECT} ${whereSql} ORDER BY e.expense_date DESC, e.id DESC LIMIT 500`, params);
    // Totals are summed in SQL so they cover every matching expense, not just the 500 rows returned.
    const [sums] = await db.query(`SELECT e.category, COUNT(*) AS count, COALESCE(SUM(e.amount),0) AS total FROM expenses e ${whereSql} GROUP BY e.category`, params);
    const byCategory = {};
    let total = 0, count = 0;
    for (const s of sums) {
      byCategory[s.category] = Math.round(Number(s.total) * 100) / 100;
      total += Number(s.total);
      count += Number(s.count);
    }
    res.json({
      expenses: rows.map(shapeExpense),
      total: Math.round(total * 100) / 100,
      count,
      truncated: count > rows.length,
      by_category: byCategory,
      categories: EXPENSE_CATEGORIES
    });
  } catch (err) { next(err); }
});

router.post("/api/admin/expenses", ...financeOnly, requireStaffCsrf, receiptUpload, validated(expenseInputSchema), async (req, res, next) => {
  try {
    const b = req.body;
    const linkError = await assertLinks(b);
    if (linkError) { if (req.file) removeUpload("expense-receipts", req.file.filename); return res.status(400).json({ message: linkError }); }
    const [result] = await db.query(
      `INSERT INTO expenses(expense_date,category,amount,description,receipt_path,receipt_original_name,booking_id,rental_item_id,source_type,recorded_by_user_id)
       VALUES(?,?,?,?,?,?,?,?,'manual',?)`,
      [b.expense_date, b.category, b.amount, b.description, req.file?.filename || null, req.file ? String(req.file.originalname || "").slice(0, 255) : null, b.booking_id, b.rental_item_id, req.user.id]
    );
    await audit(req, "CREATE_EXPENSE", null, { expense_id: result.insertId, category: b.category, amount: b.amount, expense_date: b.expense_date });
    res.status(201).json({ ok: true, id: result.insertId, message: "Expense recorded." });
  } catch (err) { if (req.file) removeUpload("expense-receipts", req.file.filename); next(err); }
});

router.patch("/api/admin/expenses/:id", ...financeOnly, requireStaffCsrf, receiptUpload, validated(expenseUpdateSchema), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const [[existing]] = await db.query("SELECT id,receipt_path,amount,category,expense_date FROM expenses WHERE id=?", [id]);
    if (!existing) { if (req.file) removeUpload("expense-receipts", req.file.filename); return res.status(404).json({ message: "Expense not found." }); }
    const b = req.body;
    const linkError = await assertLinks(b);
    if (linkError) { if (req.file) removeUpload("expense-receipts", req.file.filename); return res.status(400).json({ message: linkError }); }
    let receiptPath = existing.receipt_path, receiptName;
    if (req.file) { receiptPath = req.file.filename; receiptName = String(req.file.originalname || "").slice(0, 255); }
    else if (b.remove_receipt) { receiptPath = null; receiptName = null; }
    const sets = ["expense_date=?", "category=?", "amount=?", "description=?", "booking_id=?", "rental_item_id=?", "receipt_path=?"];
    const params = [b.expense_date, b.category, b.amount, b.description, b.booking_id, b.rental_item_id, receiptPath];
    if (receiptName !== undefined) { sets.push("receipt_original_name=?"); params.push(receiptName); }
    await db.query(`UPDATE expenses SET ${sets.join(",")} WHERE id=?`, [...params, id]);
    if (existing.receipt_path && existing.receipt_path !== receiptPath) removeUpload("expense-receipts", existing.receipt_path);
    await audit(req, "UPDATE_EXPENSE", null, {
      expense_id: id,
      from: { amount: Number(existing.amount), category: existing.category, expense_date: toDateOnly(existing.expense_date) },
      to: { amount: b.amount, category: b.category, expense_date: b.expense_date }
    });
    res.json({ ok: true, message: "Expense updated." });
  } catch (err) { if (req.file) removeUpload("expense-receipts", req.file.filename); next(err); }
});

router.delete("/api/admin/expenses/:id", ...financeOnly, requireStaffCsrf, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const [[existing]] = await db.query("SELECT id,receipt_path,amount,category,expense_date,source_type,source_id FROM expenses WHERE id=?", [id]);
    if (!existing) return res.status(404).json({ message: "Expense not found." });
    await db.query("DELETE FROM expenses WHERE id=?", [id]);
    if (existing.receipt_path) removeUpload("expense-receipts", existing.receipt_path);
    await audit(req, "DELETE_EXPENSE", null, {
      expense_id: id, category: existing.category, amount: Number(existing.amount),
      expense_date: toDateOnly(existing.expense_date), source_type: existing.source_type, source_id: existing.source_id
    });
    res.json({ ok: true, message: "Expense deleted." });
  } catch (err) { next(err); }
});

router.get("/api/admin/expenses/:id/receipt", ...financeOnly, async (req, res, next) => {
  try {
    const [[row]] = await db.query("SELECT receipt_path,receipt_original_name FROM expenses WHERE id=?", [Number(req.params.id)]);
    if (!row?.receipt_path) return res.status(404).json({ message: "No receipt was uploaded for this expense." });
    const sent = await sendUpload(res, "expense-receipts", row.receipt_path, { name: row.receipt_original_name, inline: true });
    if (!sent) return res.status(404).json({ message: "The receipt file is no longer available." });
  } catch (err) { next(err); }
});

// Suggestions are read-only: nothing here touches the expenses table until the
// owner confirms one, so new maintenance/incident records never change the books by themselves.
async function loadSuggestions() {
  const [maintenance] = await db.query(`
    SELECT m.id,m.rental_item_id,m.booking_id,m.reason,m.cost AS amount,
      COALESCE(m.completed_at,m.opened_at) AS happened_at,r.name AS item_name,b.booking_no
    FROM maintenance_records m
    JOIN rental_items r ON r.id=m.rental_item_id
    LEFT JOIN bookings b ON b.id=m.booking_id
    WHERE m.status='completed' AND m.cost>0
      AND NOT EXISTS (SELECT 1 FROM expenses e WHERE e.source_type='maintenance' AND e.source_id=m.id)
      AND NOT EXISTS (SELECT 1 FROM expense_suggestion_dismissals d WHERE d.source_type='maintenance' AND d.source_id=m.id)
    ORDER BY happened_at DESC LIMIT 100`);
  const [incidents] = await db.query(`
    SELECT i.id,i.incident_no,i.rental_item_id,i.booking_id,i.incident_type,i.status,i.description,i.replacement_cost AS amount,
      COALESCE(i.resolved_at,i.reported_at) AS happened_at,r.name AS item_name,b.booking_no
    FROM incidents i
    JOIN rental_items r ON r.id=i.rental_item_id
    LEFT JOIN bookings b ON b.id=i.booking_id
    WHERE i.status IN ('resolved_charged','written_off') AND i.replacement_cost>0
      AND NOT EXISTS (SELECT 1 FROM expenses e WHERE e.source_type='incident' AND e.source_id=i.id)
      AND NOT EXISTS (SELECT 1 FROM expense_suggestion_dismissals d WHERE d.source_type='incident' AND d.source_id=i.id)
    ORDER BY happened_at DESC LIMIT 100`);
  return [
    ...maintenance.map(m => ({
      source_type: "maintenance", source_id: m.id, category: "Repairs & Maintenance", amount: Number(m.amount),
      date: toDateOnly(m.happened_at), description: `Maintenance: ${m.item_name} — ${m.reason}`,
      item_name: m.item_name, booking_no: m.booking_no || null
    })),
    ...incidents.map(i => ({
      source_type: "incident", source_id: i.id, category: "Damage & Loss", amount: Number(i.amount),
      date: toDateOnly(i.happened_at), description: `${i.incident_no}: ${String(i.incident_type).replaceAll("_", " ")} — ${i.item_name}`,
      item_name: i.item_name, booking_no: i.booking_no || null
    }))
  ].sort((a, b) => b.date.localeCompare(a.date));
}

router.get("/api/admin/expense-suggestions", ...financeOnly, async (_req, res, next) => {
  try { res.json({ suggestions: await loadSuggestions() }); } catch (err) { next(err); }
});

router.post("/api/admin/expense-suggestions/confirm", ...financeOnly, requireStaffCsrf, validated(suggestionConfirmSchema), async (req, res, next) => {
  const conn = await db.getConnection();
  try {
    const b = req.body;
    await conn.beginTransaction();
    const [[dismissed]] = await conn.query("SELECT id FROM expense_suggestion_dismissals WHERE source_type=? AND source_id=?", [b.source_type, b.source_id]);
    if (dismissed) { await conn.rollback(); return res.status(409).json({ message: "This suggestion was dismissed." }); }
    // Amount, date and links come from the source record; the client may only adjust the fields in the schema.
    const [[src]] = b.source_type === "maintenance"
      ? await conn.query(`SELECT m.id,m.rental_item_id,m.booking_id,m.cost AS amount,COALESCE(m.completed_at,m.opened_at) AS happened_at,
            CONCAT('Maintenance: ',r.name,' — ',m.reason) AS description,'Repairs & Maintenance' AS category
          FROM maintenance_records m JOIN rental_items r ON r.id=m.rental_item_id WHERE m.id=? AND m.status='completed' AND m.cost>0`, [b.source_id])
      : await conn.query(`SELECT i.id,i.rental_item_id,i.booking_id,i.replacement_cost AS amount,COALESCE(i.resolved_at,i.reported_at) AS happened_at,
            CONCAT(i.incident_no,': ',REPLACE(i.incident_type,'_',' '),' — ',r.name) AS description,'Damage & Loss' AS category
          FROM incidents i JOIN rental_items r ON r.id=i.rental_item_id
          WHERE i.id=? AND i.status IN ('resolved_charged','written_off') AND i.replacement_cost>0`, [b.source_id]);
    if (!src) { await conn.rollback(); return res.status(404).json({ message: "That suggestion is no longer available." }); }
    const values = {
      expense_date: b.expense_date || toDateOnly(src.happened_at),
      category: b.category || src.category,
      amount: b.amount ?? Number(src.amount),
      description: (b.description || src.description).slice(0, 255)
    };
    try {
      const [result] = await conn.query(
        `INSERT INTO expenses(expense_date,category,amount,description,booking_id,rental_item_id,source_type,source_id,recorded_by_user_id)
         VALUES(?,?,?,?,?,?,?,?,?)`,
        [values.expense_date, values.category, values.amount, values.description, src.booking_id, src.rental_item_id, b.source_type, b.source_id, req.user.id]
      );
      await conn.commit();
      await audit(req, "CONFIRM_EXPENSE_SUGGESTION", null, { expense_id: result.insertId, source_type: b.source_type, source_id: b.source_id, amount: values.amount });
      res.status(201).json({ ok: true, id: result.insertId, message: "Suggested expense added to your records." });
    } catch (err) {
      await conn.rollback();
      if (err.code === "ER_DUP_ENTRY") return res.status(409).json({ message: "This suggestion has already been added." });
      throw err;
    }
  } catch (err) { try { await conn.rollback(); } catch {} next(err); }
  finally { conn.release(); }
});

router.post("/api/admin/expense-suggestions/dismiss", ...financeOnly, requireStaffCsrf, validated(suggestionSourceSchema), async (req, res, next) => {
  try {
    const { source_type, source_id } = req.body;
    // One statement checks "not already confirmed" and inserts, so a confirm landing in between cannot leave both rows.
    const [result] = await db.query(
      `INSERT IGNORE INTO expense_suggestion_dismissals(source_type,source_id,dismissed_by_user_id)
       SELECT ?,?,? FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM expenses WHERE source_type=? AND source_id=?)`,
      [source_type, source_id, req.user.id, source_type, source_id]
    );
    if (!result.affectedRows) {
      const [[confirmed]] = await db.query("SELECT id FROM expenses WHERE source_type=? AND source_id=?", [source_type, source_id]);
      if (confirmed) return res.status(409).json({ message: "This suggestion has already been added to your expenses." });
    }
    await audit(req, "DISMISS_EXPENSE_SUGGESTION", null, { source_type, source_id });
    res.json({ ok: true, message: "Suggestion dismissed." });
  } catch (err) { next(err); }
});

router.get("/api/admin/finance/profit-loss", ...financeOnly, async (req, res, next) => {
  try {
    const count = Math.min(24, Math.max(1, Math.floor(Number(req.query.months)) || 12));
    res.json({ ...(await profitAndLoss(count)), current_month: await currentMonth() });
  } catch (err) { next(err); }
});

router.get("/api/admin/finance/summary", ...financeOnly, async (_req, res, next) => {
  try {
    const { months } = await profitAndLoss(1);
    res.json(months[0]);
  } catch (err) { next(err); }
});

export default router;
