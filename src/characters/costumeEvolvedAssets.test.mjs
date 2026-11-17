import {test} from 'node:test';
import {existsSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import assert from 'node:assert/strict';
const species = ["david-lamb", "noah-bear", "jonah-whale", "daniel-lion", "peace-dove", "hope-rabbit", "word-fox", "gentle-deer", "companion-donkey", "joy-chick", "peace-penguin", "love-otter", "patience-turtle"];
const styles = ["sunshine", "scholar", "gardener", "sailor", "explorer", "festival", "starlight", "royal", "unique"];
test('234 PNG atlases are present and valid',()=>{
  let count=0;
  const root=join(process.cwd(),'assets/characters/bible-friends/evolved/costume-stages');
  for(const sp of species)for(const style of styles)for(const lv of [2,3]){
    const file=join(root,sp+'--'+style+'--lv'+lv+'.png');
    assert.ok(existsSync(file),file);
    const content=readFileSync(file);
    assert.ok(content.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])));
    assert.equal(content.readUInt32BE(16),768);
    assert.equal(content.readUInt32BE(20),768);
    count++;
  }
  assert.equal(count,234);
});
