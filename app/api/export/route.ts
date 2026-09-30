import { exportDiary } from "@/db/export";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const diary = await exportDiary();
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
