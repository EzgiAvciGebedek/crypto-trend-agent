import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep the headless-browser packages out of the bundle — they ship native binaries
  // (@sparticuz/chromium) that must be resolved from node_modules at runtime, not bundled
  // as JS.
  serverExternalPackages: ["@sparticuz/chromium", "puppeteer-core"],
  // @sparticuz/chromium's bin/ directory (the compressed Chromium binary) is resolved via
  // a runtime path, which output file tracing's static analysis can't discover on its own
  // — externalizing the package (above) stops it from being bundled, but Vercel still
  // needs to be told to physically include these files in the deployed function, or it
  // fails at runtime with `The input directory ".../bin" does not exist`.
  outputFileTracingIncludes: {
    "/api/cron/competitors": ["./node_modules/@sparticuz/chromium/bin/**/*"],
  },
};

export default nextConfig;
