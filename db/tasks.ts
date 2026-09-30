import { env } from "cloudflare:workers";
import type { StudyTask, TaskInput } from "@/lib/task";

type TaskRow = Omit<StudyTask, "tags"> & { tags: string };
const columns = `id, plan_id AS planId, title, due_date AS dueDate, priority, tags,
  expected_minutes AS expectedMinutes, completed_at AS completedAt,
  created_at AS createdAt, updated_at AS updatedAt, version`;

function database() {
  if (!env.DB) throw new Error("Database unavailable");
  return env.DB;
}
function decode(row: TaskRow): StudyTask { return { ...row, tags: JSON.parse(row.tags) as string[] }; }

export async function listTasks(planId: string, userId: string): Promise<StudyTask[]> {
  const rows = await database().prepare(`SELECT ${columns} FROM tasks
    WHERE plan_id = ? AND deleted_at IS NULL AND EXISTS (SELECT 1 FROM plans p WHERE p.id = tasks.plan_id AND p.owner_id = ?)
    ORDER BY created_at DESC, id DESC`).bind(planId, userId).all<TaskRow>();
  return rows.results.map(decode);
}
export async function getTask(id: string, userId: string): Promise<StudyTask | null> {
  const row = await database().prepare(`SELECT ${columns} FROM tasks WHERE id = ? AND deleted_at IS NULL
    AND EXISTS (SELECT 1 FROM plans p WHERE p.id = tasks.plan_id AND p.owner_id = ?)`).bind(id, userId).first<TaskRow>();
  return row ? decode(row) : null;
}
export async function createTask(id: string, planId: string, input: TaskInput, userId: string): Promise<StudyTask | null> {
  const now = new Date().toISOString();
  const result = await database().prepare(`INSERT OR IGNORE INTO tasks
    (id, plan_id, title, due_date, priority, tags, expected_minutes, created_at, updated_at)
    SELECT ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM plans WHERE id = ? AND owner_id = ?)`)
    .bind(id, planId, input.title, input.dueDate, input.priority, JSON.stringify(input.tags), input.expectedMinutes, now, now, planId, userId).run();
  return result.meta.changes === 1 ? getTask(id, userId) : null;
}
export async function updateTask(id: string, expectedVersion: number, input: TaskInput, userId: string): Promise<StudyTask | null> {
  const now = new Date().toISOString();
  const result = await database().prepare(`UPDATE tasks SET title = ?, due_date = ?, priority = ?, tags = ?,
    expected_minutes = ?, updated_at = ?, version = version + 1
    WHERE id = ? AND version = ? AND deleted_at IS NULL AND EXISTS (SELECT 1 FROM plans p WHERE p.id = tasks.plan_id AND p.owner_id = ?)`)
    .bind(input.title, input.dueDate, input.priority, JSON.stringify(input.tags), input.expectedMinutes, now, id, expectedVersion, userId).run();
  return result.meta.changes === 1 ? getTask(id, userId) : null;
}
export async function setTaskCompleted(id: string, complete: boolean, userId: string): Promise<StudyTask | null> {
  const now = new Date().toISOString();
  await database().prepare(`UPDATE tasks SET completed_at = ?, updated_at = ?, version = version + 1
    WHERE id = ? AND deleted_at IS NULL AND completed_at IS ${complete ? "NULL" : "NOT NULL"}
    AND EXISTS (SELECT 1 FROM plans p WHERE p.id = tasks.plan_id AND p.owner_id = ?)`)
    .bind(complete ? now : null, now, id, userId).run();
  return getTask(id, userId);
}
export async function deleteTask(id: string, expectedVersion: number, userId: string): Promise<boolean> {
  const now = new Date().toISOString();
  const result = await database().prepare(`UPDATE tasks SET deleted_at = ?, updated_at = ?, version = version + 1
    WHERE id = ? AND version = ? AND deleted_at IS NULL AND EXISTS (SELECT 1 FROM plans p WHERE p.id = tasks.plan_id AND p.owner_id = ?)`).bind(now, now, id, expectedVersion, userId).run();
  return result.meta.changes === 1;
}
