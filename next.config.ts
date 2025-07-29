// next.config.js  (CommonJS style – works without "type": "module")

/** @type {import('next').NextConfig} */
module.exports = {
  async headers() {
    return [
      {
        // apply to every route
        source: '/:path*',
        headers: [
          {
            key: 'Content-Security-Policy',
            // Allow Looker Studio and your own site to embed each other
            value: "frame-ancestors 'self' https://lookerstudio.google.com https://*.lookerstudio.google.com;",
          },
        ],
      },
    ];
  },
};
