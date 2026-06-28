/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  experimental: {
    serverActions: { bodySizeLimit: '12mb' },
  },
  // Для прокси к Remnawave — если панель на другом домене за HTTPS-прокси
  async rewrites() {
    return []
  },
}

module.exports = nextConfig
