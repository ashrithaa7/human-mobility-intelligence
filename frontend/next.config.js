/** @type {import('next').NextConfig} */
const nextConfig = {
  // Allow production verification alongside a running development server.
  distDir: process.env.HMI_NEXT_DIST_DIR || '.next',
  reactStrictMode: true,
  outputFileTracingRoot: __dirname,
  images: {
    unoptimized: false,
  },
  webpack: (config) => {
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      net: false,
      tls: false,
    };
    return config;
  },
};

module.exports = nextConfig;
