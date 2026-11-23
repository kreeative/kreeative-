import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { AdminProvider } from '@/components/admin/AdminContext';
import { AdminShell } from '@/components/admin/AdminShell';

export const metadata: Metadata = { title: 'Tableau de bord', robots: { index: false, follow: false } };

function Loading() {
  return <div role="status" style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', color: 'var(--muted)', fontSize: 'var(--fs-sm)' }}>Ouverture de votre tableau de bord…</div>;
}

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <AdminProvider fallback={<Loading />}>
      <AdminShell>{children}</AdminShell>
    </AdminProvider>
  );
}
