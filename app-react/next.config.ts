import type { NextConfig } from 'next';

// Jehre's new front end. The pages keep the addresses of the current site (/compte/, later /admin/, /b/<boutique>/),
// with the final slash, so a page can replace its old version without a single link changing.
const config: NextConfig = {
  trailingSlash: true,
  reactStrictMode: true,
  poweredByHeader: false,
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
