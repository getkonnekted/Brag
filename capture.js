const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const url = process.argv[2];
if (!url) {
  console.error("Usage: npm run capture -- https://example.com");
  process.exit(1);
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });

  const started = Date.now();
  const requests = [];
  const consoleErrors = [];

  page.on("request", req => requests.push({ method: req.method(), url: req.url() }));
  page.on("console", msg => { if (msg.type() === "error") consoleErrors.push(msg.text()); });
  page.on("pageerror", err => consoleErrors.push(err.message));

  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});

  const title = await page.title();
  const description = await page.locator('meta[name="description"]').getAttribute("content").catch(() => null);
  const headings = await page.locator("h1,h2,h3").allTextContents();
  const links = await page.locator("a").evaluateAll(as => as.slice(0, 40).map(a => ({
    text: (a.innerText || "").trim().replace(/\\s+/g, " ").slice(0, 120),
    href: a.href
  })).filter(x => x.text || x.href));
  const buttons = await page.locator("button,[role=button],input[type=submit]").evaluateAll(els => els.slice(0, 30).map(el => ({
    text: (el.innerText || el.value || el.getAttribute("aria-label") || "").trim().replace(/\\s+/g, " ").slice(0, 100)
  })).filter(x => x.text));
  const screenshot = await page.screenshot({ fullPage: true });

  const result = {
    url,
    title,
    description,
    headings: headings.map(x => x.trim()).filter(Boolean).slice(0, 30),
    links,
    buttons,
    requestCount: requests.length,
    consoleErrors,
    elapsedMs: Date.now() - started,
    capturedAt: new Date().toISOString()
  };

  fs.mkdirSync("output", { recursive: true });
  fs.writeFileSync("output/inspection.json", JSON.stringify(result, null, 2));
  fs.writeFileSync("output/home.png", screenshot);

  console.log(JSON.stringify(result, null, 2));
  await browser.close();
})().catch(err => {
  console.error(err.stack || err);
  process.exit(1);
});
