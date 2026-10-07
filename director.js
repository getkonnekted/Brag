const fs = require("fs");

function clean(value) { return String(value || "").replace(/\s+/g, " ").trim(); }
function unique(values) { return [...new Set(values.filter(Boolean))]; }

function buildIntelligence(inspection = {}) {
  const headings = (inspection.headings || inspection.evidence?.headings || []).map(clean).filter(Boolean);
  const buttons = (inspection.buttons || inspection.evidence?.uiLabels || []).map(item => clean(typeof item === "string" ? item : item.text)).filter(Boolean);
  const links = (inspection.links || []).map(item => clean(typeof item === "string" ? item : item.text)).filter(Boolean);
  const corpus = [inspection.title, inspection.description, inspection.product?.name, inspection.product?.description, ...headings, ...buttons, ...links].filter(Boolean).join(" ");
  const s = inspection.signals || {};
  const signals = {
    ai: Boolean(s.ai) || /\b(ai|agent|assistant|automation|generate|prompt|model|copilot|llm)\b/i.test(corpus),
    commerce: Boolean(s.commerce) || /\b(pricing|price|checkout|payment|buy|subscribe|order|cart)\b/i.test(corpus),
    data: Boolean(s.data) || /\b(dashboard|analytics|report|metric|data|insight|score)\b/i.test(corpus),
    creation: Boolean(s.creation) || /\b(create|build|design|write|generate|compose|edit|draw|diagram|whiteboard|canvas)\b/i.test(corpus),
    collaboration: Boolean(s.collaboration) || /\b(team|collaborat|workspace|invite|share|comment)\b/i.test(corpus)
  };
  let archetype = "product";
  if (signals.creation) archetype = "creation-workflow";
  else if (signals.ai) archetype = "ai-workflow";
  else if (signals.data) archetype = "data-workflow";
  else if (signals.commerce) archetype = "commerce";
  else if (signals.collaboration) archetype = "collaboration";
  const blocked = /(open|save|download|upload|export|import|settings|help|login|sign in|log in|logout|payment|checkout)/i;
  const actionPattern = /(start|get started|try|demo|create|new|begin|launch|explore|play|continue|next|draw|canvas|whiteboard|diagram|design|compose|edit|generate)/i;
  const actions = unique([...buttons, ...links]).filter(a => !blocked.test(a));
  const strongestAction = actions.find(a => actionPattern.test(a)) || actions[0] || null;
  const workflow = {
    "ai-workflow": ["Give the system an input", "Let the system process it", "Reveal the generated result"],
    "data-workflow": ["Open the useful data view", "Focus on the key signal", "Show the resulting insight"],
    commerce: ["Find the product or offer", "Show the decision point", "Reveal the conversion path"],
    "creation-workflow": ["Start the creation task", "Show the key creation step", "Reveal the finished output"],
    collaboration: ["Enter the shared workspace", "Show the collaborative action", "Reveal the shared outcome"],
    product: ["Open the primary experience", "Show the core user action", "Reveal the useful outcome"]
  }[archetype];
  const promise = clean(inspection.description || inspection.product?.description) || clean(headings[0]) || clean(inspection.title || inspection.product?.name) || "Show the product solving a real user problem.";
  return { version: "2.0", product: clean(inspection.title || inspection.product?.name) || "Untitled product", promise: promise.slice(0, 240), archetype, strongestAction, workflow, proof: workflow[2], signals, evidence: { headings: headings.slice(0, 12), actions: actions.slice(0, 20), links: links.slice(0, 12) } };
}

function chooseAngle(intelligence, options = {}) {
  const tone = options.tone || "polished";
  return { tone, hook: intelligence.promise, angle: intelligence.archetype + ": show the smallest real workflow that proves the product promise.", rule: "Specific product evidence beats generic marketing language." };
}

function buildDirectorManifest(inspection, options = {}) {
  const intelligence = buildIntelligence(inspection);
  const creative = chooseAngle(intelligence, options);
  const duration = Number(options.duration) || 20;
  const source = inspection.mode === "project" ? "project-source" : "real-product";
  const storyboard = [
    { scene: 1, duration: 3, purpose: "hook", visual: "Open on the strongest real product surface.", text: creative.hook, source },
    { scene: 2, duration: 4, purpose: "reveal", visual: "Orient the viewer inside the product.", text: "This is " + intelligence.product + ".", source },
    { scene: 3, duration: 6, purpose: "workflow", visual: intelligence.workflow[0], text: intelligence.workflow[0], source: "real-product" },
    { scene: 4, duration: 4, purpose: "proof", visual: intelligence.workflow[1], text: intelligence.workflow[2], source: "real-product" },
    { scene: 5, duration: 3, purpose: "outro", visual: "Hold on the clearest product outcome.", text: intelligence.promise, source: "real-product" }
  ];
  return { version: "2.0", product: { name: intelligence.product, whatItDoes: intelligence.promise, audience: "derived from available product evidence", promise: intelligence.promise }, evidence: { visualIdentity: {}, screens: inspection.evidence?.files || [], features: intelligence.evidence.actions, userFlow: intelligence.workflow }, creative: { ...creative, duration }, storyboard };
}

