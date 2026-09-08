import "dotenv/config";

const errors = [];
const warnings = [];
const prod = process.env.NODE_ENV === "production";
const origins = String(process.env.APP_ORIGINS || process.env.CLIENT_ORIGIN || "").split(",").map(x => x.trim()).filter(Boolean);

if (prod) {
  if ((process.env.JWT_SECRET || "").length < 64) errors.push("JWT_SECRET must be at least 64 characters.");
  if ((process.env.CSRF_SECRET || "").length < 64) errors.push("CSRF_SECRET must be at least 64 characters.");
  if ((process.env.DB_USER || "").toLowerCase() === "root") errors.push("DB_USER must not be root.");
  if (!process.env.DB_PASSWORD) errors.push("DB_PASSWORD is required.");
  if (!origins.length || origins.some(x => !x.startsWith("https://"))) errors.push("APP_ORIGINS must contain HTTPS production origin(s).");
  const remote = !["localhost","127.0.0.1","::1"].includes(process.env.DB_HOST || "");
  if (remote && String(process.env.DB_SSL).toLowerCase() !== "true") errors.push("DB_SSL=true is required for remote MySQL.");
}
if (process.env.INITIAL_ADMIN_PASSWORD) warnings.push("INITIAL_ADMIN_PASSWORD is still present. Remove it after bootstrap.");

console.log("Bloom&Borrow production security check");
for (const w of warnings) console.warn("WARNING:", w);
if (errors.length) {
  for (const e of errors) console.error("ERROR:", e);
  process.exit(1);
}
console.log("PASS: required production security configuration checks passed.");