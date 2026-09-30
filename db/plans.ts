import { env } from "cloudflare:workers";
import type { PlanInput, PlanVersion } from "@/lib/plan";
const columns = `plan_id AS id, version, title, start_date AS startDate, end_date AS endDate,
  priority, success_criteria AS successCriteria, expected_minutes AS expectedMinutes, saved_at AS savedAt`;
function database() {
  if (!env.DB) throw new Error("Database unavailable");
  return env.DB;
}
export async function listPlans() {
  const result = await database().prepare(`SELECT ${columns} FROM plan_versions v
    WHERE version = (SELECT MAX(version) FROM plan_versions WHERE plan_id = v.plan_id)
    ORDER BY saved_at DESC, plan_id ASC`).all<PlanVersion>();
  return result.results;
}
export async function history(id: string) {
  const result = await database().prepare(`SELECT ${columns} FROM plan_versions
    WHERE plan_id = ? ORDER BY version DESC`).bind(id).all<PlanVersion>();
  return result.results;
}
export async function savePlan(id: string, expectedVersion: number, input: PlanInput) {
  const db = database(); const timestamp = new Date().toISOString();
  const statements = [];
  if (expectedVersion === 0) statements.push(db.prepare("INSERT OR IGNORE INTO plans (id, created_at) VALUES (?, ?)").bind(id, timestamp));
  statements.push(db.prepare(`INSERT INTO plan_versions
    (plan_id, version, title, start_date, end_date, priority, success_criteria, expected_minutes, saved_at)
    SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?
    WHERE EXISTS (SELECT 1 FROM plans WHERE id = ?)
    AND COALESCE((SELECT MAX(version) FROM plan_versions WHERE plan_id = ?), 0) = ?`)
    .bind(id, expectedVersion + 1, input.title, input.startDate, input.endDate, input.priority,
      input.successCriteria, input.expectedMinutes, timestamp, id, id, expectedVersion));
  const result = await db.batch(statements);
  if (result[result.length - 1].meta.changes !== 1) return null;
  return { ...input, id, version: expectedVersion + 1, savedAt: timestamp } satisfies PlanVersion;
}
