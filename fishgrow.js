/* ════════════════════════════════════════════════════════════════════════════════════════
   JEU DE RÉFÉRENCE : « Feed and Grow: Fish » (Old B1ood). Ce mode s'en inspire : jeu de survie/croissance sous l'eau,
   on mange plus petit que soi pour grandir et on fuit les plus gros. Interface inspirée du jeu : fiche d'espèce avec niveau
   et barre de croissance, endurance, classement, boutons ronds sur mobile.
   ════════════════════════════════════════════════════════════════════════════════════════ */
export const BASED_ON="Feed and Grow: Fish";
/* MoDa — Feed & Grow: Fish 🐟 (3D WebGL) : SERVEUR OUVERT, comme Sta I
   Inspiré de Feed and Grow: Fish : tu es un tout petit poisson dans un récif. Mange du plancton et plus petit que toi pour grandir,
   fuis les plus gros, deviens un requin puis un Mégalodon.
   - Serveurs persistants FISH1, FISH2… (24 joueurs max chacun) : on clique sur la tuile et on arrive directement dedans (pas de lobby, pas de manche).
   - L'HÔTE du serveur = le joueur arrivé en premier. S'il part, le suivant (par ordre d'arrivée) reprend la simulation là où elle en était
     (poissons, requins, plancton, masses) à partir du dernier état publié : tout le monde calcule le même hôte à partir de lobbies/<code>/players/<uid>/j.
   - Vie : chaque joueur et requin a 100 PV ; une morsure d'un plus gros retire 30 à 60 PV, la vie remonte hors combat et se remplit à chaque stade. On peut MORDRE n'importe quel poisson, quelle que soit sa taille (plus il est gros, moins la morsure fait mal) ; on ne peut AVALER d'un coup que ce dont la masse est ≤ 1/1,3 de la sienne. Chaque morsure fait apparaître un chiffre jaune = dégâts. Le plancton se mange en le touchant.
     Si tu te fais manger, tu réapparais 3 s plus tard avec 35 % de ta masse.
   - L'hôte simule les PNJ (proies, requins), les morsures, le plancton et les masses, et publie games/<code>/state. Chaque joueur calcule lui-même
     le déplacement de SON poisson (fluide) et l'écrit dans games/<code>/p/<uid> : « x,y,z,cap,tangage,boost,morsures,respawn ». Aucun nouveau chemin Firebase hors de games/ et lobbies/.
   - Rendu : moteur 3D en perspective sur le canvas 2D existant (poissons maillés, tri en profondeur, brouillard sous-marin, fond marin, coraux, algues).
   Rendu : WebGL (vrais maillages 3D éclairés, brouillard, caustiques, algues/coraux animés). Mobile : joystick flottant à gauche, moitié droite = mordre, bouton sprint.
   Commandes : ←/→ (Q/D) tourner · ↑/↓ (Z/S) monter / descendre · Espace ou clic : MORDRE · Maj : sprint. Tactile : joystick + boutons. */
const DT=1/30,R=70,WH=36,NPK=170;
const STG=[[0,"Alevin"],[3,"Sardine"],[8,"Maquereau"],[20,"Barracuda"],[50,"Thon géant"],[120,"Requin"],[300,"Grand blanc"],[700,"Mégalodon"]];
const stg=m=>{let i=0;while(i+1<STG.length&&m>=STG[i+1][0])i++;return i};
const len=m=>.8*Math.cbrt(m)+.4,spdOf=m=>7*Math.pow(len(m),.15);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),rf=(a,b)=>a+Math.random()*(b-a);
const gh=(x,z)=>2.4+1.2*Math.sin(x*.11)*Math.cos(z*.09)+.7*Math.sin(x*.23+z*.17);   // relief du fond marin (identique chez tous)
const mul=a=>()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296};
const angd=d=>Math.atan2(Math.sin(d),Math.cos(d));
const TIER=[.45,1.1,2.6,6,14,32,75],TCNT=[14,10,8,6,4,3,2],NSH=3,GAIN=.55,BITE_CD=.7,EDI=1.3,SHMAX=230;
const edible=(a,b)=>a>=b*EDI;
const crad=m=>.1+Math.cbrt(m)*.18,MEATTTL=30,MEATMAX=120;   // bouts de viande : rayon selon la masse, durée de vie, nombre max sur le serveur
const plankton=sd=>{const g=mul(sd^0x5eed),o=[];for(let i=0;i<NPK;i++){const x=(g()*2-1)*(R-4),z=(g()*2-1)*(R-4),y0=gh(x,z)+1.5;o.push([x,y0+g()*(WH-4-y0),z])}return o};

/* ───────────────────────────── CLIENT : rendu 3D ───────────────────────────── */
const PAL=[[255,140,40],[70,130,255],[250,210,60],[90,200,120],[170,100,220],[190,200,210],[230,80,70],[130,140,150]];
const PROF=[[.10,.40,.50,.44,.28,.13,.05],[.05,.26,.40,.38,.27,.13,.05]];
const LIGHT=(()=>{const l=[.35,.85,.4],n=Math.hypot(...l);return l.map(v=>v/n)})();
const mixc=(a,b,t)=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t];
const rgbs=a=>`rgb(${a[0]|0},${a[1]|0},${a[2]|0})`;
const hsl=(h,s,l)=>{h/=360;const f=n=>{const k=(n+h*12)%12,a=s*Math.min(l,1-l);return 255*(l-a*Math.max(-1,Math.min(k-3,9-k,1)))};return[f(0),f(8),f(4)]};
const hexrgb=h=>[1,3,5].map(i=>parseInt(String(h).slice(i,i+2),16)||180);
const spC=new Map();
const specOf=(key,rgb,shark)=>{let s=spC.get(key);if(!s){s={b:rgb,bl:mixc(rgb,[255,255,255],shark?.85:.6),fn:mixc(rgb,[255,255,255],.2),bd:mixc(rgb,[255,255,255],.85),bands:!shark&&(String(key).length%3===0||key==="n0"||key==="n6")};spC.set(key,s)}return s};
const fmtm=m=>m<10?m.toFixed(1):String(Math.round(m));
const fmt=s=>Math.floor(s/60)+":"+String(Math.floor(s%60)).padStart(2,"0");

/* ═════════════════════════ MOTEUR 3D WEBGL (vrais maillages, éclairage, brouillard, caustiques) ═════════════════════════ */
const ID=new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]),MAT=new Float32Array(16);
const m4=(a,b)=>{const o=new Float32Array(16);for(let c=0;c<4;c++)for(let r=0;r<4;r++){let s=0;for(let k=0;k<4;k++)s+=a[k*4+r]*b[c*4+k];o[c*4+r]=s}return o};
const viewM=(cr,cu,cf,p)=>{const o=new Float32Array(16);[cr,cu,cf].forEach((v,r)=>{o[r]=v[0];o[4+r]=v[1];o[8+r]=v[2];o[12+r]=-(v[0]*p[0]+v[1]*p[1]+v[2]*p[2])});o[15]=1;return o};
const projM=(F,W,H,CY,n,f,sx,sy)=>{const o=new Float32Array(16);o[0]=2*F/W;o[5]=2*F/H;o[8]=sx||0;o[9]=1-2*CY/H+(sy||0);o[10]=(f+n)/(f-n);o[11]=1;o[14]=-2*f*n/(f-n);return o};   // même projection que l'interface 2D (point de fuite décalé vers le haut)
const NRM=v=>{const l=Math.hypot(v[0],v[1],v[2])||1;return[v[0]/l,v[1]/l,v[2]/l]};
const CRS=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const hash2=(i,j)=>{let h=Math.imul(i|0,374761393)+Math.imul(j|0,668265263)|0;h=Math.imul(h^h>>>13,1274126177);return((h^h>>>16)>>>0)/4294967296};
const n255=c=>[c[0]/255,c[1]/255,c[2]/255];
/* constructeur de maillage : sommet = position, normale, couleur, aux (12 floats) */
function MB(){const D=[],I=[];let n=0;return{D,I,v(p,nm,c,a){D.push(p[0],p[1],p[2],nm[0],nm[1],nm[2],c[0],c[1],c[2],a[0],a[1],a[2]);return n++},tri(a,b,c){I.push(a,b,c)},quad(a,b,c,d){I.push(a,b,c,a,c,d)},get n(){return n}}}
const fv=(f,u)=>typeof f==="function"?f(u):f;
function sph(mb,cx,cy,cz,rx,ry,rz,la,lo,col,aux,top,jit){const b=mb.n;
 for(let i=0;i<=la;i++){const th=i/la*(top?Math.PI/2:Math.PI),st=Math.sin(th),ct=Math.cos(th);
  for(let j=0;j<=lo;j++){const ph=j/lo*6.2832,nx=st*Math.cos(ph),nz=st*Math.sin(ph),k=jit?1+(hash2(i*31+7,(j%lo)*17)-.5)*jit:1;
   mb.v([cx+nx*rx*k,cy+ct*ry*k,cz+nz*rz*k],NRM([nx/rx,ct/ry,nz/rz]),typeof col==="function"?col(nx,ct,nz,i,j):col,fv(aux,i/la))}}
 for(let i=0;i<la;i++)for(let j=0;j<lo;j++){const a=b+i*(lo+1)+j,c=a+lo+1;mb.quad(a,a+1,c+1,c)}}
function tube(mb,pts,rad,sd,col,aux){const b=mb.n,n=pts.length;
 for(let i=0;i<n;i++){const a=pts[Math.max(0,i-1)],c=pts[Math.min(n-1,i+1)],t=NRM([c[0]-a[0],c[1]-a[1],c[2]-a[2]]),u=NRM(CRS(t,Math.abs(t[1])>.9?[1,0,0]:[0,1,0])),w=CRS(t,u),uu=i/(n-1),cc=fv(col,uu),ax=fv(aux,uu);
  for(let j=0;j<=sd;j++){const an=j/sd*6.2832,ca=Math.cos(an),sa=Math.sin(an),nm=[u[0]*ca+w[0]*sa,u[1]*ca+w[1]*sa,u[2]*ca+w[2]*sa];mb.v([pts[i][0]+nm[0]*rad[i],pts[i][1]+nm[1]*rad[i],pts[i][2]+nm[2]*rad[i]],nm,cc,ax)}}
 for(let i=0;i<n-1;i++)for(let j=0;j<sd;j++){const a=b+i*(sd+1)+j,c=a+sd+1;mb.quad(a,a+1,c+1,c)}}
function ribbon(mb,pts,wd,dir,col,aux){const b=mb.n,n=pts.length;
 for(let i=0;i<n;i++){const a=pts[Math.max(0,i-1)],c=pts[Math.min(n-1,i+1)],nm=NRM(CRS(NRM([c[0]-a[0],c[1]-a[1],c[2]-a[2]]),dir)),u=i/(n-1),cc=col(u),ax=aux(u);
  for(const s of[-1,1])mb.v([pts[i][0]+dir[0]*wd[i]*s,pts[i][1]+dir[1]*wd[i]*s,pts[i][2]+dir[2]*wd[i]*s],nm,cc,ax)}
 for(let i=0;i<n-1;i++){const a=b+i*2;mb.quad(a,a+1,a+3,a+2)}}
function fan(mb,p,col,aux){const nm=NRM(CRS([p[1][0]-p[0][0],p[1][1]-p[0][1],p[1][2]-p[0][2]],[p[2][0]-p[0][0],p[2][1]-p[0][1],p[2][2]-p[0][2]])),b=mb.n;p.forEach(q=>mb.v(q,nm,col,aux));for(let i=1;i<p.length-1;i++)mb.tri(b,b+i,b+i+1)}
/* poisson : corps lofté (14 sections × 12 pans), nageoires, yeux, bouche. Repère local : +z = avant, +y = haut, longueur 1 */
function fishGeom(sh){
 const mb=MB(),P=PROF[sh],q=sh?.85:.5,NS=14,SD=12,Z=[0,0,0],prof=t=>{const x=clamp(t,0,1)*6,i=Math.min(5,Math.floor(x)),f=x-i,s=f*f*(3-2*f);return(P[i]+(P[i+1]-P[i])*s)*.42};
 const nose=mb.v([0,0,.53],[0,0,1],Z,Z),rg=[];
 for(let i=0;i<=NS;i++){const tt=i/NS,ry=prof(tt),rx=ry*q,sl=(prof(tt+.04)-prof(tt-.04))/.08*.9;rg.push(mb.n);
  for(let j=0;j<=SD;j++){const a=j/SD*6.2832,ca=Math.cos(a),sa=Math.sin(a);mb.v([ca*rx,sa*ry,.5-tt],NRM([ca/q,sa,sl]),Z,Z)}}
 for(let j=0;j<SD;j++)mb.tri(nose,rg[0]+j,rg[0]+j+1);
 for(let i=0;i<NS;i++)for(let j=0;j<SD;j++){const a=rg[i]+j,c=rg[i+1]+j;mb.quad(a,a+1,c+1,c)}
 const FN=[1,0,0],r1=prof(1/6),r2=prof(1/3),r3=prof(.5),r4=prof(2/3),z1=.5-1/6,z2=.5-1/3,z4=.5-2/3,dh=sh?.36:.28;
 fan(mb,sh?[[0,.03,-.5],[0,.38,-.7],[0,0,-.62],[0,-.22,-.7],[0,-.03,-.5]]:[[0,.03,-.5],[0,.3,-.72],[0,0,-.62],[0,-.3,-.72],[0,-.03,-.5]],FN,Z);   // queue
 fan(mb,[[0,r2*.9,z2+.08],[0,r2+dh,z2-.12],[0,r4*.9,z4]],FN,Z);   // dorsale
 fan(mb,[[0,-r3*.9,.5-.5],[0,-r3-.13,.5-.58],[0,-r4*.9,z4-.05]],FN,Z);   // ventrale
 if(sh)fan(mb,[[0,prof(.78)*.9,.5-.76],[0,prof(.78)+.1,.5-.82],[0,prof(.86)*.9,.5-.88]],FN,Z);
 [-1,1].forEach(s=>{fan(mb,[[s*r1*q*.9,-r1*.2,z1],[s*(r1*q+(sh?.26:.2)),-.12,z1-.2],[s*r1*q*.9,r1*.1,z1-.12]],FN,Z);   // pectorales
  const er=sh?.045:.06,ex=s*r1*q*.92,ey=r1*.3,ez=z1+.03;sph(mb,ex,ey,ez,er,er,er,6,8,[2,0,0],Z,false);sph(mb,ex+s*er*.55,ey,ez,er*.55,er*.55,er*.55,5,6,[3,0,0],Z,false)});
 sph(mb,0,-.012,.51,.04,.032,.04,5,8,[4,0,0],[0,-.012,.51],false);   // bouche (s'ouvre à la morsure)
 return mb}
