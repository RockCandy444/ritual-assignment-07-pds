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

export async function listTasks(planId: string): Promise<StudyTask[]> {
  const rows = await database().prepare(`SELECT ${columns} FROM tasks
    WHERE plan_id = ? AND deleted_at IS NULL ORDER BY created_at DESC, id DESC`).bind(planId).all<TaskRow>();
  return rows.results.map(decode);
}
export async function getTask(id: string): Promise<StudyTask | null> {
  const row = await database().prepare(`SELECT ${columns} FROM tasks WHERE id = ? AND deleted_at IS NULL`).bind(id).first<TaskRow>();
  return row ? decode(row) : null;
}
export async function createTask(id: string, planId: string, input: TaskInput): Promise<StudyTask | null> {
  const now = new Date().toISOString();
  const result = await database().prepare(`INSERT OR IGNORE INTO tasks
    (id, plan_id, title, due_date, priority, tags, expected_minutes, created_at, updated_at)
    SELECT ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM plans WHERE id = ?)`)
    .bind(id, planId, input.title, input.dueDate, input.priority, JSON.stringify(input.tags), input.expectedMinutes, now, now, planId).run();
  return result.meta.changes === 1 ? getTask(id) : null;
}
export async function updateTask(id: string, expectedVersion: number, input: TaskInput): Promise<StudyTask | null> {
  const now = new Date().toISOString();
  const result = await database().prepare(`UPDATE tasks SET title = ?, due_date = ?, priority = ?, tags = ?,
    expected_minutes = ?, updated_at = ?, version = version + 1
    WHERE id = ? AND version = ? AND deleted_at IS NULL`)
    .bind(input.title, input.dueDate, input.priority, JSON.stringify(input.tags), input.expectedMinutes, now, id, expectedVersion).run();
  return result.meta.changes === 1 ? getTask(id) : null;
}
export async function setTaskCompleted(id: string, complete: boolean): Promise<StudyTask | null> {
  const now = new Date().toISOString();
  await database().prepare(`UPDATE tasks SET completed_at = ?, updated_at = ?, version = version + 1
    WHERE id = ? AND deleted_at IS NULL AND completed_at IS ${complete ? "NULL" : "NOT NULL"}`)
    .bind(complete ? now : null, now, id).run();
  return getTask(id);
}
export async function deleteTask(id: string, expectedVersion: number): Promise<boolean> {
  const now = new Date().toISOString();
  const result = await database().prepare(`UPDATE tasks SET deleted_at = ?, updated_at = ?, version = version + 1
    WHERE id = ? AND version = ? AND deleted_at IS NULL`).bind(now, now, id, expectedVersion).run();
  return result.meta.changes === 1;
}
