import {initializeApp} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {getAuth,onAuthStateChanged,createUserWithEmailAndPassword,signInWithEmailAndPassword,signInWithPopup,signInWithRedirect,getRedirectResult,GoogleAuthProvider,signOut,sendPasswordResetEmail} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {getDatabase,ref,get,set,update,remove,onValue,onDisconnect,serverTimestamp,increment} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js";

// 1) Colle ici la config de ton projet Firebase (Paramètres du projet > Tes applications > Web)
const cfg={apiKey:"AIzaSyCU2qkeRozdFeIybYQQjy9PssnqxBbYdIo",authDomain:"moda-ac6b2.firebaseapp.com",databaseURL:"https://moda-ac6b2-default-rtdb.europe-west1.firebasedatabase.app",projectId:"moda-ac6b2",storageBucket:"moda-ac6b2.firebasestorage.app",messagingSenderId:"79010938897",appId:"1:79010938897:web:4cf8ffe4ca61e04ada31b0"};
const app=initializeApp(cfg),auth=getAuth(app),db=getDatabase(app);
const VER="8";
const $=i=>document.getElementById(i)||document.createElement("div");
{const m=document.querySelector('meta[name="moda-v"]');$("ver").textContent=m&&m.content===VER?"MoDa v"+VER:"";
 if(!m||m.content!==VER)setTimeout(()=>toast("⚠️ index.html et app.js ne sont pas de la même version : renvoie les DEUX fichiers sur GitHub, puis recharge"),900)}
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
$("tsnake").onclick=mkLobby("snake");$("tsurv").onclick=mkLobby("surv");$("tbr").onclick=mkLobby("br");
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
  $("ltitle").textContent={snake:"🐍 Snake",surv:"🧟 Survie coop",br:"🪂 Battle Royale"}[lobby.game]||"Lobby";
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
function local(){unLobby&&unLobby();unState&&unState();unLobby=unState=null;code=lobby=null;if(me)showHome()}

// ---------- Jeu : affichage (tous les joueurs) ----------
let gk="snake",lastMv="",st=null,pv=null,tAt=0,tDt=130,raf=0,parts=[],mute=false,ac;
try{mute=localStorage.getItem("moda.mute")==="1"}catch{}
const AC=()=>{try{ac=ac||new AudioContext();ac.resume()}catch{}};
addEventListener("pointerdown",AC,{once:true});addEventListener("keydown",AC,{once:true});
const beep=(f,d=.08,t="square",v=.04,f2)=>{if(mute||!ac)return;try{const T=ac.currentTime,o=ac.createOscillator(),g=ac.createGain();o.type=t;o.frequency.setValueAtTime(f,T);if(f2)o.frequency.exponentialRampToValueAtTime(f2,T+d);
  g.gain.setValueAtTime(v,T);g.gain.exponentialRampToValueAtTime(.001,T+d);o.connect(g);g.connect(ac.destination);o.start(T);o.stop(T+d)}catch{}};
