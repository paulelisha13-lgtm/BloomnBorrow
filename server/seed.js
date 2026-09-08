import fs from "fs";
import path from "path";
import mysql from "mysql2/promise";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import "dotenv/config";

if (process.env.NODE_ENV === "production") {
  console.error("[seed] REFUSED: development seed data cannot run in production.");
  console.error("Use: npm run migrate && npm run bootstrap-admin");
  process.exit(1);
}

import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_HOST = process.env.DB_HOST || "127.0.0.1";
const DB_PORT = Number(process.env.DB_PORT || 3306);
const DB_USER = process.env.DB_USER || "root";
const DB_PASSWORD = process.env.DB_PASSWORD || "";
const DB_NAME = process.env.DB_NAME || "bloom_borrow";

const seedAdminPassword = String(process.env.SEED_ADMIN_PASSWORD || crypto.randomBytes(24).toString("base64url"));
const users = [
  {
    full_name: "System Admin",
    email: "admin@bloom-borrow.local",
    phone: "+63 917 000 0001",
    role: "admin",
    password: seedAdminPassword
  }
];

let bootstrap;
let db;

try {
  console.log("[seed] Connecting to MySQL...");

  // Connect WITHOUT selecting a database first.
  // This allows the seed command to work even when `bloom_borrow` does not exist yet.
  bootstrap = await mysql.createConnection({
    host: DB_HOST,
    port: DB_PORT,
    user: DB_USER,
    password: DB_PASSWORD,
    multipleStatements: true
  });

  console.log(`[seed] Creating database "${DB_NAME}" if needed...`);
  await bootstrap.query(
    `CREATE DATABASE IF NOT EXISTS \`${DB_NAME.replace(/`/g, "``")}\`
     CHARACTER SET utf8mb4
     COLLATE utf8mb4_unicode_ci`
  );

  await bootstrap.end();
  bootstrap = null;

  // Connect to the actual application database.
  db = await mysql.createConnection({
    host: DB_HOST,
    port: DB_PORT,
    user: DB_USER,
    password: DB_PASSWORD,
    database: DB_NAME,
    multipleStatements: true
  });

  console.log("[seed] Applying database schema...");
  let schema = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8");

  // schema.sql contains CREATE DATABASE / USE for manual execution.
  // Remove them here because this connection already selected DB_NAME.
  schema = schema
    .replace(/CREATE\s+DATABASE\s+IF\s+NOT\s+EXISTS[\s\S]*?;\s*/i, "")
    .replace(/USE\s+[`]?[\w-]+[`]?\s*;\s*/i, "");

  await db.query(schema);

  console.log("[seed] Creating/updating local development users...");

  let seededAdminWasExisting = false;
  for (const user of users) {
    const [[existingUser]] = await db.query("SELECT id FROM users WHERE email=? LIMIT 1", [user.email]);
    seededAdminWasExisting ||= Boolean(existingUser);
    const hash = await bcrypt.hash(user.password, 12);

    await db.execute(
      `
      INSERT INTO users
        (full_name, email, phone, password_hash, role, status,
         failed_login_attempts, locked_until, password_changed_at)
      VALUES (?, ?, ?, ?, ?, 'active', 0, NULL, NOW())
      ON DUPLICATE KEY UPDATE
        full_name = VALUES(full_name),
        phone = VALUES(phone),
        role = VALUES(role),
        status = 'active',
        failed_login_attempts = 0,
        locked_until = NULL,
        password_changed_at = NOW()
      `,
      [
        user.full_name,
        user.email,
        user.phone,
        hash,
        user.role
      ]
    );
  }


  console.log("[seed] Creating/updating rental catalog...");

  const rentalItems = [
    ["RF-CAM-001","Canon EOS R50 Camera","Camera","Compact mirrorless camera package for events, content creation, and travel.",1200,3000,4,"https://images.unsplash.com/photo-1502920917128-1aa500764cbd?auto=format&fit=crop&w=900&q=80"],
    ["RF-AUD-001","JBL PartyBox Speaker","Audio","Portable high-output speaker for birthdays, parties, and small outdoor events.",850,1800,6,"https://images.unsplash.com/photo-1545454675-3531b543be5d?auto=format&fit=crop&w=900&q=80"],
    ["RF-EVT-001","Projector + Screen Set","Events","HD projector bundle ideal for presentations, movie nights, and events.",1500,2500,3,"https://images.unsplash.com/photo-1478720568477-152d9b164e26?auto=format&fit=crop&w=900&q=80"],
    ["RF-OUT-001","Premium Camping Tent","Outdoor","Water-resistant four-person tent with quick setup and compact storage.",650,1000,8,"https://images.unsplash.com/photo-1504280390367-361c6d9f38f4?auto=format&fit=crop&w=900&q=80"],
    ["RF-TOL-001","Makita Power Tool Kit","Tools","Multi-tool rental package for home improvement and professional projects.",900,2200,5,"https://images.unsplash.com/photo-1504148455328-c376907d081c?auto=format&fit=crop&w=900&q=80"],
    ["RF-EVT-002","Folding Table & Chair Set","Events","Convenient event furniture set for parties, meetings, and gatherings.",500,900,12,"https://images.unsplash.com/photo-1507501336603-6e31db2be093?auto=format&fit=crop&w=900&q=80"]
  ];

  for (const item of rentalItems) {
    await db.execute(`
      INSERT INTO rental_items
        (sku,name,category,description,daily_price,security_deposit,total_quantity,status,image_url)
      VALUES (?,?,?,?,?,?,?,'active',?)
      ON DUPLICATE KEY UPDATE
        name=VALUES(name),
        category=VALUES(category),
        description=VALUES(description),
        daily_price=VALUES(daily_price),
        security_deposit=VALUES(security_deposit),
        total_quantity=VALUES(total_quantity),
        status='active',
        image_url=VALUES(image_url)
    `, item);
  }

  console.log("[seed] Driver jobs are created only from real booking assignments.\n");

  const [seededUsers] = await db.query(
    "SELECT id, full_name, email, role, status FROM users ORDER BY id"
  );

  console.log("");
  console.log("========================================");
  console.log(" Bloom&Borrow seed completed successfully");
  console.log("========================================");
  console.table(seededUsers);
  if (!seededAdminWasExisting) {
    console.log(`Admin : admin@bloom-borrow.local / ${seedAdminPassword}`);
    console.log("Save this generated development password now. Later seed runs preserve it.");
  } else {
    console.log("Admin account preserved. Its existing password was not changed.");
  }
  
  console.log("[seed] Creating default business settings...");
  const settings = [
    ["business_name","Bloom&Borrow Rental Services"],
    ["business_email","hello@bloom-borrow.local"],
    ["business_phone","+63 917 000 0000"],
    ["business_address","Metro Manila, Philippines"],
    ["delivery_fee","300"],
    ["late_fee_per_day","250"],
    ["currency","PHP"],
    ["cancellation_policy","Bookings may be cancelled before preparation. Refunds are subject to payment status and business policy."],
    ["notification_email_enabled","0"],
    ["notification_sms_enabled","0"]
  ];
  for (const [key,value] of settings) {
    await db.execute(
      "INSERT INTO business_settings(setting_key,setting_value) VALUES(?,?) ON DUPLICATE KEY UPDATE setting_value=setting_value",
      [key,value]
    );
  }

console.log("");

} catch (error) {
  console.error("");
  console.error("[seed] FAILED");
  console.error(error?.message || error);

  if (error?.code === "ER_ACCESS_DENIED_ERROR") {
    console.error(
      "\nCheck DB_USER and DB_PASSWORD in server/.env. " +
      "The MySQL username/password is incorrect."
    );
  } else if (error?.code === "ECONNREFUSED") {
    console.error(
      "\nMySQL is not accepting connections. Make sure the MySQL service is running " +
      `on ${DB_HOST}:${DB_PORT}.`
    );
  } else if (error?.code === "ER_NOT_SUPPORTED_AUTH_MODE") {
    console.error(
      "\nYour MySQL authentication plugin is not supported by the current client. " +
      "Update mysql2 or adjust the MySQL user authentication method."
    );
  }

  process.exitCode = 1;
} finally {
  try {
    if (bootstrap) await bootstrap.end();
  } catch {}
  try {
    if (db) await db.end();
  } catch {}
}
