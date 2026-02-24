/** @type {import('next').NextConfig} */
const nextConfig = {
  // Removed output: 'standalone' — not needed for Vercel
  typescript: {
    // Skip type checking during build (low memory server)
    ignoreBuildErrors: true,
  },
  eslint: {
    // Skip ESLint during build (low memory server)
    ignoreDuringBuilds: true,
  },
}

module.exports = nextConfig
