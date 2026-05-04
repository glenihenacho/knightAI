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
  webpack: (config) => {
    // Sibling packages and the API both write `.js` extensions on imports —
    // required for compiled Node ESM at runtime, allowed by tsc's Bundler
    // resolution at type-check time. Webpack doesn't have either convention,
    // so we tell it to fall back to `.ts/.tsx` when a `.js`/`.jsx` source file
    // doesn't exist.
    config.resolve = config.resolve ?? {};
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      ".js": [".ts", ".tsx", ".js"],
      ".jsx": [".tsx", ".jsx"],
    };
    return config;
  },
};

export default nextConfig;
