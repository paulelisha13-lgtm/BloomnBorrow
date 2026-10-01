import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const failures = [];
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
// Every frontend source file, plus the release docs.
const walk = dir => fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }).flatMap(e =>
  e.isDirectory() ? walk(path.join(dir, e.name)) : /\.jsx?$/.test(e.name) ? [path.join(dir, e.name)] : []) : [];
const targets = [
  ...walk(path.join(root, "src")),
  ...["README.md", "CLIENT-RELEASE.md", "FINAL-GO-LIVE.md"].map(x => path.join(root, x))
];

const forbidden = [
  "admin@bloom-borrow.local",
  "Admin123!",
  "mockDriverJobs",
  "showing demo assignments"
];

for (const file of targets) {
  if (!fs.existsSync(file)) continue;
  const text = fs.readFileSync(file, "utf8");
  const lines = text.split(/\r?\n/);
  for (const token of forbidden) {
    lines.forEach((line, index) => {
      if (line.includes(token)) {
        failures.push(`${path.relative(root,file)}:${index+1} contains forbidden production demo value: ${token}`);
      }
    });
  }
}

const apiPath = path.join(root, "src", "lib", "api.js");
if (fs.existsSync(apiPath)) {
  const api = fs.readFileSync(apiPath, "utf8");
  if (!api.includes('credentials: "include"')) {
    failures.push("src/lib/api.js is not sending cookie credentials.");
  }
}

for (const failure of failures) console.error("FAIL:", failure);

if (failures.length) {
  console.error(`\nRelease check failed with ${failures.length} issue(s).`);
  process.exit(1);
}

console.log("PASS: Static release checks passed.");