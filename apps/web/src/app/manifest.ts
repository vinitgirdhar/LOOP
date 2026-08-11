import type { MetadataRoute } from 'next';

/**
 * The web app manifest.
 *
 * A metadata route rather than a static public/manifest.json so the theme
 * colours stay in one place with the rest of the app metadata, and so the
 * start URL follows the deployment rather than being hard-coded.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Loop — project workspace',
    short_name: 'Loop',
    description: 'Projects, docs, sprints and chat in one workspace, with an AI layer that shows its evidence.',
    // Signed-in people land on the workspace picker, which redirects onward.
    start_url: '/app',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait-primary',
    background_color: '#ffffff',
    theme_color: '#131314',
    categories: ['productivity', 'business'],
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'My tasks', url: '/app?go=tasks' },
      { name: 'Boards', url: '/app?go=boards' },
    ],
  };
}
