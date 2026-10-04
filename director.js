const fs = require("fs");
const path = require("path");

function clean(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function buildIntelligence(inspection) {
  const headings = (inspection.headings || []).map(clean).filter(Boolean);
  const buttons = (inspection.buttons || []).map(x => clean(x.text)).filter(Boolean);
  const links = (inspection.links || []).map(x => clean(x.text)).filter(Boolean);
  const corpus = [inspection.title, inspection.description, ...headings, ...buttons, ...links]
    .filter(Boolean).join(" ");

  const signals = {
    ai: /\b(ai|agent|assistant|automation|generate|generated|prompt|model|copilot)\b/i.test(corpus),
    commerce: /\b(pricing|price|plan|checkout|payment|buy|subscribe|order|cart)\b/i.test(corpus),
    data: /\b(dashboard|analytics|report|metric|data|insight|statistic|score)\b/i.test(corpus),
    creation: /\b(create|build|design|write|generate|compose|edit|upload)\b/i.test(corpus),
    game: /\b(play|game|level|score|quest|player|leaderboard)\b/i.test(corpus)
  };

  const ctaWords = /(start|get started|try|demo|create|launch|begin|explore|play|order|book|see demo)/i;
  const strongestAction = buttons.find(x => ctaWords.test(x)) || links.find(x => ctaWords.test(x)) || buttons[0] || links[0] || null;

  let archetype = "product";
  if (signals.game) archetype = "game";
  else if (signals.commerce) archetype = "commerce";
  else if (signals.ai) archetype = "ai-workflow";
  else if (signals.data) archetype = "data-workflow";
  else if (signals.creation) archetype = "creation-workflow";

  const workflow =
    archetype === "ai-workflow" ? ["Give the system an input", "Let the system process it", "Reveal the generated result"] :
    archetype === "data-workflow" ? ["Open the useful data view", "Focus on the key signal", "Show the resulting insight"] :
    archetype === "commerce" ? ["Find the product or offer", "Show the decision point", "Reveal the conversion path"] :
    archetype === "creation-workflow" ? ["Start the creation task", "Show the key editing or generation step", "Reveal the finished output"] :
    archetype === "game" ? ["Start the experience", "Show the core game action", "Reveal the result or progression"] :
    ["Open the primary experience", "Show the core user action", "Reveal the useful outcome"];

  const proof =
    archetype === "commerce" ? "Value, offer, or conversion evidence" :
    archetype === "data-workflow" ? "Metric, insight, or report" :
    archetype === "ai-workflow" ? "Generated output or automation result" :
    archetype === "game" ? "Gameplay result, score, or progression" :
    "Visible outcome produced by the core workflow";

  const promise = clean(inspection.description) || clean(headings[0]) || clean(inspection.title) || "Show the product solving a real user problem.";

  return {
    version: "1.0",
    product: clean(inspection.title) || "Untitled product",
    promise: promise.slice(0, 240),
    archetype,
    strongestAction,
    workflow,
    proof,
    signals,
    evidence: {
      headings: headings.slice(0, 8),
      actions: buttons.slice(0, 8),
      links: links.slice(0, 8)
    }
  };
}

function buildStoryboard(inspection) {
  const intelligence = buildIntelligence(inspection);
  const scenes = [
    { type: "hook", title: "The problem", duration: 4, instruction: "Establish the user problem and promise before explaining features." },
    { type: "product", title: "The product", duration: 5, instruction: "Orient the viewer inside the real product." },
    { type: "workflow", title: "The core workflow", duration: 9, instruction: intelligence.workflow.join(". ") + "." },
    { type: "proof", title: "The proof", duration: 7, instruction: intelligence.proof + "." },
    { type: "close", title: "The action", duration: 4, instruction: intelligence.strongestAction ? "End by reinforcing the clearest action: " + intelligence.strongestAction : "End with the clearest next action for a new user." }
  ];

  return {
    version: "1.0",
    source: inspection.url,
    product: intelligence.product,
    intelligence,
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
  if (!fs.existsSync("output/inspection.json")) {
    console.error("Run npm run capture -- <url> first.");
    process.exit(1);
  }
  const inspection = JSON.parse(fs.readFileSync("output/inspection.json", "utf8"));
  const storyboard = buildStoryboard(inspection);
  fs.mkdirSync("output", { recursive: true });
  fs.writeFileSync("output/storyboard.json", JSON.stringify(storyboard, null, 2));
  console.log(JSON.stringify(storyboard, null, 2));
}

module.exports = { buildStoryboard, buildIntelligence };
