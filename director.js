const fs = require("fs");

function clean(value) { return String(value || "").replace(/\s+/g, " ").trim(); }
function unique(values) { return [...new Set(values.filter(Boolean))]; }

const STOP_WORDS = new Set([
  "the","and","for","with","from","this","that","your","you","our","into","using",
  "how","what","when","where","which","their","them","will","can","now","more",
  "real","product","platform","tool","app","software","system","online","get",
  "make","show","use","new","one","user","users"
]);

function evidenceTerms(text = "") {
  return unique(
    clean(text)
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, " ")
      .split(/\s+/)
      .filter(word => word.length >= 4 && !STOP_WORDS.has(word))
  ).slice(0, 18);
}

function actionScore(action, intelligence = {}) {
  const text = clean(action?.text);
  if (!text) return -1000;
  if (intelligence.blockedPattern?.test(text)) return -1000;

  const lower = text.toLowerCase();
  const terms = intelligence.proofTerms || [];
  const matches = terms.filter(term => lower.includes(term));

  let score = 0;
  if (intelligence.strongestAction && lower === intelligence.strongestAction.toLowerCase()) score += 90;
  if (/get started|try|demo|start|launch|play|continue|next|create|new|draw|diagram|design|edit|generate/i.test(text)) score += 35;
  if (/open|view|explore|discover|learn more/i.test(text)) score += 15;
  score += matches.length * 28;

  if (intelligence.archetype === "ai-workflow" && /generate|ask|prompt|run|create|summarize|analy/i.test(text)) score += 24;
  if (intelligence.archetype === "data-workflow" && /dashboard|analytics|report|metric|insight|view|filter/i.test(text)) score += 24;
  if (intelligence.archetype === "commerce" && /product|shop|cart|order|buy|price|plan/i.test(text)) score += 24;
  if (intelligence.archetype === "creation-workflow" && /create|new|draw|design|edit|compose|generate/i.test(text)) score += 24;
  if (intelligence.userIntent && /issue|project|workflow|task|ticket|priorit|assign|track|planning|organize/i.test(intelligence.userIntent) && /issue|project|task|ticket|priority|assign|workflow|project|plan/i.test(text)) score += 80;
  if (intelligence.archetype === "collaboration" && /workspace|team|share|comment|invite/i.test(text)) score += 24;

  return score;
}

