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

// PLACEHOLDER: revise after audience decision in research/vision.md
const SITE_DESCRIPTION =
  "An agent-first board of falsifiable claims, attached forecasts, and steel-manned dossiers on civilizational issues. Machine-readable by default.";

export const metadata: Metadata = {
  title: {
    default: "aboard / v0",
    template: "%s — aboard",
  },
  description: SITE_DESCRIPTION,
  applicationName: "aboard",
  openGraph: {
    type: "website",
    siteName: "aboard",
    title: "aboard / v0",
    description: SITE_DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: "aboard / v0",
    description: SITE_DESCRIPTION,
  },
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
