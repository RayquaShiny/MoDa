/* MoDa — Block Dash 3D
   Fidèle au mode Block Dash de Stumble Guys :
   - tout le monde démarre sur une plateforme carrée suspendue au-dessus du slime ;
   - des vagues de blocs entrent par une porte au fond et balayent l'arène ;
   - aucun mur ne fait moins de 2 blocs de haut : murs de 2 = double saut obligatoire, murs de 3 = infranchissables (il faut un trou) ;
   - blocs mobiles (cyan) : le mur glisse de gauche à droite, le trou se déplace avec lui ;
   - blocs fissurés (sombres) : on plonge dedans pour les briser ;
   - un bloc qui te touche te pousse (tu peux continuer à bouger) ; si tu es poussé hors de la plateforme, tu tombes dans le slime ;
   - la partie progresse par 8 PALIERS (toutes les ~15-25 s) : chacun introduit une nouveauté (murs de 2, murs de 3, fissurés, murs mobiles, enchaînements, trous étroits…),
     resserre l'écart entre les vagues et augmente la fréquence des accélérations ; le dernier survivant gagne.
   - PALIER 8 (CHAOS) : des OBBYS apparaissent : une entrée de murs de 2 puis un champ de piliers (2-3 blocs, trous) à traverser en sautant de bloc en bloc pour passer derrière le mur.
   Rendu : moteur 3D en perspective (caméra, faces éclairées, tri en profondeur, personnages en 3D, particules) sur le canvas 2D existant.
   Entrées réseau : "mx,mz,compteurSaut,compteurPlongeon" (mx/mz ∈ [-1,1], mz>0 = vers les blocs). */
const W=800,H=560,DT=1/30;
const HX=7,HZ=8,N=14,D=1,RAD=.32,RUN=7.4,DIVE=12,G=32,JV=10.4,DJV=8.4;
const GATEZ=HZ+1.5,SPAWNZ=HZ+5.2,EXITZ=-HZ-3.4,SLIME=-7.5;
const colX=i=>-HX+.5+i,ri=(a,b)=>a+Math.floor(Math.random()*(b-a+1)),mk=f=>Array.from({length:N},(_,i)=>f(i)),inR=(i,a,w)=>i>=a&&i<a+Math.max(2,w-GS);
let GS=0;   // rétrécissement des trous (réglé par le palier en cours)
const W2=2,W3=3,K2=12,K3=13;
/* ---- PALIERS : début (s), motifs possibles (indices de PAT), écart entre vagues, trous rétrécis, proba d'accélération, proba d'enchaînement ---- */
const LVT=[0,14,30,48,68,90,114,140];
const LV=[
 {pool:[0,1],gap:7.5,gs:0,sp:0,ch:0},
 {pool:[0,1,2,5],gap:7,gs:0,sp:0,ch:0},
 {pool:[1,2,3,5,7],gap:6.4,gs:0,sp:0,ch:0},
 {pool:[3,4,6,7,10],gap:5.9,gs:0,sp:.12,ch:0},
 {pool:[4,6,8,10,11,14],gap:5.4,gs:0,sp:.18,ch:0},
 {pool:[8,9,11,12,13,14,15],gap:5,gs:0,sp:.26,ch:.2},
 {pool:[8,9,10,12,13,14,15],gap:4.6,gs:1,sp:.34,ch:.3},
 {pool:[8,9,10,11,12,13,14,15,16,17,16,17],gap:4.3,gs:1,sp:.42,ch:.4}
];
const LNM=[["Échauffement","Passe par les trous"],["Double saut","Saute 2× pour franchir les murs de 2"],["Murs de 3","Impossible à sauter : trouve le passage"],
 ["Blocs fissurés","Plonge dedans pour les briser · ⚡ accélérations"],["Murs mobiles","Le trou glisse : suis-le !"],["Enchaînements","Les vagues se suivent de près"],
 ["Trous étroits","Les passages se resserrent"],["CHAOS","Obbys : saute de bloc en bloc pour passer"]];
/* Une case = 0 vide · 2 mur de 2 blocs (double saut) · 3 mur de 3 blocs (infranchissable : il faut un trou)
   · 12 / 13 bloc fissuré de 2 / 3 de haut (à briser en plongeant). Aucun mur ne fait moins de 2 blocs de haut.
   `mv` = mur mobile (amplitude en cases, vitesse en rad/s, phase). Les motifs sont classés du plus facile au plus dur. */
/* Obby (palier 8) : AUCUN passage au sol. Rangée 0 = entrée de murs de 2 (rose, double saut), puis `R` rangées contiguës (dz = 1) de piliers bleus de 2 ou 3 blocs séparés par des trous.
   Un chemin garanti (dénivelé ≤ 1 bloc, donc franchissable d'un simple saut) serpente d'une rangée à l'autre ; `dn` = densité de piliers hors chemin. Tomber dans un trou = coincé entre les blocs, entraîné vers le fond de l'arène.
   `cg` = couleur (1 bleu, 2 rose). */
const obby=(R,dn)=>{
 const rows=[{dz:0,cg:2,row:mk(()=>W2)}];let pc=ri(2,N-3);
 for(let r=1;r<=R;r++){
  const np=Math.max(1,Math.min(N-2,pc+ri(-2,2))),nh=Math.random()<.5?W2:W3,row=mk(()=>Math.random()<dn?(Math.random()<.5?W2:W3):0);
  for(let k=Math.min(pc,np);k<=Math.max(pc,np);k++)row[k]=nh;
  pc=np;rows.push({dz:r,cg:1,row});
 }
 return rows};
const PAT=[
 ()=>{const g=ri(1,N-5);return[{dz:0,row:mk(i=>inR(i,g,4)?0:W2)}]},
 ()=>{const o=ri(0,4);return[{dz:0,row:mk(i=>(i+o)%5<2?0:W2)}]},
 ()=>[{dz:0,row:mk(()=>W2)}],
 ()=>{const a=ri(0,4),b=ri(8,11);return[{dz:0,row:mk(i=>inR(i,a,2)||inR(i,b,2)?0:W3)}]},
 ()=>{const g=ri(1,N-5);return[{dz:0,row:mk(i=>inR(i,g,4)?K3:W3)}]},
 ()=>{const a=ri(0,3),b=ri(7,10);return[{dz:0,row:mk(i=>inR(i,a,4)?0:W2)},{dz:2.4,row:mk(i=>inR(i,b,4)?0:W2)}]},
 ()=>{const g=ri(1,N-4);return[{dz:0,row:mk(i=>inR(i,g,3)?K2:W3)}]},
 ()=>{const o=ri(0,3);return[{dz:0,row:mk(i=>(i+o)%4<2?0:W2)},{dz:2.4,row:mk(i=>(i+o+2)%4<2?0:W2)}]},
 ()=>{const g=ri(1,N-5);return[{dz:0,row:mk(()=>W2)},{dz:2.6,row:mk(i=>inR(i,g,3)?K2:W3)},{dz:5.2,row:mk(i=>i%5<2?0:W3)}]},
 ()=>{const g=ri(0,3);return[{dz:0,row:mk(i=>i<g+4?0:i<g+8?W2:i<g+11?W3:K3)},{dz:2.6,row:mk(()=>W2)}]},
 /* 10 · escalier : le trou se décale d'une rangée à l'autre (sens aléatoire) */
 ()=>{const g=ri(0,4),f=Math.random()<.5;return[0,1,2].map(k=>({dz:k*2.6,row:mk(i=>inR(i,f?g+k*3:g+(2-k)*3,4)?0:W2)}))},
 /* 11 · piliers : on slalome entre des colonnes de 3 et de 2 blocs */
 ()=>{const o=ri(0,3);return[{dz:0,row:mk(i=>(i+o)%4===0?W3:0)},{dz:2.4,row:mk(i=>(i+o+1)%4===0?W2:0)},{dz:4.8,row:mk(i=>(i+o+2)%4===0?W3:0)}]},
 /* 12 · saute-mouton : trois murs de 2 à enchaîner (on peut monter dessus puis resauter) */
 ()=>[0,1,2].map(k=>({dz:k*3.2,row:mk(()=>W2)})),
 /* 13 · faille : mur de fissurés percé de trous, puis mur de 3 à trou */
 ()=>{const g=ri(2,9);return[{dz:0,row:mk(i=>i%4===0?0:K2)},{dz:3,row:mk(i=>inR(i,g,3)?0:W3)}]},
 /* 14 · mur coulissant : le trou glisse d'un côté à l'autre (blocs mobiles) */
 ()=>[{dz:0,row:mk(i=>inR(i,5,4)?0:W2),mv:{a:2.4,s:1.2,ph:0}}],
 /* 15 · couloir coulissant : deux murs (3 puis 2) qui glissent ensemble, trou de 5 */
 ()=>{const g=ri(4,5),mv={a:2.2,s:1.1,ph:0};return[{dz:0,row:mk(i=>inR(i,g,5)?0:W3),mv},{dz:3.2,row:mk(i=>inR(i,g,5)?0:W2),mv}]},
 /* 16 · OBBY court : entrée de murs de 2 (double saut) puis 4 rangées de piliers de 2-3 blocs, très serrés */
 ()=>obby(4,.72),
 /* 17 · OBBY long : 6 rangées de piliers plus espacés (plus de trous) */
 ()=>obby(6,.5)
];

