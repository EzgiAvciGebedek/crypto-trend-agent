// Free headless-browser fallback for competitor crawling.
//
// What this fixes: sites whose article links only exist after client-side JS runs (pure
// SPAs) — the direct fetch's raw server HTML has nothing to extract, but a real browser
// executing the page's JS will produce the actual rendered content.
//
// What this does NOT fix: sites with hard IP-reputation-based blocking (a 403 served
// before any page loads). But a Cloudflare *JS challenge* ("Just a moment…") is a
// different case — a real browser often solves it on its own within a few seconds, and
// the clearance cookie then applies to every later page in the same browser context, so
// renderPageHtml() waits out the challenge before giving up. Only a proxy (see
// scraper.ts), which changes the exit IP, helps against true IP-reputation blocks.
//
// @sparticuz/chromium ships a Linux binary built specifically for AWS Lambda/Vercel's
// serverless runtime — it can only launch there, not on a local macOS/Windows dev machine
// (spawn ENOEXEC). renderPageHtml() throws with the real error on failure; the caller
// (competitors.ts) catches it and just skips this tier for that source, same as any other
// failed fetch — local dev and any packaging hiccup both degrade safely, they just no
// longer fail *silently*, which made a real bug (see git history) impossible to diagnose.

import type { Browser, Page } from "puppeteer-core";

const NAV_TIMEOUT_MS = 9_000;
const RENDER_SETTLE_MS = 1_200; // brief pause after DOM-ready for client-rendered content to paint
const MAX_CONCURRENT_PAGES = 3; // bounds memory — headless tabs add up fast in a small function
// Cloudflare's JS challenge ("Just a moment…") often solves itself in a real browser
// given a few seconds — and once one page clears it, the clearance cookie is shared by
// the whole browser context, so later pages on the same domain load unchallenged.
const CHALLENGE_WAIT_MS = 8_000;
const CHALLENGE_RE = /just a moment|challenges\.cloudflare\.com|cf-chl/i;

const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

let browserPromise: Promise<Browser> | null = null;
let launchError: string | null = null;

async function launchBrowser(): Promise<Browser> {
  const [{ default: puppeteer }, { default: chromium }] = await Promise.all([
    import("puppeteer-core"),
    import("@sparticuz/chromium"),
  ]);
  // Local dev override: @sparticuz/chromium's binary is Linux-only (spawn ENOEXEC on
  // macOS/Windows), so the headless tier can't be exercised locally without pointing
  // LOCAL_CHROMIUM_PATH at a system Chrome/Chromium install.
  const localPath = process.env.LOCAL_CHROMIUM_PATH;
  return puppeteer.launch({
    args: localPath ? ["--no-sandbox"] : chromium.args,
    executablePath: localPath ?? (await chromium.executablePath()),
    headless: true,
  });
}

// One shared browser per crawl run — launching Chromium is slow (~1-3s), so we reuse it
// across every competitor that needs the headless tier instead of relaunching per site.
// Throws (with the real error message) on failure — callers decide how to report/degrade;
// swallowing it here made "why didn't this work" impossible to diagnose from the outside.
function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = launchBrowser().catch((err) => {
      launchError = err instanceof Error ? err.message : String(err);
      browserPromise = null; // allow a retry on the next call instead of caching the failure forever
      throw err;
    });
  }
  return browserPromise;
}

export function lastLaunchError(): string | null {
  return launchError;
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

// Renders `url` in a real (headless) browser and returns the final HTML. Throws (with the
// real error message — launch failure, navigation timeout, etc.) rather than swallowing
// failures, so callers can report an accurate reason instead of a generic "didn't work".
export async function renderPageHtml(url: string, timeoutMs = NAV_TIMEOUT_MS): Promise<string> {
  const browser = await getBrowser();
  await acquireSlot();
  let page: Page | undefined;
  try {
    page = await browser.newPage();
    await page.setUserAgent(BROWSER_UA);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: timeoutMs });
    await new Promise((r) => setTimeout(r, RENDER_SETTLE_MS));
    let html = await page.content();
    // Still on a Cloudflare challenge page → give the challenge script time to solve
    // itself, re-reading the DOM once a second until the real content shows up.
    const deadline = Date.now() + CHALLENGE_WAIT_MS;
    while (CHALLENGE_RE.test(html) && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 1_000));
      html = await page.content();
    }
    return html;
  } finally {
    if (page) await page.close().catch(() => {});
    releaseSlot();
  }
}

function raceTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([p, new Promise<null>((resolve) => setTimeout(() => resolve(null), ms))]);
}

// Closes the shared browser — call once after a crawl batch completes so the serverless
// invocation can finish cleanly instead of leaving a Chromium process dangling.
//
// This runs in the caller's `finally`, AFTER the caller's own per-competitor deadline race
// has already given up on any slow crawl — so it must never itself be unbounded. It used to
// just `await browserPromise` with no timeout: if the launch was still stuck (cold start
// extracting the ~50MB chromium binary), this awaited it anyway and could burn through
// whatever was left of the whole route's time budget regardless of how tight that budget
// was — confirmed live, the route kept hitting the exact 60s FUNCTION_INVOCATION_TIMEOUT on
// cold starts no matter how much the caller's own budget was tightened, because THIS was
// the actual unbounded step, not the crawl itself.
export async function closeBrowser(): Promise<void> {
  if (!browserPromise) return;
  const browser = await raceTimeout(browserPromise.catch(() => null), 5_000);
  browserPromise = null;
  if (browser) await raceTimeout(browser.close().catch(() => {}), 3_000);
}