function terrGeom(){const mb=MB(),E=104,S=2.6,N=Math.round(2*E/S);
 for(let i=0;i<=N;i++)for(let j=0;j<=N;j++){const x0=-E+i*S,z0=-E+j*S,h=gh(x0,z0),e=.5,dx=(gh(x0+e,z0)-gh(x0-e,z0))/(2*e),dz=(gh(x0,z0+e)-gh(x0,z0-e))/(2*e),nz=hash2(i,j),lowf=clamp((3.4-h)/2.4,0,1);
  let b=mixc([222,203,148],[142,150,132],lowf);if(nz>.9)b=mixc(b,[116,116,112],.65);const alg=Math.sin(x0*.13+1)*Math.sin(z0*.11)*.5+.5;b=mixc(b,[104,150,92],clamp((alg-.55)*1.6,0,.55));const s=(.94+(nz-.5)*.14)/255;mb.v([x0,h,z0],NRM([-dx,1,-dz]),[b[0]*s,b[1]*s,b[2]*s],[0,0,0])}
 for(let i=0;i<N;i++)for(let j=0;j<N;j++){const a=i*(N+1)+j;mb.quad(a,a+1,a+N+2,a+N+1)}return mb}
function waterGeom(){const mb=MB(),N=30,S=8;for(let i=0;i<=N;i++)for(let j=0;j<=N;j++)mb.v([(i-N/2)*S,WH,(j-N/2)*S],[0,-1,0],[1,1,1],[0,0,0]);for(let i=0;i<N;i++)for(let j=0;j<N;j++){const a=i*(N+1)+j;mb.quad(a,a+1,a+N+2,a+N+1)}return mb}
function raysGeom(){const mb=MB(),g=mul(0x7a15);   // faisceaux de lumière du soleil
 for(let i=0;i<16;i++){const x0=(g()*2-1)*R*1.1,z0=(g()*2-1)*R*1.1,w=2.2+g()*4.5,ph=g()*6.28,yaw=g()*3.14,dx=-.35/.85*WH,dz=-.4/.85*WH;
  for(let k=0;k<2;k++){const ux=Math.cos(yaw+k*1.5708),uz=Math.sin(yaw+k*1.5708),b0=mb.n;
   [[0,-1],[0,1],[1,1],[1,-1]].forEach(([t,sd])=>mb.v([x0+dx*t+ux*sd*w*(1+t*1.4),WH*(1-t),z0+dz*t+uz*sd*w*(1+t*1.4)],[0,1,0],[t,sd,ph],[0,0,0]));mb.quad(b0,b0+1,b0+2,b0+3)}}return mb}
function ballGeom(){const mb=MB();sph(mb,0,0,0,1,1,1,10,14,[1,1,1],[0,0,0],false);return mb}
function meatGeom(){const mb=MB();
 const skin=(nx,ct,nz)=>nx*.8+ct*.45-nz*.1;
 sph(mb,0,0,0,1,.8,.9,9,12,(nx,ct,nz,i,j)=>{const k=skin(nx,ct,nz);
  if(k>.3){const h=hash2(i*13+3,j*7+1),sc=.5+.5*Math.sin(nx*17+ct*15)*Math.sin(nz*17-ct*11);return[.74+.1*h+.05*sc,.84+.06*h,.9+.04*h]}   // peau claire écailleuse
  if(k>.12)return[.55,.16,.12];   // bord sombre entre peau et chair
  const st=.5+.5*Math.sin(ct*10+nz*4+nx*2);return[.9+.08*st,.28+.22*st,.14+.1*st]},[0,0,0],false,.42);
 tube(mb,[[.35,.25,.5],[.65,.42,.85],[.85,.55,1.1]],[.17,.1,.015],6,[.93,.88,.7],[0,0,0]);   // pointe d'os crème
 return mb}
function jellyGeom(){const mb=MB();sph(mb,0,0,0,1,.75,1,8,14,[1,1,1],[0,0,0],true);
 for(let t=0;t<7;t++){const a=t/7*6.2832,ca=Math.cos(a),sa=Math.sin(a),pts=[];for(let k=0;k<=5;k++)pts.push([ca*.62*(1-k*.05),-k*.45,sa*.62*(1-k*.05)]);tube(mb,pts,[.04,.035,.03,.025,.02,.012],4,[1,1,1],u=>[u,0,0])}return mb}
function decorGeom(d){const mb=MB(),Z=[0,0,0],c1=c=>[c[0]/255,c[1]/255,c[2]/255];
 for(const k of d.ke){const y0=gh(k.x,k.z),pts=[],wd=[];for(let i=0;i<=7;i++){const u=i/7;pts.push([k.x,y0+u*k.h,k.z]);wd.push(.26*(1-u*.65))}
  ribbon(mb,pts,wd,[Math.cos(k.p*2),0,Math.sin(k.p*2)],u=>c1(mixc([34,140,76],[110,210,120],u)),u=>[u,k.p,k.h*.085])}
 for(const o of d.sg){const y0=gh(o.x,o.z);for(let b=0;b<5;b++){const a=b*1.3+o.p,bx=o.x+Math.cos(a)*.35,bz=o.z+Math.sin(a)*.35;
  ribbon(mb,[[bx,y0,bz],[bx,y0+o.h*.55,bz],[bx,y0+o.h,bz]],[.05,.04,.012],[Math.cos(a+1.5),0,Math.sin(a+1.5)],u=>c1(mixc([70,160,90],[120,210,120],u)),u=>[u,o.p+b,.28])}}
 for(const o of d.co){const y0=gh(o.x,o.z);for(const b of o.br){const pts=[[o.x,y0-.1,o.z],[o.x+b[0]*.5,y0+o.h*.6,o.z+b[1]*.5],[o.x+b[0]*1.1,y0+o.h*1.15,o.z+b[1]*1.1]];
  tube(mb,pts,[.2,.15,.09],6,u=>c1(mixc(o.c,[255,255,255],.1+.3*u)),u=>[u,o.x,.05]);sph(mb,pts[2][0],pts[2][1],pts[2][2],.11,.11,.11,4,6,c1(mixc(o.c,[255,255,255],.45)),[1,o.x,.05],false)}}
 for(const o of d.dm)sph(mb,o.x,gh(o.x,o.z)+o.r*.1,o.z,o.r,o.r*.7,o.r,6,10,(nx,ny,nz)=>{const k=(.8+.2*Math.sin(nx*13)*Math.sin(nz*13+ny*6))/255;return[o.c[0]*k,o.c[1]*k,o.c[2]*k]},Z,true);
 for(const o of d.ro)for(const s of o.sp){const k=.35,bx=o.x+s[0],bz=o.z+s[1];sph(mb,bx,gh(bx,bz)+s[2]*.25,bz,s[2],s[2]*.7,s[2]*.9,6,9,(nx,ny,nz,i,j)=>{const m=(.82+.3*hash2(i*5+3,j*7))/255;return[o.c[0]*m,o.c[1]*m,o.c[2]*m]},Z,false,k)}
 for(const o of d.an){const y0=gh(o.x,o.z);tube(mb,[[o.x,y0,o.z],[o.x,y0+o.h*.5,o.z],[o.x,y0+o.h,o.z]],[.14,.11,.1],6,c1([200,150,170]),u=>[u,o.p,.03]);
  for(let i=0;i<9;i++){const a=i/9*6.283,ca=Math.cos(a),sa=Math.sin(a),t0=y0+o.h;tube(mb,[[o.x+ca*.12,t0,o.z+sa*.12],[o.x+ca*.32,t0+.28,o.z+sa*.32],[o.x+ca*.5,t0+.5,o.z+sa*.5]],[.04,.035,.02],4,u=>c1(mixc(o.c,[255,255,255],u*.4)),u=>[.3+u*.7,o.p+i,.1])}}
 for(const v of d.vt){const y0=gh(v.x,v.z);tube(mb,[[v.x,y0-.2,v.z],[v.x,y0+.5,v.z]],[.95,.4],8,c1([80,78,86]),Z)}
 const g=mul((d.sd|0)^0xbeef),B=R+6,P=()=>[(g()*2-1)*B,(g()*2-1)*B];
 for(let i=0;i<38;i++){const[px,pz]=P(),y0=gh(px,pz),col=c1(g()<.5?[235,110,60]:[240,160,90]),a0=g()*6.28,s=.35+g()*.35;   // étoiles de mer
  for(let k=0;k<5;k++){const a=a0+k*1.2566;tube(mb,[[px,y0+.05,pz],[px+Math.cos(a)*s*.5,y0+.1,pz+Math.sin(a)*s*.5],[px+Math.cos(a)*s,y0+.05,pz+Math.sin(a)*s]],[.09,.07,.025],5,col,Z)}
  sph(mb,px,y0+.08,pz,.14,.08,.14,4,6,col,Z,true)}
 for(let i=0;i<40;i++){const[px,pz]=P(),y0=gh(px,pz),r=.18+g()*.2;sph(mb,px,y0+r*.6,pz,r,r,r,5,8,c1([60,40,90]),Z,false);   // oursins
  for(let k=0;k<14;k++){const a=g()*6.28,e=g()*1.3,dx=Math.cos(a)*Math.cos(e),dy=Math.sin(e)+.15,dz=Math.sin(a)*Math.cos(e);tube(mb,[[px+dx*r,y0+r*.6+dy*r,pz+dz*r],[px+dx*r*2.4,y0+r*.6+dy*r*2.4,pz+dz*r*2.4]],[.014,.004],3,c1([110,80,150]),Z)}}
 for(let i=0;i<22;i++){const[px,pz]=P(),y0=gh(px,pz),h=1.4+g()*1.4,w=h*.7,an=g()*3.14,ux=Math.cos(an),uz=Math.sin(an),col=c1(g()<.5?[200,70,150]:[230,130,60]);   // gorgones en éventail
  for(let k=0;k<9;k++){const a=-.9+k*.225,sn=Math.sin(a);tube(mb,[[px,y0,pz],[px+ux*sn*w*.45,y0+h*.5,pz+uz*sn*w*.45],[px+ux*sn*w,y0+h*Math.cos(a)*.95,pz+uz*sn*w]],[.05,.04,.02],4,col,u=>[u,px,.04])}}
 for(let i=0;i<26;i++){const[px,pz]=P(),y0=gh(px,pz),col=c1(g()<.5?[240,170,200]:[240,215,110]);   // vers tubicoles
  for(let k=0;k<5;k++){const bx=px+(g()-.5)*.6,bz=pz+(g()-.5)*.6,hh=.4+g()*.7;tube(mb,[[bx,y0-.05,bz],[bx,y0+hh,bz]],[.09,.07],6,col,u=>[u,bx,.05])}}
 for(let i=0;i<110;i++){const side=i%4,t=(g()*2-1)*(R+14),off=R+9+g()*10,px=side<2?t:(side===2?off:-off),pz=side<2?(side===0?off:-off):t,r=3.5+g()*5.5;   // falaises qui entourent la zone
  sph(mb,px,gh(px,pz)+r*.25,pz,r,r*(.9+g()*.9),r,7,10,(nx,ny,nz,i2,j2)=>{const m=.6+.3*hash2(i2*5+i,j2*7)+.2*ny;return[.4*m,.45*m,.47*m]},Z,false,.45)}
 return mb}
/* ── shaders ── */
const VS_S=`precision highp float;attribute vec3 a_pos;attribute vec3 a_nrm;attribute vec3 a_col;attribute vec3 a_aux;
uniform mat4 u_vp;uniform mat4 u_m;uniform float u_t,u_mode,u_ph,u_bw,u_bite;
varying vec3 v_n;varying vec3 v_c;varying vec3 v_w;varying vec3 v_l;varying vec3 v_ln;varying float v_z;
void main(){vec3 p=a_pos;
 if(u_mode>.5&&u_mode<1.5){float w=a_aux.x;p.x+=sin(u_t*1.1+a_aux.y+w*2.5)*a_aux.z*w*w;p.z+=cos(u_t*.9+a_aux.y*1.3+w*2.2)*a_aux.z*.55*w*w;}
 else if(u_mode>1.5&&u_mode<2.5){float tt=clamp(.5-p.z,0.,1.4);p.x+=sin(u_ph-tt*3.2)*.1*tt*tt*u_bw;if(a_col.x>3.5)p=a_aux+(p-a_aux)*u_bite;}
 else if(u_mode>2.5&&u_mode<3.5){p.y+=sin(p.x*.2+u_t*.9)*.5+cos(p.z*.17+u_t*.7)*.4;}
 else if(u_mode>3.5&&u_mode<4.5){p.y*=1.+.1*sin(u_t*2.+u_ph);p.x+=sin(u_t*1.5+u_ph+a_aux.x*4.)*.22*a_aux.x;p.z+=cos(u_t*1.3+u_ph+a_aux.x*4.)*.22*a_aux.x;}
 vec4 wp=u_m*vec4(p,1.);v_w=wp.xyz;v_n=(u_m*vec4(a_nrm,0.)).xyz;v_c=a_col;v_l=p;v_ln=a_nrm;gl_Position=u_vp*wp;v_z=gl_Position.w;}`;
