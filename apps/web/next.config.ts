import type { NextConfig } from 'next'

/**
 * 静态导出：产物 apps/web/out 交由 EdgeOne Pages 托管；
 * 同源 /api/memo/* 由 edge-functions 下的代理函数处理。
 */
const nextConfig: NextConfig = {
  output: 'export',
  images: { unoptimized: true }
}

export default nextConfig
