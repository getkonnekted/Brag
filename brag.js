const fs = require("fs");
const path = require("path");
const { execFileSync, spawnSync } = require("child_process");

const url = process.argv.find(a => /^https?:\/\//i.test(a)) || null;
const checkOnly = process.argv.includes("--check");

function run(label, script, args = [], options = {}) {
  console.log("\n=== " + label + " ===");
  const result = spawnSync(process.execPath, [script, ...args], {
    stdio: "inherit",
    env: process.env,
    ...options
  });
  if (result.status !== 0) {
    throw new Error(label + " failed with exit code " + result.status);
  }
}

function ensureCommand(command) {
  try {
    execFileSync(command, ["-version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function checkEnvironment() {
  const checks = [
    ["Node.js", Boolean(process.version)],
    ["FFmpeg", ensureCommand("ffmpeg")],
    ["Playwright package", fs.existsSync(path.join(__dirname, "node_modules", "playwright"))]
  ];
  if (!checks.every(([, ok]) => ok)) {
    console.error(JSON.stringify(Object.fromEntries(checks.map(([name, ok]) => [name, ok])), null, 2));
    throw new Error("BRAG environment check failed.");
  }
  console.log(JSON.stringify(Object.fromEntries(checks.map(([name, ok]) => [name, ok])), null, 2));
}

function finalOutputs() {
  return [
    "brag-demo-16x9.mp4",
    "brag-demo-9x16.mp4",
    "brag-demo-1x1.mp4"
  ].map(name => path.join("output", "render", name));
}

function writeFinalManifest(qaReport) {
  const finalDir = path.join("output", "final");
  fs.mkdirSync(finalDir, { recursive: true });
  const files = finalOutputs();

  for (const file of files) {
    if (!fs.existsSync(file) || fs.statSync(file).size === 0) {
      throw new Error("Missing final render: " + file);
    }
    fs.copyFileSync(file, path.join(finalDir, path.basename(file).replace("brag-demo-", "product-demo-")));
  }

  const artifacts = {
    "report.json": "output/qa/report.json",
    "qa-report.json": "output/qa/report.json",
    "storyboard.json": "output/storyboard.json",
    "shot-plan.json": "output/shot-plan.json"
  };

  for (const [name, source] of Object.entries(artifacts)) {
    if (fs.existsSync(source)) fs.copyFileSync(source, path.join(finalDir, name));
  }

  fs.writeFileSync(path.join(finalDir, "production.json"), JSON.stringify({
    version: "2.0",
    generatedAt: new Date().toISOString(),
    outputs: files.map(file => path.join("output", "final", path.basename(file).replace("brag-demo-", "product-demo-"))),
    qa: qaReport || null
  }, null, 2));
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

  const maxSteps = process.argv[process.argv.indexOf(url) + 1] || "4";
  const urlIndex = process.argv.indexOf(url);
  const description = process.argv.slice(urlIndex + 2).filter(x => !x.startsWith("--")).join(" ");

  fs.mkdirSync("output", { recursive: true });

  run("INSPECT", "capture.js", [url]);
  run("DIRECT", "director.js");

  run("CAPTURE", "runner.js", [url, maxSteps]);

  run("BUILD DEMO PACKAGE", "demo.js", [url, maxSteps, description]);
  run("HUMAN EDIT PLAN", "edit-plan.js", ["output/demo/package.json"]);

  if (process.env.PIPER_MODEL) {
    run("NARRATE", "voice.js", ["output/demo/package.json"]);
  } else {
    console.log("\n=== NARRATE ===");
    console.log("Skipped local Piper TTS: PIPER_MODEL is not set.");
  }

  run("RENDER", "render.js", ["output/demo/package.json"]);
  run("QA", "qa.js", ["output/demo/package.json"]);

  const qaPath = "output/qa/report.json";
  const qa = fs.existsSync(qaPath) ? JSON.parse(fs.readFileSync(qaPath, "utf8")) : null;
  if (qa && qa.status === "fail") {
    console.error("\nBRAG stopped before final handoff because QA failed.");
    process.exit(2);
  }

  writeFinalManifest(qa);
  console.log("\nBRAG production complete.");
  console.log("Final videos: output/final/");
}

main();
