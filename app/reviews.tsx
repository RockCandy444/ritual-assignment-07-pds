"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Clock3, ListChecks } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { PlanVersion } from "@/lib/plan";
import type { IncomingImprovement, PlanReview, ReviewSummary } from "@/lib/review";
import type { StudyLog } from "@/lib/study-log";
import type { StudyTask } from "@/lib/task";

type ReviewData = { summary: ReviewSummary; tasks: StudyTask[]; logs: StudyLog[];
  review: PlanReview | null; incoming: IncomingImprovement[]; todayInSeoul: string };
type Metric = "planned" | "completed" | "overdue" | "blocked" | "expected" | "actual" | "difference";
const metricLabels: Record<Metric, string> = { planned: "계획한 할 일", completed: "완료한 할 일", overdue: "지연된 할 일",
  blocked: "막힌 할 일", expected: "예상 시간", actual: "실제 시간", difference: "시간 차이" };
const showTime = (iso: string) => new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));

async function reviewRequest(options: RequestInit, query = "") {
  const response = await fetch(`/api/reviews${query}`, { cache: "no-store", ...options });
  const body = await response.json() as ReviewData & { error?: string };
  if (!response.ok) throw new Error(body.error || "돌아보기를 처리하지 못했어요.");
  return body;
}

export default function ReviewManager({ planId, plans, revision }: { planId: string; plans: PlanVersion[]; revision: number }) {
  const [data, setData] = useState<ReviewData | null>(null);
  const [activeMetric, setActiveMetric] = useState<Metric>("planned");
  const [targetId, setTargetId] = useState("");
  const [improvement, setImprovement] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!planId) { setData(null); return; }
    let active = true;
    setLoading(true); setError("");
    void reviewRequest({}, `?planId=${encodeURIComponent(planId)}`)
      .then(result => {
        if (!active) return;
        setData(result);
        setTargetId(result.review?.nextPlanId ?? "");
        setImprovement(result.review?.improvement ?? "");
      })
      .catch(e => { if (active) setError(e instanceof Error ? e.message : "돌아보기를 불러오지 못했어요."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [planId, revision, reloadKey]);

  const currentPlan = plans.find(plan => plan.id === planId);
  const nextPlans = plans.filter(plan => plan.id !== planId && !!currentPlan && plan.startDate >= currentPlan.endDate)
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
  const taskNames = new Map(data?.tasks.map(task => [task.id, task.title]) ?? []);
  const blockedIds = new Set(data?.logs.filter(log => !!log.blockerReason?.trim()).map(log => log.taskId) ?? []);
  const evidenceTasks = data?.tasks.filter(task => {
    if (activeMetric === "completed") return !!task.completedAt;
    if (activeMetric === "overdue") return !task.completedAt && !!task.dueDate && task.dueDate < data.todayInSeoul;
    if (activeMetric === "blocked") return blockedIds.has(task.id);
    return true;
  }) ?? [];
  const evidenceLogs = data?.logs.filter(log => taskNames.has(log.taskId)) ?? [];

  function selectMetric(metric: Metric) {
    setActiveMetric(metric);
    requestAnimationFrame(() => document.getElementById("review-evidence")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!data || saving) return;
    setError(""); setNotice("");
    if (!targetId || !improvement.trim()) { setError("다음 계획과 개선점 한 가지를 입력해 주세요."); return; }
    setSaving(true);
    try {
      const response = await reviewRequest({ method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId, expectedVersion: data.review?.version ?? 0,
          review: { nextPlanId: targetId, improvement } }) });
      if (!response.review) throw new Error("저장된 개선점을 확인하지 못했어요.");
      setData(current => current ? { ...current, review: response.review } : current);
      setImprovement(response.review.improvement);
      setNotice("개선점을 다음 계획에 연결했어요.");
    } catch (e) { setError(e instanceof Error ? e.message : "개선점을 저장하지 못했어요."); }
    finally { setSaving(false); }
  }

  const summary = data?.summary;
  const metrics: { key: Metric; value: string; note: string }[] = summary ? [
    { key: "planned", value: `${summary.planned}개`, note: "삭제되지 않은 할 일" },
    { key: "completed", value: `${summary.completed}개`, note: "현재 완료 상태" },
    { key: "overdue", value: `${summary.overdue}개`, note: "마감일이 지난 미완료" },
    { key: "blocked", value: `${summary.blocked}개`, note: "막힌 이유가 있는 할 일" },
    { key: "expected", value: `${summary.expectedMinutes}분`, note: "할 일 예상 시간 합계" },
    { key: "actual", value: `${summary.actualMinutes}분`, note: "공부 기록 시간 합계" },
    { key: "difference", value: `${summary.differenceMinutes > 0 ? "+" : ""}${summary.differenceMinutes}분`, note: "실제 − 예상" },
  ] : [];

  return <section className="review-section" aria-labelledby="review-title">
    <div className="section-heading"><span className="section-index">04</span><div><h2 id="review-title">돌아보기</h2><p>숫자를 누르면 그 숫자를 만든 할 일과 공부 기록을 볼 수 있어요.</p></div></div>
    {!planId ? <p className="empty-copy">계획을 저장하면 돌아보기를 볼 수 있어요.</p> : <>
      <div className="review-heading"><p>{currentPlan?.title ?? "선택한 계획"} · {data?.todayInSeoul ?? ""} 서울 기준</p><Button type="button" variant="ghost" disabled={loading} onClick={() => setReloadKey(value => value + 1)}>{loading ? "불러오는 중…" : "새로 불러오기"}</Button></div>
      {error && <p role="alert" className="message error">{error}</p>}
      {notice && <p role="status" className="message success">{notice}</p>}
      {loading && !data ? <p className="empty-copy" role="status">돌아보기를 불러오는 중이에요.</p> : summary && <>
        <div className="review-metrics">{metrics.map(metric => <button className={activeMetric === metric.key ? "review-metric active" : "review-metric"}
          type="button" key={metric.key} aria-pressed={activeMetric === metric.key} onClick={() => selectMetric(metric.key)}>
          <span>{metricLabels[metric.key]}</span><strong>{metric.value}</strong><small>{metric.note}</small></button>)}</div>
        {data.logs.some(log => log.studiedContent.includes("[테스트]") || log.studiedContent.includes("[수정 테스트]")) &&
          <p className="review-test-note">테스트로 표시한 기록도 실제 시간과 막힘 집계에 포함됩니다.</p>}
        <div id="review-evidence" className="review-evidence" tabIndex={-1}>
          <div className="review-evidence-head"><ListChecks size={18} aria-hidden="true" /><h3>{metricLabels[activeMetric]}의 근거</h3></div>
          {activeMetric === "actual" ? !evidenceLogs.length ? <p className="empty-copy">아직 연결된 공부 기록이 없어요.</p> :
            <ul>{evidenceLogs.map(log => <li key={log.id}><div><strong>{taskNames.get(log.taskId)}</strong><span>{showTime(log.startedAt)} · 실제 {log.actualMinutes}분</span></div><p>{log.studiedContent}</p>{log.blockerReason && <p>막힌 이유: {log.blockerReason}</p>}</li>)}</ul>
          : !evidenceTasks.length ? <p className="empty-copy">해당하는 할 일이 없어요.</p> :
            <ul>{evidenceTasks.map(task => {
              const taskLogs = evidenceLogs.filter(log => log.taskId === task.id);
              const actual = taskLogs.reduce((sum, log) => sum + log.actualMinutes, 0);
              return <li key={task.id}><div><strong>{task.title}</strong><span>{task.completedAt ? "완료" : "미완료"}{task.dueDate ? ` · 마감 ${task.dueDate}` : ""}</span></div>
                <p className="review-time"><Clock3 size={14} aria-hidden="true" />예상 {task.expectedMinutes}분 · 실제 {actual}분
                  {(activeMetric === "difference") && <span className="review-difference"> · 차이 {actual - task.expectedMinutes > 0 ? "+" : ""}{actual - task.expectedMinutes}분</span>}</p>
                {activeMetric === "blocked" && taskLogs.filter(log => !!log.blockerReason).map(log => <p key={log.id}>막힌 이유: {log.blockerReason}</p>)}
              </li>;
            })}</ul>}
        </div>
        {data.incoming.length > 0 && <div className="review-incoming"><h3>이전 계획에서 가져온 개선점</h3>{data.incoming.map(item =>
          <p key={item.planId}><span>{item.sourceTitle}</span>{item.improvement}</p>)}</div>}
        <form className="review-form" onSubmit={save}><h3>다음 계획에 남길 개선점 한 가지</h3>
          {!nextPlans.length ? <p>뒤에 이어지는 계획이 아직 없어요. 다음 계획을 만든 뒤 연결할 수 있어요.</p> : <fieldset disabled={saving}>
            <label htmlFor="review-next-plan">다음 계획</label><Select value={targetId} onValueChange={setTargetId}><SelectTrigger id="review-next-plan"><SelectValue placeholder="계획을 선택하세요" /></SelectTrigger><SelectContent>{nextPlans.map(plan => <SelectItem key={plan.id} value={plan.id}>{plan.title} · {plan.startDate}</SelectItem>)}</SelectContent></Select>
            <label htmlFor="review-improvement">개선점</label><Textarea id="review-improvement" required maxLength={1000} rows={3} placeholder="예: 새 단어는 다음날 한 번 더 복습하기" value={improvement} onChange={e => setImprovement(e.target.value)} />
            <div className="task-form-actions"><Button type="submit" disabled={!targetId || !improvement.trim()}>{saving ? "저장 중…" : data.review ? "개선점 수정" : "다음 계획에 연결"}</Button></div>
          </fieldset>}
        </form>
      </>}
    </>}
  </section>;
}
