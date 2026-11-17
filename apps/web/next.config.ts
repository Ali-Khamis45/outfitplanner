import type { NextConfig } from "next";

// Outputs are local runtime inputs, never deployment artifacts. In particular,
// dynamic route tracing must not package personal avatars or garments.
const nextConfig: NextConfig = { distDir: process.env.NEXT_DIST_DIR || ".next", outputFileTracingExcludes: { "/*": ["../../outputs/**/*", "../../.codex-garment-check/**/*"] } };
export default nextConfig;
