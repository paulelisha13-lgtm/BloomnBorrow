import fs from "fs";
import path from "path";

const failures = [];
const root = path.resolve("..");
const targets = [
  "src/App.jsx",
  "src/api.js",
  "README.md",
  "CLIENT-RELEASE.md",
  "FINAL-GO-LIVE.md"
].map(x => path.join(root, x));

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

const apiPath = path.join(root, "src", "api.js");
if (fs.existsSync(apiPath)) {
  const api = fs.readFileSync(apiPath, "utf8");
  if (!api.includes('credentials: "include"')) {
    failures.push("src/api.js is not sending cookie credentials.");
  }
}

for (const failure of failures) console.error("FAIL:", failure);

if (failures.length) {
  console.error(`\nRelease check failed with ${failures.length} issue(s).`);
  process.exit(1);
}

console.log("PASS: Static release checks passed.");