/* ───────────────────────────── HÔTE : simulation ───────────────────────────── */
export async function startBlockDash(env){
 const {R:ref,set,update,remove,onValue,getCode,getLobby,getMe,bots,played}=env,c=getCode(),lob=getLobby()||{},players=bots?bots(lob):lob.players||{},ids=Object.keys(players);
 if(ids.length<2)return env.toast("Block Dash se joue à au moins 2 joueurs.");
 await remove(ref(`games/${c}`));await update(ref(`lobbies/${c}`),{status:"playing"});
 const P={},I={},seen={},walls=[];
 ids.forEach((u,i)=>{
  P[u]={n:players[u].name,c:players[u].color,x:ids.length>1?-5+10*i/(ids.length-1):0,y:0,z:-3+(i%2)*1.3,vx:0,vy:0,vz:0,a:1,g:1,jc:0,cy:0,dv:0,cd:0,sl:0,pu:0,ddx:0,ddz:1,td:0,kx:0,kz:0,ht:-9,cs:0};
  I[u]={mx:0,mz:0,j:0,s:0,jn:0,sn:0,bot:String(u).startsWith("bot_"),sk:.55+Math.random()*.4,nt:0,tw:0,tk:0,done:0,rp:0};
 });
 const elim=[];let t=0,speed=3.8,trav=0,nd=0,sg=0,sgn=0,lv=1,lastP=-1,rid=0,pubN=0,ended=false,wave=0,first=true;GS=0;
 const spawn=(base=0)=>{
   const pl=LV[lv-1].pool;let k=0;if(!first){do{k=pl[ri(0,pl.length-1)]}while(k===lastP&&pl.length>1)}
   lastP=k;const pat=PAT[k](),dm=Math.max(...pat.map(p=>p.dz)),off=first?SPAWNZ-7:0;
   first=false;wave++;pat.forEach(p=>walls.push({id:++rid,z:SPAWNZ+base+p.dz-off,row:p.row.slice(),mv:p.mv||null,age:0,ox:0,vo:0,cg:p.cg||0}));return dm;
 };
 const pub=extra=>Promise.resolve(set(ref(`games/${c}/state`),JSON.stringify({k:"blockdash",t:+t.toFixed(2),v:+speed.toFixed(2),w:wave,
  sg:sg>0?1:0,lv,lp:+(lv<8?(t-LVT[lv-1])/(LVT[lv]-LVT[lv-1]):1).toFixed(2),el:elim.slice(-3).map(e=>[e.n,+(t-e.t).toFixed(1)]),walls:walls.map(w=>[w.id,+w.z.toFixed(2),w.row,+w.ox.toFixed(2),+w.vo.toFixed(2),w.mv?1:0,w.cg||0]),
  p:ids.map(u=>{const q=P[u];return[u,+q.x.toFixed(2),+q.y.toFixed(2),+q.z.toFixed(2),q.a,q.dv>0?2:!q.g?1:q.pu>0?3:0,q.c,q.n,+(q.vx+q.kx).toFixed(1),+(q.vz+q.kz-q.cs).toFixed(1)]}),...extra}))).catch(()=>{});
 const inputUn=onValue(ref(`games/${c}/inputs`),s=>Object.entries(s.val()||{}).forEach(([u,v])=>{
  const i=I[u];if(!i||i.bot||seen[u]===v)return;seen[u]=v;const a=String(v).split(",").map(Number);
  if(Number.isFinite(a[0]))i.mx=Math.max(-1,Math.min(1,a[0]));if(Number.isFinite(a[1]))i.mz=Math.max(-1,Math.min(1,a[1]));
  if(Number.isFinite(a[2])){const d=a[2]-i.j;if(d>0)i.jn=Math.min(3,i.jn+d);i.j=a[2]}
  if(Number.isFinite(a[3])){const d=a[3]-i.s;if(d>0)i.sn=Math.min(2,i.sn+d);i.s=a[3]}
 }));
 /* Bots : visent la case la moins coûteuse de la prochaine rangée, sautent / plongent au bon moment, avec une part d'erreur */
 const pen=v=>v===0?0:v===2?3.4:v===3?9:v===12?2.2:2.8;
 const ai=(q,i)=>{
  if(t<i.nt)return;i.nt=t+.06+Math.random()*.06;
  let w=null,dist=99;for(const v of walls){const d=v.z-D/2-(q.z+RAD);if(d>-.7&&d<dist){dist=d;w=v}}
  i.mz=Math.max(-1,Math.min(1,(-1.2-q.z)*.9));
  if(q.g&&q.y>.05){   // sur un bloc : on traverse vers l'arrière du mur, rangée par rangée (obby : choisit le pilier suivant, saute au bon moment)
   i.mz=1;let cr=null,cd=9,nx=null;
   for(const v of walls){const d=Math.abs(v.z-q.z);if(d<cd){cd=d;cr=v}}
   if(cr)for(const v of walls){if(v.z>cr.z+.5&&v.z<cr.z+1.6&&(!nx||v.z<nx.z))nx=v}
   if(!nx){i.mx=Math.max(-1,Math.min(1,-q.x*.4));return}
   const cur=q.y;let bc=1e9,bk=0;
   for(let k=0;k<N;k++){const hv=nx.row[k]%10,cx=colX(k)+nx.ox;if(Math.abs(cx-q.x)>3.2)continue;
    const cst=Math.abs(cx-q.x)*.9+(hv?(hv-cur>1.45?8:0):6)+(Math.abs(colX(k))>HX-1.2?1.5:0)+Math.random()*(1-i.sk)*2.2;if(cst<bc){bc=cst;bk=k}}
   const tx=colX(bk)+nx.ox,hv=nx.row[bk]%10;i.mx=Math.max(-1,Math.min(1,(tx-q.x)*3.2));
   if(i.od!==nx.id){i.od=nx.id;i.ok=Math.random()<.72+.28*i.sk}
   const gap=nx.z-D/2-(q.z+RAD);
   if(i.ok&&hv&&hv>cur+.25&&gap<.75&&Math.abs(tx-q.x)<.6)i.jn=Math.max(i.jn,1);
   return}
  if(!w||dist>8){i.mx=Math.max(-1,Math.min(1,-q.x*.5));return}
  dist=Math.max(0,dist);
  if(i.tw!==w.id||(w.mv&&t>i.rp)){i.rp=t+.3;
   i.tw=w.id;const w2=walls.find(v=>v!==w&&v.z>w.z&&v.z-w.z<3.4);let bc=1e9;
   for(let k=0;k<N;k++){let cst=Math.abs(colX(k)+w.ox-q.x)*.8+pen(w.row[k])+(w2?pen(w2.row[k])*.45:0)+(Math.abs(colX(k))>HX-1?1.5:0)+Math.random()*(1-i.sk)*3.2;if(cst<bc){bc=cst;i.tk=k}}
  }
  const tx=colX(i.tk)+w.ox,v=w.row[i.tk];i.mx=Math.max(-1,Math.min(1,(tx-q.x)*3));
  if(Math.abs(tx-q.x)>.5||!v)return;
  const ok=Math.random()<.55+.45*i.sk;
  if(v===2){if(q.g&&dist<1.1+speed*.22&&i.done!==w.id){i.done=w.id;if(ok)i.jn=1;i.dj=ok}else if(i.dj&&q.jc===1&&!q.g&&q.vy<2&&dist<3){i.dj=false;i.jn=1}}
  else if(v>=10&&dist<.7+speed*.1&&q.cd<=0&&i.done!==w.id){i.done=w.id;if(ok){i.mx=0;i.mz=1;i.sn=1}}
 };
 for(let n=3;n>0;n--){
  if(n===3)step0();
  await pub({cd:n});await new Promise(r=>setTimeout(r,1000));if(getCode()!==c){inputUn();return}
 }
 function step0(){nd=8.2+spawn()}
 let last=performance.now(),acc=0,raf=0;
 const step=()=>{
  t+=DT;if(sg>0)sg-=DT;
  let nl=1;while(nl<8&&t>=LVT[nl])nl++;if(nl!==lv){lv=nl;GS=LV[nl-1].gs}   // changement de palier
  const L=LV[lv-1],bs=Math.min(8,3.8+t*.045),en=sg>0?Math.min(1,(4-sg)*2,sg*2):0;speed=bs*(1+Math.min(.3,.12+.03*lv)*Math.max(0,en));   // montée en vitesse + « accélérations » ponctuelles
  trav+=speed*DT;                                                                                          // les vagues sont espacées en DISTANCE (écart constant même quand ça accélère)
  if(trav>=nd){
   if(L.sp&&t>=sgn&&sg<=0&&Math.random()<L.sp){sg=4;sgn=t+Math.max(8,16-lv)}
   let ex=spawn();if(L.ch&&Math.random()<L.ch){const cg=Math.max(lastP>=16?5.5:3.8,L.gap-.8);ex+=cg+spawn(ex+cg)}   // vague double
   nd=trav+L.gap+ex}
  for(const w of walls){w.z-=speed*DT;if(w.mv){w.age+=DT;const a=w.mv.ph+w.age*w.mv.s;w.ox=w.mv.a*Math.sin(a);w.vo=w.mv.a*w.mv.s*Math.cos(a)}}
  for(let k=walls.length-1;k>=0;k--)if(walls[k].z<EXITZ)walls.splice(k,1);
  for(const u of ids){
   const q=P[u],i=I[u];
   if(!q.a){if(q.y>-12){q.vy-=G*DT*.9;q.y+=q.vy*DT;q.x+=q.vx*DT;q.z+=q.vz*DT}continue}
   if(i.bot)ai(q,i);
   q.dv=Math.max(0,q.dv-DT);q.cd=Math.max(0,q.cd-DT);q.sl=Math.max(0,q.sl-DT);q.cy=Math.max(0,q.cy-DT);q.pu=Math.max(0,q.pu-DT);
   let mx=i.mx,mz=i.mz;const l=Math.hypot(mx,mz);if(l>1){mx/=l;mz/=l}
   while(i.jn>0&&q.dv<=0){i.jn--;if(q.g||q.cy>0){q.vy=JV;q.g=0;q.cy=0;q.jc=1}else if(q.jc<2){q.vy=DJV;q.jc=2}}   // saut, puis double saut en l'air
   while(i.sn>0){i.sn--;if(q.dv<=0&&q.cd<=0){q.dv=.38;q.cd=.8;q.sl=.35;let dx=mx,dz=mz;const ll=Math.hypot(dx,dz);if(ll<.25){dx=0;dz=1}else{dx/=ll;dz/=ll}q.ddx=dx;q.ddz=dz;q.vy=Math.max(q.vy,q.g||q.cy>0?4.2:1.5);q.g=0;q.cy=0}}   // plongeon
   if(q.dv>0){q.vx=q.ddx*DIVE;q.vz=q.ddz*DIVE}
   else{const k=q.g?.6:.3,f=q.sl>0?.6:1;q.vx+=(mx*RUN*f-q.vx)*k;q.vz+=(mz*RUN*f-q.vz)*k}
   q.x+=(q.vx+q.kx)*DT;q.z+=(q.vz+q.kz)*DT;q.kx*=.86;q.kz*=.86;q.vy-=G*DT;q.y+=q.vy*DT;
   /* collisions avec les blocs */
   let stand=-99;
   for(const w of walls){
    if(Math.abs(q.z-w.z)>=D/2+RAD+.05)continue;
    for(let k=0;k<N;k++){
     const v=w.row[k];if(!v)continue;const h=v%10,cx=colX(k)+w.ox;if(Math.abs(q.x-cx)>=.5+RAD)continue;
     if(q.y>=h-.3){if(h>stand)stand=h;continue}                          // pieds au niveau du dessus (même en montée) : on grimpe, on n'est plus repoussé
     if(v>=10&&q.dv>0){w.row[k]=0;continue}                              // bloc fissuré brisé par le plongeon
     const pf=q.z+RAD-(w.z-D/2),pb=w.z+D/2-(q.z-RAD),pl=q.x+RAD-(cx-.5),pr=cx+.5-(q.x-RAD),m=Math.min(pf,pb,pl,pr);
     if(m===pf){q.z=w.z-D/2-RAD;if(q.vz>-speed)q.vz=-speed;q.pu=.25}      // poussé / traîné par le mur
     else if(m===pb){q.z=w.z+D/2+RAD;if(q.vz<0)q.vz=0}
     else if(m===pl){q.x=cx-.5-RAD;if(q.vx>0)q.vx=0}
     else{q.x=cx+.5+RAD;if(q.vx<0)q.vx=0}
    }
   }
   const fl=Math.abs(q.x)<=HX&&q.z>=-HZ&&q.z<=HZ?0:-99,gh=Math.max(fl,stand);q.g=0;q.cs=0;
   if(gh>-99&&q.y<=gh+.001&&q.vy<=0){q.y=gh;q.vy=0;q.g=1;q.jc=0;q.cy=.1;if(stand>fl){q.z-=speed*DT;q.cs=speed}}
   if(gh<=-99&&q.y<-.2){q.a=0;q.td=t;q.vx*=.6;q.vz*=.6;elim.push({n:q.n,t})}                      // hors plateforme : chute dans le slime
  }
  /* bousculades : les joueurs ne se traversent plus ; un plongeon qui touche un rival l'éjecte */
  for(let a=0;a<ids.length;a++){const p=P[ids[a]];if(!p.a)continue;
   for(let b=a+1;b<ids.length;b++){const o=P[ids[b]];if(!o.a||Math.abs(p.y-o.y)>.9)continue;
    let dx=o.x-p.x,dz=o.z-p.z,d=Math.hypot(dx,dz);if(d>=RAD*2)continue;
    if(d<.001){dx=Math.random()-.5;dz=Math.random()-.5;d=Math.hypot(dx,dz)||1}
    const nx=dx/d,nz=dz/d,ov=(RAD*2-d)/2;
    p.x-=nx*ov;p.z-=nz*ov;o.x+=nx*ov;o.z+=nz*ov;p.kx-=nx*1.5;p.kz-=nz*1.5;o.kx+=nx*1.5;o.kz+=nz*1.5;
    const ko=(s,v)=>{if(s.dv>0&&v.dv<=0&&t-v.ht>.6){v.ht=t;v.kx=s.ddx*14;v.kz=s.ddz*14;v.pu=.35;v.vy=Math.max(v.vy,3.2);v.g=0;v.cy=0}};
    ko(p,o);ko(o,p);
   }}
  const alive=ids.filter(u=>P[u].a);
  if(alive.length<=1||t>240){
   ended=true;
   const srt=ids.slice().sort((a,b)=>P[b].td-P[a].td),win=alive[0]||(srt.length>1&&P[srt[0]].td-P[srt[1]].td>.05?srt[0]:null);
   const rk=[...alive,...ids.filter(u=>!P[u].a).sort((a,b)=>P[b].td-P[a].td)];
   pub({o:1,rk,msg:win?`🏆 ${P[win].n} remporte Block Dash !`:"Égalité, tout le monde est tombé !"});
   setTimeout(async()=>{if(getCode()!==c)return;const cp=(getLobby()||{}).players||{},up={status:"lobby"};ids.filter(u=>cp[u]).forEach(u=>up[`players/${u}/ready`]=u===getMe().uid);try{await update(ref(`lobbies/${c}`),up);if(played)played("blockdash")}catch{}},6500);
   return;
  }
  if(++pubN%2===0)pub();
 };
 const loop=now=>{if(getCode()!==c||ended){inputUn();return}acc+=Math.min(.08,(now-last)/1000);last=now;while(acc>=DT){step();acc-=DT}if(!ended)raf=requestAnimationFrame(loop)};
 raf=requestAnimationFrame(loop);
}

