/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
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
