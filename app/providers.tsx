'use client';

import { ReactNode } from 'react';
import { MockQueryProvider } from '@/lib/mockQueryClient';

export default function Providers({ children }: { children: ReactNode }) {
  return <MockQueryProvider>{children}</MockQueryProvider>;
}
