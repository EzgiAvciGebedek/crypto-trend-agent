import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep the headless-browser packages out of webpack's bundle — they ship native
  // binaries (@sparticuz/chromium) that must be resolved from node_modules at runtime,
  // not bundled as JS.
  serverExternalPackages: ["@sparticuz/chromium", "puppeteer-core"],
};

export default nextConfig;
