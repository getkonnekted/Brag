function buildStoryboard(inspection) {
  const text = [
    inspection.title,
    inspection.description,
    ...(inspection.headings || []).join(" "),
    ...(inspection.buttons || []).map(x => x.text),
    ...(inspection.links || []).map(x => x.text)
  ].filter(Boolean).join(" ").toLowerCase();

  const scenes = [
    { type: "hook", title: "The problem", duration: 3, instruction: "Open on the product and establish what problem it solves." },
    { type: "product", title: "The product", duration: 5, instruction: "Introduce the product and its primary promise." },
    { type: "workflow", title: "The workflow", duration: 10, instruction: "Follow the strongest visible user path from input to outcome." },
    { type: "proof", title: "The proof", duration: 7, instruction: "Show the result, evidence, metric, or differentiating capability." },
    { type: "close", title: "The action", duration: 5, instruction: "End with the clearest next action for a new user." }
  ];

  if (/pricing|plan|checkout|payment|buy|subscribe/.test(text)) {
    scenes[3] = { type: "proof", title: "The conversion", duration: 7, instruction: "Show the value and the shortest route toward purchase or signup." };
  }
  if (/dashboard|analytics|report|metric|data/.test(text)) {
    scenes[2] = { type: "workflow", title: "The workflow", duration: 10, instruction: "Open the dashboard and reveal the most useful data path." };
  }
  if (/ai|agent|automation|generate|assistant/.test(text)) {
    scenes[2] = { type: "workflow", title: "The workflow", duration: 10, instruction: "Give the system an input, capture the processing state, then reveal the output." };
  }

  return {
    version: "0.2",
    source: inspection.url,
    product: inspection.title || "Untitled product",
    scenes,
    signals: {
      hasDescription: Boolean(inspection.description),
      headingCount: (inspection.headings || []).length,
      actionCount: (inspection.buttons || []).length,
      linkCount: (inspection.links || []).length,
      consoleErrors: (inspection.consoleErrors || []).length
    }
  };
}

if (require.main === module) {
  const fs = require("fs");
  if (!fs.existsSync("output/inspection.json")) {
    console.error("Run npm run capture -- <url> first.");
    process.exit(1);
  }
  const inspection = JSON.parse(fs.readFileSync("output/inspection.json", "utf8"));
  const storyboard = buildStoryboard(inspection);
  fs.writeFileSync("output/storyboard.json", JSON.stringify(storyboard, null, 2));
  console.log(JSON.stringify(storyboard, null, 2));
}

module.exports = { buildStoryboard };
