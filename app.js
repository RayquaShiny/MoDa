import {initializeApp} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {getAuth,onAuthStateChanged,createUserWithEmailAndPassword,signInWithEmailAndPassword,signInWithPopup,signInWithRedirect,getRedirectResult,GoogleAuthProvider,signOut} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {getDatabase,ref,get,set,update,remove,onValue,onDisconnect,serverTimestamp,increment} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js";

// 1) Colle ici la config de ton projet Firebase (Paramètres du projet > Tes applications > Web)
const cfg={apiKey:"AIzaSyCU2qkeRozdFeIybYQQjy9PssnqxBbYdIo",authDomain:"moda-ac6b2.firebaseapp.com",databaseURL:"https://moda-ac6b2-default-rtdb.europe-west1.firebasedatabase.app",projectId:"moda-ac6b2",storageBucket:"moda-ac6b2.firebasestorage.app",messagingSenderId:"79010938897",appId:"1:79010938897:web:4cf8ffe4ca61e04ada31b0"};
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
const MSG={
  "auth/invalid-credential":"Email ou mot de passe incorrect","auth/wrong-password":"Email ou mot de passe incorrect","auth/user-not-found":"Email ou mot de passe incorrect",
  "auth/invalid-email":"Adresse email invalide","auth/missing-email":"Entre ton email","auth/missing-password":"Entre ton mot de passe",
  "auth/email-already-in-use":"Email déjà utilisé : connecte-toi plutôt","auth/weak-password":"Mot de passe trop court (6 caractères min.)",
  "auth/too-many-requests":"Trop d'essais, réessaie dans quelques minutes","auth/network-request-failed":"Pas de connexion internet",
  "auth/user-disabled":"Ce compte est désactivé","auth/operation-not-allowed":"Ce mode de connexion n'est pas activé dans Firebase (Authentication > Sign-in method)",
  "auth/unauthorized-domain":"Domaine non autorisé : ajoute-le dans Firebase > Authentication > Paramètres > Domaines autorisés",
  "auth/invalid-api-key":"Clé Firebase invalide : vérifie la config en haut de app.js","auth/api-key-not-valid":"Clé Firebase invalide : vérifie la config en haut de app.js",
  "auth/popup-closed-by-user":"","auth/cancelled-popup-request":"",
  "PERMISSION_DENIED":"Accès refusé par les règles Firebase"
};
const err=e=>{console.error(e);const m=MSG[e&&e.code];if(m==="")return;toast(m||("Erreur : "+((e&&e.message)||e)))};
if(cfg.apiKey==="A_REMPLACER")setTimeout(()=>toast("Config Firebase manquante dans app.js"),500);

// Anti double-clic : les boutons sont bloqués pendant toute la connexion (appel Firebase + création du profil)
let busy=false;
const setBusy=v=>{busy=v;["login","signup","google"].forEach(i=>$(i).disabled=v);$("auth").classList.toggle("busy",v)};
// Entrée valide le formulaire (inscription si un pseudo est rempli, sinon connexion)
["pseudo","email","pass","pass2"].forEach(i=>$(i).addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();($("pseudo").value.trim()?$("signup"):$("login")).click()}}));
const guard=fn=>async()=>{
  if(busy)return;setBusy(true);
  try{await fn()}catch(e){err(e)}
  finally{if(!auth.currentUser)setBusy(false)} // si connecté, c'est onAuthStateChanged qui débloque une fois le profil prêt
};
const resetAuthForm=()=>{$("pass").value="";$("pass2").value="";$("pass2").hidden=true};

