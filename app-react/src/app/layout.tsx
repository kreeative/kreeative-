import type { Metadata, Viewport } from 'next';
import { Poppins } from 'next/font/google';
import type { ReactNode } from 'react';
import '@/styles/globals.css';

// Poppins everywhere, in the four weights Jehre uses; served from Jehre's own address (no request to Google).
const poppins = Poppins({ subsets: ['latin', 'latin-ext'], weight: ['400', '500', '600', '700'], display: 'swap', variable: '--font-poppins' });

export const metadata: Metadata = {
  metadataBase: new URL('https://jehre.com'),
  title: { default: 'Jehre', template: '%s · Jehre' },
  description: 'Votre boutique en ligne, vos commandes WhatsApp, le paiement mobile money et la livraison, au même endroit.',
  icons: { icon: '/favicon.svg' },
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#FFFFFF' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr" className={poppins.variable}>
      <body style={{ fontFamily: 'var(--font-poppins), var(--font)' }}>{children}</body>
    </html>
  );
}
