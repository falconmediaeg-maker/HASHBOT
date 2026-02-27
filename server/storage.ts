import { tasks, taskLogs, type Task, type InsertTask, type TaskLog, type InsertTaskLog } from "@shared/schema";
import { eq, desc } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool);

export interface IStorage {
  getTasks(): Promise<Task[]>;
  getTask(id: string): Promise<Task | undefined>;
  createTask(task: InsertTask): Promise<Task>;
  updateTask(id: string, data: Partial<Task>): Promise<Task | undefined>;
  deleteTask(id: string): Promise<void>;
  getTaskLogs(taskId: string): Promise<TaskLog[]>;
  createTaskLog(log: InsertTaskLog): Promise<TaskLog>;
  clearTaskLogs(taskId: string): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  async getTasks(): Promise<Task[]> {
    return db.select().from(tasks).orderBy(desc(tasks.createdAt));
  }

  async getTask(id: string): Promise<Task | undefined> {
    const [task] = await db.select().from(tasks).where(eq(tasks.id, id));
    return task;
  }

  async createTask(task: InsertTask): Promise<Task> {
    const [created] = await db.insert(tasks).values(task).returning();
    return created;
  }

  async updateTask(id: string, data: Partial<Task>): Promise<Task | undefined> {
    const [updated] = await db.update(tasks).set(data).where(eq(tasks.id, id)).returning();
    return updated;
  }

  async deleteTask(id: string): Promise<void> {
    await db.delete(taskLogs).where(eq(taskLogs.taskId, id));
    await db.delete(tasks).where(eq(tasks.id, id));
  }

  async getTaskLogs(taskId: string): Promise<TaskLog[]> {
    return db.select().from(taskLogs).where(eq(taskLogs.taskId, taskId)).orderBy(desc(taskLogs.createdAt));
  }

  async createTaskLog(log: InsertTaskLog): Promise<TaskLog> {
    const [created] = await db.insert(taskLogs).values(log).returning();
    return created;
  }

  async clearTaskLogs(taskId: string): Promise<void> {
    await db.delete(taskLogs).where(eq(taskLogs.taskId, taskId));
  }
}

export const storage = new DatabaseStorage();
