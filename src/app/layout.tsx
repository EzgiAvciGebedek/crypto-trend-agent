import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
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
  title: "Finst Trend Agent",
  description: "Per-country/language crypto search trends and keyword investment recommendations",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-neutral-50 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
        <header className="border-b border-neutral-200 dark:border-neutral-800">
          <div className="mx-auto max-w-6xl px-4 py-4 flex items-center justify-between gap-4">
            <Link href="/" className="flex items-center gap-2 font-semibold">
              <span className="text-lg">📈</span>
              <span>Finst Trend Agent</span>
            </Link>
            <nav className="flex items-center gap-4 text-sm text-neutral-600 dark:text-neutral-400">
              <Link href="/" className="hover:text-neutral-900 dark:hover:text-neutral-100">Markets</Link>
              <Link href="/compare" className="hover:text-neutral-900 dark:hover:text-neutral-100">Compare</Link>
              <Link href="/history" className="hover:text-neutral-900 dark:hover:text-neutral-100">History</Link>
            </nav>
          </div>
        </header>
        <main className="flex-1 mx-auto w-full max-w-6xl px-4 py-6">{children}</main>
        <footer className="border-t border-neutral-200 dark:border-neutral-800 py-4">
          <div className="mx-auto max-w-6xl px-4 text-xs text-neutral-500">
            Daily crypto search-trend analysis from free sources · Google Trends · CoinGecko · RSS · Reddit
          </div>
        </footer>
      </body>
    </html>
  );
}
