import type { NextConfig } from "next";

// Outputs are local runtime inputs, never deployment artifacts. In particular,
// dynamic route tracing must not package personal avatars or garments.
const nextConfig: NextConfig = { outputFileTracingExcludes: { "/*": ["../../outputs/**/*"] } };
export default nextConfig;
