import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {join} from 'node:path';

const ids=["action-clean","action-evolve","action-feed","action-pet","action-play","action-sleep","badge-lv1","badge-lv2","badge-lv3","fx-clean","fx-evolve","fx-heart","fx-sparkles","state-dirty","state-happy","state-hungry","state-selected","state-sick","state-sleepy","status-affection","status-cleanliness","status-health","status-hunger","status-joy"];
const dir=join(process.cwd(),'assets','companions','farm-hud');
test('24 transparent PNG assets and editable vector originals are present',()=>{
 assert.equal(ids.length,24);
 assert.equal(new Set(ids).size,24);
 for(const id of ids){
  const png=join(dir,id+'.png'),svg=join(dir,id+'.svg');
  assert.ok(existsSync(png),png);
  assert.ok(existsSync(svg),svg);
  const bytes=readFileSync(png);
  assert.deepEqual([...bytes.subarray(0,8)],[137,80,78,71,13,10,26,10]);
  assert.equal(bytes.readUInt32BE(16),192);
  assert.equal(bytes.readUInt32BE(20),192);
  assert.equal(bytes[25],6);
  assert.ok(readFileSync(svg,'utf8').includes('viewBox="0 0 96 96"'));
 }
});
