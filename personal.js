const { spawn, exec } = require("child_process");
const http = require("http");

const root = __dirname;
const enginePort = Number(process.env.BRAG_ENGINE_PORT || 4173);
const webPort = Number(process.env.BRAG_WEB_PORT || 3000);
const processes = [];

function commandExists(command) {
  return new Promise(resolve => {
    const check = process.platform === "win32" ? `where ${command}` : `command -v ${command}`;
    exec(check, { windowsHide: true }, error => resolve(!error));
  });
}

function waitFor(url, timeout = 30000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const poll = () => {
      const request = http.get(url, response => {
        response.resume();
        if (response.statusCode && response.statusCode < 500) return resolve();
        retry();
      });
      request.on("error", retry);
      request.setTimeout(1500, () => { request.destroy(); retry(); });
      function retry() {
        if (Date.now() - started > timeout) return reject(new Error(`Timed out waiting for ${url}`));
        setTimeout(poll, 300);
      }
    };
    poll();
  });
}

function start(name, command, args, env = {}) {
  const child = spawn(command, args, {
    cwd: root,
    env: { ...process.env, ...env },
    stdio: "inherit",
    windowsHide: false
  });
  processes.push(child);
  child.on("exit", (code, signal) => {
    if (code !== 0 && signal !== "SIGTERM") console.error(`[BRAG] ${name} stopped (code=${code}, signal=${signal || "none"})`);
  });
  return child;
}

function openBrowser(url) {
  const command = process.platform === "win32"
    ? `start "" "${url}"`
    : process.platform === "darwin"
      ? `open "${url}"`
      : `xdg-open "${url}"`;
  exec(command, { windowsHide: true });
}

async function main() {
  console.log("\nBRAG PERSONAL WORKER");
  console.log("────────────────────────────────────────");
  console.log("Starting the local BRAG engine and control surface.");
  console.log("You do not need to run `npm run engine` separately.");
  console.log("");

  if (!(await commandExists(process.execPath))) throw new Error("Node.js is required.");

  start("engine", process.execPath, ["server.js"], { PORT: String(enginePort) });
  await waitFor(`http://127.0.0.1:${enginePort}/api/health`);

  const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
  start("control surface", npmCommand, ["start", "--", "-p", String(webPort)], {
    PORT: String(webPort),
    NEXT_PUBLIC_BRAG_ENGINE_URL: `http://127.0.0.1:${enginePort}`
  });
  await waitFor(`http://127.0.0.1:${webPort}`);

  console.log("");
  console.log(`BRAG is ready: http://localhost:${webPort}`);
  console.log(`Engine:       http://localhost:${enginePort}`);
  console.log("");
  openBrowser(`http://localhost:${webPort}`);
}

function shutdown() {
  console.log("\nStopping BRAG...");
  for (const child of processes) if (!child.killed) child.kill("SIGTERM");
  setTimeout(() => process.exit(0), 500);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
main().catch(error => {
  console.error("[BRAG] " + error.message);
  shutdown();
});
