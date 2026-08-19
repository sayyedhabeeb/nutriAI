import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  async redirects() {
    return [
      {
        source: '/doc',
        destination: '/docs',
        permanent: true,
      },
      {
        source: '/swagger',
        destination: '/docs',
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
