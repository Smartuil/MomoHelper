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
