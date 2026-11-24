import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { AdminProvider } from '@/components/admin/AdminContext';
import { AdminShell } from '@/components/admin/AdminShell';
import { CloudLoader } from '@/components/ui/CloudLoader';

export const metadata: Metadata = { title: 'Tableau de bord', robots: { index: false, follow: false } };

function Loading() {
  return <CloudLoader full label="Ouverture de votre tableau de bord…" />;
}

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <AdminProvider fallback={<Loading />}>
      <AdminShell>{children}</AdminShell>
    </AdminProvider>
  );
}
