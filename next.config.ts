import type { NextConfig } from "next";

const dev = process.env.NODE_ENV !== "production";

/**
 * Content-Security-Policy. What each exception is for:
 * - 'unsafe-inline' scripts: Next.js App Router inlines its hydration data; nonces would force every page to render dynamically.
 * - 'wasm-unsafe-eval' + cdn.jsdelivr.net: tesseract.js (photo OCR) loads its worker script, wasm core and
 *   lav/eng language data from jsDelivr, and runs the worker from a blob: URL.
 * - blob:/data: images: OCR and PDF pages are rendered to canvas in the browser.
 * - 'unsafe-eval' only in dev, for React's dev tooling.
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' https://cdn.jsdelivr.net${dev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' https://cdn.jsdelivr.net blob: data:",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  experimental: { serverActions: { bodySizeLimit: "12mb" } },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // Certificate preview: browsers' built-in PDF viewers can refuse to load under object-src 'none'.
      // The route only serves PDF/JPG/PNG/WEBP with nosniff, so nothing on it runs as script; keep framing blocked.
      { source: "/api/certificates/:id/file", headers: [{ key: "Content-Security-Policy", value: "frame-ancestors 'none'" }] },
    ];
  },
};

export default nextConfig;
