import bcrypt from "bcryptjs";
import crypto from "crypto";
import { Router } from "express";
import { parseBody, schemas } from "../lib/validate.js";
import { db } from "../lib/db.js";
import { signToken, setStaffSession, authenticate, requireStaffCsrf, revokeJti, clearStaffSession } from "../lib/auth.js";
import { audit, changedFields } from "../lib/audit.js";

const router = Router();

const LOGIN_FAILED = "Invalid email or password. After 5 failed attempts, sign-in is paused for 15 minutes.";

// Compared against when the email is unknown so that response takes as long as a real one.
const DUMMY_PASSWORD_HASH = bcrypt.hashSync(crypto.randomBytes(32).toString("hex"), 12);

router.post("/api/auth/login", parseBody(schemas.staffLogin), async (req,res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");
  const [rows] = await db.query(
    "SELECT *, (locked_until IS NOT NULL AND locked_until>NOW()) AS is_locked FROM users WHERE email=? LIMIT 1",
    [email]
  );
  const user = rows[0];
  // Unknown email, wrong password and a locked account all get the same reply,
  // and a bcrypt compare always runs, so a response never reveals whether an
  // email belongs to a staff account.
  const ok = await bcrypt.compare(password, user?.password_hash || DUMMY_PASSWORD_HASH);
  if (!user || Number(user.is_locked)) {
    await audit(req, user ? "LOGIN_BLOCKED_LOCKED" : "LOGIN_FAILED_UNKNOWN_EMAIL", user?.id || null, {email});
    return res.status(401).json({message:LOGIN_FAILED});
  }
  if (!ok) {
    const attempts = Number(user.failed_login_attempts || 0) + 1;
    if (attempts >= 5) {
      await db.query("UPDATE users SET failed_login_attempts=0,locked_until=DATE_ADD(NOW(),INTERVAL 15 MINUTE) WHERE id=?",[user.id]);
      await audit(req, "ACCOUNT_LOCKED", user.id, {email, attempts});
    } else {
      await db.query("UPDATE users SET failed_login_attempts=? WHERE id=?",[attempts,user.id]);
    }
    await audit(req, "LOGIN_FAILED", user.id, {email, attempts});
    return res.status(401).json({message:LOGIN_FAILED});
  }
  // Only someone who knows the password learns the account is disabled.
  if (user.status !== "active") {
    await audit(req, "LOGIN_BLOCKED_DISABLED", user.id, {email});
    return res.status(403).json({message:"This account is disabled."});
  }

  await db.query("UPDATE users SET failed_login_attempts=0,locked_until=NULL,last_login_at=NOW() WHERE id=?",[user.id]);
  const token = signToken(user);
  setStaffSession(res, token);
  req.user = user;
  await audit(req,"LOGIN_SUCCESS");
  res.json({user:{id:user.id,full_name:user.full_name,email:user.email,phone:user.phone,role:user.role,status:user.status}});
});

router.get("/api/auth/me", authenticate, async (req,res) => res.json({user:req.user}));

router.patch("/api/auth/profile", authenticate, requireStaffCsrf, parseBody(schemas.updateProfile), async (req,res) => {
  const fullName = req.body.full_name;
  const email = req.body.email;
  const phone = req.body.phone;
  const [duplicate] = await db.query("SELECT id FROM users WHERE email=? AND id<>? LIMIT 1",[email,req.user.id]);
  if (duplicate.length) return res.status(409).json({message:"That email address is already assigned to another staff account."});
  await db.query("UPDATE users SET full_name=?,email=?,phone=? WHERE id=?",[fullName,email,phone||null,req.user.id]);
  const [[user]] = await db.query("SELECT id,full_name,email,phone,role,status FROM users WHERE id=?",[req.user.id]);
  await audit(req,"UPDATE_OWN_PROFILE",req.user.id,{changes:changedFields(req.user,user,["full_name","email","phone"])});
  res.json({user});
});

router.post("/api/auth/logout", authenticate, requireStaffCsrf, async (req,res) => {
  await revokeJti(req.authPayload?.jti, req.authPayload?.exp);
  clearStaffSession(res);
  await audit(req,"LOGOUT");
  res.json({ok:true});
});

router.patch("/api/auth/change-password", authenticate, requireStaffCsrf, parseBody(schemas.changePassword), async (req,res) => {
  const current = req.body.current_password;
  const next = req.body.new_password;
  const [[row]] = await db.query("SELECT password_hash FROM users WHERE id=?",[req.user.id]);
  if (!await bcrypt.compare(current,row.password_hash)) return res.status(400).json({message:"Current password is incorrect."});
  const hash = await bcrypt.hash(next,12);
  // Stamped from Node's clock (not MySQL NOW()) so the fresh token issued below
  // can never look older than the change if the two clocks drift apart.
  await db.query("UPDATE users SET password_hash=?,password_changed_at=FROM_UNIXTIME(?) WHERE id=?",[hash,Math.floor(Date.now()/1000),req.user.id]);
  // Every older session is now rejected by authenticate(); give this one a fresh
  // token so the person who just changed their password stays signed in.
  await revokeJti(req.authPayload?.jti, req.authPayload?.exp);
  setStaffSession(res, signToken(req.user));
  await audit(req,"CHANGE_PASSWORD");
  res.json({ok:true});
});

export default router;
