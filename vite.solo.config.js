import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

export function soloBase(value = '/') {
  if (!/^\/(?:[a-zA-Z0-9_-]+\/)*$/.test(value)) throw Error('VELOCITY_BASE must be / or a path such as /velocity/ (including the trailing slash).');
  return value;
}

export default defineConfig({
  root: 'public', publicDir: false, base: soloBase(process.env.VELOCITY_BASE || '/'),
  define: { __VELOCITY_SOLO__: 'true' },
  resolve: { alias: [{ find: './network.js', replacement: fileURLToPath(new URL('public/src/network-solo.js', import.meta.url)) }] },
  plugins: [{ name: 'velocity-solo-html', transformIndexHtml: { order:'pre', handler(html) {
    return html.replace(/<!-- full-only:start -->[\s\S]*?<!-- full-only:end -->/g, '')
      .replace('Velocity · Hand Racer 3D', 'Velocity Solo · Hand Racer 3D')
      .replace('HAND RACER / 3D', 'SOLO EDITION / 3D')
      .replace('href="/"', 'href="%BASE_URL%"')
      .replace('>Records</button>', '>Your records</button>')
      .replace('Verified records', 'Your records')
      .replace('Current track, event, difficulty and distance. Solo replays are verified before publishing.',
        'Personal bests for the selected course and event, across cars and setups. Stored in this browser only; not globally ranked or synchronized.');
  } } }],
  build: { outDir:'../dist-namecheap', emptyOutDir:true, sourcemap:false, chunkSizeWarningLimit:900,
    rolldownOptions:{ input:fileURLToPath(new URL('public/index.html',import.meta.url)) } }
});
