import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  root: 'public',
  publicDir: false,
  build: { outDir: '../dist', emptyOutDir: true, chunkSizeWarningLimit: 900,
    rolldownOptions:{input:{game:fileURLToPath(new URL('public/index.html',import.meta.url)),diagnostics:fileURLToPath(new URL('public/diagnostics.html',import.meta.url))}} },
  server: { fs: { allow: ['..'] }, hmr: false },
  worker: { format: 'es' }
});