function buildIntelligence(inspection = {}) {
  const headings = (inspection.headings || inspection.evidence?.headings || []).map(clean).filter(Boolean);
  const buttons = (inspection.buttons || inspection.evidence?.uiLabels || []).map(item => clean(typeof item === "string" ? item : item.text)).filter(Boolean);
  const links = (inspection.links || []).map(item => clean(typeof item === "string" ? item : item.text)).filter(Boolean);
  const userIntent = clean(process.env.DEMO_USER_INTENT || inspection.userIntent || inspection.request?.description || "");
  const corpus = [userIntent, inspection.title, inspection.description, inspection.product?.name, inspection.product?.description, ...headings, ...buttons, ...links].filter(Boolean).join(" ");
  const s = inspection.signals || {};
  const signals = {
    ai: Boolean(s.ai) || /\b(ai|agent|assistant|automation|generate|prompt|model|copilot|llm)\b/i.test(corpus),
    commerce: Boolean(s.commerce) || /\b(pricing|price|checkout|payment|buy|subscribe|order|cart)\b/i.test(corpus),
    data: Boolean(s.data) || /\b(dashboard|analytics|report|metric|data|insight|score)\b/i.test(corpus),
    creation: Boolean(s.creation) || /\b(create|build|design|write|generate|compose|edit|draw|diagram|whiteboard|canvas)\b/i.test(corpus),
    collaboration: Boolean(s.collaboration) || /\b(team|collaborat|workspace|invite|share|comment)\b/i.test(corpus)
  };
  let archetype = "product";
  const workflowIntent = /\b(issue|issues|project|projects|workflow|workflows|task|tasks|ticket|tickets|priorit|assign|track|planning|execution|organize|organized)\b/i.test(userIntent);
  if (workflowIntent) archetype = "product";
  else if (signals.creation) archetype = "creation-workflow";
  else if (signals.ai) archetype = "ai-workflow";
  else if (signals.data) archetype = "data-workflow";
  else if (signals.commerce) archetype = "commerce";
  else if (signals.collaboration) archetype = "collaboration";
  const blocked = /(open|save|download|upload|export|import|settings|help|login|sign in|log in|logout|payment|checkout)/i;
  const actionPattern = /(start|get started|try|demo|create|new|begin|launch|explore|play|continue|next|draw|canvas|whiteboard|diagram|design|compose|edit|generate)/i;
  const actions = unique([...buttons, ...links]).filter(a => !blocked.test(a));
  const proofTerms = unique([
    ...evidenceTerms(inspection.description || ""),
    ...evidenceTerms(inspection.product?.description || ""),
    ...evidenceTerms(headings.join(" ")),
    ...evidenceTerms(buttons.map(item => typeof item === "string" ? item : item.text).join(" ")),
  ]).filter(term => term.length >= 4);

  const rankedActions = actions
    .map(text => ({ text, score: actionScore({ text }, { archetype, proofTerms }) }))
    .sort((a, b) => b.score - a.score);

  const strongestAction =
    rankedActions[0]?.text ||
    actions[0] ||
    null;

  const evidenceAction = strongestAction || "the primary action";
  const outcomeTerms = unique([
    ...proofTerms,
    ...evidenceTerms(headings.join(" ")),
    ...evidenceTerms(buttons.join(" "))
  ]).slice(0, 12);

  const workflow = {
    "ai-workflow": ["Use " + evidenceAction, "Wait for the system to process the real input", "Hold on the generated result"],
    "data-workflow": ["Open " + evidenceAction, "Focus on the strongest visible signal", "Hold on the resulting insight"],
    commerce: ["Explore through " + evidenceAction, "Show the decision point without purchasing", "Hold on the clearest product or offer"],
    "creation-workflow": ["Start with " + evidenceAction, "Show the key creation step", "Hold on the finished output"],
    collaboration: ["Enter through " + evidenceAction, "Show the real collaborative action", "Hold on the shared outcome"],
    product: ["Start with " + evidenceAction, "Show the core user action", "Hold on the useful outcome"]
  }[archetype];
  const rawPromise = clean(inspection.description || inspection.product?.description) ||
    clean(headings[0]) ||
    clean(inspection.title || inspection.product?.name) ||
    "Show the product solving a real user problem.";

  const product = clean(inspection.title || inspection.product?.name) || "Untitled product";
  const promise = rawPromise
    .replace(/\b(we|our|i|my)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240);

  return {
    version: "2.2",
    userIntent,
    product,
    promise,
    archetype,
    strongestAction,
    workflow,
    proof: workflow[2],
    proofTerms: proofTerms.slice(0, 18),
    outcomeTerms,
    blockedPattern: blocked,
    rankedActions: rankedActions.slice(0, 10),
    signals,
    evidence: {
      headings: headings.slice(0, 12),
      actions: actions.slice(0, 20),
      links: links.slice(0, 12)
    }
  };
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
  return { version: "2.1", product: { name: intelligence.product, whatItDoes: intelligence.promise, audience: "derived from available product evidence", promise: intelligence.promise }, evidence: { visualIdentity: {}, screens: inspection.evidence?.files || [], features: intelligence.evidence.actions, userFlow: intelligence.workflow }, creative: { ...creative, duration }, storyboard, narrative: null };
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
  buildNarrative,
  actionScore
};

if (require.main === module) {
  const file = process.argv[2] || "output/inspection.json";
  if (!fs.existsSync(file)) throw new Error("Inspection file not found: " + file);
  const inspection = JSON.parse(fs.readFileSync(file, "utf8"));
  const requestPath = "output/request.json";
  if (fs.existsSync(requestPath)) {
    const request = JSON.parse(fs.readFileSync(requestPath, "utf8"));
    inspection.userIntent = request.description || null;
  }
  const manifest = buildDirectorManifest(inspection);\n  const recordingPath = "output/recording/manifest.json";\n  if (fs.existsSync(recordingPath)) {\n    try {\n      const recording = JSON.parse(fs.readFileSync(recordingPath, "utf8"));\n      manifest.narrative = buildNarrative(manifest.product ? buildIntelligence(inspection) : {}, recording.steps || []);\n      const scenes = manifest.narrative.scenes || [];\n      if (scenes.length >= 4) {\n        manifest.storyboard = manifest.storyboard.map((scene, index) => ({\n          ...scene,\n          text: scenes[Math.min(index, scenes.length - 1)]?.text || scene.text\n        }));\n      }\n    } catch (error) {\n      console.warn("Narrative edit unavailable:", error.message);\n    }\n  }
  fs.mkdirSync("output", { recursive: true });
  fs.writeFileSync("output/director-manifest.json", JSON.stringify(manifest, null, 2));
  console.log(JSON.stringify(manifest, null, 2));
}