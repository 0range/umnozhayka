import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Умножайка",
  description: "Весёлая тренировка таблицы умножения с личной картой знаний.",
  other: {
    "codex-preview": "development",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
