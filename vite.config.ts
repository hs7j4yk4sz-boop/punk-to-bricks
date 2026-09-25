import { defineConfig } from 'vite';

// Relative base: the same build works on Netlify and on GitHub Pages (sub-path).
export default defineConfig({
  base: './',
  worker: { format: 'es' },
  build: { target: 'es2022', chunkSizeWarningLimit: 1200 },
});
