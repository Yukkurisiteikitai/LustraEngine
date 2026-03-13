import type { Metadata } from 'next';
import './globals.css';
import Providers from './providers';

export const metadata: Metadata = {
  metadataBase: new URL('https://www.yourselflm.org'),
  title: 'YourselfLM',
  description: 'YourselfLMは、LLMを活用して自己理解を深めるためのツールです。ユーザーは、LLMとの対話を通じて自己分析や目標設定を行い、自己成長を促進します。',
  manifest: '/manifest.json',
  icons: {
    icon: '/favicon.ico',
    shortcut: '/favicon.ico',
    apple: '/apple-icon.png',
  },
  openGraph: {
    title: 'YourselfLM',
    description: 'YourselfLMは、LLMを活用して自己理解を深めるためのツールです。ユーザーは、LLMとの対話を通じて自己分析や目標設定を行い、自己成長を促進します。',
    url: 'https://www.yourselflm.org/',
    images: [
      {
        url: '/YourselfLM_OGP.jpg',
        width: 1200,
        height: 630,
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'YourselfLM',
    description: 'YourselfLMは、LLMを活用して自己理解を深めるためのツールです。ユーザーは、LLMとの対話を通じて自己分析や目標設定を行い、自己成長を促進します。',
    images: ['/YourselfLM_OGP.jpg'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
