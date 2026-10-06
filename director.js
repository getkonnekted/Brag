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
module.exports = { buildIntelligence, chooseAngle, buildDirectorManifest, buildStoryboard };

if (require.main === module) {
  const file = process.argv[2] || "output/inspection.json";
  if (!fs.existsSync(file)) throw new Error("Inspection file not found: " + file);
  const inspection = JSON.parse(fs.readFileSync(file, "utf8"));
  const manifest = buildDirectorManifest(inspection);
  fs.mkdirSync("output", { recursive: true });
  fs.writeFileSync("output/director-manifest.json", JSON.stringify(manifest, null, 2));
  console.log(JSON.stringify(manifest, null, 2));
}