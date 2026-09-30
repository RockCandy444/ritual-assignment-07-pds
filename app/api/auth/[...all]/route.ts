import { getAuth } from "@/lib/auth";
import { env } from "cloudflare:workers";

export const dynamic = "force-dynamic";
const paths = new Set(["sign-up/email", "sign-in/email", "sign-out", "get-session", "change-password"]);
async function handle(request: Request) {
  const url = new URL(request.url);
  const action = url.pathname.replace(/^\/api\/auth\//, "");
  if (!paths.has(action)) return Response.json({ error: "지원하지 않는 요청입니다." }, { status: 404 });
  try {
    if (action === "sign-out" && request.method === "POST") {
      const origin = request.headers.get("origin");
      if (origin && origin !== url.origin) return Response.json({ error: "허용되지 않은 요청입니다." }, { status: 403 });
      if (request.headers.get("sec-fetch-site") === "cross-site") return Response.json({ error: "허용되지 않은 요청입니다." }, { status: 403 });
      const session = await getAuth().api.getSession({ headers: request.headers, query: { disableCookieCache: true } });
      if (session) {
        if (!env.DB) throw new Error("Database unavailable");
        await env.DB.prepare("DELETE FROM auth_session WHERE id = ? AND user_id = ?").bind(session.session.id, session.user.id).run();
      }
    }
    // A password change revokes every previously issued session, including this browser.
    if (action === "change-password" && request.method === "POST") {
      if (!request.headers.get("content-type")?.includes("application/json")) return Response.json({ error: "JSON 요청이 필요합니다." }, { status: 415 });
      const origin = request.headers.get("origin");
      if (origin && origin !== url.origin) return Response.json({ error: "허용되지 않은 요청입니다." }, { status: 403 });
      if (request.headers.get("sec-fetch-site") === "cross-site") return Response.json({ error: "허용되지 않은 요청입니다." }, { status: 403 });
      const raw = await request.text();
      if (raw.length > 4096) return Response.json({ error: "입력이 너무 깁니다." }, { status: 413 });
      const body = JSON.parse(raw);
      const session = await getAuth().api.getSession({ headers: request.headers, query: { disableCookieCache: true } });
      if (!session) return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
      const result = await getAuth().api.changePassword({ headers: request.headers,
        body: { currentPassword: body.currentPassword, newPassword: body.newPassword, revokeOtherSessions: true }, asResponse: true });
      if (!result.ok) return result;
      if (!env.DB) throw new Error("Database unavailable");
      await env.DB.prepare("DELETE FROM auth_session WHERE user_id = ?").bind(session.user.id).run();
      const logout = await getAuth().api.signOut({ headers: request.headers, asResponse: true });
      return new Response(JSON.stringify({ success: true }), { headers: logout.headers });
    }
    const response = await getAuth().handler(request);
    if (response.status === 429 && response.headers.has("X-Retry-After")) {
      response.headers.set("Retry-After", response.headers.get("X-Retry-After")!);
    }
    if (action === "sign-in/email" && !response.ok && response.status !== 429) {
      return Response.json({ error: "이메일 또는 비밀번호를 확인해 주세요." }, { status: 401, headers: { "Cache-Control": "no-store" } });
    }
    if (response.ok && response.headers.get("content-type")?.includes("application/json")) {
      const body = await response.json() as Record<string, unknown> | null;
      if (body && typeof body === "object") {
        delete body.token;
        if (body.session && typeof body.session === "object") delete (body.session as Record<string, unknown>).token;
      }
      const responseHeaders = new Headers(response.headers);
      responseHeaders.delete("content-length");
      responseHeaders.set("Cache-Control", "no-store");
      return new Response(JSON.stringify(body), { status: response.status, headers: responseHeaders });
    }
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch {
    console.error("Authentication request unavailable");
    return Response.json({ error: "요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요." }, { status: 503 });
  }
}
export const GET = handle;
export const POST = handle;
