import test from 'node:test';
import assert from 'node:assert/strict';
import {DrivingInput,gamepadAxis} from '../public/src/input.js';

test('analog steering starts smoothly outside the dead zone and retains full lock',()=>{
  for(const deadzone of [.04,.12,.3]){
    assert.equal(gamepadAxis(deadzone,deadzone),0);assert.equal(gamepadAxis(-deadzone,deadzone),0);
    assert.ok(gamepadAxis(deadzone+.001,deadzone)<.002);
    assert.equal(gamepadAxis(1,deadzone),1);assert.equal(gamepadAxis(-1,deadzone),-1);
    assert.equal(gamepadAxis(4,deadzone),1);assert.equal(gamepadAxis(NaN,deadzone),0);assert.equal(gamepadAxis(undefined,deadzone),0);
  }
});

test('controller triggers, face buttons, stick drift and disconnect release produce bounded input',()=>{
  globalThis.window={addEventListener(){}};globalThis.document={querySelectorAll:()=>[]};let pads=[];
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{getGamepads:()=>pads}});
  const input=new DrivingInput({gamepadDeadzone:.2,bindings:{throttle:'KeyW',brake:'Space',left:'KeyA',right:'KeyD',nitro:'ShiftLeft',drift:'KeyX'}});
  pads=[null,{connected:true,axes:[.19],buttons:Array.from({length:8},()=>({value:0,pressed:false}))}];
  assert.equal(input.read().steer,0);pads[1].axes[0]=.6;assert.ok(Math.abs(input.read().steer-.5)<1e-9);
  pads[1].buttons[7].value=4;assert.equal(input.read().throttle,1);pads[1].buttons[7].value=0;pads[1].buttons[0].pressed=true;assert.equal(input.read().throttle,1);
  pads[1].buttons[6].value=.45;assert.equal(input.read().brake,.45);pads[1].buttons[4].pressed=true;pads[1].buttons[5].pressed=true;assert.equal(input.read().nitro,true);assert.equal(input.read().drift,true);
  pads=[];assert.deepEqual(input.read(),{throttle:0,brake:0,steer:0,nitro:false,drift:false});
});

test('missing axes/buttons or a blocked gamepad API do not break keyboard driving',()=>{
  globalThis.window={addEventListener(){}};globalThis.document={querySelectorAll:()=>[]};
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{getGamepads:()=>[{connected:true}]}});
  const input=new DrivingInput({bindings:{throttle:'KeyW',brake:'Space',left:'KeyA',right:'KeyD',nitro:'ShiftLeft',drift:'KeyX'}});input.keys.add('KeyW');
  assert.equal(input.read().throttle,1);assert.equal(input.read().steer,0);
  navigator.getGamepads=()=>{throw Error('blocked');};assert.equal(input.read().throttle,1);
});
