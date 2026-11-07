import {initializeApp} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {getAuth,onAuthStateChanged,createUserWithEmailAndPassword,signInWithEmailAndPassword,signInWithPopup,GoogleAuthProvider,signOut} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {getDatabase,ref,get,set,update,remove,onValue,onDisconnect,serverTimestamp,increment} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js";

// 1) Colle ici la config de ton projet Firebase (Paramètres du projet > Tes applications > Web)
const cfg={apiKey:"A_REMPLACER",authDomain:"TON_PROJET.firebaseapp.com",databaseURL:"https://TON_PROJET-default-rtdb.europe-west1.firebasedatabase.app",projectId:"TON_PROJET",appId:"A_REMPLACER"};
const app=initializeApp(cfg),auth=getAuth(app),db=getDatabase(app);
const $=i=>document.getElementById(i);
const h=(t,txt,fn)=>{const e=document.createElement(t);if(txt!=null)e.textContent=txt;if(fn)e.onclick=fn;return e};
const R=p=>ref(db,p);
const COLORS=["#ff4d6d","#3ee6c4","#ffd23f","#6c8cff","#ff9f1c","#c77dff","#80ed99","#f8f9fa"];
const VIEWS=["auth","home","stats","lobby","game"];
const OW=["rayqua","8x"],ownerMail=n=>`${n}@moda.owner`;
const ownerOf=u=>OW.find(n=>u.email===ownerMail(n));
let adm=false,unStats=[];try{adm=localStorage.getItem("moda.stats")==="1"}catch{}
let me=null,cur="auth",code=null,lobby=null,pending=null,unLobby=null,unState=null,presUn=[],lastDir=null;
const show=v=>{cur=v;VIEWS.forEach(x=>$(x).hidden=x!==v);$("side").hidden=v==="auth"};
let tt;const toast=m=>{$("toast").textContent=m;clearTimeout(tt);tt=setTimeout(()=>$("toast").textContent="",3500)};
const clean=s=>(s||"joueur").replace(/[^A-Za-z0-9_]/g,"").slice(0,16).padEnd(3,"x");

// ---------- Comptes ----------
const err=e=>toast({"auth/invalid-credential":"Email ou mot de passe incorrect","auth/email-already-in-use":"Email déjà utilisé","auth/weak-password":"Mot de passe trop court"}[e.code]||e.message);
$("login").onclick=()=>{
  const id=$("email").value.trim(),low=id.toLowerCase().replace(/@moda\.owner$/,"");
  if(OW.includes(low))return ownerLogin(low);
  signInWithEmailAndPassword(auth,id,$("pass").value).catch(err);
};
async function ownerLogin(n){
  const pw=$("pass").value;if(pw.length<6)return toast("Code : 6 caractères minimum");
  const mail=ownerMail(n),claimed=(await get(R(`ownerSetup/${n}`))).val();
  if(claimed)return signInWithEmailAndPassword(auth,mail,pw).catch(err);
  const c=prompt(`Première connexion de ${n} : confirme ton code`);
  if(c!==pw)return toast("Les deux codes sont différents");
  createUserWithEmailAndPassword(auth,mail,pw).catch(e=>e.code==="auth/email-already-in-use"?signInWithEmailAndPassword(auth,mail,pw).catch(err):err(e));
}
$("signup").onclick=()=>{const n=$("pseudo").value.trim();if(!/^[A-Za-z0-9_]{3,16}$/.test(n))return toast("Pseudo : 3 à 16 lettres, chiffres ou _");if(OW.includes(n.toLowerCase()))return toast("Ce pseudo est réservé");pending=n;createUserWithEmailAndPassword(auth,$("email").value,$("pass").value).catch(e=>{pending=null;err(e)})};
$("google").onclick=()=>signInWithPopup(auth,new GoogleAuthProvider()).catch(err);
$("out").onclick=()=>{leaveLobby();signOut(auth)};

