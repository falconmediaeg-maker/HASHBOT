import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertTaskSchema } from "@shared/schema";
import { executeTask, stopTask, isTaskRunning } from "./automator";
import { execSync } from "child_process";
import path from "path";
import fs from "fs";

const NRJ_CANDIDATES: Record<string, { name: string; targetUrl: string; actions: any[] }> = {
  essam: {
    name: "عصام السقا",
    targetUrl: "https://www.radionrjfm.com/vote/17",
    actions: [
      { type: "check" as const, selector: '<input class="17" value="1" name="answers[289]" type="checkbox">', description: "اختيار عصام السقا" },
      { type: "click" as const, selector: '<button id="btnSub" type="submit">تصويت</button>', description: "ضغط زرار التصويت" },
    ],
  },
  sahab: {
    name: "صحاب الأرض",
    targetUrl: "https://www.radionrjfm.com/vote/8",
    actions: [
      { type: "check" as const, selector: '<input class="8" value="1" name="answers[97]" type="checkbox">', description: "اختيار صحاب الأرض" },
      { type: "click" as const, selector: '<button id="btnSub" type="submit">تصويت</button>', description: "ضغط زرار التصويت" },
    ],
  },
  aliklay: {
    name: "على كلاى",
    targetUrl: "https://www.radionrjfm.com/vote/6",
    actions: [
      { type: "check" as const, selector: '<input class="6" value="1" name="answers[63]" type="checkbox">', description: "اختيار على كلاى" },
      { type: "click" as const, selector: '<button id="btnSub" type="submit">تصويت</button>', description: "ضغط زرار التصويت" },
    ],
  },
};

let nrjTaskIds: Record<string, string | null> = { essam: null, sahab: null, aliklay: null };

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  app.get("/download-project", (_req, res) => {
    try {
      const outPath = "/tmp/project_clean.tar.gz";
      const srcDir = "/tmp/export_clean";
      if (fs.existsSync(srcDir)) execSync(`rm -rf ${srcDir}`);
      fs.mkdirSync(srcDir, { recursive: true });
      const files = ["client","server","shared","replit.md","package.json","package-lock.json","tsconfig.json","drizzle.config.ts","vite.config.ts","tailwind.config.ts","postcss.config.js","components.json"];
      const root = path.resolve(".");
      for (const f of files) {
        const src = path.join(root, f);
        if (fs.existsSync(src)) execSync(`cp -r "${src}" "${srcDir}/"`);
      }
      execSync(`tar -czf "${outPath}" -C "${srcDir}" .`);
      res.download(outPath, "project.tar.gz");
    } catch (e: any) {
      res.status(500).send("Error: " + e.message);
    }
  });

  app.get("/api/tasks", async (_req, res) => {
    try {
      const allTasks = await storage.getTasks();
      const tasksWithRunning = allTasks.map(t => ({
        ...t,
        status: isTaskRunning(t.id) ? "running" : t.status,
      }));
      res.json(tasksWithRunning);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/tasks/:id", async (req, res) => {
    try {
      const task = await storage.getTask(req.params.id);
      if (!task) return res.status(404).json({ error: "Task not found" });
      res.json({
        ...task,
        status: isTaskRunning(task.id) ? "running" : task.status,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/tasks", async (req, res) => {
    try {
      const parsed = insertTaskSchema.parse(req.body);
      const task = await storage.createTask(parsed);
      res.status(201).json(task);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.patch("/api/tasks/:id", async (req, res) => {
    try {
      const task = await storage.updateTask(req.params.id, req.body);
      if (!task) return res.status(404).json({ error: "Task not found" });
      res.json(task);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.delete("/api/tasks/:id", async (req, res) => {
    try {
      await storage.deleteTask(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/tasks/:id/run", async (req, res) => {
    try {
      const task = await storage.getTask(req.params.id);
      if (!task) return res.status(404).json({ error: "Task not found" });
      if (isTaskRunning(task.id)) return res.status(400).json({ error: "Task is already running" });

      executeTask(task);
      res.json({ success: true, message: "Task started" });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/tasks/:id/stop", async (req, res) => {
    try {
      stopTask(req.params.id);
      res.json({ success: true, message: "Task stop requested" });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/tasks/:id/logs", async (req, res) => {
    try {
      const logs = await storage.getTaskLogs(req.params.id);
      res.json(logs);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete("/api/tasks/:id/logs", async (req, res) => {
    try {
      await storage.clearTaskLogs(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/nrj/status/:candidate", async (req, res) => {
    try {
      const candidate = req.params.candidate;
      const taskId = nrjTaskIds[candidate];
      if (taskId) {
        const task = await storage.getTask(taskId);
        if (task) {
          return res.json({
            running: isTaskRunning(task.id),
            completed: task.completedRuns || 0,
            failed: task.failedRuns || 0,
            total: task.repetitions,
            taskId: task.id,
          });
        }
      }
      res.json({ running: false, completed: 0, failed: 0, total: 0, taskId: null });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/nrj/start/:candidate", async (req, res) => {
    try {
      const candidate = req.params.candidate;
      const config = NRJ_CANDIDATES[candidate];
      if (!config) return res.status(400).json({ error: "مرشح غير موجود" });

      const { votes = 100, delayMs = 4000 } = req.body;

      const existingId = nrjTaskIds[candidate];
      if (existingId && isTaskRunning(existingId)) {
        return res.status(400).json({ error: "التصويت شغال بالفعل" });
      }

      const task = await storage.createTask({
        name: `NRJ Vote - ${config.name} - ${new Date().toLocaleTimeString("ar-EG")}`,
        targetUrl: config.targetUrl,
        repetitions: votes,
        delayMs,
        proxyUrl: null,
        actions: config.actions,
      });

      nrjTaskIds[candidate] = task.id;
      executeTask(task);
      res.json({ success: true, taskId: task.id });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/nrj/stop/:candidate", async (req, res) => {
    try {
      const candidate = req.params.candidate;
      const taskId = nrjTaskIds[candidate];
      if (taskId) {
        stopTask(taskId);
      }
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  return httpServer;
}
