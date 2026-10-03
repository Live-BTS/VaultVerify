import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // REQUIRED for pdfkit/fontkit (server-only PDF renderer); without it `next build` fails
  // ("The export applyDecoratedDescriptor was not found in module .../@swc/helpers" from fontkit).
  serverExternalPackages: ["pdfkit", "fontkit"],
  // Keep the PDF renderer's runtime assets (logo + fonts) in the traced output.
  outputFileTracingIncludes: {
    "/api/checklist/pdf": ["./assets/skills-checklist/**/*"],
  },
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
};

export default nextConfig;
