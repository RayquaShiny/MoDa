import {initializeApp} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {getAuth,onAuthStateChanged,createUserWithEmailAndPassword,signInWithEmailAndPassword,signInWithPopup,signInWithRedirect,getRedirectResult,GoogleAuthProvider,signOut,sendPasswordResetEmail} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {getDatabase,ref,get,set,update,remove,onValue,onDisconnect,serverTimestamp,increment} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js";
import {startSim,createSimClient} from "./sim.js";

// 1) Colle ici la config de ton projet Firebase (Paramètres du projet > Tes applications > Web)
const cfg={apiKey:"AIzaSyCU2qkeRozdFeIybYQQjy9PssnqxBbYdIo",authDomain:"moda-ac6b2.firebaseapp.com",databaseURL:"https://moda-ac6b2-default-rtdb.europe-west1.firebasedatabase.app",projectId:"moda-ac6b2",storageBucket:"moda-ac6b2.firebasestorage.app",messagingSenderId:"79010938897",appId:"1:79010938897:web:4cf8ffe4ca61e04ada31b0"};
const app=initializeApp(cfg),auth=getAuth(app),db=getDatabase(app);
const VER="17";
const $=i=>document.getElementById(i)||document.createElement("div");
{const m=document.querySelector('meta[name="moda-v"]');$("ver").textContent=m&&m.content===VER?"MoDa v"+VER:"";
 if(!m||m.content!==VER)setTimeout(()=>toast("⚠️ index.html et app.js ne sont pas de la même version : renvoie les DEUX fichiers sur GitHub, puis recharge"),900)}
const h=(t,txt,fn)=>{const e=document.createElement(t);if(txt!=null)e.textContent=txt;if(fn)e.onclick=fn;return e};
const R=p=>ref(db,p);
const TOUCH=matchMedia("(hover:none) and (pointer:coarse)").matches,LOW=TOUCH||(navigator.hardwareConcurrency||8)<=4; // écran tactile : mode plein écran + effets allégés
const COLORS=["#ff4d6d","#3ee6c4","#ffd23f","#6c8cff","#ff9f1c","#c77dff","#80ed99","#f8f9fa"];
const VIEWS=["auth","home","stats","lobby","game","sim"];
const OW=["rayqua","8x"],ownerMail=n=>`${n}@moda.owner`;
const ownerOf=u=>OW.find(n=>u.email===ownerMail(n));
let adm=false,unStats=[];try{adm=localStorage.getItem("moda.stats")==="1"}catch{}
let me=null,cur="auth",code=null,lobby=null,pending=null,unLobby=null,unState=null,presUn=[],lastDir=null;
const show=v=>{cur=v;VIEWS.forEach(x=>$(x).hidden=x!==v);$("side").hidden=v==="auth";
  document.body.classList.toggle("gm",TOUCH&&v==="game"); // plein écran de jeu sur téléphone
  if(v!=="game"){resetTouch();unwake()}};
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
const err=e=>{console.error(e);const m=MSG[e&&e.code];if(m==="")return;const t=m||("Erreur : "+((e&&e.message)||e));if(cur==="auth")authMsg(t);else toast(t)};
if(cfg.apiKey==="A_REMPLACER")setTimeout(()=>toast("Config Firebase manquante dans app.js"),500);

// Écran de connexion : deux onglets (Connexion / Créer un compte), erreurs affichées sous le formulaire
let busy=false,tab="login";
const setBusy=v=>{busy=v;["login","signup","google","forgot"].forEach(i=>$(i).disabled=v);$("auth").classList.toggle("busy",v)};
const authMsg=(m,ok)=>{const a=$("amsg");a.textContent=m||"";a.className=m?(ok?"ok":"bad"):"";a.hidden=!m};
const bad=(id,m)=>{authMsg(m);const e=$(id);e.classList.add("err");e.focus()};
const AFIELDS=["pseudo","email","pass","pass2"],PSEUDO_OK=/^[A-Za-z0-9_]{3,16}$/,MAIL_OK=/^[^@\s]+@[^@\s]+\.[^@\s]+$/;
AFIELDS.forEach(i=>$(i).addEventListener("input",()=>{$(i).classList.remove("err");authMsg("")}));
$("pseudo").addEventListener("input",()=>{const v=$("pseudo").value.trim(),ok=PSEUDO_OK.test(v),t=$("pseudoHint");
  t.textContent=!v?"3 à 16 lettres, chiffres ou _":ok?"✔ Pseudo valide":"3 à 16 lettres, chiffres ou _ (sans espace ni accent)";t.className="hint"+(ok?" good":"")});
const setTab=t=>{
  tab=t;const su=t==="signup";
  $("tabLogin").setAttribute("aria-selected",String(!su));$("tabSignup").setAttribute("aria-selected",String(su));
  $("atitle").textContent=su?"Crée ton compte":"Content de te revoir 👋";
  $("asub").textContent=su?"Un pseudo, un email, un mot de passe : et c'est parti.":"Connecte-toi pour retrouver tes potes et tes lobbys.";
  $("fPseudo").hidden=!su;$("login").hidden=su;$("signup").hidden=!su;$("forgot").hidden=su;$("passHint").hidden=!su;
  $("lblEmail").textContent=su?"Email":"Email (ou pseudo owner)";
  $("pass").autocomplete=su?"new-password":"current-password";$("pass").placeholder=su?"6 caractères minimum":"Ton mot de passe";
  $("pass2w").hidden=true;$("pass2").value="";authMsg("");AFIELDS.forEach(i=>$(i).classList.remove("err"));
};
$("tabLogin").onclick=()=>setTab("login");$("tabSignup").onclick=()=>setTab("signup");
$("eye").onclick=()=>{const s=$("pass").type==="password";$("pass").type=$("pass2").type=s?"text":"password";$("eye").textContent=s?"🙈":"👁";$("eye").setAttribute("aria-label",s?"Masquer le mot de passe":"Afficher le mot de passe")};
// Entrée valide le formulaire de l'onglet affiché
AFIELDS.forEach(i=>$(i).addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();(tab==="signup"?$("signup"):$("login")).click()}}));
const guard=fn=>async()=>{
  if(busy)return;setBusy(true);
  try{await fn()}catch(e){err(e)}
  finally{if(!auth.currentUser)setBusy(false)} // si connecté, c'est onAuthStateChanged qui débloque une fois le profil prêt
};
const resetAuthForm=()=>{$("pass").value="";$("pass2").value="";$("pass2w").hidden=true;authMsg("")};

