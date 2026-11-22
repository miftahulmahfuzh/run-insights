import sys
sys.path.insert(0,'scratchpad')
from PIL import Image
import numpy as np
from pace import est,f
def load(path,shrink):
    im=Image.open(path).convert('RGB')
    if shrink:
        w,h=im.size; im=im.resize((560,round(h*560/w)),Image.LANCZOS)
        im.save('scratchpad/tmp.jpg',quality=80); im=Image.open('scratchpad/tmp.jpg').convert('RGB')
    return np.asarray(im).astype(int)
def profile(a,y0,y1,pred):
    k=a.shape[1]/739; y0=round(y0*k); y1=round(y1*k)
    sub=a[y0:y1]; m=pred(sub[...,0],sub[...,1],sub[...,2])
    return m,k
teal=lambda r,g,b:(g>130)&(b>130)&(r<130)&(g-r>50)
red=lambda r,g,b:(r>170)&(g<110)&(b<90)
for path,T,F,S,truth in [('images/7.png',2773,365,497,'6.04km 7:26 7:48 7:38 7:30 7:43 7:46'),('images/1.png',3046,407,552,'?')]:
  for shrink in (False,True):
    a=load(path,shrink)
    m,k=profile(a,1315,1415,teal)
    colh=m.sum(axis=0); xs=np.where(colh>0)[0]; x0,x1=xs.min(),xs.max()+1
    # sample 90 equal slots across [x0,x1): max column height in each slot
    N=90; h=[int(colh[int(x0+(x1-x0)*i/N):max(int(x0+(x1-x0)*(i+1)/N),int(x0+(x1-x0)*i/N)+1)].max()) for i in range(N)]
    d,sp,rem=est(h,T,F,S,'fast-speed')
    print(path,'560jpg' if shrink else 'orig',f"{d:.2f}km",[f(s) for s in sp],'| truth',truth)
    if not shrink or True:
        # HR chart
        m,k=profile(a,1090,1195,red)
        ys=np.where(m.any(axis=1))[0]; top,bot=ys.min(),ys.max()
        print('   hr rows',top,bot)
