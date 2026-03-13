import type { Metadata } from 'next';
import './globals.css';
import Providers from './providers';

export const metadata: Metadata = {
  title: 'YourselfLM',
  description: 'YourselfLMは、LLMを活用して自己理解を深めるためのツールです。ユーザーは、LLMとの対話を通じて自己分析や目標設定を行い、自己成長を促進します。',
  openGraph: {
    title: 'YourselfLM',
    description: 'YourselfLMは、LLMを活用して自己理解を深めるためのツールです。ユーザーは、LLMとの対話を通じて自己分析や目標設定を行い、自己成長を促進します。',
    url: 'https://www.yourselflm.org/',
    images: [
      {
        url: '/api/favicon',
        width: 48,
        height: 48,
      },
    ],
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
