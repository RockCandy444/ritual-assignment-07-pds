import { env } from "cloudflare:workers";
import type { StudyLog, StudyLogInput } from "@/lib/study-log";

const columns = `l.id, l.task_id AS taskId, l.started_at AS startedAt, l.ended_at AS endedAt,
  l.actual_minutes AS actualMinutes, l.studied_content AS studiedContent,
  l.blocker_reason AS blockerReason, l.created_at AS createdAt, l.updated_at AS updatedAt, l.version`;
function database() { if (!env.DB) throw new Error("Database unavailable"); return env.DB; }

export async function listStudyLogs(planId: string): Promise<StudyLog[]> {
  const result = await database().prepare(`SELECT ${columns} FROM study_logs l JOIN tasks t ON t.id = l.task_id
    WHERE t.plan_id = ? AND t.deleted_at IS NULL AND l.deleted_at IS NULL
    ORDER BY l.started_at DESC, l.id DESC`).bind(planId).all<StudyLog>();
  return result.results;
}
export async function getStudyLog(id: string): Promise<StudyLog | null> {
  return database().prepare(`SELECT ${columns} FROM study_logs l JOIN tasks t ON t.id = l.task_id
    WHERE l.id = ? AND l.deleted_at IS NULL AND t.deleted_at IS NULL`).bind(id).first<StudyLog>();
}
export async function createStudyLog(id: string, planId: string, input: StudyLogInput): Promise<StudyLog | null> {
  const now = new Date().toISOString();
  const result = await database().prepare(`INSERT OR IGNORE INTO study_logs
    (id, task_id, started_at, ended_at, actual_minutes, studied_content, blocker_reason, created_at, updated_at)
    SELECT ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE EXISTS
      (SELECT 1 FROM tasks WHERE id = ? AND plan_id = ? AND deleted_at IS NULL)`)
    .bind(id, input.taskId, input.startedAt, input.endedAt, input.actualMinutes, input.studiedContent,
      input.blockerReason, now, now, input.taskId, planId).run();
  return result.meta.changes === 1 ? getStudyLog(id) : null;
}
export async function updateStudyLog(id: string, planId: string, version: number, input: StudyLogInput): Promise<StudyLog | null> {
  const now = new Date().toISOString();
  const result = await database().prepare(`UPDATE study_logs SET task_id = ?, started_at = ?, ended_at = ?, actual_minutes = ?,
    studied_content = ?, blocker_reason = ?, updated_at = ?, version = version + 1
    WHERE id = ? AND version = ? AND deleted_at IS NULL AND EXISTS
      (SELECT 1 FROM tasks WHERE id = ? AND plan_id = ? AND deleted_at IS NULL)
    AND EXISTS (SELECT 1 FROM tasks WHERE id = study_logs.task_id AND plan_id = ? AND deleted_at IS NULL)`)
    .bind(input.taskId, input.startedAt, input.endedAt, input.actualMinutes, input.studiedContent,
      input.blockerReason, now, id, version, input.taskId, planId, planId).run();
  return result.meta.changes === 1 ? getStudyLog(id) : null;
}
export async function deleteStudyLog(id: string, planId: string, version: number): Promise<boolean> {
  const now = new Date().toISOString();
  const result = await database().prepare(`UPDATE study_logs SET deleted_at = ?, updated_at = ?, version = version + 1
    WHERE id = ? AND version = ? AND deleted_at IS NULL AND EXISTS
      (SELECT 1 FROM tasks WHERE id = study_logs.task_id AND plan_id = ? AND deleted_at IS NULL)`)
    .bind(now, now, id, version, planId).run();
  return result.meta.changes === 1;
}
