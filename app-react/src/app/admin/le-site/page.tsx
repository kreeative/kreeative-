'use client';

import { useAdmin } from '@/components/admin/AdminContext';
import { Empty, PageHead } from '@/components/admin/AdminShell';
import { TisheSite } from '@/components/tishe/TisheSite';

/** « Le site » of The Ivory Sukundu (its own site). A Jehre store has its own pages for this. */
export default function Page() {
  const { tishe } = useAdmin();
  if (tishe.on) return <TisheSite />;
  return <><PageHead title="Le site" /><Empty icon="store" title="Pour The Ivory Sukundu">Cette page sert à The Ivory Sukundu. Votre boutique Jehre se règle dans l’éditeur et dans Branding.</Empty></>;
}