$("login").onclick=guard(async()=>{
  const id=$("email").value.trim(),pw=$("pass").value,low=id.toLowerCase().replace(/@moda\.owner$/,"");
  if(!id)return bad("email","Entre ton email");
  if(!pw)return bad("pass","Entre ton mot de passe");
  authMsg("");
  if(OW.includes(low))return ownerLogin(low,pw);
  await signInWithEmailAndPassword(auth,id,pw);
});
async function ownerLogin(n,pw){
  if(pw.length<6)return bad("pass","Code : 6 caractères minimum");
  const mail=ownerMail(n);
  // On tente d'abord la connexion (marche aussi si la lecture de ownerSetup est refusée avant connexion)
  try{return await signInWithEmailAndPassword(auth,mail,pw)}
  catch(e){if(e.code!=="auth/invalid-credential"&&e.code!=="auth/user-not-found")throw e}
  let claimed=null;
  try{claimed=(await get(R(`ownerSetup/${n}`))).val()}catch{}
  if(claimed)return authMsg("Email ou mot de passe incorrect");
  // Première connexion de l'owner : confirmation du code dans la page (plus de prompt(), bloqué sur certains mobiles)
  if($("pass2w").hidden){$("pass2w").hidden=false;$("pass2").focus();return authMsg(`Première connexion de ${n} : confirme ton code ci-dessous, puis clique à nouveau`,true)}
  if($("pass2").value!==pw)return bad("pass2","Les deux codes sont différents");
  try{await createUserWithEmailAndPassword(auth,mail,pw)}
  catch(e){throw e.code==="auth/email-already-in-use"?{code:"auth/invalid-credential"}:e}
}
$("signup").onclick=guard(async()=>{
  const n=$("pseudo").value.trim(),mail=$("email").value.trim(),pw=$("pass").value;
  if(!PSEUDO_OK.test(n))return bad("pseudo","Pseudo : 3 à 16 lettres, chiffres ou _");
  if(OW.includes(n.toLowerCase()))return bad("pseudo","Ce pseudo est réservé");
  if(!mail)return bad("email","Entre ton email");
  if(!MAIL_OK.test(mail))return bad("email","Adresse email invalide");
  if(/@moda\.owner$/i.test(mail))return bad("email","Cette adresse est réservée");
  if(pw.length<6)return bad("pass","Mot de passe : 6 caractères minimum");
  pending=n;
  try{await createUserWithEmailAndPassword(auth,mail,pw)}catch(e){pending=null;throw e}
});
$("forgot").onclick=guard(async()=>{
  const m=$("email").value.trim();
  if(!MAIL_OK.test(m)||/@moda\.owner$/i.test(m))return bad("email","Entre l'email de ton compte, puis clique sur « Mot de passe oublié ? »");
  await sendPasswordResetEmail(auth,m);
  authMsg(`Email envoyé à ${m} : clique sur le lien reçu (regarde aussi dans les spams).`,true);
});
setTab("login");
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
$("fname").addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();$("fadd").click()}});
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
const mkLobby=game=>async()=>{
  const c=rcode();
  await set(R(`lobbies/${c}`),{host:me.uid,game,status:"lobby",opts:{sp:1,wr:0,bo:1},players:{[me.uid]:{name:me.name,color:COLORS[0],ready:true}}});
  onDisconnect(R(`lobbies/${c}`)).remove();enter(c);
};
$("tsnake").onclick=mkLobby("snake");$("tsurv").onclick=mkLobby("surv");$("tbr").onclick=mkLobby("br");$("tlab").onclick=mkLobby("lab");$("tsim").onclick=mkLobby("sim");
$("join").onclick=()=>joinLobby($("joincode").value.trim().toUpperCase());
$("joincode").addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();$("join").click()}});
async function joinLobby(c){
  if(code)await leaveLobby();
  const l=(await get(R(`lobbies/${c}`))).val();
  if(!l)return toast("Lobby introuvable");
  if(l.status!=="lobby"&&l.game!=="sim")return toast("Partie déjà en cours");
  const pl=l.players||{};if(Object.keys(pl).length>=8&&!pl[me.uid])return toast("Lobby plein (8 max)");
  await set(R(`lobbies/${c}/players/${me.uid}`),{name:me.name,color:firstColor(pl),ready:false});
  onDisconnect(R(`lobbies/${c}/players/${me.uid}`)).remove();enter(c);
}
function enter(c){
  code=c;stopStats();show("lobby");$("lcode").textContent=c;
  unLobby=onValue(R(`lobbies/${c}`),s=>{
    const l=s.val();if(!l){if(code){local();toast("Le lobby a été fermé")}return}
    lobby=l;
    if((l.status==="lobby"||l.game==="sim")&&l.host!==me.uid&&!(l.players&&l.players[me.uid])){ // coupure puis retour : on se réinscrit
      set(R(`lobbies/${c}/players/${me.uid}`),{name:me.name,color:firstColor(l.players),ready:false});onDisconnect(R(`lobbies/${c}/players/${me.uid}`)).remove();return}
    renderLobby();
    if(l.status==="playing"&&cur!==(l.game==="sim"?"sim":"game"))enterGame(c);
    if(l.status==="lobby"&&(cur==="game"||cur==="sim")){unState&&unState();unState=null;show("lobby")}
  });
}
function renderLobby(){
  const b=$("players"),host=lobby.host===me.uid,pl=lobby.players||{};b.replaceChildren();
  Object.entries(pl).forEach(([u,p])=>{const r=h("div",null);r.className="pl";const sw=h("span");sw.className="sw";sw.style.background=p.color;
    r.append(sw,h("span",p.name+(u===lobby.host?" (hôte)":"")+(p.wins?` 🏆${p.wins}`:"")),h("span",p.ready?"✔ prêt":"…"));b.append(r)});
  $("ready").hidden=host;$("ready").textContent=pl[me.uid]?.ready?"Pas prêt":"Prêt";
  $("ltitle").textContent={snake:"🐍 Snake",surv:"🧟 Survie coop",br:"🪂 Battle Royale",lab:"🗝️ Évasion coop",sim:"⛏️ Mine Simulator"}[lobby.game]||"Lobby";
  $("opts").style.display=lobby.game==="snake"?"":"none";
  const op=lobby.opts||{};$("oSp").textContent="⚡ Vitesse : "+["lente","normale","rapide"][op.sp??1];
  $("oWr").textContent=op.wr?"🌀 Murs : traversables":"🧱 Murs : mortels";$("oBo").textContent=op.bo===0?"🎁 Bonus : non":"🎁 Bonus : oui";
  ["oSp","oWr","oBo"].forEach(i=>$(i).disabled=!host);
  const need=lobby.game==="br"?2:1,cnt=Object.keys(pl).length,all=Object.values(pl).every(p=>p.ready); // le battle royale ne se lance jamais seul
  $("start").hidden=!host;$("start").disabled=!all||cnt<need;
  $("lneed").textContent=cnt<need?`⏳ Il faut au moins ${need} joueurs pour lancer la partie (${cnt}/${need}) : invite un pote !`:!all?"En attente que tout le monde soit prêt…":"";
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
// ---------- Mine Simulator (sim.js + simcore.js) : monde partagé, progression sauvegardée dans users/<uid>/sim ----------
let sc=null;
const simEnv=()=>({R,get,set,update,remove,onValue,increment,$,h,toast,beep,show,leave:leaveLobby,getMe:()=>me,getCode:()=>code,getLobby:()=>lobby});
function enterSimGame(c){sc=sc||createSimClient(simEnv());return sc.enter(c)}
function local(){unLobby&&unLobby();unState&&unState();unLobby=unState=null;code=lobby=null;if(me)showHome()}

// ---------- Jeu : affichage (tous les joueurs) ----------
let gk="snake",lastMv="",st=null,pv=null,tAt=0,tDt=130,raf=0,parts=[],mute=false,ac,pred=null,scoreKey="",gx=null,vsc=1;
try{mute=localStorage.getItem("moda.mute")==="1"}catch{}
const AC=()=>{try{ac=ac||new(window.AudioContext||window.webkitAudioContext)();if(ac.state!=="running")ac.resume()}catch{}};
["pointerdown","touchend","click","keydown"].forEach(t=>addEventListener(t,AC,{passive:true}));
document.addEventListener("visibilitychange",()=>{if(!document.hidden)AC()});
const beep=(f,d=.08,t="square",v=.04,f2)=>{if(mute||!ac)return;try{const T=ac.currentTime,o=ac.createOscillator(),g=ac.createGain();o.type=t;o.frequency.setValueAtTime(f,T);if(f2)o.frequency.exponentialRampToValueAtTime(f2,T+d);
  g.gain.setValueAtTime(v,T);g.gain.exponentialRampToValueAtTime(.001,T+d);o.connect(g);g.connect(ac.destination);o.start(T);o.stop(T+d)}catch{}};
const muteUI=()=>$("mute").textContent=mute?"🔇":"🔊";muteUI();
$("mute").onclick=()=>{mute=!mute;try{localStorage.setItem("moda.mute",mute?"1":"0")}catch{}muteUI()};
const burst=(a,b,c,n)=>{if(LOW)n=Math.ceil(n/2);if(parts.length>150)return;for(let i=0;i<n;i++){const r=Math.random()*6.28,v=2+Math.random()*5;parts.push({x:a+.5,y:b+.5,vx:Math.cos(r)*v,vy:Math.sin(r)*v,l:1,c})}};

// ---------- Outils de rendu et de confort (téléphone) ----------
// Contexte du canvas : sans transparence (plus rapide) ; sur téléphone on coupe les ombres floues, très coûteuses sous iOS
function gctx(){
  if(gx)return gx;gx=$("cv").getContext("2d",{alpha:false});
  if(LOW)try{Object.defineProperty(gx,"shadowBlur",{get:()=>0,set(){},configurable:true})}catch{}
  return gx;
}
// Le jeu est parfois affiché petit (téléphone en portrait) : on agrandit l'interface dessinée pour qu'elle reste lisible
const calcVs=()=>{const w=$("cv").clientWidth;vsc=w>0?Math.max(1,Math.min(1.6,.8*800/w)):1};
try{new ResizeObserver(calcVs).observe($("cv"))}catch{addEventListener("resize",calcVs)}
// Fonds et effets qui ne changent pas : dessinés une seule fois puis recopiés (au lieu de centaines de fillRect par image)
const mkC=(w,h)=>{const c=document.createElement("canvas");c.width=w;c.height=h;return c};
let skBg=null,svBg=null;const vigs={},glows={};
const snakeBg=(W,H,k)=>{const key=W+"x"+H+"x"+k;if(skBg&&skBg.key===key)return skBg;const c=mkC(W*k,H*k),g=c.getContext("2d");
  g.fillStyle="#0e0a22";g.fillRect(0,0,c.width,c.height);g.fillStyle="#1a1438";for(let i=0;i<W;i++)for(let j=0;j<H;j++)if((i+j)%2)g.fillRect(i*k,j*k,k,k);c.key=key;return skBg=c};
const survBg=()=>{if(svBg)return svBg;const c=mkC(820,580),g=c.getContext("2d");g.fillStyle="#0e0a22";g.fillRect(0,0,820,580);g.fillStyle="#1a1438";
  for(let i=0;i<800;i+=40)for(let j=0;j<560;j+=40)if((i+j)%80===0)g.fillRect(i+10,j+10,40,40);return svBg=c};
const vig=(r0,a)=>{const k=r0+a;if(vigs[k])return vigs[k];const c=mkC(800,560),g=c.getContext("2d"),gr=g.createRadialGradient(400,280,r0,400,280,520);
  gr.addColorStop(0,"#0000");gr.addColorStop(1,"#000"+a);g.fillStyle=gr;g.fillRect(0,0,800,560);return vigs[k]=c};
const glow=(col,r)=>{const k=col+r;if(glows[k])return glows[k];const c=mkC(84,84),g=c.getContext("2d"),gr=g.createRadialGradient(42,42,2,42,42,r);
  gr.addColorStop(0,col+"99");gr.addColorStop(1,col+"00");g.fillStyle=gr;g.fillRect(0,0,84,84);return glows[k]=c};
// Interface HTML : on ne touche au DOM que si le texte a vraiment changé (10 fois par seconde sinon)
function setScore(a){const k=a.map(e=>e[0]+"|"+e[1]).join("\n");if(k===scoreKey)return;scoreKey=k;
  $("score").replaceChildren(...a.map(([t,c])=>{const d=h("div",t);d.style.color=c;d.style.fontWeight=600;return d}))}
function setOv(t){t=String(t);const e=$("ov");if(e.textContent!==t)e.textContent=t}
// Prédiction locale : mon personnage bouge tout de suite à l'écran (sans attendre l'aller-retour avec l'hôte),
// puis se recale en douceur sur la position officielle. Même vitesse et mêmes murs que la simulation de l'hôte.
function predict(dt,sx,sy,spd,x0,x1,y0,y1,blocked){
  const a=(held.has("R")?1:0)-(held.has("L")?1:0),b=(held.has("D")?1:0)-(held.has("U")?1:0),mvg=(a||b)&&!st.cd&&!st.o&&!st.fz;
  if(!pred||Math.hypot(pred.x-sx,pred.y-sy)>140)pred={x:sx,y:sy};
  if(mvg){const n=a&&b?.707:1,nx=pred.x+a*n*spd*dt,ny=pred.y+b*n*spd*dt;
    if(!blocked||!blocked(nx,pred.y))pred.x=Math.max(x0,Math.min(x1,nx));
    if(!blocked||!blocked(pred.x,ny))pred.y=Math.max(y0,Math.min(y1,ny))}
  const ex=sx-pred.x,ey=sy-pred.y,e=Math.hypot(ex,ey),k=mvg?(e>Math.max(55,spd*.7)?Math.min(1,dt*4):0):Math.min(1,dt*10);
  pred.x+=ex*k;pred.y+=ey*k;return[pred.x,pred.y];
}
// Cadence régulière pour l'hôte : un setTimeout dérive, surtout sur un téléphone chargé
const mkPace=()=>{let due=0;return(ms,fn)=>{const t=performance.now();due=due?due+ms:t+ms;if(due<t)due=t;setTimeout(fn,Math.max(0,due-t))}};
// Écran toujours allumé pendant une partie (sinon l'iPhone se verrouille et l'hôte coupe la partie)
let wl=null;
async function wake(){try{if(!navigator.wakeLock||wl||document.hidden)return;const l=await navigator.wakeLock.request("screen");
  if(cur!=="game"){l.release();return}wl=l;l.addEventListener("release",()=>{if(wl===l)wl=null})}catch{wl=null}}
function unwake(){try{wl&&wl.release()}catch{}wl=null}
let hinted=0;
function orientHint(){if(!TOUCH||hinted||gk==="snake")return;if(matchMedia("(orientation:portrait)").matches){hinted=1;setTimeout(()=>{if(cur==="game")toast("📱 Astuce : tourne ton téléphone en paysage pour une vue plus grande")},1600)}}
function enterGame(c){
  if(lobby&&lobby.game==="sim"){unState=enterSimGame(c);return}
  show("game");lastDir=null;st=pv=null;parts=[];gk=lobby&&["surv","br","lab"].includes(lobby.game)?lobby.game:"snake";held.clear();lastMv="";$("ov").style.fontSize=gk==="snake"?"min(56px,11vw)":"min(34px,6.5vw)";mine=-1;vk="";vbox.style.display="none";
  pred=null;scoreKey="";document.body.dataset.g=gk;ctlUI();calcVs();wake();orientHint();gameSetup();
  unState=onValue(R(`games/${c}/state`),s=>{if(s.val())onState(JSON.parse(s.val()))});
  if(!raf)raf=requestAnimationFrame(frame);
}
function onState(n){
  if(n.k==="surv")return onSurv(n);
  if(n.k==="lab")return onLab(n);
  if(n.k==="br")return onBr(n);
  const now=performance.now();if(st)tDt=Math.min(250,Math.max(60,tDt*.6+(now-tAt)*.4));
  pv=st;st=n;tAt=now;const mine=u=>me&&u===me.uid;
  if(n.cd&&(!pv||pv.cd!==n.cd))beep(520,.1,"sine");
  if(pv&&n.o&&!pv.o)beep(n.w?880:200,.3,"triangle",.06);
  Object.entries(n.s).forEach(([u,s])=>{const o=pv&&pv.s[u];if(!o)return;
    if(o.a&&!s.a){burst(o.b[0][0],o.b[0][1],s.c,26);beep(180,.35,"sawtooth",.05,50);if(mine(u)&&navigator.vibrate)navigator.vibrate(80)}
    else if(s.p>o.p&&s.b[0]){burst(s.b[0][0],s.b[0][1],s.c,8);if(mine(u)){const g=s.p-o.p>1;beep(g?880:620,.07,"square",.04,g?1320:820)}}
    if(s.sh>0&&!o.sh&&mine(u))beep(300,.25,"sine",.05,900)});
  setScore(Object.values(n.s).sort((a,b)=>b.p-a.p).map(s=>[`${s.n} : ${s.p}${s.sh>0?" 🛡":""}${s.a?"":" ✖"}`,s.c]));
  setOv(n.cd?n.cd:n.o?(n.w?`${n.w} gagne !`:"Fin de partie"):"");
}
let mine=-1,vk="",shk=0;const aim={};
const vbox=document.createElement("div");vbox.style.cssText="position:absolute;left:0;right:0;bottom:14px;display:none;gap:8px;justify-content:center;flex-wrap:wrap;padding:0 8px";
if($("ov").parentElement)$("ov").parentElement.append(vbox);
const vote=i=>{if(cur!=="game"||gk!=="surv"||vbox.style.display!=="flex")return;mine=i;set(R(`games/${code}/inputs/${me.uid}`),`v,${i},${++seqN}`).catch(()=>{})};
addEventListener("keydown",e=>{if(/^[123]$/.test(e.key))vote(+e.key-1)});
const sb=(x,y,c,n,v=160)=>{if(LOW)n=Math.ceil(n/2);if(parts.length>150)return;for(let i=0;i<n;i++){const r=Math.random()*6.28,q=v*(.3+Math.random()*.7);parts.push({x,y,vx:Math.cos(r)*q,vy:Math.sin(r)*q,l:1,c})}};
const MC=["#e63946","#ff9f1c","#9d4edd"];
function showVote(n){
  const on=n.br&&n.vt&&n.vt.length;vbox.style.display=on?"flex":"none";if(!on){vk="";return}
  const key=n.wv+"|"+n.vt.join("|");
  if(key!==vk){vk=key;mine=-1;vbox.replaceChildren(...n.vt.map((t,i)=>h("button",t,()=>vote(i))))}
  [...vbox.children].forEach((bt,i)=>{bt.textContent=`${i+1}. ${n.vt[i]} (${n.vc[i]||0})`;bt.className=i===mine?"":"alt"});
}
function onSurv(n){
  const now=performance.now();if(st)tDt=Math.min(250,Math.max(60,tDt*.6+(now-tAt)*.4));
  pv=st;st=n;tAt=now;
  if(pv){
    if(pv.wv!==n.wv)beep(440,.15,"triangle",.05,880);
    const live=new Set(n.m.map(m=>m[0]));let kd=0;
    pv.m.forEach(m=>{if(!live.has(m[0])){kd++;sb(m[1],m[2],MC[m[4]],m[4]===2?18:8,m[4]===2?220:140)}});
    if(kd)beep(500+Math.random()*300,.05,"square",.025);
    Object.entries(n.p).forEach(([u,q])=>{const o=pv.p[u];if(!o)return;
      if(q[2]<o[2]){sb(q[0],q[1],"#ff4d6d",10);if(me&&u===me.uid){shk=now+220;beep(150,.2,"sawtooth",.05,70);if(navigator.vibrate)navigator.vibrate(50)}}
      if(o[4]&&!q[4]){sb(q[0],q[1],q[6],30,260);beep(180,.4,"sawtooth",.05,50)}});
  }
  setScore(Object.values(n.p).sort((x,y)=>y[3]-x[3]).map(q=>[`${q[5]} : ${q[3]} ☠ ${"♥".repeat(Math.max(0,q[2]))}${q[4]?"":" ✖"}`,q[6]]));
  setOv(n.o||n.br?n.msg:"");showVote(n);
}
function drawSurv(now){
  const x=gctx(),p=Math.min(1,(now-tAt)/tDt),L=(a,b)=>a+(b-a)*p,dt=Math.min(.05,(now-(drawSurv.t||now))/1000);drawSurv.t=now;
  const hs=vsc,ns=Math.min(1.5,hs);
  x.save();if(now<shk)x.translate((Math.random()-.5)*8,(Math.random()-.5)*8);
  x.drawImage(survBg(),-10,-10);
  const pm=new Map(pv?pv.m.map(m=>[m[0],m]):[]);
  const P=Object.entries(st.p).filter(([,q])=>q[4]).map(([u,q])=>{const o=(pv&&pv.p[u])||q;return{u,q,x:L(o[0],q[0]),y:L(o[1],q[1])}});
  const mpl=me&&P.find(e=>e.u===me.uid);
  if(mpl){const r=predict(dt,mpl.x,mpl.y,90*(st.sp||1),14,786,14,546,null);mpl.x=r[0];mpl.y=r[1]}else pred=null; // mon personnage réagit tout de suite
  st.m.forEach(m=>{const o=pm.get(m[0])||m,r=[12,9,20][m[4]]*(1+.07*Math.sin(now/110+m[0])),mx=L(o[1],m[1]),my=L(o[2],m[2]);
    let t=null,bd=1e12;P.forEach(q=>{const d=(q.x-mx)**2+(q.y-my)**2;if(d<bd){bd=d;t=q}});
    const g=t?Math.atan2(t.y-my,t.x-mx):0;
    x.fillStyle="#0006";x.beginPath();x.ellipse(mx,my+r*.8,r*.9,r*.35,0,0,7);x.fill();
    x.fillStyle=o[3]>m[3]?"#fff":MC[m[4]];x.shadowColor=MC[m[4]];x.shadowBlur=10;x.beginPath();x.arc(mx,my,r,0,7);x.fill();x.shadowBlur=0;x.strokeStyle="#0005";x.lineWidth=2;x.stroke();
    [-1,1].forEach(sd=>{const ex=mx+Math.cos(g)*r*.35-Math.sin(g)*r*.4*sd,ey=my+Math.sin(g)*r*.35+Math.cos(g)*r*.4*sd;
      x.fillStyle="#fff";x.beginPath();x.arc(ex,ey,r*.26,0,7);x.fill();x.fillStyle="#14102b";x.beginPath();x.arc(ex+Math.cos(g)*r*.1,ey+Math.sin(g)*r*.1,r*.13,0,7);x.fill()})});
  x.lineCap="round";x.strokeStyle="#ffe66d";x.shadowColor="#ffe66d";x.shadowBlur=8;x.lineWidth=4;
  st.b.forEach(b=>{const bx=b[0]+b[2]*p,by=b[1]+b[3]*p;x.beginPath();x.moveTo(bx-b[2]*.6,by-b[3]*.6);x.lineTo(bx,by);x.stroke()});x.shadowBlur=0;
  x.textAlign="center";
  P.forEach(({u,q,x:px,y:py})=>{
    let t=null,bd=360*360;st.m.forEach(m=>{const d=(m[1]-px)**2+(m[2]-py)**2;if(d<bd){bd=d;t=m}});
    if(t)aim[u]=Math.atan2(t[2]-py,t[1]-px);const a=aim[u]||0;
    x.save();x.globalAlpha=q[7]?.5+.3*Math.sin(now/60):1;
    x.fillStyle="#0006";x.beginPath();x.ellipse(px,py+12,13,5,0,0,7);x.fill();
    x.translate(px,py);x.save();x.rotate(a);x.fillStyle="#cfd3ff";x.fillRect(6,-3,16,6);x.restore();
    x.fillStyle=q[6];if(me&&u===me.uid){x.shadowColor=q[6];x.shadowBlur=16}
    x.beginPath();x.arc(0,0,14,0,7);x.fill();x.shadowBlur=0;
    [-1,1].forEach(sd=>{x.fillStyle="#fff";x.beginPath();x.arc(Math.cos(a)*6-Math.sin(a)*4*sd,Math.sin(a)*6+Math.cos(a)*4*sd,3.2,0,7);x.fill()});
    x.restore();
    x.fillStyle="#fff";x.font=`${12*ns}px sans-serif`;x.fillText(q[5],px,py-22-4*ns);x.fillStyle="#ff4d6d";x.font=`${11*ns}px sans-serif`;x.fillText("♥".repeat(Math.max(0,q[2])),px,py+24+4*ns)});
  parts=parts.filter(q=>(q.l-=dt*1.8)>0);parts.forEach(q=>{q.x+=q.vx*dt;q.y+=q.vy*dt;x.globalAlpha=q.l;x.fillStyle=q.c;x.fillRect(q.x-3,q.y-3,6,6)});x.globalAlpha=1;
  x.restore();
  x.drawImage(vig(220,"9"),0,0);
  x.fillStyle="#fff";x.font=`700 ${18*hs}px sans-serif`;x.textAlign="left";x.fillText(`Vague ${st.wv}   ☠ ${st.kl}`,12,6+19*hs);
}
function frame(now){
  if(cur!=="game"){raf=0;return}
  raf=requestAnimationFrame(frame);if(!st)return;
  if(now-(frame.l||0)<13.5)return;frame.l=now; // 60 images/s au maximum : inutile (et chaud) de dessiner à 120 Hz
  if(st.k==="surv")return drawSurv(now);if(st.k==="lab")return drawLab(now);if(st.k==="br")return drawBr(now);
  const cv=$("cv"),x=gctx(),k=cv.width/st.W,p=Math.min(1,(now-tAt)/tDt),mid=me&&me.uid;
  x.drawImage(snakeBg(st.W,st.H,k),0,0);
  x.textAlign="center";x.textBaseline="middle";
  st.f.forEach(([a,b,t,l])=>{const cx=(a+.5)*k,cy=(b+.5)*k,pu=1+.12*Math.sin(now/180+a);
    if(t&&l<25&&Math.floor(now/140)%2)return;
    if(!t){x.fillStyle="#fff";x.beginPath();x.arc(cx,cy,k*.3*pu,0,7);x.fill()}
    else{x.fillStyle=t===1?"#ffd23f55":"#3ee6c455";x.beginPath();x.arc(cx,cy,k*.7*pu,0,7);x.fill();x.font=`${k*.95*pu}px sans-serif`;x.fillText(t===1?"⭐":"🛡️",cx,cy)}});
  Object.entries(st.s).forEach(([u,s])=>{
    if(!s.b.length)return;
    const o=pv&&pv.s[u],ob=o&&o.b.length?o.b:s.b;
    const pts=s.b.map((c,i)=>{const q=ob[Math.min(i,ob.length-1)],j=Math.abs(q[0]-c[0])>1||Math.abs(q[1]-c[1])>1;return[(j?c[0]:q[0]+(c[0]-q[0])*p)+.5,(j?c[1]:q[1]+(c[1]-q[1])*p)+.5]});
    x.save();x.globalAlpha=s.sh>0?.55+.25*Math.sin(now/80):1;
    x.strokeStyle=s.c;x.lineCap=x.lineJoin="round";x.lineWidth=k*.78;
    if(u===mid){x.shadowColor=s.c;x.shadowBlur=14}
    x.beginPath();pts.forEach(([a,b],i)=>{if(!i||Math.abs(a-pts[i-1][0])>1.5||Math.abs(b-pts[i-1][1])>1.5)x.moveTo(a*k,b*k);else x.lineTo(a*k,b*k)});
    if(u===mid&&LOW){const ga=x.globalAlpha;x.globalAlpha=ga*.3;x.lineWidth=k*1.15;x.stroke();x.globalAlpha=ga;x.lineWidth=k*.78} // halo léger (sans ombre floue)
    x.stroke();
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
const held=new Set();let seqN=0;
const mv=()=>{if(cur!=="game"||!code||!me||gk==="lab")return;if(gk==="br")return brSend();const m=`${(held.has("R")?1:0)-(held.has("L")?1:0)},${(held.has("D")?1:0)-(held.has("U")?1:0)}`;if(m!==lastMv){lastMv=m;set(R(`games/${code}/inputs/${me.uid}`),m+","+(++seqN)).catch(()=>{})}};
const send=d=>{if(cur!=="game"||gk!=="snake"||d===lastDir)return;lastDir=d;set(R(`games/${code}/inputs/${me.uid}`),d+(++seqN)).catch(()=>{})};
addEventListener("keydown",e=>{if(cur!=="game"||/^(INPUT|TEXTAREA)$/.test(e.target.tagName))return;const d=KEYS[e.key.length>1?e.key:e.key.toLowerCase()];if(d){e.preventDefault();if(gk!=="snake"){held.add(d);mv()}else send(d)}});
addEventListener("keyup",e=>{const d=KEYS[e.key.length>1?e.key:e.key.toLowerCase()];if(d&&(gk!=="snake")&&cur==="game"){held.delete(d);mv()}});
let t0;const cvs=$("cv");
cvs.addEventListener("touchstart",e=>{if(TOUCH)return;t0=e.touches[0]},{passive:true});
cvs.addEventListener("touchmove",e=>{if(TOUCH)return;e.preventDefault();if(!t0||cur!=="game")return;const t=e.touches[0],dx=t.clientX-t0.clientX,dy=t.clientY-t0.clientY;
  if(Math.max(Math.abs(dx),Math.abs(dy))>20){send(Math.abs(dx)>Math.abs(dy)?(dx>0?"R":"L"):(dy>0?"D":"U"));t0=t}},{passive:false});
document.querySelectorAll("#pad button").forEach(b=>{const d=b.dataset.d,on=e=>{e.preventDefault();if(gk!=="snake"){held.add(d);mv()}else send(d)},off=()=>{if(gk!=="snake"){held.delete(d);mv()}};
  b.addEventListener("pointerdown",on);["pointerup","pointercancel","pointerleave"].forEach(t=>b.addEventListener(t,off))});

// ---------- Commandes tactiles (iPhone / iPad) : joysticks flottants, balayage, croix ----------
// Snake : glisse le doigt n'importe où. Survie : un joystick flottant. Battle royale : joystick gauche = bouger,
// joystick droit = viser (tir tant que le doigt touche). Le bouton 🕹️/✚ en haut permet de passer à la croix directionnelle.
const gameEl=$("game"),sL=$("sL"),sR=$("sR"),SMAX=58,SDEAD=.2,SWIPE=14,AIMASSIST=true,tp={mv:null,aim:null,sw:null};
let ctlMode="stick";try{ctlMode=localStorage.getItem("moda.ctl")==="pad"?"pad":"stick"}catch{}
let rawAim=0,aimLock=0;
const touchy=e=>TOUCH&&e.pointerType!=="mouse";
function ctlUI(){document.body.classList.toggle("padon",ctlMode==="pad");const b=$("gctl");b.textContent=ctlMode==="pad"?"✚":"🕹️";
  b.setAttribute("aria-label",ctlMode==="pad"?"Commandes : croix. Toucher pour passer au joystick":"Commandes : joystick. Toucher pour passer à la croix")}
$("gctl").onclick=()=>{resetTouch();ctlMode=ctlMode==="pad"?"stick":"pad";try{localStorage.setItem("moda.ctl",ctlMode)}catch{}ctlUI()};
$("gexit").onclick=()=>{if(cur!=="game")return;
  if(confirm(lobby&&lobby.host===me.uid?"Tu es l'hôte : la partie s'arrêtera pour tout le monde. Quitter ?":"Quitter la partie ?"))leaveLobby()};
const setHeld=(U,D,L,R)=>{const w={U,D,L,R};let ch=0;for(const k in w){const on=!!w[k];if(on!==held.has(k)){on?held.add(k):held.delete(k);ch=1}}if(ch)mv()};
const place=(s,x,y)=>{s.el.style.transform=`translate(${x}px,${y}px)`};
const mkStick=(el,x,y,id)=>{el.classList.add("on");el.firstElementChild.style.transform="translate(0,0)";const s={id,ox:x,oy:y,el,kn:el.firstElementChild};place(s,x,y);return s};
// le joystick suit le doigt s'il s'éloigne trop : on ne « sort » jamais de la zone
function drag(s,e){let dx=e.clientX-s.ox,dy=e.clientY-s.oy;const d=Math.hypot(dx,dy);
  if(d>SMAX){const k=(d-SMAX)/d;s.ox+=dx*k;s.oy+=dy*k;dx=e.clientX-s.ox;dy=e.clientY-s.oy;place(s,s.ox,s.oy)}
  s.kn.style.transform=`translate(${dx}px,${dy}px)`;return[dx,dy,Math.min(d,SMAX)]}
function endStick(k){const s=tp[k];if(!s)return;tp[k]=null;s.el.classList.remove("on");
  if(k==="mv")setHeld(0,0,0,0);else{ptrDown=0;aimLock=0;if(cur==="game"&&gk==="br")setFire()}}
function resetTouch(){["mv","aim"].forEach(endStick);tp.sw=null;held.clear();ptrDown=0;aimLock=0;if(cur==="game"){if(gk==="br")setFire();else if(gk==="surv"||gk==="lab")mv()}}
gameEl.addEventListener("pointerdown",e=>{
  if(!touchy(e)||cur!=="game"||e.target.closest("button"))return;
  e.preventDefault();const x=e.clientX,y=e.clientY;
  if(gk==="snake"){if(tp.sw)return;tp.sw={id:e.pointerId,ox:x,oy:y}}
  else if(gk==="br"&&(ctlMode==="pad"||x>=innerWidth*.5)){if(tp.aim)return;tp.aim=mkStick(sR,x,y,e.pointerId);ptrDown=1;setFire()}
  else if(ctlMode==="stick"){if(tp.mv)return;tp.mv=mkStick(sL,x,y,e.pointerId)}
  else return;
  try{gameEl.setPointerCapture(e.pointerId)}catch{}
});
gameEl.addEventListener("pointermove",e=>{
  if(!touchy(e)||cur!=="game")return;
  if(tp.mv&&tp.mv.id===e.pointerId){const[dx,dy,m]=drag(tp.mv,e);
    if(m<SDEAD*SMAX)return setHeld(0,0,0,0);
    const n=Math.hypot(dx,dy)||1,nx=dx/n,ny=dy/n;setHeld(ny<-.38,ny>.38,nx<-.38,nx>.38)} // 8 directions
  else if(tp.aim&&tp.aim.id===e.pointerId){const[dx,dy,m]=drag(tp.aim,e);if(m>12){rawAim=Math.atan2(dy,dx);aimLock=1}else aimLock=0}
  else if(tp.sw&&tp.sw.id===e.pointerId){const dx=e.clientX-tp.sw.ox,dy=e.clientY-tp.sw.oy;
    if(Math.max(Math.abs(dx),Math.abs(dy))>=SWIPE){send(Math.abs(dx)>Math.abs(dy)?(dx>0?"R":"L"):(dy>0?"D":"U"));tp.sw.ox=e.clientX;tp.sw.oy=e.clientY}}
});
const relPtr=e=>{if(tp.mv&&tp.mv.id===e.pointerId)endStick("mv");else if(tp.aim&&tp.aim.id===e.pointerId)endStick("aim");else if(tp.sw&&tp.sw.id===e.pointerId)tp.sw=null};
["pointerup","pointercancel"].forEach(t=>gameEl.addEventListener(t,relPtr));
document.addEventListener("gesturestart",e=>{if(cur==="game")e.preventDefault()}); // pas de zoom à deux doigts pendant la partie
document.addEventListener("visibilitychange",()=>{if(document.hidden)resetTouch();else if(cur==="game")wake()});
addEventListener("blur",resetTouch);
// Angle de visée : souris > joystick de visée (avec une petite aide) > direction de marche
function assist(a){
  if(!AIMASSIST||!st||st.k!=="br"||!me)return a;
  const Q=st.p,mq=Q[me.uid];if(!mq||!mq[4])return a;
  const px=pred?pred.x:mq[0],py=pred?pred.y:mq[1];let best=a,bt=1e9;
  for(const u in Q){if(u===me.uid)continue;const q=Q[u];if(!q[4]||q[10])continue;
    const ex=q[0]-px,ey=q[1]-py,d=Math.hypot(ex,ey);if(d>560||d<1)continue;
    let df=Math.atan2(ey,ex)-a;df=Math.atan2(Math.sin(df),Math.cos(df));
    if(Math.abs(df)<Math.min(.22,Math.max(.07,70/d))&&Math.abs(df)<bt){bt=Math.abs(df);best=a+df}}
  return best;
}
function myAim(){if(mpos)return Math.atan2(mpos.y-meScr.y,mpos.x-meScr.x);if(aimLock){lastAim=assist(rawAim);return lastAim}return lastAim}

// ---------- Battle Royale : carte, armes, affichage et commandes ----------
const BW=1600,BH=1200;
// nom, emoji, dégâts, cadence (en ticks de 0,1 s), vitesse, durée de vie (ticks), dispersion, projectiles, couleur
const WP=[["Pistolet","🔫",14,4,30,16,.03,1,"#ffe66d"],["Mitraillette","⚡",5,1,32,10,.1,1,"#3ee6c4"],["Fusil à pompe","💥",9,9,28,6,.28,6,"#ff9f1c"],["Fusil d'assaut","🎯",18,4,38,15,.045,1,"#6c8cff"],["Sniper","🔭",70,14,75,18,0,1,"#c77dff"]];
const LI=["","","","","","💊","🧪"]; // objets au sol : 1 à 4 = arme (index de WP), 5 = soin, 6 = bouclier
const rng=s=>()=>{s|=0;s=s+0x6D2B79F5|0;let t=Math.imul(s^s>>>15,1|s);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296};
// La carte est générée à partir d'une graine : l'hôte et les joueurs obtiennent exactement la même
function genMap(sd){
  const r=rng(sd),Wl=[],Tr=[],Ho=[],t=10,g=46;
  const hz=(x,y,len,gap)=>gap?[[x,y,(len-g)/2,t],[x+(len+g)/2,y,(len-g)/2,t]]:[[x,y,len,t]];
  const vt=(x,y,len,gap)=>gap?[[x,y,t,(len-g)/2],[x,y+(len+g)/2,t,(len-g)/2]]:[[x,y,t,len]];
  for(let gx=0;gx<4;gx++)for(let gy=0;gy<3;gy++){
    if(r()<.25)continue;
    const w=110+Math.floor(r()*50),hh=90+Math.floor(r()*40),x=gx*400+30+r()*(340-w),y=gy*400+30+r()*(340-hh),d=Math.floor(r()*4);
    Ho.push([x,y,w,hh]);Wl.push(...hz(x,y,w,d===0),...hz(x,y+hh-t,w,d===1),...vt(x,y,hh,d===2),...vt(x+w-t,y,hh,d===3)); // une porte sur un côté
  }
  for(let i=0;i<400&&Tr.length<45;i++){
    const x=40+r()*(BW-80),y=40+r()*(BH-80),q=16+r()*8;
    if(Ho.some(([a,b,w,hh])=>x>a-40&&x<a+w+40&&y>b-40&&y<b+hh+40))continue;
    if(Tr.some(([a,b])=>(a-x)**2+(b-y)**2<80*80))continue;
    Tr.push([x,y,q]);
  }
  return{sd,W:Wl,T:Tr,H:Ho};
}
// vrai si le disque (x,y,rad) touche un mur ou un arbre
function solidAt(m,x,y,rad){
  for(const[a,b,w,hh]of m.W){const cx=Math.max(a,Math.min(x,a+w)),cy=Math.max(b,Math.min(y,b+hh));if((x-cx)**2+(y-cy)**2<rad*rad)return true}
  for(const[a,b,q]of m.T)if((x-a)**2+(y-b)**2<(q+rad)**2)return true;
  return false;
}

let fxF={},fxH={},floats=[],lastAim=0,mapC=null,lootC=[],mpos=null,brFire=0,ptrDown=0,spDown=0,brK="",brA="",brT=0,meScr={x:400,y:280};
function gameSetup(){
  mapC=null;lootC=[];fxF={};fxH={};floats=[];ptrDown=spDown=brFire=0;brK=brA="";brT=0;mpos=null;aimLock=0;
  $("cv").style.cursor=gk==="br"?"crosshair":"";
  $("ghelp").textContent=gk==="br"?"ZQSD / flèches : bouger · souris : viser · clic ou espace : tirer. Sur mobile : joystick gauche pour bouger, joystick droit pour viser (tu tires tant que ton doigt touche). Marche sur les objets pour les ramasser : la couleur du halo indique la rareté (vert < bleu < violet < doré), 💊 soigne et 🧪 donne du bouclier. Reste dans la zone !"
    :gk==="lab"?"Flèches ou ZQSD pour bouger. Ramassez toutes les 🗝️ (clés partagées), puis rejoignez-vous TOUS sur la sortie 🚪. Une plaque ● ouvre la porte de la même couleur tant que quelqu'un reste dessus : un copain passe de l'autre côté et active le levier pour la verrouiller ouverte. Évite les gardiens rouges : chaque contact coûte une vie à l'équipe ! Seul, la plaque ouvre la porte pour de bon."
    :gk==="surv"?"Flèches ou ZQSD pour bouger, tu tires automatiquement. Sur mobile : glisse le pouce. Entre deux vagues, vote avec 1 / 2 / 3."
    :"Flèches ou ZQSD / WASD. Sur mobile : glisse le doigt. ⭐ = +3 points, 🛡️ = traverse tout pendant 5 s.";
  if(TOUCH){const t=$("tip");t.textContent=gk==="br"?"Pouce gauche : bouger · pouce droit : viser et tirer":gk==="lab"?"Glisse ton pouce pour te déplacer · récupérez les 🗝️ puis rejoignez-vous tous sur la sortie":gk==="surv"?"Glisse ton pouce pour te déplacer (tir automatique)":"Glisse ton doigt pour tourner";
    t.hidden=false;clearTimeout(gameSetup.t);gameSetup.t=setTimeout(()=>{t.hidden=true},6000)}
}
// ---- Graphismes du battle royale ----
// Rareté des armes (comme dans Fortnite) : la couleur du halo indique la valeur de l'objet
const RAR=[null,["Peu commun","#8be28b"],["Rare","#4dabff"],["Épique","#c77dff"],["Légendaire","#ffd23f"]],GL=[14,20,30,30,38];
const lc=t=>t<5?RAR[t][1]:t===5?"#3ee66a":"#35d0ff";
const lname=t=>t<5?[WP[t][0],RAR[t][0]]:t===5?["Trousse de soin","+50 PV"]:["Potion de bouclier","+50 bouclier"];
const rr=(x,a,b,w,hh,r)=>{x.beginPath();x.moveTo(a+r,b);x.arcTo(a+w,b,a+w,b+hh,r);x.arcTo(a+w,b+hh,a,b+hh,r);x.arcTo(a,b+hh,a,b,r);x.arcTo(a,b,a+w,b,r);x.closePath()};
const pw=new Map();
const pill=(x,t,px,py,al,bg,fg)=>{x.font="700 15px sans-serif";let w=pw.get(t);if(w==null){w=x.measureText(t).width+20;if(pw.size>300)pw.clear();pw.set(t,w)}const a=al==="r"?px-w:al==="c"?px-w/2:px; // largeur mémorisée : measureText est lent
  x.fillStyle=bg||"#000a";rr(x,a,py,w,26,13);x.fill();x.fillStyle=fg||"#fff";x.textAlign="left";x.textBaseline="middle";x.fillText(t,a+10,py+14);x.textBaseline="alphabetic"};
// silhouette d'arme dessinée vers la droite, centrée verticalement
function gun(x,t,s){
  x.save();x.scale(s,s);
  const M="#d9dcff",D="#2b2750",Wd="#9a6a3a",b=(c,a,y,w,hh)=>{x.fillStyle=c;x.fillRect(a,y,w,hh)};
  if(t===0){b(D,0,-3,14,5);b(M,0,-3,11,2.5);b(D,2,1,5,5)}
  else if(t===1){b(Wd,-6,-2,7,4);b(D,0,-3,20,6);b(M,6,-3,14,3);b(D,8,3,5,7)}
  else if(t===2){b(Wd,-7,-3,11,6);b(D,4,-2.5,26,5);b(M,12,-2.5,18,2.5);b(Wd,14,2.5,9,3)}
  else if(t===3){b(Wd,-7,-3,11,6);b(D,4,-3,26,6);b(M,10,-3,20,3);b(D,12,3,5,7);b(D,24,-5,4,2)}
  else{b(Wd,-9,-3,13,6);b(D,4,-2.5,34,5);b(M,10,-2.5,28,2.5);b(D,14,-8,10,4);b(M,16,-7,6,2)}
  x.restore();
}
// Le décor ne change jamais : on le dessine une seule fois dans une image
function buildMapImg(m){
  const cv=document.createElement("canvas");cv.width=BW;cv.height=BH;const x=cv.getContext("2d"),r=rng(m.sd^0x9e3779b9);
  const g=x.createLinearGradient(0,0,BW,BH);g.addColorStop(0,"#1d4437");g.addColorStop(1,"#163027");x.fillStyle=g;x.fillRect(0,0,BW,BH);
  for(let i=0;i<80;i++){const px=r()*BW,py=r()*BH,rad=60+r()*130,c=r()<.5?"#2d5f4a":"#0f241d",gg=x.createRadialGradient(px,py,0,px,py,rad);
    gg.addColorStop(0,c+"b0");gg.addColorStop(1,c+"00");x.fillStyle=gg;x.fillRect(px-rad,py-rad,rad*2,rad*2)}
  for(let i=0;i<14;i++){x.fillStyle="#7a6840"+"22";x.beginPath();x.ellipse(r()*BW,r()*BH,40+r()*70,20+r()*40,r()*3,0,7);x.fill()}
  x.lineCap="round";
  for(let i=0;i<1100;i++){const px=r()*BW,py=r()*BH;x.strokeStyle=r()<.5?"#3f8f66":"#10301f";x.globalAlpha=.35+r()*.3;x.lineWidth=1.5;
    x.beginPath();for(let k=-1;k<=1;k++){x.moveTo(px+k*3,py);x.lineTo(px+k*5,py-5-r()*4)}x.stroke()}
  x.globalAlpha=1;
  for(let i=0;i<70;i++){x.fillStyle=["#ffd23f","#ff9aae","#fff","#c9b6ff"][Math.floor(r()*4)];x.globalAlpha=.8;x.beginPath();x.arc(r()*BW,r()*BH,2,0,7);x.fill()}
  x.globalAlpha=1;
  m.H.forEach(([a,b,w,hh])=>{ // maisons : sol en parquet + tapis
    x.fillStyle="#0006";x.fillRect(a+8,b+10,w,hh);
    x.fillStyle="#8a6a46";x.fillRect(a,b,w,hh);x.strokeStyle="#00000030";x.lineWidth=1;x.beginPath();for(let k=a+12;k<a+w;k+=12){x.moveTo(k,b);x.lineTo(k,b+hh)}x.stroke();
    x.fillStyle="#b84a5e66";rr(x,a+w*.25,b+hh*.28,w*.5,hh*.44,6);x.fill();
  });
  m.W.forEach(([a,b,w,hh])=>{x.fillStyle="#0000004d";x.fillRect(a+5,b+7,w,hh)});
  m.W.forEach(([a,b,w,hh])=>{x.fillStyle="#6b5aa8";x.fillRect(a,b,w,hh);x.fillStyle="#9886e0";x.fillRect(a,b,w,Math.min(3,hh));x.strokeStyle="#2a2150";x.lineWidth=1.5;x.strokeRect(a,b,w,hh)});
  m.T.forEach(([a,b,q],i)=>{ // arbres vus de dessus
    x.fillStyle="#0000004d";x.beginPath();x.ellipse(a+8,b+10,q*1.05,q*.8,0,0,7);x.fill();
    x.fillStyle="#12583a";x.beginPath();x.arc(a,b,q,0,7);x.fill();
    x.fillStyle="#1d7a4b";x.beginPath();x.arc(a-1.5,b-1.5,q*.82,0,7);x.fill();
    x.fillStyle="#2fa866";x.beginPath();x.arc(a-3,b-3,q*.58,0,7);x.fill();
    x.fillStyle="#7be9a8";x.globalAlpha=.5;x.beginPath();x.arc(a-5,b-5,q*.22,0,7);x.fill();x.globalAlpha=1;
    x.strokeStyle="#0a3a25";x.lineWidth=2;x.beginPath();x.arc(a,b,q,0,7);x.stroke()});
  x.strokeStyle="#0b1a1a";x.lineWidth=10;x.strokeRect(0,0,BW,BH);x.strokeStyle="#ffffff33";x.lineWidth=2;x.strokeRect(5,5,BW-10,BH-10);
  return cv;
}
// Objet au sol : halo de rareté, anneau qui pulse, icône qui flotte, étincelles ; le nom s'affiche quand on s'approche
function drawLoot(x,l,now,near){
  const[,lx,ly,t]=l,col=lc(t),bob=Math.sin(now/350+lx)*2.5;
  x.drawImage(glow(col,t>=3?42:32),lx-42,ly-42);
  if(t===4){x.save();x.translate(lx,ly);x.rotate(now/1800);x.strokeStyle=col;x.globalAlpha=.35;x.lineWidth=3;x.beginPath();for(let k=0;k<8;k++){const a=k*.785;x.moveTo(Math.cos(a)*18,Math.sin(a)*18);x.lineTo(Math.cos(a)*38,Math.sin(a)*38)}x.stroke();x.restore()}
  x.fillStyle="#0007";x.beginPath();x.ellipse(lx,ly+11,15,5.5,0,0,7);x.fill();
  x.strokeStyle=col;x.lineWidth=2;x.globalAlpha=.55+.4*Math.sin(now/250+lx);x.beginPath();x.arc(lx,ly,20+Math.sin(now/300+lx)*1.5,0,7);x.stroke();x.globalAlpha=1;
  x.save();x.translate(lx,ly+bob);
  if(t<5){x.rotate(-.35);x.translate(-GL[t]/2,0);x.shadowColor=col;x.shadowBlur=10;gun(x,t,1.3)}
  else if(t===5){x.shadowColor=col;x.shadowBlur=10;x.fillStyle="#fff";rr(x,-12,-9,24,18,4);x.fill();x.shadowBlur=0;x.strokeStyle="#c9c9d6";x.lineWidth=1.5;x.stroke();x.fillStyle="#e63946";x.fillRect(-2.5,-6,5,12);x.fillRect(-6,-2.5,12,5)}
  else{x.shadowColor=col;x.shadowBlur=10;x.fillStyle="#9a6a3a";x.fillRect(-3,-13,6,5);x.fillStyle="#bfe9ff";x.fillRect(-3.5,-9,7,5);
    const bg=x.createRadialGradient(-3,0,1,0,2,11);bg.addColorStop(0,"#8fe6ff");bg.addColorStop(1,"#1a8fd0");x.fillStyle=bg;x.beginPath();x.arc(0,3,10,0,7);x.fill();x.shadowBlur=0;x.fillStyle="#fff9";x.beginPath();x.arc(-3.5,0,2.6,0,7);x.fill()}
  x.restore();
  for(let k=0;k<(t>=3?3:2);k++){const a=now/700+k*2.1+lx,sx=lx+Math.cos(a)*23,sy=ly+Math.sin(a)*14-2,s=2+Math.sin(now/200+k)*1;
    x.fillStyle="#fff";x.globalAlpha=.8;x.beginPath();x.moveTo(sx,sy-s*1.6);x.lineTo(sx+s*.5,sy);x.lineTo(sx,sy+s*1.6);x.lineTo(sx-s*.5,sy);x.closePath();x.fill()}
  x.globalAlpha=1;
  if(near){const[n1,n2]=lname(t);x.font="700 13px sans-serif";x.textAlign="left";const w=Math.max(x.measureText(n1).width,x.measureText(n2).width)+18;
    x.fillStyle="#000c";rr(x,lx-w/2,ly-62,w,38,8);x.fill();x.strokeStyle=col;x.lineWidth=1.5;x.stroke();
    x.textAlign="center";x.fillStyle="#fff";x.fillText(n1,lx,ly-46);x.fillStyle=col;x.font="600 12px sans-serif";x.fillText(n2,lx,ly-31)}
}
function onBr(n){
  const now=performance.now();if(st)tDt=Math.min(250,Math.max(60,tDt*.6+(now-tAt)*.4));
  pv=st;st=n;tAt=now;
  if(!mapC||mapC.sd!==n.sd){mapC=genMap(n.sd);mapC.img=buildMapImg(mapC)}
  if(n.l)lootC=n.l;
  const keys=Object.keys(n.p);
  n.b.forEach(b=>{if(b[5]<=0&&keys[b[4]])fxF[keys[b[4]]]=now}); // éclair de tir au bout de l'arme
  if(me&&fxF[me.uid]===now)beep(320,.04,"square",.02,150);
  if(pv&&pv.k==="br"){
    if(n.zs&&!pv.zs){beep(250,.4,"triangle",.06,120);toast("⚠️ La zone rétrécit !")}
    Object.entries(n.p).forEach(([u,q])=>{const o=pv.p[u];if(!o)return;const mi=me&&u===me.uid;
      if(o[2]+o[3]-q[2]-q[3]>=3&&q[4]){fxH[u]=now;sb(q[0],q[1],"#ff4d6d",8,150);if(mi){shk=now+160;beep(160,.15,"sawtooth",.05,80);if(navigator.vibrate)navigator.vibrate(40)}}
      if(o[4]&&!q[4]){sb(q[0],q[1],q[6],30,260);beep(180,.4,"sawtooth",.05,50);if(mi&&navigator.vibrate)navigator.vibrate(120)}
      if(mi&&q[4]){ // ramassage : texte flottant + étincelles
        const fl=(t,c)=>{floats.push({t,x:q[0],y:q[1]-22,c,l:1.6});sb(q[0],q[1],c,14,120);beep(700,.08,"sine",.05,1000)};
        if(q[8]>o[8])fl(`${WP[q[8]][1]} ${WP[q[8]][0]}`,lc(q[8]));
        if(q[2]>o[2])fl(`+${q[2]-o[2]} PV`,"#3ee66a");
        if(q[3]>o[3])fl(`+${q[3]-o[3]} bouclier`,"#35d0ff")}});
  }
  setScore(Object.values(n.p).sort((a,b)=>b[9]-a[9]||b[4]-a[4]).map(q=>[`${q[5]} : ☠ ${q[9]}${q[4]?"":" ✖"}`,q[6]]));
  setOv(n.cd?n.cd:n.o?n.msg:"");
}
// Envoi des commandes à l'hôte : "dx,dy,angle,tir,n°" (seulement quand quelque chose change)
function brSend(){
  if(cur!=="game"||gk!=="br"||!code||!me)return;
  const dx=(held.has("R")?1:0)-(held.has("L")?1:0),dy=(held.has("D")?1:0)-(held.has("U")?1:0),
    k=`${dx},${dy},${brFire}`,t=performance.now();
  if(!mpos&&!aimLock&&(dx||dy))lastAim=Math.atan2(dy,dx);
  const a=myAim().toFixed(2);
  if(k===brK&&(a===brA||t-brT<80))return; // l'hôte ne calcule que 10 fois par seconde : inutile d'envoyer la visée plus souvent
  brK=k;brA=a;brT=t;set(R(`games/${code}/inputs/${me.uid}`),`${dx},${dy},${a},${brFire},${++seqN}`).catch(()=>{});
}
function drawBr(now){
  const x=gctx(),p=Math.min(1,(now-tAt)/tDt),lp=(a,b)=>a+(b-a)*p,dt=Math.min(.05,(now-(drawBr.t||now))/1000);drawBr.t=now;
  const ns=Math.min(1.5,vsc),m=mapC,Q=st.p,keys=Object.keys(Q),mu=me&&me.uid,old=pv&&pv.k==="br"?pv:st,mq=mu&&Q[mu];
  const spos=u=>{const q=Q[u],o=old.p[u]||q;return[lp(o[0],q[0]),lp(o[1],q[1])]};
  let pm=null; // ma position prédite : je bouge sans attendre l'hôte
  if(mq&&mq[4]){const s0=spos(mu);pm=predict(dt,s0[0],s0[1],110,13,BW-13,13,BH-13,(a,b)=>solidAt(m,a,b,13))}else pred=null;
  const pos=u=>u===mu&&pm?pm:spos(u);
  // caméra : sur moi, ou sur le survivant en tête quand je suis éliminé
  const fu=mq&&mq[4]?mu:keys.filter(u=>Q[u][4]).sort((a,b)=>Q[b][9]-Q[a][9])[0],fp=fu?pos(fu):[BW/2,BH/2];
  const ox=Math.round(400-Math.max(400,Math.min(BW-400,fp[0]))),oy=Math.round(280-Math.max(280,Math.min(BH-280,fp[1]))); // pixels entiers : décor net, sans scintillement
  if(mq){const mp=pos(mu);meScr={x:mp[0]+ox,y:mp[1]+oy}}
  brSend();
  const zo=old.z,zx=lp(zo[0],st.z[0]),zy=lp(zo[1],st.z[1]),zr=Math.max(0,lp(zo[2],st.z[2]));
  const mp=mq&&mq[4]?pos(mu):null;
  x.save();x.textBaseline="alphabetic";x.fillStyle="#0b1a1a";x.fillRect(-10,-10,820,580);
  if(now<shk)x.translate((Math.random()-.5)*8,(Math.random()-.5)*8);
  x.translate(ox,oy);
  x.drawImage(m.img,-ox,-oy,800,560,-ox,-oy,800,560); // seulement la partie visible de la carte
  // objets au sol
  let nearL=null,nd=110*110;
  if(mp)lootC.forEach(l=>{const d=(l[1]-mp[0])**2+(l[2]-mp[1])**2;if(d<nd){nd=d;nearL=l}});
  lootC.forEach(l=>{if(l[1]+60>-ox&&l[1]-60<800-ox&&l[2]+60>-oy&&l[2]-60<560-oy)drawLoot(x,l,now,l===nearL)});
  // balles : traînée lumineuse de la couleur de l'arme
  x.lineCap="round";
  st.b.forEach(b=>{const uo=keys[b[4]],w=uo&&Q[uo]?Q[uo][8]:0,c=(WP[w]||WP[0])[8],bx=b[0]+b[2]*p,by=b[1]+b[3]*p,tx=bx-b[2]*.9,ty=by-b[3]*.9;
    if(LOW)x.strokeStyle=c;else{const g=x.createLinearGradient(tx,ty,bx,by);g.addColorStop(0,c+"00");g.addColorStop(1,c);x.strokeStyle=g}x.lineWidth=w===4?4.5:3;x.beginPath();x.moveTo(tx,ty);x.lineTo(bx,by);x.stroke();
    x.fillStyle="#fff";x.beginPath();x.arc(bx,by,w===4?2.4:1.8,0,7);x.fill()});
  // joueurs
  keys.forEach(u=>{const q=Q[u];if(!q[4])return;
    const[px,py]=pos(u),self=u===mu,a=self?myAim():q[7],w=q[8]||0;
    if(self){x.save();x.setLineDash([4,8]);x.strokeStyle="#ffffff55";x.lineWidth=1.5;x.beginPath();x.moveTo(px+Math.cos(a)*22,py+Math.sin(a)*22);x.lineTo(px+Math.cos(a)*280,py+Math.sin(a)*280);x.stroke();x.restore()}
    x.save();x.translate(px,py);
    x.fillStyle="#0006";x.beginPath();x.ellipse(3,13,14,6,0,0,7);x.fill();
    if(self){x.strokeStyle="#ffffff40";x.lineWidth=2;x.beginPath();x.arc(0,0,19,0,7);x.stroke()}
    if(q[10]){x.strokeStyle="#35d0ff";x.globalAlpha=.5+.4*Math.sin(now/90);x.lineWidth=3;x.beginPath();x.arc(0,0,21,0,7);x.stroke();x.globalAlpha=1}
    x.rotate(a);
    x.save();x.translate(7,0);gun(x,w,.95);x.restore();
    const bg=x.createRadialGradient(-3,-3,2,0,0,14);bg.addColorStop(0,"#ffffff66");bg.addColorStop(.35,q[6]);bg.addColorStop(1,q[6]);
    x.fillStyle=q[6];x.beginPath();x.arc(0,0,13,0,7);x.fill();x.fillStyle=bg;x.beginPath();x.arc(0,0,13,0,7);x.fill();
    x.strokeStyle="#000a";x.lineWidth=2.5;x.beginPath();x.arc(0,0,13,0,7);x.stroke();
    x.fillStyle="#f2c9a0";x.strokeStyle="#0008";x.lineWidth=1.5;[[13,-5],[Math.min(24,GL[w]*.6+7),4]].forEach(([hx,hy])=>{x.beginPath();x.arc(hx,hy,3.6,0,7);x.fill();x.stroke()});
    [-1,1].forEach(sd=>{x.fillStyle="#fff";x.beginPath();x.arc(5,sd*4.2,3,0,7);x.fill();x.fillStyle="#14102b";x.beginPath();x.arc(6.2,sd*4.2,1.5,0,7);x.fill()});
    if(now-(fxH[u]||0)<120){x.fillStyle="#fff";x.globalAlpha=.7;x.beginPath();x.arc(0,0,13,0,7);x.fill();x.globalAlpha=1}
    if(now-(fxF[u]||0)<90){ // éclair de bouche
      const tip=7+GL[w]*.95+2;x.shadowColor="#ffb703";x.shadowBlur=14;x.fillStyle="#ffe66d";x.beginPath();
      for(let k=0;k<10;k++){const r=k%2?5:14,an=k*.628;x.lineTo(tip+Math.cos(an)*r,Math.sin(an)*r)}x.closePath();x.fill();x.shadowBlur=0}
    x.restore();
    if(!self){ // barre de vie et pseudo, agrandis sur petit écran
      x.save();x.translate(px,py);x.scale(ns,ns);
      x.fillStyle="#000a";rr(x,-19,-31,38,9,4);x.fill();
      x.fillStyle=q[2]>50?"#3ee66a":q[2]>25?"#ffd23f":"#ff4d6d";rr(x,-17,-29.5,34*q[2]/100,4,2);x.fill();
      x.fillStyle="#35d0ff";rr(x,-17,-25,34*q[3]/100,3,1.5);x.fill();
      x.font="700 12px sans-serif";x.textAlign="center";x.lineWidth=3;x.strokeStyle="#000b";x.strokeText(q[5],0,-36);x.fillStyle="#fff";x.fillText(q[5],0,-36);x.restore()}});
  // particules et textes flottants
  parts=parts.filter(q=>(q.l-=dt*1.8)>0);parts.forEach(q=>{q.x+=q.vx*dt;q.y+=q.vy*dt;x.globalAlpha=q.l;x.fillStyle=q.c;x.fillRect(q.x-3,q.y-3,6,6)});x.globalAlpha=1;
  floats=floats.filter(f=>(f.l-=dt)>0);x.textAlign="center";x.font="800 16px sans-serif";
  floats.forEach(f=>{f.y-=34*dt;x.globalAlpha=Math.min(1,f.l*1.6);x.lineWidth=4;x.strokeStyle="#000c";x.strokeText(f.t,f.x,f.y);x.fillStyle=f.c;x.fillText(f.t,f.x,f.y)});x.globalAlpha=1;
  // la tempête : voile violet animé hors du cercle, bord qui pulse
  const sp=new Path2D();sp.rect(-3000,-3000,BW+6000,BH+6000);sp.moveTo(zx+zr,zy);sp.arc(zx,zy,zr,0,7);
  x.fillStyle="#9d1060";x.globalAlpha=.4;x.fill(sp,"evenodd");x.globalAlpha=1;
  if(!LOW){x.save();x.clip(sp,"evenodd");
  for(let i=0;i<9;i++){const bx=-ox+((i*211+now*.03*(1+i%3))%1000)-100,by=-oy+((i*137+now*.02*(1+i%2))%760)-100,g=x.createRadialGradient(bx,by,0,bx,by,130);
    g.addColorStop(0,"#ff4da655");g.addColorStop(1,"#ff4da600");x.fillStyle=g;x.fillRect(bx-130,by-130,260,260)}
  x.restore()}
  x.shadowColor="#ff4da6";x.shadowBlur=14+5*Math.sin(now/200);x.strokeStyle="#fff";x.lineWidth=3;x.beginPath();x.arc(zx,zy,zr,0,7);x.stroke();x.shadowBlur=0;
  x.setLineDash([12,10]);x.strokeStyle="#ffffffa0";x.lineWidth=2;x.beginPath();x.arc(st.nz[0],st.nz[1],st.nz[2],0,7);x.stroke();x.setLineDash([]);
  x.restore();
  // ----- interface (agrandie quand le jeu est affiché en petit, comme sur iPhone) -----
  x.drawImage(vig(250,"8"),0,0);
  const out=mp&&(mp[0]-zx)**2+(mp[1]-zy)**2>zr*zr;
  if(out){x.fillStyle="#ff000022";x.fillRect(0,0,800,560)}
  const hs=vsc,hb=Math.min(hs,1.4),hp=(t,px,py,al,s,bg)=>{x.save();x.translate(px,py);x.scale(s,s);pill(x,t,0,0,al,bg);x.restore()},ky=10+26*hs+10;
  hp(`👥 ${st.al}   ☠ ${mq?mq[9]:0}`,12,10,"l",hs);
  hp(st.zs?"⚠️ La zone rétrécit !":`🌀 Zone dans ${st.zt} s`,400,10,"c",hs,st.zs?"#b31266cc":"#000a");
  st.kf.slice(-4).forEach((s,i)=>hp(s,788,ky+i*28*hs,"r",hs));
  if(out)hp("Retourne dans la zone !",400,ky,"c",hs,"#ff4d6dcc");
  if(mq&&mq[4]){
    x.save();x.translate(400,550);x.scale(hb,hb);
    const bx=-130,by=-72,bw=260,wc=mq[8]?RAR[mq[8]][1]:"#cfd3ff",hc=mq[2]>50?"#3ee66a":mq[2]>25?"#ffd23f":"#ff4d6d";
    x.fillStyle="#000b";rr(x,bx,by,bw,72,12);x.fill();x.strokeStyle=wc;x.lineWidth=2;x.stroke();
    x.save();x.translate(bx+22,by+34);x.shadowColor=wc;x.shadowBlur=8;gun(x,mq[8],1.25);x.restore();
    x.fillStyle="#fff";x.font="700 13px sans-serif";x.textAlign="left";x.fillText(WP[mq[8]][0],bx+14,by+64);
    x.fillStyle="#ffffff22";rr(x,bx+96,by+12,152,10,5);x.fill();rr(x,bx+96,by+32,152,16,8);x.fill();
    if(mq[3]>0){x.fillStyle="#35d0ff";rr(x,bx+96,by+12,Math.max(8,152*mq[3]/100),10,5);x.fill()}
    x.fillStyle=hc;rr(x,bx+96,by+32,Math.max(10,152*mq[2]/100),16,8);x.fill();
    x.fillStyle="#fff";x.font="700 11px sans-serif";x.fillText(`🛡 ${mq[3]}`,bx+100,by+21);x.font="700 13px sans-serif";x.fillText(`❤ ${mq[2]}`,bx+102,by+45);
    x.restore();
  }else if(mq)hp("Éliminé 👀 tu regardes la fin de la partie",400,544-26*hb,"c",hb);
  // mini-carte avec les objets (ancrée en bas à droite)
  const mx0=-124,my0=-93,ms=.0775;
  x.save();x.translate(794,544);x.scale(hb,hb);
  x.save();x.fillStyle="#000b";rr(x,mx0,my0,124,93,8);x.fill();x.clip();
  x.fillStyle="#ffffff18";m.H.forEach(([a,b,w,hh])=>x.fillRect(mx0+2+a*ms,my0+2+b*ms,w*ms,hh*ms));
  lootC.forEach(l=>{x.fillStyle=lc(l[3]);x.beginPath();x.arc(mx0+2+l[1]*ms,my0+2+l[2]*ms,l[3]===4?2.6:1.6,0,7);x.fill()});
  x.strokeStyle="#fff";x.lineWidth=1.5;x.beginPath();x.arc(mx0+2+zx*ms,my0+2+zy*ms,zr*ms,0,7);x.stroke();
  x.setLineDash([3,3]);x.strokeStyle="#ffffff90";x.beginPath();x.arc(mx0+2+st.nz[0]*ms,my0+2+st.nz[1]*ms,st.nz[2]*ms,0,7);x.stroke();x.setLineDash([]);
  if(mp){x.fillStyle="#fff";x.beginPath();x.arc(mx0+2+mp[0]*ms,my0+2+mp[1]*ms,4.5,0,7);x.fill();x.fillStyle=mq[6];x.beginPath();x.arc(mx0+2+mp[0]*ms,my0+2+mp[1]*ms,3,0,7);x.fill()}
  x.restore();x.restore();
}

// Commandes : souris / doigt pour viser et tirer, espace pour tirer
const cpos=e=>{const r=cvs.getBoundingClientRect();return{x:(e.clientX-r.left)*cvs.width/r.width,y:(e.clientY-r.top)*cvs.height/r.height}};
const setFire=()=>{brFire=ptrDown||spDown?1:0;brSend()};
cvs.addEventListener("pointermove",e=>{if(touchy(e))return;if(gk==="br"&&cur==="game")mpos=cpos(e)});
cvs.addEventListener("pointerdown",e=>{if(touchy(e)||gk!=="br"||cur!=="game")return;e.preventDefault();try{cvs.setPointerCapture(e.pointerId)}catch{}mpos=cpos(e);ptrDown=1;setFire()});
["pointerup","pointercancel"].forEach(t=>cvs.addEventListener(t,e=>{if(touchy(e))return;ptrDown=0;if(gk==="br"&&cur==="game")setFire()}));
cvs.addEventListener("contextmenu",e=>{if(gk==="br")e.preventDefault()});
addEventListener("keydown",e=>{if(e.key===" "&&gk==="br"&&cur==="game"&&!/^(INPUT|TEXTAREA|BUTTON)$/.test(e.target.tagName)){e.preventDefault();spDown=1;setFire()}});
addEventListener("keyup",e=>{if(e.key===" "&&gk==="br"&&cur==="game"){spDown=0;setFire()}});

// ---------- Jeu : boucle de l'hôte ----------
$("start").onclick=async()=>{
  if(lobby.game==="sim")return startSim(simEnv());
  if(lobby.game==="surv")return startSurv();
  if(lobby.game==="lab")return startLab();
  if(lobby.game==="br")return startBr();
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
  let tk=0;const pace=mkPace();
  const step=()=>{
    tk++;
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
    if(bonus&&food.filter(f=>f[2]).length<2&&(tk===20||Math.random()<.04))food.push([...free(),Math.random()<.65?1:2,100]);
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
    pace(Math.max(60,base-Math.max(...Object.values(snakes).map(s=>s.p))*2),step);
  };
  step();
};

// ---------- Survie coop (l'hôte simule, tir automatique sur le monstre le plus proche) ----------
async function startSurv(){
  const pace=mkPace(),c=code,players=lobby.players,ids=Object.keys(players),W=800,H=560,SPD=[3.2,5,2],RAD=[12,9,20];
  await remove(R(`games/${c}`));await update(R(`lobbies/${c}`),{status:"playing"});
  const P={},want={},seen={},up={fr:5,dm:1,sp:1,pr:0};let opts=[],votes={},M=[],B=[],nid=1,wv=0,left=0,brk=40,tk=0,kills=0,msg="Préparez-vous !";
  ids.forEach((u,i)=>{P[u]={n:players[u].name,c:players[u].color,x:200+i*60,y:280,hp:5,k:0,inv:0,cd:0,a:1};want[u]=[0,0]});
  const un=onValue(R(`games/${c}/inputs`),s=>Object.entries(s.val()||{}).forEach(([u,v])=>{if(!P[u]||seen[u]===v)return;seen[u]=v;const sp=String(v).split(",");if(sp[0]==="v"){if(opts[+sp[1]])votes[u]=+sp[1];return}const[a,b]=sp.map(Number);if(a===a&&b===b)want[u]=[Math.max(-1,Math.min(1,a)),Math.max(-1,Math.min(1,b))]}));
  const UPG=[["⚡ Cadence +",()=>up.fr=Math.max(2,up.fr-1)],["💥 Dégâts +",()=>up.dm++],["👟 Vitesse +",()=>up.sp+=.12],["🎯 Balles perforantes",()=>up.pr++]];
  const pub=(x={})=>set(R(`games/${c}/state`),JSON.stringify({k:"surv",W,H,wv,msg,kl:kills,sp:+up.sp.toFixed(2),br:brk>0?1:0,vt:brk>0&&opts.length?opts.map(o=>o[0]):0,vc:opts.map((_,i)=>Object.values(votes).filter(v=>v===i).length),
    p:Object.fromEntries(ids.map(u=>{const q=P[u];return[u,[Math.round(q.x),Math.round(q.y),q.hp,q.k,q.a,q.n,q.c,q.inv>0?1:0]]})),
    m:M.map(m=>[m[0],Math.round(m[1]),Math.round(m[2]),m[3],m[4]]),b:B.map(b=>[Math.round(b[0]),Math.round(b[1]),b[2],b[3]]),...x}));
  const startWave=()=>{wv++;left=4+wv*3;msg="Vague "+wv;
    if(opts.length){const cnt=opts.map((_,i)=>Object.values(votes).filter(v=>v===i).length),mx=Math.max(...cnt),top=cnt.map((n,i)=>n===mx?i:-1).filter(i=>i>=0),u=opts[top[Math.floor(Math.random()*top.length)]];u[1]();msg+=" · "+u[0];opts=[];votes={}}
    ids.forEach(u=>{const q=P[u];if(!q.a){q.a=1;q.hp=3}else q.hp=Math.min(5,q.hp+1);q.inv=20})}; // les morts reviennent à chaque vague
  const step=()=>{
    if(code!==c){un();return}
    tk++;const alive=ids.filter(u=>P[u].a);
    if(brk>0){if(opts.length&&brk>8&&ids.filter(u=>P[u].a).every(u=>votes[u]!=null))brk=8;brk--;if(!brk)startWave()}
    else{
      if(left>0&&tk%3===0){const e=Math.floor(Math.random()*4),r=Math.random(),q=Math.random(),t=wv>2&&q<.15?2:wv>1&&q<.4?1:0;
        M.push([nid++,e<2?r*W:(e===2?-10:W+10),e<2?(e?H+10:-10):r*H,t===2?6+wv:t?1:2,t]);left--}
      if(left===0&&!M.length){brk=70;msg="Vague "+wv+" terminée ! Vote :";opts=[...UPG].sort(()=>Math.random()-.5).slice(0,3);votes={}}
    }
    alive.forEach(u=>{const q=P[u],[a,b]=want[u],n=a&&b?.707:1,s=9*up.sp;
      q.x=Math.max(14,Math.min(W-14,q.x+a*n*s));q.y=Math.max(14,Math.min(H-14,q.y+b*n*s));if(q.inv>0)q.inv--;
      if(--q.cd<=0&&M.length){let best=null,bd=360*360;M.forEach(m=>{const d=(m[1]-q.x)**2+(m[2]-q.y)**2;if(d<bd){bd=d;best=m}});
        if(best){const d=Math.sqrt(bd)||1;B.push([q.x,q.y,(best[1]-q.x)/d*22,(best[2]-q.y)/d*22,18,up.pr,u]);q.cd=up.fr}}});
    B=B.filter(b=>{b[0]+=b[2];b[1]+=b[3];if(--b[4]<=0||b[0]<-20||b[0]>W+20||b[1]<-20||b[1]>H+20)return false;
      for(const m of M){const r=RAD[m[4]]+4;if(m[3]>0&&(m[1]-b[0])**2+(m[2]-b[1])**2<r*r){m[3]-=up.dm;if(m[3]<=0){kills++;if(P[b[6]])P[b[6]].k++}if(b[5]--<=0)return false}}
      return true});
    M=M.filter(m=>m[3]>0);
    M.forEach(m=>{let t=null,bd=1e12;alive.forEach(u=>{const d=(P[u].x-m[1])**2+(P[u].y-m[2])**2;if(P[u].a&&d<bd){bd=d;t=P[u]}});
      if(!t)return;const d=Math.sqrt(bd)||1;m[1]+=(t.x-m[1])/d*SPD[m[4]];m[2]+=(t.y-m[2])/d*SPD[m[4]];
      if(d<RAD[m[4]]+13&&t.inv<=0){t.hp--;t.inv=12;if(t.hp<=0)t.a=0}});
    if(!ids.some(u=>P[u].a)){
      un();set(R("stats/gamesPlayed"),increment(1)).catch(()=>{});pub({o:1,msg:`Défaite à la vague ${wv} · ☠ ${kills}`});
      setTimeout(async()=>{const cp=(lobby&&lobby.players)||{},u2={status:"lobby"};ids.filter(u=>cp[u]).forEach(u=>u2[`players/${u}/ready`]=u===me.uid);try{await update(R(`lobbies/${c}`),u2)}catch{}},6000);
      return;
    }
    pub();pace(100,step);
  };
  step();
}

// ---------- Évasion coop : labyrinthe (l'hôte simule, la carte vient d'une graine commune) ----------
// Taille, clés, portes et gardiens s'adaptent au nombre de joueurs (N) et au niveau (lv).
const LT=40,GC=["#ffd23f","#6c8cff","#c77dff","#ff9f1c"]; // LT = taille d'une case en pixels ; GC = couleur de chaque porte
function genLab(sd,N,lv){
  const r=rng(sd),cw=Math.min(16,5+N+lv),ch=Math.min(11,4+Math.ceil(N/2)+(lv>>1)),TW=2*cw+1,TH=2*ch+1,T=new Uint8Array(TW*TH).fill(1),I=(x,y)=>y*TW+x;
  const D4=[[1,0],[-1,0],[0,1],[0,-1]],fl=(x,y)=>T[I(x,y)]===0;
  // labyrinthe parfait (un seul chemin entre deux cases) : les portes ne peuvent donc jamais être contournées
  const seen=new Uint8Array(cw*ch),stk=[[0,0]];seen[0]=1;T[I(1,1)]=0;
  while(stk.length){const[a,b]=stk[stk.length-1],nb=[];
    D4.forEach(([dx,dy])=>{const i=a+dx,j=b+dy;if(i>=0&&j>=0&&i<cw&&j<ch&&!seen[j*cw+i])nb.push([i,j,dx,dy])});
    if(!nb.length){stk.pop();continue}
    const[i,j,dx,dy]=nb[Math.floor(r()*nb.length)];seen[j*cw+i]=1;T[I(2*i+1,2*j+1)]=0;T[I(2*a+1+dx,2*b+1+dy)]=0;stk.push([i,j])}
  const bfs=(sx,sy)=>{const d=new Int16Array(TW*TH).fill(-1),pa=new Int32Array(TW*TH).fill(-1),q=[I(sx,sy)];d[q[0]]=0;
    for(let h=0;h<q.length;h++){const c=q[h],x=c%TW,y=(c-x)/TW;for(const[a,b]of D4){const n=I(x+a,y+b);if(T[n]===0&&d[n]<0){d[n]=d[c]+1;pa[n]=c;q.push(n)}}}
    return{d,pa,q}};
  const B=bfs(1,1),sp=I(1,1),shuf=a=>{for(let i=a.length-1;i>0;i--){const j=Math.floor(r()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a};
  let ei=sp,bd=-1;for(const c of B.q){const x=c%TW,y=(c-x)/TW;if(x%2&&y%2&&B.d[c]>bd){bd=B.d[c];ei=c}}
  const path=[];for(let c=ei;c>=0;c=B.pa[c])path.push(c);path.reverse();const L=path.length,pathSet=new Set(path);
  const isDead=c=>{const x=c%TW,y=(c-x)/TW;let n=0;for(const[a,b]of D4)if(fl(x+a,y+b))n++;return n===1};
  // portes : placées sur le chemin principal, dans un couloir (case « entre deux salles »)
  const ng=Math.min(4,1+Math.floor((N-1)/3)+((lv-1)>>1)),gates=[];let prev=0;
  for(let i=0;i<ng;i++){const tg=Math.round(L*(i+1)/(ng+1));let k=-1;
    for(let o=0;o<=5&&k<0;o++)for(const q of[tg+o,tg-o]){if(q<0||q>=L)continue;const x=path[q]%TW,y=(path[q]-x)/TW;if(q>prev+5&&q<L-5&&(x+y)%2===1){k=q;break}}
    if(k<0)continue;gates.push({k});prev=k}
  const used=new Set([sp,ei]);gates.forEach(g=>{used.add(path[g.k]);used.add(path[g.k+2])});
  // plaque : dans un cul-de-sac AVANT la porte. levier : juste APRÈS la porte (il la verrouille ouverte)
  const out=gates.map(g=>{
    const gc=path[g.k],gx=gc%TW,gy=(gc-gx)/TW,G=bfs(gx,gy),beyond=c=>{for(let t=c;t>=0;t=B.pa[t])if(t===gc)return true;return false};
    const ok=(c,m)=>!used.has(c)&&!beyond(c)&&G.d[c]>=m;
    let cand=B.q.filter(c=>isDead(c)&&ok(c,6));if(!cand.length)cand=B.q.filter(c=>!pathSet.has(c)&&ok(c,4));if(!cand.length)cand=[path[Math.max(1,g.k-3)]];
    const pc=cand[Math.floor(r()*cand.length)];used.add(pc);const lc=path[g.k+2];
    return{x:gx,y:gy,c:gc,px:pc%TW,py:(pc-pc%TW)/TW,lx:lc%TW,ly:(lc-lc%TW)/TW}});
  // clés : dans les culs-de-sac (donc à explorer, parfois derrière une porte)
  const K=Math.min(9,N+1+Math.ceil(lv/2));
  let kc=shuf(B.q.filter(c=>isDead(c)&&!used.has(c)));
  if(kc.length<K)kc=kc.concat(shuf(B.q.filter(c=>{const x=c%TW,y=(c-x)/TW;return x%2&&y%2&&!used.has(c)&&!kc.includes(c)})));
  const keys=kc.slice(0,K).map(c=>[c%TW,(c-c%TW)/TW]);
  // gardiens : loin du départ
  const gn=Math.min(12,Math.ceil(N/2)+((lv-1)>>1));
  let gc2=shuf(B.q.filter(c=>{const x=c%TW,y=(c-x)/TW;return x%2&&y%2&&B.d[c]>=12}));if(gc2.length<gn)gc2=shuf(B.q.filter(c=>{const x=c%TW,y=(c-x)/TW;return x%2&&y%2&&B.d[c]>=6}));
  const gs=gc2.slice(0,gn).map(c=>[c%TW,(c-c%TW)/TW]);
  return{TW,TH,T,sp:[1,1],ex:[ei%TW,(ei-ei%TW)/TW],gates:out,gm:new Map(out.map((g,i)=>[g.c,i])),keys,gs};
}
// vrai si un disque de rayon R centré en (x,y) touche un mur ou une porte fermée (go = masque des portes ouvertes)
function labBlocked(m,go,x,y,R=11){
  const x0=Math.floor((x-R)/LT),x1=Math.floor((x+R)/LT),y0=Math.floor((y-R)/LT),y1=Math.floor((y+R)/LT);
  for(let ty=y0;ty<=y1;ty++)for(let tx=x0;tx<=x1;tx++){
    let w=tx<0||ty<0||tx>=m.TW||ty>=m.TH||m.T[ty*m.TW+tx]===1;
    if(!w){const g=m.gm.get(ty*m.TW+tx);if(g!=null&&!((go>>g)&1))w=true}
    if(!w)continue;
    const cx=Math.max(tx*LT,Math.min(x,tx*LT+LT)),cy=Math.max(ty*LT,Math.min(y,ty*LT+LT));
    if((x-cx)**2+(y-cy)**2<R*R)return true}
  return false;
}

// Fond du labyrinthe : dessiné une seule fois par niveau
function labBg(m){
  if(m.bg)return m.bg;const c=mkC(m.TW*LT,m.TH*LT),g=c.getContext("2d"),f=(x,y)=>x>=0&&y>=0&&x<m.TW&&y<m.TH&&m.T[y*m.TW+x]===0;
  g.fillStyle="#1a1438";g.fillRect(0,0,c.width,c.height);
  for(let y=0;y<m.TH;y++)for(let x=0;x<m.TW;x++){
    if(m.T[y*m.TW+x]){g.fillStyle="#3a3068";g.fillRect(x*LT,y*LT,LT,LT);
      if(f(x,y-1)){g.fillStyle="#5a4fa0";g.fillRect(x*LT,y*LT,LT,4)}
      if(f(x,y+1)){g.fillStyle="#241c4a";g.fillRect(x*LT,y*LT+LT-5,LT,5)}}
    else if((x+y)%2){g.fillStyle="#201a45";g.fillRect(x*LT,y*LT,LT,LT)}}
  g.fillStyle="#3ee6c433";g.fillRect(m.sp[0]*LT,m.sp[1]*LT,LT,LT);
  return m.bg=c;
}
let labM=null;
function labMapFor(n){const k=n.sd+"|"+n.n+"|"+n.lv;if(!labM||labM.key!==k){labM=genLab(n.sd,n.n,n.lv);labM.key=k}return labM}
function onLab(n){
  const now=performance.now(),first=!st||st.k!=="lab";if(st)tDt=Math.min(250,Math.max(60,tDt*.6+(now-tAt)*.4));
  if(first){lab.me=null;lab.ep=-1;lab.sent=0;lab.pos={};lab.ang={}}
  pv=st;st=n;tAt=now;const m=labMapFor(n);
  if(pv&&pv.k==="lab"){
    if(pv.lv!==n.lv)beep(440,.2,"triangle",.05,880);
    else{
      if(n.ky.length<pv.ky.length){pv.ky.filter(i=>!n.ky.includes(i)).forEach(i=>{const[a,b]=m.keys[i];sb((a+.5)*LT,(b+.5)*LT,"#ffd23f",14,200)});beep(880,.1,"triangle",.05,1320)}
      if(n.go&~pv.go)beep(300,.18,"square",.04,620);
      if(pv.go&~n.go)beep(520,.15,"square",.03,260);
      if(n.lf<pv.lf){shk=now+250;beep(150,.25,"sawtooth",.05,60);
        Object.entries(n.p).forEach(([u,q])=>{const o=pv.p[u];if(o&&q[2]&&!o[2]){sb(o[0],o[1],"#ff4d6d",16,220);if(me&&u===me.uid){lab.flash=now+350;if(navigator.vibrate)navigator.vibrate(70)}}})}
    }
  }
  setScore(Object.values(n.p).map(q=>[`${q[3]}${q[5]?" ✔":""}`,q[4]]));
  setOv(n.o||n.fz?n.msg:"");
}
function drawLab(now){
  const x=gctx(),m=labM;if(!m)return;
  const o=pv&&pv.k==="lab"&&pv.sd===st.sd?pv:null,p=Math.min(1,(now-tAt)/tDt),dt=Math.min(.05,(now-(drawLab.t||now))/1000);drawLab.t=now;
  const ip=(a,b)=>!a||Math.hypot(a[0]-b[0],a[1]-b[1])>90?[b[0],b[1]]:[a[0]+(b[0]-a[0])*p,a[1]+(b[1]-a[1])*p]; // pas d'interpolation après une téléportation
  const P=Object.entries(st.p).map(([u,q])=>{const r=ip(o&&o.p[u],q);return{u,q,x:r[0],y:r[1]}});
  const mpl=me&&P.find(e=>e.u===me.uid);pred=null;
  if(mpl){
    // Ma position m'appartient : je me déplace tout de suite et je la signale à l'hôte (10 fois/s). L'hôte ne me recale (ep change)
    // que si elle est invalide (porte refermée entre-temps...) : plus de retour en arrière à l'arrêt ou quand le réseau saccade.
    if(!lab.me||mpl.q[6]!==lab.ep){lab.me={x:mpl.q[0],y:mpl.q[1]};lab.ep=mpl.q[6]}
    const p2=lab.me,a=(held.has("R")?1:0)-(held.has("L")?1:0),b=(held.has("D")?1:0)-(held.has("U")?1:0);
    if((a||b)&&!st.fz&&!st.o){const n=a&&b?.707:1,sub=Math.max(1,Math.ceil(dt*120/5)),s=120*dt*n/sub;
      for(let i=0;i<sub;i++){const Rr=labBlocked(m,st.go,p2.x,p2.y)?7:11; // coincé dans un mur/une porte : on peut toujours en sortir
        if(a){const nx=p2.x+a*s;if(!labBlocked(m,st.go,nx,p2.y,Rr))p2.x=nx}
        if(b){const ny=p2.y+b*s;if(!labBlocked(m,st.go,p2.x,ny,Rr))p2.y=ny}}}
    mpl.x=p2.x;mpl.y=p2.y;
    const rx=Math.round(p2.x),ry=Math.round(p2.y);
    if(code&&now-lab.sent>=90&&(rx!==lab.lx||ry!==lab.ly||now-lab.sent>1000)){lab.sent=now;lab.lx=rx;lab.ly=ry;
      set(R(`games/${code}/inputs/${me.uid}`),`p,${rx},${ry},${lab.ep},${++seqN}`).catch(()=>{})}}
  const Z=TOUCH?1.35:1,VW=800/Z,VH=560/Z,WW=m.TW*LT,WH=m.TH*LT,hs=vsc,ns=Math.min(1.5,hs),f=mpl||P[0],K=m.keys.length,ok=st.kk>=K;
  const camX=WW<=VW?(WW-VW)/2:Math.max(0,Math.min(WW-VW,(f?f.x:WW/2)-VW/2)),camY=WH<=VH?(WH-VH)/2:Math.max(0,Math.min(WH-VH,(f?f.y:WH/2)-VH/2));
  x.fillStyle="#0e0a22";x.fillRect(0,0,800,560);
  x.save();x.scale(Z,Z);if(now<shk)x.translate((Math.random()-.5)*8,(Math.random()-.5)*8);x.translate(-camX,-camY);
  x.drawImage(labBg(m),0,0);x.textAlign="center";x.textBaseline="middle";
  // sortie
  const ex=(m.ex[0]+.5)*LT,ey=(m.ex[1]+.5)*LT;
  x.globalAlpha=ok?.55+.25*Math.sin(now/250):1;x.fillStyle=ok?"#34c759":"#ffffff14";x.fillRect(m.ex[0]*LT+2,m.ex[1]*LT+2,LT-4,LT-4);x.globalAlpha=1;
  x.strokeStyle=ok?"#34c759":"#8a86b8";x.lineWidth=3;x.strokeRect(m.ex[0]*LT+2,m.ex[1]*LT+2,LT-4,LT-4);
  x.font="22px sans-serif";x.fillStyle="#fff";x.fillText(ok?"🚪":"🔒",ex,ey+1);
  // plaques, leviers et portes (une couleur par porte)
  m.gates.forEach((g,i)=>{
    const c=GC[i%4],pr=(st.pp>>i)&1,pm=(st.pm>>i)&1,op=(st.go>>i)&1,px=(g.px+.5)*LT,py=(g.py+.5)*LT;
    x.fillStyle="#0007";x.beginPath();x.arc(px,py,17,0,7);x.fill();
    x.strokeStyle=c;x.lineWidth=4;x.beginPath();x.arc(px,py,15,0,7);x.stroke();
    x.globalAlpha=pr||pm?1:.35;x.fillStyle=c;x.beginPath();x.arc(px,py,pr?11:9,0,7);x.fill();x.globalAlpha=1;
    if(st.n>1){const lx=(g.lx+.5)*LT,ly=(g.ly+.5)*LT,tx=lx+(pm?10:-10);
      x.fillStyle="#241c4a";x.fillRect(lx-13,ly+3,26,9);x.strokeStyle=c;x.lineWidth=5;x.lineCap="round";x.beginPath();x.moveTo(lx,ly+6);x.lineTo(tx,ly-8);x.stroke();
      x.fillStyle=c;x.beginPath();x.arc(tx,ly-8,4.5,0,7);x.fill()}
    const gx=g.x*LT,gy=g.y*LT;
    if(op){x.strokeStyle=c;x.globalAlpha=.55;x.lineWidth=2;x.setLineDash([5,5]);x.strokeRect(gx+3,gy+3,LT-6,LT-6);x.setLineDash([]);x.globalAlpha=1}
    else{x.fillStyle=c;x.fillRect(gx+2,gy+2,LT-4,LT-4);x.fillStyle="#0007";[9,19,29].forEach(q=>x.fillRect(gx+q,gy+4,3,LT-8))}});
  // clés
  st.ky.forEach(i=>{const[a,b]=m.keys[i],kx=(a+.5)*LT,ky=(b+.5)*LT+Math.sin(now/220+i)*3;x.drawImage(glow("#ffd23f",30),kx-42,ky-42);x.font="22px sans-serif";x.fillStyle="#fff";x.fillText("🗝️",kx,ky)});
  // gardiens
  st.g.forEach((q,i)=>{const r=ip(o&&o.g[i],q),gx=r[0],gy=r[1],rr=13*(1+.06*Math.sin(now/110+i));let t=null,bd=1e12;P.forEach(e=>{const d=(e.x-gx)**2+(e.y-gy)**2;if(d<bd){bd=d;t=e}});
    const a=t?Math.atan2(t.y-gy,t.x-gx):0;
    x.globalAlpha=q[2]?.4:1;if(!q[2])x.drawImage(glow("#e63946",30),gx-42,gy-42);
    x.fillStyle="#0006";x.beginPath();x.ellipse(gx,gy+rr*.8,rr*.9,rr*.35,0,0,7);x.fill();
    x.fillStyle="#e63946";x.beginPath();x.arc(gx,gy,rr,0,7);x.fill();x.strokeStyle="#0005";x.lineWidth=2;x.stroke();
    [-1,1].forEach(sd=>{const ex2=gx+Math.cos(a)*rr*.35-Math.sin(a)*rr*.4*sd,ey2=gy+Math.sin(a)*rr*.35+Math.cos(a)*rr*.4*sd;
      x.fillStyle="#fff";x.beginPath();x.arc(ex2,ey2,rr*.26,0,7);x.fill();x.fillStyle="#14102b";x.beginPath();x.arc(ex2+Math.cos(a)*rr*.1,ey2+Math.sin(a)*rr*.1,rr*.13,0,7);x.fill()});x.globalAlpha=1});
  // joueurs
  P.forEach(e=>{const{u,q,x:px,y:py}=e,old=lab.pos[u];let a=lab.ang[u]||0;if(old&&Math.hypot(px-old[0],py-old[1])>.4&&Math.hypot(px-old[0],py-old[1])<60)a=lab.ang[u]=Math.atan2(py-old[1],px-old[0]);lab.pos[u]=[px,py];
    x.save();x.globalAlpha=q[2]?.45+.3*Math.sin(now/60):1;
    x.fillStyle="#0006";x.beginPath();x.ellipse(px,py+9,11,4.5,0,0,7);x.fill();
    if(me&&u===me.uid){x.globalAlpha*=.35;x.fillStyle=q[4];x.beginPath();x.arc(px,py,19,0,7);x.fill();x.globalAlpha=q[2]?.45+.3*Math.sin(now/60):1}
    x.fillStyle=q[4];x.beginPath();x.arc(px,py,11,0,7);x.fill();x.strokeStyle="#0005";x.lineWidth=2;x.stroke();
    [-1,1].forEach(sd=>{x.fillStyle="#fff";x.beginPath();x.arc(px+Math.cos(a)*5-Math.sin(a)*3.6*sd,py+Math.sin(a)*5+Math.cos(a)*3.6*sd,3,0,7);x.fill();
      x.fillStyle="#14102b";x.beginPath();x.arc(px+Math.cos(a)*6.2-Math.sin(a)*3.6*sd,py+Math.sin(a)*6.2+Math.cos(a)*3.6*sd,1.4,0,7);x.fill()});
    x.restore();x.fillStyle="#fff";x.font=`${12*ns}px sans-serif`;x.fillText(q[3],px,py-19-3*ns)});
  const dt2=dt;parts=parts.filter(q=>(q.l-=dt2*1.8)>0);parts.forEach(q=>{q.x+=q.vx*dt2;q.y+=q.vy*dt2;x.globalAlpha=q.l;x.fillStyle=q.c;x.fillRect(q.x-3,q.y-3,6,6)});x.globalAlpha=1;
  x.restore();
  x.drawImage(vig(220,"9"),0,0);
  if(now<lab.flash){x.globalAlpha=(lab.flash-now)/350*.35;x.fillStyle="#ff4d6d";x.fillRect(0,0,800,560);x.globalAlpha=1}
  // minicarte (en haut à droite : le pouce ne la cache pas)
  const s=Math.min(150*ns/WW,100*ns/WH),mw=WW*s,mh=WH*s,mx=792-mw,my=8;
  x.fillStyle="#0e0a22cc";x.fillRect(mx-3,my-3,mw+6,mh+6);x.globalAlpha=.9;x.drawImage(labBg(m),mx,my,mw,mh);x.globalAlpha=1;
  x.fillStyle=ok?"#34c759":"#8a86b8";x.fillRect(mx+m.ex[0]*LT*s-2,my+m.ex[1]*LT*s-2,LT*s+4,LT*s+4);
  P.forEach(e=>{x.fillStyle=e.q[4];x.beginPath();x.arc(mx+e.x*s,my+e.y*s,3,0,7);x.fill()});
  x.strokeStyle="#fff6";x.lineWidth=1;x.strokeRect(mx+camX*s,my+camY*s,VW*s,VH*s);
  // en-tête
  x.fillStyle="#fff";x.font=`700 ${18*hs}px sans-serif`;x.textAlign="left";x.textBaseline="alphabetic";
  x.fillText(`Niveau ${st.lv}   🗝 ${st.kk}/${K}   ♥ ${Math.max(0,st.lf)}`,12,6+19*hs);
}
const lab={pos:{},ang:{},flash:0,me:null,ep:-1,sent:0,lx:0,ly:0};

// ---------- Évasion coop : boucle de l'hôte (10 images/s, vitesses calculées sur le temps réel) ----------
async function startLab(){
  const pace=mkPace(),c=code,players=lobby.players,ids=Object.keys(players),N=ids.length,D4=[[1,0],[-1,0],[0,1],[0,-1]];
  await remove(R(`games/${c}`));await update(R(`lobbies/${c}`),{status:"playing"});
  const P={},tgt={},cr={},seen={};
  ids.forEach(u=>{P[u]={n:players[u].name,c:players[u].color,x:0,y:0,inv:0,ex:0};cr[u]=0});
  // chaque joueur signale sa position ("p,x,y,ep,n") ; ep = « époque » : l'hôte ignore les signalements d'avant son dernier recalage
  const un=onValue(R(`games/${c}/inputs`),s=>Object.entries(s.val()||{}).forEach(([u,v])=>{if(!P[u]||!m||seen[u]===v)return;seen[u]=v;
    const a=String(v).split(","),x=+a[1],y=+a[2],ep=+a[3];
    if(a[0]==="p"&&x===x&&y===y&&ep===cr[u])tgt[u]={x:Math.max(11,Math.min(m.TW*LT-11,x)),y:Math.max(11,Math.min(m.TH*LT-11,y))}}));
  let lv=0,sd=0,m=null,keys=[],kk=0,pm=0,pp=0,go=0,gr=[],G=[],cp=[0,0],lives=N+3,brk=0,clr=0,msg="",act=ids.slice(),lastT=performance.now();
  const ctr=(tx,ty)=>[(tx+.5)*LT,(ty+.5)*LT],near=(u,x,y,d)=>(P[u].x-x)**2+(P[u].y-y)**2<d*d;
  // les joueurs se répartissent autour du point de départ / de réapparition (au lieu de s'empiler)
  const spot=u=>{const i=ids.indexOf(u),a=i*6.2832/N;return N>1?[cp[0]+Math.cos(a)*8,cp[1]+Math.sin(a)*8]:cp};
  const place=u=>{const s=spot(u);P[u].x=s[0];P[u].y=s[1];tgt[u]=null;cr[u]++}; // cr++ : le joueur est recalé sur cette position
  const home=(g,i)=>{const[sx,sy]=m.gs[i];g.x=(sx+.5)*LT;g.y=(sy+.5)*LT;g.tx=sx;g.ty=sy;g.dx=g.dy=0;g.st=0};
  const newLevel=()=>{
    lv++;sd=Math.floor(Math.random()*2147483647);m=genLab(sd,N,lv);keys=m.keys.map((_,i)=>i);kk=0;pm=pp=go=0;gr=m.gates.map(()=>0);
    cp=ctr(...m.sp);G=m.gs.map(()=>({x:0,y:0,tx:0,ty:0,dx:0,dy:0,st:0}));G.forEach(home);
    ids.forEach(u=>{place(u);P[u].inv=15;P[u].ex=0});
    if(lv>1)lives=Math.min(N+5,lives+1);
    msg=`Niveau ${lv}`;brk=20;
  };
  const pub=(x={})=>set(R(`games/${c}/state`),JSON.stringify({k:"lab",n:N,lv,sd,kk,lf:lives,go,pp,pm,ky:keys,fz:brk>0?1:0,msg,
    g:G.map(g=>[Math.round(g.x),Math.round(g.y),g.st>0?1:0]),
    p:Object.fromEntries(act.map(u=>{const q=P[u];return[u,[Math.round(q.x),Math.round(q.y),q.inv>0?1:0,q.n,q.c,q.ex,cr[u]]]})),...x}));
  const step=()=>{
    if(code!==c){un();return}
    const tn=performance.now(),dt=Math.min(.25,Math.max(.03,(tn-lastT)/1000));lastT=tn;
    act=ids.filter(u=>lobby&&lobby.players&&lobby.players[u]); // un joueur parti disparaît : il ne peut plus faire perdre de vies
    const solo=act.length<=1;
    if(brk>0){brk--;if(!brk&&clr){clr=0;newLevel()}}
    else{
      // plaques et leviers. À plusieurs : la porte reste ouverte tant qu'on tient la plaque (+1 s), le levier la verrouille ouverte.
      // Tout seul (ou si les autres sont partis) : la plaque suffit, elle verrouille la porte ouverte.
      m.gates.forEach((g,i)=>{
        const[px,py]=ctr(g.px,g.py),[lx,ly]=ctr(g.lx,g.ly),on=act.some(u=>near(u,px,py,22));
        if(on){pp|=1<<i;gr[i]=solo?0:10;if(solo&&!((pm>>i)&1))pm|=1<<i}else{pp&=~(1<<i);if(gr[i]>0)gr[i]--}
        if(!((pm>>i)&1)&&act.some(u=>near(u,lx,ly,22)))pm|=1<<i});
      go=pm;m.gates.forEach((g,i)=>{const[gx,gy]=ctr(g.x,g.y); // une porte ne se referme jamais sur quelqu'un (joueur ou gardien)
        if(((pp>>i)&1)||gr[i]>0||act.some(u=>[P[u],tgt[u]].some(q=>q&&Math.abs(q.x-gx)<LT/2+9&&Math.abs(q.y-gy)<LT/2+9))||G.some(q=>Math.abs(q.x-gx)<LT/2&&Math.abs(q.y-gy)<LT/2))go|=1<<i});
      // déplacements : l'hôte suit la position signalée par chaque joueur et la VALIDE (vitesse max, mur, porte fermée).
      // Position invalide => refusée et le joueur est recalé (cr+1). Sinon il n'est jamais déplacé de force.
      act.forEach(u=>{const q=P[u];if(q.inv>0)q.inv--;const t=tgt[u];if(!t)return;
        let dx=t.x-q.x,dy=t.y-q.y,d=Math.hypot(dx,dy);if(d<.5)return;
        const allow=120*1.5*dt+8;if(d>allow){dx*=allow/d;dy*=allow/d}
        if(labBlocked(m,go,q.x+dx,q.y+dy,8)){tgt[u]=null;cr[u]++;return}
        q.x+=dx;q.y+=dy});
      // clés (partagées par toute l'équipe)
      keys=keys.filter(ki=>{const[kx,ky]=ctr(...m.keys[ki]);if(act.some(u=>near(u,kx,ky,24))){kk++;return false}return true});
      // gardiens : vitesse régulière (le reste du pas est reporté après un virage), tournent aux intersections, ne traversent JAMAIS une porte fermée
      const gsp=(42+Math.min(lv,8)*2.5)*dt,closed=(tx,ty)=>{const gi=m.gm.get(ty*m.TW+tx);return gi!=null&&!((go>>gi)&1)};
      G.forEach(g=>{if(g.st>0){g.st--;return}let rem=gsp;
        for(let it=0;it<6&&rem>0;it++){
          // la porte devant vient de se fermer : demi-tour (sauf si le gardien est déjà dedans : elle reste alors ouverte)
          if((g.dx||g.dy)&&closed(g.tx,g.ty)&&Math.hypot(g.x-(g.tx+.5)*LT,g.y-(g.ty+.5)*LT)>=18){g.tx-=g.dx;g.ty-=g.dy;g.dx=-g.dx;g.dy=-g.dy}
          const tx=(g.tx+.5)*LT,ty=(g.ty+.5)*LT,ex=tx-g.x,ey=ty-g.y,d=Math.hypot(ex,ey);
          if(d>rem){g.x+=ex/d*rem;g.y+=ey/d*rem;break}
          g.x=tx;g.y=ty;rem-=d;
          const dirs=D4.filter(([a,b])=>m.T[(g.ty+b)*m.TW+g.tx+a]===0&&!closed(g.tx+a,g.ty+b));
          if(!dirs.length){g.dx=g.dy=0;break}
          const fw=dirs.filter(([a,b])=>!(a===-g.dx&&b===-g.dy)),pool=fw.length?fw:dirs,same=pool.find(([a,b])=>a===g.dx&&b===g.dy),
            [a,b]=same&&Math.random()<.75?same:pool[Math.floor(Math.random()*pool.length)];
          g.dx=a;g.dy=b;g.tx+=a;g.ty+=b}});
      // un gardien touche un ou plusieurs joueurs (contact net : rayon 19 px) : UNE vie de l'équipe en moins (même si le groupe est touché
      // ensemble), on reste sur place, 4 s d'invincibilité pour s'éloigner, et le(s) gardien(s) touché(s) sont étourdis 2,5 s
      let hit=0;
      act.forEach(u=>{const q=P[u];if(q.inv>0)return;const hg=G.filter(g=>(g.x-q.x)**2+(g.y-q.y)**2<19*19);if(hg.length){hit=1;q.inv=40;hg.forEach(g=>g.st=25)}});
      if(hit)lives--;
      // sortie : toutes les clés + tout le monde dessus
      const[exx,eyy]=ctr(...m.ex),all=kk>=m.keys.length;
      act.forEach(u=>{P[u].ex=all&&near(u,exx,eyy,30)?1:0});
      if(all&&act.length&&act.every(u=>P[u].ex)){clr=1;brk=25;msg=`Niveau ${lv} réussi !`}
      if(lives<=0){
        un();set(R("stats/gamesPlayed"),increment(1)).catch(()=>{});pub({o:1,lf:0,msg:`Défaite au niveau ${lv} · ${lv-1} réussi${lv>2?"s":""}`});
        setTimeout(async()=>{const cp2=(lobby&&lobby.players)||{},u2={status:"lobby"};ids.filter(u=>cp2[u]).forEach(u=>u2[`players/${u}/ready`]=u===me.uid);try{await update(R(`lobbies/${c}`),u2)}catch{}},6000);
        return}
    }
    pub();pace(100,step);
  };
  newLevel();step();
}

// ---------- Battle Royale (l'hôte simule : 10 images/s, zone qui rétrécit, butin, tirs) ----------
async function startBr(){
  const pace=mkPace(),c=code,players=lobby.players,ids=Object.keys(players);
  if(ids.length<2)return toast("Il faut au moins 2 joueurs pour lancer un battle royale");
  const sd=Math.floor(Math.random()*1e9),map=genMap(sd);
  await remove(R(`games/${c}`));await update(R(`lobbies/${c}`),{status:"playing"});
  const P={},want={},seen={};let B=[],Lt=[],kf=[],nid=1,tk=0,lv=1,sent=-99;
  const free=rad=>{for(let i=0;i<200;i++){const x=40+Math.random()*(BW-80),y=40+Math.random()*(BH-80);if(!solidAt(map,x,y,rad))return[x,y]}return[BW/2,BH/2]};
  ids.forEach(u=>{ // départs éloignés les uns des autres
    let s=null;for(let i=0;i<60&&!s;i++){const q=free(20);if(Object.values(P).every(o=>(o.x-q[0])**2+(o.y-q[1])**2>380*380))s=q}
    s=s||free(20);
    P[u]={n:players[u].name,c:players[u].color,x:s[0],y:s[1],hp:100,sh:0,a:1,w:0,cd:0,ang:0,fire:0,k:0,inv:30};want[u]=[0,0]});
  // butin : 2 objets par maison + objets éparpillés (arme 1-4, soin 5, bouclier 6)
  const roll=()=>{const r=Math.random();return r<.18?1:r<.32?2:r<.42?3:r<.46?4:r<.73?5:6};
  map.H.forEach(([a,b,w,hh])=>{Lt.push([nid++,a+w*.3,b+hh/2,roll()],[nid++,a+w*.7,b+hh/2,roll()])});
  for(let i=0;i<14+ids.length*3;i++){const q=free(10);Lt.push([nid++,q[0],q[1],roll()])}
  // zone : [attente, rétrécissement, rayon final, dégâts par tick]
  const ZP=[[250,250,600,.15],[150,200,380,.3],[120,200,220,.5],[100,150,110,.8],[80,120,0,1.3]];
  let zx=BW/2,zy=BH/2,zr=1000,nx=zx,ny=zy,nr=zr,ph=0,zt=ZP[0][0],shr=false,z0=[zx,zy,zr];
  const target=()=>{nr=ZP[ph][2];const a=Math.random()*6.28,d=Math.random()*Math.max(0,zr-nr)*.8;nx=zx+Math.cos(a)*d;ny=zy+Math.sin(a)*d};target();
  const alive=()=>ids.filter(u=>P[u].a);
  const kill=(v,k,why)=>{const q=P[v];if(!q.a)return;q.a=0;
    if(q.w>0){Lt.push([nid++,q.x,q.y,q.w]);lv++} // l'arme tombe au sol
    if(k&&k!==v&&P[k]){P[k].k++;kf.push([`${P[k].n} ✖ ${q.n}`,tk+50])}else kf.push([`${q.n} ${why||"est éliminé"}`,tk+50])};
  const pub=(x={})=>{
    const o={k:"br",sd,p:Object.fromEntries(ids.map(u=>{const q=P[u];return[u,[Math.round(q.x),Math.round(q.y),Math.round(q.hp),Math.round(q.sh),q.a,q.n,q.c,+q.ang.toFixed(2),q.w,q.k,q.inv>0?1:0]]})),
      b:B.map(b=>[Math.round(b[0]),Math.round(b[1]),Math.round(b[2]),Math.round(b[3]),ids.indexOf(b[6]),tk-b[7]]),
      z:[Math.round(zx),Math.round(zy),Math.round(zr)],nz:[Math.round(nx),Math.round(ny),Math.round(nr)],zs:shr?1:0,zt:Math.max(0,Math.ceil(zt/10)),al:alive().length,kf:kf.map(e=>e[0]),...x};
    if(lv!==sent||tk%20===0){o.l=Lt.map(l=>[l[0],Math.round(l[1]),Math.round(l[2]),l[3]]);sent=lv} // le butin n'est renvoyé que s'il change
    return set(R(`games/${c}/state`),JSON.stringify(o));
  };
  // commandes reçues : "dx,dy,angle,tir,n°"
  const un=onValue(R(`games/${c}/inputs`),s=>Object.entries(s.val()||{}).forEach(([u,v])=>{
    if(!P[u]||seen[u]===v)return;seen[u]=v;const sp=String(v).split(","),a=+sp[0],b=+sp[1],g=+sp[2];
    if(a===a&&b===b)want[u]=[Math.max(-1,Math.min(1,a)),Math.max(-1,Math.min(1,b))];
    if(Number.isFinite(g))P[u].ang=g;P[u].fire=sp[3]==="1"?1:0}));
  for(let n=3;n>0;n--){await pub({cd:n});await new Promise(r=>setTimeout(r,1000))}
  const step=()=>{
    if(code!==c){un();return} // l'hôte a quitté : on arrête tout
    tk++;
    const cp=(lobby&&lobby.players)||{};
    ids.forEach(u=>{if(P[u].a&&!cp[u])kill(u,null,"a quitté la partie")});
    // zone
    if(ph<ZP.length){
      if(!shr){if(--zt<=0){shr=true;zt=ZP[ph][1];z0=[zx,zy,zr]}}
      else{zt--;const f=1-Math.max(0,zt)/ZP[ph][1];zx=z0[0]+(nx-z0[0])*f;zy=z0[1]+(ny-z0[1])*f;zr=z0[2]+(nr-z0[2])*f;
        if(zt<=0){shr=false;ph++;if(ph<ZP.length){zt=ZP[ph][0];target()}}}
    }
    const zd=ZP[Math.min(ph,ZP.length-1)][3];
    // joueurs : déplacement (avec glissement le long des murs), tir, ramassage, tempête
    alive().forEach(u=>{const q=P[u],[a,b]=want[u],n=a&&b?.707:1,s=11;
      let tx=q.x+a*n*s,ty=q.y+b*n*s;
      if(!solidAt(map,tx,q.y,13))q.x=Math.max(13,Math.min(BW-13,tx));
      if(!solidAt(map,q.x,ty,13))q.y=Math.max(13,Math.min(BH-13,ty));
      if(q.inv>0)q.inv--;
      if(q.cd>0)q.cd--;
      if(q.fire&&q.cd<=0){const w=WP[q.w];
        for(let i=0;i<w[7];i++){const an=q.ang+(Math.random()-.5)*2*w[6];B.push([q.x,q.y,Math.cos(an)*w[4],Math.sin(an)*w[4],w[5],w[2],u,tk])}
        q.cd=w[3]}
      for(let i=Lt.length;i--;){const l=Lt[i];if((l[1]-q.x)**2+(l[2]-q.y)**2>26*26)continue;
        if(l[3]<5){if(l[3]>q.w){q.w=l[3];q.cd=3;Lt.splice(i,1);lv++}}
        else if(l[3]===5){if(q.hp<100){q.hp=Math.min(100,q.hp+50);Lt.splice(i,1);lv++}}
        else if(q.sh<100){q.sh=Math.min(100,q.sh+50);Lt.splice(i,1);lv++}}
      if((q.x-zx)**2+(q.y-zy)**2>zr*zr){q.hp-=zd;if(q.hp<=0)kill(u,null,"a été emporté par la tempête")}});
    // balles : avancées par petits pas pour ne pas traverser murs et joueurs
    B=B.filter(b=>{
      const sp=Math.hypot(b[2],b[3]),n=Math.max(1,Math.ceil(sp/10)),dx=b[2]/n,dy=b[3]/n;
      for(let i=0;i<n;i++){
        b[0]+=dx;b[1]+=dy;
        if(b[0]<0||b[0]>BW||b[1]<0||b[1]>BH||solidAt(map,b[0],b[1],1))return false;
        for(const u of ids){const q=P[u];if(!q.a||u===b[6]||q.inv>0)continue;
          if((q.x-b[0])**2+(q.y-b[1])**2<15*15){let d=b[5];const s=Math.min(q.sh,d);q.sh-=s;d-=s;q.hp-=d;if(q.hp<=0)kill(u,b[6]);return false}}
      }
      return --b[4]>0});
    kf=kf.filter(e=>e[1]>tk);
    const al=alive();
    if(al.length<=1){
      un();set(R("stats/gamesPlayed"),increment(1)).catch(()=>{});
      const w=al[0];pub({o:1,msg:w?`🏆 ${P[w].n} gagne ! ☠ ${P[w].k}`:"Match nul"});
      setTimeout(async()=>{const cp2=(lobby&&lobby.players)||{},up={status:"lobby"};
        ids.filter(u=>cp2[u]).forEach(u=>up[`players/${u}/ready`]=u===me.uid);
        if(w&&cp2[w])up[`players/${w}/wins`]=(cp2[w].wins||0)+1;
        try{await update(R(`lobbies/${c}`),up)}catch{}},6000);
      return;
    }
    pub();pace(100,step);
  };
  step();
}

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
