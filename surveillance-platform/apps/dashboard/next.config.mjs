/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: [
    "@surveillance/shared",
    "@surveillance/ui",
    "@surveillance/camera-core",
  ],
  experimental: {
    typedRoutes: false,
  },
};

export default nextConfig;
