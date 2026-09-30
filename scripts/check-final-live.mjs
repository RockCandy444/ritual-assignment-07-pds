import assert from "node:assert/strict";
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
const origin = "http://127.0.0.1:5176";
async function read(route) {
  const response = await fetch(origin + route, { cache: "no-store" });
  assert.equal(response.status, 200); return response.json();
}
const first = await read("/api/export");
const second = await read("/api/export");
assert.deepEqual(first.tables, second.tables);
const active = first.tables.study_logs.filter(row => row.deleted_at === null);
assert.equal(first.tables.plans.length, 2);
assert.equal(first.tables.tasks.filter(row => row.deleted_at === null).length, 5);
assert.equal(active.length, 3);
assert.equal(active.reduce((sum, row) => sum + row.actual_minutes, 0), 90);
assert.equal(first.tables.plan_reviews.length, 1);
const sourceId = "7a2b2ae6-f53c-4034-957d-080f56f2fa04";
const review = await read("/api/reviews?planId=" + sourceId);
assert.deepEqual(review.summary, { planned: 5, completed: 3, overdue: 0, blocked: 0, expectedMinutes: 118, actualMinutes: 90, differenceMinutes: -28 });
const target = await read("/api/reviews?planId=" + review.review.nextPlanId);
assert.equal(target.incoming[0].improvement, review.review.improvement);
const history = await read("/api/plans?id=" + sourceId);
assert.equal(history.versions.length, 3);
assert.equal(history.versions[0].startDate, "2026-09-27");
const expectedContent = ["JLPT Plus로 단어 5개 외우기", "JLPT 서적으로 문제 1페이지", "JLPT Plus로 단어 5개 외우기"];
for (let i = 0; i < 3; i++) {
  const day = `2026-09-${27 + i}`;
  const log = active.find(row => row.started_at === day + "T14:00:00.000Z");
  assert.ok(log); assert.equal(log.ended_at, day + "T14:30:00.000Z");
  assert.equal(log.studied_content, expectedContent[i]); assert.equal(log.blocker_reason, null);
}
const patterns = [
  /sk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{24,}/,
  /gh[pousr]_[A-Za-z0-9]{30,}/,
  /github_pat_[A-Za-z0-9_]{30,}/,
  /npm_[A-Za-z0-9]{30,}/,
  /AKIA[A-Z0-9]{16}/,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
];
const excluded = new Set(["node_modules", ".git", ".sites-runtime", ".wrangler", "outputs", ".next", ".vinext"]);
let scannedFiles = 0;
const findings = [];
function scan(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (excluded.has(entry.name)) continue;
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) scan(filename);
    else if (entry.isFile() && /\.(?:js|mjs|cjs|ts|tsx|json|md|css|html|sql|toml|sh)$/.test(entry.name)) {
      const content = readFileSync(filename, "utf8"); scannedFiles++;
      if (patterns.some(pattern => pattern.test(content))) findings.push(path.relative(root, filename));
    }
  }
}
scan(root);
assert.deepEqual(findings, [], "Potential credentials found; only filenames are reported");
const rawScript = /dangerouslySetInnerHTML|\beval\s*\(|new Function\s*\(|\.innerHTML\s*=/;
for (const directory of ["app", "lib", "db"]) {
  function inspect(folder) {
    for (const entry of readdirSync(folder, { withFileTypes: true })) {
      const filename = path.join(folder, entry.name);
      if (entry.isDirectory()) inspect(filename);
      else if (/\.(ts|tsx)$/.test(filename)) assert.ok(!rawScript.test(readFileSync(filename, "utf8")), "Unsafe text rendering: " + path.relative(root, filename));
    }
  }
  inspect(path.join(root, directory));
}
mkdirSync(path.join(root, ".sites-runtime/final-qa"), { recursive: true });
writeFileSync(path.join(root, ".sites-runtime/final-qa/live-snapshot.json"), JSON.stringify(first, null, 2));
writeFileSync(path.join(root, ".sites-runtime/final-qa/live-results.json"), JSON.stringify({ checkedAt: new Date().toISOString(), status: "passed", summary: review.summary, activeRecords: 3, connectedImprovement: review.review.improvement, scannedFiles, credentialFindings: 0, limitations: "Pattern scan is not a guarantee against every possible secret format. Source repository history and hosted anonymous access require deployment-stage verification." }, null, 2));
console.log(`Live data passed: 2 plans, 5 tasks, 3 real logs / 90 minutes, saved improvement, history, exact Seoul timestamps, stable read-back. Source/build credential scan: ${scannedFiles} files, no matches. Unsafe app text rendering: none.`);
