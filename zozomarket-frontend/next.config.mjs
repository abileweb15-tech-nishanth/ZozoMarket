/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || process.env.API_URL || 'http://localhost:8000/api/v1',
    NEXT_PUBLIC_SIGNUP_ENABLED: process.env.NEXT_PUBLIC_SIGNUP_ENABLED || 'false',
  },
}

export default nextConfig