async function ensureProfile(u){
  const s=await get(R(`users/${u.uid}/name`));if(s.exists())return s.val();
  const own=ownerOf(u);
  const base=own||clean(pending||u.displayName||u.email.split("@")[0]);pending=null;
  for(let i=0;i<5;i++){
    let n=i?base.slice(0,12)+Math.floor(Math.random()*1000):base;
    if(!own&&OW.includes(n.toLowerCase()))n=base.slice(0,12)+Math.floor(Math.random()*1000);
    if(!(await get(R(`usernames/${n.toLowerCase()}`))).exists()){
      try{await set(R(`usernames/${n.toLowerCase()}`),u.uid);await set(R(`users/${u.uid}`),{name:n,createdAt:serverTimestamp()});return n}catch{}
    }
    if(own)break;
  }
  throw new Error("Impossible de créer le profil");
}
async function ensureOwner(u,n){
  if(!(await get(R(`owners/${u.uid}`))).exists())await set(R(`owners/${u.uid}`),true);
  if(!(await get(R(`ownerSetup/${n}`))).exists())await set(R(`ownerSetup/${n}`),true);
}
onAuthStateChanged(auth,async u=>{
  presUn.forEach(f=>f());presUn=[];
  if(!u){me=null;stopStats();$("adm").hidden=true;$("who").textContent="";$("out").hidden=true;return show("auth")}
  const name=await ensureProfile(u),own=ownerOf(u);
  if(own)await ensureOwner(u,own).catch(()=>{});
  const isOwner=(await get(R(`owners/${u.uid}`))).exists();
  me={uid:u.uid,name,owner:isOwner};
  $("adm").hidden=!isOwner;$("sw").setAttribute("aria-checked",String(adm&&isOwner));
  $("who").textContent=name+(isOwner?" ★":"");$("out").hidden=false;showHome();
  onValue(R(".info/connected"),s=>{if(s.val()){onDisconnect(R(`presence/${me.uid}`)).set(false);set(R(`presence/${me.uid}`),true)}});
  watchSocial();
});

// ---------- Amis & invitations ----------
$("fadd").onclick=async()=>{
  const n=$("fname").value.trim().toLowerCase();if(!n)return;
  const t=(await get(R(`usernames/${n}`))).val();
  if(!t)return toast("Aucun joueur avec ce pseudo");if(t===me.uid)return toast("C'est toi !");
  await set(R(`friendRequests/${t}/${me.uid}`),{name:me.name});$("fname").value="";toast("Demande envoyée");
};
function watchSocial(){
  onValue(R(`friendRequests/${me.uid}`),s=>{const b=$("reqs");b.replaceChildren();
    Object.entries(s.val()||{}).forEach(([f,d])=>{const r=h("div",d.name+" veut être ami ");
      r.append(h("button","Accepter",async()=>{await set(R(`friends/${me.uid}/${f}`),true);await set(R(`friends/${f}/${me.uid}`),true);await remove(R(`friendRequests/${me.uid}/${f}`))}),
               h("button","Refuser",()=>remove(R(`friendRequests/${me.uid}/${f}`))));
      r.querySelectorAll("button").forEach(x=>x.className="mini");b.append(r)})});
  onValue(R(`invites/${me.uid}`),s=>{const b=$("invs");b.replaceChildren();
    Object.entries(s.val()||{}).forEach(([f,d])=>{const r=h("div",d.name+" t'invite ");
      const j=h("button","Rejoindre",async()=>{await remove(R(`invites/${me.uid}/${f}`));joinLobby(d.code)});j.className="mini";r.append(j);b.append(r)})});
  let un=[];
  onValue(R(`friends/${me.uid}`),async s=>{
    un.forEach(f=>f());un=[];const box=$("friends");box.replaceChildren();
    for(const f of Object.keys(s.val()||{})){
      const n=(await get(R(`users/${f}/name`))).val()||"?";
      const row=h("div"),dot=h("span","●");dot.className="dot";
      const inv=h("button","Inviter",async()=>{if(!code)return toast("Crée d'abord un lobby");await set(R(`invites/${f}/${me.uid}`),{code,name:me.name});toast("Invitation envoyée")});inv.className="mini";
      row.append(dot,n+" ",inv);box.append(row);
      un.push(onValue(R(`presence/${f}`),p=>dot.classList.toggle("on",!!p.val())));
    }});
}

