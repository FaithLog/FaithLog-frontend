#!/usr/bin/env python3
"""Generate reproducible FaithLog evolved-animal action PNG atlases.

Base art: project-owned, species-specific Lv2/Lv3 PNG motion atlases.
Derived action art: body pose/affine tweaks plus individually illustrated props,
facial marks, motion cues, sparkles and object interaction. This is *not*
44 separately hand-painted body drawings for every creature.

Usage: python tools/generate_faithlog_care_atlases.py --root .
"""
from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

SPECIES = (
    "david-lamb", "noah-bear", "jonah-whale", "daniel-lion", "peace-dove",
    "hope-rabbit", "word-fox", "gentle-deer", "companion-donkey", "joy-chick",
    "peace-penguin", "love-otter", "patience-turtle",
)
ACTIONS = (
    "feed", "play", "sleep", "wake", "pet", "dirty", "clean", "hungry",
    "sick", "faint", "evolve",
)
COLORS = {
    "ink": (108, 78, 60, 255), "gold": (242, 195, 109, 255),
    "cream": (255, 246, 225, 255), "sage": (132, 176, 144, 255),
    "sea": (154, 207, 208, 255), "rose": (241, 177, 172, 255),
}
S = 2  # oversampling for crisp outlines
FRAME = 192
FRAMES = 4


def _point(coords):
    return tuple(int(round(n * S)) for n in coords)


def _line(draw, points, fill, width=2, joint="curve"):
    draw.line([_point(p) for p in points], fill=fill, width=int(width * S), joint=joint)


def _ellipse(draw, box, fill, outline=None, width=2):
    draw.ellipse(_point(box), fill=fill, outline=outline, width=int(width * S))


def _poly(draw, points, fill, outline=None, width=2):
    pts = [_point(x) for x in points]
    draw.polygon(pts, fill=fill)
    if outline:
        _line(draw, pts + pts[:1], outline, width)


def _arc(draw, box, start, end, fill, width=2):
    draw.arc(_point(box), start, end, fill=fill, width=int(width * S))


def _star(draw, cx, cy, r, color):
    shape=[]
    for t in range(8):
        rad = r if t % 2 == 0 else r * .36
        angle= t * math.pi / 4 - math.pi / 2
        shape.append((cx + rad * math.cos(angle), cy + rad * math.sin(angle)))
    _poly(draw, shape, color, COLORS['cream'], 1)


def _heart(draw, x, y, scale=1):
    fill=COLORS['rose'];ink=COLORS['ink']
    _ellipse(draw, (x-8*scale,y-7*scale,x,y+2*scale),fill,ink,1)
    _ellipse(draw, (x,y-7*scale,x+8*scale,y+2*scale),fill,ink,1)
    _poly(draw,[(x-9*scale,y-1*scale),(x,y+11*scale),(x+9*scale,y-1*scale)],fill,ink,1)


def _bowl(draw, x, y, filled=True):
    ink=COLORS['ink']
    _ellipse(draw,(x-26,y-8,x+26,y+1),(250,229,182,255),ink,2)
    _poly(draw,[(x-25,y-3),(x-18,y+14),(x+18,y+14),(x+25,y-3)],(169,192,151,255),ink,2)
    _arc(draw,(x-16,y+1,x+16,y+8),0,180,(245,234,199,255),2)
    if filled:
        for dx,dy,r in [(-10,-8,4),(-2,-12,5),(10,-9,4),(3,-4,3)]:
            _ellipse(draw,(x+dx-r,y+dy-r,x+dx+r,y+dy+r),COLORS['gold'],ink,1)


def _berry(draw,x,y,frame):
    _ellipse(draw,(x-8,y-8,x+8,y+8),(224,124,105,255),COLORS['ink'],2)
    _line(draw,[(x,y-7),(x+4,y-13)],(97,143,92,255),2)
    _ellipse(draw,(x-3,y-5,x,y-2),(255,233,202,255),None,1)
    if frame%2: _star(draw,x+12,y-12,4,COLORS['gold'])


def _puff(draw,x,y,frame):
    for dx,dy,r in [(-5,1,4),(3,2,5),(8,-2,3)]:
        _ellipse(draw,(x+dx-r,y+dy-r,x+dx+r,y+dy+r),(250,247,236,220),COLORS['sea'],1)


def _sweat(draw,x,y,scale=1):
    ink=COLORS['ink']
    _poly(draw,[(x,y-9*scale),(x-6*scale,y+2*scale),(x,y+8*scale),(x+6*scale,y+2*scale)],(158,209,219,230),ink,1)


def _closed_eyes(draw, species):
    # Species-dependent approximate eye locations. Deliberate vector overpaint,
    # not a promise of redrawn eyelids for every original eye pixel.
    placement = {
        'jonah-whale':(67,99), 'gentle-deer':(77,86), 'companion-donkey':(74,90),
        'peace-dove':(98,95), 'peace-penguin':(93,93),
        'patience-turtle':(59,111), 'word-fox':(91,93),
    }
    cx,cy=placement.get(species,(96,90))
    # Subtle cream eyelids on top of base art and dark curved lashes
    for eye in (cx-10,cx+10):
        _ellipse(draw,(eye-7,cy-7,eye+7,cy+7),(248,229,207,234),None,1)
        _arc(draw,(eye-7,cy-5,eye+7,cy+5),12,163,COLORS['ink'],2)


