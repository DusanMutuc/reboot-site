import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Local Supabase testing must not share generated chunks with another dev/build process.
  distDir: process.env.REBOOT_NEXT_DIST_DIR || '.next',
  outputFileTracingIncludes: {
    '/api/admin/discovery/guide': ['./docs/discovery-admin-quickref.html'],
  },
  images: {
    remotePatterns: [
      // Object endpoint (no transform) – course-heroes
      {
        protocol: 'https',
        hostname: 'zmkmgxrnhdnbpiblkkkk.supabase.co',
        pathname: '/storage/v1/object/public/course-heroes/**',
      },
      // Render endpoint (with transform) – course-heroes
      {
        protocol: 'https',
        hostname: 'zmkmgxrnhdnbpiblkkkk.supabase.co',
        pathname: '/storage/v1/render/image/public/course-heroes/**',
      },

      // Object endpoint (no transform) – achievements
      {
        protocol: 'https',
        hostname: 'zmkmgxrnhdnbpiblkkkk.supabase.co',
        pathname: '/storage/v1/object/public/achievements/**',
      },
      // Render endpoint (with transform) – achievements (future-proof)
      {
        protocol: 'https',
        hostname: 'zmkmgxrnhdnbpiblkkkk.supabase.co',
        pathname: '/storage/v1/render/image/public/achievements/**',
      },

      // Local Supabase Storage. Keep this development-only so production
      // continues to accept images solely from explicitly trusted hosts.
      ...(process.env.NODE_ENV === 'production'
        ? []
        : [
            {
              protocol: 'http' as const,
              hostname: '127.0.0.1',
              port: '54321',
              pathname: '/storage/v1/**',
            },
          ]),
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
            value: "frame-ancestors 'self';",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
