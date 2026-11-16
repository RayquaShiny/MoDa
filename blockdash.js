/* MoDa — Block Dash : course multijoueur sur plateforme suspendue. */
const W=800,H=560,LANES=5,DT=1/30;
export async function startBlockDash(env){
 const {R,set,update,remove,onValue,getCode,getLobby,getMe,bots,played}=env,c=getCode(),lob=getLobby()||{},players=bots?bots(lob):lob.players||{},ids=Object.keys(players);
 if(ids.length<2)return env.toast("Block Dash se joue à au moins 2 joueurs.");
 await remove(R(`games/${c}`));await update(R(`lobbies/${c}`),{status:"playing"});
 const P={},I={},seen={},rows=[];ids.forEach((u,i)=>{P[u]={n:players[u].name,c:players[u].color,x:2,a:1,d:0,j:0,s:0};I[u]={x:2,j:0,s:0}});
 let t=0,speed=105,next=0,rid=0,pubN=0,ended=false,un=()=>{};
 const makeRow=()=>{let a=Array(LANES).fill(0),pattern=Math.floor(Math.random()*4);
   if(pattern===0){let gap=Math.floor(Math.random()*LANES);a=a.map((_,i)=>i===gap?0:1)}
   if(pattern===1){let gap=Math.floor(Math.random()*LANES);a=a.map((_,i)=>i===gap?0:(Math.random()<.28?0:2))}
   if(pattern===2){let gap=Math.floor(Math.random()*LANES),cr=Math.floor(Math.random()*LANES);a=a.map((_,i)=>i===gap?0:i===cr?3:1)}
   if(pattern===3){let gaps=[Math.floor(Math.random()*LANES)];if(Math.random()<.5)gaps.push((gaps[0]+1+Math.floor(Math.random()*3))%LANES);a=a.map((_,i)=>gaps.includes(i)?0:(Math.random()<.35?2:1))}
   return{id:++rid,z:760,a};
 };
 const pub=extra=>set(R(`games/${c}/state`),JSON.stringify({k:"blockdash",t:+t.toFixed(1),v:+speed.toFixed(1),rows:rows.map(r=>[r.id,+r.z.toFixed(1),r.a]),p:ids.map(u=>{let q=P[u];return[u,q.x,q.a,+q.d.toFixed(1),q.j>0?1:0,q.s>0?1:0] }),...extra}));
 const inputUn=onValue(R(`games/${c}/inputs`),s=>Object.entries(s.val()||{}).forEach(([u,v])=>{if(!I[u]||seen[u]===v)return;seen[u]=v;let a=String(v).split(","),x=+a[0],j=+a[1],sm=+a[2];if(Number.isFinite(x))I[u].x=Math.max(0,Math.min(4,Math.round(x)));if(j!==I[u].j)I[u].wantJ=.3;if(sm!==I[u].s)I[u].wantS=.3;I[u].j=j;I[u].s=sm}));
 for(let i=0;i<5;i++){rows.push(makeRow());rows[i].z=170+i*145}
 for(let n=3;n>0;n--){await pub({cd:n});await new Promise(r=>setTimeout(r,1000));if(getCode()!==c){inputUn();return}}
 let last=performance.now(),acc=0,raf=0;
 const step=()=>{
  if(getCode()!==c||ended){cancelAnimationFrame(raf);inputUn();return}
  t+=DT;speed=Math.min(245,105+t*1.45);
  if(t>=next){rows.push(makeRow());next=t+Math.max(.72,1.55-t*.006)}
  rows.forEach(r=>{let old=r.z;r.z-=speed*DT;if(old>85&&r.z<=85)ids.forEach(u=>{let q=P[u];if(!q.a)return;let typ=r.a[q.x];if(typ===0)return;if(typ===2&&q.j>0)return;if(typ===3&&q.s>0){r.a[q.x]=0;return}q.a=0})});
  rows.splice(0,rows.filter(r=>r.z<-35).length);
  ids.forEach(u=>{let q=P[u],i=I[u];if(!q.a)return;
   q.x=i.x;
   if(i.wantJ>0){i.wantJ-=DT;q.j=.72;i.wantJ=0}
   if(i.wantS>0){i.wantS-=DT;q.s=.28;i.wantS=0}
   q.j=Math.max(0,q.j-DT);q.s=Math.max(0,q.s-DT);q.d+=speed*DT;
  });
  const alive=ids.filter(u=>P[u].a);
  if(alive.length<=1||t>90){ended=true;let win=alive.sort((a,b)=>P[b].d-P[a].d)[0];pub({o:1,msg:win?`🏆 ${P[win].n} remporte Block Dash !`:"Tout le monde est tombé !"});setTimeout(async()=>{if(getCode()!==c)return;let cp=(getLobby()||{}).players||{},up={status:"lobby"};ids.filter(u=>cp[u]).forEach(u=>up[`players/${u}/ready`]=u===getMe().uid);try{await update(R(`lobbies/${c}`),up);if(played)played("blockdash")}catch{}},6500);return}
  pubN++;if(pubN%2===0)pub();
 };
 const loop=now=>{if(getCode()!==c||ended){inputUn();return}acc+=Math.min(.08,(now-last)/1000);last=now;while(acc>=DT){step();acc-=DT}if(!ended)raf=requestAnimationFrame(loop)};
 raf=requestAnimationFrame(loop);
}
export function createBlockDashClient(env){
 const {R,set,onValue,getMe,$}=env,cv=$("cv"),x=cv.getContext("2d"),ov=$("ov"),help=$("ghelp");let active=false,un=()=>{},raf=0,state=null,me="",lane=2,jump=0,smash=0,last="",keys=new Set(),touch=null,parts=[],lastTime=0;
 const send=()=>{let v=`${lane},${jump},${smash}`;if(v!==last){last=v;set(R(`games/${code}/inputs/${me}`),v).catch(()=>{})}};
 let code="";
 const key=e=>{if(!active)return;let k=e.key.toLowerCase();if(["arrowleft","arrowright"," ","x","a","d"].includes(k))e.preventDefault();if(k==="arrowleft"||k==="a")lane=Math.max(0,lane-1);if(k==="arrowright"||k==="d")lane=Math.min(4,lane+1);if(k===" "){jump++;}if(k==="x"||k==="shift"){smash++}send()};
 const down=e=>{if(!active||e.target.closest("button"))return;e.preventDefault();touch={id:e.pointerId,x:e.clientX,y:e.clientY,at:performance.now()};try{cv.setPointerCapture(e.pointerId)}catch{}};
 const move=e=>{if(!touch||touch.id!==e.pointerId)return;let dx=e.clientX-touch.x;if(Math.abs(dx)>24){lane=Math.max(0,Math.min(4,lane+(dx>0?1:-1)));touch.x=e.clientX;send()}};
 const up=e=>{if(!touch||touch.id!==e.pointerId)return;let r=cv.getBoundingClientRect(),px=(e.clientX-r.left)/r.width,py=(e.clientY-r.top)/r.height;if(Math.abs(e.clientX-touch.x)<18){if(px>.68&&py>.52)jump++;else if(px<.32&&py>.52)smash++;send()}touch=null};
 function draw(){
  if(!active)return;raf=requestAnimationFrame(draw);let now=performance.now(),dt=Math.min(.05,(now-lastTime)/1000||0);lastTime=now;
  x.setTransform(cv.width/W,0,0,cv.height/H,0,0);x.clearRect(0,0,W,H);
  let bg=x.createLinearGradient(0,0,0,H);bg.addColorStop(0,"#10172e");bg.addColorStop(1,"#24204b");x.fillStyle=bg;x.fillRect(0,0,W,H);
  for(let i=0;i<70;i++){x.fillStyle="#ffffff12";x.fillRect((i*137)%W,(i*83)%H,2,2)}
  // plateforme en perspective
  x.fillStyle="#080d1c";x.beginPath();x.moveTo(115,75);x.lineTo(685,75);x.lineTo(785,535);x.lineTo(15,535);x.closePath();x.fill();
  let grd=x.createLinearGradient(0,90,0,530);grd.addColorStop(0,"#344c78");grd.addColorStop(1,"#18294b");x.fillStyle=grd;x.beginPath();x.moveTo(125,80);x.lineTo(675,80);x.lineTo(770,525);x.lineTo(30,525);x.closePath();x.fill();
  x.save();x.beginPath();x.moveTo(125,80);x.lineTo(675,80);x.lineTo(770,525);x.lineTo(30,525);x.closePath();x.clip();
  for(let i=0;i<=5;i++){let a=125+i*110,b=30+i*148;x.strokeStyle="#9bd8ff20";x.lineWidth=2;x.beginPath();x.moveTo(a,80);x.lineTo(b,525);x.stroke()}
  for(let y=100;y<530;y+=48){x.strokeStyle="#ffffff0c";x.beginPath();x.moveTo(80,y);x.lineTo(720,y);x.stroke()}x.restore();
  const rows=state?.rows||[];
  rows.forEach(r=>{let z=r[1],f=Math.max(0,Math.min(1,(760-z)/680)),y=90+f*410,w=26+f*50,h=32+f*50,cx=400,span=110+f*148;
    r[2].forEach((typ,i)=>{if(!typ)return;let xx=cx+(i-2)*span/2,ww=w*(.7+f*.3),hh=typ===2?h*.52:h;
      x.fillStyle=typ===1?"#e34b62":typ===2?"#ffc857":"#8e69f5";x.fillRect(xx-ww/2,y-hh,ww,hh);
      x.fillStyle="#ffffff30";x.fillRect(xx-ww/2+4,y-hh+4,ww-8,5);
      if(typ===3){x.strokeStyle="#fff";x.lineWidth=2;x.beginPath();x.moveTo(xx-5,y-hh+8);x.lineTo(xx+2,y-hh+17);x.lineTo(xx-2,y-hh+25);x.lineTo(xx+8,y-hh+32);x.stroke()}
    })
  });
  let p=state?.p||[],idx=p.findIndex(q=>q[0]===me),mine=p[idx],px=400+(lane-2)*148,py=447;
  if(mine){let f=mine[4]?Math.sin(now/70)*10:0;py-=f;x.fillStyle="#0008";x.beginPath();x.ellipse(px,452,22,8,0,0,7);x.fill();x.fillStyle=mine[2]?"#3ee6c4":"#777";x.beginPath();x.roundRect(px-16,py-31,32,34,9);x.fill();x.fillStyle="#fff";x.fillRect(px-8,py-23,5,5);x.fillRect(px+4,py-23,5,5);if(mine[2]){x.fillStyle="#ff496c";x.font="bold 15px sans-serif";x.fillText("✕",px-5,py-38)}}
  // HUD
  x.fillStyle="#fff";x.font="800 22px sans-serif";x.fillText("BLOCK DASH",24,35);x.font="600 14px sans-serif";x.fillStyle="#b9c8ef";x.fillText(`DISTANCE  ${Math.floor(mine?.[3]||0)} m`,24,58);
  p.forEach((q,i)=>{x.fillStyle=q[2]?"#3ee6c4":"#ff657b";x.beginPath();x.arc(640,26+i*22,5,0,7);x.fill();x.fillStyle="#fff";x.font="12px sans-serif";x.fillText(q[0]===me?"Toi":q[0].slice(0,8),653,30+i*22)});
  x.fillStyle="#ffffffb0";x.font="12px sans-serif";x.textAlign="center";x.fillText("GLISSE ◀ ▶ POUR CHANGER DE VOIE",400,520);x.fillText("BAS DROITE : SAUT  ·  BAS GAUCHE : CASSER",400,540);x.textAlign="left";
  if(state?.o){ov.textContent=state.msg||"Fin de partie";}else ov.textContent=state?.cd?String(state.cd):"";
 }
 return {enter(c){active=true;code=c;me=getMe().uid;lane=2;jump=0;smash=0;last="";state=null;help.textContent="Glisse à gauche/droite · bas droite : sauter · bas gauche : casser · ← → / Espace / X";
  set(R(`games/${c}/inputs/${me}`),"2,0,0").catch(()=>{});
  un=onValue(R(`games/${c}/state`),s=>{let v=s.val();if(!v)return;try{let q=JSON.parse(v);if(q.k==="blockdash")state=q}catch{}});
  addEventListener("keydown",key);cv.addEventListener("pointerdown",down);cv.addEventListener("pointermove",move);cv.addEventListener("pointerup",up);cv.addEventListener("pointercancel",up);lastTime=performance.now();raf=requestAnimationFrame(draw);
  return()=>{active=false;un();cancelAnimationFrame(raf);removeEventListener("keydown",key);cv.removeEventListener("pointerdown",down);cv.removeEventListener("pointermove",move);cv.removeEventListener("pointerup",up);cv.removeEventListener("pointercancel",up);touch=null;ov.textContent="";help.textContent=""}
 }};
}
