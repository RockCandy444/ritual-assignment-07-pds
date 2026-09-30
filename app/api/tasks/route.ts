import { createTask, deleteTask, getTask, listTasks, setTaskCompleted, updateTask } from "@/db/tasks";
import { taskIdPattern, validateTask } from "@/lib/task";

export const dynamic = "force-dynamic";
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
const validVersion = (value: unknown) => Number.isSafeInteger(value) && (value as number) > 0;

async function readBody(request: Request): Promise<Record<string, unknown>> {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) throw new Error("허용되지 않은 요청입니다.");
  if (!request.headers.get("content-type")?.includes("application/json")) throw new Error("JSON 요청이 필요합니다.");
  const raw = await request.text();
  if (raw.length > 12000) throw new Error("입력 내용이 너무 깁니다.");
  const body: unknown = JSON.parse(raw);
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("요청 내용을 확인해 주세요.");
  return body as Record<string, unknown>;
}

export async function GET(request: Request) {
  const planId = new URL(request.url).searchParams.get("planId");
  if (!planId || !taskIdPattern.test(planId)) return json({ error: "올바른 계획 ID가 필요합니다." }, 400);
  try { return json({ tasks: await listTasks(planId) }); }
  catch { console.error("Task read failed"); return json({ error: "할 일을 불러오지 못했어요." }, 503); }
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  let input;
  try {
    body = await readBody(request);
    if (typeof body.id !== "string" || !taskIdPattern.test(body.id) ||
      typeof body.planId !== "string" || !taskIdPattern.test(body.planId)) throw new Error("할 일과 계획 ID를 확인해 주세요.");
    input = validateTask(body.task);
  } catch (error) { return json({ error: error instanceof Error ? error.message : "입력을 확인해 주세요." }, 400); }
  try {
    const task = await createTask(body.id as string, body.planId as string, input);
    return task ? json({ task }, 201) : json({ error: "계획이 없거나 이미 저장된 할 일입니다. 목록을 새로 불러와 주세요." }, 409);
  } catch { console.error("Task create failed"); return json({ error: "할 일을 저장하지 못했어요." }, 503); }
}

export async function PATCH(request: Request) {
  let body: Record<string, unknown>;
  let input;
  try {
    body = await readBody(request);
    if (typeof body.id !== "string" || !taskIdPattern.test(body.id)) throw new Error("할 일 ID를 확인해 주세요.");
    if (body.action !== "edit" && body.action !== "complete" && body.action !== "reopen") throw new Error("할 일 변경 방식을 확인해 주세요.");
    if (body.action === "edit") {
      if (!validVersion(body.expectedVersion)) throw new Error("수정 번호를 확인해 주세요.");
      input = validateTask(body.task);
    }
  } catch (error) { return json({ error: error instanceof Error ? error.message : "입력을 확인해 주세요." }, 400); }
  try {
    const id = body.id as string;
    const task = body.action === "edit"
      ? await updateTask(id, body.expectedVersion as number, input!)
      : await setTaskCompleted(id, body.action === "complete");
    if (task) return json({ task });
    return json({ error: body.action === "edit" ? "다른 창에서 바뀐 할 일이에요. 새로 불러와 주세요." : "할 일을 찾을 수 없어요." }, body.action === "edit" ? 409 : 404);
  } catch { console.error("Task update failed"); return json({ error: "할 일을 변경하지 못했어요." }, 503); }
}

export async function DELETE(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await readBody(request);
    if (typeof body.id !== "string" || !taskIdPattern.test(body.id) || !validVersion(body.expectedVersion))
      throw new Error("할 일 ID와 수정 번호를 확인해 주세요.");
  } catch (error) { return json({ error: error instanceof Error ? error.message : "입력을 확인해 주세요." }, 400); }
  try {
    const deleted = await deleteTask(body.id as string, body.expectedVersion as number);
    if (deleted) return json({ deleted: true });
    return json({ error: (await getTask(body.id as string)) ? "다른 창에서 바뀐 할 일이에요. 새로 불러와 주세요." : "이미 삭제된 할 일이에요." }, 409);
  } catch { console.error("Task delete failed"); return json({ error: "할 일을 삭제하지 못했어요." }, 503); }
}
