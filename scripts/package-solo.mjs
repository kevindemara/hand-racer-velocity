import { deflateRawSync } from 'node:zlib';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { deploymentFiles } from './solo-artifacts.mjs';

const files = await deploymentFiles(fileURLToPath(new URL('../dist-namecheap/', import.meta.url)));
const table = Array.from({length:256},(_,n)=>{for(let i=0;i<8;i++)n=(n>>>1)^((n&1)?0xedb88320:0);return n>>>0;});
function crc32(bytes) { let crc=0xffffffff;for(const byte of bytes)crc=(crc>>>8)^table[(crc^byte)&255];return (crc^0xffffffff)>>>0; }
const local=[],central=[];let offset=0;
for (const {name,data} of files) {
  const filename=Buffer.from(name),compressed=deflateRawSync(data,{level:9}),crc=crc32(data);
  const header=Buffer.alloc(30);header.writeUInt32LE(0x04034b50,0);header.writeUInt16LE(20,4);header.writeUInt16LE(0x800,6);header.writeUInt16LE(8,8);header.writeUInt16LE(33,12);
  header.writeUInt32LE(crc,14);header.writeUInt32LE(compressed.length,18);header.writeUInt32LE(data.length,22);header.writeUInt16LE(filename.length,26);
  local.push(header,filename,compressed);
  const entry=Buffer.alloc(46);entry.writeUInt32LE(0x02014b50,0);entry.writeUInt16LE(20,4);entry.writeUInt16LE(20,6);header.copy(entry,8,6,30);entry.writeUInt32LE(offset,42);
  central.push(entry,filename);offset+=header.length+filename.length+compressed.length;
}
const directory=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(files.length,8);end.writeUInt16LE(files.length,10);end.writeUInt32LE(directory.length,12);end.writeUInt32LE(offset,16);
const archive=Buffer.concat([...local,directory,end]);
await writeFile(new URL('../velocity-namecheap-solo.zip',import.meta.url),archive);
console.log(`Packaged ${files.length} validated static files (${(archive.length/1024/1024).toFixed(2)} MiB): velocity-namecheap-solo.zip`);
