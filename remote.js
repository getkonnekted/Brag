const { spawn, exec } = require("child_process");
const http = require("http");
const crypto = require("crypto");

const root = __dirname;
const port = Number(process.env.BRAG_ENGINE_PORT || 4173);
const token = process.env.BRAG_ENGINE_TOKEN || crypto.randomBytes(24).toString("hex");
const children = [];

function exists(command) {
  return new Promise(resolve => {
    const check = process.platform === "win32" ? `where ${command}` : `command -v ${command}`;
    exec(check, { windowsHide: true }, error => resolve(!error));
  });
}

function waitFor(url, timeout = 30000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const poll = () => {
      const req = http.get(url, res => {
        res.resume();
        if (res.statusCode && res.statusCode < 500) return resolve();
        retry();
      });
      req.on("error", retry);
      req.setTimeout(1200, () => { req.destroy(); retry(); });
      function retry() {
        if (Date.now() - started > timeout) return reject(new Error("Timed out waiting for BRAG Personal Worker."));
        setTimeout(poll, 300);
      }
    };
    poll();
  });
}

function start(command, args, env = {}, label = command) {
  const child = spawn(command, args, { cwd: root, env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"], windowsHide: false });
  children.push(child);
  child.stdout.on("data", data => {
    const text = data.toString();
    process.stdout.write(`[${label}] ${text}`);
    const match = text.match(/https:\/\/[-a-z0-9]+\.trycloudflare\.com/i);
    if (match) console.log(`\nBRAG REMOTE URL: ${match[0]}\nPaste this into the BRAG Engine URL field.\nWorker token: ${token}\n`);
  });
  child.stderr.on("data", data => process.stderr.write(`[${label}] ${data}`));
  return child;
}

async function main() {
  console.log("\nBRAG REMOTE PERSONAL WORKER");
  console.log("────────────────────────────────────────");
  if (!(await exists("cloudflared"))) {
    throw new Error("cloudflared is not installed. Install Cloudflare Tunnel (cloudflared), then run npm run personal:remote again.");
  }

  const worker = start(process.execPath, ["personal.js"], { BRAG_ENGINE_TOKEN: token }, "worker");
  await waitFor(`http://127.0.0.1:${port}/api/health`);

  start("cloudflared", ["tunnel", "--url", `http://127.0.0.1:${port}`], {}, "tunnel");

  console.log("\nThe tunnel is temporary. Keep this terminal open while using remote BRAG.");
  console.log("For a permanent hostname, we will add a named Cloudflare Tunnel next.");
  worker.on("exit", code => { if (code !== 0) process.exitCode = code || 1; });
}

function shutdown() {
  for (const child of children) if (!child.killed) child.kill("SIGTERM");
  setTimeout(() => process.exit(0), 500);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
main().catch(error => { console.error("[BRAG] " + error.message); shutdown(); });
