import { execSync } from 'node:child_process'

import type { NextConfig } from 'next'

/**
 * 静态导出：产物 apps/web/out 交由 EdgeOne Pages 托管；
 * 同源 /api/memo/* 由 edge-functions 下的代理函数处理。
 *
 * 版本号方案：semver 来自 package.json（发版手动 bump），
 * 构建时注入当前 git commit 短 SHA，线上可核对代码版本。
 * NEXT_PUBLIC_ 前缀让客户端组件可直接读取。
 */
function readBuildInfo(): { version: string; commit: string }
{
  // 优先用 CI 注入的环境变量，本地构建时取 git 实际值
  const version = process.env.NEXT_PUBLIC_APP_VERSION ?? '0.1.0'

  let commit = process.env.NEXT_PUBLIC_COMMIT_SHA ?? ''

  if (!commit)
  {
    try
    {
      commit = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
        .toString()
        .trim()
    }
    catch
    {
      // 无 git 环境（如 CI 检出无 .git）时留空，UI 显示 version 即可
      commit = ''
    }
  }

  return { version, commit }
}

const { version, commit } = readBuildInfo()

const nextConfig: NextConfig = {
  output: 'export',
  images: { unoptimized: true },
  env: {
    NEXT_PUBLIC_APP_VERSION: version,
    NEXT_PUBLIC_COMMIT_SHA: commit
  }
}

export default nextConfig
