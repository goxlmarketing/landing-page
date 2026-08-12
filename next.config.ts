import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Phone / LAN: allow Next.js dev JS/CSS/HMR when opened via network IP
  allowedDevOrigins: ["192.168.31.132"],
  // Hide the floating Next.js “N” badge in development
  devIndicators: false,
  async rewrites() {
    return [{ source: "/", destination: "/ally-landing.html" }];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
