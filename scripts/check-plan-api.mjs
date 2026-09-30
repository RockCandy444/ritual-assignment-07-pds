import assert from "node:assert/strict";
import { writeFileSync, mkdirSync } from "node:fs";
import { validatePlan } from "../lib/plan.ts";
const base = process.env.PDS_TEST_ORIGIN;
if (!base || new URL(base).hostname !== "127.0.0.1") throw new Error("This test only runs on an explicitly supplied local preview.");
const plan = { title: "[검증용] JLPT 계획", startDate: "2026-09-28", endDate: "2026-10-04", priority: "normal",
  successCriteria: "주 4회 공부", expectedMinutes: 120 };
assert.throws(() => validatePlan({ ...plan, startDate: "2026-02-30" }));
assert.throws(() => validatePlan({ ...plan, expectedMinutes: 0 }));
assert.throws(() => validatePlan({ ...plan, expectedMinutes: 1.5 }));
assert.throws(() => validatePlan({ ...plan, endDate: "2026-09-01" }));
assert.throws(() => validatePlan({ ...plan, priority: "__proto__" }));
const id = crypto.randomUUID();
mkdirSync(".sites-runtime", { recursive: true });
writeFileSync(".sites-runtime/test-record-id.txt", id);
const save = (data, expectedVersion) => fetch(base + "/api/plans", {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ id, expectedVersion, plan: data })
});
let response = await save(plan, 0); assert.equal(response.status, 201);
let stored = (await response.json()).plan;
assert.equal(stored.id, id); assert.equal(stored.version, 1);
const changed = { ...plan, expectedMinutes: 150, successCriteria: '<script>alert("test")</script> 글자 그대로 저장' };
const concurrent = await Promise.all([save(changed, 1), save(changed, 1)]);
assert.deepEqual(concurrent.map(r => r.status).sort(), [201, 409]);
response = await save(plan, 0); assert.equal(response.status, 409);
response = await save({ ...plan, endDate: "2026-02-30" }, 2); assert.equal(response.status, 400);
response = await fetch(base + "/api/plans", { method: "POST", headers: { "Content-Type": "application/json", Origin: "https://example.invalid" },
 body: JSON.stringify({ id, expectedVersion: 2, plan }) });
assert.equal(response.status, 403);
const history = (await (await fetch(base + "/api/plans?id=" + id)).json()).versions;
assert.equal(history.length, 2);
assert.equal(history[1].expectedMinutes, 120); assert.equal(history[1].successCriteria, "주 4회 공부");
assert.equal(history[0].expectedMinutes, 150); assert.equal(history[0].successCriteria, changed.successCriteria);
assert.equal(history[0].id, history[1].id);
for (let i = 0; i < 2; i++) {
  const list = (await (await fetch(base + "/api/plans", { cache: "no-store" })).json()).plans;
  assert.deepEqual(list.find(p => p.id === id), history[0]);
}
const results = { checkedAt: new Date().toISOString(), status: "passed", id,
 checks: ["input/date validation", "creation", "immutable original", "same ID after edit",
 "concurrent edit conflict", "duplicate create rejection", "cross-origin rejection", "unchanged read-back",
 "script-like text stored as text"], limitation: "Local D1 only; production deployment is separately verified by Sites." };
writeFileSync(".sites-runtime/api-check-result.json", JSON.stringify(results, null, 2));
console.log(JSON.stringify(results));
