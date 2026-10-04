const fs = require("fs");
const path = require("path");
const { runWorkflow } = require("./runner");

function clean(v) { return (v || "").replace(/\s+/g, " ").trim(); }

function productName(url, title) {
  if (title && title.trim()) return title.trim();
  try { return new URL(url).hostname.replace(/^www\./, "").split(".")[0]; }
  catch { return "your product"; }
}

function buildDemoPackage(manifest, description = "") {
  const name = productName(manifest.source, manifest.steps.find(s => s.title)?.title);
  const states = manifest.steps.filter(s => s.type === "state-captured");
  const first = states[0];
  const last = states[states.length - 1];

  const scenes = [
    {
      id: "hook",
      duration: 4,
      footage: manifest.steps[0]?.screenshot || null,
      narration: description
        ? clean(description).slice(0, 220)
        : `${name} is built to solve a specific problem without adding unnecessary complexity.`,
      purpose: "Establish the problem and promise."
    },
    {
      id: "product",
      duration: 5,
      footage: first?.screenshot || manifest.steps[0]?.screenshot || null,
      narration: `Meet ${name}. This is the product in its real environment, not a mockup.`,
      purpose: "Orient the viewer inside the actual product."
    }
  ];

  states.slice(0, 3).forEach((state, i) => {
    scenes.push({
      id: `workflow-${i + 1}`,
      duration: 7,
      footage: state.screenshot,
      narration: state.headings?.length
        ? `From here, the important path is ${state.headings.slice(0, 2).join(" and ")}.`
        : "This is the important step in the user workflow.",
      purpose: "Show the real product doing the work."
    });
  });

  scenes.push({
    id: "result",
    duration: 6,
    footage: last?.screenshot || first?.screenshot || null,
    narration: "The point is the outcome: the user gets from the starting problem to a useful result.",
    purpose: "Make the value visible."
  });

  scenes.push({
    id: "close",
    duration: 4,
    footage: last?.screenshot || null,
    narration: `That's ${name}. Show the product, show the workflow, then let the result speak for itself.`,
    purpose: "Close with a product-first call to action."
  });

  return {
    version: "0.6",
    product: name,
    source: manifest.source,
    generatedAt: new Date().toISOString(),
    totalDuration: scenes.reduce((sum, s) => sum + s.duration, 0),
    scenes,
    footageDirectory: "output/recording",
    next: "Feed this edit decision list into the renderer and TTS layer."
  };
}

async function main() {
  const url = process.argv[2];
  if (!url) {
    console.error("Usage: node demo.js https://example.com [maxSteps] [description]");
    process.exit(1);
  }

  const maxSteps = process.argv[3] || 4;
  const description = process.argv.slice(4).join(" ");
  const manifest = await runWorkflow(url, { maxSteps });
  const pkg = buildDemoPackage(manifest, description);

  fs.mkdirSync("output/demo", { recursive: true });
  fs.writeFileSync("output/demo/package.json", JSON.stringify(pkg, null, 2));
  fs.writeFileSync(
    "output/demo/narration.txt",
    pkg.scenes.map((s, i) => `[Scene ${i + 1} | ${s.duration}s]\n${s.narration}`).join("\n\n")
  );

  console.log(JSON.stringify(pkg, null, 2));
}

main().catch(err => {
  console.error(err.stack || err);
  process.exit(1);
});
