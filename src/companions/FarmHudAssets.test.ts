import {describe,expect,it} from 'vitest';
import {existsSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
const DIR=join(process.cwd(),'assets','companions','farm-hud');
const ICONS=["action-clean","action-evolve","action-feed","action-pet","action-play","action-sleep","badge-lv1","badge-lv2","badge-lv3","fx-clean","fx-evolve","fx-heart","fx-sparkles","state-dirty","state-happy","state-hungry","state-selected","state-sick","state-sleepy","status-affection","status-cleanliness","status-health","status-hunger","status-joy"];
describe('farm HUD visual assets',()=>{
 it('has 24 transparent PNG icons with original SVGs',()=>{
  expect(ICONS).toHaveLength(24);
  expect(new Set(ICONS).size).toBe(24);
  for(const id of ICONS){
   const png=join(DIR,id+'.png'),svg=join(DIR,id+'.svg');
   expect(existsSync(png)).toBe(true);
   expect(existsSync(svg)).toBe(true);
   const b=readFileSync(png);
   expect(b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))).toBe(true);
   expect(b.readUInt32BE(16)).toBe(192);
   expect(b.readUInt32BE(20)).toBe(192);
   expect(readFileSync(svg,'utf8')).toContain('viewBox="0 0 96 96"');
  }
 });
});
