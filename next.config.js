/* eslint-disable @typescript-eslint/no-require-imports -- Configuração CommonJS carregada pelo Next.js. */
const path = require('path');

const dev = process.env.NODE_ENV !== 'production';
const configuredCpus = Number.parseInt(process.env.NEXT_BUILD_CPUS || '2', 10);
const buildCpus = Number.isFinite(configuredCpus) ? Math.min(8, Math.max(1, configuredCpus)) : 2;

// CSP: scripts/estilos inline são necessários ao Next sem nonce; imagens vêm de CDNs das fontes (https:) e tiles do OSM.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
];

/** @type {import('next').NextConfig} */
module.exports = {
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: { cpus: buildCpus },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
  webpack: (config) => {
    config.resolve.alias['@'] = path.resolve(__dirname, 'src');
    return config;
  },
};