function buildStoryboard(inspection) { return buildDirectorManifest(inspection); }

function evaluateCapturedState(state = {}, intelligence = {}) {
  const headings = (state.headings || []).join(" ");
  const title = clean(state.title);
  const text = (headings + " " + title).toLowerCase();

  const proofTerms =
    intelligence.archetype === "ai-workflow"
      ? /result|output|generated|response|answer|complete|done/
      : intelligence.archetype === "data-workflow"
        ? /dashboard|analytics|report|metric|insight|score|result/
        : intelligence.archetype === "commerce"
          ? /product|price|offer|cart|order|details/
          : /result|success|complete|done|dashboard|output|created|ready/;

  const proof = proofTerms.test(text);
  const useful = Boolean(title || headings);

  return {
    useful,
    proof,
    decision: proof ? "hold-result" : useful ? "continue" : "replan",
    reason: proof
      ? "Captured state contains evidence of the intended outcome."
      : useful
        ? "Captured state is meaningful but does not yet show strong proof."
        : "Captured state contains too little visible evidence."
  };
}

function buildShotPlan(intelligence, options = {}) {
  const workflow = Array.isArray(intelligence?.workflow)
    ? intelligence.workflow
    : ["Open the primary experience", "Show the core user action", "Reveal the useful outcome"];

  const shots = [
    {
      id: "hook",
      type: "hook",
      goal: intelligence?.promise || "Show the product solving a real user problem.",
      duration: 3
    },
    {
      id: "orient",
      type: "reveal",
      goal: "Orient the viewer inside the real product.",
      duration: 4
    },
    {
      id: "workflow",
      type: "workflow",
      goal: workflow[0],
      duration: 5
    },
    {
      id: "proof",
      type: "proof",
      goal: workflow[1],
      duration: 5
    },
    {
      id: "outcome",
      type: "outcome",
      goal: workflow[2],
      duration: 3
    }
  ];

  return {
    version: "2.1",
    duration: Number(options.duration) || shots.reduce((sum, shot) => sum + shot.duration, 0),
    shots
  };
}

function buildNarrative(intelligence = {}, states = []) {
  const observed = (states || []).filter(Boolean).map((state, index) => ({
    step: index + 1,
    title: clean(state.title),
    headings: (state.headings || []).map(clean).filter(Boolean).slice(0, 3),
    evaluation: state.evaluation || null
  }));

  const proofState =
    observed.find(state => state.evaluation?.proof) ||
    observed[observed.length - 1] ||
    null;

  const action = intelligence.strongestAction || "the primary action";

  const outcome = proofState
    ? (proofState.headings.length
        ? proofState.headings.join(" and ")
        : proofState.title)
    : intelligence.proof;

  return {
    version: "1.9",
    structure: ["problem", "action", "change", "outcome"],
    evidence: observed,
    scenes: [
      { id: "problem", text: intelligence.promise || "Show the product solving a real user problem." },
      { id: "action", text: "The workflow starts with " + action + "." },
      { id: "change", text: intelligence.workflow?.[1] || "The product processes the user's task." },
      { id: "outcome", text: outcome || intelligence.proof || "Show the useful product outcome." }
    ],
    rule: "Narration is derived only from observed product evidence and director intelligence."
  };
}

module.exports = {
  buildIntelligence,
  chooseAngle,
  buildDirectorManifest,
  buildStoryboard,
  buildShotPlan,
  evaluateCapturedState,
  buildNarrative
};

if (require.main === module) {
  const file = process.argv[2] || "output/inspection.json";
  if (!fs.existsSync(file)) throw new Error("Inspection file not found: " + file);
  const inspection = JSON.parse(fs.readFileSync(file, "utf8"));
  const manifest = buildDirectorManifest(inspection);
  fs.mkdirSync("output", { recursive: true });
  fs.writeFileSync("output/director-manifest.json", JSON.stringify(manifest, null, 2));
  console.log(JSON.stringify(manifest, null, 2));
}