// ---------- Lobby ----------
const rcode=()=>Array.from({length:5},()=>"ABCDEFGHJKLMNPQRSTUVWXYZ"[Math.floor(Math.random()*24)]).join("");
const firstColor=pl=>COLORS.find(c=>!Object.values(pl||{}).some(p=>p.color===c))||COLORS[0];
$("tsnake").onclick=$("create").onclick=async()=>{
  const c=rcode();
  await set(R(`lobbies/${c}`),{host:me.uid,game:"snake",status:"lobby",players:{[me.uid]:{name:me.name,color:COLORS[0],ready:true}}});
  onDisconnect(R(`lobbies/${c}`)).remove();enter(c);
};
$("join").onclick=()=>joinLobby($("joincode").value.trim().toUpperCase());
async function joinLobby(c){
  if(code)await leaveLobby();
  const l=(await get(R(`lobbies/${c}`))).val();
  if(!l)return toast("Lobby introuvable");
  if(l.status!=="lobby")return toast("Partie déjà en cours");
  const pl=l.players||{};if(Object.keys(pl).length>=8&&!pl[me.uid])return toast("Lobby plein (8 max)");
  await set(R(`lobbies/${c}/players/${me.uid}`),{name:me.name,color:firstColor(pl),ready:false});
  onDisconnect(R(`lobbies/${c}/players/${me.uid}`)).remove();enter(c);
}
function enter(c){
  code=c;stopStats();show("lobby");$("lcode").textContent=c;
  unLobby=onValue(R(`lobbies/${c}`),s=>{
    const l=s.val();if(!l){if(code){local();toast("Le lobby a été fermé")}return}
    lobby=l;renderLobby();
    if(l.status==="playing"&&cur!=="game")enterGame(c);
    if(l.status==="lobby"&&cur==="game"){unState&&unState();unState=null;show("lobby")}
  });
}
function renderLobby(){
  const b=$("players"),host=lobby.host===me.uid,pl=lobby.players||{};b.replaceChildren();
  Object.entries(pl).forEach(([u,p])=>{const r=h("div",null);r.className="pl";const sw=h("span");sw.className="sw";sw.style.background=p.color;
    r.append(sw,h("span",p.name+(u===lobby.host?" (hôte)":"")),h("span",p.ready?"✔ prêt":"…"));b.append(r)});
  $("ready").hidden=host;$("ready").textContent=pl[me.uid]?.ready?"Pas prêt":"Prêt";
  $("start").hidden=!host;$("start").disabled=!Object.values(pl).every(p=>p.ready);
}
$("ready").onclick=()=>set(R(`lobbies/${code}/players/${me.uid}/ready`),!lobby.players[me.uid].ready);
$("leave").onclick=leaveLobby;
async function leaveLobby(){
  if(!code)return;const c=code,host=lobby&&lobby.host===me.uid;local();
  onDisconnect(R(`lobbies/${c}`)).cancel();onDisconnect(R(`lobbies/${c}/players/${me.uid}`)).cancel();
  try{if(host){await remove(R(`games/${c}`));await remove(R(`lobbies/${c}`))}else await remove(R(`lobbies/${c}/players/${me.uid}`))}catch{}
}
function local(){unLobby&&unLobby();unState&&unState();unLobby=unState=null;code=lobby=null;if(me)showHome()}

// ---------- Jeu : affichage (tous les joueurs) ----------
function enterGame(c){
  show("game");lastDir=null;
  unState=onValue(R(`games/${c}/state`),s=>{if(s.val())draw(JSON.parse(s.val()))});
}
function draw(st){
  const cv=$("cv"),x=cv.getContext("2d"),k=cv.width/st.W;
  x.fillStyle="#0e0a22";x.fillRect(0,0,cv.width,cv.height);
  x.fillStyle="#1a1438";for(let i=0;i<st.W;i++)for(let j=0;j<st.H;j++)if((i+j)%2)x.fillRect(i*k,j*k,k,k);
  x.fillStyle="#fff";st.f.forEach(([a,b])=>{x.beginPath();x.arc((a+.5)*k,(b+.5)*k,k*.32,0,7);x.fill()});
  Object.values(st.s).forEach(s=>{x.fillStyle=s.c;s.b.forEach(([a,b],i)=>{x.globalAlpha=i?.85:1;x.fillRect(a*k+1,b*k+1,k-2,k-2)});x.globalAlpha=1});
  $("score").replaceChildren(...Object.values(st.s).sort((a,b)=>b.p-a.p).map(s=>{const d=h("div",`${s.n} : ${s.p}${s.a?"":" ✖"}`);d.style.color=s.c;d.style.fontWeight=600;return d}));
  $("ov").textContent=st.cd?st.cd:st.o?(st.w?`${st.w} gagne !`:"Fin de partie"):"";
}
const KEYS={ArrowUp:"U",w:"U",z:"U",ArrowDown:"D",s:"D",ArrowLeft:"L",a:"L",q:"L",ArrowRight:"R",d:"R"};
const send=d=>{if(cur!=="game"||d===lastDir)return;lastDir=d;set(R(`games/${code}/inputs/${me.uid}`),d)};
addEventListener("keydown",e=>{if(cur!=="game"||/^(INPUT|TEXTAREA)$/.test(e.target.tagName))return;const d=KEYS[e.key.length>1?e.key:e.key.toLowerCase()];if(d){e.preventDefault();send(d)}});
let t0;const cvs=$("cv");
cvs.addEventListener("touchstart",e=>{t0=e.touches[0]},{passive:true});
cvs.addEventListener("touchmove",e=>{e.preventDefault();if(!t0||cur!=="game")return;const t=e.touches[0],dx=t.clientX-t0.clientX,dy=t.clientY-t0.clientY;
  if(Math.max(Math.abs(dx),Math.abs(dy))>20){send(Math.abs(dx)>Math.abs(dy)?(dx>0?"R":"L"):(dy>0?"D":"U"));t0=t}},{passive:false});
