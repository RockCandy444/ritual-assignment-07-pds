"use client";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";

export default function AccountPanel({ user }: { user: { name: string; email: string } }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  async function send(url: string, method: string, body: unknown) {
    const response = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const result = await response.json() as { error?: string; message?: string };
    if (!response.ok) throw new Error(result.error || "요청을 처리하지 못했어요.");
    return result;
  }
  async function logout() {
    setBusy(true); setError("");
    try { await send("/api/auth/sign-out", "POST", {}); window.location.replace("/"); }
    catch (e) { setError((e as Error).message); setBusy(false); }
  }
  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return;
    const form = new FormData(event.currentTarget);
    setBusy(true); setError("");
    try { await send("/api/auth/change-password", "POST", { currentPassword: form.get("currentPassword"), newPassword: form.get("newPassword") }); window.location.replace("/"); }
    catch { setError("비밀번호를 변경하지 못했어요. 현재 비밀번호와 새 비밀번호(12~128자)를 확인해 주세요."); setBusy(false); }
  }
  async function importDiary(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return;
    const file = new FormData(event.currentTarget).get("file");
    if (!(file instanceof File) || !file.size) { setError("T06에서 내보낸 JSON 파일을 선택해 주세요."); return; }
    if (file.size > 262144) { setError("파일은 256KB 이하로 선택해 주세요."); return; }
    setBusy(true); setError(""); setNotice("");
    try {
      await send("/api/import", "POST", JSON.parse(await file.text()));
      setNotice("자료를 가져왔어요. 저장한 계획을 새로 불러오거나 새로고침해 주세요.");
    } catch (e) { setError(e instanceof Error ? e.message : "JSON 파일을 확인해 주세요."); }
    finally { setBusy(false); }
  }
  async function deleteAccount() {
    if (busy) return;
    setBusy(true); setError("");
    try { await send("/api/account", "DELETE", { password: deletePassword }); window.location.replace("/"); }
    catch (e) { setError((e as Error).message); setDeleteOpen(false); setDeletePassword(""); setBusy(false); }
  }
  return <section className="account-panel" aria-label="내 계정"><div className="account-bar"><div><strong>{user.name}님의 공부 공간</strong><span>{user.email}</span></div><Button variant="outline" disabled={busy} onClick={() => void logout()}>로그아웃</Button></div>
    <details className="account-settings"><summary>계정과 자료 관리</summary><div className="account-settings-grid">
      <form onSubmit={importDiary}><h2>T06 자료 가져오기</h2><p>저장한 계획이 없는 계정에서 T06의 JSON 파일을 가져올 수 있어요. 자료의 ID와 수정 이력을 보존합니다.</p><label htmlFor="import-file">T06 JSON 파일</label><Input id="import-file" name="file" type="file" accept=".json,application/json" required disabled={busy}/><Button type="submit" disabled={busy}>자료 가져오기</Button></form>
      <form onSubmit={changePassword}><h2>비밀번호 변경</h2><p>변경하면 모든 기기에서 로그아웃됩니다.</p><label htmlFor="current-password">현재 비밀번호</label><Input id="current-password" name="currentPassword" type="password" required maxLength={128} autoComplete="current-password" disabled={busy}/><label htmlFor="new-password">새 비밀번호</label><Input id="new-password" name="newPassword" type="password" required minLength={12} maxLength={128} autoComplete="new-password" disabled={busy}/><Button type="submit" disabled={busy}>비밀번호 변경</Button></form>
    </div><div className="account-delete"><p>계정을 삭제하면 계획·수정 이력·할 일·공부 기록·돌아보기와 로그인 세션이 함께 삭제됩니다. 필요한 자료는 먼저 JSON 파일로 내보내 주세요.</p>
      <AlertDialog open={deleteOpen} onOpenChange={open => { if(!busy){setDeleteOpen(open);setDeletePassword("");} }}><AlertDialogTrigger asChild><Button variant="destructive" disabled={busy}>계정 삭제</Button></AlertDialogTrigger><AlertDialogContent><AlertDialogTitle>계정과 모든 기록을 삭제할까요?</AlertDialogTitle><AlertDialogDescription>이 계정의 공부 자료와 수정 이력도 삭제됩니다. 삭제한 자료는 복구할 수 없습니다.</AlertDialogDescription><label htmlFor="delete-password">현재 비밀번호</label><Input id="delete-password" type="password" autoComplete="current-password" maxLength={128} value={deletePassword} onChange={e => setDeletePassword(e.target.value)} disabled={busy}/><AlertDialogFooter><AlertDialogCancel disabled={busy}>취소</AlertDialogCancel><AlertDialogAction variant="destructive" disabled={busy || !deletePassword} onClick={event => {event.preventDefault();void deleteAccount();}}>{busy ? "삭제 중…" : "계정과 기록 삭제"}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    </div></details>{error && <p className="message error" role="alert">{error}</p>}{notice && <p className="message success" role="status">{notice}</p>}
  </section>;
}
