const http = require("http");
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");
const { buildStoryboard } = require("./director");

const PORT = process.env.PORT || 4173;
const root = __dirname;
const mime = { ".html":"text/html", ".js":"text/javascript", ".css":"text/css", ".json":"application/json", ".png":"image/png" };

async function inspect(url) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", e => errors.push(e.message));
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForLoadState("networkidle", { timeout: 12000 }).catch(() => {});
  const result = {
    url,
    title: await page.title(),
    description: await page.locator('meta[name="description"]').getAttribute("content").catch(() => null),
    headings: await page.locator("h1,h2,h3").allTextContents(),
    buttons: await page.locator("button,[role=button],input[type=submit]").evaluateAll(els => els.slice(0,30).map(el => ({ text:(el.innerText || el.value || el.getAttribute("aria-label") || "").trim() })).filter(x => x.text)),
    links: await page.locator("a").evaluateAll(as => as.slice(0,40).map(a => ({ text:(a.innerText || "").trim(), href:a.href })).filter(x => x.text || x.href)),
    consoleErrors: errors
  };
  await browser.close();
  return result;
}

const server = http.createServer(async (req,res) => {
  try {
    if (req.method === "POST" && req.url === "/api/inspect") {
      let body=""; req.on("data", c => body += c);
      req.on("end", async () => {
        try {
          const { url } = JSON.parse(body || "{}");
          if (!url || !/^https?:\\/\\//i.test(url)) throw new Error("A valid http(s) URL is required.");
          const inspection = await inspect(url);
          const storyboard = buildStoryboard(inspection);
          res.writeHead(200, {"Content-Type":"application/json","Access-Control-Allow-Origin":"*"});
          res.end(JSON.stringify({ inspection, storyboard }));
        } catch (e) {
          res.writeHead(400, {"Content-Type":"application/json"});
          res.end(JSON.stringify({ error:e.message }));
        }
      });
      return;
    }

    let file = req.url === "/" ? "/index.html" : req.url;
    file = path.normalize(file).replace(/^\\.{2}/, "");
    const target = path.join(root,file);
    if (!target.startsWith(root)) { res.writeHead(403); return res.end("Forbidden"); }
    if (!fs.existsSync(target) || fs.statSync(target).isDirectory()) { res.writeHead(404); return res.end("Not found"); }
    res.writeHead(200, {"Content-Type":mime[path.extname(target)] || "application/octet-stream"});
    fs.createReadStream(target).pipe(res);
  } catch (e) {
    res.writeHead(500); res.end(e.message);
  }
});

server.listen(PORT, () => console.log("BRAG running at http://localhost:"+PORT));
