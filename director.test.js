const assert = require("assert");
const {
  buildIntelligence,
  actionScore
} = require("./director");

const cases = [
  {
    name: "AI workflow",
    inspection: {
      title: "Research Copilot",
      description: "An AI assistant that summarizes research documents and generates answers.",
      headings: ["Ask your research assistant"],
      buttons: [{text:"Generate summary"}, {text:"Settings"}, {text:"Learn more"}],
      links: []
    },
    expectedArchetype: "ai-workflow",
    expectedAction: "Generate summary"
  },
  {
    name: "data workflow",
    inspection: {
      title: "Sales Analytics",
      description: "Track sales metrics, revenue and performance with analytics dashboards.",
      headings: ["Revenue dashboard", "Key metrics"],
      buttons: [{text:"View dashboard"}, {text:"Export report"}, {text:"View insights"}],
      links: []
    },
    expectedArchetype: "data-workflow",
    expectedAction: "View dashboard"
  },
  {
    name: "commerce",
    inspection: {
      title: "Outdoor Store",
      description: "Shop outdoor products and compare prices before ordering.",
      headings: ["Featured products"],
      buttons: [{text:"View products"}, {text:"Add to cart"}, {text:"Checkout"}],
      links: []
    },
    expectedArchetype: "commerce",
    expectedAction: "View products"
  },
  {
    name: "collaboration",
    inspection: {
      title: "Team Workspace",
      description: "A shared workspace where teams collaborate, comment and share work.",
      headings: ["Your workspace"],
      buttons: [{text:"Open workspace"}, {text:"Invite team"}, {text:"Settings"}],
      links: []
    },
    expectedArchetype: "collaboration",
    expectedAction: "Open workspace"
  }
];

let passed = 0;

for (const test of cases) {
  const intelligence = buildIntelligence(test.inspection);

  assert.strictEqual(
    intelligence.archetype,
    test.expectedArchetype,
    test.name + ": wrong archetype"
  );

  const ranked = intelligence.rankedActions.map(item => item.text);
  assert(
    ranked.includes(test.expectedAction),
    test.name + ": expected action missing from ranked actions"
  );

  const topUseful = intelligence.rankedActions[0]?.text;
  assert(
    topUseful === test.expectedAction,
    test.name + ": director did not rank the product-specific action first; got " + topUseful
  );

  const blockedScore = actionScore(
    {text: "Settings"},
    intelligence
  );
  assert(
    blockedScore < 0,
    test.name + ": blocked action should not receive a positive score"
  );

  passed++;
  console.log("PASS", test.name, "→", intelligence.archetype, "→", topUseful);
}

console.log("\nDirector benchmark:", passed + "/" + cases.length, "passed");
