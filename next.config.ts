import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  outputFileTracingIncludes: {
    "/*": ["./public/data/**/*"],
  },
};

export default nextConfig;