const FS_S=`#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform vec3 u_fog;uniform vec3 u_cb;uniform vec3 u_cl;uniform vec3 u_cf;uniform vec3 u_base;uniform vec3 u_cam;uniform float u_t,u_mode,u_a,u_bands,u_caus;
varying vec3 v_n;varying vec3 v_c;varying vec3 v_w;varying vec3 v_l;varying vec3 v_ln;varying float v_z;
void main(){float f=clamp((v_z-7.)/42.,0.,.93);
 if(u_mode>5.5){float a=pow(max(1.-v_c.x,0.),1.4)*pow(max(1.-v_c.y*v_c.y,0.),1.6)*(.55+.45*sin(u_t*.5+v_c.z))*u_a;gl_FragColor=vec4(vec3(.78,.96,1.),a*(1.-f*.7));return;}
 vec3 n=normalize(v_n);if(!gl_FrontFacing)n=-n;vec3 Ld=normalize(vec3(.35,.85,.4));vec3 V=normalize(u_cam-v_w);vec3 c=v_c;float rip=.5;
 if(u_caus>.9){rip=sin(v_w.x*2.3+sin(v_w.z*.55)*2.2)*.5+.5;float r2=sin(v_w.z*1.7+sin(v_w.x*.43)*1.6)*.5+.5;n=normalize(n+vec3((rip-.5)*.32,0.,(r2-.5)*.32)*max(n.y,0.));c*=.9+.16*rip;}
 float dif=max(dot(n,Ld),0.),hemi=.5+.5*n.y,lit=.34+.34*hemi+.62*dif,spec=0.;
 if(u_mode>2.5&&u_mode<3.5){c=vec3(.69,.93,1.)*(.8+.2*sin(v_w.x*.31+v_w.z*.27+u_t*1.4)+.08*sin(v_w.x*1.3-u_t*2.)*sin(v_w.z*1.1+u_t*1.7));f=clamp((v_z-10.)/60.,0.,.85);gl_FragColor=vec4(mix(c,u_fog,f),u_a);return;}
 if(u_mode>3.5&&u_mode<4.5){float e=1.-abs(dot(n,V));gl_FragColor=vec4(mix(u_base*(.8+.6*e),u_fog,f),u_a*(.3+.7*e));return;}
 if(u_mode>4.5){c=u_base;spec=pow(max(dot(n,normalize(Ld+V)),0.),30.)*.5;}
 else if(u_mode>1.5&&u_mode<2.5){float z=v_c.x;
  if(z<.5){float ly=normalize(v_ln).y;c=mix(u_cl,u_cb,smoothstep(-.5,-.15,ly));c=mix(c,u_cb*.78,smoothstep(.3,.8,ly));
   if(u_bands>.5){float bz=min(abs(v_l.z-.17),abs(v_l.z+.17));c=mix(c,u_base,(1.-smoothstep(.015,.045,bz))*.85);}
   c*=.93+.07*sin(v_l.z*85.+v_l.x*30.)*sin(v_l.z*60.-v_l.y*70.);
   spec=pow(max(dot(n,normalize(Ld+V)),0.),22.)*.22+pow(1.-max(dot(n,V),0.),3.)*.1;}
  else if(z<1.5){c=u_cf*(.9+.12*sin(v_l.z*120.));}
  else if(z<2.5){c=vec3(1.);lit=.95;spec=.3;}
  else if(z<3.5){c=vec3(.04,.07,.15);lit=1.;spec=pow(max(dot(n,normalize(Ld+V)),0.),30.)*.8;}
  else{c=vec3(.54,.06,.15);lit=.9;}}
 if(u_caus>0.&&u_mode<1.5){float c1=sin(v_w.x*.9+u_t*1.3)*sin(v_w.z*.8-u_t*1.1),c2=sin(v_w.x*1.7-u_t*.9+v_w.z*.5)*sin(v_w.z*1.5+u_t*1.2),ca=pow(clamp((c1+c2)*.5+.5,0.,1.),2.5)*2.;lit*=1.+u_caus*.5*ca*max(n.y,0.)*(1.-f);}
 vec3 col=c*lit+vec3(spec);col*=mix(vec3(1.),vec3(.62,.86,1.04),clamp(1.-v_w.y/36.,0.,1.)*.8);   // l'eau absorbe le rouge en profondeur
 float lum=dot(col,vec3(.3,.59,.11));col=mix(vec3(lum),col,1.18);
 gl_FragColor=vec4(mix(col,u_fog,f),u_a);}`;
const VS_P=`precision highp float;attribute vec3 a_pos;attribute vec4 a_col;attribute float a_sz;uniform mat4 u_vp;uniform float u_foc;uniform vec3 u_fog;varying vec4 v_c;
void main(){gl_Position=u_vp*vec4(a_pos,1.);float z=max(gl_Position.w,.1);gl_PointSize=clamp(a_sz*u_foc/z,1.,120.);float f=clamp((z-7.)/42.,0.,.93);v_c=vec4(mix(a_col.rgb,u_fog,f*.7),a_col.a);}`;
const FS_P=`precision mediump float;varying vec4 v_c;void main(){float d=length(gl_PointCoord-.5)*2.;if(d>1.)discard;float a=pow(1.-d,1.3);gl_FragColor=vec4(v_c.rgb,v_c.a*clamp(a*1.5,0.,1.));}`;
const VS_B=`attribute vec2 a_p;void main(){gl_Position=vec4(a_p,0.,1.);}`;
const FS_B=`precision highp float;uniform vec2 u_res;uniform vec2 u_c;uniform float u_foc;uniform vec3 u_cf;uniform vec3 u_cr;uniform vec3 u_cu;uniform vec3 u_wc;
void main(){float sx=gl_FragCoord.x-u_c.x,sy=u_c.y-(u_res.y-gl_FragCoord.y);vec3 d=normalize(u_cf+sx/u_foc*u_cr+sy/u_foc*u_cu);float t=d.y;
 vec3 top=mix(u_wc,vec3(.59,.9,1.),.55),bot=mix(u_wc,vec3(0.,.04,.1),.6);vec3 c=t>0.?mix(u_wc,top,smoothstep(0.,.8,t)):mix(u_wc,bot,smoothstep(0.,.8,-t));gl_FragColor=vec4(c,1.);}`;
function createGL(cvs){try{return glBuild(cvs)}catch(err){console.error("[fish] WebGL indisponible :",err);return null}}
function glBuild(cvs){
 const opt={alpha:false,antialias:true,depth:true,powerPreference:"high-performance"};
 let gl=cvs.getContext("webgl2",opt);const g2=!!gl;if(!gl)gl=cvs.getContext("webgl",opt)||cvs.getContext("experimental-webgl",opt);
 if(!gl||(!g2&&!gl.getExtension("OES_element_index_uint")))return null;
 const G={lost:false,gen:0};let PS,PP,PB,M={},FR=null,spB=null,fanB=null;
 const prog=(vs,fs,at)=>{const p=gl.createProgram();[[gl.VERTEX_SHADER,vs],[gl.FRAGMENT_SHADER,fs]].forEach(([t,s])=>{const h=gl.createShader(t);gl.shaderSource(h,s);gl.compileShader(h);if(!gl.getShaderParameter(h,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(h));gl.attachShader(p,h)});
  at.forEach((n,i)=>gl.bindAttribLocation(p,i,n));gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(p));const c={};return{p,u:n=>n in c?c[n]:(c[n]=gl.getUniformLocation(p,n))}};
 const mesh=mb=>{const vb=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,vb);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(mb.D),gl.STATIC_DRAW);const ib=gl.createBuffer();gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,ib);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,new Uint32Array(mb.I),gl.STATIC_DRAW);return{vb,ib,cnt:mb.I.length}};
 const f1=(P,n,v)=>gl.uniform1f(P.u(n),v),f3=(P,n,a)=>gl.uniform3f(P.u(n),a[0],a[1],a[2]);
 const useS=()=>{gl.useProgram(PS.p);gl.uniformMatrix4fv(PS.u("u_vp"),false,FR.vp);f3(PS,"u_cam",FR.cam);f3(PS,"u_fog",FR.fog);f1(PS,"u_t",FR.t)};
 const solid=(m,mode,mat,a,caus)=>{gl.bindBuffer(gl.ARRAY_BUFFER,m.vb);gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,m.ib);for(let i=0;i<4;i++){gl.enableVertexAttribArray(i);gl.vertexAttribPointer(i,3,gl.FLOAT,false,48,i*12)}
  gl.uniformMatrix4fv(PS.u("u_m"),false,mat||ID);f1(PS,"u_mode",mode);f1(PS,"u_a",a==null?1:a);f1(PS,"u_caus",caus||0);gl.drawElements(gl.TRIANGLES,m.cnt,gl.UNSIGNED_INT,0)};
 G.init=()=>{PS=prog(VS_S,FS_S,["a_pos","a_nrm","a_col","a_aux"]);PP=prog(VS_P,FS_P,["a_pos","a_col","a_sz"]);PB=prog(VS_B,FS_B,["a_p"]);
  M={rays:mesh(raysGeom()),terr:mesh(terrGeom()),f0:mesh(fishGeom(0)),f1:mesh(fishGeom(1)),ball:mesh(ballGeom()),meat:mesh(meatGeom()),jelly:mesh(jellyGeom()),water:mesh(waterGeom())};
  spB=gl.createBuffer();fanB=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,fanB);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),gl.STATIC_DRAW);G.gen++};
 G.init();
 G.begin=p=>{FR=p;gl.viewport(0,0,p.w,p.h);gl.disable(gl.CULL_FACE);gl.depthMask(true);gl.disable(gl.BLEND);gl.clearColor(p.fog[0],p.fog[1],p.fog[2],1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
  gl.disable(gl.DEPTH_TEST);gl.useProgram(PB.p);gl.bindBuffer(gl.ARRAY_BUFFER,fanB);for(let i=1;i<4;i++)gl.disableVertexAttribArray(i);gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,2,gl.FLOAT,false,0,0);
  gl.uniform2f(PB.u("u_res"),p.w,p.h);gl.uniform2f(PB.u("u_c"),p.cx,p.cy);f1(PB,"u_foc",p.foc);f3(PB,"u_cf",p.cf);f3(PB,"u_cr",p.cr);f3(PB,"u_cu",p.cu);f3(PB,"u_wc",p.fog);gl.drawArrays(gl.TRIANGLES,0,3);
  gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);useS()};
 G.terrain=()=>solid(M.terr,0,ID,1,1);
 G.decor=d=>{if(!d._m||d._g!==G.gen){d._m=mesh(decorGeom(d));d._g=G.gen}solid(d._m,1,ID,1,.5)};
 G.fish=(r,Lm,sh)=>{const sp=r.sp,cy=Math.cos(r.yaw),sy=Math.sin(r.yaw),cp=Math.cos(r.pitch),sp_=Math.sin(r.pitch),rl=r.roll||0,cl=Math.cos(rl),sl=Math.sin(rl),
   fw=[sy*cp,sp_,cy*cp],r0=[cy,0,-sy],u0=[-sp_*sy,cp,-sp_*cy],rt=[r0[0]*cl+u0[0]*sl,r0[1]*cl+u0[1]*sl,r0[2]*cl+u0[2]*sl],up=[u0[0]*cl-r0[0]*sl,u0[1]*cl-r0[1]*sl,u0[2]*cl-r0[2]*sl];
  MAT.set([rt[0]*Lm,rt[1]*Lm,rt[2]*Lm,0,up[0]*Lm,up[1]*Lm,up[2]*Lm,0,fw[0]*Lm,fw[1]*Lm,fw[2]*Lm,0,r.x,r.y,r.z,1]);
  f1(PS,"u_ph",r.ph);f1(PS,"u_bw",r.boost?1.5:1);f1(PS,"u_bite",r.bt?2:.001);f1(PS,"u_bands",sp.bands?1:0);f3(PS,"u_cb",n255(sp.b));f3(PS,"u_cl",n255(sp.bl));f3(PS,"u_cf",n255(sp.fn));f3(PS,"u_base",n255(sp.bd));
  solid(sh?M.f1:M.f0,2,MAT,1,0)};
 G.ball=(px,py,pz,rd,col)=>{MAT.set([rd,0,0,0,0,rd,0,0,0,0,rd,0,px,py,pz,1]);f3(PS,"u_base",col);solid(M.ball,5,MAT,1,0)};
 G.meat=(px,py,pz,rd,sp)=>{const c=Math.cos(sp)*rd,s=Math.sin(sp)*rd;MAT.set([c,0,-s,0,0,rd,0,0,s,0,c,0,px,py,pz,1]);solid(M.meat,0,MAT,1,0)};
 G.trans=()=>{gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.depthMask(false)};
 G.water=()=>solid(M.water,3,ID,.82,0);
 G.rays=()=>{gl.blendFunc(gl.SRC_ALPHA,gl.ONE);solid(M.rays,6,ID,.2,0);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA)};
 G.jelly=(px,py,pz,rd,col,ph)=>{MAT.set([rd,0,0,0,0,rd,0,0,0,0,rd,0,px,py,pz,1]);f1(PS,"u_ph",ph);f3(PS,"u_base",n255(col));solid(M.jelly,4,MAT,.6,0)};
 G.sprites=(arr,n)=>{if(!n)return;gl.useProgram(PP.p);gl.uniformMatrix4fv(PP.u("u_vp"),false,FR.vp);f1(PP,"u_foc",FR.foc);f3(PP,"u_fog",FR.fog);
  gl.bindBuffer(gl.ARRAY_BUFFER,spB);gl.bufferData(gl.ARRAY_BUFFER,arr.subarray(0,n*8),gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,3,gl.FLOAT,false,32,0);gl.enableVertexAttribArray(1);gl.vertexAttribPointer(1,4,gl.FLOAT,false,32,12);gl.enableVertexAttribArray(2);gl.vertexAttribPointer(2,1,gl.FLOAT,false,32,28);gl.disableVertexAttribArray(3);
  gl.drawArrays(gl.POINTS,0,n)};
 G.dispose=()=>{try{const e=gl.getExtension("WEBGL_lose_context");e&&e.loseContext()}catch{}};
 return G}

