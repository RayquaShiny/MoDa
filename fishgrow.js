/* MoDa — Feed & Grow: Fish 🐟 (3D) : SERVEUR OUVERT, comme Sta I
   Inspiré de Feed and Grow: Fish : tu es un tout petit poisson dans un récif. Mange du plancton et plus petit que toi pour grandir,
   fuis les plus gros, deviens un requin puis un Mégalodon.
   - Serveurs persistants FISH1, FISH2… (24 joueurs max chacun) : on clique sur la tuile et on arrive directement dedans (pas de lobby, pas de manche).
   - L'HÔTE du serveur = le joueur arrivé en premier. S'il part, le suivant (par ordre d'arrivée) reprend la simulation là où elle en était
     (poissons, requins, plancton, masses) à partir du dernier état publié : tout le monde calcule le même hôte à partir de lobbies/<code>/players/<uid>/j.
   - Règle d'or : on peut manger un poisson dont la masse est ≤ 1/1,3 de la sienne (morsure). Le plancton se mange en le touchant.
     Si tu te fais manger, tu réapparais 3 s plus tard avec 35 % de ta masse.
   - L'hôte simule les PNJ (proies, requins), les morsures, le plancton et les masses, et publie games/<code>/state. Chaque joueur calcule lui-même
     le déplacement de SON poisson (fluide) et l'écrit dans games/<code>/p/<uid> : « x,y,z,cap,tangage,boost,morsures,respawn ». Aucun nouveau chemin Firebase hors de games/ et lobbies/.
   - Rendu : moteur 3D en perspective sur le canvas 2D existant (poissons maillés, tri en profondeur, brouillard sous-marin, fond marin, coraux, algues).
   Commandes : ←/→ (Q/D) tourner · ↑/↓ (Z/S) monter / descendre · Espace ou clic : MORDRE · Maj : sprint. Tactile : joystick + boutons. */
const W=800,H=560,DT=1/30,R=70,WH=36,NPK=170;
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

