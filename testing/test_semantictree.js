/*
  test_semantictree_final.js

  Zero-npm browser DOM tester for compact accessibility/action snapshots.

  Usage:
    mkdir -p cases
    node test_semantictree_final.js ./cases ./outputs

  Notes:
    - ESM script. Safe inside repos with package.json { "type": "module" }.
    - No playwright-core, no puppeteer, no jsdom.
    - Launches Chrome/Chromium/Edge through Chrome DevTools Protocol.
    - Output keeps interaction/accessibility data only: role/name/state/context + selector for runtime.
*/

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";
import { makeSemanticUiTree } from "../src/core/semantic-ui-tree.js";

const CASES_DIR = path.resolve(process.argv[2] || "./cases");
const OUT_DIR = path.resolve(process.argv[3] || "./outputs");
const MAX_ACTIONS = Number(process.env.MAX_ACTIONS || 80);
const MAX_REGIONS = Number(process.env.MAX_REGIONS || 12);
const MAX_BYTES = Number(process.env.MAX_BYTES || 50000);
const MIN_ACTIONS_AFTER_BUDGET = Number(process.env.MIN_ACTIONS_AFTER_BUDGET || 12);

const BROWSER_PATHS = [
  process.env.BROWSER_PATH,
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/usr/bin/google-chrome",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
].filter(Boolean);

function findBrowser() {
  for (const p of BROWSER_PATHS) {
    try {
      if (p && fs.existsSync(p)) return p;
    } catch {}
  }
  throw new Error("Cannot find Chrome/Chromium/Edge. Set BROWSER_PATH=/path/to/browser.");
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function launchBrowser() {
  const exe = findBrowser();
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "sem-ui-cdp-"));
  const args = [
    "--headless=new",
    "--remote-debugging-port=0",
    `--user-data-dir=${userDataDir}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-gpu",
    "--disable-dev-shm-usage",
    "--disable-background-networking",
    "about:blank",
  ];

  if (process.platform !== "win32") args.unshift("--no-sandbox");

  const proc = spawn(exe, args, { stdio: ["ignore", "ignore", "pipe"] });
  proc.userDataDir = userDataDir;
  return proc;
}

async function getBrowserWs(proc) {
  let buf = "";
  return await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Timed out waiting for DevTools URL")), 15000);
    proc.stderr.on("data", (chunk) => {
      buf += chunk.toString();
      const m = buf.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (m) {
        clearTimeout(timer);
        resolve(m[1]);
      }
    });
    proc.on("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`Browser exited before DevTools URL. code=${code}\n${buf}`));
    });
  });
}

class CDP {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.id = 0;
    this.pending = new Map();
    this.events = new Map();
    this.opened = new Promise((resolve, reject) => {
      this.ws.addEventListener("open", resolve, { once: true });
      this.ws.addEventListener("error", reject, { once: true });
    });
    this.ws.addEventListener("message", (ev) => {
      const msg = JSON.parse(String(ev.data));
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(`${msg.error.message || "CDP error"}: ${JSON.stringify(msg.error)}`));
        else resolve(msg.result);
        return;
      }
      if (msg.method) {
        const handlers = this.events.get(msg.method) || [];
        for (const h of handlers) h(msg.params || {});
      }
    });
  }

  async send(method, params = {}) {
    await this.opened;
    const id = ++this.id;
    const payload = JSON.stringify({ id, method, params });
    const p = new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
    this.ws.send(payload);
    return p;
  }

  on(method, handler) {
    if (!this.events.has(method)) this.events.set(method, []);
    this.events.get(method).push(handler);
  }

  close() {
    try { this.ws.close(); } catch {}
  }
}

async function withTimeout(promise, ms, message) {
  let t;
  const timeout = new Promise((_, reject) => { t = setTimeout(() => reject(new Error(message)), ms); });
  try { return await Promise.race([promise, timeout]); }
  finally { clearTimeout(t); }
}

async function createPage(browserWs, url) {
  const u = new URL(browserWs);
  const http = `http://${u.host}/json/new?${encodeURIComponent(url)}`;
  let res = await fetch(http, { method: "PUT" });
  if (!res.ok) res = await fetch(http); // older Chromium fallback
  if (!res.ok) throw new Error(`Cannot create target: ${res.status} ${await res.text()}`);
  const info = await res.json();
  return info.webSocketDebuggerUrl;
}

