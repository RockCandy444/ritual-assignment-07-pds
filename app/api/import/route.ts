import { protectedRoute } from "@/lib/protected-route";
import { importDiary, ImportRejected } from "@/db/import";
export const dynamic = "force-dynamic";
export const POST = protectedRoute(async (request, userId) => {
  if (!request.headers.get("content-type")?.includes("application/json")) return Response.json({ error: "JSON 요청이 필요합니다." }, { status: 415 });
  const raw = await request.text();
  if (new TextEncoder().encode(raw).length > 262144) return Response.json({ error: "파일은 256KB 이하여야 해요." }, { status: 413 });
  let payload: unknown;
  try { payload = JSON.parse(raw); } catch { return Response.json({ error: "JSON 파일을 확인해 주세요." }, { status: 400 }); }
  try { return Response.json(await importDiary(payload, userId), { status: 201, headers: { "Cache-Control": "no-store" } }); }
  catch (error) {
    return Response.json({ error: error instanceof ImportRejected ? error.message : "백업 파일의 항목과 연결을 확인해 주세요." }, { status: 409, headers: { "Cache-Control": "no-store" } });
  }
});
