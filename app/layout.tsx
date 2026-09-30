import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "플랜두씨 · JLPT 공부 다이어리",
  description: "공부 계획과 할 일, 실제 공부 기록을 돌아보고 다음 계획에 연결하세요.",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ko"><body>{children}</body></html>;
}
