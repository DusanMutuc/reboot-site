import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
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

      // Local Supabase Storage for development and lifecycle verification.
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
