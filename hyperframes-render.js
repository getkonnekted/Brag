const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const outputDir = path.resolve(process.argv[2] || "output/brag-output");
const compositionDir = path.resolve(
  process.argv[3] || path.join(outputDir, "composition")
);
const outputFile = path.resolve(
  process.argv[4] || path.join(outputDir, "brag.mp4")
);

function run(args) {
  console.log("\n$ npx hyperframes " + args.join(" "));
  const result = spawnSync(
    process.platform === "win32" ? "npx.cmd" : "npx",
    ["hyperframes", ...args],
    {
      cwd: compositionDir,
      env: { ...process.env, PRODUCER_FORCE_SCREENSHOT: process.env.PRODUCER_FORCE_SCREENSHOT || "true" },
      stdio: "inherit"
    }
  );

  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

if (!fs.existsSync(compositionDir)) {
  console.error("Hyperframes composition directory not found:", compositionDir);
  console.error("Expected a Hyperframes composition at:", compositionDir);
  process.exit(1);
}

const indexPath = path.join(compositionDir, "index.html");
if (!fs.existsSync(indexPath)) {
  console.error("Hyperframes composition index.html not found:", indexPath);
  process.exit(1);
}

fs.mkdirSync(outputDir, { recursive: true });

console.log("demo. → Hyperframes");
console.log("Composition:", compositionDir);
console.log("Output:", outputFile);

run(["check", "--no-browser-gpu"]);
run(["render", "--output", outputFile, "--no-browser-gpu"]);

console.log("\nHyperframes render complete.");
console.log(outputFile);
