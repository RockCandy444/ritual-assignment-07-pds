import assert from "node:assert/strict";
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { createContext, SourceTextModule, SyntheticModule, runInContext } from "node:vm";
import { fileURLToPath } from "node:url";
import path from "node:path";
import ts from "typescript";

// Execute the existing integration suites against real application handlers
// and SQLite, without putting their test rows into the user's local D1.
const root = new URL("../", import.meta.url);
const report = { checkedAt: new Date().toISOString(), mode: "isolated memory SQLite / actual API handlers", suites: [] };
const output = new URL("../.sites-runtime/final-qa/", import.meta.url);
mkdirSync(output, { recursive: true });

for (const suite of ["check-plan-api.mjs", "check-task-api.mjs", "check-study-log-api.mjs", "check-review-api.mjs"]) {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON");
  for (const file of readdirSync(new URL("drizzle/", root)).filter(name => name.endsWith(".sql")).sort()) {
    sqlite.exec(readFileSync(new URL("drizzle/" + file, root), "utf8"));
  }
  function statement(query, values = []) {
    return {
      bind(...bound) { return statement(query, bound); },
      async first() { return sqlite.prepare(query).get(...values) ?? null; },
      async all() { return { success: true, results: sqlite.prepare(query).all(...values) }; },
      async run() { return { success: true, meta: { changes: sqlite.prepare(query).run(...values).changes } }; },
      runNow() { return { success: true, meta: { changes: sqlite.prepare(query).run(...values).changes } }; },
    };
  }
  const binding = {
    prepare: statement,
    async batch(statements) {
      sqlite.exec("BEGIN");
      try { const values = statements.map(item => item.runNow()); sqlite.exec("COMMIT"); return values; }
      catch (error) { sqlite.exec("ROLLBACK"); throw error; }
    },
  };
  const context = createContext({ Request, Response, URL, crypto, console, process: { env: { PDS_TEST_ORIGIN: "http://127.0.0.1:5999" } } });
  const modules = new Map();
  async function load(specifier, referencing) {
    let key = specifier;
    if (specifier.startsWith("@/")) key = new URL(specifier.slice(2) + ".ts", root).href;
    else if (specifier.startsWith(".")) key = new URL(specifier, referencing.identifier).href;
    if (modules.has(key)) return modules.get(key);
    let module;
    if (key === "cloudflare:workers") {
      module = new SyntheticModule(["env"], function () { this.setExport("env", { DB: binding }); }, { context, identifier: key });
    } else if (key === "node:assert/strict") {
      module = new SyntheticModule(["default"], function () { this.setExport("default", assert); }, { context, identifier: key });
    } else if (key === "node:fs") {
      module = new SyntheticModule(["writeFileSync", "mkdirSync"], function () {
        this.setExport("mkdirSync", () => {});
        this.setExport("writeFileSync", (name, value) => writeFileSync(new URL(suite + "-" + path.basename(name), output), value));
      }, { context, identifier: key });
    } else {
      const filename = fileURLToPath(key);
      assert.ok(filename.startsWith(fileURLToPath(root)), "Only project files may load");
      const source = readFileSync(filename, "utf8");
      const compiled = filename.endsWith(".ts") ? ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText : source;
      module = new SourceTextModule(compiled, { context, identifier: key });
    }
    modules.set(key, module);
    await module.link(load);
    return module;
  }
  const handlers = {};
  for (const route of ["plans", "tasks", "study-logs", "reviews"]) {
    const module = await load(new URL(`app/api/${route}/route.ts`, root).href);
    await module.evaluate(); handlers[route] = module.namespace;
  }
  context.dispatchRequest = async (url, options) => {
    const request = new Request(url, options);
    const route = new URL(url).pathname.split("/")[2];
    const response = await handlers[route][request.method](request);
    return { status: response.status, text: await response.text() };
  };
  // Parse responses within the same JS realm as the assertions.
  runInContext("globalThis.fetch = async (url, options) => { const result = await dispatchRequest(url, options); return { status: result.status, json: async () => JSON.parse(result.text) }; }", context);
  const module = await load(new URL("scripts/" + suite, root).href);
  await module.evaluate();
  report.suites.push({ name: suite, status: "passed" });
  sqlite.close();
}
writeFileSync(new URL("results.json", output), JSON.stringify(report, null, 2));
console.log("All existing plan, study-log and review integration suites passed against isolated SQLite. User data was not modified.");
