import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [react(), tailwindcss()],
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./src/test/setup.ts'],
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            'vendor-react':   ['react', 'react-dom', 'react-router-dom'],
            'vendor-charts':  ['recharts'],
            'vendor-motion':  ['motion', 'framer-motion'],
            'vendor-qr':      ['react-qr-code'],
            'vendor-radix':   ['@radix-ui/react-dropdown-menu', '@radix-ui/react-slot'],
          },
        },
      },
    },
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      proxy: {
        // Forward API routes to the backend during development.
        // Every proxy entry uses a bypass so that browser page refreshes
        // (Accept: text/html) always serve the SPA rather than the API JSON.
        '/products': {
          target: 'http://127.0.0.1:8000',
          bypass(req) { if (req.headers['accept']?.includes('text/html')) return '/index.html'; },
        },
        '/orders': {
          target: 'http://127.0.0.1:8000',
          bypass(req) { if (req.headers['accept']?.includes('text/html')) return '/index.html'; },
        },
        '/auth': {
          target: 'http://127.0.0.1:8000',
          bypass(req) { if (req.headers['accept']?.includes('text/html')) return '/index.html'; },
        },
        '/public': {
          target: 'http://127.0.0.1:8000',
          bypass(req) { if (req.headers['accept']?.includes('text/html')) return '/index.html'; },
        },
        '/customers': {
          target: 'http://127.0.0.1:8000',
          bypass(req) { if (req.headers['accept']?.includes('text/html')) return '/index.html'; },
        },
        '/analytics': {
          target: 'http://127.0.0.1:8000',
          bypass(req) { if (req.headers['accept']?.includes('text/html')) return '/index.html'; },
        },
        '/settings': {
          target: 'http://127.0.0.1:8000',
          bypass(req) { if (req.headers['accept']?.includes('text/html')) return '/index.html'; },
        },
        '/users': {
          target: 'http://127.0.0.1:8000',
          bypass(req) { if (req.headers['accept']?.includes('text/html')) return '/index.html'; },
        },
        '/roles': {
          target: 'http://127.0.0.1:8000',
          bypass(req) { if (req.headers['accept']?.includes('text/html')) return '/index.html'; },
        },
        '/inventory': {
          target: 'http://127.0.0.1:8000',
          bypass(req) { if (req.headers['accept']?.includes('text/html')) return '/index.html'; },
        },
        '/ingredients': {
          target: 'http://127.0.0.1:8000',
          bypass(req) { if (req.headers['accept']?.includes('text/html')) return '/index.html'; },
        },
        '/attendance': {
          target: 'http://127.0.0.1:8000',
          bypass(req) { if (req.headers['accept']?.includes('text/html')) return '/index.html'; },
        },
        '/payroll': {
          target: 'http://127.0.0.1:8000',
          bypass(req) { if (req.headers['accept']?.includes('text/html')) return '/index.html'; },
        },
        '/locations': {
          target: 'http://127.0.0.1:8000',
          bypass(req) { if (req.headers['accept']?.includes('text/html')) return '/index.html'; },
        },
        '/health': {
          target: 'http://127.0.0.1:8000',
          bypass(req) { if (req.headers['accept']?.includes('text/html')) return '/index.html'; },
        },
        '/uploads': {
          target: 'http://127.0.0.1:8000',
        },
        '/ws': {
          target: 'http://127.0.0.1:8000',
          ws: true,
        },
      },
    },
  };
});
