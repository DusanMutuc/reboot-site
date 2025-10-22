import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      // Object endpoint (no transform)
      {
        protocol: 'https',
        hostname: 'zmkmgxrnhdnbpiblkkkk.supabase.co',
        pathname: '/storage/v1/object/public/course-heroes/**',
      },
      // Render endpoint (used when getPublicUrl has { transform })
      {
        protocol: 'https',
        hostname: 'zmkmgxrnhdnbpiblkkkk.supabase.co',
        pathname: '/storage/v1/render/image/public/course-heroes/**',
      },
    ],
    // If you ever serve SVGs from storage:
    // dangerouslyAllowSVG: true,
  },

  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Content-Security-Policy',
            value:
              "frame-ancestors 'self' https://lookerstudio.google.com https://*.lookerstudio.google.com;",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
