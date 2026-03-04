import puppeteer from "puppeteer-core";
import { storage } from "./storage";
import type { Task, Action } from "@shared/schema";
import { execSync } from "child_process";
import os from "os";

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
let activeBrowser: any = null;

process.on("SIGTERM", async () => {
  try { await activeBrowser?.close(); } finally { process.exit(0); }
});

setInterval(() => {
  const m = process.memoryUsage();
  console.log(`[Memory] RSS=${Math.round(m.rss / 1024 / 1024)}MB Heap=${Math.round(m.heapUsed / 1024 / 1024)}MB`);
}, 60000);

export function isTaskRunning(taskId: string): boolean {
  return runningTasks.get(taskId) === true;
}

export function stopTask(taskId: string) {
  runningTasks.set(taskId, false);
}

function buildBrowserArgs(ua?: string): string[] {
  const args = [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-dev-shm-usage",
    "--disable-gpu",
    "--disable-software-rasterizer",
    "--disable-blink-features=AutomationControlled",
    "--disable-infobars",
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
  return args;
}

async function createBrowser(): Promise<any> {
  const ua = getRandomUserAgent();
  const args = buildBrowserArgs(ua);
  const browser = await puppeteer.launch({ executablePath: CHROMIUM_PATH, headless: true, args });
  activeBrowser = browser;
  console.log(`[Task] Browser launched (direct)`);
  return browser;
}

function isHighMemory(): boolean {
  const rss = process.memoryUsage().rss;
  const total = os.totalmem();
  const pct = (rss / total) * 100;
  if (pct > 60) {
    console.log(`[Memory Guard] ${Math.round(pct)}% RAM used, recycling browser...`);
    return true;
  }
  return false;
}

export async function executeTask(task: Task) {
  if (isTaskRunning(task.id)) return;

  runningTasks.set(task.id, true);
  await storage.updateTask(task.id, { status: "running", completedRuns: 0, failedRuns: 0 });
  console.log(`[Task] Starting ${task.repetitions} runs`);

  let browser = await createBrowser();
  let consecutiveFailures = 0;

  for (let i = 1; i <= task.repetitions; i++) {
    if (!runningTasks.get(task.id)) {
      await storage.updateTask(task.id, { status: "stopped" });
      await storage.createTaskLog({ taskId: task.id, runNumber: i, status: "stopped", message: "Task stopped by user" });
      break;
    }

    if (!browser || !browser.isConnected()) {
      console.log("[Recovery] Browser disconnected, relaunching...");
      try { await browser?.close(); } catch {}
      browser = await createBrowser();
    }

    if (i > 1 && i % 5 === 1) {
      console.log("[Recycle] Restarting browser to free memory...");
      try { await browser.close(); } catch {}
      browser = await createBrowser();
    }

    if (i > 1 && i % 200 === 1) {
      console.log("[Batch] 200-run batch complete, pausing 30s...");
      try { await browser.close(); } catch {}
      await delay(30000);
      browser = await createBrowser();
    }

    if (isHighMemory()) {
      try { await browser.close(); } catch {}
      browser = await createBrowser();
    }

    try {
      const result = await Promise.race([
        performPageVote(browser, task, i),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Run timeout after 60s")), 60000)
        ),
      ]);
      consecutiveFailures = 0;
      const currentTask = await storage.getTask(task.id);
      if (currentTask) await storage.updateTask(task.id, { completedRuns: (currentTask.completedRuns || 0) + 1 });
      await storage.createTaskLog({ taskId: task.id, runNumber: i, status: "success", ipUsed: "direct", message: result.message });
      console.log(`[Task] Run ${i}/${task.repetitions} SUCCESS`);
    } catch (error: any) {
      consecutiveFailures++;
      const currentTask = await storage.getTask(task.id);
      if (currentTask) await storage.updateTask(task.id, { failedRuns: (currentTask.failedRuns || 0) + 1 });
      await storage.createTaskLog({ taskId: task.id, runNumber: i, status: "failed", message: error.message || "Unknown error" });
      console.log(`[Task] Run ${i}/${task.repetitions} FAILED - ${error.message} (consecutive: ${consecutiveFailures})`);

      if (consecutiveFailures >= 5) {
        console.log("[Self-Heal] 5 consecutive failures, restarting service...");
        try { await browser.close(); } catch {}
        process.exit(1);
      }

      if (error.message?.includes("timeout") || error.message?.includes("Protocol") || error.message?.includes("Target closed")) {
        console.log("[Recovery] Critical error, relaunching browser...");
        try { await browser.close(); } catch {}
        try { browser = await createBrowser(); } catch (relaunchErr: any) {
          console.log(`[Recovery] Relaunch failed: ${relaunchErr.message}`);
        }
      }
    }

    if (i < task.repetitions && runningTasks.get(task.id)) {
      await delay(Math.max(task.delayMs, 2000));
    }
  }

  try { await browser.close(); } catch (_) {}
  activeBrowser = null;
  if (runningTasks.get(task.id)) await storage.updateTask(task.id, { status: "completed" });
  runningTasks.delete(task.id);
  console.log(`[Task] Finished`);
}

async function performPageVote(browser: any, task: Task, runNumber: number): Promise<{ message: string }> {
  const page = await browser.newPage();

  try {
    const client = await page.target().createCDPSession();
    await client.send("Network.clearBrowserCookies");
    await client.send("Network.clearBrowserCache");
    await client.send("Storage.clearDataForOrigin", {
      origin: new URL(task.targetUrl).origin,
      storageTypes: "all",
    });

    await page.setViewport({ width: 1366, height: 768 });

    await page.setRequestInterception(true);
    page.on("request", (req: any) => {
      const type = req.resourceType();
      if (["image", "font", "media"].includes(type)) {
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

    await page.evaluateOnNewDocument(() => {
      localStorage.clear();
      sessionStorage.clear();
    });

    await page.goto(task.targetUrl, { waitUntil: "domcontentloaded", timeout: 30000 });

    const loadedUrl = page.url();
    if (loadedUrl.includes("chrome-error") || loadedUrl === "about:blank") {
      throw new Error(`Page failed to load: ${loadedUrl}`);
    }

    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });

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

    await delay(4000 + Math.random() * 2000);

    let currentUrl = "";
    try { currentUrl = page.url(); } catch (_e) { currentUrl = "redirected"; }

    let pageText = "";
    try {
      pageText = await page.evaluate(() => document.body?.innerText?.slice(0, 400) || "");
    } catch (_e) {}

    page.removeAllListeners();
    await page.close();

    const textOneLine = pageText.replace(/\s+/g, " ").trim();
    console.log(`[Vote] Run #${runNumber} URL=${currentUrl} | TEXT=${textOneLine}`);

    const voted = currentUrl.includes("/result") || currentUrl !== task.targetUrl;
    return { message: `Run #${runNumber} - ${voted ? "VOTED" : "DONE"} - URL:${currentUrl} - ${textOneLine.slice(0, 120)}` };
  } catch (error: any) {
    try { page.removeAllListeners(); await page.close(); } catch (_) {}
    if (error.message?.includes("detached") || error.message?.includes("navigation")) {
      return { message: `Run #${runNumber} - VOTED (redirected)` };
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