const muteUI=()=>$("mute").textContent=mute?"🔇":"🔊";muteUI();
$("mute").onclick=()=>{mute=!mute;try{localStorage.setItem("moda.mute",mute?"1":"0")}catch{}muteUI()};
const burst=(a,b,c,n)=>{for(let i=0;i<n;i++){const r=Math.random()*6.28,v=2+Math.random()*5;parts.push({x:a+.5,y:b+.5,vx:Math.cos(r)*v,vy:Math.sin(r)*v,l:1,c})}};
function enterGame(c){
  show("game");lastDir=null;st=pv=null;parts=[];gk=lobby&&(lobby.game==="surv"||lobby.game==="br")?lobby.game:"snake";held.clear();lastMv="";$("ov").style.fontSize=gk==="snake"?"56px":"34px";mine=-1;vk="";vbox.style.display="none";gameSetup();
  unState=onValue(R(`games/${c}/state`),s=>{if(s.val())onState(JSON.parse(s.val()))});
  if(!raf)raf=requestAnimationFrame(frame);
}
function onState(n){
  if(n.k==="surv")return onSurv(n);
  if(n.k==="br")return onBr(n);
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
let mine=-1,vk="",shk=0;const aim={};
const vbox=document.createElement("div");vbox.style.cssText="position:absolute;left:0;right:0;bottom:14px;display:none;gap:8px;justify-content:center;flex-wrap:wrap;padding:0 8px";
if($("ov").parentElement)$("ov").parentElement.append(vbox);
const vote=i=>{if(cur!=="game"||gk!=="surv"||vbox.style.display!=="flex")return;mine=i;set(R(`games/${code}/inputs/${me.uid}`),`v,${i},${++seqN}`)};
addEventListener("keydown",e=>{if(/^[123]$/.test(e.key))vote(+e.key-1)});
const sb=(x,y,c,n,v=160)=>{for(let i=0;i<n;i++){const r=Math.random()*6.28,q=v*(.3+Math.random()*.7);parts.push({x,y,vx:Math.cos(r)*q,vy:Math.sin(r)*q,l:1,c})}};
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
  $("score").replaceChildren(...Object.values(n.p).sort((x,y)=>y[3]-x[3]).map(q=>{const d=h("div",`${q[5]} : ${q[3]} ☠ ${"♥".repeat(Math.max(0,q[2]))}${q[4]?"":" ✖"}`);d.style.color=q[6];d.style.fontWeight=600;return d}));
  $("ov").textContent=n.o||n.br?n.msg:"";showVote(n);
}
function drawSurv(now){
  const x=$("cv").getContext("2d"),p=Math.min(1,(now-tAt)/tDt),L=(a,b)=>a+(b-a)*p,dt=Math.min(.05,(now-(drawSurv.t||now))/1000);drawSurv.t=now;
  x.save();if(now<shk)x.translate((Math.random()-.5)*8,(Math.random()-.5)*8);
  x.fillStyle="#0e0a22";x.fillRect(-10,-10,820,580);x.fillStyle="#1a1438";for(let i=0;i<800;i+=40)for(let j=0;j<560;j+=40)if((i+j)%80===0)x.fillRect(i,j,40,40);
  const pm=new Map(pv?pv.m.map(m=>[m[0],m]):[]);
  const P=Object.entries(st.p).filter(([,q])=>q[4]).map(([u,q])=>{const o=(pv&&pv.p[u])||q;return{u,q,x:L(o[0],q[0]),y:L(o[1],q[1])}});
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
    x.fillStyle="#fff";x.font="12px sans-serif";x.fillText(q[5],px,py-24);x.fillStyle="#ff4d6d";x.font="11px sans-serif";x.fillText("♥".repeat(Math.max(0,q[2])),px,py+28)});
  parts=parts.filter(q=>(q.l-=dt*1.8)>0);parts.forEach(q=>{q.x+=q.vx*dt;q.y+=q.vy*dt;x.globalAlpha=q.l;x.fillStyle=q.c;x.fillRect(q.x-3,q.y-3,6,6)});x.globalAlpha=1;
  x.restore();
  const g=x.createRadialGradient(400,280,220,400,280,520);g.addColorStop(0,"#0000");g.addColorStop(1,"#0009");x.fillStyle=g;x.fillRect(0,0,800,560);
  x.fillStyle="#fff";x.font="700 18px sans-serif";x.textAlign="left";x.fillText(`Vague ${st.wv}   ☠ ${st.kl}`,12,24);
}
function frame(now){
  if(cur!=="game"){raf=0;return}
  raf=requestAnimationFrame(frame);if(!st)return;if(st.k==="surv")return drawSurv(now);if(st.k==="br")return drawBr(now);
  const cv=$("cv"),x=cv.getContext("2d"),k=cv.width/st.W,p=Math.min(1,(now-tAt)/tDt),mid=me&&me.uid;
  x.fillStyle="#0e0a22";x.fillRect(0,0,cv.width,cv.height);
  x.fillStyle="#1a1438";for(let i=0;i<st.W;i++)for(let j=0;j<st.H;j++)if((i+j)%2)x.fillRect(i*k,j*k,k,k);
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
const held=new Set();let seqN=0;
const mv=()=>{if(gk==="br")return brSend();const m=`${(held.has("R")?1:0)-(held.has("L")?1:0)},${(held.has("D")?1:0)-(held.has("U")?1:0)}`;if(m!==lastMv){lastMv=m;set(R(`games/${code}/inputs/${me.uid}`),m+","+(++seqN))}};
const send=d=>{if(cur!=="game"||gk==="surv"||gk==="br"||d===lastDir)return;lastDir=d;set(R(`games/${code}/inputs/${me.uid}`),d+(++seqN))};
addEventListener("keydown",e=>{if(cur!=="game"||/^(INPUT|TEXTAREA)$/.test(e.target.tagName))return;const d=KEYS[e.key.length>1?e.key:e.key.toLowerCase()];if(d){e.preventDefault();if(gk==="surv"||gk==="br"){held.add(d);mv()}else send(d)}});
addEventListener("keyup",e=>{const d=KEYS[e.key.length>1?e.key:e.key.toLowerCase()];if(d&&(gk==="surv"||gk==="br")&&cur==="game"){held.delete(d);mv()}});
let t0;const cvs=$("cv");
cvs.addEventListener("touchstart",e=>{t0=e.touches[0]},{passive:true});
cvs.addEventListener("touchmove",e=>{e.preventDefault();if(!t0||cur!=="game")return;const t=e.touches[0],dx=t.clientX-t0.clientX,dy=t.clientY-t0.clientY;
  if(Math.max(Math.abs(dx),Math.abs(dy))>20){send(Math.abs(dx)>Math.abs(dy)?(dx>0?"R":"L"):(dy>0?"D":"U"));t0=t}},{passive:false});
document.querySelectorAll("#pad button").forEach(b=>{const d=b.dataset.d,on=e=>{e.preventDefault();if(gk==="surv"||gk==="br"){held.add(d);mv()}else send(d)},off=()=>{if(gk==="surv"||gk==="br"){held.delete(d);mv()}};
  b.addEventListener("pointerdown",on);["pointerup","pointercancel","pointerleave"].forEach(t=>b.addEventListener(t,off))});

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

let mapC=null,lootC=[],mpos=null,brFire=0,ptrDown=0,spDown=0,brK="",brA="",brT=0,meScr={x:400,y:280};
function gameSetup(){
  mapC=null;lootC=[];ptrDown=spDown=brFire=0;brK=brA="";brT=0;mpos=null;
  $("cv").style.cursor=gk==="br"?"crosshair":"";
  $("ghelp").textContent=gk==="br"?"ZQSD / flèches : bouger · souris : viser · clic ou espace : tirer. Sur mobile : croix pour bouger, touche l'écran pour viser et tirer. Marche sur 🔫 💊 🧪 pour les ramasser et reste dans la zone !"
    :gk==="surv"?"Flèches ou ZQSD pour bouger, tu tires automatiquement. Entre deux vagues, vote avec 1 / 2 / 3."
    :"Flèches ou ZQSD / WASD. Sur mobile : glisse le doigt. ⭐ = +3 points, 🛡️ = traverse tout pendant 5 s.";
}
function onBr(n){
  const now=performance.now();if(st)tDt=Math.min(250,Math.max(60,tDt*.6+(now-tAt)*.4));
  pv=st;st=n;tAt=now;
  if(!mapC||mapC.sd!==n.sd)mapC=genMap(n.sd);
  if(n.l)lootC=n.l;
  if(pv&&pv.k==="br"){
    if(n.zs&&!pv.zs){beep(250,.4,"triangle",.06,120);toast("⚠️ La zone rétrécit !")}
    if(brFire&&n.b.length>pv.b.length)beep(320,.04,"square",.02,150);
    Object.entries(n.p).forEach(([u,q])=>{const o=pv.p[u];if(!o)return;const mi=me&&u===me.uid;
      if(o[2]+o[3]-q[2]-q[3]>=3&&q[4]){sb(q[0],q[1],"#ff4d6d",8,150);if(mi){shk=now+160;beep(160,.15,"sawtooth",.05,80);if(navigator.vibrate)navigator.vibrate(40)}}
      if(o[4]&&!q[4]){sb(q[0],q[1],q[6],30,260);beep(180,.4,"sawtooth",.05,50);if(mi&&navigator.vibrate)navigator.vibrate(120)}
      if(mi&&q[4]&&(q[8]>o[8]||q[2]>o[2]||q[3]>o[3]))beep(700,.08,"sine",.05,1000)});
  }
  $("score").replaceChildren(...Object.values(n.p).sort((a,b)=>b[9]-a[9]||b[4]-a[4]).map(q=>{const d=h("div",`${q[5]} : ☠ ${q[9]}${q[4]?"":" ✖"}`);d.style.color=q[6];d.style.fontWeight=600;return d}));
  $("ov").textContent=n.cd?n.cd:n.o?n.msg:"";
}
// Envoi des commandes à l'hôte : "dx,dy,angle,tir,n°" (seulement quand quelque chose change)
function brSend(){
  if(cur!=="game"||gk!=="br"||!code||!me)return;
  const dx=(held.has("R")?1:0)-(held.has("L")?1:0),dy=(held.has("D")?1:0)-(held.has("U")?1:0),
    a=(mpos?Math.atan2(mpos.y-meScr.y,mpos.x-meScr.x):0).toFixed(2),k=`${dx},${dy},${brFire}`,t=performance.now();
  if(k===brK&&(a===brA||t-brT<100))return;
  brK=k;brA=a;brT=t;set(R(`games/${code}/inputs/${me.uid}`),`${dx},${dy},${a},${brFire},${++seqN}`).catch(()=>{});
}
function drawBr(now){
  const x=$("cv").getContext("2d"),p=Math.min(1,(now-tAt)/tDt),lp=(a,b)=>a+(b-a)*p,dt=Math.min(.05,(now-(drawBr.t||now))/1000);drawBr.t=now;
  const m=mapC,Q=st.p,mu=me&&me.uid,old=pv&&pv.k==="br"?pv:st,mq=mu&&Q[mu];
  const pos=u=>{const q=Q[u],o=old.p[u]||q;return[lp(o[0],q[0]),lp(o[1],q[1])]};
  // caméra : sur moi, ou sur le survivant en tête quand je suis éliminé
  const fu=mq&&mq[4]?mu:Object.keys(Q).filter(u=>Q[u][4]).sort((a,b)=>Q[b][9]-Q[a][9])[0],fp=fu?pos(fu):[BW/2,BH/2];
  const ox=400-Math.max(400,Math.min(BW-400,fp[0])),oy=280-Math.max(280,Math.min(BH-280,fp[1]));
  if(mq){const mp=pos(mu);meScr={x:mp[0]+ox,y:mp[1]+oy}}
  brSend();
  const zo=old.z,zx=lp(zo[0],st.z[0]),zy=lp(zo[1],st.z[1]),zr=lp(zo[2],st.z[2]);
  x.save();x.fillStyle="#0b1a1a";x.fillRect(-10,-10,820,580);
  if(now<shk)x.translate((Math.random()-.5)*8,(Math.random()-.5)*8);
  x.translate(ox,oy);
  x.fillStyle="#17332f";x.fillRect(0,0,BW,BH);
  x.strokeStyle="#ffffff0d";x.lineWidth=1;x.beginPath();for(let i=0;i<=BW;i+=100){x.moveTo(i,0);x.lineTo(i,BH)}for(let j=0;j<=BH;j+=100){x.moveTo(0,j);x.lineTo(BW,j)}x.stroke();
  x.strokeStyle="#ffffff30";x.lineWidth=4;x.strokeRect(0,0,BW,BH);
  x.fillStyle="#2a2350";m.H.forEach(([a,b,w,hh])=>x.fillRect(a,b,w,hh));
  x.textAlign="center";x.textBaseline="middle";x.font="22px sans-serif";
  lootC.forEach(([,lx,ly,t])=>{const by=ly+Math.sin(now/300+lx)*2;x.fillStyle=t>4?(t===5?"#3ee66a33":"#4dabff33"):"#ffd23f33";x.beginPath();x.arc(lx,by,17,0,7);x.fill();x.fillText(t<5?WP[t][1]:LI[t],lx,by+1)});
  x.fillStyle="#7a68c8";m.W.forEach(([a,b,w,hh])=>x.fillRect(a,b,w,hh));
  m.T.forEach(([a,b,q])=>{x.fillStyle="#1f7a4a";x.beginPath();x.arc(a,b,q,0,7);x.fill();x.fillStyle="#2fa866";x.beginPath();x.arc(a-2,b-2,q*.62,0,7);x.fill()});
  x.lineCap="round";x.strokeStyle="#ffe66d";x.shadowColor="#ffe66d";x.shadowBlur=8;x.lineWidth=3;
  st.b.forEach(b=>{const bx=b[0]+b[2]*p,by=b[1]+b[3]*p;x.beginPath();x.moveTo(bx-b[2]*.5,by-b[3]*.5);x.lineTo(bx,by);x.stroke()});x.shadowBlur=0;
  x.textBaseline="alphabetic";
  Object.keys(Q).forEach(u=>{const q=Q[u];if(!q[4])return;
    const[px,py]=pos(u),a=u===mu&&mpos?Math.atan2(mpos.y-meScr.y,mpos.x-meScr.x):q[7],w=WP[q[8]]||WP[0];
    x.save();x.globalAlpha=q[10]?.55+.25*Math.sin(now/70):1;
    x.fillStyle="#0006";x.beginPath();x.ellipse(px,py+11,13,5,0,0,7);x.fill();
    x.translate(px,py);x.save();x.rotate(a);x.fillStyle=w[8];x.fillRect(6,-3,q[8]===4?26:16,6);x.restore();
    x.fillStyle=q[6];if(u===mu){x.shadowColor=q[6];x.shadowBlur=14}
    x.beginPath();x.arc(0,0,13,0,7);x.fill();x.shadowBlur=0;
    [-1,1].forEach(sd=>{x.fillStyle="#fff";x.beginPath();x.arc(Math.cos(a)*6-Math.sin(a)*4*sd,Math.sin(a)*6+Math.cos(a)*4*sd,3,0,7);x.fill()});
    x.restore();
    if(u!==mu){x.fillStyle="#0009";x.fillRect(px-16,py-28,32,8);x.fillStyle="#3ee66a";x.fillRect(px-15,py-27,30*q[2]/100,3);x.fillStyle="#4dabff";x.fillRect(px-15,py-23,30*q[3]/100,3);
      x.fillStyle="#fff";x.font="12px sans-serif";x.fillText(q[5],px,py-33)}});
  parts=parts.filter(q=>(q.l-=dt*1.8)>0);parts.forEach(q=>{q.x+=q.vx*dt;q.y+=q.vy*dt;x.globalAlpha=q.l;x.fillStyle=q.c;x.fillRect(q.x-3,q.y-3,6,6)});x.globalAlpha=1;
  // la tempête : tout ce qui est hors du cercle est teinté (et blesse)
  x.beginPath();x.rect(-3000,-3000,BW+6000,BH+6000);x.moveTo(zx+zr,zy);x.arc(zx,zy,Math.max(0,zr),0,7);x.fillStyle="#b3126655";x.fill("evenodd");
  x.strokeStyle="#fff";x.lineWidth=3;x.beginPath();x.arc(zx,zy,Math.max(0,zr),0,7);x.stroke();
  x.setLineDash([12,10]);x.strokeStyle="#ffffff90";x.lineWidth=2;x.beginPath();x.arc(st.nz[0],st.nz[1],st.nz[2],0,7);x.stroke();x.setLineDash([]);
  x.restore();
  // ----- interface -----
  const mp=mq&&mq[4]?pos(mu):null,out=mp&&(mp[0]-zx)**2+(mp[1]-zy)**2>zr*zr;
  if(out){x.fillStyle="#ff000022";x.fillRect(0,0,800,560)}
  x.fillStyle="#fff";x.font="700 16px sans-serif";x.textAlign="left";x.fillText(`👥 ${st.al} en vie   ☠ ${mq?mq[9]:0}`,12,24);
  x.textAlign="center";x.fillText(st.zs?"⚠️ La zone rétrécit !":`🌀 Prochaine zone dans ${st.zt} s`,400,24);
  x.font="600 13px sans-serif";x.textAlign="right";st.kf.slice(-4).forEach((s,i)=>x.fillText(s,788,24+i*18));
  x.textAlign="center";
  if(out){x.fillStyle="#ff9aae";x.font="700 18px sans-serif";x.fillText("Retourne dans la zone !",400,60)}
  if(mq&&mq[4]){
    const bx=290,bw=220,w=WP[mq[8]]||WP[0];
    x.fillStyle="#000a";x.fillRect(bx-8,486,bw+16,66);
    x.fillStyle="#4dabff";x.fillRect(bx,492,bw*mq[3]/100,10);x.fillStyle="#3ee66a";x.fillRect(bx,506,bw*mq[2]/100,14);
    x.strokeStyle="#fff5";x.lineWidth=1;x.strokeRect(bx,492,bw,10);x.strokeRect(bx,506,bw,14);
    x.fillStyle="#fff";x.font="700 12px sans-serif";x.textAlign="left";x.fillText(String(mq[2]),bx+4,517);x.fillText(String(mq[3]),bx+4,501);
    x.font="700 15px sans-serif";x.fillText(`${w[1]} ${w[0]}`,bx,542);
  }else if(mq){x.fillStyle="#fff";x.font="700 18px sans-serif";x.textAlign="center";x.fillText("Éliminé 👀 tu regardes la fin de la partie",400,530)}
  // mini-carte
  const mx0=676,my0=456,ms=.075;
  x.fillStyle="#000a";x.fillRect(mx0,my0,120,90);x.save();x.beginPath();x.rect(mx0,my0,120,90);x.clip();
  x.strokeStyle="#fff";x.lineWidth=1.5;x.beginPath();x.arc(mx0+zx*ms,my0+zy*ms,Math.max(0,zr*ms),0,7);x.stroke();
  x.setLineDash([3,3]);x.strokeStyle="#ffffff90";x.beginPath();x.arc(mx0+st.nz[0]*ms,my0+st.nz[1]*ms,st.nz[2]*ms,0,7);x.stroke();x.setLineDash([]);
  if(mp){x.fillStyle=mq[6];x.beginPath();x.arc(mx0+mp[0]*ms,my0+mp[1]*ms,3.5,0,7);x.fill()}
  x.restore();
}

// Commandes : souris / doigt pour viser et tirer, espace pour tirer
const cpos=e=>{const r=cvs.getBoundingClientRect();return{x:(e.clientX-r.left)*cvs.width/r.width,y:(e.clientY-r.top)*cvs.height/r.height}};
const setFire=()=>{brFire=ptrDown||spDown?1:0;brSend()};
cvs.addEventListener("pointermove",e=>{if(gk==="br"&&cur==="game")mpos=cpos(e)});
cvs.addEventListener("pointerdown",e=>{if(gk!=="br"||cur!=="game")return;e.preventDefault();try{cvs.setPointerCapture(e.pointerId)}catch{}mpos=cpos(e);ptrDown=1;setFire()});
["pointerup","pointercancel"].forEach(t=>cvs.addEventListener(t,()=>{ptrDown=0;if(gk==="br"&&cur==="game")setFire()}));
cvs.addEventListener("contextmenu",e=>{if(gk==="br")e.preventDefault()});
addEventListener("keydown",e=>{if(e.key===" "&&gk==="br"&&cur==="game"&&!/^(INPUT|TEXTAREA|BUTTON)$/.test(e.target.tagName)){e.preventDefault();spDown=1;setFire()}});
addEventListener("keyup",e=>{if(e.key===" "&&gk==="br"&&cur==="game"){spDown=0;setFire()}});

// ---------- Jeu : boucle de l'hôte ----------
$("start").onclick=async()=>{
  if(lobby.game==="surv")return startSurv();
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
  let tk=0;
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
    setTimeout(step,Math.max(60,base-Math.max(...Object.values(snakes).map(s=>s.p))*2));
  };
  step();
};