$("login").onclick=guard(async()=>{
  const id=$("email").value.trim(),pw=$("pass").value,low=id.toLowerCase().replace(/@moda\.owner$/,"");
  if(!id)return toast("Entre ton email");
  if(!pw)return toast("Entre ton mot de passe");
  if(OW.includes(low))return ownerLogin(low,pw);
  await signInWithEmailAndPassword(auth,id,pw);
});
async function ownerLogin(n,pw){
  if(pw.length<6)return toast("Code : 6 caractères minimum");
  const mail=ownerMail(n);
  // On tente d'abord la connexion (marche aussi si la lecture de ownerSetup est refusée avant connexion)
  try{return await signInWithEmailAndPassword(auth,mail,pw)}
  catch(e){if(e.code!=="auth/invalid-credential"&&e.code!=="auth/user-not-found")throw e}
  let claimed=null;
  try{claimed=(await get(R(`ownerSetup/${n}`))).val()}catch{}
  if(claimed)return toast("Email ou mot de passe incorrect");
  // Première connexion de l'owner : confirmation du code dans la page (plus de prompt(), bloqué sur certains mobiles)
  if($("pass2").hidden){$("pass2").hidden=false;$("pass2").focus();return toast(`Première connexion de ${n} : confirme ton code puis reclique`)}
  if($("pass2").value!==pw)return toast("Les deux codes sont différents");
  try{await createUserWithEmailAndPassword(auth,mail,pw)}
  catch(e){throw e.code==="auth/email-already-in-use"?{code:"auth/invalid-credential"}:e}
}
$("signup").onclick=guard(async()=>{
  const n=$("pseudo").value.trim(),mail=$("email").value.trim(),pw=$("pass").value;
  if(!/^[A-Za-z0-9_]{3,16}$/.test(n))return toast("Pseudo : 3 à 16 lettres, chiffres ou _");
  if(OW.includes(n.toLowerCase()))return toast("Ce pseudo est réservé");
  if(!mail)return toast("Entre ton email");
  if(/@moda\.owner$/i.test(mail))return toast("Cette adresse est réservée");
  if(pw.length<6)return toast("Mot de passe : 6 caractères minimum");
  pending=n;
  try{await createUserWithEmailAndPassword(auth,mail,pw)}catch(e){pending=null;throw e}
});
$("google").onclick=guard(async()=>{
  const p=new GoogleAuthProvider();
  try{await signInWithPopup(auth,p)}
  catch(e){ // popup bloquée / appli installée sur iPhone : on passe par une redirection
    if(e.code==="auth/popup-blocked"||e.code==="auth/operation-not-supported-in-this-environment"){await signInWithRedirect(auth,p);return}
    throw e;
  }
});
getRedirectResult(auth).catch(err);
$("out").onclick=async()=>{await leaveLobby();try{if(me)await set(R(`presence/${me.uid}`),false)}catch{}signOut(auth)};

