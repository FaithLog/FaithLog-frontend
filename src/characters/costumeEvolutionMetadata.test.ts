import {describe,expect,it} from 'vitest';
import {BIBLE_FRIEND_DESIGN_SPECIES,BIBLE_FRIEND_DESIGN_CATALOG} from './bibleFriendDesignCatalog';
import {COSTUME_EVOLUTION_SPECIES,COSTUME_EVOLUTION_STYLES,COSTUME_EVOLUTION_LEVELS,COSTUME_EVOLUTION_COUNT} from './costumeEvolutionMetadata';

describe('costume-stage coverage',()=>{
  it('keeps 117 existing costume identities and covers two stages each',()=>{
    expect(COSTUME_EVOLUTION_SPECIES).toHaveLength(13);
    expect(COSTUME_EVOLUTION_STYLES).toHaveLength(9);
    expect(COSTUME_EVOLUTION_LEVELS).toEqual([1,2]);
    expect(COSTUME_EVOLUTION_COUNT).toBe(234);
    expect([...COSTUME_EVOLUTION_SPECIES].sort()).toEqual(BIBLE_FRIEND_DESIGN_SPECIES.map(x=>x.id).sort());
    for(const speciesId of COSTUME_EVOLUTION_SPECIES)for(const styleId of COSTUME_EVOLUTION_STYLES){
      expect(BIBLE_FRIEND_DESIGN_CATALOG.some(d=>d.id===`${speciesId}:${styleId}`)).toBe(true);
    }
  });
});
