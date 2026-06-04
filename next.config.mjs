/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Prisma must stay external to Next's server bundler.
  serverExternalPackages: ["@prisma/client", "@anthropic-ai/sdk"],
};

export default nextConfig;
