import { build } from 'vite';
// MediaPipe's WASM loader uses importScripts, which requires a classic worker.
await build({ configFile: false, publicDir: false, logLevel: 'warn', build: {
  lib: { entry: 'public/src/gesture-worker.js', name: 'VelocityGestureWorker', formats: ['iife'], fileName: () => 'gesture-worker.js' },
  outDir: 'public/vendor', emptyOutDir: false, minify: true
} });
