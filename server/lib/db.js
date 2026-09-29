import mysql from "mysql2/promise";
import "dotenv/config";

const isProduction = process.env.NODE_ENV === "production";
const dbHost = process.env.DB_HOST || "127.0.0.1";
const dbUser = process.env.DB_USER || "root";
const sslEnabled = String(process.env.DB_SSL || "").toLowerCase() === "true";
const ca = process.env.DB_SSL_CA_BASE64
  ? Buffer.from(process.env.DB_SSL_CA_BASE64, "base64").toString("utf8")
  : undefined;

if (isProduction) {
  if (!process.env.DB_PASSWORD) throw new Error("DB_PASSWORD is required in production.");
  if (dbUser.toLowerCase() === "root") throw new Error("Refusing to start: DB_USER must not be root in production.");
  const isLocalDb = ["127.0.0.1", "localhost", "::1"].includes(dbHost);
  if (!isLocalDb && !sslEnabled) {
    throw new Error("Refusing to start: DB_SSL=true is required for a remote production MySQL server.");
  }
}

export const db = mysql.createPool({
  host: dbHost,
  port: Number(process.env.DB_PORT || 3306),
  user: dbUser,
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "bloom_borrow",
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_POOL_SIZE || 10),
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000,
  charset: "utf8mb4",
  timezone: "Z",
  ssl: sslEnabled ? {
    rejectUnauthorized: String(process.env.DB_SSL_REJECT_UNAUTHORIZED || "true").toLowerCase() !== "false",
    ...(ca ? { ca } : {})
  } : undefined
});