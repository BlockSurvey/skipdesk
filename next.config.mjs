/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The DB/MCP tooling lives alongside the app; keep them out of the Next build.
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: false },
}

export default nextConfig
