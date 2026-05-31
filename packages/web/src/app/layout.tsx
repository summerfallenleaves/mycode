/**
 * @fileoverview Next.js root layout providing the HTML shell, global styles, and metadata for the web app
 * @module @my-agent/web/src/app/layout
 */

import type { JSX, ReactNode } from 'react'

export default function RootLayout({ children }: { children: ReactNode }): JSX.Element {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  )
}
