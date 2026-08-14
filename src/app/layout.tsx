import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import NavLinks from "@/components/NavLinks";
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
  title: "Crypto Trend Agent",
  description: "Per-market/language crypto search trends and keyword investment recommendations",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-[var(--background)] text-[var(--foreground)]">
        <header className="sticky top-0 z-40 border-b border-[var(--border)] bg-[var(--surface)]/80 backdrop-blur supports-[backdrop-filter]:bg-[var(--surface)]/70">
          <div className="mx-auto max-w-6xl px-4 h-14 flex items-center justify-between gap-4">
            <Link href="/" className="flex items-center gap-2 font-semibold">
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-brand-600 text-white text-sm shadow-sm">📈</span>
              <span className="tracking-tight">Crypto Trend Agent</span>
            </Link>
            <NavLinks />
          </div>
        </header>
        <main className="flex-1 mx-auto w-full max-w-6xl px-4 py-8">{children}</main>
        <footer className="border-t border-[var(--border)] py-5">
          <div className="mx-auto max-w-6xl px-4 text-xs text-[var(--muted)]">
            Daily crypto search-trend analysis from free sources · Google Trends · CoinGecko · RSS · Reddit
          </div>
        </footer>
      </body>
    </html>
  );
}
