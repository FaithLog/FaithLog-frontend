import {vi} from 'vitest';
vi.mock('react-native',()=>({Image:'Image',View:'View'}));
import {expect,it} from 'vitest';
import {BIBLE_FRIEND_DESIGN_CATALOG} from './bibleFriendDesignCatalog';
import {BIBLE_FRIEND_DEFAULT_DRAW_POOL,getBibleFriendDesignProbability,pickBibleFriendDesign} from './bibleFriendDesignDraw';
it('includes one miracle at exactly 0.01 percent and selects its ticket boundary',()=>{
 expect(BIBLE_FRIEND_DESIGN_CATALOG.filter(d=>d.rarity==='MIRACLE')).toHaveLength(1);
 const p=BIBLE_FRIEND_DEFAULT_DRAW_POOL;
 expect(getBibleFriendDesignProbability(p,'jesus:miracle')).toBe(0.0001);
 expect(pickBibleFriendDesign(p,1-Number.EPSILON).id).toBe('jesus:miracle');
 expect(Object.values(p.rarityWeights).reduce((a,b)=>a+b,0)).toBe(p.totalWeight);
});

import {getJesusMiracleFrame} from './JesusMiracleSprite';
it('plays all 80 supplied frames in bounded motion ranges',()=>{
 const cases=[['idle',20,120],['walk',20,80],['happy',20,80],['held',10,120],['land',10,60]] as const;
 const frames=new Set<number>();
 for(const [motion,count,duration] of cases){for(let i=0;i<count;i++)frames.add(getJesusMiracleFrame(motion,i*duration));}
 expect([...frames].sort((a,b)=>a-b)).toEqual(Array.from({length:80},(_,i)=>i));
 expect(getJesusMiracleFrame('happy',100000)).toBe(59);
 expect(getJesusMiracleFrame('land',100000)).toBe(79);
 expect(getJesusMiracleFrame('idle',NaN)).toBe(0);
});
