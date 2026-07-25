import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeToggle } from "@/components/ThemeToggle";
import { SITE_DESCRIPTION } from "@/lib/copy";
import { siteBaseUrl } from "@/lib/site";
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
  // Without this, the Metadata API resolves the file-convention OG images
  // against http://localhost:3000 at build time and every social unfurl in
  // production 404s. `SITE_URL` does not cover it — that only feeds JSON-LD
  // `@id`s; the Metadata API reads this and nothing else.
  metadataBase: new URL(siteBaseUrl()),
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