const EXTRACTOR_SOURCE = makeSemanticUiTree.toString();
async function evaluateFile(filePath, outPath, browserWs) {
  const pageWs = await createPage(browserWs, "about:blank");
  const cdp = new CDP(pageWs);
  await cdp.opened;
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");

  let loaded = false;
  const loadPromise = new Promise((resolve) => {
    cdp.on("Page.loadEventFired", () => { loaded = true; resolve(); });
  });

  const sourceUrl = pathToFileURL(filePath).href;
  const html = fs.readFileSync(filePath, "utf8");
  await cdp.send("Page.navigate", { url: "about:blank" });
  if (!loaded) await withTimeout(loadPromise, 10000, `Timed out opening blank page for ${sourceUrl}`);
  await cdp.send("Runtime.evaluate", { expression: "document.open();", returnByValue: true });
  const chunkSize = 16000;
  for (let i = 0; i < html.length; i += chunkSize) {
    const chunk = html.slice(i, i + chunkSize);
    await cdp.send("Runtime.evaluate", {
      expression: `document.write(${JSON.stringify(chunk)});`,
      returnByValue: true,
    });
  }
  await cdp.send("Runtime.evaluate", {
    expression: `document.close(); window.__SEMANTIC_SOURCE_URL = ${JSON.stringify(sourceUrl)};`,
    returnByValue: true,
  });
  // Let layout settle for CSS visibility.
  await wait(50);

  const expression = `(${EXTRACTOR_SOURCE})({ maxActions: ${MAX_ACTIONS}, maxRegions: ${MAX_REGIONS}, maxBytes: ${MAX_BYTES} })`;
  const result = await cdp.send("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
    timeout: 10000,
  });

  if (result.exceptionDetails) {
    throw new Error(`Evaluation failed in ${filePath}: ${JSON.stringify(result.exceptionDetails, null, 2)}`);
  }

  const obj = result.result.value;

  // Tự tính độ dài nếu stats.bytes bị thiếu
  if (obj && obj.stats && obj.stats.bytes === undefined) {
    obj.stats.bytes = Buffer.byteLength(JSON.stringify(obj), "utf8");
  }

  fs.writeFileSync(outPath, JSON.stringify(obj, null, 2), "utf8");
  cdp.close();
  return obj;
}

function applyByteBudget(obj) {
  // Logic removed: now handled inside makeSemanticUiTree
}
async function main() {
  if (!fs.existsSync(CASES_DIR)) throw new Error(`Cases dir not found: ${CASES_DIR}`);
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const files = fs.readdirSync(CASES_DIR).filter((f) => f.toLowerCase().endsWith(".html")).sort();
  if (!files.length) throw new Error(`No .html files in ${CASES_DIR}`);

  const browser = launchBrowser();
  const browserWs = await getBrowserWs(browser);
  console.log(`Browser: ${browser.spawnfile}`);
  console.log(`Cases: ${CASES_DIR}`);
  console.log(`Outputs: ${OUT_DIR}`);

  const summary = [];
  try {
    for (const f of files) {
      const inFile = path.join(CASES_DIR, f);
      const outFile = path.join(OUT_DIR, f.replace(/\.html$/i, ".json"));
      const obj = await evaluateFile(inFile, outFile, browserWs);

      // Sử dụng obj.stats.bytes (đã được đảm bảo tồn tại)
      const bytes = obj.stats?.bytes || 0;

      summary.push({
        file: f,
        actions: obj.actions?.length || 0,
        regions: obj.regions?.length || 0,
        bytes: bytes
      });
      console.log(`${f}: ${obj.actions?.length || 0} actions, ${obj.regions?.length || 0} regions, ${bytes} bytes`);
    }
  } finally {
    browser.kill();
    try { fs.rmSync(browser.userDataDir, { recursive: true, force: true }); } catch {}
  }

  const sumFile = path.join(OUT_DIR, "_summary.json");
  fs.writeFileSync(sumFile, JSON.stringify(summary, null, 2), "utf8");
}

main().catch((err) => {
  console.error(err.stack || err.message || err);
  process.exitCode = 1;
});

