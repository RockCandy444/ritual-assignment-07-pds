import type { StudyLog } from "@/lib/study-log";
import type { StudyTask } from "@/lib/task";

export type ReviewInput = { nextPlanId: string; improvement: string };
export type PlanReview = ReviewInput & {
  planId: string; createdAt: string; updatedAt: string; version: number;
};
export type IncomingImprovement = PlanReview & { sourceTitle: string };
export type ReviewSummary = {
  planned: number; completed: number; overdue: number; blocked: number;
  expectedMinutes: number; actualMinutes: number; differenceMinutes: number;
};

export function validateReview(value: unknown, sourcePlanId: string): ReviewInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("개선점을 입력해 주세요.");
  const review = value as Record<string, unknown>;
  if (typeof review.nextPlanId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(review.nextPlanId) || review.nextPlanId === sourcePlanId)
    throw new Error("다음 계획을 선택해 주세요.");
  if (typeof review.improvement !== "string" || !review.improvement.trim() || review.improvement.trim().length > 1000)
    throw new Error("개선점 한 가지를 1~1,000자로 입력해 주세요.");
  return { nextPlanId: review.nextPlanId, improvement: review.improvement.trim() };
}

export function summarizeReview(tasks: StudyTask[], logs: StudyLog[], todayInSeoul: string): ReviewSummary {
  const taskIds = new Set(tasks.map(task => task.id));
  const activeLogs = logs.filter(log => taskIds.has(log.taskId));
  const blockedIds = new Set(activeLogs.filter(log => !!log.blockerReason?.trim()).map(log => log.taskId));
  const expectedMinutes = tasks.reduce((sum, task) => sum + task.expectedMinutes, 0);
  const actualMinutes = activeLogs.reduce((sum, log) => sum + log.actualMinutes, 0);
  return {
    planned: tasks.length,
    completed: tasks.filter(task => !!task.completedAt).length,
    overdue: tasks.filter(task => !task.completedAt && !!task.dueDate && task.dueDate < todayInSeoul).length,
    blocked: blockedIds.size,
    expectedMinutes, actualMinutes, differenceMinutes: actualMinutes - expectedMinutes,
  };
}
