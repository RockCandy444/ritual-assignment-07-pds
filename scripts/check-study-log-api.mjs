import assert from "node:assert/strict";

const origin = process.env.PDS_TEST_ORIGIN;
if (!origin || new URL(origin).hostname !== "127.0.0.1") throw new Error("Provide an isolated local test server.");
const request = async (path, method = "GET", body) => {
  const response = await fetch(origin + path, { method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined });
  return { status: response.status, data: await response.json() };
};
const planId = crypto.randomUUID();
const taskId = crypto.randomUUID();
const logId = crypto.randomUUID();
const plan = { title: "[검증용] 카드 3 계획", startDate: "2026-09-29", endDate: "2026-10-06",
  priority: "normal", successCriteria: "실행 기록 검증", expectedMinutes: 30 };
let result = await request("/api/plans", "POST", { id: planId, expectedVersion: 0, plan });
assert.equal(result.status, 201);
const task = { title: "[검증용] 공부 할 일", dueDate: null, priority: "normal", tags: [], expectedMinutes: 30 };
result = await request("/api/tasks", "POST", { id: taskId, planId, task });
assert.equal(result.status, 201);
const end = new Date(Date.now() - 10 * 60_000).toISOString();
const start = new Date(Date.now() - 40 * 60_000).toISOString();
const log = { taskId, startedAt: start, endedAt: end, actualMinutes: 25,
  studiedContent: "검증용 공부 내용", blockerReason: "검증용 막힘" };
result = await request("/api/study-logs", "POST", { id: logId, planId, log });
assert.equal(result.status, 201); assert.equal(result.data.log.version, 1);
result = await request("/api/study-logs", "POST", { id: logId, planId, log });
assert.equal(result.status, 409);
result = await request(`/api/study-logs?planId=${planId}`);
assert.equal(result.status, 200); assert.equal(result.data.logs.length, 1);
result = await request("/api/study-logs", "PATCH", { id: logId, planId, expectedVersion: 1,
  log: { ...log, actualMinutes: 20, studiedContent: "수정한 공부 내용" } });
assert.equal(result.status, 200); assert.equal(result.data.log.version, 2);
result = await request("/api/study-logs", "PATCH", { id: logId, planId, expectedVersion: 1, log });
assert.equal(result.status, 409);
result = await request("/api/study-logs", "POST", { id: crypto.randomUUID(), planId,
  log: { ...log, endedAt: start } });
assert.equal(result.status, 400);
const complete = await request("/api/tasks", "PATCH", { action: "complete", id: taskId });
const completeAgain = await request("/api/tasks", "PATCH", { action: "complete", id: taskId });
assert.equal(complete.status, 200); assert.equal(completeAgain.status, 200);
assert.equal(complete.data.task.version, completeAgain.data.task.version);
assert.equal(complete.data.task.completedAt, completeAgain.data.task.completedAt);
result = await request("/api/study-logs", "DELETE", { id: logId, planId, expectedVersion: 2 });
assert.equal(result.status, 200);
result = await request(`/api/study-logs?planId=${planId}`);
assert.equal(result.status, 200); assert.equal(result.data.logs.length, 0);
console.log("Study log API passed: create, duplicate guard, read, edit, stale edit, invalid time, idempotent completion, delete.");
