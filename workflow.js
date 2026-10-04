const { chromium } = require("playwright");
const fs = require("fs");

const url = process.argv[2];
if (!url) {
  console.error("Usage: node workflow.js https://example.com");
  process.exit(1);
}

function clean(text) {
  return (text || "").replace(/\s+/g, " ").trim().slice(0, 140);
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];

  page.on("pageerror", e => errors.push(e.message));
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });

  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForLoadState("networkidle", { timeout: 12000 }).catch(() => {});

  const actions = await page.locator("a,button,[role=button],input[type=submit]").evaluateAll(els =>
    els.slice(0, 80).map((el, index) => {
      const rect = el.getBoundingClientRect();
      const text = clean(el.innerText || el.value || el.getAttribute("aria-label") || el.getAttribute("title"));
      const href = el.tagName === "A" ? el.href : null;
      return {
        index,
        tag: el.tagName.toLowerCase(),
        text,
        href,
        type: el.getAttribute("type"),
        visible: rect.width > 0 && rect.height > 0,
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height)
      };
    }).filter(x => x.visible && (x.text || x.href))
  );

  const forms = await page.locator("form").evaluateAll(forms =>
    forms.slice(0, 20).map((form, index) => ({
      index,
      action: form.action,
      method: form.method || "get",
      fields: [...form.elements].slice(0, 20).map(el => ({
        name: el.name,
        type: el.type,
        placeholder: el.placeholder || "",
        required: Boolean(el.required)
      }))
    }))
  );

  const candidates = actions.filter(a =>
    /start|get started|try|demo|sign up|signup|create|launch|begin|explore|book|order|play|login|log in/i.test(a.text)
  ).slice(0, 12);

  const workflow = {
    version: "0.3",
    source: url,
    generatedAt: new Date().toISOString(),
    actions,
    forms,
    candidates,
    suggestedFlow: candidates.length
      ? candidates.slice(0, 3).map(a => ({
          actionIndex: a.index,
          reason: "High-signal CTA",
          label: a.text
        }))
      : actions.slice(0, 3).map(a => ({
          actionIndex: a.index,
          reason: "Fallback visible action",
          label: a.text || a.href
        })),
    consoleErrors: errors
  };

  fs.mkdirSync("output", { recursive: true });
  fs.writeFileSync("output/workflow.json", JSON.stringify(workflow, null, 2));
  console.log(JSON.stringify(workflow, null, 2));
  await browser.close();
})().catch(err => {
  console.error(err.stack || err);
  process.exit(1);
});
