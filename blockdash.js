/* MoDa — Block Dash : course multijoueur sur plateforme suspendue. */
const W=800,H=560,LANES=5,DT=1/30;
export async function startBlockDash(env){
 const {R,set,update,remove,onValue,getCode,getLobby,getMe,bots,played}=env,c=getCode(),lob=getLobby()||{},players=bots?bots(lob):lob.players||{},ids=Object.keys(players);
 if(ids.length<2)return env.toast("Block Dash se joue à au moins 2 joueurs.");
 await remove(R(`games/${c}`));await update(R(`lobbies/${c}`),{status:"playing"});
 const P={},I={},seen={},rows=[];ids.forEach((u,i)=>{P[u]={n:players[u].name,c:players[u].color,x:2,a:1,d:0,j:0,s:0};I[u]={x:2,j:0,s:0}});
 let t=0,speed=105,next=0,rid=0,pubN=0,ended=false,un=()=>{};
 const makeRow=()=>{let a=Array(LANES).fill(0),p=Math.floor(Math.random()*10),g=Math.floor(Math.random()*LANES),gaps=[g,(g+2)%LANES];
  if(p===0)a=a.map((_,i)=>i===g?0:1);
  if(p===1)a=a.map((_,i)=>i===g?0:(Math.random()<.25?0:2));
  if(p===2)a=a.map((_,i)=>i===g?0:i===(g+2)%5?3:1);
  if(p===3)a=a.map((_,i)=>gaps.includes(i)?0:1);
  if(p===4)a=a.map((_,i)=>gaps.includes(i)?0:(Math.random()<.5?2:1));
  if(p===5)a=a.map((_,i)=>i===g?0:i%2?2:1);
  if(p===6)a=a.map((_,i)=>i===g?0:i===(g+1)%5?3:1);
  if(p===7)a=a.map((_,i)=>i===g?0:i===(g+3)%5?2:1);
  if(p===8)a=a.map((_,i)=>[g,(g+1)%5,(g+3)%5].includes(i)?0:1);
  if(p===9)a=a.map((_,i)=>i===g?0:i===(g+3)%5?3:(Math.random()<.35?2:1));
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
   if(String(u).startsWith("bot_")){const target=rows.filter(r=>r.z>85&&r.z<260).sort((x,y)=>x.z-y.z)[0];if(target){const typ=target.a[q.x];if(typ){const safe=target.a.findIndex(v=>v===0);if(safe>=0){q.x=safe;i.x=safe}else if(typ===2){q.j=.75}else if(typ===3){q.s=.32}else{const alt=target.a.findIndex(v=>v===2||v===3);if(alt>=0){q.x=alt;i.x=alt}else q.a=0}}}}
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
 const poly=(pts,fill,stroke)=>{x.beginPath();x.moveTo(pts[0][0],pts[0][1]);for(let i=1;i<pts.length;i++)x.lineTo(pts[i][0],pts[i][1]);x.closePath();x.fillStyle=fill;x.fill();if(stroke){x.strokeStyle=stroke;x.lineWidth=2;x.stroke()}};
 const box=(a,b,w,h,r,fill,stroke)=>{x.beginPath();x.roundRect(a,b,w,h,r);x.fillStyle=fill;x.fill();if(stroke){x.strokeStyle=stroke;x.lineWidth=1.5;x.stroke()}};
 const light=(a,b,r,col)=>{x.save();x.shadowBlur=20;x.shadowColor=col;x.fillStyle=col;x.beginPath();x.arc(a,b,r,0,7);x.fill();x.restore()};
 const arena=()=>{
  let g=x.createLinearGradient(0,225,0,560);g.addColorStop(0,"#38577f");g.addColorStop(.5,"#263f69");g.addColorStop(1,"#182b4d");
  poly([[75,230],[725,230],[790,560],[10,560]],"#080d20");
  poly([[125,235],[675,235],[765,560],[35,560]],g,"#65dfff88");
  x.save();x.beginPath();x.moveTo(125,235);x.lineTo(675,235);x.lineTo(765,560);x.lineTo(35,560);x.closePath();x.clip();
  for(let i=0;i<=10;i++){let f=i/10,y=235+f*325;x.strokeStyle=i%2?"#b7eaff18":"#b7eaff38";x.beginPath();x.moveTo(125-f*90,y);x.lineTo(675+f*90,y);x.stroke()}
  for(let i=0;i<=5;i++){let f=i/5;x.strokeStyle="#b7eaff30";x.beginPath();x.moveTo(125+f*550,235);x.lineTo(35+f*730,560);x.stroke()}x.restore();
  x.strokeStyle="#54dfff";x.lineWidth=4;x.shadowBlur=12;x.shadowColor="#36cfff";x.beginPath();x.moveTo(125,235);x.lineTo(35,560);x.moveTo(675,235);x.lineTo(765,560);x.stroke();x.shadowBlur=0;
  for(let i=0;i<6;i++){light(125+i*110,235,3,"#7ceaff");light(35+i*146,560,3,"#7ceaff")}
 };
 const project=z=>{let f=Math.max(0,Math.min(1,(760-z)/675));return{y:238+f*278,span:112+f*165,s:.48+f*.9}};
 const block3d=(z,l,t)=>{let p=project(z),cx=400+(l-2)*p.span/2,s=p.s,w=42*s,h=(t===2?25:48)*s,d=12*s,a=cx-w/2,b=p.y-h;
  let c=t===1?"#ed4e68":t===2?"#ffcf58":"#9875f7",dark=t===1?"#a72d4c":t===2?"#b77c25":"#6044b4",top=t===1?"#ff9aaa":t===2?"#fff0a1":"#d4c3ff";
  poly([[a+w,b],[a+w+d,b-d*.55],[a+w+d,b+h-d*.55],[a+w,b+h]],dark);
  poly([[a,b],[a+d,b-d*.55],[a+w+d,b-d*.55],[a+w,b]],top);box(a,b,w,h,4*s,c,"#ffffff77");
  if(t===3){x.strokeStyle="#fff";x.lineWidth=2*s;x.beginPath();x.moveTo(cx-6*s,b+7*s);x.lineTo(cx+2*s,b+17*s);x.lineTo(cx-3*s,b+25*s);x.lineTo(cx+8*s,b+34*s);x.stroke()}
 };
 const avatar=(px,py,col,sc,phase,meFlag)=>{x.save();x.translate(px,py);x.scale(sc,sc);let bob=Math.sin(phase)*2,leg=Math.sin(phase*1.6)*4;
  x.fillStyle="#0008";x.beginPath();x.ellipse(0,1,17,5,0,0,7);x.fill();
  box(-10,-13+leg*.2,8,17,4,"#283650");box(2,-13-leg*.2,8,17,4,"#283650");
  box(-12,-1+leg*.2,12,5,2,"#f3f5ff");box(1,-1-leg*.2,12,5,2,"#f3f5ff");
  box(-17,-34+bob,7,22,4,col);box(10,-34+bob,7,22,4,col);box(-13,-40+bob,26,29,8,col,"#ffffff99");
  x.fillStyle="#ffd7b2";x.beginPath();x.arc(0,-49+bob,12,0,7);x.fill();
  x.fillStyle="#392b43";x.beginPath();x.arc(0,-52+bob,12,Math.PI,7);x.fill();x.fillRect(-11,-53+bob,22,5);
  x.fillStyle="#17213c";x.beginPath();x.arc(-4,-49+bob,1.5,0,7);x.arc(4,-49+bob,1.5,0,7);x.fill();
  if(meFlag){x.strokeStyle="#fff";x.lineWidth=2;x.beginPath();x.arc(0,-31+bob,21,Math.PI,7);x.stroke()}x.restore()
 };
 function draw(){
  if(!active)return;raf=requestAnimationFrame(draw);let now=performance.now(),dt=Math.min(.05,(now-lastTime)/1000||0);lastTime=now;
  x.setTransform(cv.width/W,0,0,cv.height/H,0,0);x.clearRect(0,0,W,H);
  let bg=x.createLinearGradient(0,0,0,H);bg.addColorStop(0,"#08152f");bg.addColorStop(.6,"#172b53");bg.addColorStop(1,"#10152d");x.fillStyle=bg;x.fillRect(0,0,W,H);
  for(let i=0;i<24;i++){let bw=18+(i*17%31),bh=45+(i*47%120),bx=i*37-8,by=250-bh;x.fillStyle=i%3===0?"#263c69":"#1b2e53";x.fillRect(bx,by,bw,bh);x.fillStyle="#7be6ff30";for(let yy=by+12;yy<245;yy+=17)for(let xx=bx+5;xx<bx+bw-4;xx+=10)x.fillRect(xx,yy,3,5)}
  arena();
  let rows=state?.rows||[];[...rows].sort((a,b)=>b[1]-a[1]).forEach(r=>r[2].forEach((t,i)=>{if(t)block3d(r[1],i,t)}));
  let p=state?.p||[],mine=p.find(q=>q[0]===me),alive=p.filter(q=>q[2]).length;
  p.filter(q=>q[0]!==me&&q[2]).forEach((q,i)=>avatar(400+(q[1]-2)*145,488+(i%2)*5,q[2]||"#55d6c5",.78,now/150+i*2,false));
  let px=400+(lane-2)*155;if(mine&&mine[2])avatar(px,508,mine[2]||"#39e6c4",1.08,now/120,true);
  box(18,16,245,62,13,"#071329dd","#ffffff30");x.fillStyle="#fff";x.font="900 23px system-ui";x.fillText("BLOCK DASH",32,44);x.fillStyle="#8eeaff";x.font="700 11px system-ui";x.fillText("SURVIE • ARÈNE",34,63);
  box(646,16,136,62,13,"#071329dd","#ffffff30");x.fillStyle="#a9badc";x.font="700 10px system-ui";x.fillText("DISTANCE",660,36);x.fillStyle="#fff";x.font="900 22px system-ui";x.fillText(Math.floor(mine?.[3]||0)+" m",660,63);
  box(18,89,130,34,10,"#071329bb","#ffffff30");x.fillStyle="#fff";x.font="700 13px system-ui";x.fillText("● "+alive+" SURVIVANT"+(alive>1?"S":""),30,111);
  box(570,89,212,34,10,"#071329bb","#ffffff30");x.font="11px system-ui";x.fillStyle="#ff7188";x.fillText("■ ÉVITER",582,111);x.fillStyle="#ffcf58";x.fillText("■ SAUTER",650,111);x.fillStyle="#b99aff";x.fillText("■ CASSER",713,111);
  box(105,526,590,26,12,"#061126dd","#ffffff30");x.fillStyle="#d8e8ff";x.font="600 11px system-ui";x.textAlign="center";x.fillText("GLISSE ◀ ▶ POUR BOUGER  •  BAS DROITE : SAUT  •  BAS GAUCHE : CASSER",400,543);x.textAlign="left";
  if(state?.o)ov.textContent=state.msg||"Fin de partie";else if(state?.cd)ov.textContent=String(state.cd);else ov.textContent="";
 }
 return {enter(c){active=true;code=c;me=getMe().uid;lane=2;jump=0;smash=0;last="";state=null;help.textContent="Glisse à gauche/droite · bas droite : sauter · bas gauche : casser · ← → / Espace / X";
  set(R(`games/${c}/inputs/${me}`),"2,0,0").catch(()=>{});
  un=onValue(R(`games/${c}/state`),s=>{let v=s.val();if(!v)return;try{let q=JSON.parse(v);if(q.k==="blockdash")state=q}catch{}});
  addEventListener("keydown",key);cv.addEventListener("pointerdown",down);cv.addEventListener("pointermove",move);cv.addEventListener("pointerup",up);cv.addEventListener("pointercancel",up);lastTime=performance.now();raf=requestAnimationFrame(draw);
  return()=>{active=false;un();cancelAnimationFrame(raf);removeEventListener("keydown",key);cv.removeEventListener("pointerdown",down);cv.removeEventListener("pointermove",move);cv.removeEventListener("pointerup",up);cv.removeEventListener("pointercancel",up);touch=null;ov.textContent="";help.textContent=""}
 }};
}
