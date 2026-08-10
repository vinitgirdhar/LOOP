import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { NextConfig } from 'next';

/**
 * Next only reads .env files next to the app, but this is a monorepo and the
 * single source of truth is the .env at the repo root. Anything already set —
 * apps/web/.env.local, or a real environment variable on Vercel — wins; this
 * only fills the gaps, so local dev stops silently booting with an empty
 * Supabase URL.
 */
function loadRootEnv() {
  const file = resolve(process.cwd(), '../../.env');
  if (!existsSync(file)) return;

  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;

    const [, key, rawValue] = match;
    // An empty value counts as unset — apps/web/.env.local ships the keys
    // blank, and treating those as "already defined" is what hid the missing
    // Supabase config in the first place.
    if (process.env[key]) continue;

    const value = rawValue.trim().replace(/^(['"])([\s\S]*)\1$/, '$2');
    if (value) process.env[key] = value;
  }
}

loadRootEnv();

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // The shared package ships raw TypeScript, so Next compiles it with the app.
  transpilePackages: ['@loop/shared'],
  env: {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '*.supabase.co' },
      { protocol: 'https', hostname: 'api.dicebear.com' },
      { protocol: 'https', hostname: 'lh3.googleusercontent.com' },
    ],
  },
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
