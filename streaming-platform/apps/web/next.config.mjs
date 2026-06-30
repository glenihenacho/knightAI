/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Compile the shared workspace package (it ships TypeScript source).
  transpilePackages: ['@streaming/shared'],
};

export default nextConfig;
