# Builds public/sio/sio-body.webp from docs/sio/sio-reference.webp: the reference
# render with its background cut away and its face blanked, so the face can be
# drawn live (components/sio/Sio.tsx). Needs Pillow and numpy. Run from the repo
# root:  python scripts/sio-body.py
# It prints the body box and where the glass sits; Sio.tsx uses those numbers.
from PIL import Image, ImageFilter
import numpy as np
im=Image.open('docs/sio/sio-reference.webp').convert('RGB')
a=np.asarray(im).astype(np.float32)
H,W,_=a.shape
def grow(seed,cand):
    m=seed&cand
    while True:
        g=m.copy()
        g[1:,:]|=m[:-1,:]; g[:-1,:]|=m[1:,:]; g[:,1:]|=m[:,:-1]; g[:,:-1]|=m[:,1:]
        g&=cand
        if (g==m).all(): return m
        m=g
ys,xs=np.mgrid[0:H,0:W]
c00=a[5:40,5:40].mean((0,1)); c01=a[5:40,W-40:W-5].mean((0,1)); c10=a[H-40:H-5,5:40].mean((0,1)); c11=a[H-40:H-5,W-40:W-5].mean((0,1))
u=(xs/(W-1))[...,None]; v=(ys/(H-1))[...,None]
bg=(1-v)*((1-u)*c00+u*c01)+v*((1-u)*c10+u*c11)
d=np.sqrt(((a-bg)**2).sum(2))
border=np.zeros((H,W),bool); border[0,:]=border[-1,:]=border[:,0]=border[:,-1]=True
bgm=grow(border,d<9)
# pockets of background the fill stopped short of, right at the outline: a few more steps at a looser match
loose=d<16
for _ in range(14):
    g=bgm.copy()
    g[1:,:]|=bgm[:-1,:]; g[:-1,:]|=bgm[1:,:]; g[:,1:]|=bgm[:,:-1]; g[:,:-1]|=bgm[:,1:]
    bgm=bgm|(g&loose)
fg=~bgm
# the head only: the part connected to its centre (drops the shadow and specks)
seed=np.zeros((H,W),bool); seed[500,760]=True
head=grow(seed,fg)
# smooth the outline: open by 3px (drops thin halos), then feather
mi=Image.fromarray((head*255).astype(np.uint8))
mi=mi.filter(ImageFilter.MinFilter(21)).filter(ImageFilter.MaxFilter(21))
opened=np.asarray(mi)>127
opened=grow(seed,opened)   # whatever the opening cut loose is dropped
mi=Image.fromarray((opened*255).astype(np.uint8)).filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(1.3))
alpha=np.asarray(mi).astype(np.float32)/255
# ---- blank the face: the visor's inside, without the glowing eyes and mouth
lum=a.mean(2)
blue=a[...,2]-a[...,0]
dark=(lum<75)
vs=np.zeros((H,W),bool); vs[540,680]=True
# visor = dark glass plus the glowing shapes drawn on it (bright and blue), connected from the centre
glass=dark|((blue>25)&(xs>380)&(xs<1010)&(ys>330)&(ys<740))
visor=grow(vs,glass)
vi=Image.fromarray((visor*255).astype(np.uint8)).filter(ImageFilter.MaxFilter(9)).filter(ImageFilter.MinFilter(9))
visor=np.asarray(vi)>127
yy,xx=np.where(visor)
print('visor bbox',xx.min(),yy.min(),xx.max(),yy.max(),'area',visor.sum())
# inner region: the visor pulled in from its rim, feathered
inner=Image.fromarray((visor*255).astype(np.uint8)).filter(ImageFilter.MinFilter(41)).filter(ImageFilter.GaussianBlur(14))
w=(np.asarray(inner).astype(np.float32)/255)[...,None]
# the glass's own dark tone, row by row (keeps its top-to-bottom shading, drops the glow)
base=np.zeros_like(a)
for y in range(H):
    row=a[y][visor[y]]
    if len(row)>20:
        l=row.mean(1); k=np.argsort(l)[:max(5,len(l)//5)]
        base[y]=row[k].mean(0)
bi=Image.fromarray(np.clip(base,0,255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(10))
base=np.asarray(bi).astype(np.float32)
out=a*(1-w)+base*w
rgba=np.dstack([np.clip(out,0,255),alpha*255]).astype(np.uint8)
ys2,xs2=np.where(alpha>0.02)
pad=24
x0,y0,x1,y1=max(0,xs2.min()-pad),max(0,ys2.min()-pad),min(W,xs2.max()+pad),min(H,ys2.max()+pad)
print('head bbox',x0,y0,x1,y1,'size',x1-x0,y1-y0)
shell=Image.fromarray(rgba,'RGBA').crop((x0,y0,x1,y1))

shell.save('public/sio/sio-body.webp',quality=90,method=6)
# the glass as a polygon (in the crop's own coordinates), for clipping what is drawn on it
import math
innerm=np.asarray(Image.fromarray((visor*255).astype(np.uint8)).filter(ImageFilter.MinFilter(15)))>127
iy,ix=np.where(innerm); cx,cy=ix.mean(),iy.mean()
pts=[]
for k in range(40):
    t=2*math.pi*k/40; r=0
    while True:
        x=int(round(cx+math.cos(t)*(r+2))); y=int(round(cy+math.sin(t)*(r+2)))
        if x<0 or y<0 or x>=W or y>=H or not innerm[y,x]: break
        r+=2
    pts.append((round(cx+math.cos(t)*r-x0,1),round(cy+math.sin(t)*r-y0,1)))
print('visor centre in crop',round(cx-x0,1),round(cy-y0,1))
print('VISOR_PATH M'+' L'.join(f'{x},{y}' for x,y in pts)+'Z')
print('visor bbox in crop',xx.min()-x0,yy.min()-y0,xx.max()-x0,yy.max()-y0)
