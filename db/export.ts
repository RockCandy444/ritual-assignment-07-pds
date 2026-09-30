import { env } from "cloudflare:workers";
import schemaContract from "@/contracts/pds-schema-v2.json";

// One D1 batch keeps the five tables in the same read transaction.
// Include soft-deleted rows so logs retain their task and plan relationships.
export async function exportDiary(userId: string) {
  if (!env.DB) throw new Error("Database unavailable");
  const results = await env.DB.batch([
    env.DB.prepare("SELECT id, created_at FROM plans WHERE owner_id = ? ORDER BY id").bind(userId),
    env.DB.prepare(`SELECT plan_id, version, title, start_date, end_date, priority,
      success_criteria, expected_minutes, saved_at FROM plan_versions WHERE plan_id IN (SELECT id FROM plans WHERE owner_id = ?) ORDER BY plan_id, version`).bind(userId),
    env.DB.prepare(`SELECT id, plan_id, title, due_date, priority, tags, expected_minutes,
      completed_at, deleted_at, created_at, updated_at, version FROM tasks WHERE plan_id IN (SELECT id FROM plans WHERE owner_id = ?) ORDER BY id`).bind(userId),
    env.DB.prepare(`SELECT id, task_id, started_at, ended_at, actual_minutes, studied_content,
      blocker_reason, created_at, updated_at, deleted_at, version FROM study_logs
      WHERE task_id IN (SELECT id FROM tasks WHERE plan_id IN (SELECT id FROM plans WHERE owner_id = ?)) ORDER BY id`).bind(userId),
    env.DB.prepare(`SELECT plan_id, next_plan_id, improvement, created_at, updated_at,
      version FROM plan_reviews WHERE plan_id IN (SELECT id FROM plans WHERE owner_id = ?)
      AND next_plan_id IN (SELECT id FROM plans WHERE owner_id = ?) ORDER BY plan_id`).bind(userId, userId),
  ]);
  if (results.some(result => !result.success)) throw new Error("Export read failed");
  return {
    format: "pds-study-diary",
    exportVersion: 1,
    schemaVersion: schemaContract.schemaVersion,
    exportedAt: new Date().toISOString(),
    timezone: "Asia/Seoul",
    timeUnit: "minutes",
    includesDeleted: true,
    schemaContract,
    tables: {
      plans: results[0].results,
      plan_versions: results[1].results,
      tasks: results[2].results,
      study_logs: results[3].results,
      plan_reviews: results[4].results,
    },
  };
}
