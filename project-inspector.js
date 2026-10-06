const fs = require("fs");
const path = require("path");

const DEFAULT_IGNORE = new Set([
  ".git", ".next", "node_modules", "dist", "build", "coverage",
  "output", ".vercel", ".turbo", ".cache"
]);

const SOURCE_EXTENSIONS = new Set([
  ".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".vue", ".svelte",
  ".html", ".css", ".scss", ".md", ".json"
]);

function walk(root, dir = root, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory() && DEFAULT_IGNORE.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(root, full, files);
    else if (SOURCE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) files.push(full);
  }
  return files;
}

function readJson(root, name) {
  const file = path.join(root, name);
  if (!fs.existsSync(file)) return null;
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return null; }
}

function clean(s) {
  return String(s || "").replace(/\s+/g, " ").trim();
}

function inspectProject(root = process.cwd()) {
  root = path.resolve(root);
  const packageJson = readJson(root, "package.json") || {};
  const files = walk(root).slice(0, 400);
  const relativeFiles = files.map(f => path.relative(root, f).replace(/\\/g, "/"));

  const important = relativeFiles.filter(f =>
    /(^|\/)(app|pages|src|components|routes|public)(\/|$)/.test(f) ||
    /(^|\/)(README|package\.json|vite\.config|next\.config|nuxt\.config)/i.test(f)
  ).slice(0, 160);

  const samples = [];
  for (const file of files) {
    const rel = path.relative(root, file).replace(/\\/g, "/");
    if (!important.includes(rel) && samples.length >= 40) continue;
    try {
      const text = fs.readFileSync(file, "utf8");
      if (text.length <= 50000) {
        samples.push({ path: rel, text: text.slice(0, 12000) });
      }
    } catch {}
  }

  const corpus = samples.map(s => s.text).join("\n");
  const headings = [...corpus.matchAll(/(?:^|\n)\s*#{1,3}\s+(.+)/g)]
    .map(m => clean(m[1])).filter(Boolean).slice(0, 30);
  const uiLabels = [...corpus.matchAll(/(?:button|aria-label|placeholder|title)\s*[=:]\s*[\"']([^\"']{2,80})[\"']/gi)]
    .map(m => clean(m[1])).filter(Boolean).slice(0, 40);

  const signals = {
    ai: /\b(ai|agent|assistant|automation|prompt|model|copilot|llm|generate)\b/i.test(corpus),
    commerce: /\b(pricing|checkout|payment|subscribe|cart|order|buy)\b/i.test(corpus),
    data: /\b(dashboard|analytics|report|metric|insight|data)\b/i.test(corpus),
    creation: /\b(create|build|design|compose|edit|canvas|whiteboard|diagram|draw)\b/i.test(corpus),
    collaboration: /\b(team|collaborat|workspace|invite|share|comment)\b/i.test(corpus)
  };

  return {
    version: "1.0",
    mode: "project",
    root,
    product: {
      name: clean(packageJson.name) || path.basename(root),
      description: clean(packageJson.description),
      framework: packageJson.dependencies?.next ? "next"
        : packageJson.dependencies?.vite ? "vite"
        : packageJson.dependencies?.react ? "react"
        : null
    },
    evidence: {
      files: important,
      fileCount: relativeFiles.length,
      headings,
      uiLabels,
      scripts: packageJson.scripts || {},
      dependencies: Object.keys({ ...(packageJson.dependencies || {}), ...(packageJson.devDependencies || {}) }).slice(0, 100)
    },
    signals
  };
}

if (require.main === module) {
  const inspection = inspectProject(process.argv[2] || process.cwd());
  fs.mkdirSync("output", { recursive: true });
  fs.writeFileSync("output/project.json", JSON.stringify(inspection, null, 2));
  console.log(JSON.stringify(inspection, null, 2));
}

module.exports = { inspectProject };
