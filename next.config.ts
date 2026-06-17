import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value:
              "frame-src 'self' https://*.flowchat.com https://flowchat.com https://app.flowchat.com; frame-ancestors 'self';",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
