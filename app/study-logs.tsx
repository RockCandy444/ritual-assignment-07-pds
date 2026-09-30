"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Clock3, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { validateStudyLog, type StudyLog, type StudyLogInput } from "@/lib/study-log";
import type { StudyTask } from "@/lib/task";

type Draft = { taskId: string; startedAt: string; endedAt: string; actualMinutes: number; studiedContent: string; blockerReason: string };
const blank: Draft = { taskId: "", startedAt: "", endedAt: "", actualMinutes: 30, studiedContent: "", blockerReason: "" };
const localTime = (iso: string) => new Date(Date.parse(iso) + 9 * 60 * 60 * 1000).toISOString().slice(0, 16);
const showTime = (iso: string) => new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));

async function logRequest(options: RequestInit, query = "") {
  const response = await fetch(`/api/study-logs${query}`, { cache: "no-store", ...options });
  const body = await response.json() as { error?: string; log?: StudyLog; logs?: StudyLog[] };
  if (!response.ok) throw new Error(body.error || "공부 기록을 처리하지 못했어요.");
  return body;
}

export default function StudyLogManager({ planId, tasks, onChanged }: { planId: string; tasks: StudyTask[]; onChanged?: () => void }) {
  const [logs, setLogs] = useState<StudyLog[]>([]);
  const [draft, setDraft] = useState<Draft>(blank);
  const [editing, setEditing] = useState<StudyLog | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const createId = useRef<string | null>(null);

  useEffect(() => {
    if (!planId) { setLogs([]); return; }
    let active = true;
    setLoading(true); setError("");
    void logRequest({}, `?planId=${encodeURIComponent(planId)}`)
      .then(data => { if (active) setLogs(data.logs ?? []); })
      .catch(e => { if (active) setError(e instanceof Error ? e.message : "공부 기록을 불러오지 못했어요."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [planId, reloadKey]);

  function clearForm() { setDraft(blank); setEditing(null); createId.current = null; }
  function edit(log: StudyLog) {
    setEditing(log);
    setDraft({ taskId: log.taskId, startedAt: localTime(log.startedAt), endedAt: localTime(log.endedAt),
      actualMinutes: log.actualMinutes, studiedContent: log.studiedContent, blockerReason: log.blockerReason ?? "" });
    setError(""); setNotice("");
    document.getElementById("study-log-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  function update<K extends keyof Draft>(key: K, value: Draft[K]) { setDraft(current => ({ ...current, [key]: value })); setNotice(""); }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!planId || saving) return;
    setError(""); setNotice("");
    let input: StudyLogInput;
    try {
      input = validateStudyLog({ taskId: draft.taskId,
        startedAt: new Date(`${draft.startedAt}:00+09:00`).toISOString(),
        endedAt: new Date(`${draft.endedAt}:00+09:00`).toISOString(),
        actualMinutes: draft.actualMinutes, studiedContent: draft.studiedContent,
        blockerReason: draft.blockerReason });
    } catch (e) { setError(e instanceof Error ? e.message : "입력한 시각과 내용을 확인해 주세요."); return; }
    setSaving(true); createId.current ??= crypto.randomUUID();
    try {
      const data = await logRequest({ method: editing ? "PATCH" : "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editing
          ? { id: editing.id, planId, expectedVersion: editing.version, log: input }
          : { id: createId.current, planId, log: input }) });
      if (!data.log) throw new Error("저장한 기록을 확인하지 못했어요.");
      setLogs(current => [data.log!, ...current.filter(log => log.id !== data.log!.id)]
        .sort((a, b) => b.startedAt.localeCompare(a.startedAt) || b.id.localeCompare(a.id)));
      onChanged?.();
      setNotice(editing ? "공부 기록을 수정했어요." : "공부 기록을 저장했어요."); clearForm();
    } catch (e) { setError(e instanceof Error ? e.message : "공부 기록을 저장하지 못했어요."); }
    finally { setSaving(false); }
  }
  async function remove(log: StudyLog) {
    if (busyId) return;
    setBusyId(log.id); setError(""); setNotice("");
    try {
      await logRequest({ method: "DELETE", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: log.id, planId, expectedVersion: log.version }) });
      setLogs(current => current.filter(item => item.id !== log.id));
      onChanged?.();
      if (editing?.id === log.id) clearForm();
      setNotice("공부 기록을 삭제했어요.");
    } catch (e) { setError(e instanceof Error ? e.message : "공부 기록을 삭제하지 못했어요."); }
    finally { setBusyId(null); }
  }

  const visibleLogs = logs.filter(log => tasks.some(task => task.id === log.taskId));
  const taskNames = new Map(tasks.map(task => [task.id, task.title]));
  return <section className="log-section" aria-labelledby="log-title">
    <div className="section-heading"><span className="section-index">03</span><div><h2 id="log-title">실제 공부 기록</h2><p>공부한 뒤 연결할 할 일과 실제 시간을 남겨 보세요.</p></div></div>
    {!planId ? <p className="empty-copy">계획을 저장하면 공부 기록을 남길 수 있어요.</p> : <>
      <p className="log-plan-note">현재 선택한 계획의 할 일에 기록합니다. 시간은 서울 기준입니다.</p>
      <form id="study-log-form" className="task-form" onSubmit={save}><h3>{editing ? "공부 기록 수정" : "새 공부 기록"}</h3><fieldset disabled={saving || !tasks.length}>
        <label htmlFor="log-task">연결할 할 일</label><Select value={draft.taskId} onValueChange={value => update("taskId", value)}><SelectTrigger id="log-task"><SelectValue placeholder="할 일을 선택하세요" /></SelectTrigger><SelectContent>{tasks.map(task => <SelectItem value={task.id} key={task.id}>{task.title}</SelectItem>)}</SelectContent></Select>
        <div className="task-field-grid"><div><label htmlFor="log-start">시작 시각</label><Input id="log-start" type="datetime-local" required value={draft.startedAt} onChange={e => update("startedAt", e.target.value)} /></div><div><label htmlFor="log-end">종료 시각</label><Input id="log-end" type="datetime-local" required value={draft.endedAt} onChange={e => update("endedAt", e.target.value)} /></div></div>
        <label htmlFor="log-minutes">실제로 공부한 시간 <span>(분)</span></label><Input id="log-minutes" type="number" min={1} max={100000} step={1} required value={Number.isNaN(draft.actualMinutes) ? "" : draft.actualMinutes} onChange={e => update("actualMinutes", e.target.value === "" ? NaN : Number(e.target.value))} />
        <label htmlFor="log-content">공부한 범위와 내용</label><Textarea id="log-content" required maxLength={2000} rows={3} placeholder="예: 교재 N2 문법 2개, 예문과 틀린 문제 정리" value={draft.studiedContent} onChange={e => update("studiedContent", e.target.value)} />
        <label htmlFor="log-blocker">막힌 이유 <span>(선택)</span></label><Textarea id="log-blocker" maxLength={1000} rows={2} placeholder="없으면 비워 두세요" value={draft.blockerReason} onChange={e => update("blockerReason", e.target.value)} />
        <div className="task-form-actions"><Button type="submit">{saving ? "저장 중…" : editing ? "수정 저장" : "기록 저장"}</Button>{editing && <Button type="button" variant="ghost" onClick={clearForm}>수정 취소</Button>}</div>
      </fieldset></form>
      {!tasks.length && <p className="empty-copy">이 계획에는 할 일이 없어요. 위에서 할 일을 먼저 추가해 주세요.</p>}
      {error && <p className="message error" role="alert">{error} <Button type="button" variant="outline" onClick={() => setReloadKey(value => value + 1)}>기록 다시 불러오기</Button></p>}
      {notice && <p className="message success" role="status">{notice}</p>}
      <div className="task-list-head"><div><h3>저장한 기록 <span>{visibleLogs.length}</span></h3><p>실제 공부 {visibleLogs.reduce((sum, log) => sum + log.actualMinutes, 0)}분</p></div><Button type="button" variant="ghost" disabled={loading} onClick={() => { setReloadKey(value => value + 1); onChanged?.(); }}>{loading ? "불러오는 중…" : "새로 불러오기"}</Button></div>
      {loading ? <p className="empty-copy" role="status">공부 기록을 불러오는 중이에요.</p> : !visibleLogs.length ? <p className="empty-copy">아직 실제 공부 기록이 없어요. 공부한 뒤 시작·종료 시각과 내용을 남겨 보세요.</p> : <ul className="log-list">{visibleLogs.map(log => <li className="log-card" key={log.id}>
        <div><span className="log-date">{showTime(log.startedAt)} ~ {showTime(log.endedAt)}</span><h3>{taskNames.get(log.taskId)}</h3><p className="log-content">{log.studiedContent}</p><p className="log-duration"><Clock3 size={15} aria-hidden="true" /> 실제 {log.actualMinutes}분</p>{log.blockerReason && <p className="log-blocker">막힌 이유: {log.blockerReason}</p>}</div>
        <div className="task-actions"><Button type="button" variant="outline" disabled={busyId !== null || saving} onClick={() => edit(log)}><Pencil size={16} />수정</Button>
          <AlertDialog><AlertDialogTrigger asChild><Button type="button" variant="ghost" disabled={busyId !== null || saving}><Trash2 size={16} />삭제</Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>이 공부 기록을 삭제할까요?</AlertDialogTitle><AlertDialogDescription>기록 목록과 실제 시간 합계에서 빠집니다.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>취소</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={() => void remove(log)}>삭제</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
        </div></li>)}</ul>}
    </>}
  </section>;
}
