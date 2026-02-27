import puppeteer from "puppeteer-core";
import { storage } from "./storage";
import type { Task, Action } from "@shared/schema";
import { execSync } from "child_process";

function findChromium(): string {
  const candidates = [
    process.env.CHROMIUM_PATH,
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/google-chrome",
    "/nix/store/zi4f80l169xlmivz8vja8wlphq74qqk0-chromium-125.0.6422.141/bin/chromium",
  ];
  for (const p of candidates) {
    if (!p) continue;
    try { execSync(`test -f "${p}"`); return p; } catch {}
  }
  try { return execSync("which chromium || which chromium-browser || which google-chrome").toString().trim(); } catch {}
  return "/usr/bin/chromium";
}

const CHROMIUM_PATH = findChromium();

const runningTasks = new Map<string, boolean>();
let cachedProxies: string[] = [];
let proxyFetchTime = 0;

export function isTaskRunning(taskId: string): boolean {
  return runningTasks.get(taskId) === true;
}

export function stopTask(taskId: string) {
  runningTasks.set(taskId, false);
}

async function fetchProxyList(proxyListUrl: string): Promise<string[]> {
  const now = Date.now();
  if (cachedProxies.length > 0 && now - proxyFetchTime < 10 * 60 * 1000) {
    return cachedProxies;
  }
  try {
    console.log(`[Proxy] Fetching proxy list...`);
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), 15000);
    const res = await fetch(proxyListUrl, { signal: controller.signal });
    clearTimeout(tid);
    const text = await res.text();
    const lines = text.trim().split("\n").filter(l => l.trim().length > 0);
    if (lines.length > 0) {
      const shuffled = lines.sort(() => Math.random() - 0.5).slice(0, 300);
      cachedProxies = shuffled;
      proxyFetchTime = now;
      console.log(`[Proxy] Fetched ${lines.length} proxies, using ${shuffled.length}`);
    }
    return cachedProxies;
  } catch (e: any) {
    console.log(`[Proxy] Fetch failed: ${e.message} - continuing without proxies`);
    return [];
  }
}

function parseProxyLine(line: string): { host: string; port: string; user: string; pass: string } {
  const parts = line.trim().split(":");
  return { host: parts[0], port: parts[1], user: parts[2], pass: parts[3] };
}

function buildBrowserArgs(proxyHost?: string, ua?: string): string[] {
  const args = [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-dev-shm-usage",
    "--disable-gpu",
    "--disable-software-rasterizer",
    "--disable-blink-features=AutomationControlled",
    "--disable-infobars",
    "--single-process",
    "--no-zygote",
    "--disable-extensions",
    "--disable-background-networking",
    "--disable-default-apps",
    "--disable-sync",
    "--disable-translate",
    "--no-first-run",
    "--disable-features=site-per-process,TranslateUI",
    "--disable-ipc-flooding-protection",
    "--disable-renderer-backgrounding",
    "--disable-backgrounding-occluded-windows",
    "--disable-component-update",
    "--disable-domain-reliability",
    "--disable-print-preview",
    "--disable-speech-api",
    "--disable-hang-monitor",
    "--disable-client-side-phishing-detection",
    "--metrics-recording-only",
    "--disable-crash-reporter",
    "--disable-oor-cors",
    "--js-flags=--max-old-space-size=128",
    "--window-size=1366,768",
  ];
  if (ua) args.push(`--user-agent=${ua}`);
  if (proxyHost) args.push(`--proxy-server=${proxyHost}`);
  return args;
}

async function launchBrowser(proxies: string[]): Promise<{ browser: any; proxyAuth: { username: string; password: string } | null; proxyLabel: string }> {
  let proxyAuth: { username: string; password: string } | null = null;
  let proxyLabel = "direct";
  let proxyHost: string | undefined;

  if (proxies.length > 0) {
    const p = parseProxyLine(proxies[Math.floor(Math.random() * proxies.length)]);
    proxyHost = `http://${p.host}:${p.port}`;
    proxyAuth = { username: p.user, password: p.pass };
    proxyLabel = `${p.host}:${p.port}`;
  }

  const ua = getRandomUserAgent();
  const args = buildBrowserArgs(proxyHost, ua);

  try {
    const browser = await puppeteer.launch({ executablePath: CHROMIUM_PATH, headless: true, args });
    return { browser, proxyAuth, proxyLabel };
  } catch (e: any) {
    throw new Error(`Browser launch failed: ${e.message}`);
  }
}

