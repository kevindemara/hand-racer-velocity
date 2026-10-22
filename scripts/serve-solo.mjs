// Local preview only; this file is never part of the deployment ZIP.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=resolve(process.argv[2] || fileURLToPath(new URL('../dist-namecheap/',import.meta.url)));
const {base}=JSON.parse(await readFile(resolve(root,'build-info.json'),'utf8'));
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.wasm':'application/wasm','.png':'image/png','.json':'application/json','.task':'application/octet-stream'};
const server=createServer(async(req,res)=>{
  try {
    const path=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    if(base!=='/' && path===base.slice(0,-1)){res.writeHead(302,{Location:base});res.end();return;}
    if(!path.startsWith(base))throw Error('Outside base');
    const file=resolve(root,path.slice(base.length)||'index.html');
    if(!file.startsWith(root+sep))throw Error('Outside root');
    const body=await readFile(file);res.writeHead(200,{'Content-Type':types[extname(file)]||'application/octet-stream','Cache-Control':'no-cache'});res.end(body);
    console.log(`200 ${path}`);
  } catch {res.writeHead(404);res.end('Not found');console.log(`404 ${req.url}`);}
});
server.listen(Number(process.env.SOLO_PORT||4173),'127.0.0.1',()=>console.log(`Solo static preview: http://localhost:${server.address().port}${base}`));
