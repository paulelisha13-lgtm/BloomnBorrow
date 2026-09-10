import bcrypt from "bcryptjs";
import "dotenv/config";
import { db } from "./db.js";

const email = (process.argv[2] || "admin@bloom-borrow.local").toLowerCase();
const password = process.argv[3];

if (!password) {
  console.error('Usage: node reset-admin-password.js <email> <newPassword>');
  process.exit(1);
}

const hash = await bcrypt.hash(password, 12);
const [result] = await db.query(
  "UPDATE users SET password_hash=?, password_changed_at=NOW(), failed_login_attempts=0, locked_until=NULL, status='active' WHERE email=?",
  [hash, email]
);

if (result.affectedRows === 0) {
  console.error(`No user found with email ${email}`);
} else {
  console.log(`Password reset for ${email}. Lock cleared. You can log in now.`);
}
await db.end();
