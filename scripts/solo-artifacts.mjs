import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

export async function deploymentFiles(root) {
  const result = [];
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes:true })) {
      const file = join(directory, entry.name);
      if (entry.isSymbolicLink()) throw Error('Deployment may not contain symbolic links.');
      if (entry.isDirectory()) await visit(file);
      else result.push({ name:relative(root, file).replaceAll('\\','/'), data:await readFile(file) });
    }
  }
  await visit(root);
  result.sort((a,b) => a.name.localeCompare(b.name));
  const names = result.map(f => f.name);
  const required = ['index.html','.htaccess','build-info.json','assets/generated/asphalt.png',
    'assets/models/gesture_recognizer.task','vendor/gesture-worker.js',
    ...['vision_wasm_internal','vision_wasm_nosimd_internal','vision_wasm_module_internal'].flatMap(n => [`vendor/mediapipe/${n}.js`,`vendor/mediapipe/${n}.wasm`])];
  for (const name of required) if (!names.includes(name)) throw Error(`Missing deployment asset: ${name}`);
  for (const {name,data} of result) {
    if (!/^(index\.html|\.htaccess|build-info\.json|assets\/(?:[\w-]+\.(?:js|css|png)|generated\/asphalt\.png|models\/gesture_recognizer\.task)|vendor\/(?:gesture-worker\.js|mediapipe\/vision_wasm_(?:nosimd_|module_)?internal\.(?:js|wasm)))$/.test(name)) throw Error(`Unexpected deployment file: ${name}`);
    if ((name.startsWith('assets/') && /\.(js|css)$/.test(name)) || name === 'index.html') {
      if (/\/api\/|socket\.io|WebSocket|@vite\/client|\/src\/|localhost|sourceMappingURL/.test(data.toString())) throw Error(`Backend or development reference in ${name}`);
    }
  }
  const html = result.find(f=>f.name==='index.html').data.toString();
  if (/id="(?:quick-match|create-room|join-room|resume-room|race-lobby|share-room)"/.test(html)) throw Error('Solo HTML contains multiplayer controls.');
  const {base} = JSON.parse(result.find(f=>f.name==='build-info.json').data);
  for (const [,url] of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
    if (url===base) continue;
    if (!url.startsWith(base) || !names.includes(url.slice(base.length))) throw Error(`Unresolved deployed URL: ${url}`);
  }
  return result;
}
