const { chromium } = require("playwright");
const fs = require("fs");

const url = process.argv[2];
if (!url) {
  console.error("Usage: node recorder.js https://example.com");
  process.exit(1);
}

const SAFE_TEXT = /^(start|get started|try|try it|demo|explore|learn more|discover|play|begin|launch|view demo|see demo)$/i;
const BLOCKED_TEXT = /(delete|remove|cancel|logout|log out|pay|purchase|buy|subscribe|checkout|transfer|withdraw|send money|confirm payment|publish|post|deploy)/i;

function clean(v) {
  return (v || "").replace(/\s+/g, " ").trim().slice(0, 140);
}

async function inspectButtons(page) {
  return page.locator("a,button,[role=button]").evaluateAll(els =>
    els.slice(0, 80).map((el, index) => {
      const r = el.getBoundingClientRect();
      const text = clean(el.innerText || el.getAttribute("aria-label") || el.getAttribute("title") || el.href);
      return {
        index,
        text,
        href: el.tagName === "A" ? el.href : null,
        tag: el.tagName.toLowerCase(),
        visible: r.width > 0 && r.height > 0
      };
    }).filter(x => x.visible && x.text)
  );
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    recordVideo: { dir: "output/footage" }
  });
  const page = await context.newPage();

  const events = [];
  const errors = [];

  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", e => errors.push(e.message));

  fs.mkdirSync("output/footage", { recursive: true });
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForLoadState("networkidle", { timeout: 12000 }).catch(() => {});

  const before = await page.screenshot({ path: "output/footage/01-opening.png", fullPage: false });
  events.push({ step: 1, type: "opening", screenshot: "01-opening.png", url: page.url(), title: await page.title() });

  const buttons = await inspectButtons(page);
  const candidates = buttons.filter(b => SAFE_TEXT.test(b.text) && !BLOCKED_TEXT.test(b.text));

  if (!candidates.length) {
    events.push({
      step: 2,
      type: "no-safe-cta",
      message: "No safe high-signal CTA found. Recording stopped before interaction."
    });
  } else {
    const target = candidates[0];
    events.push({ step: 2, type: "safe-cta-selected", label: target.text, href: target.href || null });

    const locator = page.locator("a,button,[role=button]").filter({ hasText: target.text }).first();
    const tag = await locator.evaluate(el => el.tagName.toLowerCase()).catch(() => null);

    if (tag === "a") {
      const href = await locator.getAttribute("href");
      if (!href || href.startsWith("javascript:") || href.startsWith("mailto:") || href.startsWith("tel:")) {
        events.push({ step: 3, type: "navigation-blocked", reason: "Unsafe or non-web destination." });
      } else {
        await locator.click();
        await page.waitForLoadState("domcontentloaded", { timeout: 15000 }).catch(() => {});
        await page.waitForTimeout(1000);
        await page.screenshot({ path: "output/footage/02-after-cta.png", fullPage: false });
        events.push({ step: 3, type: "navigation", url: page.url(), screenshot: "02-after-cta.png" });
      }
    } else {
      const beforeUrl = page.url();
      await locator.click();
      await page.waitForTimeout(1200);
      await page.screenshot({ path: "output/footage/02-after-cta.png", fullPage: false });
      events.push({ step: 3, type: "interaction", url: page.url(), urlChanged: beforeUrl !== page.url(), screenshot: "02-after-cta.png" });
    }
  }

  const manifest = {
    version: "0.4",
    source: url,
    capturedAt: new Date().toISOString(),
    events,
    consoleErrors: errors,
    policy: {
      onlySafeCtas: true,
      blockedActionPattern: BLOCKED_TEXT.source,
      noAuthentication: true,
      noPayments: true,
      noDestructiveActions: true
    }
  };

  fs.writeFileSync("output/recording-manifest.json", JSON.stringify(manifest, null, 2));
  await context.close();
  await browser.close();
  console.log(JSON.stringify(manifest, null, 2));
})().catch(err => {
  console.error(err.stack || err);
  process.exit(1);
});
