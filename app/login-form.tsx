"use client";
import { useState, type FormEvent } from "react";
import { NotebookPen, LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function LoginForm() {
  const [signUp, setSignUp] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return;
    const form = new FormData(event.currentTarget);
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/auth/" + (signUp ? "sign-up/email" : "sign-in/email"), {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: String(form.get("email")).trim().toLowerCase(), password: form.get("password"), ...(signUp ? { name: String(form.get("name")).trim() } : {}) }),
      });
      if (!response.ok) {
        const body = await response.json() as { error?: string };
        throw new Error(response.status === 429 ? "요청이 많아요. 잠시 후 다시 시도해 주세요." : signUp ? "가입 정보를 확인해 주세요. 이미 가입한 이메일은 로그인해 주세요." : body.error || "이메일 또는 비밀번호를 확인해 주세요.");
      }
      window.location.assign("/diary");
    } catch (e) { setError(e instanceof Error ? e.message : "연결을 확인한 뒤 다시 시도해 주세요."); }
    finally { setBusy(false); }
  }
  return <main className="auth-shell"><div className="auth-brand"><NotebookPen aria-hidden="true"/><span>플랜두씨 · 공부 다이어리</span></div>
    <section className="auth-card"><LockKeyhole className="auth-icon" aria-hidden="true"/><p className="eyebrow">MY PRIVATE DIARY</p>
      <h1>{signUp ? "내 공부 공간 만들기" : "내 기록으로 돌아가기"}</h1><p className="auth-intro">계획과 공부 기록을 내 계정에서 이어갑니다.</p>
      <form onSubmit={submit}><fieldset disabled={busy}>
        {signUp && <><label htmlFor="name">이름</label><Input id="name" name="name" required maxLength={60} autoComplete="name"/></>}
        <label htmlFor="email">이메일</label><Input id="email" name="email" type="email" required maxLength={254} autoComplete="email"/>
        <label htmlFor="password">비밀번호</label><Input id="password" name="password" type="password" required minLength={signUp ? 12 : undefined} maxLength={128} autoComplete={signUp ? "new-password" : "current-password"}/>
        {signUp && <p className="field-help">12~128자로 입력해 주세요.</p>}
        <Button type="submit" size="lg" className="auth-submit">{busy ? "확인 중…" : signUp ? "가입하기" : "로그인"}</Button>
      </fieldset></form>{error && <p className="message error" role="alert">{error}</p>}
      <Button type="button" variant="ghost" disabled={busy} onClick={() => {setSignUp(!signUp);setError("");}}>{signUp ? "이미 계정이 있어요 · 로그인" : "처음이에요 · 가입하기"}</Button>
    </section><p className="auth-footnote">공부 기록은 로그인한 본인만 열람할 수 있습니다.</p></main>;
}
