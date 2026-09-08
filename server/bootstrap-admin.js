import bcrypt from "bcryptjs";
import dotenv from "dotenv";
import fs from "fs";
import readline from "readline";
import { db } from "./db.js";

if (fs.existsSync(".env")) {
  dotenv.config({ path: ".env" });
} else if (fs.existsSync(".env.production")) {
  dotenv.config({ path: ".env.production" });
} else {
  dotenv.config();
}

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (answer) => {
    rl.close();
    resolve(answer.trim());
  }));
}

function askHidden(question) {
  return new Promise((resolve, reject) => {
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
      reject(new Error("Interactive password entry requires a terminal. Set INITIAL_ADMIN_PASSWORD in server/.env instead."));
      return;
    }

    process.stdout.write(question);
    process.stdin.resume();
    process.stdin.setRawMode(true);
    process.stdin.setEncoding("utf8");
    let value = "";

    const cleanup = () => {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdin.removeListener("data", onData);
    };

    const onData = (char) => {
      if (char === "\u0003") {
        cleanup();
        process.stdout.write("\n");
        process.exit(130);
      }
      if (char === "\r" || char === "\n") {
        cleanup();
        process.stdout.write("\n");
        resolve(value);
        return;
      }
      if (char === "\u007f" || char === "\b") {
        if (value.length > 0) {
          value = value.slice(0, -1);
          process.stdout.write("\b \b");
        }
        return;
      }
      if (char >= " ") {
        value += char;
        process.stdout.write("*");
      }
    };

    process.stdin.on("data", onData);
  });
}

function validatePassword(password) {
  if (password.length < 14) return "Password must be at least 14 characters.";
  if (/admin123|password|bloom_borrow/i.test(password)) return "Password is too predictable.";
  if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
    return "Password must include uppercase, lowercase, number, and symbol.";
  }
  return null;
}

let name = String(process.env.INITIAL_ADMIN_NAME || "").trim();
let email = String(process.env.INITIAL_ADMIN_EMAIL || "").trim().toLowerCase();
let password = String(process.env.INITIAL_ADMIN_PASSWORD || "");

const [[count]] = await db.query("SELECT COUNT(*) AS count FROM users WHERE role='admin'");

if (Number(count.count) > 0) {
  console.log("An Admin already exists. Bootstrap skipped.");
  await db.end();
  process.exit(0);
}

console.log("\nBloom&Borrow Initial Admin Setup");
console.log("----------------------------");

if (!name) name = await ask("Admin full name: ");
if (!email) email = (await ask("Admin email: ")).toLowerCase();
if (!password) password = await askHidden("Admin password (14+ chars): ");

if (!name) throw new Error("Admin name is required.");
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Enter a valid Admin email address.");

const passwordError = validatePassword(password);
if (passwordError) throw new Error(passwordError);

const confirmPassword = process.env.INITIAL_ADMIN_PASSWORD ? password : await askHidden("Confirm password: ");
if (password !== confirmPassword) throw new Error("Passwords do not match.");

const hash = await bcrypt.hash(password, 12);

await db.query(
  `INSERT INTO users
    (full_name, email, password_hash, role, status, password_changed_at)
   VALUES (?, ?, ?, 'admin', 'active', NOW())`,
  [name, email, hash]
);

console.log(`\nInitial Admin created successfully: ${email}`);
if (process.env.INITIAL_ADMIN_PASSWORD) {
  console.log("Security reminder: remove INITIAL_ADMIN_NAME, INITIAL_ADMIN_EMAIL, and INITIAL_ADMIN_PASSWORD from the production environment now.");
} else {
  console.log("No Admin password was stored in an environment file.");
}

await db.end();
