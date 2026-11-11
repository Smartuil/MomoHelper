import type { Metadata } from 'next'

import './globals.css'
import { Providers } from './providers'
import { MobileNav, SideNav } from '@/components/side-nav'

export const metadata: Metadata = {
  title: '墨墨 AI 学习副驾',
  description: '贴着墨墨工作流的学习诊断、内容增强与复盘工具'
}

export default function RootLayout({ children }: { children: React.ReactNode })
{
  return (
    <html lang="zh-CN">
      <head />
      <body className="min-h-screen">
        <Providers>
          <div className="flex min-h-screen">
            <SideNav />
            <div className="flex min-w-0 flex-1 flex-col">
              <MobileNav />
              <main className="min-w-0 flex-1 px-5 py-8 md:px-10 md:py-10">
                <div className="mx-auto w-full max-w-[1240px]">{children}</div>
              </main>
            </div>
          </div>
        </Providers>
      </body>
    </html>
  )
}
