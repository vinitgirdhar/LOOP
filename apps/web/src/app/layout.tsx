import type { Metadata, Viewport } from 'next';
import './globals.css';
import { ThemeProvider, themeScript } from '@/components/providers/theme';
import { LocaleProvider, localeScript } from '@/components/providers/locale';
import { ToastProvider } from '@/components/providers/toast';
import { AuthProvider } from '@/components/providers/auth';
import { SocketProvider } from '@/components/providers/socket';
import { OfflineProvider } from '@/components/providers/offline';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: 'Loop — the project tool that keeps itself updated',
    template: '%s · Loop',
  },
  description:
    'Projects, docs, sprints and chat in one workspace, with an AI layer that reads real activity and keeps the board honest. Every AI action comes with evidence you can accept or reject.',
  keywords: ['project management', 'kanban', 'sprints', 'team collaboration', 'wiki', 'team chat', 'AI project management'],
  authors: [{ name: 'Loop' }],
  openGraph: {
    type: 'website',
    url: siteUrl,
    siteName: 'Loop',
    title: 'Loop — the project tool that keeps itself updated',
    description: 'One workspace for projects, docs and chat, with an explainable AI layer that keeps the board honest.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Loop — the project tool that keeps itself updated',
    description: 'One workspace for projects, docs and chat, with an explainable AI layer.',
  },
  robots: { index: true, follow: true },
  applicationName: 'Loop',
  appleWebApp: { capable: true, title: 'Loop', statusBarStyle: 'default' },
  icons: {
    icon: [
      { url: '/favicon.ico' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/logo.svg', type: 'image/svg+xml' },
    ],
    apple: [
      { url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  },
  // Stops iOS Safari from turning task ids and numbers into phone links.
  formatDetection: { telephone: false, date: false, address: false, email: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Pinch-zoom stays available on purpose — capping it fails WCAG 1.4.4.
  maximumScale: 5,
  userScalable: true,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0c0e14' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <script dangerouslySetInnerHTML={{ __html: localeScript }} />
      </head>
      <body>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-[200] focus:rounded-lg focus:bg-[var(--accent)] focus:px-3 focus:py-2 focus:text-sm focus:text-[var(--accent-text)]"
        >
          Skip to content
        </a>
        <LocaleProvider>
        <ThemeProvider>
          <ToastProvider>
            <AuthProvider>
              <SocketProvider>
                {children}
                <OfflineProvider />
              </SocketProvider>
            </AuthProvider>
          </ToastProvider>
        </ThemeProvider>
        </LocaleProvider>
      </body>
    </html>
  );
}
