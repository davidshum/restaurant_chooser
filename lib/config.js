import { fileURLToPath } from 'node:url';

// Load .env if present (Node >= 20.12). Real environment variables win.
try { process.loadEnvFile(fileURLToPath(new URL('../.env', import.meta.url))); } catch {}

export const config = {
  yelpKey: process.env.YELP_API_KEY || '',
  googleKey: process.env.GOOGLE_PLACES_API_KEY || '',
  bestTimeKey: process.env.BESTTIME_API_KEY_PRIVATE || '',
  port: Number(process.env.PORT) || 3000,
  dataFile: process.env.DATA_FILE || fileURLToPath(new URL('../data/family.json', import.meta.url)),
  forceDemo: process.env.DEMO === '1',
};

export const isDemo = () => config.forceDemo || (!config.yelpKey && !config.googleKey);
