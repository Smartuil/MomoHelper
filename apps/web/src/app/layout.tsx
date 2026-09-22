import type { Metadata } from 'next'

import './globals.css'
import { Providers } from './providers'
import { SideNav } from '@/components/side-nav'

export const metadata: Metadata = {
  title: '墨墨 AI 学习副驾',
  description: '贴着墨墨工作流的学习诊断、内容增强与复盘工具'
}

export default function RootLayout({ children }: { children: React.ReactNode })
{
  return (
    <html lang="zh-CN">
      <head>
        {/* 仅本地开发注入：web(3100) → API(3000) 跨端口；生产同域走相对路径。
            必须用 localhost（而非 127.0.0.1），否则与 3100 端口跨站，SameSite=Lax 的会话 Cookie 不会被携带 */}
        {process.env.NODE_ENV === 'development' && (
          <script
            dangerouslySetInnerHTML={{
              __html: `globalThis.__MOMO_API_BASE__=${JSON.stringify(
                process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:3000'
              )};`
            }}
          />
        )}
      </head>
      <body className="min-h-screen">
        <Providers>
          <div className="flex">
            <SideNav />
            <main className="min-w-0 flex-1 px-6 py-10 md:px-12 lg:px-16">
              <div className="mx-auto max-w-[1200px]">{children}</div>
            </main>
          </div>
        </Providers>
      </body>
    </html>
  )
}
