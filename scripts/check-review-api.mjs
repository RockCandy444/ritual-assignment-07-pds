import assert from "node:assert/strict";

const origin = process.env.PDS_TEST_ORIGIN;
if (!origin || new URL(origin).hostname !== "127.0.0.1") throw new Error("Provide an isolated local test server.");
const request = async (path, method = "GET", body, headers = {}) => {
  const response = await fetch(origin + path, { method,
    headers: body ? { "Content-Type": "application/json", ...headers } : headers,
    body: body ? JSON.stringify(body) : undefined });
  return { status: response.status, data: await response.json() };
};
const sourceId = crypto.randomUUID();
const targetId = crypto.randomUUID();
const taskA = crypto.randomUUID();
const taskB = crypto.randomUUID();
const basePlan = { priority: "normal", successCriteria: "검증", expectedMinutes: 60 };
assert.equal((await request("/api/plans", "POST", { id: sourceId, expectedVersion: 0,
  plan: { ...basePlan, title: "[검증용] 첫 계획", startDate: "2026-09-01", endDate: "2026-09-08" } })).status, 201);
assert.equal((await request("/api/plans", "POST", { id: targetId, expectedVersion: 0,
  plan: { ...basePlan, title: "[검증용] 다음 계획", startDate: "2026-09-08", endDate: "2026-09-15" } })).status, 201);
const task = { dueDate: "2026-09-10", priority: "normal", tags: [], expectedMinutes: 30 };
assert.equal((await request("/api/tasks", "POST", { id: taskA, planId: sourceId, task: { ...task, title: "완료한 할 일" } })).status, 201);
assert.equal((await request("/api/tasks", "POST", { id: taskB, planId: sourceId, task: { ...task, title: "지연·막힘 할 일" } })).status, 201);
assert.equal((await request("/api/tasks", "PATCH", { action: "complete", id: taskA })).status, 200);
const endedAt = new Date(Date.now() - 10 * 60_000).toISOString();
const startedAt = new Date(Date.now() - 30 * 60_000).toISOString();
assert.equal((await request("/api/study-logs", "POST", { id: crypto.randomUUID(), planId: sourceId,
  log: { taskId: taskB, startedAt, endedAt, actualMinutes: 15,
    studiedContent: "검증용", blockerReason: "검증용 막힘" } })).status, 201);
let result = await request(`/api/reviews?planId=${sourceId}`);
assert.equal(result.status, 200);
assert.deepEqual(result.data.summary, { planned: 2, completed: 1, overdue: 1, blocked: 1,
  expectedMinutes: 60, actualMinutes: 15, differenceMinutes: -45 });
assert.equal(result.data.tasks.length, 2); assert.equal(result.data.logs.length, 1);
const review = { nextPlanId: targetId, improvement: "막힌 표현을 다음날 다시 확인한다" };
result = await request("/api/reviews", "POST", { planId: sourceId, expectedVersion: 0, review });
assert.equal(result.status, 201); assert.equal(result.data.review.version, 1);
result = await request("/api/reviews", "POST", { planId: sourceId, expectedVersion: 0, review });
assert.equal(result.status, 409);
result = await request(`/api/reviews?planId=${targetId}`);
assert.equal(result.status, 200); assert.equal(result.data.incoming.length, 1);
assert.equal(result.data.incoming[0].improvement, review.improvement);
const changed = { ...review, improvement: "하루 뒤 복습한다" };
const concurrent = await Promise.all([request("/api/reviews", "POST", { planId: sourceId, expectedVersion: 1, review: changed }),
  request("/api/reviews", "POST", { planId: sourceId, expectedVersion: 1, review: changed })]);
assert.deepEqual(concurrent.map(item => item.status).sort(), [200, 409]);
result = await request("/api/reviews", "POST", { planId: sourceId, expectedVersion: 2,
  review: { nextPlanId: sourceId, improvement: "잘못된 대상" } });
assert.equal(result.status, 400);
result = await request("/api/reviews", "POST", { planId: sourceId, expectedVersion: 2, review: changed },
  { Origin: "https://example.invalid" });
assert.equal(result.status, 400);
console.log("Review API passed: summary, evidence, carry to next plan, duplicate guard, concurrent edit conflict and validation.");
