import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [react(), tailwindcss()],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      proxy: {
        // Forward API routes to the backend during development
        '/products': 'http://127.0.0.1:8000',
        '/orders': 'http://127.0.0.1:8000',
        '/auth': 'http://127.0.0.1:8000',
        '/public': 'http://127.0.0.1:8000',
        '/customers': 'http://127.0.0.1:8000',
        '/analytics': 'http://127.0.0.1:8000',
        '/settings': 'http://127.0.0.1:8000',
        '/users': 'http://127.0.0.1:8000',
        '/roles': 'http://127.0.0.1:8000',
        '/inventory': 'http://127.0.0.1:8000',
        '/ingredients': 'http://127.0.0.1:8000',
        '/attendance': 'http://127.0.0.1:8000',
        '/payroll': 'http://127.0.0.1:8000',
        '/locations': 'http://127.0.0.1:8000',
        '/health': 'http://127.0.0.1:8000',
        '/ws': {
          target: 'http://127.0.0.1:8000',
          ws: true,
        },
      },
    },
  };
});