document.querySelectorAll("#pad button").forEach(b=>{const f=e=>{e.preventDefault();send(b.dataset.d)};b.addEventListener("pointerdown",f)});

// ---------- Jeu : boucle de l'hôte ----------
$("start").onclick=async()=>{
  const c=code,players=lobby.players,ids=Object.keys(players),W=40,H=28;
  await remove(R(`games/${c}`));
  await update(R(`lobbies/${c}`),{status:"playing"});
  const V={U:[0,-1],D:[0,1],L:[-1,0],R:[1,0]},want={},snakes={},food=[];
  ids.forEach((u,i)=>{const y=3+i*3;snakes[u]={n:players[u].name,c:players[u].color,a:true,p:0,d:V.R,b:[[5,y],[4,y],[3,y]]}});
  const un=onValue(R(`games/${c}/inputs`),s=>Object.entries(s.val()||{}).forEach(([u,d])=>want[u]=V[d]));
  const free=()=>{const o=new Set();Object.values(snakes).forEach(s=>s.b.forEach(c=>o.add(c+"")));food.forEach(f=>o.add(f+""));
    for(;;){const p=[Math.floor(Math.random()*W),Math.floor(Math.random()*H)];if(!o.has(p+""))return p}};
  const pub=(x={})=>set(R(`games/${c}/state`),JSON.stringify({W,H,f:food,s:snakes,...x}));
  for(let i=0;i<Math.max(3,ids.length+2);i++)food.push(free());
  for(let n=3;n>0;n--){await pub({cd:n});await new Promise(r=>setTimeout(r,1000))}
  const iv=setInterval(()=>{
    const alive=Object.keys(snakes).filter(u=>snakes[u].a),heads={},occ=new Set(),hc={};
    alive.forEach(u=>{const s=snakes[u],d=want[u];
      if(d&&!(d[0]===-s.d[0]&&d[1]===-s.d[1]))s.d=d;
      heads[u]=[s.b[0][0]+s.d[0],s.b[0][1]+s.d[1]];hc[heads[u]+""]=(hc[heads[u]+""]||0)+1;s.b.forEach(c=>occ.add(c+""))});
    alive.forEach(u=>{const s=snakes[u],[x,y]=heads[u],k=heads[u]+"";
      if(x<0||y<0||x>=W||y>=H||occ.has(k)||hc[k]>1){s.a=false;s.b=[];return}
      s.b.unshift([x,y]);const fi=food.findIndex(f=>f[0]===x&&f[1]===y);
      if(fi>=0){s.p++;food.splice(fi,1);food.push(free())}else s.b.pop()});
    const left=Object.keys(snakes).filter(u=>snakes[u].a);
    if(ids.length>1?left.length<=1:left.length===0){
      clearInterval(iv);un();set(R("stats/gamesPlayed"),increment(1)).catch(()=>{});pub({o:1,w:left[0]?snakes[left[0]].n:null});
      setTimeout(async()=>{const up={status:"lobby"};ids.forEach(u=>up[`players/${u}/ready`]=u===me.uid);
        try{await update(R(`lobbies/${c}`),up)}catch{}},5000);
    }else pub();
  },120);
};

