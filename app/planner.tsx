"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { BookOpen, CalendarDays, Clock3, History, NotebookPen, Save, LockKeyhole } from "lucide-react";
import AccountPanel from "./account-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { priorities, validatePlan, type PlanInput, type PlanVersion } from "@/lib/plan";
import TaskManager from "./tasks";
import ExportDiary from "./export-diary";
const initial: PlanInput = { title: "JLPT N2 첫 주 공부 계획", startDate: "", endDate: "", priority: "normal",
  successCriteria: "요일을 정하지 않고 주 4회, 회당 30분 공부한다. 공부한 내용과 막힌 점을 기록한다.", expectedMinutes: 120 };
const sessions = [["01", "어휘 확인 + Anki 복습", "15분 + 15분"], ["02", "문법 2개와 관련 문제", "30분"], ["03", "독해 지문과 해설", "30분"], ["04", "청해 문제와 대본", "30분"]];
const displayTime = (iso: string) => new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
async function requestApi(url: string, options?: RequestInit) {
  const response = await fetch(url, { cache: "no-store", ...options });
  const body = await response.json() as { error?: string; plans: PlanVersion[]; versions: PlanVersion[]; plan: PlanVersion };
  if (!response.ok) throw new Error(body.error || "요청을 처리하지 못했어요.");
  return body;
}
export default function Planner({ user }: { user: { name: string; email: string } }) {
  const [draft, setDraft] = useState<PlanInput>(initial);
  const [plans, setPlans] = useState<PlanVersion[]>([]);
  const [editing, setEditing] = useState<PlanVersion | null>(null);
  const [versions, setVersions] = useState<PlanVersion[]>([]);
  const [historyId, setHistoryId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [historyError, setHistoryError] = useState("");
  const [historyLoading, setHistoryLoading] = useState(false);
  const createId = useRef<string | null>(null);
  const busy = useRef(false);
  const historyRequest = useRef(0);
  async function load() {
    setLoading(true); setError("");
    try { const data = await requestApi("/api/plans"); setPlans(data.plans); }
    catch (e) { setError(e instanceof Error ? e.message : "계획을 불러오지 못했어요."); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);
  useEffect(() => {
    const context = (document as unknown as { modelContext?: { registerTool: (tool: unknown, options: { signal: AbortSignal }) => Promise<void> | void } }).modelContext;
    if (!context) return;
    const lifecycle = new AbortController();
    try { Promise.resolve(context.registerTool({
      name: "read_saved_study_plans", title: "저장된 공부 계획 읽기",
      description: "저장된 공부 계획을 읽고 화면 목록을 새로 고칩니다. 계획을 만들거나 수정하지 않습니다.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute: async (input: unknown) => {
        if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).length) throw new Error("빈 객체를 입력해 주세요.");
        const data = await requestApi("/api/plans"); setPlans(data.plans); return data;
      },
    }, { signal: lifecycle.signal })).catch(() => {}); } catch {}
    return () => lifecycle.abort();
  }, []);
  function update<K extends keyof PlanInput>(key: K, value: PlanInput[K]) {
    setDraft(d => ({ ...d, [key]: value })); setNotice("");
  }
  async function showHistory(id: string) {
    const sequence = ++historyRequest.current;
    setHistoryId(id); setVersions([]); setHistoryLoading(true); setHistoryError("");
    try { const data = await requestApi("/api/plans?id=" + encodeURIComponent(id)); if (sequence === historyRequest.current) setVersions(data.versions); }
    catch (e) { if (sequence === historyRequest.current) setHistoryError(e instanceof Error ? e.message : "이력을 불러오지 못했어요."); }
    finally { if (sequence === historyRequest.current) setHistoryLoading(false); }
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy.current) return;
    setError(""); setNotice("");
    let valid;
    try { valid = validatePlan(draft); } catch (e) { setError((e as Error).message); return; }
    busy.current = true; setSaving(true); createId.current ??= crypto.randomUUID();
    try {
      const data = await requestApi("/api/plans", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editing?.id ?? createId.current, expectedVersion: editing?.version ?? 0, plan: valid }) });
      setPlans(list => [data.plan, ...list.filter(p => p.id !== data.plan.id)]);
      setEditing(data.plan); setDraft(valid);
      setNotice(data.plan.version === 1 ? "첫 계획을 저장했어요. 새로고침해도 그대로 남아요." : "변경 내용을 저장했어요. 이전 계획은 수정 이력에서 확인할 수 있어요.");
      if (historyId === data.plan.id) void showHistory(data.plan.id);
    } catch (e) { setError(e instanceof Error ? e.message : "저장하지 못했어요. 입력 내용은 그대로 남아 있어요."); }
    finally { busy.current = false; setSaving(false); }
  }
  function edit(plan: PlanVersion) {
    setEditing(plan); setDraft({ ...plan }); setNotice(""); setError("");
    document.getElementById("plan-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
    document.getElementById("title")?.focus({ preventScroll: true });
  }
  return (
    <div className="app-shell">
      <header className="masthead"><div className="brand"><NotebookPen aria-hidden="true" /><span>플랜두씨<span className="brand-sub">공부 다이어리</span></span></div><span className="phase">나만의 공부 공간</span></header>
      <main>
        <AccountPanel user={user} />
        <div className="privacy-note"><LockKeyhole size={18} aria-hidden="true" /><p>내 계정의 공부 자료만 표시합니다. 공용 컴퓨터에서는 사용 후 로그아웃해 주세요.</p></div>
        <div className="page-heading"><div><p className="eyebrow">MY STUDY PLAN</p><h1>작게 계획하고,<br className="mobile-break" /> 꾸준히 쌓기.</h1><p className="intro">12월 N2를 향해. 이번 주에 할 수 있는 만큼 정해 보세요.</p></div><div className="goal-mark"><span>JLPT</span><strong>N2</strong><span>2026년 12월 목표</span></div></div>
        <div className="workspace">
          <section className="form-panel" aria-labelledby="form-title">
            <div className="section-heading"><span className="section-index">01</span><div><h2 id="form-title">{editing ? "계획 다듬기" : "첫 계획 만들기"}</h2><p>{editing ? `현재 ${editing.version}번째 버전 · 이전 내용은 그대로 보관돼요.` : "아래 초안을 내 일정에 맞게 바꾼 뒤 저장하세요."}</p></div></div>
            <form id="plan-form" onSubmit={save}>
              <fieldset disabled={saving}>
                <label htmlFor="title">계획 이름</label><Input id="title" maxLength={120} required value={draft.title} onChange={e => update("title", e.target.value)} />
                <div className="field-grid"><div><label htmlFor="startDate">시작일</label><Input id="startDate" type="date" min="2000-01-01" max="2100-12-31" required value={draft.startDate} onChange={e => update("startDate", e.target.value)} /></div><div><label htmlFor="endDate">종료일</label><Input id="endDate" type="date" min={draft.startDate || "2000-01-01"} max="2100-12-31" required value={draft.endDate} onChange={e => update("endDate", e.target.value)} /></div></div>
                <p className="field-help">시험일이 아니라, 이 공부 계획을 실행할 기간이에요.</p>
                <div className="field-grid"><div><label htmlFor="priority">우선순위</label><Select value={draft.priority} onValueChange={v => update("priority", v as PlanInput["priority"])}><SelectTrigger id="priority" className="priority-select"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(priorities).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div><div><label htmlFor="minutes">기간 내 총 예상 시간 <span>(분)</span></label><Input id="minutes" type="number" min={1} max={100000} step={1} required value={Number.isNaN(draft.expectedMinutes) ? "" : draft.expectedMinutes} onChange={e => update("expectedMinutes", e.target.value === "" ? NaN : Number(e.target.value))} /></div></div>
                <label htmlFor="criteria">성공 기준</label><Textarea id="criteria" rows={4} maxLength={2000} required value={draft.successCriteria} onChange={e => update("successCriteria", e.target.value)} />
                <p className="field-help">무엇을 하면 이번 계획을 잘 마쳤다고 할 수 있을까요?</p>
                <div className="form-footer"><span><History size={16} aria-hidden="true" /> 수정 전 계획도 보관</span><Button type="submit" size="lg"><Save size={17} aria-hidden="true" />{saving ? "저장 중…" : editing ? "변경 내용 저장" : "계획 저장하기"}</Button></div>
                {editing && <Button type="button" variant="ghost" className="new-plan" onClick={() => { setEditing(null); setDraft(initial); createId.current = null; setNotice(""); setError(""); }}>새 계획 작성하기</Button>}
              </fieldset>
            </form>
            {error && <div role="alert" className="message error">{error}<Button type="button" variant="outline" disabled={saving} onClick={() => void load()}>저장된 계획 다시 불러오기</Button></div>}
            {notice && <p role="status" className="message success">{notice}</p>}
          </section>
          <aside className="study-panel" aria-label="내 공부 기준">
            <div className="study-top"><BookOpen size={21} aria-hidden="true" /><h2>나의 공부 리듬</h2></div>
            <div className="rhythm"><div><strong>4<span>회</span></strong><p>요일 상관없이 / 주</p></div><span className="times">×</span><div><strong>30<span>분</span></strong><p>한 번에 집중하기</p></div></div>
            <div className="weekly-total"><Clock3 size={16} aria-hidden="true" /> 일주일에 총 120분</div>
            <h3>첫 주 학습 순서 <span>제안</span></h3>
            <ol className="session-list">{sessions.map(([n, text, time]) => <li key={n}><span className="session-number">{n}</span><div><p>{text}</p><span>{time}</span></div></li>)}</ol>
            <div className="materials"><h3>함께 쓸 자료</h3><p>다락원 JLPT 한권으로 끝내기 N2</p><p className="app-names">AnkiDroid · JLPT Plus · 듀오링고</p><p className="small-note">1년 전 N3 합격 경험을 바탕으로 시작해요.</p></div>
          </aside>
        </div>
        <section className="saved-section" aria-labelledby="saved-title"><div className="saved-heading"><h2 id="saved-title">저장한 계획 <span>{plans.length}</span></h2><Button variant="ghost" disabled={loading || saving} onClick={() => void load()}>{loading ? "불러오는 중…" : "새로 불러오기"}</Button></div>
          {!loading && !plans.length && !error && <p className="empty-copy">아직 저장한 계획이 없어요. 위에서 기간을 정하고 첫 계획을 남겨 보세요.</p>}
          {plans.map(plan => <article className="saved-card" key={plan.id}><div className="saved-card-top"><div><span className="priority-label">{priorities[plan.priority]} 우선순위 · 버전 {plan.version}</span><h3>{plan.title}</h3></div><Button variant="outline" disabled={saving} onClick={() => edit(plan)}>수정하기</Button></div><div className="plan-facts"><span><CalendarDays size={16} aria-hidden="true" />{plan.startDate} ~ {plan.endDate}</span><span><Clock3 size={16} aria-hidden="true" />예상 {plan.expectedMinutes}분</span></div><p className="criteria-text">{plan.successCriteria}</p><div className="card-bottom"><span>저장 {displayTime(plan.savedAt)} · 서울</span><Button variant="ghost" onClick={() => void showHistory(plan.id)}><History size={16} aria-hidden="true" />수정 이력 보기</Button></div><details className="id-detail"><summary>계획 ID</summary><code>{plan.id}</code></details></article>)}
        </section>
        <TaskManager plans={plans} />
        {historyId && <section className="history-section" aria-labelledby="history-title"><div className="saved-heading"><h2 id="history-title">계획 수정 이력</h2><Button variant="ghost" onClick={() => { ++historyRequest.current; setHistoryId(null); }}>닫기</Button></div>{historyLoading && <p role="status">이력을 불러오고 있어요.</p>}{historyError && <p role="alert" className="message error">{historyError}</p>}<ol>{versions.map(v => <li key={v.version}><div className="version-marker">{v.version}</div><div><p className="history-meta">{v.version === 1 ? "처음 세운 계획" : `${v.version}번째 버전`} · {displayTime(v.savedAt)} (서울)</p><h3>{v.title}</h3><p>{v.startDate} ~ {v.endDate} · {priorities[v.priority]} · 예상 {v.expectedMinutes}분</p><p className="criteria-text">{v.successCriteria}</p></div></li>)}</ol></section>}
        <ExportDiary />
        <footer className="page-footer">공부 기록을 돌아보고 다음 계획에 적용할 한 가지를 남겨 보세요.</footer>
      </main>
    </div>
  );
}
