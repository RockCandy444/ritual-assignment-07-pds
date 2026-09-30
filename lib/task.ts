import { priorities } from "@/lib/plan";

export type TaskInput = {
  title: string;
  dueDate: string | null;
  priority: keyof typeof priorities;
  tags: string[];
  expectedMinutes: number;
};
export type StudyTask = TaskInput & {
  id: string;
  planId: string;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  version: number;
};

export const taskIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function validDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number(value.slice(0, 4)) >= 2000 && Number(value.slice(0, 4)) <= 2100 &&
    !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}

export function validateTask(value: unknown): TaskInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("할 일 내용을 입력해 주세요.");
  const task = value as Record<string, unknown>;
  if (typeof task.title !== "string" || !task.title.trim() || task.title.trim().length > 120)
    throw new Error("할 일 이름은 1~120자로 입력해 주세요.");
  const dueDate = task.dueDate === "" || task.dueDate === null || task.dueDate === undefined ? null : task.dueDate;
  if (dueDate !== null && !validDate(dueDate)) throw new Error("마감일을 확인해 주세요.");
  if (task.priority !== "high" && task.priority !== "normal" && task.priority !== "low")
    throw new Error("우선순위를 선택해 주세요.");
  if (!Array.isArray(task.tags) || task.tags.length > 8 || task.tags.some(tag => typeof tag !== "string" || !tag.trim() || tag.trim().length > 24))
    throw new Error("태그는 최대 8개, 각각 1~24자로 입력해 주세요.");
  const tags = [...new Set((task.tags as string[]).map(tag => tag.trim()))];
  if (typeof task.expectedMinutes !== "number" || !Number.isSafeInteger(task.expectedMinutes) || task.expectedMinutes < 1 || task.expectedMinutes > 100000)
    throw new Error("예상 시간은 1~100,000 사이의 정수(분)로 입력해 주세요.");
  return { title: task.title.trim(), dueDate, priority: task.priority, tags, expectedMinutes: task.expectedMinutes };
}
