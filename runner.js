const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const SAFE = /^(start|get started|try|try it|demo|explore|learn more|discover|play|begin|launch|view demo|see demo|continue|next|open|view|details|dashboard|features|how it works)$/i;
const BLOCKED = /(delete|remove|cancel|logout|log out|pay|purchase|buy|subscribe|checkout|transfer|withdraw|send money|confirm payment|publish|post|deploy|password|reset password|verify|sign in|signin|login|log in|upload|download)/i;

function clean(v) { return (v || "").replace(/\s+/g, " ").trim().slice(0, 140); }

function isSafeHref(href, origin) {
  if (!href) return false;
  try {
    const u = new URL(href, origin);
    return u.origin === origin && !["mailto:", "tel:", "javascript:"].includes(u.protocol);
  } catch { return false; }
}

async function visibleActions(page) {
  return page.locator("a,button,[role=button],input[type=submit]").evaluateAll(els =>
    els.slice(0, 100).map((el, index) => {
      const r = el.getBoundingClientRect();
      const text = clean(el.innerText || el.value || el.getAttribute("aria-label") || el.getAttribute("title") || el.href);
      return {
        index, tag: el.tagName.toLowerCase(), text,
        href: el.tagName === "A" ? el.href : null,
        type: el.getAttribute("type"),
        visible: r.width > 0 && r.height > 0,
        x: Math.round(r.x), y: Math.round(r.y),
        width: Math.round(r.width), height: Math.round(r.height)
      };
    }).filter(x => x.visible && x.text)
  );
}

function score(action, origin) {
  if (BLOCKED.test(action.text)) return -1000;
  if (action.tag === "a" && !isSafeHref(action.href, origin)) return -900;
  if (action.type === "submit") return -800;
  if (!SAFE.test(action.text)) return 0;
  const priority = /get started|try|demo|start|launch|play|continue|next|explore|discover/i;
  return priority.test(action.text) ? 100 : 50;
}

async function runWorkflow(url, options = {}) {
  const maxSteps = Math.min(Math.max(Number(options.maxSteps) || 4, 1), 6);
  const outputDir = options.outputDir || path.join(process.cwd(), "output", "recording");
  fs.mkdirSync(outputDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    recordVideo: { dir: path.join(outputDir, "video") }
  });
  const page = await context.newPage();
  const origin = new URL(url).origin;
  const errors = [];
  const steps = [];
  let lastActionPoint = null;
  const visited = new Set();

  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", e => errors.push(e.message));

  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForLoadState("networkidle", { timeout: 12000 }).catch(() => {});

    for (let step = 1; step <= maxSteps; step++) {
      const beforeUrl = page.url();
      const screenshot = `step-${String(step).padStart(2, "0")}-before.png`;
      await page.screenshot({ path: path.join(outputDir, screenshot), fullPage: false });

      const actions = await visibleActions(page);
      const candidates = actions
        .map(a => ({ ...a, score: score(a, origin) }))
        .filter(a => a.score > 0)
        .sort((a,b) => b.score - a.score || a.y - b.y);

      const target = candidates.find(a => !visited.has(`${page.url()}|${a.text}|${a.href || ""}`));
      if (!target) {
        steps.push({ step, type: "stop", reason: "No new safe action found", url: page.url(), screenshot });
        break;
      }

      visited.add(`${page.url()}|${target.text}|${target.href || ""}`);
      steps.push({
        step,
        type: "action-selected",
        action: { text: target.text, tag: target.tag, href: target.href || null },
        url: page.url(),
        screenshot
      });

      const locator = page.locator("a,button,[role=button],input[type=submit]").filter({ hasText: target.text }).first();
      if (target.tag === "a") {
        if (!isSafeHref(target.href, origin)) {
          steps.push({ step, type: "blocked", reason: "Destination is outside approved origin or unsafe." });
          break;
        }
        await locator.click({ timeout: 8000 });
      } else {
        await locator.click({ timeout: 8000 });
      }

      await page.waitForLoadState("domcontentloaded", { timeout: 12000 }).catch(() => {});
      await page.waitForTimeout(1000);

      const afterUrl = page.url();
      if (!afterUrl.startsWith(origin)) {
        steps.push({ step, type: "blocked", reason: "Navigation left approved origin.", url: afterUrl });
        break;
      }

      const afterScreenshot = `step-${String(step).padStart(2, "0")}-after.png`;
      await page.screenshot({ path: path.join(outputDir, afterScreenshot), fullPage: false });

      const headings = await page.locator("h1,h2,h3").allTextContents();
      steps.push({
        step,
        type: "state-captured",
        url: afterUrl,
        urlChanged: beforeUrl !== afterUrl,
        title: await page.title(),
        headings: headings.map(clean).filter(Boolean).slice(0, 8),
        screenshot: afterScreenshot
      });
    }

    const manifest = {
      version: "0.5",
      source: url,
      capturedAt: new Date().toISOString(),
      maxSteps,
      steps,
      consoleErrors: errors,
      policy: {
        sameOriginOnly: true,
        safeActionAllowlist: SAFE.source,
        blockedActionPattern: BLOCKED.source,
        maxSteps
      }
    };

    fs.writeFileSync(path.join(outputDir, "manifest.json"), JSON.stringify(manifest, null, 2));
    return manifest;
  } finally {
    await context.close();
    await browser.close();
  }
}

if (require.main === module) {
  const url = process.argv[2];
  if (!url) {
    console.error("Usage: node runner.js https://example.com [maxSteps]");
    process.exit(1);
  }
  runWorkflow(url, { maxSteps: process.argv[3] })
    .then(result => console.log(JSON.stringify(result, null, 2)))
    .catch(err => { console.error(err.stack || err); process.exit(1); });
}

module.exports = { runWorkflow };
