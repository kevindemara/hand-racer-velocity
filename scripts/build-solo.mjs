import { build } from 'vite';
import { cp, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import config from '../vite.solo.config.js';
import './prepare-worker.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
await build({ configFile: fileURLToPath(new URL('../vite.solo.config.js', import.meta.url)) });
// Explicit runtime allowlist: never copy the repository, backend, legacy app, or local data.
for (const name of ['assets/car.png', 'assets/generated/asphalt.png', 'assets/models/gesture_recognizer.task', 'vendor/gesture-worker.js', 'vendor/mediapipe']) {
  const destination = new URL(`../dist-namecheap/${name}`, import.meta.url);
  await mkdir(new URL('.', destination), { recursive:true });
  await cp(new URL(`../public/${name}`, import.meta.url), destination, { recursive:true });
}
await writeFile(new URL('../dist-namecheap/.htaccess', import.meta.url), `# Velocity Solo: static files only. No rewrite, PHP, or proxy rules.
DirectoryIndex index.html
<IfModule mod_mime.c>
  AddType application/wasm .wasm
  AddType text/javascript .js
</IfModule>
<IfModule mod_headers.c>
  <FilesMatch "\\.(html|js|css|wasm|task|png)$">
    Header set Cache-Control "public, max-age=0, must-revalidate"
  </FilesMatch>
</IfModule>
`);
await writeFile(new URL('../dist-namecheap/build-info.json', import.meta.url), JSON.stringify({ edition:'solo', base:config.base }) + '\n');
console.log(`Solo static files ready: ${root}dist-namecheap`);
