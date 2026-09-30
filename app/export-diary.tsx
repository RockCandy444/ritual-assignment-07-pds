"use client";

import { useRef, useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function ExportDiary() {
  const busy = useRef(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function download() {
    if (busy.current) return;
    busy.current = true;
    setExporting(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/export", { cache: "no-store" });
      const content = await response.text();
      const data = JSON.parse(content);
      if (!response.ok) throw new Error(data.error || "자료를 내보내지 못했어요.");
      const filename = response.headers.get("content-disposition")?.match(/filename="([^"]+)"/)?.[1];
      if (data.format !== "pds-study-diary" || !filename || !data.tables) {
        throw new Error("내보낸 자료를 확인하지 못했어요. 다시 시도해 주세요.");
      }
      const blobUrl = URL.createObjectURL(new Blob([content], { type: "application/json;charset=utf-8" }));
      const link = document.createElement("a");
      link.href = blobUrl; link.download = filename;
      document.body.appendChild(link);
      link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
      const t = data.tables;
      setNotice(`다운로드를 시작했어요. 계획 ${t.plans.length}개 · 수정 이력 ${t.plan_versions.length}건 · 할 일 ${t.tasks.length}개 · 공부 기록 ${t.study_logs.length}건 · 돌아보기 ${t.plan_reviews.length}건. 브라우저의 다운로드 목록에서 파일을 확인하세요.`);
    } catch (e) {
      setError(e instanceof Error && !(e instanceof SyntaxError) && !(e instanceof TypeError) ? e.message : "자료를 내보내지 못했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      busy.current = false; setExporting(false);
    }
  }

  return <section className="export-section" aria-labelledby="export-title">
    <div className="section-heading"><span className="section-index">05</span><div>
      <h2 id="export-title">전체 자료 내보내기</h2>
      <p>저장한 모든 계획과 수정 이력, 할 일, 공부 기록, 돌아보기를 JSON 파일 하나로 보관하세요.</p>
    </div></div>
    <div className="export-actions">
      <p>삭제한 항목과 테스트 기록도 포함해요. 아직 저장하지 않은 입력 내용은 포함되지 않아요.</p>
      <Button type="button" size="lg" disabled={exporting} onClick={() => void download()}>
        <Download size={18} aria-hidden="true" />{exporting ? "내보내는 중…" : "JSON 파일 다운로드"}
      </Button>
    </div>
    {error && <p role="alert" className="message error">{error} 다운로드 버튼을 눌러 다시 시도할 수 있어요.</p>}
    {notice && <p role="status" className="message success">{notice}</p>}
  </section>;
}
