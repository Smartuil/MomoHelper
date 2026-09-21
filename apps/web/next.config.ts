import type { NextConfig } from 'next'

/**
 * 静态导出：构建产物由 Nginx（宝塔站点）托管，不占用 Node 进程
 * （docs/tech-stack.md「Web」节）。
 */
const nextConfig: NextConfig = {
  output: 'export',
  images: { unoptimized: true }
}

export default nextConfig
