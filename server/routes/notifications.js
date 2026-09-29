import { Router } from "express";
import { authenticate } from "../lib/auth.js";
import { db } from "../lib/db.js";

const router = Router();

router.get("/api/notifications", authenticate, async (req,res) => {
  const [notifications]=await db.query("SELECT * FROM notifications WHERE user_id=? OR user_id IS NULL ORDER BY created_at DESC LIMIT 100",[req.user.id]);
  res.json({notifications});
});

router.patch("/api/notifications/:id/read", authenticate, async (req,res) => {
  await db.query("UPDATE notifications SET status='read',read_at=NOW() WHERE id=? AND (user_id=? OR user_id IS NULL)",[Number(req.params.id),req.user.id]);
  res.json({ok:true});
});

export default router;
