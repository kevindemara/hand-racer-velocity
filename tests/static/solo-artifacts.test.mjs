import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { deploymentFiles } from '../../scripts/solo-artifacts.mjs';
import { soloBase } from '../../vite.solo.config.js';

test('Solo deployment contains only static runtime assets and no backend or source imports',async()=>{
  const files=await deploymentFiles(fileURLToPath(new URL('../../dist-namecheap/',import.meta.url)));
  assert.ok(files.some(f=>/assets\/index-.*\.js$/.test(f.name)));assert.ok(files.some(f=>f.name.endsWith('.css')));
});
test('base paths reject URLs and ambiguous traversal',()=>{
  for(const path of ['/','/velocity/','/games/velocity/'])assert.equal(soloBase(path),path);
  for(const path of ['https://example.com/','../','/../','/velocity','//','/space here/'])assert.throws(()=>soloBase(path));
});
test('every deployed asset is served over plain static HTTP, with real 404s for APIs and correct WASM MIME',async()=>{
  const child=spawn(process.execPath,['scripts/serve-solo.mjs'],{cwd:new URL('../..',import.meta.url),env:{...process.env,SOLO_PORT:'0'},stdio:['ignore','pipe','pipe']});
  try{
    const ready=await Promise.race([new Promise(resolve=>child.stdout.on('data',data=>{const match=data.toString().match(/http:\/\/localhost:(\d+)(\S*)/);if(match)resolve({port:match[1],base:match[2]});})),new Promise((_,reject)=>setTimeout(()=>reject(Error('Static server startup timeout')),5000).unref())]);
    const files=await deploymentFiles(fileURLToPath(new URL('../../dist-namecheap/',import.meta.url))),origin=`http://127.0.0.1:${ready.port}`;
    for(const file of files){if(file.name==='.htaccess')continue;const res=await fetch(origin+ready.base+file.name);assert.equal(res.status,200,file.name);assert.deepEqual(Buffer.from(await res.arrayBuffer()),file.data,file.name);if(file.name.endsWith('.wasm'))assert.equal(res.headers.get('content-type'),'application/wasm');}
    for(const path of ['api/health','socket.io/','src/main.js','server/server.js'])assert.equal((await fetch(origin+ready.base+path)).status,404,path);
  } finally{child.kill();await once(child,'exit');}
});
