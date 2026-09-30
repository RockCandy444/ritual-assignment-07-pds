"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Check, Clock3, Pencil, RotateCcw, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { priorities, type PlanVersion } from "@/lib/plan";
import { validateTask, type StudyTask, type TaskInput } from "@/lib/task";
import StudyLogManager from "./study-logs";
import ReviewManager from "./reviews";

const blankTask: TaskInput = { title: "", dueDate: null, priority: "normal", tags: [], expectedMinutes: 30 };
const sortLabels = { due: "마감일 빠른 순", priority: "우선순위 높은 순", newest: "최근 만든 순", title: "이름순" } as const;
type SortKey = keyof typeof sortLabels;

async function taskRequest(options: RequestInit, query = "") {
  const response = await fetch(`/api/tasks${query}`, { cache: "no-store", ...options });
  const body = await response.json() as { error?: string; task?: StudyTask; tasks?: StudyTask[]; deleted?: boolean };
  if (!response.ok) throw new Error(body.error || "할 일 요청을 처리하지 못했어요.");
  return body;
}

export default function TaskManager({ plans }: { plans: PlanVersion[] }) {
  const [planId, setPlanId] = useState("");
  const [tasks, setTasks] = useState<StudyTask[]>([]);
  const [draft, setDraft] = useState<TaskInput>(blankTask);
  const [tagText, setTagText] = useState("");
  const [editing, setEditing] = useState<StudyTask | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [reviewRevision, setReviewRevision] = useState(0);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [sort, setSort] = useState<SortKey>("due");
  const createId = useRef<string | null>(null);

  useEffect(() => {
    const todayInSeoul = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const currentPlan = plans.find(plan => plan.startDate <= todayInSeoul && plan.endDate >= todayInSeoul);
    setPlanId(current => plans.some(plan => plan.id === current) ? current : (currentPlan?.id ?? plans[0]?.id ?? ""));
  }, [plans]);
  useEffect(() => {
    if (!planId) { setTasks([]); return; }
    let active = true;
    setTasks([]); setLoading(true); setError("");
    void taskRequest({}, `?planId=${encodeURIComponent(planId)}`)
      .then(data => { if (active) setTasks(data.tasks ?? []); })
      .catch(e => { if (active) setError(e instanceof Error ? e.message : "할 일을 불러오지 못했어요."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [planId, reloadKey]);

  const visible = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("ko-KR");
    return tasks.filter(task =>
      (!term || task.title.toLocaleLowerCase("ko-KR").includes(term) || task.tags.some(tag => tag.toLocaleLowerCase("ko-KR").includes(term))) &&
      (status === "all" || (status === "done" ? !!task.completedAt : !task.completedAt)) &&
      (priorityFilter === "all" || task.priority === priorityFilter)
    ).sort((a, b) => {
      if (sort === "priority") return ({ high: 0, normal: 1, low: 2 }[a.priority] - { high: 0, normal: 1, low: 2 }[b.priority]) || a.title.localeCompare(b.title, "ko");
      if (sort === "newest") return b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id);
      if (sort === "title") return a.title.localeCompare(b.title, "ko");
      return (a.dueDate ?? "9999-12-31").localeCompare(b.dueDate ?? "9999-12-31") || a.title.localeCompare(b.title, "ko");
    });
  }, [tasks, search, status, priorityFilter, sort]);

  function update<K extends keyof TaskInput>(key: K, value: TaskInput[K]) {
    setDraft(current => ({ ...current, [key]: value })); setNotice("");
  }
  function clearForm() { setEditing(null); setDraft(blankTask); setTagText(""); createId.current = null; }
  function edit(task: StudyTask) {
    setEditing(task); setDraft({ title: task.title, dueDate: task.dueDate, priority: task.priority, tags: task.tags, expectedMinutes: task.expectedMinutes });
    setTagText(task.tags.join(", ")); setError(""); setNotice("");
    document.getElementById("task-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!planId || saving) return;
    setError(""); setNotice("");
    let input: TaskInput;
    try { input = validateTask({ ...draft, tags: tagText.split(",").map(tag => tag.trim()).filter(Boolean) }); }
    catch (e) { setError((e as Error).message); return; }
    setSaving(true);
    createId.current ??= crypto.randomUUID();
    try {
      const data = await taskRequest({ method: editing ? "PATCH" : "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editing
          ? { action: "edit", id: editing.id, expectedVersion: editing.version, task: input }
          : { id: createId.current, planId, task: input }) });
      if (!data.task) throw new Error("저장된 할 일을 확인하지 못했어요.");
      setTasks(current => [data.task!, ...current.filter(task => task.id !== data.task!.id)]);
      setReviewRevision(value => value + 1);
      setNotice(editing ? "할 일을 수정했어요." : "할 일을 저장했어요."); clearForm();
    } catch (e) { setError(e instanceof Error ? e.message : "할 일을 저장하지 못했어요."); }
    finally { setSaving(false); }
  }
  async function toggle(task: StudyTask) {
    if (busyId) return;
    setBusyId(task.id); setError(""); setNotice("");
    try {
      const data = await taskRequest({ method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: task.completedAt ? "reopen" : "complete", id: task.id }) });
      if (!data.task) throw new Error("변경된 할 일을 확인하지 못했어요.");
      setTasks(current => current.map(item => item.id === task.id ? data.task! : item));
      setReviewRevision(value => value + 1);
      setNotice(task.completedAt ? "완료를 취소했어요." : "완료했어요.");
    } catch (e) { setError(e instanceof Error ? e.message : "상태를 바꾸지 못했어요."); }
    finally { setBusyId(null); }
  }
  async function remove(task: StudyTask) {
    if (busyId) return;
    setBusyId(task.id); setError(""); setNotice("");
    try {
      await taskRequest({ method: "DELETE", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: task.id, expectedVersion: task.version }) });
      setTasks(current => current.filter(item => item.id !== task.id));
      setReviewRevision(value => value + 1);
      if (editing?.id === task.id) clearForm();
      setNotice("할 일을 삭제했어요.");
    } catch (e) { setError(e instanceof Error ? e.message : "할 일을 삭제하지 못했어요."); }
    finally { setBusyId(null); }
  }

  return <><section className="task-section" aria-labelledby="task-title">
    <div className="section-heading"><span className="section-index">02</span><div><h2 id="task-title">할 일 다루기</h2><p>계획에 할 일을 붙이고, 실제로 끝낸 일은 완료로 표시하세요.</p></div></div>
    {!plans.length ? <p className="empty-copy">먼저 위에서 계획을 저장하면 할 일을 만들 수 있어요.</p> : <>
      <div className="task-plan-picker"><label htmlFor="task-plan">할 일을 넣을 계획</label><Select value={planId} onValueChange={value => { setPlanId(value); clearForm(); }}><SelectTrigger id="task-plan"><SelectValue placeholder="계획 선택" /></SelectTrigger><SelectContent>{plans.map(plan => <SelectItem value={plan.id} key={plan.id}>{plan.title}</SelectItem>)}</SelectContent></Select></div>
      <form id="task-form" className="task-form" onSubmit={save}><h3>{editing ? "할 일 수정" : "새 할 일"}</h3><fieldset disabled={saving}>
        <label htmlFor="task-name">할 일 이름</label><Input id="task-name" required maxLength={120} placeholder="예: 문법 2개 공부하고 문제 풀기" value={draft.title} onChange={e => update("title", e.target.value)} />
        <div className="task-field-grid"><div><label htmlFor="task-due">마감일 <span>(선택)</span></label><Input id="task-due" type="date" min="2000-01-01" max="2100-12-31" value={draft.dueDate ?? ""} onChange={e => update("dueDate", e.target.value || null)} /></div>
          <div><label htmlFor="task-priority">우선순위</label><Select value={draft.priority} onValueChange={value => update("priority", value as TaskInput["priority"])}><SelectTrigger id="task-priority"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(priorities).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div></div>
        <div className="task-field-grid"><div><label htmlFor="task-tags">태그 <span>(쉼표로 구분)</span></label><Input id="task-tags" placeholder="예: 문법, 문제풀이" value={tagText} onChange={e => setTagText(e.target.value)} /></div><div><label htmlFor="task-minutes">예상 시간 <span>(분)</span></label><Input id="task-minutes" type="number" min={1} max={100000} step={1} required value={Number.isNaN(draft.expectedMinutes) ? "" : draft.expectedMinutes} onChange={e => update("expectedMinutes", e.target.value === "" ? NaN : Number(e.target.value))} /></div></div>
        <div className="task-form-actions"><Button type="submit">{saving ? "저장 중…" : editing ? "수정 저장" : "할 일 추가"}</Button>{editing && <Button type="button" variant="ghost" onClick={clearForm}>수정 취소</Button>}</div>
      </fieldset></form>
      {error && <p className="message error" role="alert">{error} <Button type="button" variant="outline" onClick={() => setReloadKey(value => value + 1)}>목록 다시 불러오기</Button></p>}
      {notice && <p className="message success" role="status">{notice}</p>}
      <div className="task-list-head"><div><h3>저장한 할 일 <span>{tasks.length}</span></h3><p>미완료 {tasks.filter(task => !task.completedAt).length}개 · 완료 {tasks.filter(task => task.completedAt).length}개</p></div><Button type="button" variant="ghost" disabled={loading} onClick={() => { setReloadKey(value => value + 1); setReviewRevision(value => value + 1); }}>{loading ? "불러오는 중…" : "새로 불러오기"}</Button></div>
      <div className="task-controls"><div className="task-search"><Search size={17} aria-hidden="true" /><Input aria-label="할 일과 태그 검색" placeholder="할 일·태그 검색" value={search} onChange={e => setSearch(e.target.value)} /></div>
        <Select value={status} onValueChange={setStatus}><SelectTrigger aria-label="완료 상태 필터"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">전체 상태</SelectItem><SelectItem value="open">미완료</SelectItem><SelectItem value="done">완료</SelectItem></SelectContent></Select>
        <Select value={priorityFilter} onValueChange={setPriorityFilter}><SelectTrigger aria-label="우선순위 필터"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">전체 우선순위</SelectItem><SelectItem value="high">높음</SelectItem><SelectItem value="normal">보통</SelectItem><SelectItem value="low">낮음</SelectItem></SelectContent></Select>
        <Select value={sort} onValueChange={value => setSort(value as SortKey)}><SelectTrigger aria-label="정렬 기준"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(sortLabels).map(([value, label]) => <SelectItem value={value} key={value}>{label}</SelectItem>)}</SelectContent></Select></div>
      <p className="sort-note">정렬 기준: {sortLabels[sort]} · {visible.length}개 표시</p>
      {loading ? <p className="empty-copy" role="status">할 일을 불러오는 중이에요.</p> : !tasks.length ? <p className="empty-copy">아직 할 일이 없어요. 어휘·문법·독해·청해·주간 복습처럼 실제 할 일을 하나씩 넣어 보세요.</p> : !visible.length ? <p className="empty-copy">검색·필터 조건에 맞는 할 일이 없어요.</p> : <ul className="task-list">{visible.map(task => <li className={task.completedAt ? "task-card done" : "task-card"} key={task.id}>
        <div className="task-card-main"><span className="task-state">{task.completedAt ? "완료" : "진행 전"}</span><h3>{task.title}</h3><div className="task-facts"><span>{task.dueDate ? `마감 ${task.dueDate}` : "마감일 없음"}</span><span>{priorities[task.priority]} 우선순위</span><span><Clock3 size={15} aria-hidden="true" />예상 {task.expectedMinutes}분</span></div>{task.tags.length > 0 && <div className="task-tags">{task.tags.map(tag => <span key={tag}>#{tag}</span>)}</div>}</div>
        <div className="task-actions"><Button type="button" variant={task.completedAt ? "outline" : "default"} disabled={busyId !== null || saving} onClick={() => void toggle(task)}>{task.completedAt ? <RotateCcw size={16} /> : <Check size={16} />}{task.completedAt ? "완료 취소" : "완료"}</Button><Button type="button" variant="outline" disabled={busyId !== null || saving} onClick={() => edit(task)}><Pencil size={16} />수정</Button>
          <AlertDialog><AlertDialogTrigger asChild><Button type="button" variant="ghost" disabled={busyId !== null || saving}><Trash2 size={16} />삭제</Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>이 할 일을 삭제할까요?</AlertDialogTitle><AlertDialogDescription>목록에서 사라집니다. 저장된 계획은 유지됩니다.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>취소</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={() => void remove(task)}>삭제</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
        </div></li>)}</ul>}
    </>}
  </section><StudyLogManager key={planId} planId={planId} tasks={tasks} onChanged={() => setReviewRevision(value => value + 1)} />
    <ReviewManager key={`review-${planId}`} planId={planId} plans={plans} revision={reviewRevision} /></>;
}
