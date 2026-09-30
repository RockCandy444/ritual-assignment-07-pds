import { currentUser } from "@/lib/auth";
import { AccessDenied } from "@/db/ownership";

export function protectedRoute(handler: (request: Request, userId: string) => Promise<Response>) {
  return async (request: Request) => {
    try {
      const user = await currentUser(request.headers);
      if (!user) return Response.json({ error: "로그인이 필요합니다." }, { status: 401, headers: { "Cache-Control": "no-store" } });
      if (request.method !== "GET" && request.method !== "HEAD") {
        const origin = request.headers.get("origin");
        if (origin && origin !== new URL(request.url).origin) return Response.json({ error: "허용되지 않은 요청입니다." }, { status: 403 });
        if (request.headers.get("sec-fetch-site") === "cross-site") return Response.json({ error: "허용되지 않은 요청입니다." }, { status: 403 });
      }
      const response = await handler(request, user.id);
      response.headers.set("Cache-Control", "no-store");
      return response;
    } catch (error) {
      if (error instanceof AccessDenied) return Response.json({ error: "자료를 찾을 수 없습니다." }, { status: 404, headers: { "Cache-Control": "no-store" } });
      console.error("Protected request unavailable");
      return Response.json({ error: "서비스를 사용할 수 없어요. 잠시 후 다시 시도해 주세요." }, { status: 503, headers: { "Cache-Control": "no-store" } });
    }
  };
}
