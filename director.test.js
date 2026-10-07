const assert = require("assert");
const { buildIntelligence, actionScore } = require("./director");

const cases = [
  ...realWorldCases,
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
  },
  {
    name: "generic SaaS",
    inspection: {
      title: "Project Tracker",
      description: "Manage projects and organize work for your team.",
      headings: ["Projects", "Recent work"],
      buttons: [{text:"Open project"}, {text:"Create project"}, {text:"Settings"}],
      links: []
    },
    expectedArchetype: "collaboration",
    expectedAction: "Open project"
  },
  {
    name: "developer tool",
    inspection: {
      title: "API Monitor",
      description: "Monitor API requests, latency, errors and service health.",
      headings: ["API health", "Requests"],
      buttons: [{text:"View requests"}, {text:"Create monitor"}, {text:"Settings"}],
      links: []
    },
    expectedArchetype: "data-workflow",
    expectedAction: "View requests"
  }
];

let passed = 0;
for (const test of cases) {
  const intelligence = buildIntelligence(test.inspection);
  assert.strictEqual(intelligence.archetype, test.expectedArchetype, test.name + ": wrong archetype");
  const topUseful = intelligence.rankedActions[0]?.text;
  assert(topUseful === test.expectedAction, test.name + ": expected top action " + test.expectedAction + ", got " + topUseful);
  const blockedScore = actionScore({text: "Settings"}, intelligence);
  assert(blockedScore < 0, test.name + ": Settings must be rejected");
  passed++;
  console.log("PASS", test.name, "→", intelligence.archetype, "→", topUseful);
}
console.log("\nDirector benchmark:", passed + "/" + cases.length, "passed");