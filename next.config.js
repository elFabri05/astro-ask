/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Prevent Next.js from bundling native Node.js addons and heavy server libs.
    // These are required at runtime from node_modules, not inlined by webpack.
    serverComponentsExternalPackages: [
      "sweph",
      "node-geocoder",
      "geo-tz",
      "@prisma/client",
      "prisma",
    ],
  },
};

module.exports = nextConfig;
