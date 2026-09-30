import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";

const origin = process.env.PDS_TEST_ORIGIN || "http://127.0.0.1:5177";
const local = new URL(origin).hostname === "127.0.0.1";
if (!local) throw new Error("This verifier uses disposable local accounts; a remote origin is not allowed.");
const runId = randomUUID();
const password = randomBytes(24).toString("base64url");
const newPassword = randomBytes(24).toString("base64url");
const credentials = new Map();
const records = [];
const secrets = new Set([password, newPassword]);
const storeDir = ".wrangler/state/v3/d1/miniflare-D1DatabaseObject";
const databases = readdirSync(storeDir).filter(name => name.endsWith(".sqlite") && name !== "metadata.sqlite");
assert.equal(databases.length, 1);
const db = new DatabaseSync(path.join(storeDir, databases[0]));
db.exec("PRAGMA busy_timeout = 5000");
const redact = value => {
  if (typeof value === "string") {
    for (const secret of secrets) if (secret && value.includes(secret)) return "[가림]";
    return value;
  }
  if (!value || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(redact);
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, /password|token|secret|cookie|authorization/i.test(key) ? "[가림]" : redact(item)]));
};
async function call(label, endpoint, { method = "GET", cookie, body, extraHeaders = {}, recordBody = true } = {}) {
  const headers = { ...extraHeaders };
  if (cookie) headers.Cookie = cookie;
  if (body !== undefined) { headers["Content-Type"] = "application/json"; headers.Origin = origin; }
  let response;
  for (let attempt = 0; attempt < 3; attempt++) {
    response = await fetch(origin + endpoint, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), redirect: "manual" });
    if (response.status !== 429 || attempt === 2) break;
    const waitHeader = response.headers.get("retry-after") ?? response.headers.get("x-retry-after");
    assert(waitHeader !== null, "Missing rate-limit wait header");
    const waitSeconds = Number(waitHeader);
    assert(Number.isFinite(waitSeconds) && waitSeconds >= 0 && waitSeconds <= 60, "Unexpected rate-limit wait");
    records.push({ label: "인증 요청 제한과 Retry-After 준수", response: { status: 429 }, retryAfterSeconds: waitSeconds });
    await response.arrayBuffer();
    await new Promise(resolve => setTimeout(resolve, Math.max(1, waitSeconds) * 1000 + 100));
  }
  const raw = await response.text();
  let result; try { result = JSON.parse(raw); } catch { result = { location: response.headers.get("location"), htmlOmitted: true }; }
  const setCookies = response.headers.getSetCookie();
  const issued = setCookies.map(item => item.split(";")[0]).filter(item => !item.endsWith("=")).join("; ");
  if (issued) { secrets.add(issued); for (const part of issued.split("; ")) secrets.add(part.slice(part.indexOf("=") + 1)); }
  records.push({ label, request: { method, endpoint, cookie: cookie ? "[가림]" : null, headers: redact(extraHeaders), body: recordBody ? redact(body) : "[자료 본문 생략]" }, response: { status: response.status, body: recordBody ? redact(result) : { omitted: true }, sessionCookie: setCookies.length ? "[가림]" : null } });
  return { status: response.status, body: result, cookie: issued, setCookies };
}
async function signup(name, sharedPassword = password) {
  const email = `t07-check-${runId}-${name}@example.invalid`;
  const response = await call(`가입 ${name}`, "/api/auth/sign-up/email", { method: "POST", body: { name: `[테스트] ${name}`, email, password: sharedPassword } });
  assert.equal(response.status, 200, `signup ${name}`);
  assert(response.cookie);
  assert(!("token" in response.body));
  const account = { name, email, password: sharedPassword, cookie: response.cookie, userId: response.body.user.id };
  credentials.set(email, account);
  return account;
}
async function login(account, pass = account.password) {
  const response = await call(`로그인 ${account.name}`, "/api/auth/sign-in/email", { method: "POST", body: { email: account.email, password: pass } });
  if (response.status === 200) account.cookie = response.cookie;
  return response;
}
async function removeAccount(account) {
  const result = await call(`계정 삭제 ${account.name}`, "/api/account", { method: "DELETE", cookie: account.cookie, body: { password: account.password } });
  assert.equal(result.status, 200);
  credentials.delete(account.email);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM plans WHERE owner_id = ?").get(account.userId).count, 0);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM auth_user WHERE id = ?").get(account.userId).count, 0);
}
const planInput = name => ({ title: `[테스트] ${name} 계획`, startDate: "2026-09-30", endDate: "2026-10-02", priority: "normal", successCriteria: "검증 전용 자료", expectedMinutes: 30 });
const taskInput = name => ({ title: `[테스트] ${name} 할 일`, dueDate: null, priority: "normal", tags: ["테스트"], expectedMinutes: 20 });
async function fixture(account) {
  const planId = randomUUID(), nextPlanId = randomUUID(), taskId = randomUUID(), logId = randomUUID();
  for (const id of [planId, nextPlanId]) {
    const result = await call(`계획 생성 ${account.name}`, "/api/plans", { method: "POST", cookie: account.cookie, body: { id, expectedVersion: 0, plan: { ...planInput(account.name), ...(id === nextPlanId ? { startDate: "2026-10-03", endDate: "2026-10-05" } : {}) } } });
    assert.equal(result.status, 201);
  }
  assert.equal((await call(`할 일 생성 ${account.name}`, "/api/tasks", { method: "POST", cookie: account.cookie, body: { id: taskId, planId, task: taskInput(account.name) } })).status, 201);
  const log = { taskId, startedAt: new Date(Date.now() - 30 * 60000).toISOString(), endedAt: new Date(Date.now() - 10 * 60000).toISOString(), actualMinutes: 10, studiedContent: "[테스트] 인증 검증용 기록", blockerReason: null };
  assert.equal((await call(`공부 기록 생성 ${account.name}`, "/api/study-logs", { method: "POST", cookie: account.cookie, body: { id: logId, planId, log } })).status, 201);
  assert.equal((await call(`돌아보기 생성 ${account.name}`, "/api/reviews", { method: "POST", cookie: account.cookie, body: { planId, expectedVersion: 0, review: { nextPlanId, improvement: "[테스트] 다음 검증에서도 같은 지표 사용" } } })).status, 201);
  return { planId, nextPlanId, taskId, logId, log };
}
async function exported(account, label) {
  const r = await call(label, "/api/export", { cookie: account.cookie }); assert.equal(r.status, 200); return r.body.tables;
}
let summary;
try {
  const anonymous = await call("비로그인 자료 화면", "/diary");
  assert([302, 303, 307, 308].includes(anonymous.status));
  assert.equal(anonymous.body.location, "/");
  for (const url of ["/api/plans", "/api/tasks?planId=" + randomUUID(), "/api/study-logs?planId=" + randomUUID(), "/api/reviews?planId=" + randomUUID(), "/api/export"]) {
    assert.equal((await call("비로그인 직접 요청", url)).status, 401);
  }
  const a = await signup("A"), b = await signup("B");
  const hashes = [a, b].map(account => db.prepare("SELECT password FROM auth_account WHERE user_id = ?").get(account.userId).password);
  assert(hashes.every(value => value !== password && /^[0-9a-f]{32}:[0-9a-f]{128}$/.test(value)));
  assert.notEqual(hashes[0], hashes[1]);
  records.push({ label: "같은 비밀번호의 저장값 대조", algorithm: "scrypt", parameters: { N: 16384, r: 16, p: 1, dkLen: 64 }, storedHashes: hashes, plaintextVisible: false });
  const dup = await call("중복 가입", "/api/auth/sign-up/email", { method: "POST", body: { name: "[테스트] A", email: a.email, password } });
  assert(dup.status >= 400);
  const wrong = await login(a, newPassword);
  const nonexistent = await call("없는 이메일 로그인", "/api/auth/sign-in/email", { method: "POST", body: { email: `t07-check-${runId}-absent@example.invalid`, password } });
  assert.equal(wrong.status, 401); assert.equal(nonexistent.status, 401); assert.deepEqual(wrong.body, nonexistent.body);
  const oldCookie = a.cookie;
  assert.equal((await call("로그아웃 전 같은 요청", "/api/plans", { cookie: oldCookie })).status, 200);
  assert.equal((await call("로그아웃", "/api/auth/sign-out", { method: "POST", cookie: oldCookie, body: {} })).status, 200);
  assert.equal((await call("로그아웃 후 같은 값·주소·방식", "/api/plans", { cookie: oldCookie })).status, 401);
  assert.equal((await login(a)).status, 200);
  const sa = await call("세션 만료 시각과 토큰 비노출", "/api/auth/get-session", { cookie: a.cookie });
  assert.equal(sa.status, 200); assert(!("token" in sa.body.session));
  const remaining = Date.parse(sa.body.session.expiresAt) - Date.now(); assert(remaining > 23 * 3600000 && remaining <= 24 * 3600000);
  const fa = await fixture(a), fb = await fixture(b);
  const beforeA = await exported(a, "A 정상 내보내기"), beforeB = await exported(b, "B 정상 내보내기");
  assert(!JSON.stringify(beforeA).includes(fb.planId)); assert(!JSON.stringify(beforeB).includes(fa.planId));
  for (const [actor, target, other] of [[a, fa, fb], [b, fb, fa]]) {
    for (const [endpoint, options] of [
      ["/api/plans?id=" + other.planId, {}],
      ["/api/tasks?planId=" + other.planId, {}],
      ["/api/study-logs?planId=" + other.planId, {}],
      ["/api/reviews?planId=" + other.planId, {}],
      ["/api/tasks", { method: "PATCH", body: { id: other.taskId, expectedVersion: 1, action: "edit", task: taskInput("침범 시도") } }],
      ["/api/tasks", { method: "DELETE", body: { id: other.taskId, expectedVersion: 1 } }],
      ["/api/study-logs", { method: "PATCH", body: { id: other.logId, planId: target.planId, expectedVersion: 1, log: target.log } }],
      ["/api/study-logs", { method: "DELETE", body: { id: other.logId, planId: target.planId, expectedVersion: 1 } }],
      ["/api/plans", { method: "POST", body: { id: other.planId, expectedVersion: 1, plan: planInput("침범 시도") } }],
      ["/api/tasks", { method: "POST", body: { id: randomUUID(), planId: other.planId, task: taskInput("침범 시도") } }],
      ["/api/study-logs", { method: "POST", body: { id: randomUUID(), planId: target.planId, log: { ...target.log, taskId: other.taskId } } }],
      ["/api/reviews", { method: "POST", body: { planId: target.planId, expectedVersion: 1, review: { nextPlanId: other.nextPlanId, improvement: "[테스트] 침범 시도" } } }],
    ]) assert.equal((await call(`${actor.name} → 다른 계정 요청 거절`, endpoint, { cookie: actor.cookie, ...options })).status, 404);
    const otherUserId = actor.userId === a.userId ? b.userId : a.userId;
    const forged = await call(`${actor.name} URL·헤더의 남의 계정 무시`, "/api/plans?userId=" + otherUserId, { cookie: actor.cookie, extraHeaders: { "X-User-Id": otherUserId, "oai-authenticated-user-id": otherUserId } });
    assert.equal(forged.status, 200); assert(forged.body.plans.every(row => [target.planId, target.nextPlanId].includes(row.id)));
  }
  assert.deepEqual(await exported(a, "침범 거절 후 A 자료 대조"), beforeA);
  assert.deepEqual(await exported(b, "침범 거절 후 B 자료 대조"), beforeB);
  records.push({ label: "양방향 거절 전후 건수·내용 일치", unchanged: true, counts: { A: Object.fromEntries(Object.entries(beforeA).map(([k, v]) => [k, v.length])), B: Object.fromEntries(Object.entries(beforeB).map(([k, v]) => [k, v.length])) } });
  const spoofPlanId = randomUUID();
  assert.equal((await call("본문의 남의 계정 무시", "/api/plans", { method: "POST", cookie: a.cookie, body: { id: spoofPlanId, expectedVersion: 0, userId: b.userId, ownerId: b.userId, plan: planInput("A의 자료") } })).status, 201);
  assert.equal(db.prepare("SELECT owner_id FROM plans WHERE id = ?").get(spoofPlanId).owner_id, a.userId);
  const bOld = b.cookie;
  assert.equal((await login(b)).status, 200);
  const bSecond = b.cookie;
  assert.equal((await call("비밀번호 변경", "/api/auth/change-password", { method: "POST", cookie: bSecond, body: { currentPassword: password, newPassword } })).status, 200);
  b.password = newPassword;
  for (const cookie of [bOld, bSecond]) assert.equal((await call("비밀번호 변경 후 이전 세션 거절", "/api/plans", { cookie })).status, 401);
  assert.equal((await login(b, password)).status, 401); assert.equal((await login(b)).status, 200);
  db.prepare("UPDATE auth_session SET expires_at = ? WHERE user_id = ?").run(Date.now() - 1000, a.userId);
  assert.equal((await call("만료 시각 지난 세션 거절", "/api/plans", { cookie: a.cookie })).status, 401);
  assert.equal((await login(a)).status, 200);
  assert.equal((await call("잘못된 비밀번호로 계정 삭제 거절", "/api/account", { method: "DELETE", cookie: a.cookie, body: { password: newPassword } })).status, 401);
  assert.equal((await call("다른 사이트의 수정 요청 거절", "/api/tasks", { method: "PATCH", cookie: a.cookie, body: { id: fa.taskId, action: "complete" }, extraHeaders: { "sec-fetch-site": "cross-site" } })).status, 403);
  let importVerification = "not-run";
  if (process.env.PDS_T06_BACKUP_FILE) {
    const backup = JSON.parse(readFileSync(process.env.PDS_T06_BACKUP_FILE, "utf8"));
    const c = await signup("IMPORT"), d = await signup("COLLISION");
    assert.equal((await call("T06 자료 가져오기", "/api/import", { method: "POST", cookie: c.cookie, body: backup, recordBody: false })).status, 201);
    const actual = await call("가져온 원본 대조", "/api/export", { cookie: c.cookie, recordBody: false });
    for (const [table, rows] of Object.entries(backup.tables)) {
      const normalize = values => values.map(row => Object.fromEntries(Object.entries(row).sort())).sort((x, y) => JSON.stringify(x).localeCompare(JSON.stringify(y)));
      assert.deepEqual(normalize(actual.body.tables[table]), normalize(rows), table);
    }
    assert.equal((await call("중복 가져오기 거절", "/api/import", { method: "POST", cookie: c.cookie, body: backup, recordBody: false })).status, 409);
    assert.equal((await call("다른 계정 ID 충돌 전체 롤백", "/api/import", { method: "POST", cookie: d.cookie, body: backup, recordBody: false })).status, 409);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM plans WHERE owner_id = ?").get(d.userId).count, 0);
    await removeAccount(c); await removeAccount(d);
    importVerification = "원본 모든 표·열·값·ID·이력 일치, 재가져오기 거절, 다른 계정 ID 충돌 롤백 통과";
  }
  const deletedCookie = a.cookie;
  await removeAccount(a);
  assert.equal((await call("계정 삭제 후 이전 세션 거절", "/api/plans", { cookie: deletedCookie })).status, 401);
  assert.equal((await login(a)).status, 401);
  await removeAccount(b);
  summary = { runId, origin, capturedAt: new Date().toISOString(), authLibrary: "better-auth 1.7.6", adapter: "@better-auth/drizzle-adapter 1.7.6", passwordHash: "scrypt", cases: records.length, result: "passed", importVerification, testAccountsRemoved: true, realStudyDaysGenerated: 0 };
} finally {
  for (const account of credentials.values()) {
    try { await login(account); await removeAccount(account); } catch { console.error("A disposable local test account needs cleanup."); }
  }
  db.close();
}
const evidence = JSON.stringify({ summary, records }, null, 2);
for (const secret of secrets) assert(!evidence.includes(secret), "Evidence contains an unredacted value");
const out = ".sites-runtime/auth-qa";
mkdirSync(out, { recursive: true });
writeFileSync(path.join(out, "local-evidence.json"), evidence + "\n");
console.log(JSON.stringify(summary, null, 2));
