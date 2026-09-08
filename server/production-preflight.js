
import "dotenv/config";
import { db } from "./db.js";

const fail=[];
const warn=[];
const req=["DB_HOST","DB_USER","DB_PASSWORD","DB_NAME","JWT_SECRET","CSRF_SECRET","APP_ORIGINS"];
for(const k of req) if(!String(process.env[k]||"").trim()) fail.push(`${k} is missing.`);
if((process.env.JWT_SECRET||"").length<64) fail.push("JWT_SECRET must be at least 64 characters.");
if((process.env.CSRF_SECRET||"").length<64) fail.push("CSRF_SECRET must be at least 64 characters.");
if(process.env.JWT_SECRET===process.env.CSRF_SECRET) fail.push("JWT_SECRET and CSRF_SECRET must be different.");
if(String(process.env.DB_USER||"").toLowerCase()==="root") fail.push("DB_USER must not be root.");
const origins=String(process.env.APP_ORIGINS||"").split(",").map(x=>x.trim()).filter(Boolean);
if(!origins.length || origins.some(x=>!x.startsWith("https://"))) fail.push("APP_ORIGINS must use HTTPS.");
if(origins.some(x=>/localhost|127\.0\.0\.1/i.test(x))) fail.push("APP_ORIGINS must not use localhost.");
const remote=!["localhost","127.0.0.1","::1"].includes(String(process.env.DB_HOST||""));
if(remote && String(process.env.DB_SSL||"").toLowerCase()!=="true") fail.push("DB_SSL=true is required for remote MySQL.");
if(process.env.INITIAL_ADMIN_PASSWORD) warn.push("Remove INITIAL_ADMIN_* after bootstrap.");

try{
  await db.query("SELECT 1");
  const [[tables]]=await db.query(`SELECT COUNT(*) count FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name IN ('users','rental_items','customers','bookings','booking_items','payments')`);
  if(Number(tables.count)<6) fail.push("Required tables are missing. Run npm run migrate.");
  const [[admins]]=await db.query("SELECT COUNT(*) count FROM users WHERE role='admin' AND status='active'");
  if(Number(admins.count)<1) fail.push("No active Admin exists.");
  const [[demo]]=await db.query("SELECT COUNT(*) count FROM users WHERE email IN ('admin@bloom-borrow.local')");
  if(Number(demo.count)>0) fail.push("Demo staff accounts still exist.");
}catch(e){ fail.push(`Database check failed: ${e.message}`); }
finally{ try{await db.end()}catch{} }

console.log("\nBloom&Borrow Production Preflight");
for(const w of warn) console.warn("WARNING:",w);
for(const f of fail) console.error("FAIL:",f);
if(fail.length){console.error(`\nBLOCKED: ${fail.length} issue(s) must be fixed.`);process.exit(1);}
console.log("\nPASS: Production preflight passed.");
