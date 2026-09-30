import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { createContext, SourceTextModule, SyntheticModule } from "node:vm";
import ts from "typescript";

// Fixtures live only in memory; this check never writes to the user's D1.
const root = new URL("../", import.meta.url);
const contract = JSON.parse(readFileSync(new URL("contracts/pds-schema-v2.json", root), "utf8"));
const sqlite = new DatabaseSync(":memory:");
for (const file of readdirSync(new URL("drizzle/", root)).filter(name => name.endsWith(".sql")).sort()) {
  sqlite.exec(readFileSync(new URL("drizzle/" + file, root), "utf8"));
}
const binding = {
  prepare(query) { return { query }; },
  async batch(statements) {
    sqlite.exec("BEGIN");
    try {
      const results = statements.map(({ query }) => ({ success: true, results: sqlite.prepare(query).all() }));
      sqlite.exec("COMMIT");
      return results;
    } catch (error) { sqlite.exec("ROLLBACK"); throw error; }
  },
};
const environment = { DB: binding };
const context = createContext({ Response, console: { error() {} } });
const modules = new Map();
async function moduleFor(specifier) {
  if (modules.has(specifier)) return modules.get(specifier);
  let module;
  if (specifier === "cloudflare:workers") {
    module = new SyntheticModule(["env"], function () { this.setExport("env", environment); }, { context });
  } else if (specifier === "@/contracts/pds-schema-v2.json") {
    module = new SyntheticModule(["default"], function () { this.setExport("default", contract); }, { context });
  } else {
    const file = { "@/db/export": "db/export.ts", route: "app/api/export/route.ts" }[specifier];
    if (!file) throw new Error("Unexpected import " + specifier);
    const source = readFileSync(new URL(file, root), "utf8");
    const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
    module = new SourceTextModule(compiled.outputText, { context });
  }
  modules.set(specifier, module);
  await module.link(moduleFor);
  return module;
}
const route = await moduleFor("route");
await route.evaluate();
const get = route.namespace.GET;
const verifyResponse = async () => {
  const response = await get();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-disposition"), /^attachment; filename="pds-diary-\d{8}T\d{6}Z\.json"$/);
  assert.match(response.headers.get("content-type"), /application\/json; charset=utf-8/);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  const data = await response.json();
  assert.equal(data.format, "pds-study-diary");
  assert.equal(data.exportVersion, 1);
  assert.equal(data.schemaVersion, contract.schemaVersion);
  assert.equal(data.timezone, "Asia/Seoul");
  assert.equal(data.timeUnit, "minutes");
  assert.equal(data.includesDeleted, true);
  assert.ok(Number.isFinite(Date.parse(data.exportedAt)));
  assert.deepEqual(data.schemaContract, contract);
  // Compare every stored column and value, not only counts or visible lists.
  for (const [table, schema] of Object.entries(contract.tables)) {
    const order = schema.primaryKey.join(", ");
    const stored = sqlite.prepare(`SELECT * FROM ${table} ORDER BY ${order}`).all();
    assert.deepEqual(data.tables[table], JSON.parse(JSON.stringify(stored)));
  }
  return data;
};
let data = await verifyResponse();
assert.ok(Object.values(data.tables).every(rows => rows.length === 0));

const sourceId = crypto.randomUUID();
const nextId = crypto.randomUUID();
const activeTask = crypto.randomUUID();
const deletedTask = crypto.randomUUID();
const timestamp = "2026-09-30T00:00:00.000Z";
const text = '<script>alert("테스트")</script> 日本語 · 한글';
for (const id of [sourceId, nextId]) sqlite.prepare("INSERT INTO plans VALUES (?, ?)").run(id, timestamp);
const plan = sqlite.prepare("INSERT INTO plan_versions VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
plan.run(sourceId, 1, "첫 계획", "2026-09-29", "2026-10-06", "normal", text, 120, timestamp);
plan.run(sourceId, 2, "수정한 계획", "2026-09-29", "2026-10-06", "high", text, 118, timestamp);
plan.run(nextId, 1, "다음 계획", "2026-10-06", "2026-10-13", "low", "복습", 60, timestamp);
const task = sqlite.prepare("INSERT INTO tasks VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
task.run(activeTask, sourceId, text, "2026-09-30", "normal", '["어휘","Anki"]', 30, timestamp, null, timestamp, timestamp, 2);
task.run(deletedTask, sourceId, "삭제한 할 일", null, "low", "[]", 15, null, timestamp, timestamp, timestamp, 3);
const log = sqlite.prepare("INSERT INTO study_logs VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
log.run(crypto.randomUUID(), activeTask, "2026-09-29T23:30:00Z", timestamp, 30, text, null, timestamp, timestamp, null, 1);
log.run(crypto.randomUUID(), deletedTask, "2026-09-29T23:30:00Z", timestamp, 10, "삭제한 기록", "막힘", timestamp, timestamp, timestamp, 2);
sqlite.prepare("INSERT INTO plan_reviews VALUES (?, ?, ?, ?, ?, ?)").run(sourceId, nextId, text, timestamp, timestamp, 1);
data = await verifyResponse();
assert.equal(data.tables.plan_versions.length, 3);
assert.equal(data.tables.tasks.length, 2);
assert.equal(data.tables.study_logs.length, 2);
assert.equal(data.tables.plan_reviews[0].next_plan_id, nextId);
assert.equal(data.tables.plan_versions.find(row => row.plan_id === sourceId && row.version === 1).success_criteria, text);

environment.DB = undefined;
let response = await get();
assert.equal(response.status, 503);
assert.equal(response.headers.get("content-disposition"), null);
assert.ok((await response.json()).error);
environment.DB = { ...binding, async batch() { throw new Error("Sensitive diagnostic"); } };
response = await get();
assert.equal(response.status, 503);
assert.ok(!(await response.text()).includes("Sensitive diagnostic"));
sqlite.close();
console.log("Export checks passed: empty database, all five tables, history, deleted rows, links, exact dates/minutes/nulls/tags, Unicode/script text, attachment headers and safe failures.");

// Optional independent read-only comparison against the running local D1.
if (process.env.PDS_TEST_ORIGIN || process.env.PDS_TEST_DB_FILE) {
  const origin = new URL(process.env.PDS_TEST_ORIGIN);
  if (origin.hostname !== "127.0.0.1" || !process.env.PDS_TEST_DB_FILE) throw new Error("Provide local origin and D1 SQLite file together.");
  const localDb = new DatabaseSync(process.env.PDS_TEST_DB_FILE, { readOnly: true });
  const liveResponse = await fetch(new URL("/api/export", origin));
  assert.equal(liveResponse.status, 200);
  const live = await liveResponse.json();
  for (const [table, schema] of Object.entries(contract.tables)) {
    const stored = localDb.prepare(`SELECT * FROM ${table} ORDER BY ${schema.primaryKey.join(", ")}`).all();
    assert.deepEqual(live.tables[table], JSON.parse(JSON.stringify(stored)));
  }
  localDb.close();
  console.log("Live export matches every stored row and column in the local D1; user data was not modified.");
}
