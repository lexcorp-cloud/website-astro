// @ts-check
import { defineConfig } from 'astro/config';
import { loadEnv } from 'vite';
import sitemap from '@astrojs/sitemap';

const { PUBLIC_SITE_URL } = loadEnv(process.env.NODE_ENV ?? 'development', process.cwd(), '');

// Falls back to the Vercel-provided preview URL, then the production domain,
// so canonical/OG/sitemap URLs stay correct on preview deployments too.
const site =
  PUBLIC_SITE_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://www.lexcorp.com.np');

// https://astro.build/config
export default defineConfig({
  site,
  integrations: [sitemap()],
});
