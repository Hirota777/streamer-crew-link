"""Import MIT player images. Usage: python scripts/replace-player-assets.py /path/to/amonguscapture"""
from pathlib import Path
import base64,hashlib,json,shutil,struct,subprocess,sys
from player_png import decode,png
root=Path(__file__).resolve().parents[1];source=Path(sys.argv[1]).resolve();images=source/'AUCapture-WPF/Resources/Players';dest=root/'public/icons'
manifest_path=root/'assets/players-source.json';previous=json.loads(manifest_path.read_text(encoding='utf-8')) if manifest_path.exists() else None
originals=[];imported={}
for file in sorted(images.glob('*.png')):
 assert file.name.startswith('au') and file.name.isascii()
 data=file.read_bytes();source_sha=hashlib.sha256(data).hexdigest()
 if previous:
  old=next(x for x in previous['originals'] if x['name']==file.name);assert old.get('sourceSha256',old['sha256'])==source_sha,'Upstream file changed'
 transform='none'
 if file.stem.endswith('dead'):
  w,h,pixels=decode(file);data=png(w,h,[(0,0,0,0) if p[3]<=3 else p for p in pixels]);transform='near-transparent background (alpha <= 3) cleared to avoid white-outline rectangles'
 imported[file.name]=data
 originals.append({'name':file.name,'sourceSha256':source_sha,'sha256':hashlib.sha256(data).hexdigest(),'transform':transform})
assert len(originals)==24
for entry in originals:(dest/entry['name']).write_bytes(imported[entry['name']])
code="import {spriteSeeds,spritePalette} from './public/icons.js';const colors=['#6b2b3d','#ecc0d3','#fffebe','#8397a7','#9f9989','#ec7578'];console.log(JSON.stringify({seeds:[spriteSeeds(false),spriteSeeds(true)],palettes:colors.map((color,i)=>spritePalette({color,colorId:i+12}))}));"
settings=json.loads(subprocess.check_output(['node','--input-type=module','-e',code],cwd=root,text=True))
def rgb(value):return tuple(bytes.fromhex(value[1:]))
derived=[]
for index,name in enumerate(['maroon','rose','banana','gray','tan','coral']):
 palette=settings['palettes'][index];targets=[rgb(palette[k]) for k in ['body','shadow','visor','visorShadow','deep']]
 for dead in [False,True]:
  template='aucyan'+('dead' if dead else '')+'.png';w,h,pixels=decode(dest/template);seeds=settings['seeds'][int(dead)];output=[]
  for pixel in pixels:
   nearest=None;distance=float('inf')
   if pixel[3]:
    for seed in seeds:
     d=sum((pixel[c]-seed[c])**2 for c in range(3))
     if d<seed[4]**2 and d<distance:nearest=seed;distance=d
   if nearest:pixel=(*[max(0,min(255,targets[nearest[3]][c]+pixel[c]-nearest[c])) for c in range(3)],pixel[3])
   output.append(pixel)
  filename='au'+name+('dead' if dead else '')+'.png';data=png(w,h,output);(dest/filename).write_bytes(data)
  derived.append({'name':filename,'template':template,'palette':palette,'sha256':hashlib.sha256(data).hexdigest()})
# Compose the application icon from the same cyan source, without old artwork.
w,h,pixels=decode(images/'aucyan.png')
def icon(size):
 result=[];scale=size*.86/h;sw,sh=round(w*scale),round(h*scale);left,top=(size-sw)//2,(size-sh)//2;r=size*.21
 for y in range(size):
  for x in range(size):
   cx=max(r,min(size-r,x+.5));cy=max(r,min(size-r,y+.5));inside=(x+.5-cx)**2+(y+.5-cy)**2<=r*r
   pixel=(21,43,37,255) if inside else (0,0,0,0)
   if left<=x<left+sw and top<=y<top+sh:
    fg=pixels[min(h-1,int((y-top)/scale))*w+min(w-1,int((x-left)/scale))];a=fg[3]/255
    pixel=tuple(round(fg[c]*a+pixel[c]*(1-a)) for c in range(3))+(255 if inside else fg[3],)
   result.append(pixel)
 return png(size,size,result)
sizes=[16,32,48,64,128,256];chunks=[icon(size) for size in sizes];offset=6+16*len(sizes);headers=[]
for size,data in zip(sizes,chunks):
 headers.append(struct.pack('<BBBBHHII',0 if size==256 else size,0 if size==256 else size,0,0,1,32,len(data),offset));offset+=len(data)
(root/'assets/app.ico').write_bytes(struct.pack('<HHH',0,1,len(sizes))+b''.join(headers)+b''.join(chunks))
data=base64.b64encode((images/'aucyan.png').read_bytes()).decode()
(root/'assets/app.svg').write_text('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><rect width="256" height="256" rx="54" fill="#152b25"/><image x="46" y="18" width="164" height="220" preserveAspectRatio="xMidYMid meet" href="data:image/png;base64,'+data+'"/></svg>\n',encoding='utf-8')
shutil.copyfile(source/'LICENSE',root/'LICENSE-AmongUsCapture-Players.txt')
manifest={'repository':'https://github.com/automuteus/amonguscapture','commit':'7038d375b9eacd97d8352bcc0f5a090fc3ab6a28','path':'AUCapture-WPF/Resources/Players','license':'MIT','copyright':'Copyright (c) 2020 Denver Quane','originals':originals,'derived':derived,'appIcon':'Cyan source on a new dark rounded background'}
manifest_path.write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')
print('Imported 24 originals, generated 12 additional colours, and replaced app icons.')
