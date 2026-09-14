/** @type {import('next').NextConfig} */

// Suppress npm update notifier and telemetry (no internet access in this environment)
process.env.NO_UPDATE_NOTIFIER = '1';
process.env.NEXT_TELEMETRY_DISABLED = '1';

const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'http', hostname: 'localhost' },
    ],
  },
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'https://localhost:5001/api/:path*',
      },
    ];
  },
};

module.exports = nextConfig;
