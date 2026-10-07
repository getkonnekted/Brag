const fs = require("fs");
const path = require("path");
const { execFileSync, spawnSync } = require("child_process");

const url = process.argv.find(arg => /^https?:\/\//i.test(arg)) || null;
const checkOnly = process.argv.includes("--check");

function run(label, script, args = []) {
  console.log("\n=== " + label + " ===");
  const result = spawnSync(process.execPath, [script, ...args], {
    stdio: ["inherit", "pipe", "pipe"],
    env: process.env,
    encoding: "utf8"
  });

  const stdout = (result.stdout || "").trim();
  const stderr = (result.stderr || "").trim();
  if (stdout) process.stdout.write(stdout + "\n");
  if (stderr) process.stderr.write(stderr + "\n");

  if (result.status !== 0) {
    throw new Error(
      label + " failed with exit code " + result.status +
      ((stdout || stderr) ? "\n" + [stdout, stderr].filter(Boolean).join("\n") : "")
    );
  }
}

function ensureCommand(command, args) {
  try {
    execFileSync(command, args, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function checkEnvironment() {
  const checks = [
    ["Node.js", Boolean(process.version)],
    ["FFmpeg", ensureCommand("ffmpeg", ["-version"])],
    ["Playwright", fs.existsSync(path.join(__dirname, "node_modules", "playwright"))],
    ["Hyperframes", ensureCommand("npx", ["hyperframes", "--version"])]
  ];

  console.log(JSON.stringify(Object.fromEntries(checks), null, 2));

  if (!checks.every(([, ok]) => ok)) {
    throw new Error("BRAG environment check failed.");
  }
}

function main() {
  checkEnvironment();

  if (checkOnly) {
    console.log("BRAG environment is ready.");
    return;
  }

  if (!url) {
    console.error("Usage: npm run brag -- https://example.com [maxSteps] [description]");
    process.exit(1);
  }

  const urlIndex = process.argv.indexOf(url);
  const maxSteps = process.argv[urlIndex + 1] || "4";
  const description = process.argv
    .slice(urlIndex + 2)
    .filter(value => !value.startsWith("--"))
    .join(" ");

  fs.mkdirSync("output", { recursive: true });

  run("REAL PRODUCT INSPECTION", "capture.js", [url]);
  run("BRAG DIRECTOR EVIDENCE", "director.js");
  run("REAL PRODUCT WORKFLOW", "runner.js", [url, maxSteps]);
  run("BRAG HYPERFRAMES COMPOSITION", "hyperframes-compose.js");

  run("HYPERFRAMES CHECK + RENDER", "hyperframes-render.js", [
    "output/hyperframes-composition",
    "output/hyperframes-composition/composition",
    "output/final/brag.mp4"
  ]);

  const output = "output/final/brag.mp4";

  if (!fs.existsSync(output) || fs.statSync(output).size === 0) {
    throw new Error("BRAG did not produce brag.mp4.");
  }

  fs.writeFileSync(
    "output/final/production.json",
    JSON.stringify({
      version: "4.0",
      generatedAt: new Date().toISOString(),
      output,
      visualSource: "real-browser-recording",
      renderer: "hyperframes",
      description: description || null
    }, null, 2)
  );

  console.log("\nBRAG production complete: " + output);
}

main();
