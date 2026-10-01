import bcrypt from "bcryptjs";
import { Router } from "express";
import { authenticate, requireRole } from "../lib/auth.js";
import { db } from "../lib/db.js";
import { parseBody, schemas } from "../lib/validate.js";
import { AUDIT_RETENTION_DAYS } from "../jobs/auditRetention.js";
import { audit } from "../lib/audit.js";
import { parseDateOnly } from "../lib/dates.js";

const router = Router();

router.get("/api/users", authenticate, requireRole("admin"), async (req,res) => {
  const [users] = await db.query("SELECT id,full_name,email,phone,role,status,last_login_at,created_at FROM users ORDER BY created_at DESC");
  res.json({users});
});

router.post("/api/users", authenticate, requireRole("admin"), parseBody(schemas.createUser), async (req,res) => {
  const {full_name,phone,role} = req.body;
  const email = req.body.email;
  const password = req.body.password;
  const hash = await bcrypt.hash(password,12);
  try {
    const [result] = await db.query("INSERT INTO users(full_name,email,phone,password_hash,role,status,password_changed_at) VALUES(?,?,?,?,?,'active',NOW())",[full_name,email,phone||null,hash,role]);
    await audit(req,"CREATE_USER",result.insertId,{role,email});
    res.status(201).json({id:result.insertId});
  } catch (e) {
    if (e.code === "ER_DUP_ENTRY") return res.status(409).json({message:"That email address is already in use."});
    throw e;
  }
});

router.patch("/api/users/:id/status", authenticate, requireRole("admin"), async (req,res) => {
  const id = Number(req.params.id);
  const status = req.body.status;
  if (!["active","disabled"].includes(status)) return res.status(400).json({message:"Invalid status."});
  if (id === req.user.id && status === "disabled") return res.status(400).json({message:"You cannot disable your own account."});
  await db.query("UPDATE users SET status=? WHERE id=?",[status,id]);
  await audit(req,status==="disabled"?"DISABLE_USER":"ENABLE_USER",id,{status});
  res.json({ok:true});
});

router.patch("/api/users/:id/reset-password", authenticate, requireRole("admin"), parseBody(schemas.resetPassword), async (req,res) => {
  const id = Number(req.params.id);
  const password = req.body.password;
  const hash = await bcrypt.hash(password,12);
  await db.query("UPDATE users SET password_hash=?,password_changed_at=NOW(),failed_login_attempts=0,locked_until=NULL WHERE id=?",[hash,id]);
  await audit(req,"RESET_PASSWORD",id);
  res.json({ok:true});
});

// Audit log viewer. Read-only by design: there is deliberately no endpoint that
// edits or deletes audit rows. Filters: q (free text), action, actor (user id
// or "guest"), from/to (YYYY-MM-DD, inclusive), limit (max 500, or 5000 with
// export=1 for CSV downloads), offset.
router.get("/api/access/audit", authenticate, requireRole("admin"), async (req,res) => {
  const where = [];
  const params = [];
  const q = String(req.query.q || "").trim().slice(0,100);
  if (q) {
    const like = `%${q.replace(/[\\%_]/g, m => `\\${m}`)}%`;
    where.push("(l.action LIKE ? OR u.full_name LIKE ? OR u.email LIKE ? OR t.full_name LIKE ? OR l.ip_address LIKE ? OR CAST(l.details AS CHAR) LIKE ?)");
    params.push(like,like,like,like,like,like);
  }
  const action = String(req.query.action || "").trim();
  if (/^[A-Z_]{1,80}$/.test(action)) { where.push("l.action=?"); params.push(action); }
  const actor = String(req.query.actor || "").trim();
  if (actor === "guest") where.push("l.user_id IS NULL");
  else if (/^\d+$/.test(actor)) { where.push("l.user_id=?"); params.push(Number(actor)); }
  const from = parseDateOnly(req.query.from), to = parseDateOnly(req.query.to);
  if (from) { where.push("l.created_at>=?"); params.push(req.query.from); }
  if (to) { where.push("l.created_at<DATE_ADD(?,INTERVAL 1 DAY)"); params.push(req.query.to); }

  const maxLimit = req.query.export === "1" ? 5000 : 500;
  const limit = Math.min(maxLimit, Math.max(1, Number(req.query.limit) || 100));
  const offset = Math.max(0, Number(req.query.offset) || 0);
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const from_sql = `FROM access_audit_logs l
    LEFT JOIN users u ON u.id=l.user_id
    LEFT JOIN users t ON t.id=l.target_user_id`;

  const [[{total}]] = await db.query(`SELECT COUNT(*) total ${from_sql} ${whereSql}`, params);
  const [logs] = await db.query(`
    SELECT l.id,l.action,l.user_id,l.target_user_id,l.ip_address,l.user_agent,l.details,l.created_at,
      u.full_name AS actor_name,u.email AS actor_email,t.full_name AS target_name,t.email AS target_email
    ${from_sql} ${whereSql}
    ORDER BY l.created_at DESC,l.id DESC LIMIT ? OFFSET ?
  `, [...params, limit, offset]);
  const [actions] = await db.query("SELECT DISTINCT action FROM access_audit_logs ORDER BY action");
  const [actors] = await db.query("SELECT id,full_name,email FROM users ORDER BY full_name");

  if (req.query.export === "1") await audit(req,"EXPORT_AUDIT_LOG",null,{rows:logs.length,filters:{q,action,actor,from:req.query.from||null,to:req.query.to||null}});
  res.json({logs,total:Number(total),limit,offset,actions:actions.map(x=>x.action),actors,retention_days:AUDIT_RETENTION_DAYS});
});

export default router;
