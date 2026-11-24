import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = { title: 'Atlas · Jehre', robots: { index: false, follow: false } };

export default function AtlasLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
