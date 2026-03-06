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
  webpack: (config, { isServer }) => {
    // Fix for MetaMask SDK React Native dependencies
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
      }
    }
    // Ignore React Native modules that MetaMask SDK incorrectly imports
    config.externals = [
      ...(config.externals || []),
      '@react-native-async-storage/async-storage',
    ]
    return config
  },
}

module.exports = nextConfig
