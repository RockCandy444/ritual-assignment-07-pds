export type PlanInput = {
  title: string; startDate: string; endDate: string;
  priority: "high" | "normal" | "low"; successCriteria: string; expectedMinutes: number;
};
export type PlanVersion = PlanInput & { id: string; version: number; savedAt: string };
export const priorities = { high: "높음", normal: "보통", low: "낮음" };
function validDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number(value.slice(0, 4)) >= 2000 && Number(value.slice(0, 4)) <= 2100 &&
    !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
export function validatePlan(value: unknown): PlanInput {
  if (!value || typeof value !== "object") throw new Error("계획 내용을 입력해 주세요.");
  const p = value as Record<string, unknown>;
  if (typeof p.title !== "string" || !p.title.trim() || p.title.trim().length > 120)
    throw new Error("계획 이름은 1~120자로 입력해 주세요.");
  if (!validDate(p.startDate) || !validDate(p.endDate) || p.endDate < p.startDate)
    throw new Error("올바른 시작일과 종료일을 입력해 주세요. 종료일은 시작일 이후여야 합니다.");
  if (p.priority !== "high" && p.priority !== "normal" && p.priority !== "low")
    throw new Error("우선순위를 선택해 주세요.");
  if (typeof p.successCriteria !== "string" || !p.successCriteria.trim() || p.successCriteria.trim().length > 2000)
    throw new Error("성공 기준은 1~2,000자로 입력해 주세요.");
  if (typeof p.expectedMinutes !== "number" || !Number.isSafeInteger(p.expectedMinutes) || p.expectedMinutes < 1 || p.expectedMinutes > 100000)
    throw new Error("예상 시간은 1~100,000 사이의 정수(분)로 입력해 주세요.");
  return { title: p.title.trim(), startDate: p.startDate, endDate: p.endDate, priority: p.priority,
    successCriteria: p.successCriteria.trim(), expectedMinutes: p.expectedMinutes };
}
