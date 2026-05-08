import type { Metadata } from "next";
import Script from "next/script";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeToggle } from "@/components/ThemeToggle";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "aboard / v0",
  description:
    "An agent-first board of falsifiable claims, attached forecasts, and steel-manned dossiers on civilizational issues. Machine-readable by default.",
};

const themeBootstrap = `
(function() {
  try {
    var m = localStorage.getItem("aboard.theme");
    if (m === "light" || m === "dark") {
      document.documentElement.setAttribute("data-theme", m);
    }
  } catch (_) {}
})();
`.trim();

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
      </head>
      <body>
        <Script src="/graph-engine.js" strategy="afterInteractive" />
        <header className="top">
          <div className="top-inner">
            <Link href="/" className="wordmark">
              <span>aboard</span>
              <span className="slash">/</span>
              <span className="ver">v0</span>
            </Link>
            <nav className="top-nav">
              <Link href="/graph">graph</Link>
              <Link href="/about">about</Link>
              <a href="/api/graph">JSON-LD</a>
              <ThemeToggle />
            </nav>
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
