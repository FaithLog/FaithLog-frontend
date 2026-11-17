#!/usr/bin/env python3
"""Generate actual 234 FaithLog costume-stage atlases from existing costume art.

The source is a complete original character costume atlas. Its facial expressions,
clothes, and gait remain; progressive silhouette growth, head proportions and
species-related embellishments are composited. NOT 234 independent hand paintings.
"""
from __future__ import annotations
import argparse
import hashlib
import json
from pathlib import Path
from PIL import Image, ImageDraw, ImageChops

SPECIES = ["david-lamb","noah-bear","jonah-whale","daniel-lion","peace-dove","hope-rabbit","word-fox","gentle-deer","companion-donkey","joy-chick","peace-penguin","love-otter","patience-turtle"]
STYLES = ["sunshine","scholar","gardener","sailor","explorer","festival","starlight","royal","unique"]
LEVELS = (2,3)
CELL = 192


def grow_costume(frame: Image.Image, level: int) -> Image.Image:
    """Proportionally evolve the costume-bearing character while preserving details."""
    frame=frame.convert('RGBA')
    bounds=frame.getchannel('A').getbbox()
    if not bounds:
        raise ValueError('Empty source frame')
    x0,y0,x1,y1=bounds
    cut=frame.crop(bounds)
    sx,sy=((1.07,1.055) if level==2 else (1.16,1.12))
    w=min(184,round(cut.width*sx))
    h=min(185,round(cut.height*sy))
    grown=cut.resize((w,h),Image.Resampling.LANCZOS)
    result=Image.new('RGBA',(CELL,CELL),(0,0,0,0))
    # One consistent ground anchor for garden animation across all costume styles.
    x=(CELL-w)//2
    y=max(3,176-h)
    result.alpha_composite(grown,(x,y))
    if level==3:
        # Reinforce the evolved larger head without a hard seam across the outfit.
        head_h=max(12,round(h*.51))
        head=grown.crop((0,0,w,head_h))
        head_w=min(188,round(w*1.028))
        head_out=head.resize((head_w,round(head_h*1.025)),Image.Resampling.LANCZOS)
        al=head_out.getchannel('A')
        fad=Image.new('L',head_out.size,0)
        d=ImageDraw.Draw(fad)
        fade_start=round(head_out.height*.63)
        for row in range(head_out.height):
            k=255 if row<fade_start else int(255*max(0,(head_out.height-1-row)/max(1,head_out.height-1-fade_start)))
            d.line((0,row,head_out.width,row),fill=k)
        head_out.putalpha(ImageChops.multiply(al,fad))
        result.alpha_composite(head_out,((CELL-head_w)//2,max(0,y-1)))
    return result


def ornament(result: Image.Image,level:int, species:str)->Image.Image:
    """Small stage-matched gold and botanical flourishes, without obscuring costumes."""
    b=result.getchannel('A').getbbox()
    if not b: return result
    left,top,right,bottom=b
    layer=Image.new('RGBA',(CELL,CELL),(0,0,0,0))
    draw=ImageDraw.Draw(layer)
    # Floral pins outside the lower side of the silhouette show clear stage identity.
    px=max(6,left-4)
    py=max(40,min(168,bottom-25))
    r=3 if level==2 else 4
    fill=(148,174,111,235) if level==2 else (188,209,129,240)
    draw.ellipse((px-r,py-r,px+r,py+r),fill=fill,outline=(125,94,57,220),width=1)
    draw.line((px-3,py+4,px+4,py-3),fill=(244,233,168,225),width=1)
    if level==3:
        x=min(184,right+3); y=max(43,min(164,bottom-32))
        draw.arc((x-7,y-8,x+7,y+8),45,250,fill=(229,185,99,220),width=2)
        draw.ellipse((x-2,y-2,x+2,y+2),fill=(252,234,154,245))
        # A tiny second pin, rather than a blanket aura masking the rarer costume.
        draw.ellipse((px-6,py-9,px-2,py-5),fill=(246,209,118,235))
    return Image.alpha_composite(layer,result)


def render_atlas(source:Image.Image,level:int,species:str)->Image.Image:
    if source.size!=(768,768): raise ValueError(f'Expected 768x768 original atlas, got {source.size}')
    out=Image.new('RGBA',(768,768),(0,0,0,0))
    for i in range(16):
        box=((i%4)*CELL,(i//4)*CELL,((i%4)+1)*CELL,((i//4)+1)*CELL)
        cell=source.crop(box)
        grown=ornament(grow_costume(cell,level),level,species)
        out.alpha_composite(grown,((i%4)*CELL,(i//4)*CELL))
    return out


def contact_sheet(folder:Path):
    styles=['sunshine','royal','unique']
    unit=106
    img=Image.new('RGB',(165+6*unit,36+13*unit),'#faf6e9')
    draw=ImageDraw.Draw(img)
    for index, (lv,style) in enumerate((lv,style) for lv in (2,3) for style in styles):
        draw.text((165+index*unit+8,10),'Lv'+str(lv)+' '+style,fill='#494949')
    for j,species in enumerate(SPECIES):
        y=36+j*unit
        draw.text((8,y+37),species,fill='#494949')
        for col,(lv,style) in enumerate((lv,style) for lv in (2,3) for style in styles):
            atlas=Image.open(folder/(species+'--'+style+'--lv'+str(lv)+'.png')).convert('RGBA')
            sprite=atlas.crop((0,0,CELL,CELL)).resize((unit,unit),Image.Resampling.LANCZOS)
            bg=Image.new('RGBA',(unit,unit),'#fffdf6')
            bg.alpha_composite(sprite)
            img.paste(bg.convert('RGB'),(165+col*unit,y))
    img.save(folder/'contact-sheet.jpg',quality=88,optimize=True)


def main():
    p=argparse.ArgumentParser()
    p.add_argument('--root',default='.')
    a=p.parse_args()
    root=Path(a.root).resolve()
    dest=root/'assets/characters/bible-friends/evolved/costume-stages'
    dest.mkdir(parents=True,exist_ok=True)
    entries=[]; hashes=set()
    for species in SPECIES:
        for style in STYLES:
            source=root/'assets/characters/bible-friends/design-motions'/species/(style+'.png')
            if not source.exists(): raise FileNotFoundError(str(source))
            with Image.open(source) as orig:
                original=orig.convert('RGBA')
            for level in LEVELS:
                atlas=render_atlas(original,level,species)
                destfile=dest/(species+'--'+style+'--lv'+str(level)+'.png')
                # Indexed-color alpha PNG keeps the mobile install package compact.
                packed=atlas.quantize(colors=255,method=Image.Quantize.FASTOCTREE,
                                      dither=Image.Dither.NONE)
                packed.save(destfile,optimize=False,compress_level=3)
                sha=hashlib.sha256(destfile.read_bytes()).hexdigest()
                if sha in hashes: raise RuntimeError('Identical output image: '+str(destfile))
                hashes.add(sha)
                entries.append({'species':species,'style':style,'level':level,
                                'source':str(source.relative_to(root)),'path':destfile.name,
                                'sha256':sha,'frames':16,'size':[768,768]})
    assert len(entries)==234,len(entries)
    (dest/'manifest.json').write_text(json.dumps({
        'version':1,'kind':'derived costume-stage evolution assets',
        'sourceDisclosure':'Transforms original complete costume frames; does NOT contain 234 bespoke hand-painted evolved bodies.',
        'species':SPECIES,'styles':STYLES,'levels':[2,3],
        'frameSize':[192,192],'atlasSize':[768,768],
        'framesPerAtlas':16,'count':len(entries),'entries':entries
    },ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    contact_sheet(dest)
    print('CREATED 234 stage-specific derived costume PNG atlases, 3744 animation frames.')

if __name__=='__main__': main()
