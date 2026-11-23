import type { NextConfig } from 'next';

// Jehre's new front end. The pages keep the addresses of the current site (/compte/, later /admin/, /b/<boutique>/),
// with the final slash, so a page can replace its old version without a single link changing.
/** Where the current (hand-written) site answers besides jehre.com. */
const LEGACY = process.env.LEGACY_ORIGIN ?? 'https://jeere.kreeative.xyz';

const config: NextConfig = {
  trailingSlash: true,
  skipTrailingSlashRedirect: true,      // an address of the current site is passed on as it was asked
  reactStrictMode: true,
  poweredByHeader: false,
  // Every address this app does not own yet (the home page, a public store /b/<boutique>/ with its cart and its
  // payment, the store engine's files in /creer/, the legal pages…) is answered by the current site, as it is.
  // A page moves here by being written here: its address then stops falling back. Nothing changes for visitors.
  async rewrites() {
    return {
      beforeFiles: [], afterFiles: [],
      fallback: [
        // a file keeps its name; a page keeps its final slash (the current site redirects /b to /b/, so asking
        // it for a page without the slash would loop)
        { source: '/:path(.*\\.[A-Za-z0-9]{1,8})', destination: `${LEGACY}/:path` },
        { source: '/api/:path*', destination: `${LEGACY}/api/:path*` },
        { source: '/', destination: `${LEGACY}/` },
        { source: '/:path*', destination: `${LEGACY}/:path*/` },
      ],
    };
  },
  async headers() {
    return [{
      source: '/:path*',
      headers: [
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), browsing-topics=()' },
      ],
    }];
  },
};

export default config;
