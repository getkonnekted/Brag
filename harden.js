const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const required = [
  "capture.js",
  "director.js",
  "runner.js",
  "demo.js",
  "edit-plan.js",
  "render.js",
  "voice.js",
  "qa.js",
  "cinematography.js",
  "brag.js"
];

const checks = [];

function add(id, ok, detail) {
  checks.push({ id, status: ok ? "pass" : "fail", detail });
}

for (const file of required) {
  const full = path.join(__dirname, file);
  add("source:" + file, fs.existsSync(full), fs.existsSync(full) ? "present" : "missing");
}

for (const command of ["node", "ffmpeg"]) {
  try {
    execFileSync(command, command === "node" ? ["--version"] : ["-version"], { stdio: "ignore" });
    add("dependency:" + command, true, "available");
  } catch {
    add("dependency:" + command, false, "not available");
  }
}

const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, "package.json"), "utf8"));
add("version", packageJson.version === "2.2.0", "package version is " + packageJson.version);
add("personal-tool-scope", packageJson.private === true, "private package: " + packageJson.private);

const failed = checks.filter(x => x.status === "fail");
const report = {
  version: "2.2",
  checkedAt: new Date().toISOString(),
  status: failed.length ? "fail" : "pass",
  checks
};

fs.mkdirSync("output/qa", { recursive: true });
fs.writeFileSync("output/qa/hardening.json", JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));

if (failed.length) process.exit(2);
