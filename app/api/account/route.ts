import { protectedRoute } from "@/lib/protected-route";
import { getAuth } from "@/lib/auth";
import { eraseDiary } from "@/db/ownership";
export const dynamic = "force-dynamic";
export const DELETE = protectedRoute(async (request, userId) => {
  if (!request.headers.get("content-type")?.includes("application/json")) return Response.json({ error: "JSON 요청이 필요합니다." }, { status: 415 });
  const raw = await request.text();
  if (raw.length > 4096) return Response.json({ error: "입력이 너무 깁니다." }, { status: 413 });
  let body: { password?: unknown };
  try { body = JSON.parse(raw); } catch { return Response.json({ error: "입력을 확인해 주세요." }, { status: 400 }); }
  if (!body || typeof body.password !== "string" || !body.password || body.password.length > 128) return Response.json({ error: "현재 비밀번호를 입력해 주세요." }, { status: 400 });
  try {
    const checked = await getAuth().api.verifyPassword({ headers: request.headers, body: { password: body.password } });
    if (!checked.status) return Response.json({ error: "비밀번호를 확인해 주세요." }, { status: 401 });
  } catch { return Response.json({ error: "비밀번호를 확인해 주세요." }, { status: 401 }); }
  await eraseDiary(userId, true);
  const logout = await getAuth().api.signOut({ headers: request.headers, asResponse: true });
  return new Response(JSON.stringify({ deleted: true }), { headers: logout.headers });
});
