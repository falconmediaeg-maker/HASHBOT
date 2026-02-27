import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, jsonb, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const actionSchema = z.object({
  type: z.enum(["click", "check", "input", "select", "wait"]),
  selector: z.string(),
  value: z.string().optional(),
  description: z.string().optional(),
});

export type Action = z.infer<typeof actionSchema>;

export const tasks = pgTable("tasks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  targetUrl: text("target_url").notNull(),
  repetitions: integer("repetitions").notNull().default(1),
  delayMs: integer("delay_ms").notNull().default(3000),
  proxyUrl: text("proxy_url"),
  actions: jsonb("actions").notNull().$type<Action[]>().default([]),
  status: text("status").notNull().default("idle"),
  completedRuns: integer("completed_runs").notNull().default(0),
  failedRuns: integer("failed_runs").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const taskLogs = pgTable("task_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  taskId: varchar("task_id").notNull(),
  runNumber: integer("run_number").notNull(),
  status: text("status").notNull(),
  ipUsed: text("ip_used"),
  message: text("message"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertTaskSchema = createInsertSchema(tasks).omit({
  id: true,
  completedRuns: true,
  failedRuns: true,
  status: true,
  isActive: true,
  createdAt: true,
});

export const insertTaskLogSchema = createInsertSchema(taskLogs).omit({
  id: true,
  createdAt: true,
});

export type InsertTask = z.infer<typeof insertTaskSchema>;
export type Task = typeof tasks.$inferSelect;
export type InsertTaskLog = z.infer<typeof insertTaskLogSchema>;
export type TaskLog = typeof taskLogs.$inferSelect;