def _body(source, action, frame):
    # Original PNG still occupies the actual character; we alter body posture,
    # not just the surrounding overlay. Anchor is (96,176).
    moves = {
        'feed':(5,4,7,0.98,0.91), 'play':(0,-7 if frame%2 else 1,-9 if frame%2 else 7,1.03,1),
        'sleep':(-2,14,-12,1.03,.78),'wake':(0,-8 if frame>1 else 0, -4,1,.98),
        'pet':(0,0,-3 if frame%2 else 2,1,1), 'dirty':(0,12,5,.97,.79),
        'clean':(frame%2*3,0,-5 if frame%2 else 3,1,1),
        'hungry':(1,3,(-3 if frame%2 else 3),.99,.95),
        'sick':(0,8,3,1,.91),'faint':(0,17,-23,1,.84),
        'evolve':(0,-4 if frame%2 else 1,-3 if frame%2 else 3,1+.02*frame,1+.01*frame),
    }
    dx,dy,rot,sx,sy=moves[action]
    return _transform(source, dx,dy,rot,sx,sy)


def _transform(img, dx,dy,rot,sx,sy):
    base=img.resize((FRAME*S,FRAME*S),Image.Resampling.LANCZOS)
    bound=base.getbbox()
    if bound is None:return Image.new('RGBA',base.size)
    cut=base.crop(bound)
    cut=cut.resize((max(1,int(cut.width*sx)),max(1,int(cut.height*sy))),Image.Resampling.LANCZOS)
    cut=cut.rotate(rot,resample=Image.Resampling.BICUBIC,expand=True)
    out=Image.new('RGBA',(FRAME*S,FRAME*S))
    # Align bottom to baseline to keep character's feet grounded.
    ox=int((FRAME*S-cut.width)/2 + dx*S)
    oy=int(176*S-cut.height+dy*S)
    out.alpha_composite(cut,(ox,oy))
    return out


def _decorate(out, action, frame, species, level):
    ink=COLORS['ink'];cream=COLORS['cream'];gold=COLORS['gold']
    draw=ImageDraw.Draw(out,'RGBA')
    wiggle = (frame - 1.5) * 2.5
    if action=='feed':
        _bowl(draw,134,157,filled=frame<3)
        _berry(draw,120-int(frame*6),119+frame*5,frame)
        for i in range(frame%3):_star(draw,106+i*10,125-i*5,3,gold)
    elif action=='play':
        bx=148-(frame*12); by=151-[0,23,31,12][frame]
        _ellipse(draw,(bx-14,by-14,bx+14,by+14),(175,213,190,255),ink,2)
        _arc(draw,(bx-11,by-11,bx+11,by+11),25,188,(255,244,204,255),4)
        _star(draw,160-frame*8,97+[0,5,-7,0][frame],7,gold)
        _line(draw,[(155,167),(160,164)],(176,162,133,140),2)
    elif action=='sleep':
        _closed_eyes(draw,species)
        for i,xx in enumerate((128,146,162)):
            yy=73-5*frame-i*18
            _line(draw,[(xx,yy-10),(xx+10,yy-10),(xx,yy+1),(xx+10,yy+1)],(121,154,137,230),2.5-i*.5)
        _ellipse(draw,(65,153,135,176),(211,223,196,140),None,1)
    elif action=='wake':
        for i in range(4):
            angle=(i/3)*math.pi
            x=96+math.cos(angle)*44;y=85-math.sin(angle)*29
            _line(draw,[(x,y),(x+math.cos(angle)*10,y-math.sin(angle)*10)],gold,3)
        _star(draw,138,58+frame*2,7,cream)
    elif action=='pet':
        _heart(draw,122+frame*3,66-frame*7,.65+frame*.06)
        _heart(draw,148,92-frame*3,.55)
        # rounded cartoon patting hand, visually touches head
        x=77+frame*4;y=47+frame*3
        _ellipse(draw,(x-18,y-10,x+16,y+9),(255,229,198,240),ink,2)
        for t in range(3):
            _ellipse(draw,(x-11+t*10,y-17,x-4+t*10,y-4),(255,229,198,255),ink,1.4)
    elif action=='dirty':
        x=142+frame*3
        _ellipse(draw,(x-18,169,x+20,177),(126,96,72,120),None,1)
        _ellipse(draw,(x-18,154,x+16,173),(148,108,78,255),ink,2)
        _ellipse(draw,(x-11,147,x+10,164),(160,119,87,255),ink,2)
        _ellipse(draw,(x-5,141,x+7,155),(177,134,95,255),ink,2)
        for i in range(2):
            px=x-17+i*24
            _arc(draw,(px,115-frame*3,px+8,139-frame*3),180,353,(142,130,110,200),2)
    elif action=='clean':
        x=147+frame*5
        _line(draw,[(x+9,90),(x-5,169)],(158,111,73,255),5)
        _poly(draw,[(x-16,162),(x+9,166),(x+6,181),(x-19,176)],(225,196,146,255),ink,2)
        for i in range(7):
            ang = (i+frame*1.4)*1.29
            px=138+math.cos(ang)*22;py=127+math.sin(ang)*28
            _ellipse(draw,(px-4,py-4,px+4,py+4),(235,252,251,205),(143,207,204,255),1)
        _star(draw,109,91-frame*4,6,gold)
    elif action=='hungry':
        _bowl(draw,145,157,filled=False)
        _arc(draw,(121,90,157,123),12,180,(175,120,85,220),3)
        _star(draw,137,72+frame*3,3,gold)
    elif action=='sick':
        _sweat(draw,129,93+frame*3)
        _poly(draw,[(143,50),(158,46),(164,54),(148,60)],(238,227,192,235),ink,2)
        _line(draw,[(149,52),(158,50)],(191,158,136,240),1.7)
        _ellipse(draw,(152,114,174,136),(209,231,215,245),ink,2)
        _line(draw,[(163,117),(163,133)],(137,174,143,255),2)
        _line(draw,[(156,125),(170,125)],(137,174,143,255),2)
    elif action=='faint':
        for i in range(3):
            t=frame*.6+i*2.1
            _star(draw,96+math.cos(t)*45,40+math.sin(t)*17,5+i,gold)
        _ellipse(draw,(139,141,162,153),(236,235,218,140),None,1)
    elif action=='evolve':
        _arc(draw,(32-frame*3,36-frame*2,160+frame*3,157+frame*2),210,510,(246,204,116,200),2.5)
        for i in range(8):
            t=i*math.pi/4+frame*.38
            _star(draw,96+math.cos(t)*(65+frame),92+math.sin(t)*(63+frame),3+(i%3),cream if i%2 else gold)
    return out