async function ensureProfile(u){
  const s=await get(R(`users/${u.uid}/name`));if(s.exists()){pending=null;return s.val()}
  const own=ownerOf(u),want=pending;
  const base=own||clean(want||u.displayName||(u.email||"").split("@")[0]);pending=null;
  for(let i=0;i<6;i++){
    const n=i?base.slice(0,12)+Math.floor(Math.random()*1000):base,k=n.toLowerCase();
    if(!own&&OW.includes(k))continue;
    const holder=(await get(R(`usernames/${k}`))).val();
    if(holder===null||holder===u.uid){ // libre, ou déjà à nous (profil interrompu lors d'un essai précédent)
      try{
        if(holder===null)await set(R(`usernames/${k}`),u.uid);
        await set(R(`users/${u.uid}`),{name:n,createdAt:serverTimestamp()});
        if(want&&n!==want)toast(`Le pseudo « ${want} » était pris : tu es ${n}`);
        return n;
      }catch{}
    }
    if(own)break;
  }
  throw new Error("Impossible de créer le profil");
}
async function ensureOwner(u,n){
  if(!(await get(R(`owners/${u.uid}`))).exists())await set(R(`owners/${u.uid}`),true);
  if(!(await get(R(`ownerSetup/${n}`))).exists())await set(R(`ownerSetup/${n}`),true);
}
let seq=0;
const unboot=()=>$("boot").classList.add("off");
setTimeout(()=>{if(!auth.currentUser)unboot()},5000);
const transient=e=>!navigator.onLine||/offline|network|timeout|unavailable/i.test((e&&(e.message||e.code))||"");
async function run(u){
  const my=++seq;let hold=false;
  presUn.forEach(f=>f());presUn=[];
  if(!u){me=null;stopStats();$("adm").hidden=true;$("who").textContent="";$("out").hidden=true;$("net").hidden=true;setBusy(false);show("auth");return unboot()}
  setBusy(true);
  try{
    const own=ownerOf(u);
    // profil et statut owner lus en parallèle : ouverture plus rapide
    const[name,ow]=await Promise.all([ensureProfile(u),get(R(`owners/${u.uid}`)).then(x=>x.exists())]);
    if(my!==seq)return;
    let isOwner=ow;
    if(own){await ensureOwner(u,own).catch(()=>{});isOwner=(await get(R(`owners/${u.uid}`))).exists();if(my!==seq)return}
    me={uid:u.uid,name,owner:isOwner};
    $("adm").hidden=!isOwner;$("sw").setAttribute("aria-checked",String(adm&&isOwner));
    $("who").textContent=name+(isOwner?" ★":"");$("out").hidden=false;$("net").hidden=true;resetAuthForm();showHome();
    let was=false,nt;
    presUn.push(onValue(R(".info/connected"),x=>{
      clearTimeout(nt);
      if(x.val()){
        onDisconnect(R(`presence/${u.uid}`)).set(false);set(R(`presence/${u.uid}`),true).catch(()=>{});
        if(code&&lobby)onDisconnect(R(lobby.host===u.uid?`lobbies/${code}`:`lobbies/${code}/players/${u.uid}`)).remove(); // ré-armé après une coupure
        $("net").hidden=true;if(was)toast("Reconnecté ✅");was=true;
      }else if(was)nt=setTimeout(()=>{$("net").hidden=false},1200);
    }));
    watchSocial();
  }catch(e){
    if(my!==seq)return;
    if(transient(e)){ // hors ligne : on garde la session et on réessaie, sans repasser par l'écran de connexion
      hold=true;$("bootmsg").textContent="Hors ligne : reconnexion…";$("boot").classList.remove("off");
      setTimeout(()=>{const c=auth.currentUser;if(c&&!me)run(c)},4000);return;
    }
    err(e);signOut(auth).catch(()=>{});
  }finally{if(my===seq){setBusy(false);if(!hold)unboot()}}
}
onAuthStateChanged(auth,run);
addEventListener("online",()=>{const u=auth.currentUser;if(u&&!me)run(u)});

