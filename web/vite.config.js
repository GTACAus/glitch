import { fileURLToPath, URL } from 'node:url';

import { defineConfig, loadEnv } from 'vite';
import vue from '@vitejs/plugin-vue';
import vueDevTools from 'vite-plugin-vue-devtools';

// Paths handled by server.py rather than the Vue app. These are prefix matches, so keep the
// trailing slashes: '/p' alone would also swallow Vue routes like '/projects'.
const backendPaths = [
  '/api/', // JSON API
  '/p/', // live project previews (/p/<name>/...)
  '/login', // sets the glitch_key cookie, then redirects to /
  '/_glitch/', // bridge.js injected into previews
  '/static/', // style.css and favicon, still shared with the old pages
];

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // In dev, Vite serves the Vue app and forwards everything server.py owns to it.
  // Start the backend first (python server.py serve). Its port comes from GLITCH_PORT, read the same
  // way server.py reads it: the environment first, then glitch's .env, else 8090.
  const env = loadEnv(mode, fileURLToPath(new URL('..', import.meta.url)), 'GLITCH_');
  const backend = `http://127.0.0.1:${env.GLITCH_PORT || 8090}`;

  return {
    plugins: [vue(), vueDevTools()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      proxy: Object.fromEntries(backendPaths.map((p) => [p, { target: backend }])),
    },
  };
});
