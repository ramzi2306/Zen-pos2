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
          manualChunks(id: string) {
            // Stable vendor chunks — content rarely changes so they stay cached
            if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/') || id.includes('node_modules/react-router-dom/')) return 'vendor-react';
            if (id.includes('node_modules/recharts/')) return 'vendor-charts';
            if (id.includes('node_modules/motion/') || id.includes('node_modules/framer-motion/')) return 'vendor-motion';
            if (id.includes('node_modules/react-qr-code/')) return 'vendor-qr';
            if (id.includes('node_modules/@radix-ui/')) return 'vendor-radix';
            if (id.includes('node_modules/lucide-react/')) return 'vendor-icons';

            // App-level code splits — each lazy route gets its own chunk
            if (id.includes('src/views/AdminViews')) return 'view-admin';
            if (id.includes('src/views/OrdersView')) return 'view-orders';
            if (id.includes('src/views/MenuView')) return 'view-menu';
            if (id.includes('src/views/AttendanceView')) return 'view-attendance';
            if (id.includes('src/views/public/')) return 'view-public';
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