// ---------- Amis & invitations ----------
$("fadd").onclick=async()=>{
  const n=$("fname").value.trim().toLowerCase();if(!n)return;
  const t=(await get(R(`usernames/${n}`))).val();
  if(!t)return toast("Aucun joueur avec ce pseudo");if(t===me.uid)return toast("C'est toi !");
  await set(R(`friendRequests/${t}/${me.uid}`),{name:me.name});$("fname").value="";toast("Demande envoyée");
};
function watchSocial(){
  presUn.push(onValue(R(`friendRequests/${me.uid}`),s=>{const b=$("reqs");b.replaceChildren();
    Object.entries(s.val()||{}).forEach(([f,d])=>{const r=h("div",d.name+" veut être ami ");
      r.append(h("button","Accepter",async()=>{await set(R(`friends/${me.uid}/${f}`),true);await set(R(`friends/${f}/${me.uid}`),true);await remove(R(`friendRequests/${me.uid}/${f}`))}),
               h("button","Refuser",()=>remove(R(`friendRequests/${me.uid}/${f}`))));
      r.querySelectorAll("button").forEach(x=>x.className="mini");b.append(r)})}));
  presUn.push(onValue(R(`invites/${me.uid}`),s=>{const b=$("invs");b.replaceChildren();
    Object.entries(s.val()||{}).forEach(([f,d])=>{const r=h("div",d.name+" t'invite ");
      const j=h("button","Rejoindre",async()=>{await remove(R(`invites/${me.uid}/${f}`));joinLobby(d.code)});j.className="mini";r.append(j);b.append(r)})}));
  let un=[];presUn.push(()=>un.forEach(f=>f()));
  presUn.push(onValue(R(`friends/${me.uid}`),async s=>{
    un.forEach(f=>f());un=[];const box=$("friends");box.replaceChildren();
    for(const f of Object.keys(s.val()||{})){
      const n=(await get(R(`users/${f}/name`))).val()||"?";
      const row=h("div"),dot=h("span","●");dot.className="dot";
      const inv=h("button","Inviter",async()=>{if(!code)return toast("Crée d'abord un lobby");await set(R(`invites/${f}/${me.uid}`),{code,name:me.name});toast("Invitation envoyée")});inv.className="mini";
      row.append(dot,n+" ",inv);box.append(row);
      un.push(onValue(R(`presence/${f}`),p=>dot.classList.toggle("on",!!p.val())));
    }}));
}

// ---------- Lobby ----------
const rcode=()=>Array.from({length:5},()=>"ABCDEFGHJKLMNPQRSTUVWXYZ"[Math.floor(Math.random()*24)]).join("");
const firstColor=pl=>COLORS.find(c=>!Object.values(pl||{}).some(p=>p.color===c))||COLORS[0];
$("tsnake").onclick=$("create").onclick=async()=>{
  const c=rcode();
  await set(R(`lobbies/${c}`),{host:me.uid,game:"snake",status:"lobby",opts:{sp:1,wr:0,bo:1},players:{[me.uid]:{name:me.name,color:COLORS[0],ready:true}}});
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
    lobby=l;
    if(l.status==="lobby"&&l.host!==me.uid&&!(l.players&&l.players[me.uid])){ // coupure puis retour : on se réinscrit
      set(R(`lobbies/${c}/players/${me.uid}`),{name:me.name,color:firstColor(l.players),ready:false});onDisconnect(R(`lobbies/${c}/players/${me.uid}`)).remove();return}
    renderLobby();
    if(l.status==="playing"&&cur!=="game")enterGame(c);
    if(l.status==="lobby"&&cur==="game"){unState&&unState();unState=null;show("lobby")}
  });
}
function renderLobby(){
  const b=$("players"),host=lobby.host===me.uid,pl=lobby.players||{};b.replaceChildren();
  Object.entries(pl).forEach(([u,p])=>{const r=h("div",null);r.className="pl";const sw=h("span");sw.className="sw";sw.style.background=p.color;
    r.append(sw,h("span",p.name+(u===lobby.host?" (hôte)":"")+(p.wins?` 🏆${p.wins}`:"")),h("span",p.ready?"✔ prêt":"…"));b.append(r)});
  $("ready").hidden=host;$("ready").textContent=pl[me.uid]?.ready?"Pas prêt":"Prêt";
  const op=lobby.opts||{};$("oSp").textContent="⚡ Vitesse : "+["lente","normale","rapide"][op.sp??1];
  $("oWr").textContent=op.wr?"🌀 Murs : traversables":"🧱 Murs : mortels";$("oBo").textContent=op.bo===0?"🎁 Bonus : non":"🎁 Bonus : oui";
  ["oSp","oWr","oBo"].forEach(i=>$(i).disabled=!host);
  $("start").hidden=!host;$("start").disabled=!Object.values(pl).every(p=>p.ready);
}
const setOpt=(k,f)=>()=>{if(lobby&&lobby.host===me.uid)update(R(`lobbies/${code}/opts`),{[k]:f(lobby.opts||{})}).catch(err)};
$("oSp").onclick=setOpt("sp",o=>((o.sp??1)+1)%3);$("oWr").onclick=setOpt("wr",o=>o.wr?0:1);$("oBo").onclick=setOpt("bo",o=>o.bo===0?1:0);
$("ready").onclick=()=>set(R(`lobbies/${code}/players/${me.uid}/ready`),!lobby.players[me.uid].ready);
$("leave").onclick=leaveLobby;
async function leaveLobby(){
  if(!code)return;const c=code,host=lobby&&lobby.host===me.uid;local();
  onDisconnect(R(`lobbies/${c}`)).cancel();onDisconnect(R(`lobbies/${c}/players/${me.uid}`)).cancel();
  try{if(host){await remove(R(`games/${c}`));await remove(R(`lobbies/${c}`))}else await remove(R(`lobbies/${c}/players/${me.uid}`))}catch{}
}
function local(){unLobby&&unLobby();unState&&unState();unLobby=unState=null;code=lobby=null;if(me)showHome()}