export function createFishClient(env){
 const {R:ref,set,remove,onValue,getMe,getCode,getLobby,$}=env,cv=$("cv"),x=cv.getContext("2d"),ov=$("ov"),help=$("ghelp");
 let active=false,un=()=>{},raf=0,S=null,snapT=0,me="",code="",lastT=0,lastSend=0,last="",joy=null,kc=0,sdSeen=-1,PK=[],deco=null,shk=0,pkSet=new Set(),prevM=0,boostKey=false,dangerT=0;
 let ML=[],cid=0,mrend=new Map(),ema=.016,lowq=0,enterT=0,hostOn=false,E=[],byId=new Map(),ev=[],hLast=new Map(),hostT=0,acc=0,pubN=0,nid=0,t=0,pkAt=new Array(NPK).fill(0),poseUn=null,timer=0;
 let touch=!!(window.matchMedia&&matchMedia("(pointer:coarse)").matches);
 const keys=new Map(),btn=new Map(),rend=new Map(),parts=[],cam={x:0,y:12,z:0,yaw:0,pitch:0},wc=[10,60,100];
 const L={yv:0,pv:0,roll:0,sf:1,bm:1,aim:null,x:0,y:10,z:0,yaw:0,pitch:0,st:100,lun:0,bcd:0,bc:0,rc:-1,a:1,bt:0,boost:0,m:1.6,spd:0,tired:0,ph:0};
 const FOC=520,CY=235,NEAR=.35,BB={x:712,y:462,r:58},BS={x:596,y:500,r:44};
 let cf=[0,0,1],cr=[1,0,0],cu=[0,1,0];
 /* ---- entrées ---- */
 let msOn=false,ms=null,brk=false;try{msOn=localStorage.getItem("moda.fishmouse")==="1"}catch{}
 const vec=()=>{   // [virage -1..1, tangage -1..1, vitesse 0..1]
  const ax=(a,b)=>keys.has(a)&&keys.has(b)?(keys.get(a)>keys.get(b)?1:-1):(keys.has(a)?1:0)-(keys.has(b)?1:0);
  const kx=ax("R","L"),kz=ax("U","B");
  if(kx||kz){const l=Math.hypot(kx,kz);return[kx/l,kz/l,1]}
  if(joy){const dx=joy.px-joy.ox,dy=joy.py-joy.oy,l=Math.hypot(dx,dy);if(l>8){const m=Math.min(1,l/42),n=Math.min(1,m*1.4);return[dx/l*n,-dy/l*n,.45+.55*m]}}
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
 const hit=(p,b)=>Math.hypot(p[0]-b.x,p[1]-b.y)<=b.r+10;
 const pd=e=>{if(!active||e.target.closest("button"))return;e.preventDefault();if(e.pointerType!=="mouse")touch=true;const p=toC(e);try{cv.setPointerCapture(e.pointerId)}catch{}
  if(e.pointerType==="mouse"){bite();return}
  if(hit(p,BB)){btn.set(e.pointerId,"b");bite()}else if(hit(p,BS))btn.set(e.pointerId,"s");
  else if(!joy&&p[0]<W*.55)joy={id:e.pointerId,ox:p[0],oy:p[1],px:p[0],py:p[1]}};
 const pm=e=>{if(e.pointerType==="mouse"){const p=toC(e);ms={x:p[0],y:p[1]}}if(joy&&joy.id===e.pointerId){const p=toC(e);joy.px=p[0];joy.py=p[1]}};
 const pl=()=>{ms=null};
 const pu=e=>{btn.delete(e.pointerId);if(joy&&joy.id===e.pointerId)joy=null};
 function bite(){
  if(!active||!L.a||L.bcd>0||!S)return;
  L.aim=null;let bd=64;   // aide à la visée : pendant la ruée, on se tourne vers la proie comestible la plus proche devant soi
  for(const [id,r] of rend){if(id==="me"||!edible(L.m,r.m))continue;const dx=r.x-L.x,dy=r.y-L.y,dz=r.z-L.z,d2=dx*dx+dy*dy+dz*dz;if(d2>=bd)continue;if(Math.abs(angd(Math.atan2(dx,dz)-L.yaw))>1)continue;bd=d2;L.aim=r}
  L.bc++;L.bcd=BITE_CD;L.lun=.3;L.bt=.35;send(true)}
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
  return o};
 const circ=(items,px,py,pz,r,c,rim)=>{const k=cs(px,py,pz);if(k[2]<NEAR)return;items.push({z:k[2],t:3,sx:W/2+FOC*k[0]/k[2],sy:CY-FOC*k[1]/k[2],r:Math.max(1,r*FOC/k[2]),c,rim})};
 /* poisson : corps = tube à 8 faces le long de l'axe, nageoires, yeux */
 function addFish(items,r){
  const Lm=len(r.m),sh=r.k===1?1:0,P=PROF[sh],sp=r.sp,c0=cs(r.x,r.y,r.z);
  if(c0[2]<NEAR-Lm||c0[2]>68||Math.abs(c0[0])>c0[2]*1.6+Lm*2)return;
  const f=fog(c0[2]),near=c0[2]<30,cy=Math.cos(r.yaw),sy=Math.sin(r.yaw),cp=Math.cos(r.pitch),sp_=Math.sin(r.pitch);
  const fw=[sy*cp,sp_,cy*cp],rt0=[cy,0,-sy],up0=[-sp_*sy,cp,-sp_*cy],rl_=r.roll||0,cl_=Math.cos(rl_),sl_=Math.sin(rl_),
   rt=[rt0[0]*cl_+up0[0]*sl_,rt0[1]*cl_+up0[1]*sl_,rt0[2]*cl_+up0[2]*sl_],up=[up0[0]*cl_-rt0[0]*sl_,up0[1]*cl_-rt0[1]*sl_,up0[2]*cl_-rt0[2]*sl_];
  const idx=near?[0,1,2,3,4,5,6]:[0,1,2,4,6],SD=near?8:6,q=sh?.85:.5,bw=r.boost?1.5:1;
  const col=(z,s)=>{const b=z===0?sp.b:z===2?sp.bl:z===3?sp.bd:z===4?sp.fn:sp.b;return rgbs(mixc([b[0]*s*(z===0?.8:1),b[1]*s*(z===0?.8:1),b[2]*s*(z===0?.8:1)],wc,f))};
  const ring=[];
  idx.forEach(i=>{const tt=i/6,zc=Lm*(.5-tt),w=Math.sin(r.ph-tt*3.2)*Lm*.1*tt*tt*bw,cx=r.x+fw[0]*zc+rt[0]*w,cyy=r.y+fw[1]*zc,cz=r.z+fw[2]*zc+rt[2]*w,ry=P[i]*Lm*.42,rx=ry*q,vs=[];
   for(let j=0;j<SD;j++){const a=j/SD*6.2832,lx=Math.cos(a)*rx,ly=Math.sin(a)*ry,wx=cx+rt[0]*lx+up[0]*ly,wy=cyy+up[1]*ly,wz=cz+rt[2]*lx+up[2]*ly,k=cs(wx,wy,wz);vs.push([W/2+FOC*k[0]/k[2],CY-FOC*k[1]/k[2],k[2],wx,wy,wz])}
   ring.push({c:[cx,cyy,cz],ry,rx,vs,i})});
  for(let a=0;a<ring.length-1;a++){const A=ring[a],B=ring[a+1];
   for(let j=0;j<SD;j++){const j2=(j+1)%SD,v=[A.vs[j],A.vs[j2],B.vs[j2],B.vs[j]];if(v[0][2]<NEAR||v[1][2]<NEAR||v[2][2]<NEAR||v[3][2]<NEAR)continue;
    const am=(j+.5)/SD*6.2832,nl=[Math.cos(am)/q,Math.sin(am)],nn=Math.hypot(nl[0],nl[1]),nx=nl[0]/nn,ny=nl[1]/nn,
     n=[rt[0]*nx+up[0]*ny,up[1]*ny,rt[2]*nx+up[2]*ny],mx=(v[0][3]+v[2][3])/2,my=(v[0][4]+v[2][4])/2,mz=(v[0][5]+v[2][5])/2;
    if(n[0]*(cam.x-mx)+n[1]*(cam.y-my)+n[2]*(cam.z-mz)<=0)continue;
    const lum=clamp((n[0]*LIGHT[0]+n[1]*LIGHT[1]+n[2]*LIGHT[2]+.25)/1.25,0,1),s=.5+.55*lum,sn=Math.sin(am);
    const zone=sp.bands&&(A.i===2||A.i===4)?3:sn<-.35?2:sn>.5?0:1,cl=col(zone,s);
    items.push({z:(v[0][2]+v[1][2]+v[2][2]+v[3][2])/4,t:1,s:[v[0][0],v[0][1],v[1][0],v[1][1],v[2][0],v[2][1],v[3][0],v[3][1]],c:cl,k:cl})}}
  const poly=(pts,s,z0)=>{const sc=[];let zs=0;for(const p of pts){const k=cs(p[0],p[1],p[2]);if(k[2]<NEAR)return;sc.push(W/2+FOC*k[0]/k[2],CY-FOC*k[1]/k[2]);zs+=k[2]}items.push({z:zs/pts.length+(z0||0),t:1,s:sc,c:col(4,s),k:col(4,s*.7)})};
  const wp=(rg,l,u,s)=>[rg.c[0]+fw[0]*l+up[0]*u+rt[0]*s,rg.c[1]+fw[1]*l+up[1]*u+rt[1]*s,rg.c[2]+fw[2]*l+up[2]*u+rt[2]*s];
  const rl=ring[ring.length-1],r2=ring.find(g=>g.i===2)||ring[1],r4=ring.find(g=>g.i===4)||rl,r1=ring[1],dh=sh?.36:.28;
  poly([wp(rl,0,Lm*.03,0),wp(rl,-Lm*(sh?.2:.22),Lm*(sh?.38:.3),0),wp(rl,-Lm*.12,0,0),wp(rl,-Lm*(sh?.2:.22),-Lm*(sh?.22:.3),0),wp(rl,0,-Lm*.03,0)],.95,-Lm*.02);
  poly([wp(r2,Lm*.08,r2.ry*.9,0),wp(r2,-Lm*.12,r2.ry+Lm*dh,0),wp(r4,0,r4.ry*.9,0)],.9,-Lm*.01);
  const fl=Math.sin(r.ph*1.3)*.25;
  [-1,1].forEach(sd=>poly([wp(r1,0,-r1.ry*.2,sd*r1.rx*.9),wp(r1,-Lm*.2,-Lm*.12,sd*(r1.rx+Lm*(.2+fl))),wp(r1,-Lm*.12,r1.ry*.1,sd*r1.rx*.9)],.8,0));
  [-1,1].forEach(sd=>{const e=wp(r1,Lm*.03,r1.ry*.3,sd*r1.rx*.92),k=cs(e[0],e[1],e[2]);if(k[2]<NEAR)return;
   const rad=Math.max(1.2,Lm*.06*FOC/k[2]);items.push({z:k[2]-Lm*.04,t:3,sx:W/2+FOC*k[0]/k[2],sy:CY-FOC*k[1]/k[2],r:rad,c:"#fff",rim:"#111a",pu:1})});
  if(r.bt){const h=ring[0],e=wp(h,Lm*.03,-h.ry*.2,0),k=cs(e[0],e[1],e[2]);if(k[2]>=NEAR)items.push({z:k[2]-Lm*.08,t:3,sx:W/2+FOC*k[0]/k[2],sy:CY-FOC*k[1]/k[2],r:Math.max(2,Lm*.11*FOC/k[2]),c:"#8a0f26",rim:"#fff"})}}
 function paint(it){
  switch(it.t){
   case 1:{const s=it.s;x.beginPath();x.moveTo(s[0],s[1]);for(let i=2;i<s.length;i+=2)x.lineTo(s[i],s[i+1]);x.closePath();x.fillStyle=it.c;x.fill();if(it.k){x.strokeStyle=it.k;x.lineWidth=.9;x.stroke()}break}
   case 3:{x.beginPath();x.arc(it.sx,it.sy,it.r+(it.rim&&!it.pu?1.2:0),0,7);if(it.rim){x.fillStyle=it.rim;x.fill();x.beginPath();x.arc(it.sx,it.sy,it.r,0,7)}x.fillStyle=it.c;x.fill();
    if(it.pu){x.fillStyle="#0a1226";x.beginPath();x.arc(it.sx,it.sy+it.r*.05,it.r*.5,0,7);x.fill()}else{x.fillStyle="rgba(255,255,255,.22)";x.beginPath();x.arc(it.sx-it.r*.3,it.sy-it.r*.3,it.r*.45,0,7);x.fill()}break}
   case 4:{x.fillStyle=`rgba(190,255,230,${it.a*.22})`;x.beginPath();x.arc(it.sx,it.sy,it.r*2.4,0,7);x.fill();x.fillStyle=`rgba(225,255,245,${it.a})`;x.beginPath();x.arc(it.sx,it.sy,it.r,0,7);x.fill();break}
   case 7:{x.lineCap="round";x.strokeStyle=it.lc;x.lineWidth=Math.max(1,it.r*.07);for(const l of it.ls){x.beginPath();x.moveTo(l[0],l[1]);for(let i=2;i<l.length;i+=2)x.lineTo(l[i],l[i+1]);x.stroke()}
    x.beginPath();x.ellipse(it.sx,it.sy,it.r,it.r*.85,0,Math.PI,0);x.quadraticCurveTo(it.sx,it.sy+it.r*.4,it.sx-it.r,it.sy);x.fillStyle=it.c;x.fill();
    x.fillStyle=it.hc;x.beginPath();x.ellipse(it.sx-it.r*.2,it.sy-it.r*.38,it.r*.45,it.r*.22,-.3,0,7);x.fill();x.lineCap="butt";break}
   case 5:{x.lineCap="round";x.lineJoin="round";x.strokeStyle=it.c;x.lineWidth=it.w;for(const l of it.ls){x.beginPath();x.moveTo(l[0],l[1]);for(let i=2;i<l.length;i+=2)x.lineTo(l[i],l[i+1]);x.stroke()}x.lineCap="butt";break}
  }}
 /* ---- décor ---- */
 const fc=(items,px,py,pz,r,rgb,rim)=>{const k=cs(px,py,pz);if(k[2]<NEAR)return;const f=fog(k[2]);items.push({z:k[2],t:3,sx:W/2+FOC*k[0]/k[2],sy:CY-FOC*k[1]/k[2],r:Math.max(1.5,r*FOC/k[2]),c:rgbs(mixc(rgb,wc,f)),rim:rgbs(mixc(rim,wc,f))})};
 const line3=(pts)=>{const o=[];let zs=0;for(const q of pts){const c=cs(q[0],q[1],q[2]);if(c[2]<NEAR)return null;o.push(W/2+FOC*c[0]/c[2],CY-FOC*c[1]/c[2]);zs+=c[2]}return[o,zs/pts.length]};
 function addDeco(items,now){
  if(!deco)return;const td=now/1000,near2=(a,b,d)=>(a-cam.x)**2+(b-cam.z)**2<d;
  for(const k of deco.ke){if(!near2(k.x,k.z,2500))continue;const y0=gh(k.x,k.z),pts=[];
   for(let i=0;i<=6;i++){const u=i/6,sw=Math.sin(td*1.1+k.p+u*2.5)*.7*u*u*k.h*.12;pts.push([k.x+sw,y0+u*k.h,k.z+sw*.6])}
   const L1=line3(pts);if(!L1)continue;const z=L1[1],f=fog(z);items.push({z:z+k.h*.1,t:5,ls:[L1[0]],w:Math.max(1.6,.36*FOC/z),c:rgbs(mixc([34,140,76],wc,f))});
   items.push({z:z+k.h*.1-.01,t:5,ls:[L1[0]],w:Math.max(.8,.12*FOC/z),c:rgbs(mixc([110,210,120],wc,f))})}
  for(const o of deco.sg){if(!near2(o.x,o.z,1400))continue;const y0=gh(o.x,o.z),ls=[];let zs=0,n=0;
   for(let b=0;b<5;b++){const a=b*1.3+o.p,bx=o.x+Math.cos(a)*.35,bz=o.z+Math.sin(a)*.35,sw=Math.sin(td*1.6+o.p+b)*.28,L1=line3([[bx,y0,bz],[bx+sw*.5,y0+o.h*.55,bz],[bx+sw,y0+o.h,bz+sw*.4]]);if(L1){ls.push(L1[0]);zs+=L1[1];n++}}
   if(!n)continue;const z=zs/n,f=fog(z);items.push({z,t:5,ls,w:Math.max(1,.09*FOC/z),c:rgbs(mixc([96,190,104],wc,f))})}
  for(const o of deco.co){if(!near2(o.x,o.z,2200))continue;const y0=gh(o.x,o.z),ls=[];let zs=0,n=0;
   for(const b of o.br){const L1=line3([[o.x,y0,o.z],[o.x+b[0]*.5,y0+o.h*.6,o.z+b[1]*.5],[o.x+b[0]*1.1,y0+o.h*1.15,o.z+b[1]*1.1]]);if(L1){ls.push(L1[0]);zs+=L1[1];n++}}
   if(!n)continue;const z=zs/n,f=fog(z);items.push({z,t:5,ls,w:Math.max(2,.38*FOC/z),c:rgbs(mixc(o.c,wc,f))});
   items.push({z:z-.01,t:5,ls,w:Math.max(.9,.13*FOC/z),c:rgbs(mixc(mixc(o.c,[255,255,255],.4),wc,f))})}
  for(const o of deco.dm){if(!near2(o.x,o.z,2000))continue;fc(items,o.x,gh(o.x,o.z)+o.r*.35,o.z,o.r,o.c,o.d)}
  for(const o of deco.ro){if(!near2(o.x,o.z,2200))continue;for(const q of o.sp)fc(items,o.x+q[0],gh(o.x+q[0],o.z+q[1])+q[2]*.3,o.z+q[1],q[2],o.c,[o.c[0]*.55,o.c[1]*.55,o.c[2]*.55])}
  for(const o of deco.an){if(!near2(o.x,o.z,1500))continue;const y0=gh(o.x,o.z),top=[o.x,y0+o.h,o.z],ls=[];let zs=0,n=0;
   const st=line3([[o.x,y0,o.z],top]);if(!st)continue;
   for(let i=0;i<9;i++){const a=i/9*6.283,w=Math.sin(td*2+o.p+i)*.12,L1=line3([top,[top[0]+Math.cos(a)*.32+w,top[1]+.28,top[2]+Math.sin(a)*.32],[top[0]+Math.cos(a)*.5+w*2,top[1]+.5+Math.sin(td*2.4+i+o.p)*.1,top[2]+Math.sin(a)*.5]]);if(L1){ls.push(L1[0]);zs+=L1[1];n++}}
   const z=st[1],f=fog(z);items.push({z,t:5,ls:[st[0]],w:Math.max(2,.28*FOC/z),c:rgbs(mixc([200,150,170],wc,f))});
   if(n)items.push({z:z-.02,t:5,ls,w:Math.max(1,.09*FOC/z),c:rgbs(mixc(o.c,wc,f))})}
  for(const v of deco.vt){if(!near2(v.x,v.z,2600))continue;const y0=gh(v.x,v.z);fc(items,v.x,y0+.2,v.z,.9,[80,78,86],[40,40,48]);
   for(let i=0;i<9;i++){const ph=((td*1.1+i*.37+v.p)%3)/3;fc(items,v.x+Math.sin(td*2+i)*.25*ph,y0+.6+ph*16,v.z+Math.cos(td*1.7+i)*.2*ph,.06+.11*ph,[225,248,255],[255,255,255])}}
  for(const j of deco.jf){const px=j.x+Math.sin(td*.15+j.p)*6,py=j.y+Math.sin(td*.4+j.p)*2,pz=j.z+Math.cos(td*.13+j.p)*6;if(!near2(px,pz,2500))continue;
   const k=cs(px,py,pz);if(k[2]<NEAR||k[2]>50)continue;const f=fog(k[2]),pu=1+.12*Math.sin(td*2+j.p),r0=j.r*pu,sx=W/2+FOC*k[0]/k[2],sy=CY-FOC*k[1]/k[2],ls=[];
   for(let t2=0;t2<5;t2++){const a=t2/5*6.283,bx=Math.cos(a)*r0*.6,bz=Math.sin(a)*r0*.6,w=Math.sin(td*1.5+j.p+t2)*.3,L1=line3([[px+bx,py-r0*.1,pz+bz],[px+bx+w*.5,py-r0*1.2,pz+bz],[px+bx+w,py-r0*2.2,pz+bz+w*.4]]);if(L1)ls.push(L1[0])}
   const a=(1-f)*.75,cc=j.c;items.push({z:k[2],t:7,sx,sy,r:Math.max(2,r0*FOC/k[2]),ls,c:`rgba(${cc[0]},${cc[1]},${cc[2]},${(a*.55).toFixed(2)})`,hc:`rgba(255,255,255,${(a*.45).toFixed(2)})`,lc:`rgba(${cc[0]},${cc[1]},${cc[2]},${(a*.6).toFixed(2)})`})}
  for(const o of lowq?[]:deco.sn){   // neige marine : petites particules en suspension autour de la caméra
   const wr=v=>((v%50)+50)%50-25,px=cam.x+wr(o[0]+td*.5*o[3]),py=cam.y+wr(o[1]-td*.4*o[3]),pz=cam.z+wr(o[2]+td*.3),k=cs(px,py,pz);if(k[2]<NEAR||Math.abs(k[0])>k[2]*1.5)continue;
   items.push({z:k[2],t:4,sx:W/2+FOC*k[0]/k[2],sy:CY-FOC*k[1]/k[2],r:Math.max(.8,.05*FOC/k[2]),a:.22})}}
  function addMeat(items,now,dt){
  if(!S)return;const td=now/1000,ml=S.ml||[],ids=new Set();
  for(const a of ml){ids.add(a[0]);let r=mrend.get(a[0]);if(!r){r={x:a[1],y:a[2],z:a[3]};mrend.set(a[0],r);if(Math.hypot(a[1]-cam.x,a[3]-cam.z)<45)burst(a[1],a[2],a[3],BLOOD,3,1.4)}
   const kk=1-Math.exp(-dt*10);r.x+=(a[1]-r.x)*kk;r.y+=(a[2]-r.y)*kk;r.z+=(a[3]-r.z)*kk;r.m=a[4];
   if(a[5]<4&&Math.floor(td*6)%2===0)continue;   // clignote avant de disparaître
   const k=cs(r.x,r.y+Math.sin(td*2+a[4]*9)*.04,r.z);if(k[2]<NEAR||k[2]>46||Math.abs(k[0])>k[2]*1.5)continue;const f=fog(k[2]),rd=Math.max(1.6,crad(r.m)*FOC/k[2]),sx=W/2+FOC*k[0]/k[2],sy=CY-FOC*k[1]/k[2];
   items.push({z:k[2],t:3,sx,sy,r:rd,c:rgbs(mixc([226,84,104],wc,f)),rim:rgbs(mixc([128,26,44],wc,f))});
   if(rd>4)items.push({z:k[2]-.01,t:3,sx:sx+rd*.25,sy:sy-rd*.15,r:rd*.38,c:rgbs(mixc([255,190,196],wc,f))})}
  for(const id of mrend.keys())if(!ids.has(id))mrend.delete(id)}
 function addPlankton(items,now){
  for(let i=0;i<PK.length;i++){if(pkSet.has(i))continue;const p=PK[i],bob=Math.sin(now/700+i)*.3,k=cs(p[0],p[1]+bob,p[2]);if(k[2]<NEAR||k[2]>38||Math.abs(k[0])>k[2]*1.5)continue;
   items.push({z:k[2],t:4,sx:W/2+FOC*k[0]/k[2],sy:CY-FOC*k[1]/k[2],r:Math.max(1.1,.1*FOC/k[2]),a:clamp(1.2-k[2]/38,.3,1)})}}
 function seabed(now){
  const td=now/1000,TS=lowq?8:6,N=lowq?7:9,cx=Math.floor(cam.x/TS),cz=Math.floor(cam.z/TS),M=2*N+2,hv=[],tl=[];
  for(let i=0;i<M;i++)for(let j=0;j<M;j++)hv[i*M+j]=gh((cx-N+i)*TS,(cz-N+j)*TS);
  for(let i=0;i<M-1;i++)for(let j=0;j<M-1;j++){
   const x0=(cx-N+i)*TS,z0=(cz-N+j)*TS,h=[hv[i*M+j],hv[(i+1)*M+j],hv[(i+1)*M+j+1],hv[i*M+j+1]],px=[x0,x0+TS,x0+TS,x0],pz=[z0,z0,z0+TS,z0+TS],sc=[];let zs=0,ok=1;
   for(let k=0;k<4;k++){const c=cs(px[k],h[k],pz[k]);if(c[2]<NEAR){ok=0;break}sc.push(W/2+FOC*c[0]/c[2],CY-FOC*c[1]/c[2]);zs+=c[2]}
   if(!ok)continue;const z=zs/4,f=fog(z),hA=(h[0]+h[1]+h[2]+h[3])/4,nz=hash2(cx-N+i,cz-N+j),lowf=clamp((3.4-hA)/2.4,0,1),sl=(h[0]-h[2])*.1;
   let base=mixc([222,203,148],[142,150,132],lowf);if(nz>.9)base=mixc(base,[116,116,112],.65);
   const ca=Math.sin((x0+z0)*.45+td*1.3)*Math.sin((x0-z0)*.4-td*1.1)*.5+.5,s=clamp((.9+sl+(nz-.5)*.16)*(1+.22*ca*(1-f)),.55,1.32);
   tl.push({z,s:sc,c:rgbs(mixc([base[0]*s,base[1]*s,base[2]*s],wc,f))})}
  tl.sort((a,b)=>b.z-a.z);for(const t of tl){x.beginPath();x.moveTo(t.s[0],t.s[1]);for(let i=2;i<8;i+=2)x.lineTo(t.s[i],t.s[i+1]);x.closePath();x.fillStyle=t.c;x.fill();x.strokeStyle=t.c;x.lineWidth=.8;x.stroke()}}
 function surface(now){   // plafond d'eau qui ondule, visible quand on regarde vers le haut
  if(cam.pitch-.1<-.45&&cam.y<WH-12)return;
  const td=now/1000,TS=14,N=6,cx=Math.floor(cam.x/TS),cz=Math.floor(cam.z/TS),M=2*N+2,tl=[];
  const wy=(px,pz)=>WH+Math.sin(px*.2+td*.9)*.5+Math.cos(pz*.17+td*.7)*.4;
  for(let i=0;i<M-1;i++)for(let j=0;j<M-1;j++){
   const x0=(cx-N+i)*TS,z0=(cz-N+j)*TS,px=[x0,x0+TS,x0+TS,x0],pz=[z0,z0,z0+TS,z0+TS],sc=[];let zs=0,ok=1;
   for(let k=0;k<4;k++){const c=cs(px[k],wy(px[k],pz[k]),pz[k]);if(c[2]<NEAR){ok=0;break}sc.push(W/2+FOC*c[0]/c[2],CY-FOC*c[1]/c[2]);zs+=c[2]}
   if(!ok)continue;const z=zs/4,sh=.8+.2*Math.sin(x0*.31+z0*.27+td*1.4);
   tl.push({z,s:sc,c:rgbs(mixc([175*sh,238*sh,255*sh],wc,clamp((z-10)/60,0,.85)))})}
  tl.sort((a,b)=>b.z-a.z);for(const t of tl){x.beginPath();x.moveTo(t.s[0],t.s[1]);for(let i=2;i<8;i+=2)x.lineTo(t.s[i],t.s[i+1]);x.closePath();x.fillStyle=t.c;x.fill();x.strokeStyle=t.c;x.lineWidth=.8;x.stroke()}}
 function vignette(){const g=x.createRadialGradient(W/2,H/2,H*.38,W/2,H/2,H*.95);g.addColorStop(0,"rgba(0,12,28,0)");g.addColorStop(1,"rgba(0,12,28,.42)");x.fillStyle=g;x.fillRect(-16,-16,W+32,H+32)}
 function background(now){
  const d=clamp(cam.y/WH,0,1),dp=Math.pow(d,.8);wc[0]=5+23*dp;wc[1]=32+88*dp;wc[2]=64+104*dp;
  const hy=CY+FOC*Math.tan(clamp(cam.pitch-.1,-1.3,1.3)),g=x.createLinearGradient(0,hy-420,0,hy+420);
  g.addColorStop(0,rgbs(mixc(wc,[150,230,255],.55)));g.addColorStop(.5,rgbs(wc));g.addColorStop(1,rgbs(mixc(wc,[0,10,25],.6)));x.fillStyle=g;x.fillRect(-16,-16,W+32,H+32);
  x.save();for(let i=0;i<10;i++){const bx=(((i*137-cam.yaw*260+now*.012*(i%3+1))%(W+500))+W+500)%(W+500)-250,wd=30+(i%4)*26;x.fillStyle=`rgba(210,245,255,${.04+.02*(i%3)})`;x.beginPath();x.moveTo(bx,-10);x.lineTo(bx+wd,-10);x.lineTo(bx+wd*2.4+80,H);x.lineTo(bx-wd*.4+80,H);x.fill()}x.restore()}
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
  prevM=mine[6]}
 function updCam(dt){
  const k=1-Math.exp(-dt*7),Lm=len(L.m||1.6),D=3.2+Lm*2.4+(L.bm-1)*1.4;
  if(L.a){cam.yaw+=angd(L.yaw-cam.yaw)*Math.min(1,k*1.6);cam.pitch+=(L.pitch*.75-cam.pitch)*k}else cam.yaw+=dt*.25;
  const p=cam.pitch,fx=Math.sin(cam.yaw)*Math.cos(p),fy=Math.sin(p),fz=Math.cos(cam.yaw)*Math.cos(p);
  cam.x=L.x-fx*D;cam.y=clamp(L.y-fy*D+Lm*.5,gh(L.x-fx*D,L.z-fz*D)+.5,WH-.3);cam.z=L.z-fz*D;
  const vp=clamp(p-.1,-1.4,1.4),sy=Math.sin(cam.yaw),cy=Math.cos(cam.yaw),sp=Math.sin(vp),cp=Math.cos(vp);
  cf=[sy*cp,sp,cy*cp];cr=[cy,0,-sy];cu=[-sp*sy,cp,-sp*cy]}
 /* ---- image ---- */
 function frame(now){
  if(!active)return;raf=requestAnimationFrame(frame);
  const dt=Math.min(.05,Math.max(.001,(now-lastT)/1000||.016));lastT=now;ema+=(dt-ema)*.05;lowq=ema>.032?1:ema<.02?0:lowq;   // qualité adaptative : fond marin moins détaillé si l'appareil rame
  stepLocal(dt);send();updCam(dt);
  const k0=cv.width/W,k1=cv.height/H;shk=Math.max(0,shk-dt*2);const sa=shk*5;
  x.setTransform(k0,0,0,k1,sa?(Math.random()-.5)*2*sa*k0:0,sa?(Math.random()-.5)*2*sa*k1:0);
  background(now);surface(now);seabed(now);
  const items=[],vis=[];updRend(dt,now,vis);
  addDeco(items,now);addPlankton(items,now);addMeat(items,now,dt);vis.forEach(r=>addFish(items,r));
  items.sort((a,b)=>b.z-a.z);for(const it of items)paint(it);
  /* particules */
  for(let i=parts.length-1;i>=0;i--){const p=parts[i];p.l-=dt;if(p.l<=0){parts.splice(i,1);continue}p.vy+=.5*dt;p.vx*=.97;p.vz*=.97;p.x+=p.vx*dt;p.y+=p.vy*dt;p.z+=p.vz*dt;
   const c=cs(p.x,p.y,p.z);if(c[2]<NEAR)continue;const rr=Math.max(1,p.s*FOC/c[2]);x.globalAlpha=Math.min(1,p.l*2);x.fillStyle=p.c;x.beginPath();x.arc(W/2+FOC*c[0]/c[2],CY-FOC*c[1]/c[2],rr,0,7);x.fill();x.globalAlpha=1}
  vignette();
  x.setTransform(k0,0,0,k1,0,0);
  tags(vis);hud(now,vis);
  const mine=S&&S.p.find(q=>q[0]===me);
  ov.textContent=S?(mine&&!mine[7]?"💀 Mangé par "+(mine[15]||"un poisson"):""):"Connexion au serveur…";
  ov.style.fontSize=S&&mine&&!mine[7]?"34px":"56px";
 }
 const T=(t,px,py,font,c,al)=>{x.font=font;x.fillStyle=c;x.textAlign=al||"left";x.fillText(t,px,py);x.textAlign="left"};
 const fit=(t,mw,font)=>{x.font=font;t=String(t);if(x.measureText(t).width<=mw)return t;while(t.length>1&&x.measureText(t+"…").width>mw)t=t.slice(0,-1);return t+"…"};
 const card=(px,py,w,h,r,bg,bd)=>{x.beginPath();x.roundRect(px,py,w,h,r);x.fillStyle=bg||"#06192ee6";x.fill();x.strokeStyle=bd||"#ffffff30";x.lineWidth=1.5;x.stroke()};
 function tags(vis){
  for(const r of vis){const Lm=len(r.m),c=cs(r.x,r.y+Lm*.4+.35,r.z);if(c[2]<NEAR||c[2]>45)continue;const sx=W/2+FOC*c[0]/c[2],sy=CY-FOC*c[1]/c[2],can=L.a&&edible(L.m,r.m),dng=L.a&&edible(r.m,L.m),col=r.me?"#54f6e4":can?"#7dffa1":dng?"#ff6b6b":"#fff";
   if(r.me&&!L.a)continue;
   if(r.pl||r.k===1){const fs=clamp(300/c[2],9,14);x.font=`700 ${fs}px system-ui`;x.textAlign="center";const tx=(r.n||"")+(r.k===1?"":" · "+fmtm(r.m));x.lineWidth=3;x.strokeStyle="#041424cc";x.strokeText(tx,sx,sy);x.fillStyle=col;x.fillText(tx,sx,sy);x.textAlign="left"}
   else if(!r.me&&(can||dng)&&c[2]<32){x.fillStyle=can?"#7dffa1":"#ff6b6b";x.beginPath();x.arc(sx,sy,2.6,0,7);x.fill()}}}
 function hud(now,vis){
  const mine=S&&S.p.find(q=>q[0]===me),live=!!S,fnt="system-ui";
  /* danger */
  let dg=null;if(L.a)for(const r of vis){if(r.me||!edible(r.m,L.m))continue;const d=Math.hypot(r.x-L.x,r.y-L.y,r.z-L.z);if(d<16+len(r.m)&&(!dg||d<dg))dg=d}
  if(dg!==null){const a=.1+.1*Math.sin(now/90)+(1-dg/20)*.12;x.fillStyle=`rgba(255,40,70,${a})`;x.fillRect(0,0,W,14);x.fillRect(0,H-14,W,14);x.fillRect(0,0,14,H);x.fillRect(W-14,0,14,H);T("⚠️ DANGER : plus gros que toi !",W/2,60,"800 15px "+fnt,"#ffb3bd","center")}
  /* haut-gauche */
  const m=mine?mine[6]:1.6,si=stg(m),nx=STG[si+1];
  card(16,14,226,88,13);T("STADE "+(si+1)+" · "+STG[si][1],30,38,"900 17px "+fnt,"#fff");T("⚖ "+fmtm(m)+(nx?"  →  "+nx[1]+" à "+nx[0]:"  · MAX"),30,56,"700 12px "+fnt,"#9fe3ff");
  if(nx){const p=clamp((m-STG[si][0])/(nx[0]-STG[si][0]),0,1);x.fillStyle="#ffffff22";x.fillRect(30,64,196,5);x.fillStyle="#7dffa1";x.fillRect(30,64,196*p,5)}
  const yy=80;x.fillStyle="#ffffff22";x.fillRect(30,yy,196,5);x.fillStyle=L.tired?"#ff8a5c":"#ffd23f";x.fillRect(30,yy,196*clamp(L.st/100,0,1),5);
  /* haut-centre */
  if(S){card(300,14,200,34,13);T("🌊 "+getCode()+" · "+S.p.length+" 🐟   🍽 "+(mine?mine[12]:0),400,37,"800 15px "+fnt,"#fff","center")}
  /* haut-droite : classement */
  if(S){const lb=S.p.slice().sort((a,b)=>b[6]-a[6]).slice(0,5),bx=W-16-180;card(bx,14,180,30+lb.length*20,13);T("CLASSEMENT",bx+14,32,"700 11px "+fnt,"#9fe3ff");
   lb.forEach((q,i)=>{const yb=52+i*20,mm=q[0]===me;T((i+1)+". "+fit(q[9],100,"700 12px "+fnt),bx+14,yb,(mm?"800":"600")+" 12px "+fnt,mm?"#54f6e4":q[7]?"#fff":"#ffffff77");T(fmtm(q[6]),bx+166,yb,"700 12px "+fnt,"#ffd23f","right")});
   let ly=14+30+lb.length*20+8;(S.ev||[]).slice(-4).forEach(e=>{if(e[2]>5)return;x.globalAlpha=clamp((5-e[2])*1.5,0,1);card(bx,ly,180,22,8,"#2a0c1ddd","#ff6b6b55");T("🍴 "+fit(e[0]+" › "+e[1],160,"600 11px "+fnt),bx+10,ly+15,"600 11px "+fnt,"#ffd1d9");x.globalAlpha=1;ly+=26})}
  if(L.a&&live&&(Math.abs(L.x)>R-4||Math.abs(L.z)>R-4))T("Bord de la zone",W/2,84,"700 13px "+fnt,"#ffe28a","center");
  if(S&&live&&now-enterT<10000){x.globalAlpha=clamp((10000-(now-enterT))/1500,0,1);card(30,482,520,52,12,"#06192ee0");T("Mange le plancton ✨ et les plus petits (ils éclatent en viande 🥩) · fuis les rouges",290,504,"600 13px "+fnt,"#eaf8ff","center");T("Mords : Espace / clic · Sprint : Maj · Frein : C · Souris : M · ←→ ↑↓ pour nager",290,524,"600 13px "+fnt,"#eaf8ff","center");x.globalAlpha=1}
  if(touch){const pb=[...btn.values()].includes("b"),ps=[...btn.values()].includes("s");
   [[BB,"MORDS",pb],[BS,"SPRINT",ps]].forEach(([b,l,on])=>{x.beginPath();x.arc(b.x,b.y,b.r,0,7);x.fillStyle=on?"#ffffff55":"#06192e99";x.fill();x.strokeStyle=on?"#fff":"#ffffff66";x.lineWidth=3;x.stroke();T(l,b.x,b.y+5,"800 14px "+fnt,"#fff","center")});
   if(joy){x.beginPath();x.arc(joy.ox,joy.oy,42,0,7);x.strokeStyle="#ffffff55";x.lineWidth=3;x.stroke();const dx=joy.px-joy.ox,dy=joy.py-joy.oy,l=Math.hypot(dx,dy),mm=l>42?42/l:1;x.beginPath();x.arc(joy.ox+dx*mm,joy.oy+dy*mm,20,0,7);x.fillStyle="#ffffffaa";x.fill()}}}

 /* ================= HÔTE : le plus ancien joueur du serveur simule le monde ================= */
 const lobbyP=()=>(getLobby()||{}).players||{};
 const hostUid=()=>{const pl=lobbyP();let b=null;for(const u in pl){const j=pl[u].j||1e15;if(!b||j<b[1]||(j===b[1]&&u<b[0]))b=[u,j]}return b&&b[0]};
 const rpos=()=>{const x1=rf(-R+8,R-8),z1=rf(-R+8,R-8);return[x1,rf(gh(x1,z1)+2,WH-6),z1]};
 const mkE=o=>{const p=rpos(),e={id:"",hu:0,bot:0,k:0,name:"",col:"#4ad",x:p[0],y:p[1],z:p[2],yaw:rf(-3,3),pitch:0,m:1,a:1,spd:0,kl:0,rc:0,bt:0,bc:0,cd:0,rs:0,inv:0,tier:0,wx:p[0],wy:p[1],wz:p[2],wt:0,dby:"",...o};E.push(e);byId.set(e.id,e);return e};
 const onPose=s=>Object.entries(s.val()||{}).forEach(([u,v])=>{
  const e=byId.get(u);if(!e||!e.hu||!e.a)return;const a=String(v).split(",").map(Number);if(a.length<8||a.length>9||a.some(n=>!Number.isFinite(n))||a[7]!==e.rc)return;
  e.x=clamp(a[0],-R,R);e.z=clamp(a[2],-R,R);e.y=clamp(a[1],0,WH);e.yaw=a[3];e.pitch=clamp(a[4],-1.4,1.4);e.spd=spdOf(e.m)*(a[5]?1.7:1)*(a.length>8?clamp(a[8],.3,1):1);
  if(a[6]>e.bc){if(e.cd<=0){e.bt=.4;e.cd=BITE_CD*.9}e.bc=a[6]}});
 function becomeHost(){
  hostOn=true;E=[];byId=new Map();ev=[];ML=[];cid=0;acc=0;hostT=performance.now();pubN=0;nid=0;pkAt.fill(0);
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
  const total=o.m*GAIN+.3;e.m=Math.min(e.k===1?SHMAX:2000,e.m+total*.4);e.kl++;o.a=0;   // 40 % avalés tout de suite, 60 % en bouts à manger (même par les autres !)
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
  for(const e of E){if(!e.a||e.bt<=0)continue;const Lm=len(e.m),cp=Math.cos(e.pitch),mx=e.x+Math.sin(e.yaw)*cp*Lm*.5,my=e.y+Math.sin(e.pitch)*Lm*.5,mz=e.z+Math.cos(e.yaw)*cp*Lm*.5;
   for(const o of E){if(o===e||!o.a||o.inv>0||!edible(e.m,o.m))continue;if(Math.hypot(o.x-mx,o.y-my,o.z-mz)<len(o.m)*.5+1)eat(e,o)}}
  for(let i=0;i<NPK;i++)if(pkAt[i]&&t>=pkAt[i])pkAt[i]=0;
  for(const e of E){if(!e.a||!e.hu||e.m>=80)continue;const rad=len(e.m)*.45+.5,Lm=len(e.m),cp=Math.cos(e.pitch),mx=e.x+Math.sin(e.yaw)*cp*Lm*.4,my=e.y+Math.sin(e.pitch)*Lm*.4,mz=e.z+Math.cos(e.yaw)*cp*Lm*.4;
   for(let i=0;i<NPK;i++){if(pkAt[i])continue;const p=PK[i];if((p[0]-mx)**2+(p[1]-my)**2+(p[2]-mz)**2<rad*rad){pkAt[i]=t+25;e.m+=e.m<30?.35:.15}}}
  for(let i=ML.length-1;i>=0;i--){const c=ML[i];c.ttl-=dt;if(c.ttl<=0){ML.splice(i,1);continue}   // physique des morceaux : ils s'éparpillent puis coulent doucement
   const dr=Math.exp(-dt*1.8);c.vx*=dr;c.vy*=dr;c.vz*=dr;c.x=clamp(c.x+c.vx*dt,-R+1,R-1);c.z=clamp(c.z+c.vz*dt,-R+1,R-1);c.y=Math.min(WH-1,c.y+(c.vy-.5)*dt);const fl=gh(c.x,c.z)+crad(c.m);if(c.y<fl){c.y=fl;c.vy=0}}
  for(const e of E){if(!e.a||!e.hu||!ML.length)continue;const Lm=len(e.m),cp=Math.cos(e.pitch),mx=e.x+Math.sin(e.yaw)*cp*Lm*.4,my=e.y+Math.sin(e.pitch)*Lm*.4,mz=e.z+Math.cos(e.yaw)*cp*Lm*.4;
   for(let i=ML.length-1;i>=0;i--){const c=ML[i],r=Lm*.45+.3+crad(c.m);if((c.x-mx)**2+(c.y-my)**2+(c.z-mz)**2<r*r){e.m=Math.min(2000,e.m+c.m);ML.splice(i,1)}}}
  for(const e of E){if(e.a||t<e.rs)continue;const p=rpos();e.x=p[0];e.y=p[1];e.z=p[2];e.yaw=rf(-3,3);e.pitch=0;e.a=1;e.bt=0;
   if(e.hu){e.m=Math.max(1.6,e.m*.35);e.inv=2.5;e.rc++}else e.m=e.k===1?rf(140,210):TIER[e.tier]*rf(.9,1.15)}
  if(++pubN%3===0)publish()}
 function publish(){
  Promise.resolve(set(ref(`games/${code}/state`),JSON.stringify({k:"fish",sd:sdSeen,t:+t.toFixed(1),h:me,
   p:E.filter(e=>e.hu).map(e=>[e.id,+e.x.toFixed(1),+e.y.toFixed(1),+e.z.toFixed(1),+e.yaw.toFixed(2),+e.pitch.toFixed(2),+e.m.toFixed(2),e.a?1:0,"p",e.name,e.col,+e.spd.toFixed(1),e.kl,e.rc,e.bt>0?1:0,e.a?"":e.dby]),
   f:E.filter(e=>!e.hu&&e.a).map(e=>[e.id,+e.x.toFixed(1),+e.y.toFixed(1),+e.z.toFixed(1),+e.yaw.toFixed(2),+e.pitch.toFixed(2),+e.m.toFixed(2),e.k,+e.spd.toFixed(1),e.bt>0?1:0,e.tier]),
   ml:ML.map(c=>[c.id,+c.x.toFixed(1),+c.y.toFixed(1),+c.z.toFixed(1),+c.m.toFixed(2),Math.ceil(c.ttl)]),
   pk:pkAt.reduce((a,v,i)=>(v&&a.push(i),a),[]),ev:ev.filter(x=>t-x[2]<6).map(x=>[x[0],x[1],+(t-x[2]).toFixed(1)])}))).catch(()=>{})}
 function simLoop(){
  if(!active)return;const h=hostUid();
  if(h===me){if(!hostOn)becomeHost();const n=performance.now();acc+=Math.min(.25,(n-hostT)/1000);hostT=n;while(acc>=DT)(hostStep(),acc-=DT)}
  else if(hostOn)loseHost()}
 return {enter(c){
  active=true;code=c;me=getMe().uid;S=null;last="";lastSend=0;joy=null;parts.length=0;rend.clear();mrend.clear();keys.clear();btn.clear();boostKey=false;brk=false;sdSeen=-1;PK=[];deco=null;pkSet=new Set();prevM=0;shk=0;enterT=performance.now();hostOn=false;E=[];byId=new Map();hLast=new Map();
  Object.assign(L,{yv:0,pv:0,roll:0,sf:1,bm:1,aim:null,rc:-1,a:1,bc:0,bcd:0,bt:0,lun:0,st:100,boost:0,tired:0,m:1.6,spd:0});
  help.textContent="← → tourner · ↑ ↓ monter/descendre (ou ZQSD) · Espace / clic : mordre · Maj : sprint · C : freiner · M : piloter à la souris · les poissons tués éclatent en bouts de viande : mange-les vite ! Fuis les plus gros !";
  un=onValue(ref(`games/${c}/state`),s=>{const v=s.val();if(!v)return;try{const q=JSON.parse(v);if(q.k!=="fish")return;
   if(q.sd!==sdSeen){sdSeen=q.sd;PK=plankton(q.sd);deco=mkDeco(q.sd)}
   if(S){const ids=new Set([...q.p.filter(t=>t[7]).map(t=>t[0]),...q.f.map(t=>t[0]),"me"]);rend.forEach((r,id)=>{if(!ids.has(id)){if(Math.hypot(r.x-cam.x,r.z-cam.z)<50)burst(r.x,r.y,r.z,BLOOD,10,2.2);rend.delete(id)}})}
   pkSet=new Set(q.pk);S=q;snapT=performance.now()}catch{}});
  addEventListener("keydown",kd);addEventListener("keyup",ku);addEventListener("blur",blur);
  cv.style.touchAction="none";cv.addEventListener("pointerdown",pd);cv.addEventListener("pointermove",pm);cv.addEventListener("pointerleave",pl);cv.addEventListener("pointerup",pu);cv.addEventListener("pointercancel",pu);cv.addEventListener("lostpointercapture",pu);
  lastT=performance.now();raf=requestAnimationFrame(frame);timer=setInterval(simLoop,50);
  env.played&&env.played("fish",true);
  return()=>{active=false;clearInterval(timer);if(poseUn){poseUn();poseUn=null}hostOn=false;un();cancelAnimationFrame(raf);remove(ref(`games/${c}/p/${me}`)).catch(()=>{});removeEventListener("keydown",kd);removeEventListener("keyup",ku);removeEventListener("blur",blur);
   cv.removeEventListener("pointerdown",pd);cv.removeEventListener("pointermove",pm);cv.removeEventListener("pointerleave",pl);cv.removeEventListener("pointerup",pu);cv.removeEventListener("pointercancel",pu);cv.removeEventListener("lostpointercapture",pu);cv.style.touchAction="";
   joy=null;btn.clear();keys.clear();ov.textContent="";ov.style.fontSize="56px";help.textContent=""}
 }};
}
