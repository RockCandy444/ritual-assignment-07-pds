import { history, listPlans, savePlan } from "@/db/plans";
import { validatePlan } from "@/lib/plan";
import { protectedRoute } from "@/lib/protected-route";
import { AccessDenied, requirePlanOwner, requirePlanOwnerIfExists } from "@/db/ownership";
export const dynamic = "force-dynamic";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
async function get(request: Request, userId: string) {
  const id = new URL(request.url).searchParams.get("id");
  if (id && !uuid.test(id)) return json({ error: "올바르지 않은 계획 ID입니다." }, 400);
  try { if (id) await requirePlanOwner(id, userId); return json(id ? { versions: await history(id, userId) } : { plans: await listPlans(userId) }); }
  catch (error) { if (error instanceof AccessDenied) throw error; console.error("Plan read failed"); return json({ error: "계획을 불러오지 못했어요. 잠시 후 다시 시도해 주세요." }, 503); }
}
async function post(request: Request, userId: string) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return json({ error: "허용되지 않은 요청입니다." }, 403);
  if (!request.headers.get("content-type")?.includes("application/json")) return json({ error: "JSON 요청이 필요합니다." }, 415);
  let body;
  try {
    const raw = await request.text();
    if (raw.length > 12000) return json({ error: "입력 내용이 너무 깁니다." }, 413);
    body = JSON.parse(raw);
  } catch { return json({ error: "계획 입력을 확인해 주세요." }, 400); }
  let input;
  try {
    if (!body || typeof body.id !== "string" || !uuid.test(body.id) || !Number.isSafeInteger(body.expectedVersion) || body.expectedVersion < 0)
      throw new Error("계획 ID와 수정 번호를 확인해 주세요.");
    input = validatePlan(body.plan);
  } catch (error) { return json({ error: error instanceof Error ? error.message : "입력을 확인해 주세요." }, 400); }
  try {
    await requirePlanOwnerIfExists(body.id, userId);
    const plan = await savePlan(body.id, body.expectedVersion, input, userId);
    if (!plan) return json({ error: "이미 저장되었거나 다른 창에서 수정된 계획이에요. 입력 내용을 복사해 둔 뒤 ‘저장된 계획 다시 불러오기’를 눌러 확인해 주세요." }, 409);
    return json({ plan }, 201);
  } catch (error) { if (error instanceof AccessDenied) throw error; console.error("Plan write failed"); return json({ error: "저장하지 못했어요. 입력 내용은 유지되니 잠시 후 다시 시도해 주세요." }, 503); }
}
export const GET = protectedRoute(get);
export const POST = protectedRoute(post);
