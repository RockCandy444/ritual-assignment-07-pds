import { env } from "cloudflare:workers";
import type { IncomingImprovement, PlanReview, ReviewInput } from "@/lib/review";

const columns = `plan_id AS planId, next_plan_id AS nextPlanId, improvement,
  created_at AS createdAt, updated_at AS updatedAt, version`;
function database() { if (!env.DB) throw new Error("Database unavailable"); return env.DB; }

export async function getReview(planId: string): Promise<PlanReview | null> {
  return database().prepare(`SELECT ${columns} FROM plan_reviews WHERE plan_id = ?`).bind(planId).first<PlanReview>();
}

export async function incomingImprovements(planId: string): Promise<IncomingImprovement[]> {
  const result = await database().prepare(`SELECT r.plan_id AS planId, r.next_plan_id AS nextPlanId,
    r.improvement, r.created_at AS createdAt, r.updated_at AS updatedAt, r.version,
    (SELECT title FROM plan_versions WHERE plan_id = r.plan_id ORDER BY version DESC LIMIT 1) AS sourceTitle
    FROM plan_reviews r WHERE r.next_plan_id = ? ORDER BY r.updated_at DESC, r.plan_id`).bind(planId).all<IncomingImprovement>();
  return result.results;
}

export async function saveReview(planId: string, expectedVersion: number, input: ReviewInput): Promise<PlanReview | null> {
  const db = database();
  const now = new Date().toISOString();
  const sourceExists = `EXISTS (SELECT 1 FROM plan_versions s WHERE s.plan_id = ?
    AND s.version = (SELECT MAX(version) FROM plan_versions WHERE plan_id = ?))`;
  const targetFollows = `EXISTS (SELECT 1 FROM plan_versions n
    WHERE n.plan_id = ? AND n.version = (SELECT MAX(version) FROM plan_versions WHERE plan_id = ?)
    AND n.start_date >= (SELECT end_date FROM plan_versions WHERE plan_id = ? ORDER BY version DESC LIMIT 1))`;
  const result = expectedVersion === 0
    ? await db.prepare(`INSERT OR IGNORE INTO plan_reviews
      (plan_id, next_plan_id, improvement, created_at, updated_at)
      SELECT ?, ?, ?, ?, ? WHERE ${sourceExists} AND ${targetFollows}`)
      .bind(planId, input.nextPlanId, input.improvement, now, now,
        planId, planId, input.nextPlanId, input.nextPlanId, planId).run()
    : await db.prepare(`UPDATE plan_reviews SET next_plan_id = ?, improvement = ?,
      updated_at = ?, version = version + 1 WHERE plan_id = ? AND version = ? AND ${targetFollows}`)
      .bind(input.nextPlanId, input.improvement, now, planId, expectedVersion,
        input.nextPlanId, input.nextPlanId, planId).run();
  return result.meta.changes === 1 ? getReview(planId) : null;
}
