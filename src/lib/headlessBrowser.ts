// Free headless-browser fallback for competitor crawling.
//
// What this fixes: sites whose article links only exist after client-side JS runs (pure
// SPAs) — the direct fetch's raw server HTML has nothing to extract, but a real browser
// executing the page's JS will produce the actual rendered content.
//
// What this does NOT fix: sites with active IP-reputation-based bot blocking (Cloudflare
// WAF etc., e.g. bitvavo.com returning 403 even on robots.txt/sitemap.xml). The request
// still originates from the same Vercel/AWS datacenter IP range regardless of which
// browser or tool sends it — IP reputation, not "is this a real browser", is what those
// systems gate on. A proxy (see scraper.ts) is the only thing that changes the exit IP.
//
// @sparticuz/chromium ships a Linux binary built specifically for AWS Lambda/Vercel's
// serverless runtime — it can only launch there, not on a local macOS/Windows dev machine
// (spawn ENOEXEC). getBrowser() degrades to null (skip this tier) if launching fails for
// any reason, so local dev and any packaging hiccup both fail safely rather than crash
// the crawl.

import type { Browser, Page } from "puppeteer-core";

const NAV_TIMEOUT_MS = 9_000;
const RENDER_SETTLE_MS = 1_200; // brief pause after DOM-ready for client-rendered content to paint
const MAX_CONCURRENT_PAGES = 3; // bounds memory — headless tabs add up fast in a small function

const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

let browserPromise: Promise<Browser | null> | null = null;

async function launchBrowser(): Promise<Browser | null> {
  try {
    const [{ default: puppeteer }, { default: chromium }] = await Promise.all([
      import("puppeteer-core"),
      import("@sparticuz/chromium"),
    ]);
    return await puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: true,
    });
  } catch {
    return null;
  }
}

// One shared browser per crawl run — launching Chromium is slow (~1-3s), so we reuse it
// across every competitor that needs the headless tier instead of relaunching per site.
function getBrowser(): Promise<Browser | null> {
  if (!browserPromise) browserPromise = launchBrowser();
  return browserPromise;
}

// Counting semaphore so we never have more than MAX_CONCURRENT_PAGES tabs open at once
// across a whole crawlAllCompetitors() run, even though callers fire in parallel.
let activePages = 0;
const waiters: Array<() => void> = [];
async function acquireSlot(): Promise<void> {
  if (activePages < MAX_CONCURRENT_PAGES) {
    activePages++;
    return;
  }
  await new Promise<void>((resolve) => waiters.push(resolve));
  activePages++;
}
function releaseSlot(): void {
  activePages--;
  const next = waiters.shift();
  if (next) next();
}

// Renders `url` in a real (headless) browser and returns the final HTML, or null if the
// browser can't launch (local dev, packaging issue) or the page fails to load in time.
export async function renderPageHtml(url: string, timeoutMs = NAV_TIMEOUT_MS): Promise<string | null> {
  const browser = await getBrowser();
  if (!browser) return null;

  await acquireSlot();
  let page: Page | undefined;
  try {
    page = await browser.newPage();
    await page.setUserAgent(BROWSER_UA);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: timeoutMs });
    await new Promise((r) => setTimeout(r, RENDER_SETTLE_MS));
    return await page.content();
  } catch {
    return null;
  } finally {
    if (page) await page.close().catch(() => {});
    releaseSlot();
  }
}

// Closes the shared browser — call once after a crawl batch completes so the serverless
// invocation can finish cleanly instead of leaving a Chromium process dangling.
export async function closeBrowser(): Promise<void> {
  if (!browserPromise) return;
  const browser = await browserPromise.catch(() => null);
  browserPromise = null;
  if (browser) await browser.close().catch(() => {});
}
