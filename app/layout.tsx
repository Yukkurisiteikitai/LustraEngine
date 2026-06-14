import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import './globals.css';
import Providers from './providers';

const outfit = localFont({
  src: [
    {
      path: './fonts/Outfit-Regular.ttf',
      weight: '400',
      style: 'normal',
    },
    {
      path: './fonts/Outfit-Medium.ttf',
      weight: '500',
      style: 'normal',
    },
    {
      path: './fonts/Outfit-SemiBold.ttf',
      weight: '600',
      style: 'normal',
    },
    {
      path: './fonts/Outfit-Bold.ttf',
      weight: '700',
      style: 'normal',
    },
  ],
  variable: '--font-outfit',
  display: 'swap',
});

const playfair = localFont({
  src: [
    {
      path: './fonts/PlayfairDisplay-Regular.ttf',
      weight: '400',
      style: 'normal',
    },
    {
      path: './fonts/PlayfairDisplay-Medium.ttf',
      weight: '500',
      style: 'normal',
    },
  ],
  variable: '--font-playfair',
  display: 'swap',
});

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#fcfcf9' },
    { media: '(prefers-color-scheme: dark)', color: '#1a1c1c' },
  ],
};

export const metadata: Metadata = {
  metadataBase: new URL('https://www.yourselflm.org'),
  title: 'YourselfLM',
  description: 'YourselfLMは、LLMを活用して自己理解を深めるためのツールです。',
  manifest: '/manifest.json',
  icons: {
    icon: '/favicon.ico',
    shortcut: '/favicon.ico',
    apple: '/apple-icon.png',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja" className={`${outfit.variable} ${playfair.variable}`} suppressHydrationWarning>
      <body className="antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