// ---------- Owners : interrupteur + statistiques ----------
function showHome(){if(me&&me.owner&&adm){show("stats");startStats()}else{stopStats();show("home")}}
$("sw").onclick=()=>{adm=!adm;try{localStorage.setItem("moda.stats",adm?"1":"0")}catch{}
  $("sw").setAttribute("aria-checked",String(adm));if(cur==="home"||cur==="stats")showHome()};
function stopStats(){unStats.forEach(f=>f());unStats=[]}
function startStats(){
  stopStats();const D={};
  [["presence","presence"],["users","users"],["lobbies","lobbies"],["friends","friends"],["stats/gamesPlayed","games"]]
    .forEach(([p,k])=>unStats.push(onValue(R(p),s=>{D[k]=s.val();renderStats(D)},()=>toast("Statistiques : accès refusé, vérifie les règles"))));
}
function renderStats(D){
  const pr=D.presence||{},us=D.users||{},lo=Object.values(D.lobbies||{}),fr=D.friends||{},now=Date.now();
  const online=Object.keys(pr).filter(u=>pr[u]),made=Object.values(us).map(u=>u.createdAt||0);
  const cards=[[online.length,"connectés"],[Object.keys(us).length,"comptes créés"],[made.filter(t=>t>now-864e5).length,"nouveaux (24 h)"],[made.filter(t=>t>now-6048e5).length,"nouveaux (7 j)"],
    [lo.filter(l=>l.status==="lobby").length,"lobbys ouverts"],[lo.filter(l=>l.status==="playing").length,"parties en cours"],
    [Object.values(fr).reduce((s,f)=>s+Object.keys(f).length,0)/2,"amitiés"],[D.games||0,"parties jouées"]];
  $("stgrid").replaceChildren(...cards.map(([v,l])=>{const d=h("div");d.className="stat";const b=h("b",String(v));d.append(b,h("span",l));return d}));
  $("onl").replaceChildren(...(online.length?online.map(u=>{const c=h("span",us[u]?.name||"?");c.className="chip";return c}):[h("span","Personne pour l'instant")]));
}

// ---------- Installation (PWA) ----------
if("serviceWorker" in navigator&&location.protocol==="https:"){
  addEventListener("load",()=>navigator.serviceWorker.register("sw.js",{updateViaCache:"none"}).catch(()=>{}));
  // Nouvelle version détectée : on recharge seulement si ça ne coupe rien (jamais en lobby ni en partie, ni pendant la saisie)
  let notified=false;
  navigator.serviceWorker.addEventListener("message",e=>{
    if(!e.data||e.data.type!=="sw-update"||notified)return;
    notified=true;
    const typing=/^(INPUT|TEXTAREA)$/.test(document.activeElement&&document.activeElement.tagName);
    if(!typing&&(cur==="home"||cur==="stats"||cur==="auth")){location.reload();return}
    $("upd").hidden=false;
  });
  const check=()=>{navigator.serviceWorker.controller&&navigator.serviceWorker.controller.postMessage({type:"check"});navigator.serviceWorker.getRegistration().then(r=>r&&r.update()).catch(()=>{})};
  document.addEventListener("visibilitychange",()=>{if(!document.hidden)check()});
  setInterval(check,10*60*1000);setTimeout(check,4000);
  $("updbtn").onclick=async()=>{
    $("updbtn").disabled=true;$("updbtn").textContent="Mise à jour…";
    try{(await navigator.serviceWorker.getRegistrations()).forEach(r=>r.unregister());await Promise.all((await caches.keys()).map(k=>caches.delete(k)))}catch{}
    location.replace(location.pathname+"?u="+Date.now());
  };
}
(function(){
  const btn=$("inst"),help=$("iosHelp");
  const standalone=matchMedia("(display-mode: standalone)").matches||navigator.standalone===true;
  const ios=/iphone|ipad|ipod/i.test(navigator.userAgent)||(navigator.platform==="MacIntel"&&navigator.maxTouchPoints>1);
  if(standalone)return;
  let ev=null;
  addEventListener("beforeinstallprompt",e=>{e.preventDefault();ev=e;btn.hidden=false});
  addEventListener("appinstalled",()=>{btn.hidden=true;ev=null});
  if(ios)btn.hidden=false;
  btn.onclick=async()=>{
    if(ev){ev.prompt();await ev.userChoice.catch(()=>{});ev=null;btn.hidden=true}
    else help.hidden=false;
  };
  $("iosClose").onclick=()=>help.hidden=true;
})();
