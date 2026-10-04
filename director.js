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

function buildShotPlan(intelligence) {
  const archetype = intelligence.archetype;
  const workflow = intelligence.workflow || [];
  const shots = [
    { id: "establish", type: "establish", duration: 3, goal: "Show the real product clearly before interaction.", action: null },
    { id: "primary-action", type: "interaction", duration: 4, goal: workflow[0] || "Start the primary experience.", action: intelligence.strongestAction },
    { id: "core-action", type: "interaction", duration: 6, goal: workflow[1] || "Show the core user action.", action: null },
    { id: "proof", type: "result", duration: 5, goal: workflow[2] || intelligence.proof, action: null },
    { id: "hold", type: "hold", duration: 3, goal: "Hold the useful outcome long enough to understand it.", action: null },
    { id: "close", type: "close", duration: 3, goal: intelligence.strongestAction ? "Return attention to the clearest product action: " + intelligence.strongestAction : "End on the clearest next action.", action: intelligence.strongestAction }
  ];

  if (archetype === "game") {
    shots[1].goal = "Enter the playable experience.";
    shots[2].goal = "Show the core game action.";
    shots[3].goal = "Hold the score, progression, or result.";
  } else if (archetype === "commerce") {
    shots[1].goal = "Enter the product or offer discovery path.";
    shots[2].goal = "Show the decision point without completing a purchase.";
    shots[3].goal = "Show visible offer or conversion evidence.";
  } else if (archetype === "ai-workflow") {
    shots[1].goal = "Enter the AI workflow.";
    shots[2].goal = "Show the input or generation step without submitting sensitive data.";
    shots[3].goal = "Hold the generated output or automation result.";
  }

  return {
    version: "1.0",
    strategy: "director-shot-plan",
    shots,
    safety: "Shots may guide capture but never override runner safety policy."
  };
}

function evaluateCapturedState(state, intelligence) {
  const headings = (state.headings || []).join(" ");
  const title = clean(state.title);
  const text = (headings + " " + title).toLowerCase();
  const proofTerms = intelligence.archetype === "ai-workflow"
    ? /result|output|generated|response|answer|complete|done/
    : intelligence.archetype === "data-workflow"
      ? /dashboard|analytics|report|metric|insight|score|result/
      : intelligence.archetype === "game"
        ? /score|level|win|result|progress|complete/
        : intelligence.archetype === "commerce"
          ? /product|price|offer|cart|order|details/
          : /result|success|complete|done|dashboard|output|created|ready/;
  const proof = proofTerms.test(text);
  const useful = Boolean(title || headings);
  return {
    useful,
    proof,
    decision: proof ? "hold-result" : useful ? "continue" : "replan",
    reason: proof ? "Captured state contains evidence of the intended outcome." : useful ? "Captured state is meaningful but does not yet show strong proof." : "Captured state contains too little visible evidence."
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
    shotPlan: buildShotPlan(intelligence),
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



function buildNarrative(intelligence, states) {
  const observed = (states || []).filter(Boolean).map((state, index) => ({
    step: index + 1,
    title: clean(state.title),
    headings: (state.headings || []).map(clean).filter(Boolean).slice(0, 3),
    evaluation: state.evaluation || null
  }));
  const proofState = observed.find(s => s.evaluation?.proof) || observed[observed.length - 1] || null;
  const action = intelligence.strongestAction || "the primary action";
  const outcome = proofState
    ? (proofState.headings.length ? proofState.headings.join(" and ") : proofState.title)
    : intelligence.proof;
  return {
    version: "1.9",
    structure: ["problem", "action", "change", "outcome"],
    evidence: observed,
    scenes: [
      { id: "problem", text: intelligence.promise },
      { id: "action", text: "The workflow starts with " + action + "." },
      { id: "change", text: intelligence.workflow[1] || "The product processes the user's task." },
      { id: "outcome", text: outcome || intelligence.proof }
    ],
    rule: "Narration is derived only from observed product evidence and director intelligence."
  };
}

module.exports = { buildStoryboard, buildIntelligence, buildShotPlan, evaluateCapturedState, buildNarrative };