/* ───────────────────────────── CLIENT : rendu 3D ───────────────────────────── */
export function createBlockDashClient(env){
 const {R:ref,set,onValue,getMe,$}=env,cv=$("cv"),x=cv.getContext("2d"),ov=$("ov"),help=$("ghelp");
 let active=false,un=()=>{},raf=0,state=null,snapT=0,me="",code="",jump=0,dive=0,last="",lastSend=0,tm=0,lastT=0,joy=null,rowsPrev=new Map(),shk=0,lvSeen=0,lvT=0;
 let kc=0;const keys=new Map(),btn=new Map(),rend=new Map(),parts=[],cam={x:0,y:9.6,z:-14.2,p:.5};
 const FOC=520,CY=225,NEAR=.4,cp=Math.cos(cam.p),sp=Math.sin(cam.p),BJ={x:712,y:462,r:58},BD={x:596,y:500,r:44},PAL=[[335,85,60],[190,85,52],[40,95,58],[268,70,64],[150,70,48]];
 /* ---- entrées ---- */
 const vec=()=>{
  const ax=(a,b)=>keys.has(a)&&keys.has(b)?(keys.get(a)>keys.get(b)?1:-1):(keys.has(a)?1:0)-(keys.has(b)?1:0);
  let kx=ax("R","L"),kz=ax("U","B");
  if(kx||kz){const l=Math.hypot(kx,kz);return[kx/l,kz/l]}
  if(joy){const dx=joy.px-joy.ox,dy=joy.py-joy.oy,l=Math.hypot(dx,dy);if(l>8){const m=Math.min(1,l/42);return[dx/l*m,-dy/l*m]}}
  return[0,0];
 };
 const send=force=>{
  if(!active)return;const [a,b]=vec(),v=`${a.toFixed(2)},${b.toFixed(2)},${jump},${dive}`;if(v===last)return;
  const n=performance.now();if(!force&&n-lastSend<55){if(!tm)tm=setTimeout(()=>{tm=0;send()},60);return}
  last=v;lastSend=n;Promise.resolve(set(ref(`games/${code}/inputs/${me}`),v)).catch(()=>{});
 };
 const MV={ArrowUp:"U",KeyW:"U",ArrowDown:"B",KeyS:"B",ArrowLeft:"L",KeyA:"L",ArrowRight:"R",KeyD:"R"};    // e.code : marche aussi en AZERTY (ZQSD)
 const kd=e=>{if(!active)return;const m=MV[e.code];if(m){if(!keys.has(m))keys.set(m,++kc);e.preventDefault();return}
  if(e.code==="Space"){e.preventDefault();if(!e.repeat){jump++;send(true)}}
  else if(e.code==="ShiftLeft"||e.code==="ShiftRight"||e.code==="KeyX"||e.code==="KeyC"){e.preventDefault();if(!e.repeat){dive++;send(true)}}};
 const ku=e=>{const m=MV[e.code];if(m)keys.delete(m)};
 const blur=()=>{keys.clear();joy=null;btn.clear()};
 const toC=e=>{const r=cv.getBoundingClientRect();return[(e.clientX-r.left)*W/r.width,(e.clientY-r.top)*H/r.height]};
 const hit=(p,b)=>Math.hypot(p[0]-b.x,p[1]-b.y)<=b.r+10;
 const pd=e=>{if(!active||e.target.closest("button"))return;e.preventDefault();const p=toC(e);try{cv.setPointerCapture(e.pointerId)}catch{}
  if(hit(p,BJ)){btn.set(e.pointerId,"j");jump++;send(true)}else if(hit(p,BD)){btn.set(e.pointerId,"d");dive++;send(true)}
  else if(!joy&&p[0]<W*.55)joy={id:e.pointerId,ox:p[0],oy:p[1],px:p[0],py:p[1]}};
 const pm=e=>{if(joy&&joy.id===e.pointerId){const p=toC(e);joy.px=p[0];joy.py=p[1]}};
 const pu=e=>{btn.delete(e.pointerId);if(joy&&joy.id===e.pointerId)joy=null};
 /* ---- moteur 3D ---- */
 const cs=(px,py,pz)=>{const dx=px-cam.x,dy=py-cam.y,dz=pz-cam.z;return[dx,dy*cp+dz*sp,-dy*sp+dz*cp]};
 const sc=c=>[W/2+FOC*c[0]/c[2],CY-FOC*c[1]/c[2]];
 const clip=pts=>{const o=[];for(let i=0;i<pts.length;i++){const a=pts[i],b=pts[(i+1)%pts.length],ai=a[2]>=NEAR,bi=b[2]>=NEAR;if(ai)o.push(a);if(ai!==bi){const k=(NEAR-a[2])/(b[2]-a[2]);o.push([a[0]+(b[0]-a[0])*k,a[1]+(b[1]-a[1])*k,NEAR])}}return o};
 const poly3=(wp,fill,stroke,lw)=>{const c=clip(wp.map(p=>cs(p[0],p[1],p[2])));if(c.length<3)return;x.beginPath();c.forEach((p,i)=>{const s=sc(p);i?x.lineTo(s[0],s[1]):x.moveTo(s[0],s[1])});x.closePath();if(fill){x.fillStyle=fill;x.fill()}if(stroke){x.strokeStyle=stroke;x.lineWidth=lw||1;x.stroke()}};
 const line3=(a,b,col,lw)=>{let p=cs(a[0],a[1],a[2]),q=cs(b[0],b[1],b[2]);if(p[2]<NEAR&&q[2]<NEAR)return;
  if(p[2]<NEAR){const k=(NEAR-p[2])/(q[2]-p[2]);p=[p[0]+(q[0]-p[0])*k,p[1]+(q[1]-p[1])*k,NEAR]}else if(q[2]<NEAR){const k=(NEAR-q[2])/(p[2]-q[2]);q=[q[0]+(p[0]-q[0])*k,q[1]+(p[1]-q[1])*k,NEAR]}
  const s=sc(p),u=sc(q);x.strokeStyle=col;x.lineWidth=lw||1;x.beginPath();x.moveTo(s[0],s[1]);x.lineTo(u[0],u[1]);x.stroke()};
 const box=(x0,x1,y0,y1,z0,z1,top,fr,sd,ed)=>{
  if(cam.x<x0)poly3([[x0,y0,z0],[x0,y0,z1],[x0,y1,z1],[x0,y1,z0]],sd,ed);
  if(cam.x>x1)poly3([[x1,y0,z0],[x1,y1,z0],[x1,y1,z1],[x1,y0,z1]],sd,ed);
  if(cam.z<z0)poly3([[x0,y0,z0],[x1,y0,z0],[x1,y1,z0],[x0,y1,z0]],fr,ed);
  poly3([[x0,y1,z0],[x1,y1,z0],[x1,y1,z1],[x0,y1,z1]],top,ed);
 };
 const rounded=(a,b,w,h,r,fill,stroke)=>{x.beginPath();x.roundRect(a,b,w,h,r);x.fillStyle=fill;x.fill();if(stroke){x.strokeStyle=stroke;x.lineWidth=1.5;x.stroke()}};
 const hexc={},rgb=h=>hexc[h]||(hexc[h]=[1,3,5].map(i=>parseInt(String(h).slice(i,i+2),16)||180));
 const sh=(h,f)=>{const [r,g,b]=rgb(h),t=f>0?255:0,a=Math.abs(f);return`rgb(${Math.round(r+(t-r)*a)},${Math.round(g+(t-g)*a)},${Math.round(b+(t-b)*a)})`};
 /* ---- particules ---- */
 const burst=(px,py,pz,cols,n,sp0)=>{if(parts.length>320)return;for(let i=0;i<n;i++){const a=Math.random()*6.28,s=(sp0||3)*(.4+Math.random());parts.push({x:px,y:py,z:pz,vx:Math.cos(a)*s,vy:2+Math.random()*(sp0||3),vz:Math.sin(a)*s,l:.6+Math.random()*.5,c:cols[i%cols.length],s:.07+Math.random()*.07})}};
 const splash=(px,py,pz)=>burst(px,py,pz,["#ff7be5","#ffd1f7","#c14bff","#ffffff"],22,5);
 const dust=(r,n,s)=>burst(r.x,r.y+.05,r.z,["#ffffff","#e9d6ff","#c9a8ff"],n,s);
 /* ---- décor ---- */
 const background=now=>{
  const g=x.createLinearGradient(0,0,0,H);g.addColorStop(0,"#1d0b44");g.addColorStop(.5,"#3b1272");g.addColorStop(1,"#8a1f94");x.fillStyle=g;x.fillRect(-16,-16,W+32,H+32);
  for(let r=0;r<11;r++){const z=-14+r*5.5;let pr=null;x.lineWidth=2;x.strokeStyle=`rgba(255,160,255,${.1+.2*(1-r/11)})`;x.beginPath();
   for(let k=0;k<=22;k++){const wx=-44+k*4,wy=SLIME+Math.sin(wx*.35+now/700+r*1.7)*.35,c=cs(wx,wy,z);if(c[2]<NEAR){pr=null;continue}const s=sc(c);pr?x.lineTo(s[0],s[1]):x.moveTo(s[0],s[1]);pr=1}x.stroke()}
  for(let i=0;i<16;i++){const bx=((i*37)%60)-30,bz=-6+((i*53)%40),by=SLIME+.2+Math.abs(Math.sin(now/900+i))*.8,c=cs(bx,by,bz);if(c[2]<NEAR)continue;const s=sc(c),rr=Math.max(1.5,.28*FOC/c[2]);x.fillStyle="rgba(255,200,255,.18)";x.beginPath();x.arc(s[0],s[1],rr,0,7);x.fill();x.strokeStyle="rgba(255,255,255,.35)";x.lineWidth=1;x.stroke()}
 };
 const arena=()=>{
  box(-HX,HX,-1.4,0,-HZ,HZ,"#2c1660","#3b1d7c","#27124f","#a85cff");
  box(-HX,HX,-1,0,HZ,HZ+7,"#1e1238","#271650","#190e30","#6a3fb0");
  for(let r=0;r<2*HZ;r++)for(let k=0;k<N;k++)poly3([[-HX+k,0,-HZ+r],[-HX+k+1,0,-HZ+r],[-HX+k+1,0,-HZ+r+1],[-HX+k,0,-HZ+r+1]],(r+k)&1?"#4b2b93":"#3c2280");
  for(let k=0;k<N;k++)poly3([[-HX+k,.01,HZ],[-HX+k+1,.01,HZ],[-HX+k+1,.01,HZ+.7],[-HX+k,.01,HZ+.7]],k&1?"#ffd23f":"#1b1230");
  for(let r=0;r<=2*HZ;r++)line3([-HX,0,-HZ+r],[HX,0,-HZ+r],"rgba(214,170,255,.16)",1);
  for(let k=0;k<=N;k++)line3([-HX+k,0,-HZ],[-HX+k,0,HZ],"rgba(214,170,255,.16)",1);
  x.save();x.shadowBlur=14;x.shadowColor="#54f6e4";line3([-HX,0,-HZ],[HX,0,-HZ],"#54f6e4",4);x.shadowColor="#ed65ff";line3([-HX,0,-HZ],[-HX,0,HZ],"#ed65ff",3);line3([HX,0,-HZ],[HX,0,HZ],"#ed65ff",3);x.restore();
 };
 const gate=()=>{
  box(-HX-1.3,-HX-.3,0,4.3,GATEZ-.45,GATEZ+.45,"#4b3a7d","#3a2b66","#2c2050","#b58cff");
  box(HX+.3,HX+1.3,0,4.3,GATEZ-.45,GATEZ+.45,"#4b3a7d","#3a2b66","#2c2050","#b58cff");
  box(-HX-1.3,HX+1.3,3.7,4.5,GATEZ-.45,GATEZ+.45,"#5a4793","#3f2f70","#2c2050","#b58cff");
  x.save();x.shadowBlur=12;x.shadowColor="#ff4fd8";line3([-HX-.3,3.7,GATEZ-.46],[HX+.3,3.7,GATEZ-.46],"#ff4fd8",3);x.restore();
 };
 /* ---- blocs ---- */
 const crack=(id,k,cx,y0,h,z0)=>{const s=((id*7+k*13)%5)/10-.2,p=[[cx+s,y0+h-.06],[cx+s+.16,y0+h*.68],[cx+s-.1,y0+h*.45],[cx+s+.14,y0+h*.22],[cx+s,y0+.06]];
  for(let i=0;i<4;i++){line3([p[i][0],p[i][1],z0-.01],[p[i+1][0],p[i+1][1],z0-.01],"#2a1116",5);line3([p[i][0],p[i][1],z0-.01],[p[i+1][0],p[i+1][1],z0-.01],"#ffb347",2.4)}};
 const run=(id,k0,k1,v,wz,dy,ox,mvw,cg)=>{
  ox=ox||0;const h=v%10,ck=v>=10,x0=colX(k0)+ox-.5,x1=colX(k1)+ox+.5,z0=wz-D/2,z1=wz+D/2,y0=dy,y1=dy+h;let top,fr,sd;
  if(ck){top="#76629a";fr="#4e3f6c";sd="#382d50"}else{const [a,b,c]=cg===1?[218,92,52]:cg===2?[336,90,56]:mvw?[188,80,46]:PAL[id%PAL.length];top=`hsl(${a},${b}%,${c+14}%)`;fr=`hsl(${a},${b}%,${c}%)`;sd=`hsl(${a},${b}%,${c-14}%)`}
  box(x0,x1,y0,y1,z0,z1,top,fr,sd,"rgba(255,255,255,.5)");
  for(let k=k0;k<=k1;k++){const cx=colX(k)+ox;if(k>k0)line3([cx-.5,y0,z0],[cx-.5,y1,z0],"rgba(0,0,0,.28)",1.5);
   if(ck)crack(id,k,cx,y0,h,z0);else line3([cx-.34,y1-.13,z0],[cx+.34,y1-.13,z0],"rgba(255,255,255,.4)",2)}
  for(let j=1;j<h;j++)line3([x0,y0+j,z0],[x1,y0+j,z0],"rgba(0,0,0,.22)",1.5);
 };
 /* ---- personnages 3D ---- */
 const toW=(r,lx,ly,lz,pt)=>{const y0=ly-.45,yy=y0*Math.cos(pt)-lz*Math.sin(pt)+.45,zz=lz*Math.cos(pt)+y0*Math.sin(pt),cf=Math.cos(r.fa),sf=Math.sin(r.fa);return[r.x+lx*cf+zz*sf,r.y+yy,r.z-lx*sf+zz*cf]};
 const seg=(a,b,w,col,ox,oy)=>{x.strokeStyle=col;x.lineWidth=w;x.beginPath();x.moveTo(a[0]+(ox||0),a[1]+(oy||0));x.lineTo(b[0]+(ox||0),b[1]+(oy||0));x.stroke()};
 const sph=(p,r,col,rim)=>{const c=cs(p[0],p[1],p[2]);if(c[2]<NEAR)return;const s=sc(c),rr=r*FOC/c[2];x.fillStyle=rim||"#120a2acc";x.beginPath();x.arc(s[0],s[1],rr+1.6,0,7);x.fill();x.fillStyle=col;x.beginPath();x.arc(s[0],s[1],rr,0,7);x.fill();x.fillStyle="rgba(255,255,255,.28)";x.beginPath();x.arc(s[0]-rr*.3,s[1]-rr*.32,rr*.5,0,7);x.fill()};
 const cap=(a,b,r,col)=>{const ca=cs(a[0],a[1],a[2]),cb=cs(b[0],b[1],b[2]);if(ca[2]<NEAR||cb[2]<NEAR)return;const sa=sc(ca),sb=sc(cb),w=r*FOC/((ca[2]+cb[2])/2)*2;x.lineCap="round";seg(sa,sb,w+3.2,"#120a2acc");seg(sa,sb,w,col);seg(sa,sb,w*.4,"rgba(255,255,255,.24)",-w*.18,-w*.18);x.lineCap="butt"};
 const circle3=(px,py,pz,r,fill,stroke,lw)=>{const pts=[];for(let i=0;i<14;i++){const a=i/14*6.283;pts.push([px+Math.cos(a)*r,py,pz+Math.sin(a)*r])}poly3(pts,fill,stroke,lw)};
 const shadow=r=>{if(r.y<-.2)return;circle3(r.x,.03,r.z,.34*(1-Math.min(.45,r.y*.12)),"rgba(8,3,26,.4)")};
 const char=r=>{
  const c=r.c||"#42e8c4",dark=sh(c,-.3),light=sh(c,.22),skin="#ffdcbc",mv=Math.min(1,r.sp/4),s1=Math.sin(r.ph)*mv,s2=-s1,air=r.st===1,dv=r.st===2,pu=r.st===3,pt=r.pt,W3=(a,b,d)=>toW(r,a,b,d,pt),ps=[];
  const add=(t,a,b,rad,col)=>{const m=b?cs((a[0]+b[0])/2,(a[1]+b[1])/2,(a[2]+b[2])/2):cs(a[0],a[1],a[2]);ps.push({t,a,b,rad,col,d:m[2]})};
  [-1,1].forEach((sd,i)=>{const sw=i?s2:s1,lift=Math.max(0,sw)*.1+(air?.12:0);add("c",W3(sd*.13,.45,0),W3(sd*.13,.1+lift,dv?-.2:sw*.3),.1,dark)});
  add("c",W3(0,.5,0),W3(0,.86,0),.27,c);
  [-1,1].forEach((sd,i)=>{const sw=i?s2:s1;let hy=.52,hz=-sw*.3;if(air){hy=1;hz=.05}if(dv){hy=.95;hz=.55}if(pu){hy=.9;hz=-.2}add("c",W3(sd*.3,.82,0),W3(sd*.38,hy,hz),.085,c)});
  add("s",W3(0,1.15,.02),null,.27,skin);add("s",W3(0,1.3,-.07),null,.21,light);
  ps.sort((a,b)=>b.d-a.d);ps.forEach(p=>p.t==="c"?cap(p.a,p.b,p.rad,p.col):sph(p.a,p.rad,p.col));
  if(Math.cos(r.fa)<-.15&&!dv)[-1,1].forEach(sd=>{sph(W3(sd*.1,1.16,.25),.065,"#fff","#120a2a88");sph(W3(sd*.1,1.16,.29),.032,"#1b1236","#0000")});
 };
 /* ---- image ---- */
 const fmt=s=>Math.floor(s/60)+":"+String(Math.floor(s%60)).padStart(2,"0");
 function frame(now){
  if(!active)return;raf=requestAnimationFrame(frame);
  const dt=Math.min(.05,Math.max(.001,(now-lastT)/1000||.016));lastT=now;send();
  const k0=cv.width/W,k1=cv.height/H;
  const S=state,ex=S&&!S.o?Math.min(.3,(now-snapT)/1000):0,pl=S?S.p:[];
  pl.forEach(t=>{
   let r=rend.get(t[0]);if(!r){r={x:t[1],y:t[2],z:t[3],fa:0,pt:0,ph:0,sp:0,fell:0,lt:0};rend.set(t[0],r)}
   /* position cible = dernier état reçu + vitesse × temps écoulé (extrapolation) → plus de « retard » ni d'effet élastique */
   const k=1-Math.exp(-dt*(t[0]===me?26:17)),ox=r.x,oz=r.z,e2=Math.min(.22,ex),tx=t[1]+(t[8]||0)*e2,tz=t[3]+(t[9]||0)*e2;
   if(Math.abs(tx-r.x)>3||Math.abs(tz-r.z)>3){r.x=tx;r.z=tz}else{r.x+=(tx-r.x)*k;r.z+=(tz-r.z)*k}
   r.y+=(t[2]-r.y)*Math.min(1,k*1.4);
   const vx=(r.x-ox)/dt,vz=(r.z-oz)/dt;r.sp+=(Math.hypot(vx,vz)-r.sp)*.25;r.a=t[4];const pst=r.st;r.st=t[5];r.c=t[6];r.n=t[7];
   if(r.a){r.ph+=r.sp*dt*2.1;if(r.sp>.9&&r.st!==3){let d=Math.atan2(vx,vz)-r.fa;d=Math.atan2(Math.sin(d),Math.cos(d));r.fa+=d*Math.min(1,dt*12)}
    r.pt+=((r.st===2?1.15:r.st===3?-.3:r.st===1?.12:0)-r.pt)*Math.min(1,dt*14)}else r.pt+=dt*6;
   if(r.a&&r.y>SLIME+.4&&pst!==undefined){   // effets : poussière, impacts, traînée de plongeon
    if((pst===0||pst===3)&&r.st===1)dust(r,6,1.7);
    else if((pst===1||pst===2)&&(r.st===0||r.st===3))dust(r,9,2.4);
    if(r.st===2&&pst!==2)dust(r,10,2.8);
    if(r.st===3&&pst!==3&&t[0]===me)shk=Math.max(shk,.8);
    if(r.st===2&&now-r.lt>40){burst(r.x,r.y+.3,r.z,["#ffffff","#ffd1f7"],2,1.4);r.lt=now}
    else if(r.st===0&&r.sp>3.5&&now-r.lt>130){dust(r,2,1);r.lt=now}
   }
   if(r.y<SLIME+.4&&!r.fell){r.fell=1;splash(r.x,SLIME,r.z)}
  });
  const mr=rend.get(me);cam.x+=((mr&&mr.a?Math.max(-2.6,Math.min(2.6,mr.x*.45)):0)-cam.x)*(1-Math.exp(-dt*3));
  if(S&&S.lv&&!S.o&&S.lv>lvSeen){if(lvSeen)shk=Math.max(shk,.4);lvSeen=S.lv;lvT=now}
  shk=Math.max(0,shk-dt*2.2);if(S&&S.sg&&!S.o)shk=Math.max(shk,.1);const sa=shk*7;
  x.setTransform(k0,0,0,k1,(sa?(Math.random()-.5)*2*sa:0)*k0,(sa?(Math.random()-.5)*2*sa:0)*k1);   // tremblement d'écran (monde seulement, pas l'interface)
  background(now);arena();
  /* ombres */ rend.forEach((r,u)=>{if(r.fell===0||r.y>SLIME+.4)shadow(r)});
  /* objets triés de l'arrière vers l'avant */
  const items=[{z:GATEZ+.45+RAD,dx:0,f:gate}];
  if(S)S.walls.forEach(w=>{
   const wz=w[1]-(S.v||0)*ex,row=w[2],wox=(w[3]||0)+(w[4]||0)*Math.min(.2,ex),mvw=w[5];let dy=0;if(wz<-HZ-.4){const d=-HZ-.4-wz;dy=-d*d*2.4}if(dy<-13)return;
   for(let k=0;k<N;){const v=row[k];if(!v){k++;continue}let e=k;while(e+1<N&&row[e+1]===v)e++;const k0=k,e0=e;
    items.push({z:wz+D/2+RAD,dx:Math.abs(colX((k0+e0)/2)+wox-cam.x),f:()=>run(w[0],k0,e0,v,wz,dy,wox,mvw,w[6])});k=e+1}
  });
  pl.forEach(t=>{const r=rend.get(t[0]);if(r&&r.y>SLIME+.4)items.push({z:r.z,dx:Math.abs(r.x-cam.x),f:()=>char(r)})});
  items.sort((a,b)=>b.z-a.z||b.dx-a.dx);items.forEach(it=>it.f());
  /* repère du joueur + noms */
  rend.forEach((r,u)=>{if(r.y<SLIME+.4)return;if(u===me&&r.a){x.save();x.shadowBlur=10;x.shadowColor="#fff";circle3(r.x,.04,r.z,.55,null,"#ffffffcc",2.5);x.restore()}
   const c=cs(r.x,r.y+1.75,r.z);if(c[2]<NEAR)return;const s=sc(c),fs=Math.max(9,Math.min(14,260/c[2]));x.font=`700 ${fs}px system-ui`;x.textAlign="center";
   if(u===me&&r.a){x.fillStyle="#54f6e4";x.beginPath();x.moveTo(s[0]-6,s[1]-fs-9);x.lineTo(s[0]+6,s[1]-fs-9);x.lineTo(s[0],s[1]-fs-1);x.fill()}
   x.lineWidth=3;x.strokeStyle="#120a2acc";x.strokeText(r.n||"",s[0],s[1]-fs*.4);x.fillStyle=r.a?"#fff":"#ffffff88";x.fillText(r.n||"",s[0],s[1]-fs*.4);x.textAlign="left"});
  /* particules */
  for(let i=parts.length-1;i>=0;i--){const p=parts[i];p.l-=dt;if(p.l<=0||p.y<SLIME-1){parts.splice(i,1);continue}p.vy-=16*dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.z+=p.vz*dt;
   const c=cs(p.x,p.y,p.z);if(c[2]<NEAR)continue;const s=sc(c),rr=Math.max(1.2,p.s*FOC/c[2]);x.globalAlpha=Math.min(1,p.l*2.5);x.fillStyle=p.c;x.fillRect(s[0]-rr,s[1]-rr,rr*2,rr*2);x.globalAlpha=1}
  if(S&&S.sg&&!S.o){x.save();x.lineWidth=2;for(let i=0;i<22;i++){const a=i*2.399,rr=140+((now*.9+i*131)%360),l=40+((i*57)%60);x.strokeStyle=`rgba(255,255,255,${.1+.05*(i%3)})`;x.beginPath();x.moveTo(W/2+Math.cos(a)*rr*1.5,CY+Math.sin(a)*rr*.9);x.lineTo(W/2+Math.cos(a)*(rr+l)*1.5,CY+Math.sin(a)*(rr+l)*.9);x.stroke()}x.restore()}   // lignes de vitesse
  x.setTransform(k0,0,0,k1,0,0);
  hud(now,S,mr);
  const rk=S&&S.o&&S.rk?S.rk.indexOf(me)+1:0;ov.textContent=S?(S.o?(S.msg||"Fin de partie")+(rk?` · Tu finis ${rk}${rk===1?"er":"e"} sur ${S.p.length}`:""):S.cd?String(S.cd):""):"";
 }
 function hud(now,S,mr){
  const al=S?S.p.filter(q=>q[4]).length:0,me2=S&&S.p.find(q=>q[0]===me);
  if(mr&&mr.a&&S&&!S.o&&(Math.abs(mr.x)>HX-1.2||mr.z<-HZ+1.2||mr.z>HZ-1.2)){x.fillStyle=`rgba(255,60,90,${.1+.07*Math.sin(now/90)})`;x.fillRect(0,0,W,16);x.fillRect(0,H-16,W,16);x.fillRect(0,0,16,H);x.fillRect(W-16,0,16,H)}
  rounded(18,16,210,58,13,"#120b2ddd","#ffffff33");x.fillStyle="#fff";x.font="900 23px system-ui";x.fillText("BLOCK DASH",32,43);x.fillStyle="#d9baff";x.font="700 11px system-ui";x.fillText("VAGUE "+(S?S.w:0)+" · "+(S?fmt(S.t):"0:00"),34,62);
  rounded(650,16,132,58,13,"#120b2ddd","#ffffff33");x.fillStyle="#d9baff";x.font="700 10px system-ui";x.fillText("SURVIVANTS",664,36);x.fillStyle="#fff";x.font="900 22px system-ui";x.fillText(al+" / "+(S?S.p.length:0),664,62);
  rounded(18,87,380,34,10,"#120b2dcc","#ffffff33");x.font="11px system-ui";x.fillStyle="#ff8ab4";x.fillText("■ MUR : 2 sauts",30,109);x.fillStyle="#ffcf62";x.fillText("■ HAUT : un trou",120,109);x.fillStyle="#9b86c4";x.fillText("■ FISSURÉ : plonge",213,109);x.fillStyle="#4fd8ee";x.fillText("■ MOBILE",312,109);x.fillStyle="#6aa8ff";x.fillText("■ OBBY",368,109);
  if(me2&&!me2[4]&&S&&!S.o){rounded(280,16,240,34,14,"#3a0c2aee","#ff7be5");x.fillStyle="#fff";x.font="800 14px system-ui";x.textAlign="center";x.fillText("💦 Éliminé — tu regardes la suite",400,38);x.textAlign="left"}
  if(S&&S.lv&&!S.o){rounded(18,126,150,20,9,"#120b2dcc","#ffffff33");x.fillStyle="#7be7ff";x.font="800 10px system-ui";x.fillText("PALIER "+S.lv+" / 8",28,139);x.fillStyle="#ffffff22";x.fillRect(100,133,56,4);x.fillStyle="#7be7ff";x.fillRect(100,133,56*(S.lp||0),4)}
  if(S&&!S.o&&lvSeen&&now-lvT<3600){const a=Math.max(0,Math.min(1,(3600-(now-lvT))/600,(now-lvT)/200)),nm=LNM[Math.min(7,lvSeen-1)];x.globalAlpha=a;rounded(190,150,420,66,16,"#120b2df0","#7be7ff88");x.textAlign="center";x.fillStyle="#7be7ff";x.font="800 12px system-ui";x.fillText("PALIER "+lvSeen+" / 8",400,172);x.fillStyle="#fff";x.font="900 22px system-ui";x.fillText(nm[0],400,196);x.fillStyle="#d9baff";x.font="600 12px system-ui";x.fillText(nm[1],400,212);x.textAlign="left";x.globalAlpha=1}
  if(S&&S.el&&!S.o){let li=0;S.el.forEach(e=>{if(e[1]>4)return;x.globalAlpha=Math.max(0,Math.min(1,(4-e[1])*1.5));rounded(640,84+li*26,142,22,8,"#3a0c2acc","#ff7be566");x.fillStyle="#ffd1f7";x.font="600 11px system-ui";x.fillText("💦 "+String(e[0]).slice(0,14),650,99+li*26);x.globalAlpha=1;li++})}
  if(S&&S.sg&&!S.o){rounded(290,56,220,30,14,`rgba(255,106,43,${.78+.2*Math.sin(now/80)})`,"#ffd9a8");x.fillStyle="#fff";x.font="800 14px system-ui";x.textAlign="center";x.fillText("⚡ ACCÉLÉRATION !",400,76);x.textAlign="left"}
  if(S&&S.t<7&&!S.o){rounded(130,518,540,32,14,"#120b2ddd","#ffffff33");x.fillStyle="#f1eaff";x.font="600 11px system-ui";x.textAlign="center";x.fillText("Passe par les trous · double saut sur les murs de 2 · plonge dans les fissurés · bouscule les rivaux",400,538);x.textAlign="left"}
  /* commandes tactiles */
  const pj=[...btn.values()].includes("j"),pd2=[...btn.values()].includes("d");
  [[BJ,"SAUT",pj],[BD,"PLONGE",pd2]].forEach(([b,l,on])=>{x.beginPath();x.arc(b.x,b.y,b.r,0,7);x.fillStyle=on?"#ffffff55":"#120b2d99";x.fill();x.strokeStyle=on?"#fff":"#ffffff66";x.lineWidth=3;x.stroke();x.fillStyle="#fff";x.font="800 13px system-ui";x.textAlign="center";x.fillText(l,b.x,b.y+5);x.textAlign="left"});
  if(joy){x.beginPath();x.arc(joy.ox,joy.oy,42,0,7);x.strokeStyle="#ffffff55";x.lineWidth=3;x.stroke();const dx=joy.px-joy.ox,dy=joy.py-joy.oy,l=Math.hypot(dx,dy),m=l>42?42/l:1;x.beginPath();x.arc(joy.ox+dx*m,joy.oy+dy*m,20,0,7);x.fillStyle="#ffffffaa";x.fill()}
 }
 return {enter(c){
  active=true;code=c;me=getMe().uid;jump=0;dive=0;last="";lastSend=0;state=null;joy=null;parts.length=0;rend.clear();rowsPrev=new Map();keys.clear();btn.clear();cam.x=0;shk=0;lvSeen=0;lvT=0;
  help.textContent="Déplace-toi : ZQSD / flèches (ou glisse) · Espace : saut (2× = double saut) · Maj / X : plongeon (brise les blocs fissurés et fait voler les rivaux)";
  Promise.resolve(set(ref(`games/${c}/inputs/${me}`),"0.0,0.0,0,0")).catch(()=>{});
  un=onValue(ref(`games/${c}/state`),s=>{const v=s.val();if(!v)return;try{const q=JSON.parse(v);if(q.k!=="blockdash")return;
   const nr=new Map();q.walls.forEach(w=>{nr.set(w[0],w[2].slice());const pv=rowsPrev.get(w[0]);if(pv)for(let k=0;k<N;k++)if(pv[k]>=10&&!w[2][k]){burst(colX(k)+(w[3]||0),(pv[k]%10)/2,w[1],["#ffb347","#6f5c8f","#ffffff"],14,3.5);const m=rend.get(me);if(m&&Math.hypot(m.x-colX(k)-(w[3]||0),m.z-w[1])<4)shk=Math.max(shk,.45)}});
   rowsPrev=nr;state=q;snapT=performance.now()}catch{}});
  addEventListener("keydown",kd);addEventListener("keyup",ku);addEventListener("blur",blur);
  cv.style.touchAction="none";cv.addEventListener("pointerdown",pd);cv.addEventListener("pointermove",pm);cv.addEventListener("pointerup",pu);cv.addEventListener("pointercancel",pu);cv.addEventListener("lostpointercapture",pu);
  lastT=performance.now();raf=requestAnimationFrame(frame);
  return()=>{active=false;un();cancelAnimationFrame(raf);clearTimeout(tm);tm=0;removeEventListener("keydown",kd);removeEventListener("keyup",ku);removeEventListener("blur",blur);
   cv.removeEventListener("pointerdown",pd);cv.removeEventListener("pointermove",pm);cv.removeEventListener("pointerup",pu);cv.removeEventListener("pointercancel",pu);cv.removeEventListener("lostpointercapture",pu);cv.style.touchAction="";
   joy=null;btn.clear();keys.clear();ov.textContent="";help.textContent=""}
 }};
}
