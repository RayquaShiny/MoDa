/* MoDa — Block Dash : arène libre en perspective, inspirée du mode Block Dash. */
const W=800,H=560,DT=1/30,LANES=9,XS=Array.from({length:LANES},(_,i)=>-4+i);
export async function startBlockDash(env){
 const {R,set,update,remove,onValue,getCode,getLobby,getMe,bots,played}=env,c=getCode(),lob=getLobby()||{},players=bots?bots(lob):lob.players||{},ids=Object.keys(players);
 if(ids.length<2)return env.toast("Block Dash se joue à au moins 2 joueurs.");
 await remove(R(`games/${c}`));await update(R(`lobbies/${c}`),{status:"playing"});
 const P={},I={},seen={},walls=[];ids.forEach((u,i)=>{P[u]={n:players[u].name,c:players[u].color,x:XS[Math.floor(LANES/2)],z:0,a:1,d:0,j:0,s:0};I[u]={x:P[u].x,z:0,j:0,s:0}});
 let t=0,speed=5.5,next=0,rid=0,pubN=0,ended=false,un=()=>{};
 const wall=()=>{
  const kind=Math.random(),gap=Math.floor(Math.random()*LANES),blocks=[];
  if(kind<.45){for(let i=0;i<LANES;i++)if(i!==gap&&i!==gap+1)blocks.push([XS[i],.9,1,2.6])}
  else if(kind<.72){const g2=(gap+4)%LANES;for(let i=0;i<LANES;i++)if(i!==gap&&i!==g2)blocks.push([XS[i],.9,Math.random()<.22?3:1,2.6])}
  else {for(let i=0;i<LANES;i++)if(i!==gap)blocks.push([XS[i],.9,2,.62])}
  return{id:++rid,z:25,blocks};
 };
 const pub=extra=>set(R(`games/${c}/state`),JSON.stringify({k:"blockdash",t:+t.toFixed(2),v:+speed.toFixed(2),walls:walls.map(w=>[w.id,+w.z.toFixed(2),w.blocks]),p:ids.map(u=>{let q=P[u];return[u,+q.x.toFixed(2),+q.z.toFixed(2),q.a,+q.d.toFixed(1),q.j>0?1:0,q.s>0?1:0,q.c,q.n]}),...extra}));
 const inputUn=onValue(R(`games/${c}/inputs`),s=>Object.entries(s.val()||{}).forEach(([u,v])=>{if(!I[u]||seen[u]===v)return;seen[u]=v;const a=String(v).split(",").map(Number),i=I[u];if(Number.isFinite(a[0]))i.x=Math.max(-4,Math.min(4,a[0]));if(Number.isFinite(a[1]))i.z=Math.max(-2.2,Math.min(2.2,a[1]));if(a[2]!==i.j)i.wantJ=1;if(a[3]!==i.s)i.wantS=1;i.j=a[2]||0;i.s=a[3]||0}));
 for(let i=0;i<5;i++){const w=wall();w.z=10+i*4.3;if(i===0)w.blocks=w.blocks.filter(v=>Math.abs(v[0])>.6);walls.push(w)}
 for(let n=3;n>0;n--){await pub({cd:n});await new Promise(r=>setTimeout(r,1000));if(getCode()!==c){inputUn();return}}
 let last=performance.now(),acc=0,raf=0;
 const step=()=>{
  t+=DT;speed=Math.min(11.5,5.5+t*.075);
  if(t>=next){walls.push(wall());next=t+Math.max(1.55,2.8-t*.012)}
  walls.forEach(w=>{w.z-=speed*DT;ids.forEach(u=>{const q=P[u];if(!q.a)return;const rel=w.z-q.z;if(rel<.48&&rel>-.48){for(const b of w.blocks){const [bx,bw,type,bh]=b;if(Math.abs(q.x-bx)<bw*.53){if(type===2&&q.j>0)continue;if(type===3&&q.s>0){w.blocks=w.blocks.filter(v=>v!==b);continue}q.a=0;break}}}})});
  walls.splice(0,walls.filter(w=>w.z< -3).length);
  ids.forEach(u=>{const q=P[u],i=I[u];if(!q.a)return;
   if(String(u).startsWith("bot_")){const w=walls.filter(v=>v.z-q.z>.5&&v.z-q.z<7).sort((a,b)=>a.z-b.z)[0];if(w){const danger=w.blocks.filter(b=>Math.abs(q.x-b[0])<.65);if(danger.length){const safe=XS.find(x=>!w.blocks.some(b=>Math.abs(x-b[0])<.56));if(safe!==undefined){i.x=safe}else if(danger.every(b=>b[2]===2)){i.wantJ=1}else if(danger.every(b=>b[2]===3)){i.wantS=1}else{const alt=XS.find(x=>!w.blocks.some(b=>Math.abs(x-b[0])<.56||Math.abs(x-b[0])<1.1));if(alt!==undefined)i.x=alt;else q.a=0}}}}
   q.x+=Math.max(-.18,Math.min(.18,(i.x-q.x)*.22));q.z+=Math.max(-.12,Math.min(.12,(i.z-q.z)*.2));
   if(i.wantJ){q.j=.72;i.wantJ=0}if(i.wantS){q.s=.32;i.wantS=0}
   q.j=Math.max(0,q.j-DT);q.s=Math.max(0,q.s-DT);q.d+=speed*DT;
  });
  const alive=ids.filter(u=>P[u].a);
  if(alive.length<=1||t>90){ended=true;const win=alive.sort((a,b)=>P[b].d-P[a].d)[0];pub({o:1,msg:win?`🏆 ${P[win].n} remporte Block Dash !`:"Tout le monde est tombé !"});setTimeout(async()=>{if(getCode()!==c)return;const cp=(getLobby()||{}).players||{},up={status:"lobby"};ids.filter(u=>cp[u]).forEach(u=>up[`players/${u}/ready`]=u===getMe().uid);try{await update(R(`lobbies/${c}`),up);if(played)played("blockdash")}catch{}},6500);return}
  if(++pubN%2===0)pub();
 };
 const loop=now=>{if(getCode()!==c||ended){inputUn();return}acc+=Math.min(.08,(now-last)/1000);last=now;while(acc>=DT){step();acc-=DT}if(!ended)raf=requestAnimationFrame(loop)};
 raf=requestAnimationFrame(loop);
}
export function createBlockDashClient(env){
 const {R,set,onValue,getMe,$}=env,cv=$("cv"),x=cv.getContext("2d"),ov=$("ov"),help=$("ghelp");let active=false,un=()=>{},raf=0,state=null,me="",px=0,pz=0,jump=0,smash=0,last="",keys=new Set(),pointer=null,lastTime=0,code="";
 const send=()=>{const v=`${px.toFixed(2)},${pz.toFixed(2)},${jump},${smash}`;if(v!==last){last=v;set(R(`games/${code}/inputs/${me}`),v).catch(()=>{})}};
 const key=e=>{if(!active)return;const k=e.key.toLowerCase();if(["arrowleft","arrowright","arrowup","arrowdown"," ","w","a","s","d","x","shift"].includes(k))e.preventDefault();if(k==="arrowleft"||k==="a")px=Math.max(-4,px-.65);if(k==="arrowright"||k==="d")px=Math.min(4,px+.65);if(k==="arrowup"||k==="w")pz=Math.min(2.2,pz+.55);if(k==="arrowdown"||k==="s")pz=Math.max(-2.2,pz-.55);if(k===" "){jump++}if(k==="x"||k==="shift")smash++;send()};
 const down=e=>{if(!active||e.target.closest("button"))return;e.preventDefault();pointer={id:e.pointerId,x:e.clientX,y:e.clientY,ox:px,oz:pz,moved:false};try{cv.setPointerCapture(e.pointerId)}catch{}};
 const move=e=>{if(!pointer||pointer.id!==e.pointerId)return;const r=cv.getBoundingClientRect(),dx=(e.clientX-pointer.x)/r.width,dy=(e.clientY-pointer.y)/r.height;if(Math.abs(dx)+Math.abs(dy)>.012)pointer.moved=true;px=Math.max(-4,Math.min(4,pointer.ox+dx*10));pz=Math.max(-2.2,Math.min(2.2,pointer.oz-dy*6));send()};
 const up=e=>{if(!pointer||pointer.id!==e.pointerId)return;const r=cv.getBoundingClientRect(),a=(e.clientX-r.left)/r.width,b=(e.clientY-r.top)/r.height;if(!pointer.moved){if(a>.72&&b>.62)jump++;else if(a<.28&&b>.62)smash++;else if(b<.35)pz=Math.min(2.2,pz+.7)}send();pointer=null};
 const poly=(pts,fill,stroke)=>{x.beginPath();x.moveTo(pts[0][0],pts[0][1]);for(let i=1;i<pts.length;i++)x.lineTo(pts[i][0],pts[i][1]);x.closePath();x.fillStyle=fill;x.fill();if(stroke){x.strokeStyle=stroke;x.lineWidth=2;x.stroke()}};
 const rounded=(a,b,w,h,r,fill,stroke)=>{x.beginPath();x.roundRect(a,b,w,h,r);x.fillStyle=fill;x.fill();if(stroke){x.strokeStyle=stroke;x.lineWidth=1.5;x.stroke()}};
 const project=(xx,depth,yy=0)=>{const d=Math.max(.1,depth+5),s=430/d;return{x:400+(xx-(meX()||0))*s,y:205+335*(5/d)-yy*s,w:s}};
 const meX=()=>{const q=(state?.p||[]).find(v=>v[0]===me);return q?q[1]:px};
 const cube=(xx,depth,type,height)=>{
  const p=project(xx,depth),s=p.w*.42,w=s,h=height*p.w*.34,dx=s*.2,dy=s*.14,a=p.x-w/2,b=p.y-h;
  const pal=type===1?["#ff5c91","#c52d69","#ffb4d0"]:type===2?["#54e7bd","#159c86","#b3ffe7"]:["#ffc84b","#c47c22","#fff0a2"];
  poly([[a,b],[a+dx,b-dy],[a+w+dx,b-dy],[a+w,b]],pal[2],"#ffffff88");
  poly([[a+w,b],[a+w+dx,b-dy],[a+w+dx,b+h-dy],[a+w,b+h]],pal[1],"#ffffff44");
  rounded(a,b,w,h,Math.max(2,s*.05),pal[0],"#ffffff99");
  if(type===3){x.strokeStyle="#fff4d5";x.lineWidth=Math.max(1,s*.035);x.beginPath();x.moveTo(p.x-s*.08,b+h*.22);x.lineTo(p.x+s*.02,b+h*.48);x.lineTo(p.x-s*.02,b+h*.65);x.lineTo(p.x+s*.12,b+h*.85);x.stroke()}
 };
 const avatar=(xx,depth,col,phase,isMe)=>{
  const p=project(xx,depth),s=Math.max(.45,Math.min(1.35,p.w*.32)),y=p.y-6;
  x.save();x.translate(p.x,y);x.scale(s,s);
  x.fillStyle="#08061c88";x.beginPath();x.ellipse(0,2,17,6,0,0,7);x.fill();
  rounded(-11,-17,9,18,4,"#27324e");rounded(2,-17,9,18,4,"#27324e");
  rounded(-15,-36,11,22,5,col,"#ffffff88");rounded(4,-36,11,22,5,col,"#ffffff88");rounded(-13,-43,26,30,8,col,"#ffffffaa");
  x.fillStyle="#ffd9ba";x.beginPath();x.arc(0,-52,12,0,7);x.fill();
  x.fillStyle="#38213e";x.beginPath();x.arc(0,-55,12,Math.PI,7);x.fill();
  x.fillStyle="#17213c";x.beginPath();x.arc(-4,-52,1.5,0,7);x.arc(4,-52,1.5,0,7);x.fill();
  if(isMe){x.strokeStyle="#fff";x.lineWidth=2;x.beginPath();x.arc(0,-34,21,Math.PI,7);x.stroke()}
  x.restore();
 };
 function draw(){
  if(!active)return;raf=requestAnimationFrame(draw);const now=performance.now();lastTime=now;
  x.setTransform(cv.width/W,0,0,cv.height/H,0,0);x.clearRect(0,0,W,H);
  const bg=x.createLinearGradient(0,0,0,H);bg.addColorStop(0,"#180c3b");bg.addColorStop(.5,"#241050");bg.addColorStop(1,"#100b28");x.fillStyle=bg;x.fillRect(0,0,W,H);
  for(let i=0;i<16;i++){const xx=i*57-20;x.fillStyle=i%2?"#302060":"#3a236b";x.fillRect(xx,150,25,85);x.fillStyle="#7e54b555";x.fillRect(xx+4,158,17,7)}
  /* Arène carrée violette, vue en perspective */
  const floor=[[100,205],[700,205],[790,560],[10,560]];poly(floor,"#39206f","#a85cff");
  x.save();x.beginPath();x.moveTo(100,205);x.lineTo(700,205);x.lineTo(790,560);x.lineTo(10,560);x.closePath();x.clip();
  const grid="#d6aaff44";for(let i=0;i<=12;i++){const f=i/12,y=205+f*355;x.strokeStyle=grid;x.lineWidth=1;x.beginPath();x.moveTo(100-f*90,y);x.lineTo(700+f*90,y);x.stroke()}
  for(let i=0;i<=12;i++){const f=i/12;x.beginPath();x.moveTo(100+f*600,205);x.lineTo(10+f*780,560);x.stroke()}
  x.restore();
  /* Garde-corps lumineux et bord extérieur */
  poly([[88,199],[712,199],[800,560],[0,560]],"#0000","#54f6e4");
  x.save();x.shadowBlur=18;x.shadowColor="#d64cff";x.strokeStyle="#ed65ff";x.lineWidth=7;x.beginPath();x.moveTo(100,205);x.lineTo(10,560);x.moveTo(700,205);x.lineTo(790,560);x.stroke();x.restore();
  const walls=state?.walls||[];walls.slice().sort((a,b)=>b[1]-a[1]).forEach(w=>w[2].forEach(b=>{const depth=w[1]-(meZ()||0);if(depth>.15&&depth<30)cube(b[0],depth,b[2],b[3])}));
  const ps=state?.p||[],mine=ps.find(q=>q[0]===me),alive=ps.filter(q=>q[3]);
  alive.filter(q=>q[0]!==me).forEach((q,i)=>avatar(q[1],Math.max(.5,4.3-q[2]),q[7]||"#59e2c2",now/150+i,false));
  if(mine&&mine[3])avatar(mine[1],Math.max(.5,4.3-mine[2]),mine[7]||"#42e8c4",now/130,true);
  rounded(18,16,210,58,13,"#120b2ddd","#ffffff33");x.fillStyle="#fff";x.font="900 23px system-ui";x.fillText("BLOCK DASH",32,43);x.fillStyle="#d9baff";x.font="700 11px system-ui";x.fillText("SURVIE • ARÈNE",34,62);
  rounded(650,16,132,58,13,"#120b2ddd","#ffffff33");x.fillStyle="#d9baff";x.font="700 10px system-ui";x.fillText("DISTANCE",664,36);x.fillStyle="#fff";x.font="900 22px system-ui";x.fillText(Math.floor(mine?.[4]||0)+" m",664,62);
  rounded(18,87,145,34,10,"#120b2dcc","#ffffff33");x.fillStyle="#fff";x.font="700 13px system-ui";x.fillText("● "+alive.length+" SURVIVANT"+(alive.length>1?"S":""),30,109);
  rounded(570,87,212,34,10,"#120b2dcc","#ffffff33");x.font="11px system-ui";x.fillStyle="#ff8ab4";x.fillText("■ MURS",582,109);x.fillStyle="#57e9c4";x.fillText("■ BARRES",650,109);x.fillStyle="#ffcf62";x.fillText("■ CASSER",725,109);
  rounded(130,518,540,32,14,"#120b2ddd","#ffffff33");x.fillStyle="#f1eaff";x.font="600 11px system-ui";x.textAlign="center";x.fillText("GLISSE POUR BOUGER  •  BAS DROITE : SAUTER  •  BAS GAUCHE : FRAPPER",400,538);x.textAlign="left";
  if(state?.o)ov.textContent=state.msg||"Fin de partie";else if(state?.cd)ov.textContent=String(state.cd);else ov.textContent="";
 }
 const meZ=()=>{const q=(state?.p||[]).find(v=>v[0]===me);return q?q[2]:pz};
 return {enter(c){active=true;code=c;me=getMe().uid;px=0;pz=0;jump=0;smash=0;last="";state=null;help.textContent="Glisse dans toutes les directions pour bouger · bas droite : saut · bas gauche : frappe · ← → ↑ ↓ / WASD";
  set(R(`games/${c}/inputs/${me}`),"0,0,0,0").catch(()=>{});
  un=onValue(R(`games/${c}/state`),s=>{const v=s.val();if(!v)return;try{const q=JSON.parse(v);if(q.k==="blockdash")state=q}catch{}});
  addEventListener("keydown",key);cv.addEventListener("pointerdown",down);cv.addEventListener("pointermove",move);cv.addEventListener("pointerup",up);cv.addEventListener("pointercancel",up);lastTime=performance.now();raf=requestAnimationFrame(draw);
  return()=>{active=false;un();cancelAnimationFrame(raf);removeEventListener("keydown",key);cv.removeEventListener("pointerdown",down);cv.removeEventListener("pointermove",move);cv.removeEventListener("pointerup",up);cv.removeEventListener("pointercancel",up);pointer=null;ov.textContent="";help.textContent=""}
 }};
}