export async function executeTask(task: Task) {
  if (isTaskRunning(task.id)) return;

  runningTasks.set(task.id, true);
  await storage.updateTask(task.id, { status: "running", completedRuns: 0, failedRuns: 0 });
  console.log(`[Task] Starting ${task.repetitions} runs`);

  const webshareUrl = process.env.WEBSHARE_PROXY_URL;
  let proxies: string[] = [];
  if (webshareUrl) proxies = await fetchProxyList(webshareUrl);

  const launched = await launchBrowser(proxies);
  const browser = launched.browser;
  const proxyAuth = launched.proxyAuth;
  const proxyLabel = launched.proxyLabel;
  console.log(`[Task] Browser launched with proxy: ${proxyLabel}`);

  for (let i = 1; i <= task.repetitions; i++) {
    if (!runningTasks.get(task.id)) {
      await storage.updateTask(task.id, { status: "stopped" });
      await storage.createTaskLog({ taskId: task.id, runNumber: i, status: "stopped", message: "Task stopped by user" });
      break;
    }

    try {
      const result = await performPageVote(browser, proxyAuth, proxyLabel, task, i);
      const currentTask = await storage.getTask(task.id);
      if (currentTask) await storage.updateTask(task.id, { completedRuns: (currentTask.completedRuns || 0) + 1 });
      await storage.createTaskLog({ taskId: task.id, runNumber: i, status: "success", ipUsed: result.ip || "direct", message: result.message });
      console.log(`[Task] Run ${i}/${task.repetitions} SUCCESS - ${result.ip || "direct"}`);
    } catch (error: any) {
      const currentTask = await storage.getTask(task.id);
      if (currentTask) await storage.updateTask(task.id, { failedRuns: (currentTask.failedRuns || 0) + 1 });
      await storage.createTaskLog({ taskId: task.id, runNumber: i, status: "failed", message: error.message || "Unknown error" });
      console.log(`[Task] Run ${i}/${task.repetitions} FAILED - ${error.message}`);
    }

    if (i < task.repetitions && runningTasks.get(task.id)) {
      await delay(Math.max(task.delayMs, 2000));
    }
  }

  try { await browser.close(); } catch (_) {}
  if (runningTasks.get(task.id)) await storage.updateTask(task.id, { status: "completed" });
  runningTasks.delete(task.id);
  console.log(`[Task] Finished`);
}

async function performPageVote(browser: any, proxyAuth: { username: string; password: string } | null, proxyLabel: string, task: Task, runNumber: number): Promise<{ ip?: string; message: string }> {
  const page = await browser.newPage();

  try {
    if (proxyAuth) await page.authenticate(proxyAuth);

    await page.setViewport({ width: 1366, height: 768 });

    await page.setRequestInterception(true);
    page.on("request", (req: any) => {
      const type = req.resourceType();
      if (["image", "stylesheet", "font", "media", "other"].includes(type)) {
        req.abort();
      } else {
        req.continue();
      }
    });

    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => false });
      Object.defineProperty(navigator, "languages", { get: () => ["ar-EG", "ar", "en-US", "en"] });
      Object.defineProperty(navigator, "plugins", { get: () => [1, 2, 3, 4, 5] });
      (window as any).chrome = { runtime: {} };
    });

    await page.goto(task.targetUrl, { waitUntil: "domcontentloaded", timeout: 30000 });

    const loadedUrl = page.url();
    if (loadedUrl.includes("chrome-error") || loadedUrl === "about:blank") {
      throw new Error(`Page failed to load: ${loadedUrl}`);
    }

    await delay(800 + Math.random() * 1200);

    for (const action of task.actions) {
      try {
        await executeAction(page, action);
      } catch (actionErr: any) {
        if (actionErr.message?.includes("detached") || actionErr.message?.includes("navigation")) break;
        throw actionErr;
      }
      await delay(300 + Math.random() * 700);
    }

    await delay(1500 + Math.random() * 1500);

    let currentUrl = "";
    try { currentUrl = page.url(); } catch (_e) { currentUrl = "redirected"; }

    await page.close();

    const voted = currentUrl.includes("/result") || currentUrl !== task.targetUrl;
    return { ip: proxyLabel, message: `Run #${runNumber} - ${voted ? "VOTED" : "DONE"} - Proxy: ${proxyLabel} - Final: ${currentUrl}` };
  } catch (error: any) {
    try { await page.close(); } catch (_) {}
    if (error.message?.includes("detached") || error.message?.includes("navigation")) {
      return { ip: proxyLabel, message: `Run #${runNumber} - VOTED (redirected) - Proxy: ${proxyLabel}` };
    }
    throw error;
  }
}

