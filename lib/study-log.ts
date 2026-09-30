import { taskIdPattern } from "@/lib/task";

export type StudyLogInput = {
  taskId: string;
  startedAt: string;
  endedAt: string;
  actualMinutes: number;
  studiedContent: string;
  blockerReason: string | null;
};
export type StudyLog = StudyLogInput & {
  id: string;
  createdAt: string;
  updatedAt: string;
  version: number;
};

function canonicalTime(value: unknown): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value))
    throw new Error("시작·종료 시각을 입력해 주세요.");
  const date = new Date(value);
  if (Number.isNaN(date.getTime()) || date.toISOString() !== value) throw new Error("시작·종료 시각을 확인해 주세요.");
  return value;
}

export function validateStudyLog(value: unknown): StudyLogInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("공부 기록을 입력해 주세요.");
  const log = value as Record<string, unknown>;
  if (typeof log.taskId !== "string" || !taskIdPattern.test(log.taskId)) throw new Error("연결할 할 일을 선택해 주세요.");
  const startedAt = canonicalTime(log.startedAt);
  const endedAt = canonicalTime(log.endedAt);
  if (endedAt <= startedAt) throw new Error("종료 시각은 시작 시각보다 늦어야 해요.");
  if (new Date(endedAt).getTime() > Date.now() + 60_000) throw new Error("미래의 공부 시간은 기록할 수 없어요.");
  if (typeof log.actualMinutes !== "number" || !Number.isSafeInteger(log.actualMinutes) || log.actualMinutes < 1 || log.actualMinutes > 100000)
    throw new Error("실제 공부 시간은 1~100,000분의 정수로 입력해 주세요.");
  if (log.actualMinutes > (Date.parse(endedAt) - Date.parse(startedAt)) / 60_000)
    throw new Error("실제 공부 시간은 시작부터 종료까지의 시간보다 길 수 없어요.");
  if (typeof log.studiedContent !== "string" || !log.studiedContent.trim() || log.studiedContent.trim().length > 2000)
    throw new Error("공부한 내용은 1~2,000자로 입력해 주세요.");
  const reason = log.blockerReason === "" || log.blockerReason == null ? null : log.blockerReason;
  if (reason !== null && (typeof reason !== "string" || !reason.trim() || reason.trim().length > 1000))
    throw new Error("막힌 이유는 1~1,000자로 입력해 주세요.");
  return { taskId: log.taskId, startedAt, endedAt, actualMinutes: log.actualMinutes,
    studiedContent: log.studiedContent.trim(), blockerReason: reason === null ? null : (reason as string).trim() };
}
