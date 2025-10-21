/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'zmkmgxrnhdnbpiblkkkk.supabase.co',
        pathname: '/storage/v1/object/public/course-heroes/**',
      },
    ],
    // optional: if you ever serve svgs from storage
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

module.exports = nextConfig;
