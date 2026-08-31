import type { NextConfig } from "next";

// Validate application configuration during `next build`, not only when the
// first request reaches the server.
import "./src/server/env";

const nextConfig: NextConfig = {};

export default nextConfig;
