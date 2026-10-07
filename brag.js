const fs = require("fs");
const path = require("path");
const { execFileSync, spawnSync } = require("child_process");

const url = process.argv.find(arg => /^https?:\/\//i.test(arg)) || null;
const checkOnly = process.argv.includes("--check");
const requestedFormats = String(process.env.DEMO_OUTPUT_FORMATS || "16x9,1x1,9x16")
  .split(",").map(value => value.trim()).filter(Boolean);
const allowedFormats = new Set(["16x9", "1x1", "9x16"]);
const formats = requestedFormats.filter(format => allowedFormats.has(format));
if (!formats.length) formats.push("16x9", "1x1", "9x16");

function progress(stage, percent, message) {
  console.log(`DEMO_PROGRESS ${JSON.stringify({ stage, percent, message, at: new Date().toISOString() })}`);
}

function run(label, script, args = [], stage = "running", percent = 0, message = label) {
  progress(stage, percent, message);
  console.log("\n=== " + label + " ===");
  // Stream child output live so the remote engine does not appear frozen
  // during Hyperframes' frame-by-frame render.
  const result = spawnSync(process.execPath, [script, ...args], {
    stdio: "inherit",
    env: process.env
  });

  if (result.status !== 0) {
    throw new Error(
      label + " failed with exit code " + result.status
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

  fs.rmSync("output/final", { recursive: true, force: true });
  fs.mkdirSync("output/final", { recursive: true });
  fs.mkdirSync("output", { recursive: true });

  run("REAL PRODUCT INSPECTION", "capture.js", [url], "inspect", 12, "Understanding the real product…");
  run("BRAG DIRECTOR EVIDENCE", "director.js", [], "direct", 28, "Choosing the strongest workflow…");
  run("REAL PRODUCT WORKFLOW", "runner.js", [url, maxSteps], "capture", 42, "Capturing real product interaction…");
  run("BRAG HYPERFRAMES COMPOSITION", "hyperframes-compose.js", [], "compose", 68, "Building the demo composition…");

  run("HYPERFRAMES CHECK + RENDER", "hyperframes-render.js", [
    "output/hyperframes-composition",
    "output/hyperframes-composition/composition",
    "output/final/brag.mp4"
  ], "render", 74, "Rendering the final video…");

  progress("verify", 98, "Verifying the finished demo…");

  const output = "output/final/brag.mp4";

  if (!fs.existsSync(output) || fs.statSync(output).size === 0) {
    throw new Error("BRAG did not produce brag.mp4.");
  }

  const final16x9 = "output/final/product-demo-16x9.mp4";
  const final9x16 = "output/final/product-demo-9x16.mp4";

  console.log("\nCreating delivery formats…");

  const deliveryTargets = {
    "16x9": [final16x9, "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2"],
    "1x1": ["output/final/product-demo-1x1.mp4", "scale=1080:1080:force_original_aspect_ratio=decrease,pad=1080:1080:(ow-iw)/2:(oh-ih)/2"],
    "9x16": [final9x16, "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2"]
  };
  for (const format of formats) {
    const [file, filter] = deliveryTargets[format];
    execFileSync("ffmpeg", [
      "-y", "-i", output, "-vf", filter,
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
      "-c:a", "aac", "-movflags", "+faststart", file
    ], { stdio: "inherit" });
  }

  const artifactFiles = [output, ...formats.map(format => deliveryTargets[format][0])];
  const artifactInfo = artifactFiles.map(file => ({ file, exists: fs.existsSync(file), bytes: fs.existsSync(file) ? fs.statSync(file).size : 0 }));
  const mediaInfo = artifactInfo.map(item => {
    if (!item.exists || item.bytes === 0) throw new Error("Delivery artifact is missing or empty: " + item.file);
    return item;
  });
  console.log("\nRunning production quality gate…");
  run("PRODUCTION QUALITY GATE", "production-gate.js", [], "verify", 99, "Checking dimensions, duration and delivery integrity…");

  console.log("\nDelivery artifacts:");
  console.log(JSON.stringify(artifactInfo, null, 2));

  for (const format of formats) {
    const file = deliveryTargets[format][0];
    if (!fs.existsSync(file) || fs.statSync(file).size === 0) {
      throw new Error("Demo did not produce the " + format + " delivery video.");
    }
  }

  fs.writeFileSync(
    "output/final/production.json",
    JSON.stringify({
      version: "4.0",
      generatedAt: new Date().toISOString(),
      output,
      visualSource: "real-browser-recording",
      renderer: "hyperframes",
      description: description || null,
      formats
    }, null, 2)
  );

  progress("complete", 100, "Demo ready.");
  console.log("\nBRAG production complete: " + output);
}

main();