// ---------- Survie coop (l'hôte simule, tir automatique sur le monstre le plus proche) ----------
async function startSurv(){
  const c=code,players=lobby.players,ids=Object.keys(players),W=800,H=560,SPD=[3.2,5,2],RAD=[12,9,20];
  await remove(R(`games/${c}`));await update(R(`lobbies/${c}`),{status:"playing"});
  const P={},want={},seen={},up={fr:5,dm:1,sp:1,pr:0};let opts=[],votes={},M=[],B=[],nid=1,wv=0,left=0,brk=40,tk=0,kills=0,msg="Préparez-vous !";
  ids.forEach((u,i)=>{P[u]={n:players[u].name,c:players[u].color,x:200+i*60,y:280,hp:5,k:0,inv:0,cd:0,a:1};want[u]=[0,0]});
  const un=onValue(R(`games/${c}/inputs`),s=>Object.entries(s.val()||{}).forEach(([u,v])=>{if(!P[u]||seen[u]===v)return;seen[u]=v;const sp=String(v).split(",");if(sp[0]==="v"){if(opts[+sp[1]])votes[u]=+sp[1];return}const[a,b]=sp.map(Number);if(a===a&&b===b)want[u]=[Math.max(-1,Math.min(1,a)),Math.max(-1,Math.min(1,b))]}));
  const UPG=[["⚡ Cadence +",()=>up.fr=Math.max(2,up.fr-1)],["💥 Dégâts +",()=>up.dm++],["👟 Vitesse +",()=>up.sp+=.12],["🎯 Balles perforantes",()=>up.pr++]];
  const pub=(x={})=>set(R(`games/${c}/state`),JSON.stringify({k:"surv",W,H,wv,msg,kl:kills,br:brk>0?1:0,vt:brk>0&&opts.length?opts.map(o=>o[0]):0,vc:opts.map((_,i)=>Object.values(votes).filter(v=>v===i).length),
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
    pub();setTimeout(step,100);
  };
  step();
}

// ---------- Battle Royale (l'hôte simule : 10 images/s, zone qui rétrécit, butin, tirs) ----------
async function startBr(){
  const c=code,players=lobby.players,ids=Object.keys(players);
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
      b:B.map(b=>[Math.round(b[0]),Math.round(b[1]),Math.round(b[2]),Math.round(b[3])]),
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
        for(let i=0;i<w[7];i++){const an=q.ang+(Math.random()-.5)*2*w[6];B.push([q.x,q.y,Math.cos(an)*w[4],Math.sin(an)*w[4],w[5],w[2],u])}
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
    pub();setTimeout(step,100);
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
