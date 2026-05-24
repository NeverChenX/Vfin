import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'VFin — 行情 · 财报',
  description: 'VFin · A 股个人研究终端：实时行情、财报深度分析',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  themeColor: '#0B0E11',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" className="dark">
      <body className="min-h-screen bg-[var(--color-bg-base)] text-[var(--color-text-primary)] antialiased">
        {children}
      </body>
    </html>
  );
}