// ---------- Jeu : affichage (tous les joueurs) ----------
let st=null,pv=null,tAt=0,tDt=130,raf=0,parts=[],mute=false,ac;
try{mute=localStorage.getItem("moda.mute")==="1"}catch{}
const AC=()=>{try{ac=ac||new AudioContext();ac.resume()}catch{}};
addEventListener("pointerdown",AC,{once:true});addEventListener("keydown",AC,{once:true});
const beep=(f,d=.08,t="square",v=.04,f2)=>{if(mute||!ac)return;try{const T=ac.currentTime,o=ac.createOscillator(),g=ac.createGain();o.type=t;o.frequency.setValueAtTime(f,T);if(f2)o.frequency.exponentialRampToValueAtTime(f2,T+d);
  g.gain.setValueAtTime(v,T);g.gain.exponentialRampToValueAtTime(.001,T+d);o.connect(g);g.connect(ac.destination);o.start(T);o.stop(T+d)}catch{}};
const muteUI=()=>$("mute").textContent=mute?"🔇":"🔊";muteUI();
$("mute").onclick=()=>{mute=!mute;try{localStorage.setItem("moda.mute",mute?"1":"0")}catch{}muteUI()};
const burst=(a,b,c,n)=>{for(let i=0;i<n;i++){const r=Math.random()*6.28,v=2+Math.random()*5;parts.push({x:a+.5,y:b+.5,vx:Math.cos(r)*v,vy:Math.sin(r)*v,l:1,c})}};
function enterGame(c){
  show("game");lastDir=null;st=pv=null;parts=[];
  unState=onValue(R(`games/${c}/state`),s=>{if(s.val())onState(JSON.parse(s.val()))});
  if(!raf)raf=requestAnimationFrame(frame);
}
function onState(n){
  const now=performance.now();if(st)tDt=Math.min(250,Math.max(60,tDt*.6+(now-tAt)*.4));
  pv=st;st=n;tAt=now;const mine=u=>me&&u===me.uid;
  if(n.cd&&(!pv||pv.cd!==n.cd))beep(520,.1,"sine");
  if(pv&&n.o&&!pv.o)beep(n.w?880:200,.3,"triangle",.06);
  Object.entries(n.s).forEach(([u,s])=>{const o=pv&&pv.s[u];if(!o)return;
    if(o.a&&!s.a){burst(o.b[0][0],o.b[0][1],s.c,26);beep(180,.35,"sawtooth",.05,50);if(mine(u)&&navigator.vibrate)navigator.vibrate(80)}
    else if(s.p>o.p&&s.b[0]){burst(s.b[0][0],s.b[0][1],s.c,8);if(mine(u)){const g=s.p-o.p>1;beep(g?880:620,.07,"square",.04,g?1320:820)}}
    if(s.sh>0&&!o.sh&&mine(u))beep(300,.25,"sine",.05,900)});
  $("score").replaceChildren(...Object.values(n.s).sort((a,b)=>b.p-a.p).map(s=>{const d=h("div",`${s.n} : ${s.p}${s.sh>0?" 🛡":""}${s.a?"":" ✖"}`);d.style.color=s.c;d.style.fontWeight=600;return d}));
  $("ov").textContent=n.cd?n.cd:n.o?(n.w?`${n.w} gagne !`:"Fin de partie"):"";
}
function frame(now){
  if(cur!=="game"){raf=0;return}
  raf=requestAnimationFrame(frame);if(!st)return;
  const cv=$("cv"),x=cv.getContext("2d"),k=cv.width/st.W,p=Math.min(1,(now-tAt)/tDt),mid=me&&me.uid;
  x.fillStyle="#0e0a22";x.fillRect(0,0,cv.width,cv.height);
  x.fillStyle="#1a1438";for(let i=0;i<st.W;i++)for(let j=0;j<st.H;j++)if((i+j)%2)x.fillRect(i*k,j*k,k,k);
  x.textAlign="center";x.textBaseline="middle";
  st.f.forEach(([a,b,t,l])=>{const cx=(a+.5)*k,cy=(b+.5)*k,pu=1+.12*Math.sin(now/180+a);
    if(t&&l<25&&Math.floor(now/140)%2)return;
    if(!t){x.fillStyle="#fff";x.beginPath();x.arc(cx,cy,k*.3*pu,0,7);x.fill()}
    else{x.font=`${k*.95*pu}px sans-serif`;x.fillText(t===1?"⭐":"🛡️",cx,cy)}});
  Object.entries(st.s).forEach(([u,s])=>{
    if(!s.b.length)return;
    const o=pv&&pv.s[u],ob=o&&o.b.length?o.b:s.b;
    const pts=s.b.map((c,i)=>{const q=ob[Math.min(i,ob.length-1)],j=Math.abs(q[0]-c[0])>1||Math.abs(q[1]-c[1])>1;return[(j?c[0]:q[0]+(c[0]-q[0])*p)+.5,(j?c[1]:q[1]+(c[1]-q[1])*p)+.5]});
    x.save();x.globalAlpha=s.sh>0?.55+.25*Math.sin(now/80):1;
    x.strokeStyle=s.c;x.lineCap=x.lineJoin="round";x.lineWidth=k*.78;
    if(u===mid){x.shadowColor=s.c;x.shadowBlur=14}
    x.beginPath();pts.forEach(([a,b],i)=>{if(!i||Math.abs(a-pts[i-1][0])>1.5||Math.abs(b-pts[i-1][1])>1.5)x.moveTo(a*k,b*k);else x.lineTo(a*k,b*k)});x.stroke();
    x.shadowBlur=0;x.globalAlpha=1;
    const[hx,hy]=pts[0],[dx,dy]=s.d,e=k*.17;
    [-1,1].forEach(sd=>{const ex=(hx+dx*.22-dy*.22*sd)*k,ey=(hy+dy*.22+dx*.22*sd)*k;
      x.fillStyle="#fff";x.beginPath();x.arc(ex,ey,e,0,7);x.fill();x.fillStyle="#14102b";x.beginPath();x.arc(ex+dx*e*.35,ey+dy*e*.35,e*.5,0,7);x.fill()});
    if(s.sh>0){x.strokeStyle="#3ee6c4";x.lineWidth=3;x.beginPath();x.arc(hx*k,hy*k,k*.85,0,7);x.stroke()}
    x.restore()});
  const dt=Math.min(.05,(now-(frame.t||now))/1000);frame.t=now;
  parts=parts.filter(q=>(q.l-=dt*1.6)>0);
  parts.forEach(q=>{q.x+=q.vx*dt;q.y+=q.vy*dt;x.globalAlpha=q.l;x.fillStyle=q.c;x.fillRect(q.x*k-3,q.y*k-3,6,6)});x.globalAlpha=1;
}
const KEYS={ArrowUp:"U",w:"U",z:"U",ArrowDown:"D",s:"D",ArrowLeft:"L",a:"L",q:"L",ArrowRight:"R",d:"R"};
let seqN=0;const send=d=>{if(cur!=="game"||d===lastDir)return;lastDir=d;set(R(`games/${code}/inputs/${me.uid}`),d+(++seqN))};
addEventListener("keydown",e=>{if(cur!=="game"||/^(INPUT|TEXTAREA)$/.test(e.target.tagName))return;const d=KEYS[e.key.length>1?e.key:e.key.toLowerCase()];if(d){e.preventDefault();send(d)}});
let t0;const cvs=$("cv");
cvs.addEventListener("touchstart",e=>{t0=e.touches[0]},{passive:true});
cvs.addEventListener("touchmove",e=>{e.preventDefault();if(!t0||cur!=="game")return;const t=e.touches[0],dx=t.clientX-t0.clientX,dy=t.clientY-t0.clientY;
  if(Math.max(Math.abs(dx),Math.abs(dy))>20){send(Math.abs(dx)>Math.abs(dy)?(dx>0?"R":"L"):(dy>0?"D":"U"));t0=t}},{passive:false});
