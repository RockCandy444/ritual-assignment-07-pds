import { env } from "cloudflare:workers";

export class AccessDenied extends Error {}
function database() { if (!env.DB) throw new Error("Database unavailable"); return env.DB; }

export async function requirePlanOwner(planId: string, userId: string) {
  const row = await database().prepare("SELECT id FROM plans WHERE id = ? AND owner_id = ?").bind(planId, userId).first();
  if (!row) throw new AccessDenied();
}
export async function requirePlanOwnerIfExists(planId: string, userId: string) {
  const row = await database().prepare("SELECT owner_id FROM plans WHERE id = ?").bind(planId).first<{ owner_id: string | null }>();
  if (row && row.owner_id !== userId) throw new AccessDenied();
}
export async function requireTaskOwner(taskId: string, userId: string) {
  const row = await database().prepare(`SELECT t.id FROM tasks t JOIN plans p ON p.id = t.plan_id
    WHERE t.id = ? AND p.owner_id = ?`).bind(taskId, userId).first();
  if (!row) throw new AccessDenied();
}
export async function requireLogOwner(logId: string, userId: string) {
  const row = await database().prepare(`SELECT l.id FROM study_logs l JOIN tasks t ON t.id = l.task_id
    JOIN plans p ON p.id = t.plan_id WHERE l.id = ? AND p.owner_id = ?`).bind(logId, userId).first();
  if (!row) throw new AccessDenied();
}
export async function eraseDiary(userId: string, deleteAccount = false) {
  const db = database();
  const mine = "SELECT id FROM plans WHERE owner_id = ?";
  const statements = [
    db.prepare(`DELETE FROM study_logs WHERE task_id IN (SELECT id FROM tasks WHERE plan_id IN (${mine}))`).bind(userId),
    db.prepare(`DELETE FROM plan_reviews WHERE plan_id IN (${mine}) OR next_plan_id IN (${mine})`).bind(userId, userId),
    db.prepare(`DELETE FROM tasks WHERE plan_id IN (${mine})`).bind(userId),
    db.prepare(`DELETE FROM plan_versions WHERE plan_id IN (${mine})`).bind(userId),
    db.prepare("DELETE FROM plans WHERE owner_id = ?").bind(userId),
  ];
  // Delete account, sessions and credentials in the same D1 transaction as diary rows.
  if (deleteAccount) statements.push(db.prepare("DELETE FROM auth_user WHERE id = ?").bind(userId));
  await db.batch(statements);
}
