import type { Metadata } from "next";
import ThemeProvider from "@/components/ThemeProvider";
import { ToastProvider } from "@/components/Toast";
import "./globals.css";

export const metadata: Metadata = {
  title: "SonicAI — AI 音乐生成引擎",
  description: "上传你的音频，AI 自动分析音乐风格，用文字描述即可生成独一无二的专属音乐",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className="min-h-[100dvh]">
        <ToastProvider>
          <ThemeProvider>{children}</ThemeProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
