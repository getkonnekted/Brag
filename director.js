const fs = require("fs");

function clean(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function buildIntelligence(inspection) {
  const headings = (inspection.headings || [])
    .map(clean)
    .filter(Boolean);

  const buttons = (inspection.buttons || [])
    .map((item) => clean(item.text))
    .filter(Boolean);

  const links = (inspection.links || [])
    .map((item) => clean(item.text))
    .filter(Boolean);

  const corpus = [
    inspection.title,
    inspection.description,
    ...headings,
    ...buttons,
    ...links
  ]
    .filter(Boolean)
    .join(" ");

  const signals = {
    ai: /\b(ai|agent|assistant|automation|generate|generated|prompt|model|copilot)\b/i.test(corpus),

    commerce:
      /\b(pricing|price|plan|checkout|payment|buy|subscribe|order|cart)\b/i.test(
        corpus
      ),

    data:
      /\b(dashboard|analytics|report|metric|data|insight|statistic|score)\b/i.test(
        corpus
      ),

    creation:
      /\b(create|build|design|write|generate|compose|edit|draw|drawing|diagram|diagramming|whiteboard|canvas|visualize)\b/i.test(
        corpus
      ),

    game:
      /\b(play|game|level|score|quest|player|leaderboard)\b/i.test(corpus)
  };

  let archetype = "product";

  if (signals.game) {
    archetype = "game";
  } else if (signals.commerce) {
    archetype = "commerce";
  } else if (signals.ai) {
    archetype = "ai-workflow";
  } else if (signals.data) {
    archetype = "data-workflow";
  } else if (signals.creation) {
    archetype = "creation-workflow";
  }

  const blockedAction =
    /(open|save|download|upload|export|import|settings|help|keyboard|shortcut|login|sign in|log in|logout|log out)/i;

  const workflowAction =
    /(start|get started|try|try it|demo|create|new|begin|launch|explore|play|continue|next|draw|canvas|whiteboard|diagram|design|compose|edit)/i;

  const actionCandidates = unique([
    ...buttons,
    ...links
  ]).filter((action) => !blockedAction.test(action));

  const strongestAction =
    actionCandidates.find((action) => workflowAction.test(action)) ||
    actionCandidates[0] ||
    null;

  const workflow =
    archetype === "ai-workflow"
      ? [
          "Give the system an input",
          "Let the system process it",
          "Reveal the generated result"
        ]
      : archetype === "data-workflow"
        ? [
            "Open the useful data view",
            "Focus on the key signal",
            "Show the resulting insight"
          ]
        : archetype === "commerce"
          ? [
              "Find the product or offer",
              "Show the decision point",
              "Reveal the conversion path"
            ]
          : archetype === "creation-workflow"
            ? [
                "Start the creation task",
                "Show the key editing or creation step",
                "Reveal the finished output"
              ]
            : archetype === "game"
              ? [
                  "Start the experience",
                  "Show the core game action",
                  "Reveal the result or progression"
                ]
              : [
                  "Open the primary experience",
                  "Show the core user action",
                  "Reveal the useful outcome"
                ];

  const proof =
    archetype === "commerce"
      ? "Value, offer, or conversion evidence"
      : archetype === "data-workflow"
        ? "Metric, insight, or report"
        : archetype === "ai-workflow"
          ? "Generated output or automation result"
          : archetype === "game"
            ? "Gameplay result, score, or progression"
            : archetype === "creation-workflow"
              ? "Finished creation or visible canvas result"
              : "Visible outcome produced by the core workflow";

  const promise =
    clean(inspection.description) ||
    clean(headings[0]) ||
    clean(inspection.title) ||
    "Show the product solving a real user problem.";

  return {
    version: "1.1",
    product: clean(inspection.title) || "Untitled product",
    promise: promise.slice(0, 240),
    archetype,
    strongestAction,
    workflow,
    proof,
    signals,
    evidence: {
      headings: headings.slice(0, 8),
      actions: actionCandidates.slice(0, 12),
      links: links.slice(0, 8)
    }
  };
}

function buildShotPlan(intelligence) {
  const archetype = intelligence.archetype;
  const workflow = intelligence.workflow || [];

  const shots = [
    {
      id: "establish",
      type: "establish",
      duration: 3,
      goal: "Show the real product clearly before interaction.",
      action: null
    },
    {
      id: "primary-action",
      type: "interaction",
      duration: 4,
      goal: workflow[0] || "Start the primary experience.",
      action: intelligence.strongestAction
    },
    {
      id: "core-action",
      type: "interaction",
      duration: 6,
      goal: workflow[1] || "Show the core user action.",
      action: null
    },
    {
      id: "proof",
      type: "result",
      duration: 5,
      goal: workflow[2] || intelligence.proof,
      action: null
    },
    {
      id: "hold",
      type: "hold",
      duration: 3,
      goal: "Hold the useful outcome long enough to understand it.",
      action: null
    },
    {
      id: "close",
      type: "close",
      duration: 3,
      goal: intelligence.strongestAction
        ? `Return attention to the clearest product action: ${intelligence.strongestAction}`
        : "End on the clearest next action.",
      action: intelligence.strongestAction
    }
  ];

  if (archetype === "creation-workflow") {
    shots[1].goal = "Enter the creation workspace.";
    shots[2].goal = "Create or manipulate the core object.";
    shots[3].goal = "Show the finished creation.";
  }

  if (archetype === "game") {
    shots[1].goal = "Enter the playable experience.";
    shots[2].goal = "Show the core game action.";
    shots[3].goal = "Hold the score, progression, or result.";
  }

  if (archetype === "commerce") {
    shots[1].goal = "Enter the product or offer discovery path.";
    shots[2].goal =
      "Show the decision point without completing a purchase.";
    shots[3].goal = "Show visible offer or conversion evidence.";
  }

  if (archetype === "ai-workflow") {
    shots[1].goal = "Enter the AI workflow.";
    shots[2].goal =
      "Show the input or generation step without submitting sensitive data.";
    shots[3].goal = "Hold the generated output or automation result.";
  }

  return {
    version: "1.1",
    strategy: "director-shot-plan",
    shots,
    safety:
      "Shots may guide capture but never override runner safety policy."
  };
}

function evaluateCapturedState(state, intelligence) {
  const headings = (state.headings || [])
    .map(clean)
    .filter(Boolean)
    .join(" ");

  const title = clean(state.title);

  const text = `${headings} ${title}`.toLowerCase();

  const proofTerms =
    intelligence.archetype === "ai-workflow"
      ? /result|output|generated|response|answer|complete|done/
      : intelligence.archetype === "data-workflow"
        ? /dashboard|analytics|report|metric|insight|score|result/
        : intelligence.archetype === "game"
          ? /score|level|win|result|progress|complete/
          : intelligence.archetype === "commerce"
            ? /product|price|offer|cart|order|details/
            : intelligence.archetype === "creation-workflow"
              ? /canvas|drawing|diagram|created|finished|complete|result|output|ready/
              : /result|success|complete|done|dashboard|output|created|ready/;

  const proof = proofTerms.test(text);
  const useful = Boolean(title || headings);

  return {
    useful,
    proof,
    decision: proof
      ? "hold-result"
      : useful
        ? "continue"
        : "replan",
    reason: proof
      ? "Captured state contains evidence of the intended outcome."
      : useful
        ? "Captured state is meaningful but does not yet show strong proof."
        : "Captured state contains too little visible evidence."
  };
}

function buildStoryboard(inspection) {
  const intelligence = buildIntelligence(inspection);

  const scenes = [
    {
      type: "hook",
      title: "The problem",
      duration: 4,
      instruction:
        "Establish the user problem and promise before explaining features."
    },
    {
      type: "product",
      title: "The product",
      duration: 5,
      instruction: "Orient the viewer inside the real product."
    },
    {
      type: "workflow",
      title: "The core workflow",
      duration: 9,
      instruction: `${intelligence.workflow.join(". ")}.`
    },
    {
      type: "proof",
      title: "The proof",
      duration: 7,
      instruction: `${intelligence.proof}.`
    },
    {
      type: "close",
      title: "The action",
      duration: 4,
      instruction: intelligence.strongestAction
        ? `End by reinforcing the clearest action: ${intelligence.strongestAction}`
        : "End with the clearest next action for a new user."
    }
  ];

  return {
    version: "1.1",
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

function buildNarrative(intelligence, states) {
  const observed = (states || [])
    .filter(Boolean)
    .map((state, index) => ({
      step: index + 1,
      title: clean(state.title),
      headings: (state.headings || [])
        .map(clean)
        .filter(Boolean)
        .slice(0, 3),
      evaluation: state.evaluation || null
    }));

  const proofState =
    observed.find((state) => state.evaluation?.proof) ||
    observed[observed.length - 1] ||
    null;

  const action = intelligence.strongestAction || "the primary action";

  const outcome = proofState
    ? proofState.headings.length
      ? proofState.headings.join(" and ")
      : proofState.title
    : intelligence.proof;

  return {
    version: "2.0",
    structure: ["problem", "action", "change", "outcome"],
    evidence: observed,
    scenes: [
      {
        id: "problem",
        text: intelligence.promise
      },
      {
        id: "action",
        text: `The workflow starts with ${action}.`
      },
      {
        id: "change",
        text:
          intelligence.workflow[1] ||
          "The product processes the user's task."
      },
      {
        id: "outcome",
        text: outcome || intelligence.proof
      }
    ],
    rule:
      "Narration is derived only from observed product evidence and director intelligence."
  };
}

if (require.main === module) {
  const inspectionPath = "output/inspection.json";

  if (!fs.existsSync(inspectionPath)) {
    console.error("Run npm run capture -- <url> first.");
    process.exit(1);
  }

  const inspection = JSON.parse(
    fs.readFileSync(inspectionPath, "utf8")
  );

  const storyboard = buildStoryboard(inspection);

  fs.mkdirSync("output", { recursive: true });

  fs.writeFileSync(
    "output/storyboard.json",
    JSON.stringify(storyboard, null, 2)
  );

  console.log(JSON.stringify(storyboard, null, 2));
}

module.exports = {
  buildStoryboard,
  buildIntelligence,
  buildShotPlan,
  evaluateCapturedState,
  buildNarrative
};
