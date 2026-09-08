import fs from "fs";
import path from "path";
import mysql from "mysql2/promise";
import "dotenv/config";

const database = process.env.DB_NAME || "bloom_borrow";
const isProduction = process.env.NODE_ENV === "production";

if (isProduction && String(process.env.DB_USER || "").toLowerCase() === "root") {
  throw new Error("Production migrations must not use the MySQL root account.");
}

const sslEnabled = String(process.env.DB_SSL || "").toLowerCase() === "true";
const ca = process.env.DB_SSL_CA_BASE64
  ? Buffer.from(process.env.DB_SSL_CA_BASE64, "base64").toString("utf8")
  : undefined;

const conn = await mysql.createConnection({
  host: process.env.DB_HOST || "127.0.0.1",
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  multipleStatements: true,
  ssl: sslEnabled ? {
    rejectUnauthorized: String(process.env.DB_SSL_REJECT_UNAUTHORIZED || "true").toLowerCase() !== "false",
    ...(ca ? { ca } : {})
  } : undefined
});

await conn.query(`CREATE DATABASE IF NOT EXISTS \`${database.replace(/`/g, "")}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
await conn.query(`USE \`${database.replace(/`/g, "")}\``);

let sql = fs.readFileSync(path.resolve("schema.sql"), "utf8");
sql = sql.replace(/CREATE DATABASE IF NOT EXISTS[\s\S]*?;\s*USE\s+\w+\s*;/i, "");
await conn.query(sql);
await conn.end();
console.log("Database migration completed.");