import { env } from "cloudflare:workers";
import { validatePlan } from "@/lib/plan";
import { taskIdPattern, validateTask } from "@/lib/task";
import { validateStudyLog } from "@/lib/study-log";
import { validateReview } from "@/lib/review";

type Row = Record<string, unknown>;
const tableNames = ["plans", "plan_versions", "tasks", "study_logs", "plan_reviews"] as const;
export class ImportRejected extends Error {}
function id(value: unknown): string {
  if (typeof value !== "string" || !taskIdPattern.test(value)) throw new ImportRejected("파일의 자료 ID를 확인해 주세요.");
  return value;
}
function timestamp(value: unknown, nullable = false): string | null {
  if (nullable && value === null) return null;
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) throw new ImportRejected("파일의 저장 시각을 확인해 주세요.");
  return value;
}
function version(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) throw new ImportRejected("파일의 수정 번호를 확인해 주세요.");
  return value as number;
}
export async function importDiary(payload: unknown, userId: string) {
  if (!env.DB) throw new Error("Database unavailable");
  const data = payload as { format?: unknown; timezone?: unknown; timeUnit?: unknown; tables?: Record<string, unknown> } | null;
  if (!data || data.format !== "pds-study-diary" || data.timezone !== "Asia/Seoul" || data.timeUnit !== "minutes" || !data.tables) throw new ImportRejected("T06에서 내보낸 JSON 파일을 선택해 주세요.");
  const tables = {} as Record<typeof tableNames[number], Row[]>;
  let rowCount = 0;
  for (const name of tableNames) {
    const rows = data.tables[name];
    if (!Array.isArray(rows) || rows.some(row => !row || typeof row !== "object" || Array.isArray(row))) throw new ImportRejected("파일의 자료 구조를 확인해 주세요.");
    tables[name] = rows as Row[];
    rowCount += rows.length;
  }
  if (!tables.plans.length || rowCount > 200) throw new ImportRejected("계획이 포함된 200건 이하의 백업 파일을 선택해 주세요.");
  const planIds = new Set(tables.plans.map(row => id(row.id)));
  const taskIds = new Set(tables.tasks.map(row => id(row.id)));
  if (planIds.size !== tables.plans.length || taskIds.size !== tables.tasks.length) throw new ImportRejected("중복된 ID가 있는 파일입니다.");
  const statements: D1PreparedStatement[] = [];
  const db = env.DB;
  for (const row of tables.plans) {
    statements.push(db.prepare("INSERT INTO plans (id, created_at, owner_id) VALUES (?, ?, ?)").bind(id(row.id), timestamp(row.created_at), userId));
  }
  const versionPlanIds = new Set<string>();
  for (const row of tables.plan_versions) {
    const planId = id(row.plan_id); if (!planIds.has(planId)) throw new ImportRejected("계획 이력의 연결이 잘못되었습니다.");
    versionPlanIds.add(planId);
    const input = validatePlan({ title: row.title, startDate: row.start_date, endDate: row.end_date, priority: row.priority, successCriteria: row.success_criteria, expectedMinutes: row.expected_minutes });
    statements.push(db.prepare(`INSERT INTO plan_versions
      (plan_id, version, title, start_date, end_date, priority, success_criteria, expected_minutes, saved_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(planId, version(row.version), input.title, input.startDate, input.endDate, input.priority, input.successCriteria, input.expectedMinutes, timestamp(row.saved_at)));
  }
  if (versionPlanIds.size !== planIds.size) throw new ImportRejected("이력이 빠진 계획이 있습니다.");
  for (const row of tables.tasks) {
    const planId = id(row.plan_id); if (!planIds.has(planId)) throw new ImportRejected("할 일의 계획 연결이 잘못되었습니다.");
    const tags = typeof row.tags === "string" ? JSON.parse(row.tags) : null;
    const input = validateTask({ title: row.title, dueDate: row.due_date, priority: row.priority, tags, expectedMinutes: row.expected_minutes });
    statements.push(db.prepare(`INSERT INTO tasks
      (id, plan_id, title, due_date, priority, tags, expected_minutes, completed_at, deleted_at, created_at, updated_at, version)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(id(row.id), planId, input.title, input.dueDate, input.priority, JSON.stringify(input.tags), input.expectedMinutes, timestamp(row.completed_at, true), timestamp(row.deleted_at, true), timestamp(row.created_at), timestamp(row.updated_at), version(row.version)));
  }
  for (const row of tables.study_logs) {
    const taskId = id(row.task_id); if (!taskIds.has(taskId)) throw new ImportRejected("공부 기록의 할 일 연결이 잘못되었습니다.");
    const input = validateStudyLog({ taskId, startedAt: row.started_at, endedAt: row.ended_at, actualMinutes: row.actual_minutes, studiedContent: row.studied_content, blockerReason: row.blocker_reason });
    statements.push(db.prepare(`INSERT INTO study_logs
      (id, task_id, started_at, ended_at, actual_minutes, studied_content, blocker_reason, created_at, updated_at, deleted_at, version)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(id(row.id), taskId, input.startedAt, input.endedAt, input.actualMinutes, input.studiedContent, input.blockerReason, timestamp(row.created_at), timestamp(row.updated_at), timestamp(row.deleted_at, true), version(row.version)));
  }
  for (const row of tables.plan_reviews) {
    const planId = id(row.plan_id), nextPlanId = id(row.next_plan_id);
    if (!planIds.has(planId) || !planIds.has(nextPlanId)) throw new ImportRejected("돌아보기의 계획 연결이 잘못되었습니다.");
    const input = validateReview({ nextPlanId, improvement: row.improvement }, planId);
    statements.push(db.prepare(`INSERT INTO plan_reviews (plan_id, next_plan_id, improvement, created_at, updated_at, version)
      VALUES (?, ?, ?, ?, ?, ?)`).bind(planId, input.nextPlanId, input.improvement, timestamp(row.created_at), timestamp(row.updated_at), version(row.version)));
  }
  const existing = await db.prepare("SELECT COUNT(*) AS count FROM plans WHERE owner_id = ?").bind(userId).first<{ count: number }>();
  if (existing?.count) throw new ImportRejected("저장한 계획이 없는 계정에서만 가져올 수 있어요. 기존 자료는 변경하지 않았습니다.");
  // Strict INSERTs and D1's atomic batch prevent overwrites, partial imports and cross-account ID collisions.
  try { await db.batch(statements); }
  catch { throw new ImportRejected("이미 저장된 ID가 있거나 파일을 가져올 수 없어요. 기존 자료는 변경하지 않았습니다."); }
  return { imported: true, rowCounts: Object.fromEntries(tableNames.map(name => [name, tables[name].length])) };
}