async function executeAction(page: any, action: Action): Promise<void> {
  const selector = action.selector.trim();

  if (action.type === "wait") {
    const waitMs = parseInt(action.value || "1000");
    await delay(isNaN(waitMs) ? 1000 : waitMs);
    return;
  }

  const cssSelector = buildCssSelector(selector);

  if (action.type === "check") {
    if (cssSelector) {
      try {
        await page.waitForSelector(cssSelector, { timeout: 8000 });
        await page.click(cssSelector);
        return;
      } catch (e) {}
    }
    const nameMatch = selector.match(/name="([^"]+)"/);
    const valueMatch = selector.match(/value="([^"]+)"/);
    if (nameMatch) {
      const name = nameMatch[1];
      const value = valueMatch ? valueMatch[1] : null;
      let jsSelector: string;
      if (value) {
        jsSelector = `document.querySelector('input[name="${name}"][value="${value}"]')`;
      } else {
        jsSelector = `document.querySelector('input[name="${name}"]')`;
      }
      await page.evaluate((sel: string) => {
        const el = eval(sel) as HTMLElement;
        if (el) el.click();
      }, jsSelector);
    }
    return;
  }

  if (action.type === "click") {
    if (cssSelector) {
      try {
        await page.waitForSelector(cssSelector, { timeout: 8000 });
        await page.click(cssSelector);
        return;
      } catch (e) {}
    }
    const idMatch = selector.match(/id="([^"]+)"/);
    if (idMatch) {
      await page.evaluate((id: string) => {
        const el = document.getElementById(id);
        if (el) el.click();
      }, idMatch[1]);
      return;
    }
    const typeMatch = selector.match(/type="([^"]+)"/);
    if (typeMatch && typeMatch[1] === "submit") {
      await page.evaluate(() => {
        const btn = document.querySelector('button[type="submit"], input[type="submit"]') as HTMLElement;
        if (btn) btn.click();
      });
    }
    return;
  }

  if (action.type === "input") {
    if (cssSelector) {
      try {
        await page.waitForSelector(cssSelector, { timeout: 8000 });
        await page.type(cssSelector, action.value || "", { delay: 50 + Math.random() * 100 });
        return;
      } catch (e) {}
    }
    const nameMatch = selector.match(/name="([^"]+)"/);
    if (nameMatch) {
      const sel = `input[name="${nameMatch[1]}"], textarea[name="${nameMatch[1]}"]`;
      await page.waitForSelector(sel, { timeout: 8000 });
      await page.type(sel, action.value || "", { delay: 50 + Math.random() * 100 });
    }
    return;
  }

  if (action.type === "select") {
    const nameMatch = selector.match(/name="([^"]+)"/);
    if (nameMatch) {
      const sel = `select[name="${nameMatch[1]}"]`;
      await page.waitForSelector(sel, { timeout: 8000 });
      await page.select(sel, action.value || "");
    }
    return;
  }
}

function buildCssSelector(htmlOrSelector: string): string | null {
  const trimmed = htmlOrSelector.trim();
  if (!trimmed.startsWith("<")) return trimmed;

  const idMatch = trimmed.match(/id="([^"]+)"/);
  if (idMatch) return `#${idMatch[1]}`;

  const nameMatch = trimmed.match(/name="([^"]+)"/);
  const typeMatch = trimmed.match(/type="([^"]+)"/);
  const valueMatch = trimmed.match(/value="([^"]+)"/);
  const tagMatch = trimmed.match(/^<(\w+)/);

  if (tagMatch && nameMatch) {
    let sel = `${tagMatch[1]}[name="${nameMatch[1]}"]`;
    if (valueMatch) sel += `[value="${valueMatch[1]}"]`;
    if (typeMatch) sel += `[type="${typeMatch[1]}"]`;
    return sel;
  }

  if (tagMatch && typeMatch && typeMatch[1] === "submit") {
    return `${tagMatch[1]}[type="submit"]`;
  }

  return null;
}

function getRandomUserAgent(): string {
  const agents = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  ];
  return agents[Math.floor(Math.random() * agents.length)];
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