def generate(root:Path):
    src_dir=root/'assets/characters/bible-friends/evolved/production'
    dest=root/'assets/characters/bible-friends/evolved/care-actions'
    dest.mkdir(parents=True,exist_ok=True)
    entries=[]
    for species in SPECIES:
        for lv in (2,3):
            src=src_dir/f'{species}-lv{lv}.png'
            if not src.is_file():raise FileNotFoundError(src)
            base=Image.open(src).convert('RGBA')
            if base.size!=(768,768):raise ValueError(f'{src}: expected 768x768, got {base.size}')
            # Use the project's real illustrated base pose; never reuse royal/unique stand-ins.
            base_frame=base.crop((0,0,FRAME,FRAME))
            for action in ACTIONS:
                atlas=Image.new('RGBA',(FRAME*FRAMES,FRAME))
                for frame in range(FRAMES):
                    new=_body(base_frame,action,frame)
                    new=_decorate(new,action,frame,species,lv)
                    new=new.resize((FRAME,FRAME),Image.Resampling.LANCZOS)
                    if not new.getbbox():raise ValueError(f'blank frame: {species}, {lv}, {action}, {frame}')
                    atlas.alpha_composite(new,(frame*FRAME,0))
                name=f'{species}-lv{lv}-{action}.png'
                target=dest/name
                atlas.save(target,format='PNG',optimize=True)
                entries.append({'species':species,'level':lv,'action':action,'path':name})
    info={
        'version':1,'kind':'dedicated visual action atlas, source-derived character drawings plus newly drawn props',
        'speciesCount':len(SPECIES),'levels':[2,3],'actions':list(ACTIONS),
        'frameWidth':FRAME,'frameHeight':FRAME,'framesPerAction':FRAMES,
        'atlasColumns':4,'atlasRows':1,'atlasSize':[FRAME*FRAMES,FRAME],
        'anchor':[96,176],'frameDurationMs':180,
        'individualHandPaintedBodyPoses':False,
        'entries':entries,
    }
    (dest/'manifest.json').write_text(json.dumps(info,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    # Repository-friendly review: every species, four representative actions, level 3.
    review_actions=('feed','play','sleep','clean')
    contact=Image.new('RGB',(FRAME*len(review_actions),FRAME*len(SPECIES)),(250,246,233))
    for row,species in enumerate(SPECIES):
        for col,action in enumerate(review_actions):
            sheet=Image.open(dest/f'{species}-lv3-{action}.png').convert('RGBA')
            tile=Image.new('RGBA',(FRAME,FRAME),(255,252,245,255))
            tile.alpha_composite(sheet.crop((0,0,FRAME,FRAME)))
            contact.paste(tile.convert('RGB'),(col*FRAME,row*FRAME))
    contact.save(dest/'contact-sheet.jpg',format='JPEG',quality=85,optimize=True)
    return dest,len(entries)


if __name__=='__main__':
    ap=argparse.ArgumentParser()
    ap.add_argument('--root',type=Path,default=Path.cwd())
    args=ap.parse_args()
    out,num=generate(args.root)
    print(f'Wrote {num} action atlas PNG files to {out}, 4 frames per file.')