document.querySelectorAll("#pad button").forEach(b=>{const f=e=>{e.preventDefault();send(b.dataset.d)};b.addEventListener("pointerdown",f)});

// ---------- Jeu : boucle de l'hôte ----------
$("start").onclick=async()=>{
  const c=code,players=lobby.players,ids=Object.keys(players),o=lobby.opts||{},W=40,H=28;
  const base=[170,120,85][o.sp??1],wrap=!!o.wr,bonus=o.bo!==0;
  await remove(R(`games/${c}`));
  await update(R(`lobbies/${c}`),{status:"playing"});
  const V={U:[0,-1],D:[0,1],L:[-1,0],R:[1,0]},q={},seen={},snakes={},food=[];
  ids.forEach((u,i)=>{const y=3+i*3;q[u]=[];snakes[u]={n:players[u].name,c:players[u].color,a:true,p:0,g:0,sh:0,d:V.R,b:[[5,y],[4,y],[3,y]]}});
  // file d'attente de virages (3 max par joueur) : un virage par tick, aucun n'est perdu
  const un=onValue(R(`games/${c}/inputs`),s=>Object.entries(s.val()||{}).forEach(([u,v])=>{if(q[u]&&seen[u]!==v&&V[v[0]]){seen[u]=v;if(q[u].length<3)q[u].push(v[0])}}));
  const free=()=>{const t=new Set();Object.values(snakes).forEach(s=>s.b.forEach(c=>t.add(c+"")));food.forEach(f=>t.add(f[0]+","+f[1]));
    for(;;){const p=[Math.floor(Math.random()*W),Math.floor(Math.random()*H)];if(!t.has(p+""))return p}};
  const pub=(x={})=>set(R(`games/${c}/state`),JSON.stringify({W,H,f:food,s:snakes,...x}));
  for(let i=0;i<Math.max(3,ids.length+2);i++)food.push([...free(),0,0]); // [x,y,type(0 pomme,1 étoile,2 bouclier),durée]
  for(let n=3;n>0;n--){await pub({cd:n});await new Promise(r=>setTimeout(r,1000))}
  const step=()=>{
    if(code!==c){un();return} // l'hôte a quitté : on arrête tout
    const alive=Object.keys(snakes).filter(u=>snakes[u].a),heads={},occ=new Set(),hc={};
    alive.forEach(u=>{const s=snakes[u];
      while(q[u].length){const d=V[q[u].shift()];if(d[0]*s.d[0]+d[1]*s.d[1]===0){s.d=d;break}}
      let x=s.b[0][0]+s.d[0],y=s.b[0][1]+s.d[1];
      if(wrap||s.sh>0){x=(x+W)%W;y=(y+H)%H}
      heads[u]=[x,y];hc[x+","+y]=(hc[x+","+y]||0)+1;s.b.forEach(c=>occ.add(c+""))});
    alive.forEach(u=>{const s=snakes[u],[x,y]=heads[u],k=x+","+y,ghost=s.sh>0;
      if(ghost)s.sh--;
      if(!ghost&&(x<0||y<0||x>=W||y>=H||occ.has(k)||hc[k]>1)){s.a=false;s.b=[];return}
      s.b.unshift([x,y]);const fi=food.findIndex(f=>f[0]===x&&f[1]===y);
      if(fi>=0){const f=food.splice(fi,1)[0];
        if(f[2]===2)s.sh=40;else{const n=f[2]===1?3:1;s.p+=n;s.g+=n}
        if(!f[2])food.push([...free(),0,0])}
      if(s.g>0)s.g--;else s.b.pop()});
    food.forEach(f=>{if(f[2])f[3]--});
    for(let i=food.length;i--;)if(food[i][2]&&food[i][3]<=0)food.splice(i,1);
    if(bonus&&food.filter(f=>f[2]).length<2&&Math.random()<.025)food.push([...free(),Math.random()<.65?1:2,100]);
    const left=Object.keys(snakes).filter(u=>snakes[u].a);
    if(ids.length>1?left.length<=1:left.length===0){
      un();set(R("stats/gamesPlayed"),increment(1)).catch(()=>{});pub({o:1,w:left[0]?snakes[left[0]].n:null});
      setTimeout(async()=>{const cp=(lobby&&lobby.players)||{},up={status:"lobby"};
        ids.filter(u=>cp[u]).forEach(u=>up[`players/${u}/ready`]=u===me.uid);
        if(ids.length>1&&left[0]&&cp[left[0]])up[`players/${left[0]}/wins`]=(cp[left[0]].wins||0)+1;
        try{await update(R(`lobbies/${c}`),up)}catch{}},5000);
      return;
    }
    pub();
    // la partie accélère quand les serpents grandissent
    setTimeout(step,Math.max(60,base-Math.max(...Object.values(snakes).map(s=>s.p))*2));
  };
  step();
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
    const typing=/^(INPUT|TEXTAREA)$/.test(document.activeElement&&document.activeElement.tagName)||busy||["pseudo","email","pass","pass2"].some(i=>$(i).value);
    if(!typing&&(cur==="home"||cur==="stats"||cur==="auth")){location.reload();return}
    $("upd").hidden=false;
  });
  const check=()=>{navigator.serviceWorker.controller&&navigator.serviceWorker.controller.postMessage({type:"check"});navigator.serviceWorker.getRegistration().then(r=>r&&r.update()).catch(()=>{})};
  document.addEventListener("visibilitychange",()=>{if(!document.hidden)check()});
  setInterval(check,10*60*1000);setTimeout(check,4000);
  $("updbtn").onclick=async()=>{
    const b=$("updbtn");b.disabled=true;b.textContent="Mise à jour…";
    const purge=(async()=>{
      try{await Promise.all((await navigator.serviceWorker.getRegistrations()).map(r=>r.unregister()))}catch{}
      try{await Promise.all((await caches.keys()).map(k=>caches.delete(k)))}catch{}
      // GitHub Pages garde les fichiers 10 min dans le cache HTTP : on force leur re-téléchargement
      await Promise.all(["app.js","index.html"].map(f=>fetch(f,{cache:"reload"}).catch(()=>{})));
    })();
    await Promise.race([purge,new Promise(r=>setTimeout(r,4000))]); // jamais bloqué sur « Mise à jour… »
    location.replace(location.pathname+"?u="+Date.now());
  };
  // Après une mise à jour, on retire le ?u=… de l'adresse
  if(/[?&]u=\d+/.test(location.search))history.replaceState(null,"",location.pathname+location.hash);
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
