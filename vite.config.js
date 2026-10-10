import { defineConfig } from 'vite';

// The dev server proxies /api to the Node server so the browser only talks to one origin.
export default defineConfig({
  root: '.',
  publicDir: 'public',
  server: {
    host: '0.0.0.0',
    allowedHosts: true,
    proxy: { '/api': 'http://localhost:8080' },
  },
  preview: { host: '0.0.0.0', allowedHosts: true, proxy: { '/api': 'http://localhost:8080' } },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 2000,
  },
});
