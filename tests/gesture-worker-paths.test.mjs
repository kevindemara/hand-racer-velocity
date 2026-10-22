import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

test('classic gesture worker resolves nested Solo assets and the Full diagnostics origin fallback',async()=>{
  for(const [init,base] of [[{baseUrl:'https://play.example/velocity/'},'https://play.example/velocity/'],[{origin:'https://full.example'},'https://full.example/']]){
    let wasm,options;const messages=[];
    const context=vm.createContext({URL,self:{postMessage:data=>messages.push(data)},
      FilesetResolver:{forVisionTasks:async path=>{wasm=path;return {}; }},
      GestureRecognizer:{createFromOptions:async(_vision,value)=>{options=value;return {recognizeForVideo:()=>({landmarks:[]})};}}});
    const source=readFileSync(new URL('../public/src/gesture-worker.js',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'');
    vm.runInContext(source,context);await context.self.onmessage({data:{type:'init',...init}});
    assert.equal(wasm,base+'vendor/mediapipe');assert.equal(options.baseOptions.modelAssetPath,base+'assets/models/gesture_recognizer.task');assert.equal(messages[0].type,'ready');
    let closed=false;await context.self.onmessage({data:{type:'frame',bitmap:{close(){closed=true;}},timestamp:100}});
    assert.equal(messages[1].type,'result');assert.equal(closed,true);
  }
});
