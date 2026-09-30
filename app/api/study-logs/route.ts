import { createStudyLog, deleteStudyLog, getStudyLog, listStudyLogs, updateStudyLog } from "@/db/study-logs";
import { validateStudyLog } from "@/lib/study-log";
import { taskIdPattern } from "@/lib/task";

export const dynamic = "force-dynamic";
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
const validId = (value: unknown): value is string => typeof value === "string" && taskIdPattern.test(value);
const validVersion = (value: unknown) => Number.isSafeInteger(value) && (value as number) > 0;

async function readBody(request: Request): Promise<Record<string, unknown>> {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) throw new Error("허용되지 않은 요청입니다.");
  if (!request.headers.get("content-type")?.includes("application/json")) throw new Error("JSON 요청이 필요합니다.");
  const raw = await request.text();
  if (raw.length > 16000) throw new Error("입력 내용이 너무 깁니다.");
  const body: unknown = JSON.parse(raw);
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("요청 내용을 확인해 주세요.");
  return body as Record<string, unknown>;
}

export async function GET(request: Request) {
  const planId = new URL(request.url).searchParams.get("planId");
  if (!validId(planId)) return json({ error: "올바른 계획 ID가 필요합니다." }, 400);
  try { return json({ logs: await listStudyLogs(planId) }); }
  catch { console.error("Study log read failed"); return json({ error: "공부 기록을 불러오지 못했어요." }, 503); }
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  let input;
  try {
    body = await readBody(request);
    if (!validId(body.id) || !validId(body.planId)) throw new Error("기록과 계획 ID를 확인해 주세요.");
    input = validateStudyLog(body.log);
  } catch (error) { return json({ error: error instanceof Error ? error.message : "입력을 확인해 주세요." }, 400); }
  try {
    const log = await createStudyLog(body.id as string, body.planId as string, input);
    return log ? json({ log }, 201) : json({ error: "연결할 할 일이 없거나 이미 저장된 기록입니다. 새로 불러와 주세요." }, 409);
  } catch { console.error("Study log create failed"); return json({ error: "공부 기록을 저장하지 못했어요." }, 503); }
}

export async function PATCH(request: Request) {
  let body: Record<string, unknown>;
  let input;
  try {
    body = await readBody(request);
    if (!validId(body.id) || !validId(body.planId) || !validVersion(body.expectedVersion))
      throw new Error("기록 ID와 수정 번호를 확인해 주세요.");
    input = validateStudyLog(body.log);
  } catch (error) { return json({ error: error instanceof Error ? error.message : "입력을 확인해 주세요." }, 400); }
  try {
    const log = await updateStudyLog(body.id as string, body.planId as string, body.expectedVersion as number, input);
    return log ? json({ log }) : json({ error: "다른 창에서 기록이 바뀌었거나 연결할 할 일이 없어요. 새로 불러와 주세요." }, 409);
  } catch { console.error("Study log update failed"); return json({ error: "공부 기록을 수정하지 못했어요." }, 503); }
}

export async function DELETE(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await readBody(request);
    if (!validId(body.id) || !validId(body.planId) || !validVersion(body.expectedVersion))
      throw new Error("기록 ID와 수정 번호를 확인해 주세요.");
  } catch (error) { return json({ error: error instanceof Error ? error.message : "입력을 확인해 주세요." }, 400); }
  try {
    if (await deleteStudyLog(body.id as string, body.planId as string, body.expectedVersion as number)) return json({ deleted: true });
    return json({ error: (await getStudyLog(body.id as string)) ? "다른 창에서 기록이 바뀌었어요. 새로 불러와 주세요." : "이미 삭제된 기록이에요." }, 409);
  } catch { console.error("Study log delete failed"); return json({ error: "공부 기록을 삭제하지 못했어요." }, 503); }
}
