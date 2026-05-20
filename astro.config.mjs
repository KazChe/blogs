// @ts-check
import { defineConfig } from 'astro/config';

import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  // Set SITE_URL in CI / .env once the custom domain is attached to the DO Space.
  // Used for canonical URLs and OG meta. Falls back to a placeholder for local builds.
  site: process.env.SITE_URL ?? 'https://example.com',
  output: 'static',
  trailingSlash: 'ignore',
  build: {
    format: 'directory',
  },
  markdown: {
    shikiConfig: {
      theme: 'github-dark-dimmed',
      wrap: true,
    },
  },
  vite: {
    plugins: [tailwindcss()],
  },
});