export function createFishClient(env){
 const {R:ref,set,remove,onValue,getMe,getCode,getLobby,$}=env,cv=$("cv"),x=cv.getContext("2d"),ov=$("ov"),help=$("ghelp");
 let active=false,un=()=>{},raf=0,S=null,snapT=0,me="",code="",lastT=0,lastSend=0,last="",joy=null,kc=0,sdSeen=-1,PK=[],deco=null,shk=0,pkSet=new Set(),prevM=0,boostKey=false,dangerT=0;
 let ML=[],DG=[],dgn=0,seenDg=new Set(),cid=0,mrend=new Map(),ema=.016,lowq=0,enterT=0,hostOn=false,E=[],byId=new Map(),ev=[],hLast=new Map(),hostT=0,acc=0,pubN=0,nid=0,t=0,pkAt=new Array(NPK).fill(0),poseUn=null,timer=0;
 let touch=!!(window.matchMedia&&matchMedia("(pointer:coarse)").matches);
 const rz=()=>{dirty=1};const keys=new Map(),btn=new Map(),rend=new Map(),parts=[],cam={x:0,y:12,z:0,yaw:0,pitch:0},wc=[10,60,100];
 const L={yv:0,pv:0,roll:0,sf:1,bm:1,aim:null,x:0,y:10,z:0,yaw:0,pitch:0,st:100,lun:0,bcd:0,bc:0,rc:-1,a:1,bt:0,boost:0,m:1.6,spd:0,tired:0,ph:0};
 const NEAR=.35,BB={x:0,y:0,r:46},BS={x:0,y:0,r:34};let W=800,H=560,FOC=520,CY=235,bW=800,bH=560,uS=1,SAf={t:0,r:0,b:0,l:0},JR=58,probe=null,G=null,glc=null,lvT=-9,lvTxt="",lastSt=-1,sty=null,dirty=1,isGm=false,ro=null,pops=[],pmh=0,phpv=100;
 let cf=[0,0,1],cr=[1,0,0],cu=[0,1,0];
 /* ---- entrées ---- */
 let msOn=false,ms=null,brk=false;try{msOn=localStorage.getItem("moda.fishmouse")==="1"}catch{}
 const vec=()=>{   // [virage -1..1, tangage -1..1, vitesse 0..1]
  const ax=(a,b)=>keys.has(a)&&keys.has(b)?(keys.get(a)>keys.get(b)?1:-1):(keys.has(a)?1:0)-(keys.has(b)?1:0);
  const kx=ax("R","L"),kz=ax("U","B");
  if(kx||kz){const l=Math.hypot(kx,kz);return[kx/l,kz/l,1]}
  if(joy){const dx=joy.px-joy.ox,dy=joy.py-joy.oy,l=Math.hypot(dx,dy);if(l>7){const m=Math.min(1,l/JR),n=Math.min(1,m*1.3);return[dx/l*n,-dy/l*n,.5+.5*m]}}
  if(msOn&&ms){const f=v=>{const a=Math.abs(v);return a<.07?0:Math.sign(v)*Math.min(1,Math.pow(a,1.25))};return[f((ms.x-W/2)/(W*.28)),f(-(ms.y-H*.48)/(H*.3)),1]}   // pilotage à la souris : le poisson se tourne vers le curseur
  return[0,0,1]};
 const MV={ArrowUp:"U",KeyW:"U",ArrowDown:"B",KeyS:"B",ArrowLeft:"L",KeyA:"L",ArrowRight:"R",KeyD:"R"};
 const kd=e=>{if(!active)return;const m=MV[e.code];if(m){if(!keys.has(m))keys.set(m,++kc);e.preventDefault();return}
  if(e.code==="Space"||e.code==="KeyE"){e.preventDefault();if(!e.repeat)bite()}
  else if(e.code==="ShiftLeft"||e.code==="ShiftRight"||e.code==="KeyX"){e.preventDefault();boostKey=true}
  else if(e.code==="KeyC"||e.code==="ControlLeft"){e.preventDefault();brk=true}
  else if(e.code==="KeyM"&&!e.repeat){msOn=!msOn;try{localStorage.setItem("moda.fishmouse",msOn?"1":"0")}catch{}try{env.toast(msOn?"🖱️ Pilotage à la souris : le poisson suit ton curseur (M pour arrêter)":"⌨️ Pilotage à la souris désactivé")}catch{}}};
 const ku=e=>{const m=MV[e.code];if(m)keys.delete(m);if(e.code==="ShiftLeft"||e.code==="ShiftRight"||e.code==="KeyX")boostKey=false;if(e.code==="KeyC"||e.code==="ControlLeft")brk=false};
 const blur=()=>{keys.clear();joy=null;btn.clear();boostKey=false;brk=false};
 const toC=e=>{const r=cv.getBoundingClientRect();return[(e.clientX-r.left)*W/r.width,(e.clientY-r.top)*H/r.height]};
 const hit=(p,b)=>Math.hypot(p[0]-b.x,p[1]-b.y)<=b.r+14;
 const pd=e=>{if(!active||e.target.closest("button"))return;e.preventDefault();if(e.pointerType!=="mouse")touch=true;const p=toC(e);try{cv.setPointerCapture(e.pointerId)}catch{}
  if(e.pointerType==="mouse"){bite();return}
  if(hit(p,BS))btn.set(e.pointerId,"s");
  else if(hit(p,BB)||p[0]>=W*.5){btn.set(e.pointerId,"b");bite()}   // toute la moitié droite = MORDRE (maintenir = mordre en boucle)
  else if(!joy&&p[1]>H*.2)joy={id:e.pointerId,ox:p[0],oy:p[1],px:p[0],py:p[1]}};
 const pm=e=>{if(e.pointerType==="mouse"){const p=toC(e);ms={x:p[0],y:p[1]}}if(joy&&joy.id===e.pointerId){const p=toC(e);joy.px=p[0];joy.py=p[1];const dx=p[0]-joy.ox,dy=p[1]-joy.oy,l=Math.hypot(dx,dy),lim=JR*1.05;if(l>lim){joy.ox+=dx/l*(l-lim);joy.oy+=dy/l*(l-lim)}}};   // le joystick suit le doigt s'il dépasse
 const pl=()=>{ms=null};
 const pu=e=>{btn.delete(e.pointerId);if(joy&&joy.id===e.pointerId)joy=null};
 const noCtx=e=>e.preventDefault();
 function bite(){
  if(!active||!L.a||L.bcd>0||!S)return;
  L.aim=null;let bd=64;   // aide à la visée : pendant la ruée, on se tourne vers la proie comestible la plus proche devant soi
  for(const [id,r] of rend){if(id==="me")continue;const dx=r.x-L.x,dy=r.y-L.y,dz=r.z-L.z,d2=dx*dx+dy*dy+dz*dz;if(d2>=bd)continue;if(Math.abs(angd(Math.atan2(dx,dz)-L.yaw))>1)continue;bd=d2;L.aim=r}
  L.bc++;L.bcd=BITE_CD;L.lun=.3;L.bt=.35;send(true);if(touch)try{navigator.vibrate&&navigator.vibrate(12)}catch{}}
 function send(force){
  if(!active||!S||L.rc<0||!L.a)return;const v=`${L.x.toFixed(2)},${L.y.toFixed(2)},${L.z.toFixed(2)},${L.yaw.toFixed(3)},${L.pitch.toFixed(3)},${L.boost},${L.bc},${L.rc},${L.sf.toFixed(2)}`;
  const n=performance.now();if(!force&&(v===last||n-lastSend<80))return;last=v;lastSend=n;Promise.resolve(set(ref(`games/${code}/p/${me}`),v)).catch(()=>{})}
 /* ---- 3D ---- */
 const cs=(px,py,pz)=>{const dx=px-cam.x,dy=py-cam.y,dz=pz-cam.z;return[dx*cr[0]+dz*cr[2],dx*cu[0]+dy*cu[1]+dz*cu[2],dx*cf[0]+dy*cf[1]+dz*cf[2]]};
 const fog=d=>clamp((d-7)/42,0,.93);
 const burst=(px,py,pz,cols,n,s0)=>{if(parts.length>260)return;for(let i=0;i<n;i++){const a=Math.random()*6.28,b=Math.random()*3.1-1.5,s=(s0||2)*(.4+Math.random());parts.push({x:px,y:py,z:pz,vx:Math.cos(a)*Math.cos(b)*s,vy:Math.sin(b)*s+.8,vz:Math.sin(a)*Math.cos(b)*s,l:.7+Math.random()*.6,c:cols[i%cols.length],s:.05+Math.random()*.08})}};
 const BLOOD=["#ff6b6b","#ffd1d1","#ffffff"],BUB=["#d9f6ff","#ffffff","#9fe3ff"];
 const hash2=(i,j)=>{let h=Math.imul(i|0,374761393)+Math.imul(j|0,668265263)|0;h=Math.imul(h^h>>>13,1274126177);return((h^h>>>16)>>>0)/4294967296};
 const HUES=[330,350,15,28,280,175,48];
 const mkDeco=sd=>{const g=mul(sd^0xdec0),B=R+6,P=()=>[(g()*2-1)*B,(g()*2-1)*B],o={co:[],dm:[],an:[],sg:[],ke:[],ro:[],vt:[],jf:[],sn:[]},hu=()=>HUES[Math.floor(g()*HUES.length)];
  for(let i=0;i<55;i++){const p=P(),h0=hu(),n=3+Math.floor(g()*4),br=[];for(let k=0;k<n;k++)br.push([(g()-.5)*1.7,(g()-.5)*1.7]);o.co.push({x:p[0],z:p[1],h:1.2+g()*2.4,c:hsl(h0,.72,.55),br})}
  for(let i=0;i<40;i++){const p=P(),h0=hu();o.dm.push({x:p[0],z:p[1],r:.5+g()*1.3,c:hsl(h0,.6,.5),d:hsl(h0,.6,.32)})}
  for(let i=0;i<30;i++){const p=P();o.an.push({x:p[0],z:p[1],h:.5+g()*.7,c:hsl(g()<.5?300+g()*30:20+g()*30,.85,.62),p:g()*6})}
  for(let i=0;i<110;i++){const p=P();o.sg.push({x:p[0],z:p[1],h:.8+g()*1.3,p:g()*6})}
  for(let i=0;i<80;i++){const p=P();o.ke.push({x:p[0],z:p[1],h:5+g()*10,p:g()*6})}
  for(let i=0;i<45;i++){const p=P(),n=2+Math.floor(g()*2),sp=[],t0=g()<.5?[112,116,128]:[130,118,104];for(let k=0;k<n;k++)sp.push([(g()-.5)*3,(g()-.5)*3,.7+g()*1.6]);o.ro.push({x:p[0],z:p[1],sp,c:t0})}
  for(let i=0;i<6;i++){const p=P();o.vt.push({x:p[0],z:p[1],p:g()*3})}
  for(let i=0;i<12;i++){o.jf.push({x:(g()*2-1)*(R-8),y:7+g()*(WH-14),z:(g()*2-1)*(R-8),r:.7+g()*.9,p:g()*6,c:[[255,150,230],[150,200,255],[190,255,220]][i%3]})}
  for(let i=0;i<70;i++)o.sn.push([g()*50,g()*50,g()*50,.3+g()*.7]);
  o.sd=sd;return o};
 /* ---- état ---- */
 function updRend(dt,now,vis){
  if(!S)return;const ex=Math.min(.25,(now-snapT)/1000);
  const upd=(id,t,x1,y1,z1,yaw,pit,m,k,spd,bt,sp,al)=>{
   let r=rend.get(id);if(!r){r={x:x1,y:y1,z:z1,yaw,pitch:pit,ph:Math.random()*6,sp,k};rend.set(id,r)}
   const cp=Math.cos(pit),tx=x1+Math.sin(yaw)*cp*spd*ex,ty=y1+Math.sin(pit)*spd*ex,tz=z1+Math.cos(yaw)*cp*spd*ex,kk=1-Math.exp(-dt*14);
   if(Math.abs(tx-r.x)>6||Math.abs(tz-r.z)>6){r.x=tx;r.y=ty;r.z=tz}else{r.x+=(tx-r.x)*kk;r.y+=(ty-r.y)*kk;r.z+=(tz-r.z)*kk}
   const oy_=r.yaw;r.yaw+=angd(yaw-r.yaw)*Math.min(1,dt*12);r.roll=(r.roll||0)+(clamp(-angd(r.yaw-oy_)/dt*.22,-.6,.6)-(r.roll||0))*Math.min(1,dt*8);r.pitch+=(pit-r.pitch)*Math.min(1,dt*12);r.m=m;r.k=k;r.spd=spd;r.bt=bt;r.ph+=dt*(3+spd*1.1);r.sp=sp;return r};
  S.p.forEach(t=>{if(t[0]===me||!t[7])return;const r=upd(t[0],0,t[1],t[2],t[3],t[4],t[5],t[6],0,t[11],t[14],specOf(t[10],hexrgb(t[10]),0));r.n=t[9];r.pl=1;vis.push(r)});
  S.f.forEach(t=>{const id=t[0],n=parseInt(id.slice(1))||0,sh=t[7]===1,r=upd(id,0,t[1],t[2],t[3],t[4],t[5],t[6],t[7],t[8],t[9],sh?specOf("s",[110,128,148],1):specOf("n"+(n%PAL.length),PAL[n%PAL.length],0));r.pl=0;r.n=sh?"🦈":"";vis.push(r)});
  const mine=S.p.find(t=>t[0]===me);
  if(mine&&L.a){const r=rend.get("me")||{ph:0};r.x=L.x;r.y=L.y;r.z=L.z;r.yaw=L.yaw;r.pitch=L.pitch;r.roll=L.roll;r.m=L.m;r.k=0;r.spd=L.spd;r.boost=L.boost;r.bt=L.bt>0?1:0;r.ph+=dt*(3+L.spd*1.1);r.sp=specOf(mine[10],hexrgb(mine[10]),0);r.n=mine[9];r.pl=1;r.me=1;rend.set("me",r);vis.push(r)}}
 function stepLocal(dt){
  const mine=S&&S.p.find(q=>q[0]===me);if(!mine)return;
  if(L.rc!==mine[13]){L.rc=mine[13];L.x=mine[1];L.y=mine[2];L.z=mine[3];L.yaw=mine[4];L.pitch=mine[5];L.st=100;L.lun=0;L.tired=0;L.yv=L.pv=L.roll=0;cam.yaw=L.yaw;cam.pitch=L.pitch*.75}
  L.a=mine[7];L.m=mine[6];L.bcd=Math.max(0,L.bcd-dt);L.bt=Math.max(0,L.bt-dt);
  if(L.a){
   const [tn,pt,mg]=vec(),Lm=len(L.m),k=1+Lm*.05,sm=1-Math.exp(-dt*11);
   if(L.lun>0&&L.aim&&L.aim.x!==undefined){   // ruée guidée vers la proie
    const dx=L.aim.x-L.x,dy=L.aim.y-L.y,dz=L.aim.z-L.z,hd=Math.hypot(dx,dz);
    L.yaw+=clamp(angd(Math.atan2(dx,dz)-L.yaw),-10*dt,10*dt);L.pitch=clamp(L.pitch+clamp(Math.atan2(dy,Math.max(.01,hd))-L.pitch,-8*dt,8*dt),-1.35,1.35)}
   L.yv+=(tn*3.4/k-L.yv)*sm;L.pv+=(pt*2.4/k-L.pv)*sm;   // vitesse de rotation lissée : réactif mais fluide
   L.yaw+=L.yv*dt;L.pitch=clamp(L.pitch+L.pv*dt,-1.35,1.35);
   L.roll+=(clamp(-L.yv*.22,-.6,.6)-L.roll)*(1-Math.exp(-dt*8));   // le poisson s'incline dans les virages
   const want=boostKey||[...btn.values()].includes("s");
   if(want&&L.st>0&&!L.tired){L.boost=1;L.st=Math.max(0,L.st-32*dt);if(L.st<=0)L.tired=1}else{L.boost=0;L.st=Math.min(100,L.st+(want?6:24)*dt);if(L.st>25)L.tired=0}
   L.sf+=((brk?.4:1)*mg-L.sf)*(1-Math.exp(-dt*6));L.bm+=((L.boost?1.8:1)-L.bm)*(1-Math.exp(-dt*9));
   L.lun=Math.max(0,L.lun-dt);const sp=spdOf(L.m)*L.sf*L.bm*(L.lun>0?2.5:1),cp=Math.cos(L.pitch);L.spd=sp;
   L.x=clamp(L.x+Math.sin(L.yaw)*cp*sp*dt,-R,R);L.z=clamp(L.z+Math.cos(L.yaw)*cp*sp*dt,-R,R);L.y=clamp(L.y+Math.sin(L.pitch)*sp*dt,gh(L.x,L.z)+Lm*.3+.3,WH-1);
   if(L.boost&&Math.random()<dt*14)burst(L.x-Math.sin(L.yaw)*Lm*.5,L.y,L.z-Math.cos(L.yaw)*Lm*.5,BUB,1,.6)}
  else if(!L.a)L.spd=0;
  if(mine[6]>prevM+.25&&prevM>0&&L.a){const Lm=len(L.m);burst(L.x+Math.sin(L.yaw)*Lm*.6,L.y,L.z+Math.cos(L.yaw)*Lm*.6,BLOOD,12,2.5);shk=Math.max(shk,.25);try{env.beep(520,.07,"sine",.05,900)}catch{}}
  const hpn=mine[16]==null?100:mine[16];
  if(hpn<phpv-1&&L.a&&prevM>0){const Lm=len(L.m);L.hurt=.5;shk=Math.max(shk,.4);burst(L.x,L.y,L.z,BLOOD,8,2);try{env.beep(180,.12,"sawtooth",.06,90)}catch{}try{navigator.vibrate&&navigator.vibrate(40)}catch{}}
  phpv=hpn;L.hurt=Math.max(0,(L.hurt||0)-dt);
  prevM=mine[6]}
 function updCam(dt){
  const k=1-Math.exp(-dt*7),Lm=len(L.m||1.6),D=3.2+Lm*2.4+(L.bm-1)*1.4;
  if(L.a){cam.yaw+=angd(L.yaw-cam.yaw)*Math.min(1,k*1.6);cam.pitch+=(L.pitch*.75-cam.pitch)*k}else cam.yaw+=dt*.25;
  const p=cam.pitch,fx=Math.sin(cam.yaw)*Math.cos(p),fy=Math.sin(p),fz=Math.cos(cam.yaw)*Math.cos(p);
  cam.x=L.x-fx*D;cam.y=clamp(L.y-fy*D+Lm*.5,gh(L.x-fx*D,L.z-fz*D)+.5,WH-.3);cam.z=L.z-fz*D;
  const vp=clamp(p-.1,-1.4,1.4),sy=Math.sin(cam.yaw),cy=Math.cos(cam.yaw),sp=Math.sin(vp),cp=Math.cos(vp);
  cf=[sy*cp,sp,cy*cp];cr=[cy,0,-sy];cu=[-sp*sy,cp,-sp*cy]}
 /* ---- écran adaptatif (téléphone / PC) ---- */
 const insets=()=>{if(!probe){probe=document.createElement("div");probe.style.cssText="position:fixed;left:0;top:0;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)";document.body.appendChild(probe)}
  const c=getComputedStyle(probe);SAf={t:parseFloat(c.paddingTop)||0,r:parseFloat(c.paddingRight)||0,b:parseFloat(c.paddingBottom)||0,l:parseFloat(c.paddingLeft)||0}};
 function layout(){
  isGm=document.body.classList.contains("gm");const r=cv.getBoundingClientRect(),cw=Math.max(200,Math.round(r.width||800)),ch=isGm?Math.max(150,Math.round(r.height||560)):Math.round(cw*.7);
  const q=Math.min(devicePixelRatio||1,2)*(lowq?.72:1),nw=Math.round(cw*q),nh=Math.round(ch*q);
  W=cw;H=ch;if(nw!==cv.width||nh!==cv.height){cv.width=nw;cv.height=nh}if(glc&&(glc.width!==nw||glc.height!==nh)){glc.width=nw;glc.height=nh}bW=nw;bH=nh;
  FOC=Math.min(.93*H,.8*W);CY=H*.42;uS=clamp(Math.min(W/700,H/430),.85,1.15);insets();
  BB.r=Math.round(46*uS);BB.x=W-SAf.r-BB.r-22;BB.y=H-SAf.b-78*uS-BB.r;BS.r=Math.round(34*uS);BS.x=BB.x-BB.r-BS.r-18;BS.y=BB.y+BB.r-BS.r;JR=Math.round(58*uS);dirty=0}
 /* ---- scène 3D ---- */
 const SPR=new Float32Array(8*1600);let nspr=0;
 const spr=(px,py,pz,col,a,sz)=>{if(nspr>=1600)return;const o=nspr++*8;SPR[o]=px;SPR[o+1]=py;SPR[o+2]=pz;SPR[o+3]=col[0];SPR[o+4]=col[1];SPR[o+5]=col[2];SPR[o+6]=a;SPR[o+7]=sz};
 function draw3D(now,dt,vis){
  const td=now/1000,sa=shk*5,shx=sa?(Math.random()-.5)*4*sa/W:0,shy=sa?(Math.random()-.5)*4*sa/H:0;
  G.begin({vp:m4(projM(FOC,W,H,CY,.1,220,shx,shy),viewM(cr,cu,cf,[cam.x,cam.y,cam.z])),cam:[cam.x,cam.y,cam.z],fog:[wc[0]/255,wc[1]/255,wc[2]/255],t:td,w:bW,h:bH,foc:FOC*bW/W,cx:bW/2,cy:CY*bH/H,cf,cr,cu});
  G.terrain();if(deco)G.decor(deco);
  const tx=W/(2*FOC)*1.15+.25;
  for(const r of vis){const Lm=len(r.m),c0=cs(r.x,r.y,r.z);if(c0[2]<NEAR-Lm||c0[2]>70||Math.abs(c0[0])>c0[2]*tx+Lm*2)continue;G.fish(r,Lm,r.k===1?1:0)}
  if(S){const ids=new Set();for(const a of S.ml||[]){ids.add(a[0]);let r=mrend.get(a[0]);if(!r){r={x:a[1],y:a[2],z:a[3]};mrend.set(a[0],r);if(Math.hypot(a[1]-cam.x,a[3]-cam.z)<45)burst(a[1],a[2],a[3],BLOOD,3,1.4)}
    const kk=1-Math.exp(-dt*10);r.x+=(a[1]-r.x)*kk;r.y+=(a[2]-r.y)*kk;r.z+=(a[3]-r.z)*kk;r.m=a[4];if(a[5]<4&&Math.floor(td*6)%2===0)continue;
    const k=cs(r.x,r.y,r.z);if(k[2]<NEAR||k[2]>46||Math.abs(k[0])>k[2]*tx)continue;G.meat(r.x,r.y+Math.sin(td*2+a[4]*9)*.04,r.z,Math.max(.1,crad(r.m)*.9),td*.6+a[4]*7)}
   for(const id of mrend.keys())if(!ids.has(id))mrend.delete(id)}
  G.trans();if(!(cam.pitch-.1<-.45&&cam.y<WH-12))G.water();G.rays();
  if(deco)for(const j of deco.jf){const px=j.x+Math.sin(td*.15+j.p)*6,py=j.y+Math.sin(td*.4+j.p)*2,pz=j.z+Math.cos(td*.13+j.p)*6;if((px-cam.x)**2+(pz-cam.z)**2>2800)continue;G.jelly(px,py,pz,j.r*(1+.12*Math.sin(td*2+j.p)),j.c,j.p+td*.3)}
  nspr=0;
  for(let i=0;i<PK.length;i++){if(pkSet.has(i))continue;const p=PK[i],k=cs(p[0],p[1],p[2]);if(k[2]<NEAR||k[2]>38)continue;spr(p[0],p[1]+Math.sin(now/700+i)*.3,p[2],[.75,1,.9],clamp(1.2-k[2]/38,.3,1),.42)}
  if(deco){if(!lowq)for(const o of deco.sn){const wr=v=>((v%50)+50)%50-25;spr(cam.x+wr(o[0]+td*.5*o[3]),cam.y+wr(o[1]-td*.4*o[3]),cam.z+wr(o[2]+td*.3),[.9,1,1],.25,.1)}
   for(const v of deco.vt){if((v.x-cam.x)**2+(v.z-cam.z)**2>2600)continue;const y0=gh(v.x,v.z);for(let i=0;i<9;i++){const ph=((td*1.1+i*.37+v.p)%3)/3;spr(v.x+Math.sin(td*2+i)*.25*ph,y0+.6+ph*16,v.z+Math.cos(td*1.7+i)*.2*ph,[.9,.98,1],.8,.12+.22*ph)}}}
  for(let i=parts.length-1;i>=0;i--){const p=parts[i];p.l-=dt;if(p.l<=0){parts.splice(i,1);continue}p.vy+=.5*dt;p.vx*=.97;p.vz*=.97;p.x+=p.vx*dt;p.y+=p.vy*dt;p.z+=p.vz*dt;spr(p.x,p.y,p.z,n255(hexrgb(p.c)),Math.min(1,p.l*2),p.s*2.4)}
  G.sprites(SPR,nspr)}
 function rays(now){x.save();for(let i=0;i<8;i++){const bx=(((i*137-cam.yaw*260+now*.012*(i%3+1))%(W+500))+W+500)%(W+500)-250,wd=30+(i%4)*26;x.fillStyle=`rgba(210,245,255,${.035+.015*(i%3)})`;x.beginPath();x.moveTo(bx,-10);x.lineTo(bx+wd,-10);x.lineTo(bx+wd*2.4+80,H);x.lineTo(bx-wd*.4+80,H);x.fill()}x.restore()}
 function vignette(){const g=x.createRadialGradient(W/2,H/2,H*.38,W/2,H/2,H*.95);g.addColorStop(0,"rgba(0,12,28,0)");g.addColorStop(1,"rgba(0,12,28,.38)");x.fillStyle=g;x.fillRect(0,0,W,H)}
 function frame(now){
  if(!active)return;raf=requestAnimationFrame(frame);
  const dt=Math.min(.05,Math.max(.001,(now-lastT)/1000||.016));lastT=now;ema+=(dt-ema)*.05;const lq=lowq;lowq=ema>.032?1:ema<.02?0:lowq;if(lq!==lowq)dirty=1;   // qualité adaptative
  if(dirty)layout();
  if([...btn.values()].includes("b"))bite();   // tactile : rester appuyé à droite = mordre en boucle
  stepLocal(dt);send();updCam(dt);shk=Math.max(0,shk-dt*2);
  const d=clamp(cam.y/WH,0,1),dp=Math.pow(d,.8);wc[0]=5+23*dp;wc[1]=32+88*dp;wc[2]=64+104*dp;
  x.setTransform(1,0,0,1,0,0);x.clearRect(0,0,cv.width,cv.height);x.setTransform(bW/W,0,0,bH/H,0,0);
  const vis=[];updRend(dt,now,vis);
  if(G&&!G.lost)draw3D(now,dt,vis);else{x.fillStyle=rgbs(wc);x.fillRect(0,0,W,H)}
  vignette();tags(vis);hud(now,vis);
  const mine=S&&S.p.find(q=>q[0]===me),dead=S&&mine&&!mine[7];
  ov.textContent=S?(dead?"💀 Mangé par "+(mine[15]||"un poisson"):""):(G?"Connexion au serveur…":"⚠️ WebGL indisponible sur cet appareil");
  const fs=Math.round((dead?30:44)*uS)+"px";if(ov.style.fontSize!==fs)ov.style.fontSize=fs}
 const T=(t,px,py,font,c,al)=>{x.font=font;x.fillStyle=c;x.textAlign=al||"left";x.fillText(t,px,py);x.textAlign="left"};
 const fit=(t,mw,font)=>{x.font=font;t=String(t);if(x.measureText(t).width<=mw)return t;while(t.length>1&&x.measureText(t+"…").width>mw)t=t.slice(0,-1);return t+"…"};
 const card=(px,py,w,h,r,bg,bd)=>{x.beginPath();x.roundRect(px,py,w,h,r);x.fillStyle=bg||"#06192ee6";x.fill();x.strokeStyle=bd||"#ffffff30";x.lineWidth=1.5;x.stroke()};
 const bar=(px,py,w,h,p,col)=>{x.fillStyle="#ffffff22";x.beginPath();x.roundRect(px,py,w,h,h/2);x.fill();if(p>0){x.fillStyle=col;x.beginPath();x.roundRect(px,py,Math.max(h,w*clamp(p,0,1)),h,h/2);x.fill()}};
 const fishIcon=(cx,cy,s,col)=>{x.save();x.translate(cx,cy);x.fillStyle=rgbs(col);x.beginPath();x.ellipse(0,0,s,s*.52,0,0,7);x.fill();x.beginPath();x.moveTo(-s*.8,0);x.lineTo(-s*1.5,-s*.62);x.lineTo(-s*1.38,0);x.lineTo(-s*1.5,s*.62);x.closePath();x.fill();x.fillStyle="#fff";x.beginPath();x.arc(s*.45,-s*.12,s*.17,0,7);x.fill();x.fillStyle="#0a1226";x.beginPath();x.arc(s*.5,-s*.12,s*.08,0,7);x.fill();x.restore()};
 const arc=(cx,cy,r,p,col,w)=>{x.beginPath();x.arc(cx,cy,r,-Math.PI/2,-Math.PI/2+6.2832*clamp(p,0,1));x.strokeStyle=col;x.lineWidth=w;x.stroke()};
 function tags(vis){
  for(const r of vis){if(r.me)continue;const Lm=len(r.m),c=cs(r.x,r.y+Lm*.4+.35,r.z);if(c[2]<NEAR||c[2]>45)continue;const sx=W/2+FOC*c[0]/c[2],sy=CY-FOC*c[1]/c[2],can=L.a&&edible(L.m,r.m),dng=L.a&&edible(r.m,L.m);
   if(r.pl||r.k===1){const fs=Math.round(clamp(340/c[2],11,17)*uS),tx=String(r.k===1?"REQUIN":r.n||"").toUpperCase();   // nom blanc gras à contour noir, comme dans le jeu
    x.font=`900 ${fs}px system-ui`;x.textAlign="center";x.lineJoin="round";x.lineWidth=Math.max(3,fs*.28);x.strokeStyle="#000";x.strokeText(tx,sx,sy);x.fillStyle="#fff";x.fillText(tx,sx,sy);x.textAlign="left";
    if(can||dng){x.fillStyle=can?"#7dffa1":"#ff6b6b";x.beginPath();x.moveTo(sx-5,sy+5);x.lineTo(sx+5,sy+5);x.lineTo(sx,sy+12);x.fill()}}
   else if((can||dng)&&c[2]<32){x.fillStyle=can?"#7dffa1":"#ff6b6b";x.beginPath();x.arc(sx,sy,3,0,7);x.fill()}}}
 /* ---- interface calquée sur Feed and Grow: Fish : barre rouge à gauche, barre verte (énergie) à droite, jauge d'aptitude jaune en demi-cercle au centre avec l'œil,
        emplacements éclair, fine barre bleue d'expérience, noms blancs à contour noir, chiffres orange qui s'envolent, arc de dents jaunes pour la morsure ---- */
 const bolt=(cx,cy,s,col)=>{x.beginPath();[[.25,-1],[-.55,.1],[-.05,.1],[-.3,1],[.6,-.2],[.05,-.2]].forEach((p,i)=>x[i?"lineTo":"moveTo"](cx+p[0]*s,cy+p[1]*s));x.closePath();x.fillStyle=col;x.fill()};
 function hud(now,vis){
  const mine=S&&S.p.find(q=>q[0]===me),u=uS,sa=SAf,cp=W<560,top=sa.t+8,lft=sa.l+12,F=(w,s)=>w+" "+Math.round(s*u)+"px system-ui";
  const ot=(t,px,py,font,fill,al,lw)=>{x.font=font;x.textAlign=al||"left";x.lineJoin="round";x.lineWidth=lw||4*u;x.strokeStyle="#000d";x.strokeText(t,px,py);x.fillStyle=fill;x.fillText(t,px,py);x.textAlign="left"};
  let dg=null,rng=false;
  if(L.a)for(const r of vis){if(r.me)continue;const d=Math.hypot(r.x-L.x,r.y-L.y,r.z-L.z);
   if(edible(r.m,L.m)&&d<16+len(r.m)&&(!dg||d<dg))dg=d;
   if(edible(L.m,r.m)&&d<len(L.m)*.5+len(r.m)*.5+2.4&&Math.abs(angd(Math.atan2(r.x-L.x,r.z-L.z)-L.yaw))<.9)rng=true}
  if(L.hurt>0){x.fillStyle=`rgba(255,20,40,${L.hurt*.5})`;x.fillRect(0,0,W,H)}
  if(dg!==null){const a=.1+.1*Math.sin(now/90)+(1-dg/20)*.12;x.fillStyle=`rgba(255,40,70,${a})`;x.fillRect(0,0,W,12);x.fillRect(0,H-12,W,12);x.fillRect(0,0,12,H);x.fillRect(W-12,0,12,H)}
  const m=mine?mine[6]:1.6,si=stg(m),nx=STG[si+1],prog=nx?clamp((m-STG[si][0])/(nx[0]-STG[si][0]),0,1):1;
  if(si!==lastSt){if(lastSt>=0&&si>lastSt){lvT=now;lvTxt="NIVEAU "+(si+1)+" · "+STG[si][1];try{navigator.vibrate&&navigator.vibrate([20,40,20])}catch{}}lastSt=si}
  if(mine){if(pmh&&mine[6]>pmh+.25&&L.a)pops.push({t:now,v:"+"+Math.round((mine[6]-pmh)*10)+" xp.",dx:(Math.random()-.5)*70,xp:1});pmh=mine[6]}
  if(S&&S.dg)for(const d of S.dg){if(seenDg.has(d[0]))continue;seenDg.add(d[0]);if(d[1]!==me)continue;const tr=rend.get(d[2]);
   pops.push({t:now,v:d[3],dmg:1,wx:tr?tr.x:L.x,wy:tr?tr.y+len(tr.m)*.4+.3:L.y,wz:tr?tr.z:L.z,dx:(Math.random()-.5)*30})}
  if(seenDg.size>300)seenDg.clear();
  /* arc de dents (morsure) : brille quand une proie est à portée, se recharge après chaque morsure */
  if(L.a){const aw=Math.min(W*.42,300*u),ay=Math.max(H*.16,top+(cp?96:70)*u),rd=clamp(1-L.bcd/BITE_CD,0,1),sz=[13,8,6.5,5.5,5,5.5,6.5,8,13];
   for(let i=0;i<9;i++){const t=i/8,px=W/2+(t-.5)*aw,py=ay+Math.pow(Math.abs(2*t-1),2)*28*u,s=sz[i]*u;x.globalAlpha=i<rd*9?(rng?1:.6):.18;x.fillStyle="#d8d43c";x.beginPath();x.ellipse(px,py,s*.78,s*1.15,(t-.5)*1.3,0,7);x.fill()}x.globalAlpha=1}
  /* haut : espèce, niveau, compteur de croissance, serveur */
  ot(STG[si][1].toUpperCase(),lft,top+18*u,F(900,18),"#fff");
  if(cp){ot("NIV "+(si+1)+" · "+fmtm(m)+"/"+(nx?nx[0]:"MAX"),lft,top+36*u,F(900,12),"#7dffa1");
   if(S){const rank=S.p.slice().sort((a,b)=>b[6]-a[6]).findIndex(q=>q[0]===me)+1;ot(getCode()+" · "+S.p.length+" 🐟"+(rank?" · #"+rank:""),lft,top+53*u,F(800,11),"#cfe9f5",0,3*u)}}
  else{ot("NIVEAU "+(si+1),lft,top+36*u,F(800,12),"#9be37a");ot("CROISSANCE "+fmtm(m)+"/"+(nx?nx[0]:"MAX"),W/2,top+16*u,F(900,15),"#7dffa1","center");
   if(S)ot("🌊 "+getCode()+" · "+S.p.length+" 🐟 · 🍽 "+(mine?mine[12]:0),W/2,top+36*u,F(800,12),"#e8f6ff","center",3*u)}
  /* classement + journal des morsures */
  if(S&&!cp){const rows=H<420?3:5,lb=S.p.slice().sort((a,b)=>b[6]-a[6]).slice(0,rows),lw=Math.round(186*u),bx=W-sa.r-10-lw,by0=isGm?sa.t+58:top,rh=Math.round(20*u);card(bx,by0,lw,30*u+lb.length*rh,13*u,"#0b2416cc","#8fd47a44");T("CLASSEMENT",bx+14*u,by0+19*u,F(700,11),"#9be37a");
   lb.forEach((q,i)=>{const yb=by0+39*u+i*rh,mm=q[0]===me;T((i+1)+". "+fit(q[9],lw-80*u,F(700,12)),bx+14*u,yb,F(mm?800:600,12),mm?"#7dffa1":q[7]?"#fff":"#ffffff77");T(fmtm(q[6]),bx+lw-14*u,yb,F(700,12),"#ffd23f","right")});
   let ly=by0+30*u+lb.length*rh+8*u;(S.ev||[]).slice(-3).forEach(e=>{if(e[2]>5)return;x.globalAlpha=clamp((5-e[2])*1.5,0,1);card(bx,ly,lw,22*u,8*u,"#2a0c1ddd","#ff6b6b55");T("🍴 "+fit(e[0]+" › "+e[1],lw-20*u,F(600,11)),bx+10*u,ly+15*u,F(600,11),"#ffd1d9");x.globalAlpha=1;ly+=26*u})}
  const mid=cp?top+86*u:top+50*u;
  if(dg!==null)ot("⚠️ DANGER : plus gros que toi !",W/2,mid+(cp?60*u:0),F(900,15),"#ffb3bd","center");
  else if(L.a&&S&&(Math.abs(L.x)>R-4||Math.abs(L.z)>R-4))ot("Bord de la zone",W/2,mid+(cp?60*u:0),F(800,13),"#ffe28a","center");
  if(now-lvT<2800){const a=clamp((2800-(now-lvT))/700,0,1),sc=1+Math.max(0,.3-(now-lvT)/600);x.globalAlpha=a;x.save();x.translate(W/2,H*.34);x.scale(sc,sc);ot(lvTxt,0,0,F(900,28),"#ffd23f","center",6*u);ot("Tu as grandi !",0,26*u,F(800,14),"#fff","center");x.restore();x.globalAlpha=1}
  /* chiffres qui s'envolent quand on mange (comme le « 27 » orange du jeu) */
  for(let i=pops.length-1;i>=0;i--){const p=pops[i],a=(now-p.t)/1100;if(a>=1){pops.splice(i,1);continue}
   if(p.dmg){const c=cs(p.wx,p.wy,p.wz);if(c[2]<NEAR)continue;const sx=W/2+FOC*c[0]/c[2]+p.dx*u,sy=CY-FOC*c[1]/c[2]-a*60*u,sc=clamp(16/c[2]+.7,.8,1.7)*(1+Math.max(0,.35-a*3));   // chiffre jaune = dégâts de ta morsure
    x.globalAlpha=1-a*a;x.save();x.translate(sx,sy);x.scale(sc,sc);ot(String(p.v),0,0,F(900,26),"#ffdd2e","center",6*u);x.restore();x.globalAlpha=1;continue}
   x.globalAlpha=1-a*a;x.save();x.translate(W/2+p.dx*u,H*.52-a*70*u);const sc=1+Math.max(0,.4-a*3);x.scale(sc,sc);ot(String(p.v),0,0,F(900,22),"#fff","center",6*u);x.restore();x.globalAlpha=1}
  if(S&&now-enterT<10000){x.globalAlpha=clamp((10000-(now-enterT))/1500,0,1);const hw=Math.min(W-20,Math.round(520*u));card(W/2-hw/2,H*.42,hw,touch?44*u:52*u,12*u,"#0b2416e0","#8fd47a55");
   if(touch)T("🕹 Joystick à gauche = nager · touche à droite = MORDRE · ⚡ = sprint",W/2,H*.42+26*u,F(700,12.5),"#eaf8ff","center");
   else{T("Mange le plancton ✨ et les plus petits · les gros te blessent (barre rouge)",W/2,H*.42+22*u,F(600,13),"#eaf8ff","center");T("Mords : Espace / clic · Sprint : Maj · Frein : C · Souris : M · ←→ ↑↓",W/2,H*.42+42*u,F(600,12),"#eaf8ff","center")}x.globalAlpha=1}
  /* bas : barres + jauge en demi-cercle */
  const Rd=Math.round((cp?46:60)*u),cx=W/2,by=H-sa.b-8*u,cy0=by-2*u,sq=Math.round(11*u),gp=Math.round(3*u),barY=by-18*u,xr=W-sa.r-12;
  const segs=(xa,xb,p,on,off)=>{const n=clamp(Math.floor((xb-xa)/(sq+gp)),3,24);for(let i=0;i<n;i++){const lit=i<Math.round(p*n)||(p>0&&i===0);x.fillStyle="#120606";x.beginPath();x.roundRect(xa+i*(sq+gp)-1,barY-1,sq+2,sq+2,3*u);x.fill();x.fillStyle=lit?on:off;x.beginPath();x.roundRect(xa+i*(sq+gp),barY,sq,sq,2.5*u);x.fill();if(lit){x.fillStyle="#ffffff40";x.fillRect(xa+i*(sq+gp)+1,barY+1,sq-2,3*u)}}};
  const hpv=mine&&mine[16]!=null?mine[16]:100,hpf=clamp(hpv/100,0,1),low=hpf<.3&&L.a&&Math.floor(now/180)%2===0;segs(lft,cx-Rd*1.14-4*u,hpf,low?"#ff6a6a":"#e01818","#3a0c0c");segs(cx+Rd*1.14+4*u,xr,L.st/100,L.tired?"#ff8a2a":"#7ccf1b","#1b3510");
  ot(String(Math.round(hpv)),cx-Rd*1.14-4*u-2*u,barY-4*u,F(900,10),"#ff3b3b","right",3*u);
  x.fillStyle="#0b1c2e";x.beginPath();x.roundRect(lft,by-4*u,xr-lft,3.5*u,2*u);x.fill();x.fillStyle="#3fa0ee";x.beginPath();x.roundRect(lft,by-4*u,Math.max(3.5*u,(xr-lft)*prog),3.5*u,2*u);x.fill();   // expérience : progression vers le stade suivant
  const r1=Rd*.8,r2=Rd*1.08,rd=clamp(1-L.bcd/BITE_CD,0,1);
  x.beginPath();x.arc(cx,cy0,r2+3*u,Math.PI,0);x.closePath();x.fillStyle="#0a1a0cdd";x.fill();
  for(let k=0;k<7;k++){const a0=Math.PI+k*Math.PI/7+.03,a1=Math.PI+(k+1)*Math.PI/7-.03;x.beginPath();x.arc(cx,cy0,r2,a0,a1);x.arc(cx,cy0,r1,a1,a0,true);x.closePath();x.fillStyle=k<Math.ceil(rd*7-.001)?"#f4b52a":"#4b4a20";x.fill();x.strokeStyle="#17120a";x.lineWidth=2*u;x.stroke()}
  x.beginPath();x.arc(cx,cy0,r1,Math.PI,0);x.closePath();x.fillStyle="#17301c";x.fill();x.strokeStyle="#5d9c55";x.lineWidth=3*u;x.stroke();
  x.beginPath();x.arc(cx,cy0,r1*.66,Math.PI,0);x.strokeStyle="#4a8445";x.lineWidth=2.5*u;x.stroke();
  const ex=cx-Rd*.26,ey=cy0-Rd*.36;x.fillStyle="#fff";x.strokeStyle="#000";x.lineWidth=2*u;x.beginPath();x.ellipse(ex,ey,Rd*.17,Rd*.2,0,0,7);x.fill();x.stroke();x.fillStyle="#000";x.beginPath();x.ellipse(ex+Math.sin(now/900)*Rd*.03,ey+Rd*.02,Rd*.07,Rd*.1,0,0,7);x.fill();
  const sl=(px,py,s,bd)=>{x.fillStyle="#141a14dd";x.strokeStyle=bd;x.lineWidth=2.5*u;x.beginPath();x.roundRect(px-s/2,py-s/2,s,s,4*u);x.fill();x.stroke()};
  sl(cx+Rd*.3,cy0-Rd*.4,Rd*.42,"#3e5a3e");bolt(cx+Rd*.3,cy0-Rd*.4,Rd*.14,L.boost?"#ffd23f":"#c8cdc8");   // sprint
  const ox=cx+Rd*1.28,oy=cy0-Rd*.78,os=Rd*.5;sl(ox,oy,os,"#2f86c6");   // morsure
  x.fillStyle=L.bcd>0?"#8a8f94":"#fff";x.beginPath();x.moveTo(ox-os*.22,oy-os*.2);x.lineTo(ox+os*.22,oy-os*.2);x.lineTo(ox,oy+os*.26);x.closePath();x.fill();
  if(!touch)T("ESP",ox-os/2+2*u,oy-os/2-3*u,F(800,9),"#fff");
  /* commandes tactiles */
  if(touch){const pb=[...btn.values()].includes("b"),ps=[...btn.values()].includes("s");
   if(!joy){const gx=sa.l+JR+26,gy=H-sa.b-78*u-JR-8*u;x.beginPath();x.arc(gx,gy,JR,0,7);x.strokeStyle="#ffffff40";x.lineWidth=3;x.stroke();x.beginPath();x.arc(gx,gy,JR*.38,0,7);x.fillStyle="#ffffff26";x.fill()}
   [[BB,"MORDS","🦷",pb],[BS,"SPRINT","⚡",ps]].forEach(([b,l,ic,on])=>{x.beginPath();x.arc(b.x,b.y,b.r,0,7);x.fillStyle=on?"#ffffff55":"#0b2416b0";x.fill();x.strokeStyle=on?"#fff":"#8fd47aaa";x.lineWidth=3;x.stroke();T(ic,b.x,b.y+2*u,F(700,b===BB?24:18),"#fff","center");T(l,b.x,b.y+b.r*.62,F(800,b===BB?11:9.5),"#fff","center")});
   if(L.bcd>0)arc(BB.x,BB.y,BB.r+5,L.bcd/BITE_CD,"#f4b52a",4);arc(BS.x,BS.y,BS.r+5,L.st/100,L.tired?"#ff8a5c":"#7ccf1b",4);
   if(joy){x.beginPath();x.arc(joy.ox,joy.oy,JR,0,7);x.strokeStyle="#ffffff66";x.lineWidth=3;x.stroke();const dx=joy.px-joy.ox,dy=joy.py-joy.oy,l=Math.hypot(dx,dy),mm=l>JR?JR/l:1;x.beginPath();x.arc(joy.ox+dx*mm,joy.oy+dy*mm,JR*.42,0,7);x.fillStyle="#ffffffb0";x.fill()}}}

 /* ================= HÔTE : le plus ancien joueur du serveur simule le monde ================= */
 const lobbyP=()=>(getLobby()||{}).players||{};
 const hostUid=()=>{const pl=lobbyP();let b=null;for(const u in pl){const j=pl[u].j||1e15;if(!b||j<b[1]||(j===b[1]&&u<b[0]))b=[u,j]}return b&&b[0]};
 const rpos=()=>{const x1=rf(-R+8,R-8),z1=rf(-R+8,R-8);return[x1,rf(gh(x1,z1)+2,WH-6),z1]};
 const mkE=o=>{const p=rpos(),e={id:"",hu:0,bot:0,k:0,name:"",col:"#4ad",x:p[0],y:p[1],z:p[2],yaw:rf(-3,3),pitch:0,m:1,a:1,spd:0,kl:0,rc:0,bt:0,bc:0,cd:0,rs:0,inv:0,tier:0,wx:p[0],wy:p[1],wz:p[2],wt:0,dby:"",hp:100,mh:100,ht:-9,hs:null,sg:-1,...o};if(!e.hu&&!e.k){e.hp=e.mh=100;e.pr=1}E.push(e);byId.set(e.id,e);return e};
 const onPose=s=>Object.entries(s.val()||{}).forEach(([u,v])=>{
  const e=byId.get(u);if(!e||!e.hu||!e.a)return;const a=String(v).split(",").map(Number);if(a.length<8||a.length>9||a.some(n=>!Number.isFinite(n))||a[7]!==e.rc)return;
  e.x=clamp(a[0],-R,R);e.z=clamp(a[2],-R,R);e.y=clamp(a[1],0,WH);e.yaw=a[3];e.pitch=clamp(a[4],-1.4,1.4);e.spd=spdOf(e.m)*(a[5]?1.7:1)*(a.length>8?clamp(a[8],.3,1):1);
  if(a[6]>e.bc){if(e.cd<=0){e.bt=.4;e.cd=BITE_CD*.9}e.bc=a[6]}});
 function becomeHost(){
  hostOn=true;E=[];byId=new Map();ev=[];ML=[];DG=[];cid=0;acc=0;hostT=performance.now();pubN=0;nid=0;pkAt.fill(0);
  const ls=S&&S.f?S:null;t=ls?+ls.t||0:0;
  if(!ls&&sdSeen<0){sdSeen=Math.floor(Math.random()*1e9);PK=plankton(sdSeen);deco=mkDeco(sdSeen)}
  hLast=new Map(ls?ls.p.map(a=>[a[0],a]):[]);
  const cnt=new Array(TIER.length).fill(0);let sh=0;
  if(ls){ls.f.forEach(a=>{const k=a[7]|0,tr=a[10]|0;mkE({id:a[0],k,tier:tr,name:k?"🦈 Requin":"",x:a[1],y:a[2],z:a[3],yaw:a[4],pitch:a[5],m:a[6]});if(k)sh++;else cnt[tr]++;nid=Math.max(nid,parseInt(a[0].slice(1))||0)});
   (ls.pk||[]).forEach(i=>{pkAt[i]=t+8});(ls.ml||[]).forEach(a=>{ML.push({id:a[0],x:a[1],y:a[2],z:a[3],m:a[4],ttl:a[5],vx:0,vy:0,vz:0});cid=Math.max(cid,parseInt(a[0].slice(1))||0)})}
  TIER.forEach((m,i)=>{for(let n=cnt[i];n<TCNT[i];n++)mkE({id:"n"+(++nid),k:0,tier:i,m:m*rf(.9,1.15)})});
  for(let i=sh;i<NSH;i++)mkE({id:"n"+(++nid),k:1,name:"🦈 Requin",m:rf(140,210)});
  poseUn=onValue(ref(`games/${code}/p`),onPose)}
 function loseHost(){hostOn=false;ML=[];if(poseUn){poseUn();poseUn=null}E=[];byId=new Map()}
 const near=(e,f,mx)=>{let b=null,bd=mx*mx;for(const o of E){if(o===e||!o.a||!f(o))continue;const d=(o.x-e.x)**2+(o.y-e.y)**2+(o.z-e.z)**2;if(d<bd){bd=d;b=o}}return b?[b,Math.sqrt(bd)]:null};
 const wander=e=>{if(t>=e.wt||Math.hypot(e.wx-e.x,e.wz-e.z)<3){e.wx=rf(-R+6,R-6);e.wz=rf(-R+6,R-6);e.wy=rf(gh(e.wx,e.wz)+2,WH-5);e.wt=t+rf(5,10)}return[e.wx,e.wy,e.wz]};
 const move=(e,tx,ty,tz,sf,boost,dt)=>{
  const Lm=len(e.m),dx=tx-e.x,dy=ty-e.y,dz=tz-e.z,hd=Math.hypot(dx,dz),tr=(e.k===1?1.7:2.4)/(1+Lm*.08);
  e.yaw+=clamp(angd(Math.atan2(dx,dz)-e.yaw),-tr*dt,tr*dt);e.pitch+=clamp(clamp(Math.atan2(dy,Math.max(.01,hd)),-1,1)-e.pitch,-tr*.7*dt,tr*.7*dt);
  const sp=spdOf(e.m)*sf*(boost?1.7:1)*(e.bt>0?1.8:1)*(e.k===1?.92:1),cp=Math.cos(e.pitch);e.spd=sp;
  e.x=clamp(e.x+Math.sin(e.yaw)*cp*sp*dt,-R+1,R-1);e.z=clamp(e.z+Math.cos(e.yaw)*cp*sp*dt,-R+1,R-1);e.y=clamp(e.y+Math.sin(e.pitch)*sp*dt,gh(e.x,e.z)+Lm*.3+.3,WH-1)};
 const tryBite=(e,tg,d)=>{if(e.cd<=0&&d<len(e.m)*.5+len(tg.m)*.5+1.4&&Math.abs(angd(Math.atan2(tg.x-e.x,tg.z-e.z)-e.yaw))<.7){e.bt=.35;e.cd=BITE_CD+rf(0,.5)}};
 const ai=(e,dt)=>{
  if(e.hu)return;const Lm=len(e.m);
  if(e.k===0){   // poisson proie
   const th=near(e,o=>o.m>=e.m*EDI,9+Lm*2);
   if(th){const o=th[0],dx=e.x-o.x,dy=e.y-o.y,dz=e.z-o.z,l=Math.hypot(dx,dy,dz)||1;move(e,e.x+dx/l*12,e.y+dy/l*8,e.z+dz/l*12,.7,th[1]<5,dt)}
   else{const w=wander(e);move(e,w[0],w[1],w[2],.5,0,dt)}return}
  const pr=near(e,o=>o.hu&&o.inv<=0&&edible(e.m,o.m),30);   // requin : chasse les joueurs qu'il peut manger
  if(pr){move(e,pr[0].x,pr[0].y,pr[0].z,.8,pr[1]<12,dt);tryBite(e,pr[0],pr[1])}else{const w=wander(e);move(e,w[0],w[1],w[2],.5,0,dt)}};
 const spawnMeat=(o,total)=>{   // le poisson tué est déchiqueté en plusieurs bouts de viande de tailles variées
  const n=clamp(Math.round(2+Math.cbrt(o.m)*1.1),2,10),w=[];let sw=0;for(let i=0;i<n;i++){const v=.3+Math.random();w.push(v);sw+=v}
  for(let i=0;i<n;i++){const a=Math.random()*6.283,b=rf(-.5,.9),sp=rf(1.5,4)*(1+len(o.m)*.12);
   ML.push({id:"c"+(++cid),x:o.x+Math.cos(a)*.3,y:o.y,z:o.z+Math.sin(a)*.3,vx:Math.cos(a)*Math.cos(b)*sp,vy:Math.sin(b)*sp,vz:Math.sin(a)*Math.cos(b)*sp,m:total*w[i]/sw,ttl:MEATTTL})}
  if(ML.length>MEATMAX)ML.splice(0,ML.length-MEATMAX)};
 const eat=(e,o)=>{
  if(e.hu)e.hp=Math.min(e.mh,e.hp+15);const total=o.m*GAIN+.3;e.m=Math.min(e.k===1?SHMAX:2000,e.m+total*.4);e.kl++;o.a=0;   // 40 % avalés tout de suite, 60 % en bouts à manger (même par les autres !)
  spawnMeat(o,total*.6);
  if(o.hu){o.rs=t+3;o.dby=e.name||"un poisson"}else o.rs=t+4;
  if(o.hu||o.k===1)ev.push([e.name||"Un poisson",o.name||"un poisson",t])};
 function hostStep(){
  const dt=DT;t+=dt;
  const lp=lobbyP();   // joueurs présents sur le serveur
  for(const u in lp)if(!byId.has(u)){
   const o=hLast.get(u),e=mkE({id:u,hu:1,name:lp[u].name,col:lp[u].color,m:1.6,inv:2.5});
   if(o){e.m=o[6];e.kl=o[12];e.rc=o[13];e.x=o[1];e.y=o[2];e.z=o[3];e.yaw=o[4];e.pitch=o[5];if(!o[7]){e.a=0;e.rs=t;e.dby=o[15]}}}
  hLast=new Map();
  if(E.some(e=>e.hu&&!lp[e.id])){E=E.filter(e=>!(e.hu&&!lp[e.id]));byId=new Map(E.map(e=>[e.id,e]))}
  for(const e of E){e.cd-=dt;e.bt-=dt;e.inv-=dt;if(e.a)ai(e,dt)}
  for(const e of E){if(e.a&&e.hp<e.mh&&t-e.ht>4)e.hp=Math.min(e.mh,e.hp+(e.hu?6:10)*dt);   // la vie remonte toute seule hors combat
   if(e.hu&&e.a){const sg=stg(e.m);if(e.sg>=0&&sg>e.sg)e.hp=e.mh;e.sg=sg}}   // monter de stade rend toute la vie
  for(const e of E){if(!e.a||e.bt<=0){e.hs=null;continue}const Lm=len(e.m),cp=Math.cos(e.pitch),mx=e.x+Math.sin(e.yaw)*cp*Lm*.5,my=e.y+Math.sin(e.pitch)*Lm*.5,mz=e.z+Math.cos(e.yaw)*cp*Lm*.5;
   for(const o of E){if(o===e||!o.a||o.inv>0||(e.hs&&e.hs.has(o.id)))continue;
    if(Math.hypot(o.x-mx,o.y-my,o.z-mz)<len(o.m)*.5+1){(e.hs||(e.hs=new Set())).add(o.id);   // une morsure blesse une seule fois : plus gros = plus de dégâts
     const ed=edible(e.m,o.m);if(o.pr&&ed){eat(e,o);continue}const dm=clamp(26*e.m/o.m,ed?30:4,60);o.hp-=dm;DG.push([Date.now().toString(36)+(++dgn),e.id,o.id,Math.round(dm),t]);o.ht=t;o.inv=Math.max(o.inv,.25);if(o.hp<=0)eat(e,o)}}}
  for(let i=0;i<NPK;i++)if(pkAt[i]&&t>=pkAt[i])pkAt[i]=0;
  for(const e of E){if(!e.a||!e.hu||e.m>=80)continue;const rad=len(e.m)*.45+.5,Lm=len(e.m),cp=Math.cos(e.pitch),mx=e.x+Math.sin(e.yaw)*cp*Lm*.4,my=e.y+Math.sin(e.pitch)*Lm*.4,mz=e.z+Math.cos(e.yaw)*cp*Lm*.4;
   for(let i=0;i<NPK;i++){if(pkAt[i])continue;const p=PK[i];if((p[0]-mx)**2+(p[1]-my)**2+(p[2]-mz)**2<rad*rad){pkAt[i]=t+25;e.m+=e.m<30?.35:.15}}}
  for(let i=ML.length-1;i>=0;i--){const c=ML[i];c.ttl-=dt;if(c.ttl<=0){ML.splice(i,1);continue}   // physique des morceaux : ils s'éparpillent puis coulent doucement
   const dr=Math.exp(-dt*1.8);c.vx*=dr;c.vy*=dr;c.vz*=dr;c.x=clamp(c.x+c.vx*dt,-R+1,R-1);c.z=clamp(c.z+c.vz*dt,-R+1,R-1);c.y=Math.min(WH-1,c.y+(c.vy-.5)*dt);const fl=gh(c.x,c.z)+crad(c.m);if(c.y<fl){c.y=fl;c.vy=0}}
  for(const e of E){if(!e.a||!e.hu||!ML.length)continue;const Lm=len(e.m),cp=Math.cos(e.pitch),mx=e.x+Math.sin(e.yaw)*cp*Lm*.4,my=e.y+Math.sin(e.pitch)*Lm*.4,mz=e.z+Math.cos(e.yaw)*cp*Lm*.4;
   for(let i=ML.length-1;i>=0;i--){const c=ML[i],r=Lm*.45+.3+crad(c.m);if((c.x-mx)**2+(c.y-my)**2+(c.z-mz)**2<r*r){e.m=Math.min(2000,e.m+c.m);ML.splice(i,1)}}}
  for(const e of E){if(e.a||t<e.rs)continue;const p=rpos();e.x=p[0];e.y=p[1];e.z=p[2];e.yaw=rf(-3,3);e.pitch=0;e.a=1;e.bt=0;e.hp=e.mh;e.sg=-1;e.hs=null;
   if(e.hu){e.m=Math.max(1.6,e.m*.35);e.inv=2.5;e.rc++}else e.m=e.k===1?rf(140,210):TIER[e.tier]*rf(.9,1.15)}
  if(DG.length>40)DG.splice(0,DG.length-40);if(++pubN%3===0)publish()}
 function publish(){
  Promise.resolve(set(ref(`games/${code}/state`),JSON.stringify({k:"fish",sd:sdSeen,t:+t.toFixed(1),h:me,
   p:E.filter(e=>e.hu).map(e=>[e.id,+e.x.toFixed(1),+e.y.toFixed(1),+e.z.toFixed(1),+e.yaw.toFixed(2),+e.pitch.toFixed(2),+e.m.toFixed(2),e.a?1:0,"p",e.name,e.col,+e.spd.toFixed(1),e.kl,e.rc,e.bt>0?1:0,e.a?"":e.dby,Math.max(0,Math.round(e.hp))]),
   f:E.filter(e=>!e.hu&&e.a).map(e=>[e.id,+e.x.toFixed(1),+e.y.toFixed(1),+e.z.toFixed(1),+e.yaw.toFixed(2),+e.pitch.toFixed(2),+e.m.toFixed(2),e.k,+e.spd.toFixed(1),e.bt>0?1:0,e.tier]),
   ml:ML.map(c=>[c.id,+c.x.toFixed(1),+c.y.toFixed(1),+c.z.toFixed(1),+c.m.toFixed(2),Math.ceil(c.ttl)]),
   dg:DG.filter(x=>t-x[4]<4).map(x=>[x[0],x[1],x[2],x[3]]),pk:pkAt.reduce((a,v,i)=>(v&&a.push(i),a),[]),ev:ev.filter(x=>t-x[2]<6).map(x=>[x[0],x[1],+(t-x[2]).toFixed(1)])}))).catch(()=>{})}
 function simLoop(){
  if(!active)return;const h=hostUid();
  if(h===me){if(!hostOn)becomeHost();const n=performance.now();acc+=Math.min(.25,(n-hostT)/1000);hostT=n;while(acc>=DT)(hostStep(),acc-=DT)}
  else if(hostOn)loseHost()}
 return {enter(c){
  active=true;code=c;me=getMe().uid;S=null;last="";lastSend=0;joy=null;parts.length=0;rend.clear();mrend.clear();keys.clear();btn.clear();boostKey=false;brk=false;sdSeen=-1;PK=[];deco=null;pkSet=new Set();prevM=0;shk=0;enterT=performance.now();hostOn=false;E=[];byId=new Map();hLast=new Map();
  Object.assign(L,{hurt:0,yv:0,pv:0,roll:0,sf:1,bm:1,aim:null,rc:-1,a:1,bc:0,bcd:0,bt:0,lun:0,st:100,boost:0,tired:0,m:1.6,spd:0});
  help.textContent="← → tourner · ↑ ↓ monter/descendre (ou ZQSD) · Espace / clic : mordre n'importe quel poisson (chiffre jaune = dégâts) · Maj : sprint · C : freiner · M : piloter à la souris · les poissons tués éclatent en bouts de viande : mange-les vite ! Fuis les plus gros !";
  un=onValue(ref(`games/${c}/state`),s=>{const v=s.val();if(!v)return;try{const q=JSON.parse(v);if(q.k!=="fish")return;
   if(q.sd!==sdSeen){sdSeen=q.sd;PK=plankton(q.sd);deco=mkDeco(q.sd)}
   if(S){const ids=new Set([...q.p.filter(t=>t[7]).map(t=>t[0]),...q.f.map(t=>t[0]),"me"]);rend.forEach((r,id)=>{if(!ids.has(id)){if(Math.hypot(r.x-cam.x,r.z-cam.z)<50)burst(r.x,r.y,r.z,BLOOD,10,2.2);rend.delete(id)}})}
   pkSet=new Set(q.pk);S=q;snapT=performance.now()}catch{}});
  addEventListener("keydown",kd);addEventListener("keyup",ku);addEventListener("blur",blur);
  cv.style.touchAction="none";cv.addEventListener("pointerdown",pd);cv.addEventListener("pointermove",pm);cv.addEventListener("pointerleave",pl);cv.addEventListener("pointerup",pu);cv.addEventListener("pointercancel",pu);cv.addEventListener("lostpointercapture",pu);
  sty=document.createElement("style");sty.textContent="body.gm[data-g=fish] #game{padding:0}body.gm[data-g=fish] #gw{width:100vw!important;height:100vh;height:100dvh}body.gm[data-g=fish] #cv{width:100%;height:100%}body.gm[data-g=fish] #gbar{position:absolute;top:calc(6px + env(safe-area-inset-top));right:calc(8px + env(safe-area-inset-right));margin:0;z-index:20}body[data-g=fish] #score{display:none!important}";document.head.appendChild(sty);
  glc=document.createElement("canvas");glc.setAttribute("aria-hidden","true");glc.style.cssText="position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;z-index:0;border-radius:"+getComputedStyle(cv).borderRadius;cv.parentElement.insertBefore(glc,cv);cv.style.position="relative";cv.style.zIndex="1";cv.style.background="transparent";
  G=createGL(glc);if(G){glc.addEventListener("webglcontextlost",ev=>{ev.preventDefault();G.lost=true});glc.addEventListener("webglcontextrestored",()=>{try{G.init();G.lost=false}catch{G=null}})}
  dirty=1;lastSt=-1;lvT=-9;pops.length=0;seenDg.clear();pmh=0;phpv=100;addEventListener("resize",rz);addEventListener("orientationchange",rz);cv.addEventListener("contextmenu",noCtx);if(window.ResizeObserver){ro=new ResizeObserver(rz);ro.observe(cv)}layout();
  lastT=performance.now();raf=requestAnimationFrame(frame);timer=setInterval(simLoop,50);
  env.played&&env.played("fish",true);
  return()=>{active=false;clearInterval(timer);if(poseUn){poseUn();poseUn=null}hostOn=false;un();cancelAnimationFrame(raf);remove(ref(`games/${c}/p/${me}`)).catch(()=>{});removeEventListener("keydown",kd);removeEventListener("keyup",ku);removeEventListener("blur",blur);
   cv.removeEventListener("pointerdown",pd);cv.removeEventListener("pointermove",pm);cv.removeEventListener("pointerleave",pl);cv.removeEventListener("pointerup",pu);cv.removeEventListener("pointercancel",pu);cv.removeEventListener("lostpointercapture",pu);cv.style.touchAction="";removeEventListener("resize",rz);removeEventListener("orientationchange",rz);cv.removeEventListener("contextmenu",noCtx);if(ro){ro.disconnect();ro=null}if(G){G.dispose();G=null}if(glc){glc.remove();glc=null}if(sty){sty.remove();sty=null}if(probe){probe.remove();probe=null}cv.style.position="";cv.style.zIndex="";cv.style.background="";cv.width=800;cv.height=560;
   joy=null;btn.clear();keys.clear();ov.textContent="";ov.style.fontSize="56px";help.textContent=""}
 }};
}
