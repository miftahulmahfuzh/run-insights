import sys
from PIL import Image
import numpy as np
def bars(path,y0=1315,y1=1415):
    a=np.asarray(Image.open(path).convert('RGB')).astype(int)
    sub=a[y0:y1]; m=(sub[...,1]>150)&(sub[...,2]>150)&(sub[...,0]<120)
    cols=m.any(axis=0); out=[];s=None
    for x in range(len(cols)+1):
        on=x<len(cols) and cols[x]
        if on and s is None: s=x
        if not on and s is not None:
            out.append(int(m[:,s:x].sum(axis=0).max())); s=None
    return out
def est(h,T,F,S,mode):
    lo,hi=min(h),max(h); dt=T/len(h)
    fr=lambda x:(x-lo)/(hi-lo)
    pace={'fast-pace':lambda x:S-(S-F)*fr(x),'slow-pace':lambda x:F+(S-F)*fr(x),
          'fast-speed':lambda x:1/(1/S+(1/F-1/S)*fr(x)),'slow-speed':lambda x:1/(1/F-(1/F-1/S)*fr(x))}[mode]
    cum=0;t=0;sp=[];last=0;k=1
    for x in h:
        di=dt/pace(x); v=di/dt
        while cum+di>=k:
            tk=t+(k-cum)/v; sp.append(round(tk-last)); last=tk; k+=1
        cum+=di; t+=dt
    return cum,sp,T-last
f=lambda s:f"{int(s)//60}:{int(s)%60:02d}"
if __name__=='__main__':
    path,T,F,S=sys.argv[1],int(sys.argv[2]),int(sys.argv[3]),int(sys.argv[4])
    h=bars(path); print(len(h),'bars',h)
    for mode in ['fast-pace','fast-speed','slow-pace','slow-speed']:
        d,sp,rem=est(h,T,F,S,mode)
        print(f"{mode:11s} {d:.2f} km avg {f(round(T/d))} splits {[f(s) for s in sp]} +{d-len(sp):.2f}km/{f(round(rem))}")
