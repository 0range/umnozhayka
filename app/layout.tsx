import type { Metadata, Viewport } from "next";
import "./globals.css";
import { YandexMetrika } from "./analytics";

export const viewport: Viewport = {
  themeColor: "#b7655b",
  colorScheme: "light",
};

export const metadata: Metadata = {
  title: "Умножайка",
  description: "Весёлая тренировка таблицы умножения с личной картой знаний.",
  applicationName: "Умножайка",
  icons: {
    icon: [
      { url: "/favicon-thoughtful-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icon-thoughtful-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [
      { url: "/apple-touch-icon-thoughtful.png", sizes: "180x180", type: "image/png" },
    ],
  },
  other: {
    "codex-preview": "development",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru">
      <body>
        {children}
        <YandexMetrika />
      </body>
    </html>
  );
}
