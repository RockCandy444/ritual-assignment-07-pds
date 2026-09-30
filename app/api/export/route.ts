import { exportDiary } from "@/db/export";
import { protectedRoute } from "@/lib/protected-route";

export const dynamic = "force-dynamic";

async function get(_request: Request, userId: string) {
  try {
    const diary = await exportDiary(userId);
    const timestamp = diary.exportedAt.replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
    return new Response(JSON.stringify(diary, null, 2) + "\n", {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="pds-diary-${timestamp}.json"`,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    console.error("Diary export failed");
    return Response.json({ error: "자료를 내보내지 못했어요. 잠시 후 다시 시도해 주세요." }, {
      status: 503, headers: { "Cache-Control": "no-store" },
    });
  }
}
export const GET = protectedRoute(get);
