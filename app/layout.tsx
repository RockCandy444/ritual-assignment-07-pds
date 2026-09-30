import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "플랜두씨 · 나만의 공부 다이어리",
  description: "내 계정에서 공부 계획과 실제 기록을 이어가고, 돌아본 내용을 다음 계획에 적용하세요.",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ko"><body>{children}</body></html>;
}
