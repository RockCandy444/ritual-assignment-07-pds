import { getReview, incomingImprovements, saveReview } from "@/db/reviews";
import { listStudyLogs } from "@/db/study-logs";
import { listTasks } from "@/db/tasks";
import { summarizeReview, validateReview } from "@/lib/review";
import { taskIdPattern } from "@/lib/task";
import { protectedRoute } from "@/lib/protected-route";
import { AccessDenied, requirePlanOwner } from "@/db/ownership";

export const dynamic = "force-dynamic";
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
const validId = (value: unknown): value is string => typeof value === "string" && taskIdPattern.test(value);

async function get(request: Request, userId: string) {
  const planId = new URL(request.url).searchParams.get("planId");
  if (!validId(planId)) return json({ error: "올바른 계획 ID가 필요합니다." }, 400);
  try {
    await requirePlanOwner(planId, userId);
    const [tasks, logs, review, incoming] = await Promise.all([
      listTasks(planId, userId), listStudyLogs(planId, userId), getReview(planId, userId), incomingImprovements(planId, userId),
    ]);
    const todayInSeoul = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
    return json({ summary: summarizeReview(tasks, logs, todayInSeoul), tasks, logs, review, incoming, todayInSeoul });
  } catch (error) { if (error instanceof AccessDenied) throw error; console.error("Review read failed"); return json({ error: "돌아보기를 불러오지 못했어요." }, 503); }
}

async function post(request: Request, userId: string) {
  let body: Record<string, unknown>;
  let input;
  try {
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin) throw new Error("허용되지 않은 요청입니다.");
    if (!request.headers.get("content-type")?.includes("application/json")) throw new Error("JSON 요청이 필요합니다.");
    const raw = await request.text();
    if (raw.length > 4000) throw new Error("입력 내용이 너무 깁니다.");
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("요청 내용을 확인해 주세요.");
    body = parsed as Record<string, unknown>;
    if (!validId(body.planId) || !Number.isSafeInteger(body.expectedVersion) || (body.expectedVersion as number) < 0)
      throw new Error("계획 ID와 수정 번호를 확인해 주세요.");
    input = validateReview(body.review, body.planId);
  } catch (error) { return json({ error: error instanceof Error ? error.message : "입력을 확인해 주세요." }, 400); }
  try {
    await requirePlanOwner(body.planId as string, userId);
    await requirePlanOwner(input.nextPlanId, userId);
    const review = await saveReview(body.planId as string, body.expectedVersion as number, input, userId);
    return review ? json({ review }, body.expectedVersion === 0 ? 201 : 200)
      : json({ error: "다음 계획의 기간을 확인하거나 새로 불러와 주세요." }, 409);
  } catch (error) { if (error instanceof AccessDenied) throw error; console.error("Review save failed"); return json({ error: "개선점을 저장하지 못했어요." }, 503); }
}
export const GET = protectedRoute(get);
export const POST = protectedRoute(post);
