/* MoDa : « Amog Us » 🚀 : trouve les imposteurs avant qu'ils éliminent tout l'équipage !
   - 4 joueurs minimum (bots 🤖 compris, jusqu'à 10). 4-7 joueurs : 1 imposteur · 8-10 joueurs : 2 imposteurs.
   - Équipiers : font leurs 6 tâches parmi 14 postes différents : chaque poste lance un vrai mini-jeu à réussir (câbles à relier, code à taper, etc.) ; les bots, eux, restent sur place 1,5 à 3,6 s · Imposteurs : éliminent en silence (cooldown 12 s).
   - Un corps trouvé (SIGNALER) ou le bouton d'urgence de la cafétéria (1 fois par joueur) lance une réunion : on vote
     pour éjecter quelqu'un (ou on passe). Les morts deviennent des fantômes : ils traversent les murs et peuvent finir leurs tâches.
   - Victoire équipage : toutes les tâches faites OU tous les imposteurs éjectés. Victoire imposteurs : autant d'imposteurs que d'équipiers.
   - Vision réelle : on ne voit pas à travers les murs (les fantômes voient tout). Les bots raisonnent : témoins, suspects près du corps,
     faux alibis des imposteurs. Au résultat d'un vote, on voit qui a voté pour qui.
   - Même fonctionnement que Sumo Arena : l'hôte simule (30 pas/s) et publie games/<code>/state ; chaque joueur écrit
     « ax,ay,compteurUtiliser,compteurTuer,vote » dans games/<code>/inputs/<uid>. Aucun nouveau chemin Firebase. */

const W = 800, H = 560, RAD = 11, BR = 15, SPD = 125, DT = 1 / 30;
const KCD0 = 8, KCD = 12, KR = 52, TT = 1.6, MT = 40, RT = 8, VIS = 290;
const K = 1.75, WW = 1400, WH = 800, sc = v => Math.round(v * K), scp = a => a.map(sc);
// Reconstitution à l'échelle du plan officiel du Skeld (référence GamesRadar / InnerSloth).
const TB = scp([422, 178]);
const ROOMS = [
  { n:"Réacteur",x:2,y:143,w:110,h:152 }, { n:"Moteur haut",x:77,y:58,w:89,h:90 },
  { n:"Moteur bas",x:77,y:289,w:89,h:101 }, { n:"Sécurité",x:143,y:161,w:77,h:104 },
  { n:"Médbay",x:228,y:122,w:117,h:115 }, { n:"Cafétéria",x:322,y:0,w:243,h:212 },
  { n:"Armes",x:569,y:45,w:90,h:102 }, { n:"O2",x:517,y:159,w:72,h:67 },
  { n:"Navigation",x:709,y:163,w:91,h:90 }, { n:"Admin",x:437,y:234,w:139,h:98 },
  { n:"Électricité",x:243,y:254,w:104,h:105 }, { n:"Stockage",x:343,y:290,w:126,h:163 },
  { n:"Comms",x:464,y:363,w:102,h:90 }, { n:"Boucliers",x:565,y:300,w:96,h:106 }
].map(r=>({n:r.n,x:sc(r.x),y:sc(r.y),w:sc(r.w),h:sc(r.h)}));
const CORR = [
 [130,82,192,48],[165,181,64,39],[188,205,62,34],[290,151,52,43],
 [552,75,55,42],[563,137,49,42],[584,169,132,40],[398,198,46,82],
 [402,309,64,38],[309,335,78,43],[164,329,91,47],[447,360,60,40],
 [458,320,122,42],[642,235,48,108],[116,270,45,47],[210,252,54,40],
 [242,237,42,48],[343,191,45,43],[560,202,43,42],[275,317,45,46]
].map(r=>({x:sc(r[0]),y:sc(r[1]),w:sc(r[2]),h:sc(r[3])}));
const FLOOR=[...ROOMS,...CORR];
const DOORS=[
 {id:0,n:"Médbay",x:sc(335),y:sc(165),w:sc(9),h:sc(28)},
 {id:1,n:"Cafétéria / Admin",x:sc(420),y:sc(207),w:sc(32),h:sc(9)},
 {id:2,n:"Armes",x:sc(570),y:sc(90),w:sc(9),h:sc(32)},
 {id:3,n:"Navigation",x:sc(710),y:sc(190),w:sc(9),h:sc(32)},
 {id:4,n:"Électricité",x:sc(335),y:sc(300),w:sc(9),h:sc(32)},
 {id:5,n:"Stockage",x:sc(445),y:sc(360),w:sc(32),h:sc(9)}
];
let CLOSED_DOORS=new Set();
const doorBlocked=(px,py)=>DOORS.some(d=>CLOSED_DOORS.has(d.id)&&px+RAD>d.x&&px-RAD<d.x+d.w&&py+RAD>d.y&&py-RAD<d.y+d.h);
const ST=[
 [112,105,"Aligner les moteurs"],[292,333,"Brancher les câbles"],[55,218,"Refroidir le réacteur"],
 [397,365,"Trier les caisses"],[282,180,"Scanner médical"],[435,42,"Télécharger les plans"],
 [616,95,"Calibrer le détecteur"],[548,190,"Purger le circuit"],[112,345,"Faire le plein"],
 [500,410,"Vider les déchets"],[610,350,"Activer le bouclier"],[495,275,"Envoyer les données"],
 [180,220,"Analyser un échantillon"],[755,205,"Orienter l'antenne"]
].map(t=>[sc(t[0]),sc(t[1]),t[2]]);
const NT = 6;                                                             // tâches par équipier (sur 14 postes)
const TTS = [2.7, 3.6, 3.0, 2.4, 3.3, 1.8, 1.5, 1.5, 2.1, 2.4, 3.0, 2.7, 3.6, 2.1];                    // durée de chaque tâche (même ordre que ST)
let GRID = null;                                                          // grille 1 px : 1 = sol (rend at/ok/los beaucoup plus rapides)
const at = (px, py) => {
  if (!GRID) { GRID = new Uint8Array(WW * WH); FLOOR.forEach(a => { for (let j = a.y; j <= a.y + a.h && j < WH; j++) GRID.fill(1, j * WW + a.x, j * WW + Math.min(WW - 1, a.x + a.w) + 1); }); }
  return px >= 0 && py >= 0 && px < WW && py < WH && GRID[(py | 0) * WW + (px | 0)] === 1;
};
const ok = (px, py) => !doorBlocked(px, py) && at(px - RAD, py - RAD) && at(px + RAD, py - RAD) && at(px - RAD, py + RAD) && at(px + RAD, py + RAD);
const move = (q, dx, dy) => {
  if (!q.a) { q.x = Math.max(RAD, Math.min(WW - RAD, q.x + dx)); q.y = Math.max(RAD, Math.min(WH - RAD, q.y + dy)); return; }   // fantôme : traverse les murs (reste dans la carte)
  if (ok(q.x + dx, q.y + dy)) { q.x += dx; q.y += dy; } else if (ok(q.x + dx, q.y)) q.x += dx; else if (ok(q.x, q.y + dy)) q.y += dy;
};
const los = (ax, ay, bx, by) => { const n = Math.ceil(Math.hypot(bx - ax, by - ay) / 8); for (let i = 1; i < n; i++) { const f = i / n; if (!at(ax + (bx - ax) * f, ay + (by - ay) * f)) return false; } return true; }; // ligne de vue : aucun mur entre les deux
const CS = 10, GW = Math.ceil(WW / CS), GH = Math.ceil(WH / CS);
const clr = (ax, ay, bx, by) => { const n = Math.ceil(Math.hypot(bx - ax, by - ay) / 5); for (let i = 1; i <= n; i++) { const f = i / n; if (!ok(ax + (bx - ax) * f, ay + (by - ay) * f)) return false; } return true; };
const cell = (x, y) => (Math.floor(y / CS) * GW + Math.floor(x / CS));
const cx = i => (i % GW) * CS + CS / 2, cy = i => ((i / GW) | 0) * CS + CS / 2;
const nearestWalkable = (x, y) => {
  const sx = Math.max(0, Math.min(GW - 1, Math.floor(x / CS))), sy = Math.max(0, Math.min(GH - 1, Math.floor(y / CS)));
  let best = -1, bd = Infinity;
  for (let r = 0; r <= 8 && best < 0; r++) for (let yy = Math.max(0, sy-r); yy <= Math.min(GH-1, sy+r); yy++) for (let xx = Math.max(0, sx-r); xx <= Math.min(GW-1, sx+r); xx++) {
    if (Math.max(Math.abs(xx-sx),Math.abs(yy-sy)) !== r) continue;
    const id = yy * GW + xx, px = cx(id), py = cy(id), d = (px-x)**2+(py-y)**2;
    if (d < bd && ok(px,py)) { best=id; bd=d; }
  }
  return best;
};
function route(px, py, tx, ty) {
  if (!at(px,py) || !at(tx,ty)) return [];
  if (clr(px,py,tx,ty)) return [[tx,ty]];
  const si=nearestWalkable(px,py), ti=nearestWalkable(tx,ty);
  if (si<0 || ti<0) return [];
  const total=GW*GH, prev=new Int32Array(total).fill(-2), q=new Int32Array(total); let head=0,tail=0;
  q[tail++]=si; prev[si]=-1;
  const dirs=[[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
  while(head<tail && prev[ti]===-2) {
    const id=q[head++], x=id%GW, y=(id/GW)|0;
    for(const [dx,dy] of dirs) {
      const nx=x+dx,ny=y+dy;
      if(nx<0||ny<0||nx>=GW||ny>=GH) continue;
      const ni=ny*GW+nx;if(prev[ni]!==-2)continue;
      const ax=cx(id),ay=cy(id),bx=cx(ni),by=cy(ni);
      if(!ok(bx,by) || (dx&&dy&&(!ok(cx(y*GW+nx),cy(y*GW+nx))||!ok(cx(ny*GW+x),cy(ny*GW+x)))))continue;
      prev[ni]=id;q[tail++]=ni;
    }
  }
  if(prev[ti]===-2)return [];
  const pts=[];for(let id=ti;id!==-1;id=prev[id])pts.push([cx(id),cy(id)]);pts.reverse();
  const out=[];let ax=px,ay=py,i=0;
  while(i<pts.length){let j=pts.length-1;while(j>i&&!clr(ax,ay,pts[j][0],pts[j][1]))j--;out.push(pts[j]);ax=pts[j][0];ay=pts[j][1];i=j+1;}
  if(clr(ax,ay,tx,ty))out.push([tx,ty]);
  return out;
}
const VENTS = [[92,112],[55,220],[112,345],[182,220],[282,180],[292,333],[435,42],[495,275],[500,410],[755,205],[616,95],[610,350],[548,190],[397,365]].map(scp), VN = [1,2,0,5,3,4,8,10,6,11,7,9,13,12];   // conduits : trois circuits de 3
const LP = scp([292, 333]), RP = [[55, 220], [80, 250]].map(scp), CAMP = scp([182, 220]);                              // panneau électrique (Électricité), 2 panneaux du réacteur, caméras (Sécurité)
const CAMZ = CORR, inCam = (px, py) => CAMZ.some(a => px >= a.x && px <= a.x + a.w && py >= a.y && py <= a.y + a.h);   // les caméras couvrent les couloirs
const pc = m => { let n = 0; while (m) { n += m & 1; m >>= 1; } return n; };
export const _t = { ok, move, route, los, ST, FLOOR, TB };

// ---------------------------------------------------------------- Hôte
export async function startAmog(env) {
  const { R: RF, update, remove, set, onValue, increment, getCode, getLobby, getMe, toast } = env;
  const c = getCode(), lob = getLobby() || {}, players = env.bots ? env.bots(lob) : lob.players || {}, ids = Object.keys(players).slice(0, 10);
  const op = lob.opts || {}, SPD = [110, 140, 175][op.as === 0 || op.as === 2 ? op.as : 1], MT = [20, 40, 60][op.av === 0 || op.av === 2 ? op.av : 1];   // réglages de l'hôte : vitesse, durée du vote
  const isBot = u => u.indexOf("bot_") === 0, rnd = a => a[Math.floor(Math.random() * a.length)];
  if (ids.length < 4) return toast("Il faut au moins 4 joueurs pour lancer Amog Us (ajoute des bots 🤖 dans le lobby)");
  CLOSED_DOORS.clear();
  await remove(RF(`games/${c}`));
  await update(RF(`lobbies/${c}`), { status: "playing" });

  const nImp = op.ai >= 1 ? Math.max(1, Math.min(op.ai | 0, Math.floor((ids.length - 1) / 2))) : ids.length >= 8 ? 2 : 1, imps = new Set(ids.slice().sort(() => Math.random() - .5).slice(0, nImp));
  const P = {}, I = {}, seen = {}, bs = {};
  const gb = u => bs[u] || (bs[u] = { p: [], w: 0, k: 0, sus: {}, fl: 0 });   // mémoire d'un bot : sus = suspicion par joueur (≥ 10 : a vu le crime)
  let sab = null, sbcd = 20, t = 0, ph = "c", mid = 0, mt = 0, rt = 0, mcaller = -1, mrep = 0, near = new Set(), bodies = [], evs = [], kf = [], pubN = 0, evId = 0, over = null, rs = null;
  ids.forEach((u, i) => {
    const a = i / ids.length * 6.283, s = ST.map((_, k) => k).sort(() => Math.random() - .5).slice(0, NT);
    P[u] = { n: players[u].name, c: players[u].color, x: TB[0] + Math.cos(a) * 58, y: TB[1] + Math.sin(a) * 58, a: 1, f: 1, imp: imps.has(u) ? 1 : 0, kcd: KCD0, ch: 0, chS: -1, asg: s.reduce((m, k) => m | 1 << k, 0), dn: 0, em: 0, gone: 0, iv: -1, cm: 0 };
    I[u] = { ax: 0, ay: 0, uc: 0, kc: 0, wu: 0, wk: 0, v: null, vc: 0, sc: 0, wv: 0, ws: 0, sty: 0, td: 0, tc: 0 };
  });
  const ev = (px, py, ty, ...r) => evs.push({ e: [Math.round(px), Math.round(py), ty, ++evId, ...r], u: pubN + 4 });
  const doneTask = u => { const q = P[u]; if (q.chS < 0) return false; q.dn |= 1 << q.chS; if (!q.imp) ev(q.x, q.y, 2, ids.indexOf(u)); q.chS = -1; return true; };   // un joueur humain valide sa tâche en réussissant le mini-jeu

  const un = onValue(RF(`games/${c}/inputs`), s => Object.entries(s.val() || {}).forEach(([u, v]) => {
    if (!P[u] || seen[u] === v) return; seen[u] = v;
    const a = String(v).split(","), ax = +a[0], ay = +a[1], uc = +a[2], kc = +a[3], q = I[u];
    if (ax === ax && ay === ay) { const m = Math.hypot(ax, ay), k = m > 1 ? 1 / m : 1; q.ax = ax * k; q.ay = ay * k; }
    if (uc === uc && uc !== q.uc) { q.uc = uc; q.wu = .3; }               // action demandée un peu trop tôt : gardée 0,3 s
    if (kc === kc && kc !== q.kc) { q.kc = kc; q.wk = .3; }
    if (a[5] !== undefined) {                                             // conduit (V) et sabotage (1 / 2)
      const vc = +a[5], sc = +a[6], sty = +a[7];
      if (vc === vc && vc !== q.vc) { q.vc = vc; q.wv = .3; }
      if (sc === sc && sc !== q.sc) { q.sc = sc; q.sty = sty === 2 ? 2 : sty === 1 ? 1 : 0; q.ws = .3; }
    }
    if (a[8] !== undefined) {                                             // mini-jeu de tâche : « fini » (a[8]) ou « abandon » (a[9])
      const td = +a[8], tc = +a[9];
      if (td === td && td !== q.td) { q.td = td; if (ph === "p" && !isBot(u) && !P[u].gone) doneTask(u); }
      if (tc === tc && tc !== q.tc) { q.tc = tc; if (!isBot(u)) P[u].chS = -1; }
    }
    if (a[4]) { const [m, tg] = a[4].split("_"); if (+m === mid && ph === "m") q.v = +tg; }
  }));

  const chk = () => {
    let ai = 0, ac = 0, tot = 0, dn = 0;
    ids.forEach(u => { const q = P[u]; if (q.a && !q.gone) q.imp ? ai++ : ac++; if (!q.imp && !q.gone) { tot += NT; dn += pc(q.dn); } });
    return !ai ? "c" : ai >= ac ? "i" : tot && dn >= tot ? "c" : null;
  };

  const meet = (u, bd) => {
    near = new Set(bd ? ids.filter(o => P[o].a && !P[o].gone && Math.hypot(P[o].x - bd.x, P[o].y - bd.y) < 190) : []);   // qui traînait près du corps
    sab = null; CLOSED_DOORS.clear(); ids.forEach(o => { P[o].iv = -1; P[o].cm = 0; });          // une réunion annule le sabotage et ferme les conduits / caméras
    ph = "m"; mid++; mt = MT; mcaller = ids.indexOf(u); mrep = bd ? 1 : 0; bodies = [];
    ids.forEach(o => { if (isBot(o) && !P[o].imp) near.forEach(k => { if (k !== o) { const sp = gb(o).sus; sp[k] = (sp[k] || 0) + (k === u ? 1 : 3); } }); });
    ev(P[u].x, P[u].y, 3, mcaller, mrep);
    const al = ids.filter(o => P[o].a && !P[o].gone); let n = 0;
    ids.forEach(o => {
      const q = P[o], i = I[o]; q.chS = -1; i.v = null; i.wu = i.wk = 0; i.ax = i.ay = 0;
      if (q.a) { const a = n++ / al.length * 6.283; q.x = TB[0] + Math.cos(a) * 58; q.y = TB[1] + Math.sin(a) * 58; }
      if (isBot(o)) { const b = gb(o); b.vt = 4 + Math.random() * (MT - 16); b.p = []; }
    });
  };
  const botVote = u => {
    const q = P[u], sp = gb(u).sus, al = ids.filter(o => o !== u && P[o].a && !P[o].gone);
    if (q.imp) {                                                          // imposteur : accuse un équipier (de préférence près du corps)
      const cr = al.filter(o => !P[o].imp), nb = cr.filter(o => near.has(o)), pool = nb.length && Math.random() < .6 ? nb : cr;
      return pool.length && Math.random() < .6 ? ids.indexOf(rnd(pool)) : 99;
    }
    let best = null, bv = 0; al.forEach(o => { const v = sp[o] || 0; if (v > bv) { bv = v; best = o; } });
    if (best && bv >= 10) return Math.random() < .9 ? ids.indexOf(best) : 99;   // il a vu le meurtre
    if (best && bv >= 2 && Math.random() < .55) return ids.indexOf(best);        // il était près du corps
    return al.length && Math.random() < .08 ? ids.indexOf(rnd(al)) : 99;
  };
  const endMeet = () => {
    const n = ids.length, cnt = Array(n + 1).fill(0);
    const vt = ids.map(u => { const q = P[u], v = I[u].v; return !q.a || q.gone || v == null ? -1 : v >= 0 && v < n && P[ids[v]].a ? v : n; });   // qui a voté pour qui (n = passer)
    ids.forEach(u => { const q = P[u], v = I[u].v; if (!q.a || q.gone || v == null) return; if (v >= 0 && v < n && P[ids[v]].a) cnt[v]++; else cnt[n]++; });
    let top = -1, mx = 0, tie = false;
    for (let i = 0; i < n; i++) { if (cnt[i] > mx) { mx = cnt[i]; top = i; tie = false; } else if (cnt[i] === mx && mx > 0) tie = true; }
    const ej = top >= 0 && !tie && mx > cnt[n] ? top : -1;
    let ei = 0; if (ej >= 0) { const q = P[ids[ej]]; q.a = 0; q.chS = -1; ei = q.imp; }
    rs = { ej, ei, vc: cnt, vt, ir: ids.filter(u => P[u].a && P[u].imp && !P[u].gone).length };
    ids.forEach(o => { const sp = bs[o] && bs[o].sus; if (sp) for (const k in sp) if (sp[k] < 10) delete sp[k]; });   // les soupçons s'effacent, pas les témoignages
    ph = "r"; rt = RT;
  };

  const kill = u => {
    const q = P[u]; let v = null, bd = KR;
    ids.forEach(o => { const z = P[o]; if (z.a && !z.imp && !z.gone) { const d = Math.hypot(z.x - q.x, z.y - q.y); if (d < bd) { bd = d; v = o; } } });
    if (!v) return false;
    const z = P[v]; z.a = 0; z.chS = -1; bodies.push({ x: z.x, y: z.y, i: ids.indexOf(v), k: u });
    ids.forEach(o => { const w = P[o]; if (o !== v && o !== u && isBot(o) && w.a && !w.imp && !w.gone && Math.hypot(w.x - z.x, w.y - z.y) < 200 && los(w.x, w.y, z.x, z.y)) { const sp = gb(o).sus; sp[u] = (sp[u] || 0) + 10; } });   // un bot qui voit le meurtre n'oublie pas
    q.x = z.x; q.y = z.y; q.kcd = KCD;
    if (isBot(u)) { const b = gb(u), f = ST.slice().sort((p1, p2) => Math.hypot(p2[0] - z.x, p2[1] - z.y) - Math.hypot(p1[0] - z.x, p1[1] - z.y))[0]; b.p = route(z.x, z.y, f[0], f[1]); b.w = 0; b.idle = 0; b.fl = 4; }   // il s'enfuit loin du corps
    ev(z.x, z.y, 1, ids.indexOf(v)); return true;
  };
  const use = u => {
    const q = P[u]; if (q.iv >= 0) return false;
    if (q.a) {
      const bd = bodies.find(b => Math.hypot(b.x - q.x, b.y - q.y) < 72); if (bd) { meet(u, bd); return true; }
      if (q.em < 1 && Math.hypot(q.x - TB[0], q.y - TB[1]) < 50) { q.em++; meet(u, null); return true; }
      if (!q.imp && sab) {                                                // réparer un sabotage
        if (sab.t === "d") { const d = DOORS.find(z => z.id === sab.id); if (d && Math.hypot(q.x - (d.x + d.w / 2), q.y - (d.y + d.h / 2)) < 62) { sab = null; CLOSED_DOORS.clear(); ev(d.x + d.w / 2, d.y + d.h / 2, 2, ids.indexOf(u)); return true; } }
        if (sab.t === "l" && Math.hypot(q.x - LP[0], q.y - LP[1]) < 44) { sab = null; ev(LP[0], LP[1], 2, ids.indexOf(u)); return true; }
        if (sab.t === "r") for (let k = 0; k < 2; k++) if (!(sab.f >> k & 1) && Math.hypot(q.x - RP[k][0], q.y - RP[k][1]) < 44) { sab.f |= 1 << k; ev(RP[k][0], RP[k][1], 2, ids.indexOf(u)); if (sab.f === 3) sab = null; return true; }
      }
      if (Math.hypot(q.x - CAMP[0], q.y - CAMP[1]) < 44) { q.cm = q.cm ? 0 : 1; q.chS = -1; return true; }   // caméras : on les regarde tant qu'on ne bouge pas
    }
    if (q.chS < 0) for (let s = 0; s < ST.length; s++) if ((q.asg >> s & 1) && !(q.dn >> s & 1) && Math.hypot(q.x - ST[s][0], q.y - ST[s][1]) < 42) { q.chS = s; q.ch = 0; return true; }
    return false;
  };

  const witness = (u, q) => ids.forEach(o => { const w = P[o]; if (o !== u && isBot(o) && w.a && !w.imp && !w.gone && Math.hypot(w.x - q.x, w.y - q.y) < 220 && los(w.x, w.y, q.x, q.y)) { const sp = gb(o).sus; sp[u] = (sp[u] || 0) + 10; } });   // un bot qui voit quelqu'un entrer dans un conduit s'en souvient
  const vent = u => {                                                     // imposteur : entre dans un conduit proche, ou saute au conduit suivant
    const q = P[u]; if (!q.imp || !q.a || q.gone) return false;
    if (q.iv >= 0) { q.iv = VN[q.iv]; q.x = VENTS[q.iv][0]; q.y = VENTS[q.iv][1]; return true; }
    for (let k = 0; k < VENTS.length; k++) if (Math.hypot(q.x - VENTS[k][0], q.y - VENTS[k][1]) < 36) { q.iv = k; q.chS = -1; q.cm = 0; ev(q.x, q.y, 4, ids.indexOf(u)); witness(u, q); return true; }
    return false;
  };
  const sabotage = (u, ty) => {                                           // 0 = lumières, 1 = réacteur, 2 = portes
    const q = P[u]; if (!q.imp || !q.a || q.gone || sab || sbcd > 0 || ph !== "p") return false;
    if (ty === 2) {
      const d = DOORS.slice().sort((a, b) => Math.hypot(a.x + a.w / 2 - q.x, a.y + a.h / 2 - q.y) - Math.hypot(b.x + b.w / 2 - q.x, b.y + b.h / 2 - q.y))[0];
      sab = { t: "d", r: 9, id: d.id }; CLOSED_DOORS = new Set([d.id]);
    } else sab = ty === 1 ? { t: "r", r: 35, f: 0 } : { t: "l", r: 25, f: 0 };
    sbcd = 30; ev(0, 0, 5, ty); return true;
  };

  // bots : les équipiers font leurs tâches et signalent les corps ; les imposteurs chassent un équipier isolé
  const follow = (q, i, b) => {
    while (b.p.length && Math.hypot(b.p[0][0] - q.x, b.p[0][1] - q.y) < 9) b.p.shift();
    if (b.p.length) { const dx = b.p[0][0] - q.x, dy = b.p[0][1] - q.y, d = Math.hypot(dx, dy) || 1; i.ax = dx / d; i.ay = dy / d; }
  };
  const bot = u => {
    const q = P[u], i = I[u], b = gb(u);
    i.ax = i.ay = 0;
    if (q.gone || (!q.a && q.imp) || q.chS >= 0) return;
    if (q.imp && q.iv >= 0) { b.vw = (b.vw || 0) - DT; if (b.vw <= 0) { if (b.vh > 0) { b.vh--; i.wv = .3; b.vw = .7; } else i.ax = 1; } return; }   // dans un conduit : saute puis ressort
    if (b.fl > 0) { b.fl -= DT; if (b.p.length) { follow(q, i, b); return; } }
    if (b.w > 0) { b.w -= DT; return; }
    const go = (px, py) => { b.p = q.a ? route(q.x, q.y, px, py) : [[px, py]]; };   // un bot fantôme file tout droit à travers les murs
    if (q.a && !q.imp) {                                                  // corps en vue : on le signale (7 fois sur 10)
      let bd = null, bdd = 150; bodies.forEach(o => { const d = Math.hypot(o.x - q.x, o.y - q.y); if (d < bdd && los(q.x, q.y, o.x, o.y)) { bdd = d; bd = o; } });
      if (bd) { if (!b.rep) b.rep = Math.random() < .7 ? 1 : -1; if (b.rep > 0) { if (bdd < 60) { i.wu = .3; return; } if (!b.p.length || b.k++ % 20 === 0) go(bd.x, bd.y); follow(q, i, b); return; } } else b.rep = 0;
    }
    if (q.a && !q.imp && sab) {                                           // sabotage : les équipiers (bots) courent réparer
      const k0 = ids.indexOf(u);
      if (sab.t === "r") { let k = k0 % 2; if (sab.f >> k & 1) k ^= 1; if (!(sab.f >> k & 1)) { const p = RP[k]; if (Math.hypot(q.x - p[0], q.y - p[1]) < 28) { i.wu = .3; return; } if (!b.p.length || b.k++ % 20 === 0) go(p[0], p[1]); follow(q, i, b); return; } }
      else if (k0 % 3 === 0) { if (Math.hypot(q.x - LP[0], q.y - LP[1]) < 28) { i.wu = .3; return; } if (!b.p.length || b.k++ % 20 === 0) go(LP[0], LP[1]); follow(q, i, b); return; }
    }
    if (q.imp && q.a && !sab && sbcd <= 0 && Math.random() < .004) { i.ws = .3; i.sty = Math.random() < .22 ? 2 : Math.random() < .45 ? 1 : 0; }   // l'imposteur (bot) sabote de temps en temps
    if (q.imp && q.kcd <= 0) {                                            // chasse : seulement ceux qu'il voit vraiment
      let v = null, vd = 300; ids.forEach(o => { const z = P[o]; if (z.a && !z.imp && !z.gone) { const d = Math.hypot(z.x - q.x, z.y - q.y); if (d < vd && los(q.x, q.y, z.x, z.y)) { vd = d; v = o; } } });
      if (v) {
        const z = P[v], wit = ids.some(o => o !== v && P[o].a && !P[o].imp && !P[o].gone && Math.hypot(P[o].x - z.x, P[o].y - z.y) < 150 && los(P[o].x, P[o].y, z.x, z.y)) || bodies.some(bd => Math.hypot(bd.x - z.x, bd.y - z.y) < 120);
        if (vd < 44 && (!wit || Math.random() < .02)) { i.wk = .3; b.w = .6; return; }
        if (!b.p.length || b.k++ % 10 === 0) go(z.x, z.y); follow(q, i, b); return;
      }
    }
    {                                                                     // tâches (les imposteurs font semblant, avec la barre de progression)
      let s = -1; for (let k = 0; k < ST.length; k++) if ((q.asg >> k & 1) && !(q.dn >> k & 1)) { s = k; break; }
      if (s >= 0 && !(q.imp && bodies.some(bd => Math.hypot(bd.x - q.x, bd.y - q.y) < 90))) { if (Math.hypot(q.x - ST[s][0], q.y - ST[s][1]) < 28) { i.wu = .3; return; } if (!b.p.length || b.k++ % 30 === 0) go(ST[s][0], ST[s][1]); follow(q, i, b); return; }
    }
    if (!b.p.length) {
      if (b.idle) {
        b.idle = 0;
        if (q.imp && q.a && VENTS.some(v => Math.hypot(v[0] - q.x, v[1] - q.y) < 32) && !ids.some(o => o !== u && P[o].a && !P[o].imp && !P[o].gone && Math.hypot(P[o].x - q.x, P[o].y - q.y) < 230 && los(P[o].x, P[o].y, q.x, q.y))) { i.wv = .3; b.vh = 1 + Math.floor(Math.random() * 2); b.vw = .7; return; }   // personne ne regarde : il se glisse dans le conduit
        b.w = 1 + Math.random() * 3; return;
      }
      const s = q.imp && Math.random() < .3 ? rnd(VENTS) : rnd(ST); go(s[0], s[1]); b.idle = 1;
    }
    follow(q, i, b);
  };

  const step = () => {
    if (ph === "p") {
      t += DT;
      if (sbcd > 0) sbcd = Math.max(0, sbcd - DT);
      if (sab && (sab.r -= DT) <= 0) { if (sab.t === "r") over = "i"; sab = null; CLOSED_DOORS.clear(); }   // sabotage expiré : les portes se rouvrent
      ids.forEach(u => { if (isBot(u)) bot(u); });
      ids.forEach(u => {
        if (ph !== "p") return;
        const q = P[u], i = I[u]; if (q.gone) return;
        if (q.kcd > 0) q.kcd = Math.max(0, q.kcd - DT);
        if (i.wu > 0) { i.wu -= DT; if (use(u)) i.wu = 0; }
        if (ph !== "p") return;
        if (i.wk > 0) { i.wk -= DT; if (q.imp && q.a && q.kcd <= 0 && q.iv < 0 && kill(u)) i.wk = 0; }
        if (i.wv > 0) { i.wv -= DT; if (vent(u)) i.wv = 0; }
        if (i.ws > 0) { i.ws -= DT; if (sabotage(u, i.sty)) i.ws = 0; }
        const mg = Math.hypot(i.ax, i.ay);
        if (q.cm && (mg > .3 || Math.hypot(q.x - CAMP[0], q.y - CAMP[1]) > 60)) q.cm = 0;
        if (q.iv >= 0) { if (mg > .5) { q.iv = -1; ev(q.x, q.y, 4, ids.indexOf(u)); witness(u, q); } else return; }   // bouger fait sortir du conduit
        if (q.chS >= 0) {                                                 // tâche en cours : on reste sur place
          const s = ST[q.chS];
          if ((mg > .5 && q.ch > .35) || Math.hypot(q.x - s[0], q.y - s[1]) > 48) q.chS = -1;
          else if (!isBot(u)) q.ch += DT;                                 // humain : la tâche n'avance pas toute seule, c'est le mini-jeu qui la valide
          else if ((q.ch += DT) >= (TTS[q.chS] || TT)) { q.dn |= 1 << q.chS; q.chS = -1; if (!q.imp) ev(q.x, q.y, 2, ids.indexOf(u)); }
        }
        if (q.chS < 0 && mg > .02) { move(q, i.ax * SPD * DT, i.ay * SPD * DT); if (Math.abs(i.ax) > .1) q.f = i.ax > 0 ? 1 : -1; }
      });
      over = over || chk();
    } else if (ph === "m") {
      mt -= DT;
      ids.forEach(u => { const b = bs[u]; if (isBot(u) && P[u].a && b && b.vt != null && MT - mt >= b.vt) { I[u].v = botVote(u); b.vt = null; } });
      const alv = ids.filter(u => P[u].a && !P[u].gone);
      if (mt <= 0 || (MT - mt >= 5 && alv.every(u => I[u].v != null))) endMeet();
    } else if (ph === "r") {
      if ((rt -= DT) <= 0) { ph = "p"; ids.forEach(u => { P[u].kcd = Math.max(P[u].kcd, KCD); I[u].wu = I[u].wk = 0; }); over = chk(); }
    }
  };

  const pub = (x = {}) => {
    pubN++; evs = evs.filter(o => o.u >= pubN); kf = kf.filter(e => e[1] > pubN);
    let tot = 0, dn = 0; ids.forEach(u => { const q = P[u]; if (!q.imp && !q.gone) { tot += NT; dn += pc(q.dn); } });
    const o = {
      k: "amog", t: +t.toFixed(1), ph,
      p: ids.map(u => { const q = P[u]; return [Math.round(q.x), Math.round(q.y), q.a, q.f, Math.ceil(q.kcd), (q.chS >= 0 ? Math.max(1, Math.min(isBot(u) ? 100 : 90, Math.round(q.ch / (TTS[q.chS] || TT) * 100))) : 0), q.iv >= 0 ? 1 : 0]; }),
      bd: bodies.map(b => [Math.round(b.x), Math.round(b.y), b.i]), ts: ids.map(u => [P[u].asg, P[u].dn]), tp: [dn, tot],
      ro: ids.map(u => P[u].imp ? 1 : 0).join(""), ev: evs.map(o2 => o2.e), kf: kf.map(e => e[0]), cm: ids.map((u, i) => P[u].cm ? i : -1).filter(i => i >= 0), sb: sab ? [sab.t === "r" ? 1 : sab.t === "d" ? 2 : 0, Math.ceil(sab.r), sab.t === "d" ? sab.id : sab.f] : 0, dr: sab && sab.t === "d" ? [sab.id, Math.ceil(sab.r)] : 0, sc: Math.ceil(sbcd), ...x
    };
    if (ph === "m") o.mt = { r: Math.ceil(mt), id: mid, c: mcaller, b: mrep, v: ids.map(u => I[u].v != null ? 1 : 0) };
    if (ph === "r") o.rs = rs;
    if (x.cd || x.o || pubN % 10 === 1) o.pl = ids.map(u => [u, P[u].n, P[u].c]);
    return set(RF(`games/${c}/state`), JSON.stringify(o));
  };

  const finish = w => {
    un(); if (env.played) env.played("amog"); else set(RF("stats/gamesPlayed"), increment(1)).catch(() => { });
    ph = "o";
    const names = ids.filter(u => P[u].imp).map(u => P[u].n).join(", ");
    pub({ o: 1, w, msg: (w === "c" ? "🚀 L'équipage gagne !" : "🔪 Les imposteurs gagnent !") + ` Imposteur${imps.size > 1 ? "s" : ""} : ${names}` });
    setTimeout(async () => {
      if (getCode() !== c) return;
      const cp = (getLobby() || {}).players || {}, up = { status: "lobby" };
      ids.filter(u => cp[u]).forEach(u => { up[`players/${u}/ready`] = u === getMe().uid; if (w === "c" ? !P[u].imp : P[u].imp) up[`players/${u}/wins`] = (cp[u].wins || 0) + 1; });
      try { await update(RF(`lobbies/${c}`), up); } catch { }
    }, 8000);
  };

  for (let n = 3; n > 0; n--) { await pub({ cd: n }); await new Promise(r => setTimeout(r, 1000)); if (getCode() !== c) { un(); return; } }
  ph = "p"; ids.forEach(u => { I[u].wu = I[u].wk = 0; });
  let last = performance.now(), acc = 0;
  const loop = () => {
    if (getCode() !== c) { un(); return; }
    const now = performance.now(); acc = Math.min(.25, acc + (now - last) / 1000); last = now;
    const cp = (getLobby() || {}).players || {};
    ids.forEach(u => { if (!P[u].gone && !isBot(u) && !cp[u]) { P[u].gone = 1; P[u].a = 0; P[u].chS = -1; kf.push([`${P[u].n} a quitté la partie`, pubN + 40]); } });
    for (let n = 0; acc >= DT && n < 6 && !over; n++) { step(); acc -= DT; }
    if (over) return finish(over);
    pub(); setTimeout(loop, 55);
  };
  loop();
}

// ---------------------------------------------------------------- Client (tous les joueurs, hôte compris)
const KEYS = { ArrowUp: "U", w: "U", z: "U", ArrowDown: "D", s: "D", ArrowLeft: "L", a: "L", q: "L", ArrowRight: "R", d: "R" };
const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) || 0);
const mixC = {};
const roomAt = (px, py) => { const r = ROOMS.find(a => px >= a.x && px <= a.x + a.w && py >= a.y && py <= a.y + a.h); return r ? r.n : "Couloir"; };
const mix = (h, k) => { const key = h + k; if (mixC[key]) return mixC[key]; const m = hex(h).map(v => Math.round(k > 0 ? v * (1 - k) : v + (255 - v) * -k)); return mixC[key] = `rgb(${m[0]},${m[1]},${m[2]})`; };
const rr = (g, px, py, w, h, r) => { g.beginPath(); g.moveTo(px + r, py); g.arcTo(px + w, py, px + w, py + h, r); g.arcTo(px + w, py + h, px, py + h, r); g.arcTo(px, py + h, px, py, r); g.arcTo(px, py, px + w, py, r); g.closePath(); };
const USEB = { x: 730, y: 488, r: 48 }, KILLB = { x: 622, y: 500, r: 38 }, VENTB = { x: 622, y: 436, r: 26 }, S1B = { x: 548, y: 508, r: 26 }, S2B = { x: 548, y: 446, r: 26 }, S3B = { x: 476, y: 508, r: 26 };
let mpL = [400, 285], ghL = false;   // ma position et mon état au dernier dessin (pour les effets visibles seulement de près)

export function createAmogClient(env) {
  const { R: RF, set, onValue, $, beep, getMe, getCode } = env;
  const cv = $("cv"), x = cv.getContext("2d"), ov = $("ov");
  let active = false, raf = 0, snaps = [], pl = null, lastEv = 0, parts = [], useSeq = 0, killSeq = 0, vote = "", sentStr = "", sentAt = 0;
  let mg = null, mgDis = false, doneSeq = 0, cancelSeq = 0;
  let stick = null, tPrev = 0, myIdx = -1, ovT = "", bg = null, mid = 0, rects = [], ls = null;
  const keys = new Set();
  let bigMap = false, flash = null, floats = [], lastPh = "", mStart = 0, rStart = 0, mMax = 0, lastTick = -1; const dustT = {};
  let ventSeq = 0, sabSeq = 0, sabTy = 0, camCX = 0, camCY = 0, camOn = false, zm = 1, tNow = 0, camM = null, visG = null, mmBase = null, ghostTint = null; const gradC = new Map(), vigC = new Map();

  const sendInput = (now, force) => {
    let ix = 0, iy = 0;
    if (stick) { const m = Math.hypot(stick.dx, stick.dy); if (m > .18) { const k = Math.min(1, (m - .18) / .7) / m; ix = stick.dx * k; iy = stick.dy * k; } }
    else { ix = (keys.has("R") ? 1 : 0) - (keys.has("L") ? 1 : 0); iy = (keys.has("D") ? 1 : 0) - (keys.has("U") ? 1 : 0); if (ix && iy) { ix *= .7071; iy *= .7071; } }
    if (mg) ix = iy = 0;                                                  // pendant un mini-jeu on ne bouge pas
    const str = `${ix.toFixed(2)},${iy.toFixed(2)},${useSeq},${killSeq},${vote},${ventSeq},${sabSeq},${sabTy},${doneSeq},${cancelSeq}`;
    if (str === sentStr || (!force && now - sentAt < 55)) return;
    sentStr = str; sentAt = now;
    set(RF(`games/${getCode()}/inputs/${getMe().uid}`), str).catch(() => { });
  };
  const isImp = () => !!ls && myIdx >= 0 && ls.ro[myIdx] === "1";
  const doUse = () => { if (!active || !ls || ls.ph !== "p") return; useSeq++; sendInput(performance.now(), true); };
  const doKill = () => { if (!active || !ls || ls.ph !== "p" || !isImp()) return; killSeq++; sendInput(performance.now(), true); };
  const doVent = () => { if (!active || !ls || ls.ph !== "p" || !isImp()) return; ventSeq++; sendInput(performance.now(), true); };
  const doSab = t => { if (!active || !ls || ls.ph !== "p" || !isImp() || ls.sb || ls.sc > 0) return; sabSeq++; sabTy = t; sendInput(performance.now(), true); };
  const hit = (p, b) => Math.hypot(p.x - b.x, p.y - b.y) < b.r + 8;

  addEventListener("keydown", e => {
    if (!active || /^(INPUT|TEXTAREA)$/.test(e.target.tagName)) return;
    if (mg) { if (e.key === "Escape") { e.preventDefault(); mgCancel(); } else if (mg.g.key && !mg.fin) { mg.g.key(e.key); e.preventDefault(); } return; }
    if (e.key === " " || e.key === "e" || e.key === "E") { e.preventDefault(); if (!e.repeat) doUse(); return; }
    if (e.key === "k" || e.key === "K" || e.key === "Shift") { e.preventDefault(); if (!e.repeat) doKill(); return; }
    if (e.key === "m" || e.key === "M") { e.preventDefault(); if (!e.repeat && ls && ls.ph === "p") bigMap = !bigMap; return; }
    if (e.key === "v" || e.key === "V") { e.preventDefault(); if (!e.repeat) doVent(); return; }
    if (e.key === "1" || e.key === "2" || e.key === "3") { if (!e.repeat) doSab(+e.key - 1); return; }
    const k = KEYS[e.key.length > 1 ? e.key : e.key.toLowerCase()]; if (k) { e.preventDefault(); keys.add(k); }
  });
  addEventListener("keyup", e => { const k = KEYS[e.key.length > 1 ? e.key : e.key.toLowerCase()]; if (k) keys.delete(k); });
  addEventListener("blur", () => { keys.clear(); stick = null; });
  const rel = e => { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) * cv.width / r.width, y: (e.clientY - r.top) * cv.height / r.height }; };
  cv.addEventListener("pointerdown", e => {
    if (!active) return; e.preventDefault();
    const p = rel(e);
    if (ls && ls.ph === "m") {                                            // réunion : clic sur un joueur ou « Passer »
      const r = rects.find(r2 => p.x >= r2.x && p.x <= r2.x + r2.w && p.y >= r2.y && p.y <= r2.y + r2.h);
      if (r) { vote = `${mid}_${r.t}`; sendInput(performance.now(), true); beep(520, .06, "square", .04); }
      return;
    }
    if (mg) {                                                             // mini-jeu en cours : tous les appuis lui appartiennent
      const q = { x: p.x - MGX, y: p.y - MGY };
      if (q.x > MGW - 44 && q.x < MGW && q.y > 0 && q.y < 44) return mgCancel();
      if (!mg.fin && q.x >= 0 && q.x <= MGW && q.y >= 44 && q.y <= MGH - 46) { mg.drag = e.pointerId; try { cv.setPointerCapture(e.pointerId); } catch { } if (mg.g.down) mg.g.down(q); }
      return;
    }
    if (bigMap) { bigMap = false; return; }
    if (ls && ls.ph === "p" && p.x >= 7 && p.x <= 207 && p.y >= H - 150 && p.y <= H - 7) { bigMap = true; return; }   // un appui sur la mini-carte l'agrandit
    if (e.button === 2) return doUse();
    if (hit(p, USEB)) return doUse();
    if (isImp() && hit(p, KILLB)) return doKill();
    if (isImp() && hit(p, VENTB)) return doVent();
    if (isImp() && hit(p, S1B)) return doSab(0);
    if (isImp() && hit(p, S2B)) return doSab(1);
    if (isImp() && hit(p, S3B)) return doSab(2);
    if (stick) return;
    try { cv.setPointerCapture(e.pointerId); } catch { }
    stick = { id: e.pointerId, ox: p.x, oy: p.y, dx: 0, dy: 0 };
  });
  cv.addEventListener("pointermove", e => {
    if (mg && mg.drag === e.pointerId) { if (mg.g.move) mg.g.move({ x: rel(e).x - MGX, y: rel(e).y - MGY }); return; }
    if (!stick || e.pointerId !== stick.id) return;
    const p = rel(e); let dx = p.x - stick.ox, dy = p.y - stick.oy; const d = Math.hypot(dx, dy), m = 55;
    if (d > m) { stick.ox += dx / d * (d - m); stick.oy += dy / d * (d - m); dx = dx / d * m; dy = dy / d * m; }
    stick.dx = dx / m; stick.dy = dy / m;
  });
  const end = e => { if (mg && mg.drag === e.pointerId) { mg.drag = null; if (mg.g.up) mg.g.up({ x: rel(e).x - MGX, y: rel(e).y - MGY }); return; } if (stick && e.pointerId === stick.id) stick = null; };
  cv.addEventListener("pointerup", end); cv.addEventListener("pointercancel", end);
  cv.addEventListener("contextmenu", e => { if (active) e.preventDefault(); });
  document.addEventListener("visibilitychange", () => { if (document.hidden) { keys.clear(); stick = null; } });

  const spark = (px, py, n, col, v) => { for (let i = 0; i < n && parts.length < 160; i++) { const a = Math.random() * 6.283, s = v * (.3 + Math.random() * .7); parts.push({ x: px, y: py, vx: Math.cos(a) * s, vy: Math.sin(a) * s, l: 1, c: col, s: 2 + Math.random() * 3 }); } };
  const vib = ms => { if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(ms); };
  const onEv = e => {
    const [ex, ey, ty, id] = e; if (id <= lastEv) return; lastEv = id;
    if (ty === 1) { spark(ex, ey, 14, "#ff3b5c", 160); beep(90, .3, "sawtooth", .06, 40); if (e[4] === myIdx) { vib(200); flash = { t: tNow, c: "255,30,60", d: 1100, a: .55, m: "💀 Tu as été éliminé" }; } else if (Math.hypot(ex - mpL[0], ey - mpL[1]) < 260) flash = { t: tNow, c: "255,30,60", d: 380, a: .22 }; }
    else if (ty === 2) { spark(ex, ey, 6, "#3ee6c4", 90); if (e[4] === myIdx) { beep(660, .12, "sine", .05, 990); floats.push({ x: ex, y: ey - 30, t: "✔ Fait !", l: 1 }); } }
    else if (ty === 3) { beep(300, .6, "sawtooth", .06, 700); vib(150); }
    else if (ty === 4) { if (ghL || (Math.hypot(ex - mpL[0], ey - mpL[1]) < VIS && los(mpL[0], mpL[1], ex, ey))) { spark(ex, ey, 10, "#8a85b8", 70); beep(140, .18, "triangle", .05, 70); } }   // quelqu'un entre ou sort d'un conduit
    else if (ty === 5) { beep(220, .7, "square", .07, 120); vib(120); if (!flash) flash = { t: tNow, c: "255,170,30", d: 700, a: .3 }; }                                    // sabotage !
  };

  function sample(rt) {
    const n = snaps.length; if (!n) return null;
    let a = snaps[0], b = a, f = 0;
    if (rt >= snaps[n - 1].at) a = b = snaps[n - 1];
    else if (rt > snaps[0].at) for (let i = n - 1; i > 0; i--) if (snaps[i - 1].at <= rt) { a = snaps[i - 1]; b = snaps[i]; f = (rt - a.at) / Math.max(1, b.at - a.at); break; }
    return { a, b, f };
  }

  // ----- dessin -----
  const KIND = ["align", "wires", "cool", "crate", "scan", "dl", "calib", "purge", "fuel", "trash", "shield", "up", "sample", "ant"];   // type d'animation de chaque poste
  const TCOL = ["#ff9f43", "#ffd23f", "#ff6b81", "#b79bff", "#3ee6c4", "#4cc9f0", "#7ae582", "#4cc9f0", "#ff9f43", "#ffd23f", "#b79bff", "#7ae582", "#ff6b81", "#3ee6c4"];   // couleur de chaque poste de tâche
  const RTINT = ["#ff8a3d", "#ff3b5c", "#3ee6c4", "#ff8a3d", "#3ee6c4", "#4c8dff", "#ff6b81", "#7ae582", "#4cc9f0", "#ffd23f", "#4cc9f0", "#b79bff", "#c79a52", "#ffd23f"];                         // ambiance de chaque salle
  function bolt(g, cx, cy, s2, col) { g.fillStyle = col; g.beginPath(); [[.25, -1], [-.55, .1], [-.08, .1], [-.28, 1], [.55, -.2], [.08, -.2]].forEach((p, i) => g[i ? "lineTo" : "moveTo"](cx + p[0] * s2, cy + p[1] * s2)); g.closePath(); g.fill(); }
  function rad(g, cx, cy, r, col) { g.fillStyle = col; for (let k = 0; k < 3; k++) { const an = k * 2.0944 - 1.5708; g.beginPath(); g.moveTo(cx, cy); g.arc(cx, cy, r, an - .5, an + .5); g.closePath(); g.fill(); } g.beginPath(); g.arc(cx, cy, r * .22, 0, 7); g.fill(); }
  function hazard(g, rx, ry, w, h) { g.save(); g.beginPath(); g.rect(rx, ry, w, h); g.clip(); g.fillStyle = "#e8b923"; g.fillRect(rx, ry, w, h); g.fillStyle = "#16132e"; for (let i = -h; i < w + h; i += 16) { g.beginPath(); g.moveTo(rx + i, ry + h); g.lineTo(rx + i + 8, ry + h); g.lineTo(rx + i + 8 + h, ry); g.lineTo(rx + i + h, ry); g.closePath(); g.fill(); } g.restore(); }
  function consoleAt(g, px, py, col) {                                    // borne de tâche : écran lumineux + boutons
    g.save(); g.shadowColor = col; g.shadowBlur = 16; g.fillStyle = "#17153a"; rr(g, px - 17, py - 15, 34, 30, 7); g.fill(); g.restore();
    const gr = g.createLinearGradient(0, py - 15, 0, py + 15); gr.addColorStop(0, "#3a3680"); gr.addColorStop(1, "#1f1c48");
    g.fillStyle = gr; rr(g, px - 17, py - 15, 34, 30, 7); g.fill(); g.strokeStyle = "#8176e8"; g.lineWidth = 2; g.stroke();
    g.fillStyle = col; g.globalAlpha = .9; rr(g, px - 12, py - 10, 24, 12, 3); g.fill(); g.globalAlpha = .35; g.fillStyle = "#fff"; g.fillRect(px - 12, py - 10, 24, 3);
    g.globalAlpha = .35; g.fillStyle = "#07061a"; for (let k = -6; k <= 2; k += 4) g.fillRect(px - 12, py + k, 24, 1); g.globalAlpha = 1;
    [-8, 0, 8].forEach((d, i) => { g.fillStyle = TCOL[(i * 3) % 8]; g.beginPath(); g.arc(px + d, py + 9, 2.2, 0, 7); g.fill(); });
  }
  function background() {
    if (bg) return bg;
    bg = document.createElement("canvas"); bg.width = WW; bg.height = WH; const g = bg.getContext("2d");
    let seed = 11; const rnd = () => (seed = seed * 16807 % 2147483647) / 2147483647;
    const sp = g.createRadialGradient(WW / 2, WH / 2, 100, WW / 2, WH / 2, WW * .7); sp.addColorStop(0, "#14103a"); sp.addColorStop(1, "#04030d"); g.fillStyle = sp; g.fillRect(0, 0, WW, WH);
    for (let i = 0; i < 320; i++) { const r = rnd() < .08 ? 1.7 : .6 + rnd() * .8; g.globalAlpha = .25 + rnd() * .6; g.fillStyle = rnd() < .2 ? "#ffd9a8" : "#cfd6ff"; g.beginPath(); g.arc(rnd() * WW, rnd() * WH, r, 0, 7); g.fill(); }   // espace étoilé autour du vaisseau
    g.globalAlpha = 1;
    // Coque du Skeld : salles aux angles adoucis, couloirs étroits et contour en plusieurs couches.
    const hull = (pad, radius) => {
      ROOMS.forEach(a => { rr(g, a.x - pad, a.y - pad, a.w + pad * 2, a.h + pad * 2, Math.min(radius, a.w / 4, a.h / 4)); g.fill(); });
      CORR.forEach(a => g.fillRect(a.x - pad, a.y - pad, a.w + pad * 2, a.h + pad * 2));
    };
    g.save(); g.shadowColor = "rgba(0,0,0,.7)"; g.shadowBlur = 30; g.fillStyle = "#26225a"; hull(16, 25); g.restore();
    g.fillStyle = "#4a4496"; hull(11, 22);
    g.fillStyle = "#2f2b6e"; hull(6, 18);
    g.fillStyle = "#6e66c8"; hull(2, 15);
    const fl = g.createLinearGradient(0, 0, WW, WH); fl.addColorStop(0, "#221f4a"); fl.addColorStop(1, "#191638");
    g.fillStyle = fl; hull(0, 13);
    g.save(); g.beginPath();
    ROOMS.forEach(a => rr(g, a.x, a.y, a.w, a.h, 13));
    CORR.forEach(a => g.rect(a.x, a.y, a.w, a.h));
    g.clip();
    ROOMS.forEach((r, i) => { const rg = g.createRadialGradient(r.x + r.w / 2, r.y + r.h / 2, 10, r.x + r.w / 2, r.y + r.h / 2, r.w * .75); rg.addColorStop(0, RTINT[i] + "33"); rg.addColorStop(1, RTINT[i] + "00"); g.fillStyle = rg; g.fillRect(r.x, r.y, r.w, r.h); });
    g.strokeStyle = "rgba(160,150,255,.07)"; g.lineWidth = 1;
    for (let i = 0; i < WW; i += 50) { g.beginPath(); g.moveTo(i + .5, 0); g.lineTo(i + .5, WH); g.stroke(); }
    for (let j = 0; j < WH; j += 50) { g.beginPath(); g.moveTo(0, j + .5); g.lineTo(WW, j + .5); g.stroke(); }
    g.fillStyle = "rgba(255,255,255,.025)"; for (let i = 0; i < WW; i += 100) for (let j = 0; j < WH; j += 100) g.fillRect(i, j, 50, 50);   // damier discret
    CORR.forEach(cr => { g.strokeStyle = "rgba(62,230,196,.28)"; g.lineWidth = 3; g.setLineDash([18, 14]); g.beginPath(); if (cr.w >= cr.h) { g.moveTo(cr.x + 10, cr.y + cr.h / 2); g.lineTo(cr.x + cr.w - 10, cr.y + cr.h / 2); } else { g.moveTo(cr.x + cr.w / 2, cr.y + 10); g.lineTo(cr.x + cr.w / 2, cr.y + cr.h - 10); } g.stroke(); g.setLineDash([]); });
    const ringAt = (cx, cy, r, col, lw, al) => { g.globalAlpha = al; g.strokeStyle = col; g.lineWidth = lw; g.beginPath(); g.arc(cx, cy, r, 0, 7); g.stroke(); g.globalAlpha = 1; };
    const rc = n => ROOMS.find(r => r.n === n);
    { const r = rc("Moteur haut"), r2 = rc("Moteur bas"); [r, r2].forEach(rm => [[.3, .6], [.72, .6]].forEach(([fx, fy]) => { const cx = rm.x + rm.w * fx, cy = rm.y + rm.h * fy; ringAt(cx, cy, 44, "#ff8a3d", 4, .35); ringAt(cx, cy, 28, "#ff8a3d", 2, .3); ringAt(cx, cy, 12, "#ffd23f", 3, .4); g.strokeStyle = "#ff8a3d"; g.lineWidth = 3; g.globalAlpha = .3; for (let k = 0; k < 6; k++) { const an = k * 1.047; g.beginPath(); g.moveTo(cx + Math.cos(an) * 14, cy + Math.sin(an) * 14); g.lineTo(cx + Math.cos(an) * 28, cy + Math.sin(an) * 28); g.stroke(); } g.globalAlpha = 1; })); }   // Moteurs : turbines peintes
    ringAt(TB[0], TB[1], 118, "#4c8dff", 5, .25); ringAt(TB[0], TB[1], 92, "#4c8dff", 2, .3); ringAt(TB[0], TB[1], 62, "#9bb8ff", 2, .25);   // Cafétéria : tapis rond
    { const r = rc("Électricité"); g.strokeStyle = "rgba(255,210,63,.3)"; g.lineWidth = 4; g.beginPath(); g.moveTo(r.x, r.y + r.h - 50); g.lineTo(LP[0], r.y + r.h - 50); g.lineTo(LP[0], LP[1] + 18); g.moveTo(r.x + r.w, r.y + 40); g.lineTo(LP[0] + 50, r.y + 40); g.lineTo(LP[0] + 50, LP[1]); g.lineTo(LP[0] + 20, LP[1]); g.stroke(); }   // Électricité : conduits
    { const r = rc("Réacteur"), cx = r.x + r.w * .62, cy = r.y + r.h * .5, cg = g.createRadialGradient(cx, cy, 5, cx, cy, 90); cg.addColorStop(0, "rgba(255,59,92,.45)"); cg.addColorStop(1, "rgba(255,59,92,0)"); g.fillStyle = cg; g.fillRect(cx - 90, cy - 90, 180, 180); ringAt(cx, cy, 50, "#ff3b5c", 4, .4); ringAt(cx, cy, 32, "#ff3b5c", 2, .4); rad(g, cx, cy, 22, "rgba(255,80,110,.5)"); }   // Réacteur : cœur
    { const r = rc("Stockage"); g.strokeStyle = "rgba(232,185,35,.45)"; g.lineWidth = 3;[[.08, .08, .38, .22], [.54, .08, .38, .22], [.08, .72, .38, .2], [.54, .72, .38, .2]].forEach(([fx, fy, fw, fh]) => { const bx = r.x + r.w * fx, by = r.y + r.h * fy, bw = r.w * fw, bh = r.h * fh; g.strokeRect(bx, by, bw, bh); g.globalAlpha = .5; g.beginPath(); g.moveTo(bx, by); g.lineTo(bx + bw, by + bh); g.moveTo(bx + bw, by); g.lineTo(bx, by + bh); g.stroke(); g.globalAlpha = 1; }); }   // Stockage : zones de caisses peintes
    { const r = rc("Médbay"), cx = r.x + r.w * .62, cy = r.y + r.h * .5; ringAt(cx, cy, 36, "#3ee6c4", 3, .35); g.fillStyle = "rgba(62,230,196,.3)"; g.fillRect(cx - 5, cy - 16, 10, 32); g.fillRect(cx - 16, cy - 5, 32, 10); }   // Médbay : croix et scanner
    { const r = rc("Armes"), cx = r.x + r.w / 2, cy = r.y + r.h * .45; ringAt(cx, cy, 34, "#ff6b81", 3, .4); ringAt(cx, cy, 20, "#ff6b81", 2, .4); ringAt(cx, cy, 6, "#ff6b81", 3, .5); }   // Armes : cible
    { const r = rc("O2"), cx = r.x + r.w / 2, cy = r.y + r.h / 2; ringAt(cx - 22, cy, 14, "#7ae582", 3, .4); ringAt(cx + 22, cy, 14, "#7ae582", 3, .4); }   // O2 : deux réservoirs
    { const r = rc("Navigation"), cx = r.x + r.w / 2, cy = r.y + r.h / 2; ringAt(cx, cy, 36, "#4cc9f0", 3, .4); g.strokeStyle = "#4cc9f0"; g.globalAlpha = .35; g.lineWidth = 2; g.beginPath(); g.moveTo(cx - 36, cy); g.lineTo(cx + 36, cy); g.moveTo(cx, cy - 36); g.lineTo(cx, cy + 36); g.stroke(); g.globalAlpha = 1; }   // Navigation : cadran
    { const r = rc("Admin"), cx = r.x + r.w / 2, cy = r.y + r.h / 2; ringAt(cx, cy, 34, "#ffd23f", 3, .35); ringAt(cx, cy, 20, "#ffd23f", 2, .35); }   // Admin : table holographique
    { const r = rc("Boucliers"), cx = r.x + r.w / 2, cy = r.y + r.h / 2; g.strokeStyle = "#4cc9f0"; g.globalAlpha = .4; g.lineWidth = 3; g.beginPath(); for (let k = 0; k < 6; k++) { const an = k * 1.0472 - 1.5708; g.lineTo(cx + Math.cos(an) * 44, cy + Math.sin(an) * 44); } g.closePath(); g.stroke(); g.globalAlpha = 1; }   // Boucliers : hexagone
    { const r = rc("Comms"), cx = r.x + r.w / 2, cy = r.y + r.h * .55; ringAt(cx, cy, 30, "#b79bff", 3, .35); ringAt(cx, cy, 18, "#b79bff", 2, .35); }   // Communications : antenne
    { const r = rc("Sécurité"); g.fillStyle = "rgba(62,230,196,.2)"; for (let k = 0; k < 3; k++) g.fillRect(r.x + 14 + k * 44, r.y + r.h - 42, 36, 22); }   // Sécurité : rangée d'écrans
    // Mobilier intérieur : silhouettes de consoles, tables et équipements propres à chaque salle.
    const panel = (px, py, w, h, col = "#8279c9") => {
      g.fillStyle = "rgba(3,3,18,.48)"; rr(g, px + 3, py + 4, w, h, 6); g.fill();
      g.fillStyle = "#17162f"; rr(g, px, py, w, h, 6); g.fill();
      g.strokeStyle = col; g.lineWidth = 2; g.stroke();
      g.fillStyle = col + "66"; rr(g, px + 5, py + 5, w - 10, Math.max(5, h * .32), 3); g.fill();
      g.fillStyle = "#d8d5ff"; for (let k = 0; k < Math.max(2, Math.floor(w / 18)); k++) g.fillRect(px + 6 + k * ((w - 14) / Math.max(2, Math.floor(w / 18))), py + h - 8, 4, 3);
    };
    const table = (px, py, r, col = "#8b83d0") => {
      g.fillStyle = "rgba(0,0,0,.3)"; g.beginPath(); g.ellipse(px + 3, py + 5, r * 1.08, r * .86, 0, 0, 7); g.fill();
      g.fillStyle = "#24234c"; g.beginPath(); g.ellipse(px, py, r * 1.08, r * .86, 0, 0, 7); g.fill();
      g.strokeStyle = col; g.lineWidth = 3; g.stroke();
      g.fillStyle = "#4b477e"; g.beginPath(); g.ellipse(px, py - 2, r * .76, r * .58, 0, 0, 7); g.fill();
      g.fillStyle = col; g.beginPath(); g.arc(px, py, 4, 0, 7); g.fill();
    };
    { const r = rc("Cafétéria"); [[.23,.25,25],[.77,.25,25],[.23,.76,25],[.77,.76,25]].forEach(([fx,fy,rrr]) => table(r.x+r.w*fx,r.y+r.h*fy,sc(rrr),"#7771b8")); table(TB[0],TB[1],sc(24),"#ff7d91"); }
    { const r = rc("Médbay"); panel(r.x+sc(12),r.y+sc(18),sc(35),sc(22),"#3ee6c4"); panel(r.x+sc(68),r.y+sc(18),sc(35),sc(22),"#3ee6c4"); g.fillStyle="#c5fff3"; rr(g,r.x+sc(18),r.y+sc(66),sc(82),sc(20),8); g.fill(); g.strokeStyle="#3ee6c4"; g.stroke(); }
    { const r = rc("Armes"); panel(r.x+sc(14),r.y+sc(16),sc(45),sc(24),"#ff6b81"); panel(r.x+sc(86),r.y+sc(16),sc(45),sc(24),"#ff6b81"); for(let k=0;k<3;k++){g.strokeStyle="#ff9aaa";g.lineWidth=3;g.beginPath();g.moveTo(r.x+sc(28+k*34),r.y+sc(75));g.lineTo(r.x+sc(28+k*34),r.y+sc(96));g.stroke();} }
    { const r = rc("Navigation"); panel(r.x+sc(15),r.y+sc(18),sc(65),sc(30),"#4cc9f0"); panel(r.x+sc(22),r.y+sc(78),sc(50),sc(24),"#4cc9f0"); }
    { const r = rc("Admin"); table(r.x+r.w*.52,r.y+r.h*.48,sc(32),"#ffd23f"); panel(r.x+sc(12),r.y+sc(12),sc(38),sc(24),"#ffd23f"); panel(r.x+r.w-sc(50),r.y+r.h-sc(38),sc(38),sc(24),"#ffd23f"); }
    { const r = rc("Boucliers"); for(let k=0;k<3;k++)panel(r.x+sc(12+k*38),r.y+sc(72),sc(28),sc(22),"#4cc9f0"); }
    { const r = rc("Comms"); panel(r.x+sc(18),r.y+sc(14),sc(78),sc(28),"#b79bff"); g.strokeStyle="#b79bff";g.lineWidth=3;g.beginPath();g.moveTo(r.x+r.w*.5,r.y+sc(12));g.lineTo(r.x+r.w*.5,r.y-sc(2));g.stroke(); }
    { const r = rc("Électricité"); for(let k=0;k<3;k++)panel(r.x+sc(12+k*34),r.y+sc(18),sc(26),sc(42),"#ffd23f"); panel(r.x+sc(25),r.y+sc(78),sc(68),sc(25),"#ffd23f"); }
    { const r = rc("Stockage"); [[.08,.3],[.54,.3],[.08,.53],[.54,.53]].forEach(([fx,fy],k)=>{const px=r.x+r.w*fx,py=r.y+r.h*fy;g.fillStyle="#39334f";rr(g,px,py,sc(48),sc(26),4);g.fill();g.strokeStyle="#d4a83b";g.lineWidth=2;g.stroke();g.strokeStyle="#8f6d2c";g.beginPath();g.moveTo(px,py);g.lineTo(px+sc(48),py+sc(26));g.moveTo(px+sc(48),py);g.lineTo(px,py+sc(26));g.stroke();}); }
    { const r = rc("O2"); for(let k=0;k<2;k++){const px=r.x+sc(25+k*38),py=r.y+sc(18);g.fillStyle="#1c3d38";rr(g,px,py,sc(18),sc(48),8);g.fill();g.strokeStyle="#7ae582";g.lineWidth=2;g.stroke();g.fillStyle="#7ae582";g.fillRect(px+sc(5),py+sc(8),sc(8),sc(4));} }
    const m = document.createElement("canvas"); m.width = WW; m.height = WH; const mg = m.getContext("2d");                      // ombre portée des murs sur le sol
    mg.fillStyle = "#000"; mg.fillRect(0, 0, WW, WH); mg.globalCompositeOperation = "destination-out"; FLOOR.forEach(a => mg.fillRect(a.x, a.y, a.w, a.h));
    g.shadowColor = "rgba(0,0,0,.75)"; g.shadowBlur = 26; g.drawImage(m, 0, 0); g.shadowBlur = 0;
    g.restore();
    ROOMS.forEach((r, i) => {                                             // voyants lumineux le long des murs
      g.fillStyle = RTINT[i]; g.globalAlpha = .85;
      for (let px = r.x + 28; px < r.x + r.w - 20; px += 48) { if (!at(px + 9, r.y - 8)) g.fillRect(px, r.y - 9, 18, 3); if (!at(px + 9, r.y + r.h + 8)) g.fillRect(px, r.y + r.h + 6, 18, 3); }
      g.globalAlpha = 1;
    });
    g.font = "800 22px 'Bricolage Grotesque',sans-serif"; g.textAlign = "center"; g.fillStyle = "rgba(255,255,255,.14)"; ROOMS.forEach(r => g.fillText(r.n.toUpperCase(), r.x + r.w / 2, r.y + r.h - 18));
    // Seuils et cadres de portes : la géométrie reste alignée sur les ouvertures des couloirs.
    DOORS.forEach(d => {
      const horizontal = d.w >= d.h, cx = d.x + d.w / 2, cy = d.y + d.h / 2;
      g.save();
      g.lineCap = "round";
      g.strokeStyle = "rgba(8,7,28,.95)"; g.lineWidth = 9;
      g.beginPath();
      if (horizontal) { g.moveTo(d.x - 5, cy); g.lineTo(d.x + d.w + 5, cy); }
      else { g.moveTo(cx, d.y - 5); g.lineTo(cx, d.y + d.h + 5); }
      g.stroke();
      g.strokeStyle = "rgba(167,157,255,.9)"; g.lineWidth = 3;
      g.beginPath();
      if (horizontal) { g.moveTo(d.x - 5, cy - 5); g.lineTo(d.x + d.w + 5, cy - 5); g.moveTo(d.x - 5, cy + 5); g.lineTo(d.x + d.w + 5, cy + 5); }
      else { g.moveTo(cx - 5, d.y - 5); g.lineTo(cx - 5, d.y + d.h + 5); g.moveTo(cx + 5, d.y - 5); g.lineTo(cx + 5, d.y + d.h + 5); }
      g.stroke();
      const led = g.createRadialGradient(cx, cy, 1, cx, cy, 15);
      led.addColorStop(0, "rgba(62,230,196,.5)"); led.addColorStop(1, "rgba(62,230,196,0)");
      g.fillStyle = led; g.beginPath(); g.arc(cx, cy, 15, 0, 7); g.fill();
      g.fillStyle = "#7af0d1"; g.beginPath(); g.arc(cx, cy, 3.5, 0, 7); g.fill();
      g.restore();
    });
    // Repères lumineux aux carrefours pour rendre les changements de couloir lisibles.
    [[170, 90], [170, 245], [410, 150], [510, 285], [630, 320], [410, 405]].forEach(([px, py]) => {
      const cx = sc(px), cy = sc(py);
      g.fillStyle = "rgba(10,9,35,.9)"; g.beginPath(); g.arc(cx, cy, 9, 0, 7); g.fill();
      g.strokeStyle = "rgba(123,240,215,.55)"; g.lineWidth = 2; g.beginPath(); g.arc(cx, cy, 6, 0, 7); g.stroke();
      g.fillStyle = "#7af0d1"; g.globalAlpha = .7; g.beginPath(); g.arc(cx, cy, 2, 0, 7); g.fill(); g.globalAlpha = 1;
    });
    g.save(); g.shadowColor = "#ff3b5c"; g.shadowBlur = 22; g.fillStyle = "#2a2670"; g.beginPath(); g.arc(TB[0], TB[1], 30, 0, 7); g.fill(); g.restore();   // bouton d'urgence
    g.strokeStyle = "#a99bff"; g.lineWidth = 4; g.beginPath(); g.arc(TB[0], TB[1], 30, 0, 7); g.stroke();
    const bgr = g.createRadialGradient(TB[0] - 3, TB[1] - 3, 2, TB[0], TB[1], 14); bgr.addColorStop(0, "#ff8fa3"); bgr.addColorStop(1, "#d81b3d"); g.fillStyle = bgr; g.beginPath(); g.arc(TB[0], TB[1], 14, 0, 7); g.fill();
    ST.forEach((t, k) => consoleAt(g, t[0], t[1], TCOL[k]));
    VENTS.forEach(v => { const vg = g.createLinearGradient(0, v[1] - 12, 0, v[1] + 12); vg.addColorStop(0, "#5a5499"); vg.addColorStop(1, "#2b2760"); g.fillStyle = vg; rr(g, v[0] - 20, v[1] - 12, 40, 24, 5); g.fill(); g.strokeStyle = "#8f86ea"; g.lineWidth = 2; g.stroke(); g.fillStyle = "#07061a"; for (let k = -12; k <= 12; k += 6) g.fillRect(v[0] + k - 1.5, v[1] - 8, 3, 16); });
    g.fillStyle = "#17153a"; rr(g, CAMP[0] - 24, CAMP[1] - 16, 48, 32, 6); g.fill(); g.strokeStyle = "#8176e8"; g.lineWidth = 2; g.stroke();   // caméras : mur d'écrans
    [[-17, -11], [2, -11], [-17, 2], [2, 2]].forEach(([dx, dy]) => { g.fillStyle = "#0d3b36"; g.fillRect(CAMP[0] + dx, CAMP[1] + dy, 15, 11); g.fillStyle = "#3ee6c4"; g.globalAlpha = .8; g.fillRect(CAMP[0] + dx + 2, CAMP[1] + dy + 2, 11, 7); g.globalAlpha = 1; });
    g.fillStyle = "#17153a"; rr(g, LP[0] - 17, LP[1] - 17, 34, 34, 7); g.fill(); g.strokeStyle = "#ffd23f"; g.lineWidth = 2; g.stroke(); bolt(g, LP[0], LP[1], 11, "#ffd23f");
    RP.forEach(p => { g.fillStyle = "#17153a"; rr(g, p[0] - 17, p[1] - 17, 34, 34, 7); g.fill(); g.strokeStyle = "#ff6b81"; g.lineWidth = 2; g.stroke(); rad(g, p[0], p[1], 12, "#ff6b81"); });
    return bg;
  }
  const camMask = () => { if (camM) return camM; camM = document.createElement("canvas"); camM.width = WW; camM.height = WH; const g = camM.getContext("2d"); g.fillStyle = "rgba(4,3,14,.9)"; g.fillRect(0, 0, WW, WH); g.globalCompositeOperation = "destination-out"; g.fillStyle = "#000"; CAMZ.forEach(a => g.fillRect(a.x, a.y, a.w, a.h)); return camM; };
  function bean(px, py, col, f, al, walk, gh) {                          // personnage : sac à dos, visière, jambes animées ; fantôme = silhouette flottante
    x.save(); x.globalAlpha *= al; x.translate(px, py + (gh ? Math.sin(tNow / 260 + px) * 3 - 3 : (walk ? -Math.abs(Math.sin(tNow / 75)) * 1.8 : 0))); x.scale(f || 1, 1);
    const hw = BR * .85, tp = -BR * 1.2, bt = BR;
    if (gh) {
      x.globalAlpha *= .6; x.shadowColor = col; x.shadowBlur = 16;
      const gk = "g" + col; let g2 = gradC.get(gk); if (!g2) { g2 = x.createLinearGradient(0, tp, 0, bt + 6); g2.addColorStop(0, mix(col, -.35)); g2.addColorStop(1, mix(col, .1)); gradC.set(gk, g2); }
      x.fillStyle = g2; x.beginPath(); x.arc(0, tp + hw, hw, Math.PI, 0); x.lineTo(hw, bt - 3);
      x.quadraticCurveTo(hw * .67, bt + 7, hw * .33, bt - 3); x.quadraticCurveTo(0, bt + 7, -hw * .33, bt - 3); x.quadraticCurveTo(-hw * .67, bt + 7, -hw, bt - 3); x.closePath(); x.fill(); x.shadowBlur = 0;
      x.fillStyle = "rgba(255,255,255,.9)"; x.beginPath(); x.ellipse(BR * .25, -BR * .5, BR * .55, BR * .32, 0, 0, 7); x.fill();
      x.fillStyle = "#16143a"; [BR * .08, BR * .42].forEach(ex => { x.beginPath(); x.ellipse(ex, -BR * .5, 2.2, 3.4, 0, 0, 7); x.fill(); });
      x.restore(); return;
    }
    x.fillStyle = "rgba(0,0,0,.35)"; x.beginPath(); x.ellipse(0, bt + 2, BR * .95, BR * .36, 0, 0, 7); x.fill();
    const ph = walk ? Math.sin(tNow / 75) : 0, dk = mix(col, .55);
    x.fillStyle = mix(col, .45); x.strokeStyle = dk; x.lineWidth = 1.5;
    rr(x, -hw * .8, bt - 6 + ph * 2.5, hw * .66, 9, 3); x.fill(); x.stroke(); rr(x, hw * .14, bt - 6 - ph * 2.5, hw * .66, 9, 3); x.fill(); x.stroke();   // jambes
    x.fillStyle = mix(col, .4); rr(x, -hw - 8, -3, 11, 19, 4); x.fill(); x.stroke();                                                                      // sac à dos
    let g = gradC.get(col); if (!g) { g = x.createLinearGradient(-hw, 0, hw, 0); g.addColorStop(0, mix(col, -.25)); g.addColorStop(.6, col); g.addColorStop(1, mix(col, .4)); gradC.set(col, g); }
    x.fillStyle = g; rr(x, -hw, tp, hw * 2, BR * 2.2, BR * .8); x.fill(); x.lineWidth = 2; x.strokeStyle = dk; x.stroke();
    x.fillStyle = "rgba(255,255,255,.2)"; x.beginPath(); x.ellipse(-hw * .5, tp + 9, 2.6, 7, -.25, 0, 7); x.fill();
    if (!visG) { visG = x.createLinearGradient(0, -BR * .85, 0, -BR * .1); visG.addColorStop(0, "#d4f6ff"); visG.addColorStop(1, "#58b4e6"); }
    x.fillStyle = visG; x.beginPath(); x.ellipse(BR * .25, -BR * .45, BR * .62, BR * .38, 0, 0, 7); x.fill(); x.lineWidth = 1.5; x.strokeStyle = "#12304a"; x.stroke();
    x.fillStyle = "rgba(255,255,255,.8)"; x.beginPath(); x.ellipse(BR * .45, -BR * .6, BR * .2, BR * .1, 0, 0, 7); x.fill();
    x.restore();
  }
  function corpse(px, py, col) {
    x.fillStyle = "rgba(0,0,0,.35)"; x.beginPath(); x.ellipse(px, py + 9, BR * 1.1, BR * .45, 0, 0, 7); x.fill();
    x.fillStyle = "rgba(200,30,60,.55)"; x.beginPath(); x.ellipse(px + 3, py + 9, BR * .95, BR * .34, 0, 0, 7); x.fill();
    const g = x.createLinearGradient(px - BR, 0, px + BR, 0); g.addColorStop(0, mix(col, -.2)); g.addColorStop(1, mix(col, .35));
    x.fillStyle = mix(col, .45); rr(x, px - BR * .7, py + 7, BR * .55, 7, 2); x.fill(); rr(x, px + BR * .15, py + 7, BR * .55, 7, 2); x.fill();
    x.fillStyle = g; x.beginPath(); x.ellipse(px, py + 4, BR * .9, BR * .7, 0, Math.PI, 0); x.fill(); x.fillRect(px - BR * .9, py + 4, BR * 1.8, 4);
    x.strokeStyle = mix(col, .6); x.lineWidth = 2; x.beginPath(); x.ellipse(px, py + 4, BR * .9, BR * .7, 0, Math.PI, 0); x.stroke();
    x.fillStyle = "#f4efe0"; x.fillRect(px - 2, py - 12, 4, 11); [-3, 3].forEach(d => { x.beginPath(); x.arc(px + d, py - 13, 3, 0, 7); x.fill(); });
  }
  function btn(b, label, col, dim, sub) {
    x.save(); x.globalAlpha = dim ? .45 : 1; x.shadowColor = col; x.shadowBlur = dim ? 0 : 14;
    const g = x.createRadialGradient(b.x - b.r * .3, b.y - b.r * .35, b.r * .1, b.x, b.y, b.r); g.addColorStop(0, mix(col, -.35)); g.addColorStop(1, mix(col, .25));
    x.fillStyle = g; x.beginPath(); x.arc(b.x, b.y, b.r, 0, 7); x.fill(); x.shadowBlur = 0;
    x.lineWidth = 4; x.strokeStyle = "rgba(255,255,255,.6)"; x.stroke();
    x.lineWidth = 1.5; x.strokeStyle = "rgba(0,0,0,.25)"; x.beginPath(); x.arc(b.x, b.y, b.r - 6, 0, 7); x.stroke();
    x.fillStyle = "#fff"; x.textAlign = "center"; x.textBaseline = "middle"; x.font = `800 ${b.r > 40 ? 15 : 14}px 'Bricolage Grotesque',sans-serif`;
    x.shadowColor = "rgba(0,0,0,.5)"; x.shadowBlur = 4; x.fillText(sub || label, b.x, b.y); x.restore();
  }
  function minimap(tk, mp, ghost, imp, now, camX, camY, vw, vh, pos) {   // mini-carte (touche M ou appui : plein écran) : plan, salles, mes tâches restantes, ma position
    const mw = 190, mh = 133, mx = 12, my = H - mh - 12, k = mw / WW;
    if (!mmBase) {
      mmBase = document.createElement("canvas"); mmBase.width = mw + 10; mmBase.height = mh + 10; const mg = mmBase.getContext("2d");
      mg.fillStyle = "rgba(6,5,20,.72)"; rr(mg, 0, 0, mw + 10, mh + 10, 9); mg.fill(); mg.strokeStyle = "rgba(160,150,255,.5)"; mg.lineWidth = 1.5; mg.stroke();
      mg.fillStyle = "#4b4596"; FLOOR.forEach(a2 => mg.fillRect(5 + a2.x * k, 5 + a2.y * k, Math.max(1, a2.w * k), Math.max(1, a2.h * k)));
      ROOMS.forEach((r, i) => { mg.fillStyle = RTINT[i] + "40"; mg.fillRect(5 + r.x * k, 5 + r.y * k, r.w * k, r.h * k); });
      mg.font = "700 8px 'DM Sans',sans-serif"; mg.textAlign = "center"; mg.fillStyle = "rgba(255,255,255,.55)"; ROOMS.forEach(r => mg.fillText(r.n, 5 + (r.x + r.w / 2) * k, 5 + (r.y + r.h / 2) * k + 3));
      mg.fillStyle = "#ff3b5c"; mg.beginPath(); mg.arc(5 + TB[0] * k, 5 + TB[1] * k + 12, 2.5, 0, 7); mg.fill();
    }
    x.drawImage(mmBase, mx - 5, my - 5);
    if (imp && !ghost) { x.fillStyle = "#9b7dff"; VENTS.forEach(v => x.fillRect(mx + v[0] * k - 2, my + v[1] * k - 2, 4, 4)); }
    ST.forEach((t, i) => { if (!(tk[0] >> i & 1) || (tk[1] >> i & 1)) return; x.fillStyle = imp ? "#ff8fa3" : TCOL[i]; x.beginPath(); x.arc(mx + t[0] * k, my + t[1] * k, 3 + Math.sin(now / 300 + i) * .7, 0, 7); x.fill(); });
    if (ls.sb && Math.floor(now / 300) % 2) { x.fillStyle = "#ff3b5c"; if (ls.sb[0] === 2) { const d = DOORS.find(z => z.id === ls.sb[2]); if (d) { x.beginPath(); x.arc(mx + (d.x + d.w / 2) * k, my + (d.y + d.h / 2) * k, 5, 0, 7); x.fill(); } } else (ls.sb[0] === 0 ? [LP] : RP.filter((p, i) => !(ls.sb[2] >> i & 1))).forEach(p => { x.beginPath(); x.arc(mx + p[0] * k, my + p[1] * k, 4.5, 0, 7); x.fill(); }); }
    if (ghost && pos) pos.forEach((p, i) => { if (i !== myIdx && ls.p[i] && ls.p[i][2] && pl[i]) { x.fillStyle = pl[i][2]; x.beginPath(); x.arc(mx + p[0] * k, my + p[1] * k, 2.5, 0, 7); x.fill(); } });   // les fantômes voient tout le monde
    x.strokeStyle = "rgba(255,255,255,.55)"; x.lineWidth = 1; x.strokeRect(mx + camX * k, my + camY * k, vw * k, vh * k);
    const c = pl && pl[myIdx] ? pl[myIdx][2] : "#fff"; x.fillStyle = c; x.strokeStyle = "#fff"; x.lineWidth = 1.5; x.beginPath(); x.arc(mx + mp[0] * k, my + mp[1] * k, 3.5, 0, 7); x.fill(); x.stroke();
    txt("M", mx + mw - 6, my + 8, "700 9px 'DM Sans',sans-serif", "rgba(255,255,255,.5)");
  }
  function bigmap(tk, mp, ghost, imp, now, pos) {                         // carte plein écran : salles, postes de tâche nommés, conduits (imposteur)
    x.fillStyle = "rgba(4,3,14,.88)"; x.fillRect(0, 0, W, H);
    txt("🗺️ Carte du vaisseau", CX, 24, "800 20px 'Bricolage Grotesque',sans-serif", "#fff");
    const k = .5, ox = (W - WW * k) / 2, oy = 50;
    x.save(); x.translate(ox, oy);
    x.fillStyle = "#3b3680"; FLOOR.forEach(a2 => x.fillRect(a2.x * k, a2.y * k, a2.w * k, a2.h * k));
    ROOMS.forEach((r, i) => { x.fillStyle = RTINT[i] + "40"; x.fillRect(r.x * k, r.y * k, r.w * k, r.h * k); });
    x.strokeStyle = "rgba(160,150,255,.7)"; x.lineWidth = 2; FLOOR.forEach(a2 => x.strokeRect(a2.x * k, a2.y * k, a2.w * k, a2.h * k));
    ROOMS.forEach(r => txt(r.n.toUpperCase(), (r.x + r.w / 2) * k, (r.y + 10) * k + 4, "800 13px 'Bricolage Grotesque',sans-serif", "rgba(255,255,255,.35)"));
    x.fillStyle = "#ff3b5c"; x.beginPath(); x.arc(TB[0] * k, TB[1] * k + 18, 7, 0, 7); x.fill(); txt("Urgence", TB[0] * k, TB[1] * k + 32, "700 10px 'DM Sans',sans-serif", "#ffb3c0");
    txt("📹", CAMP[0] * k, CAMP[1] * k, "700 14px 'DM Sans',sans-serif", "#3ee6c4");
    if (imp && !ghost) VENTS.forEach(v => { x.fillStyle = "#9b7dff"; x.fillRect(v[0] * k - 5, v[1] * k - 5, 10, 10); });
    ST.forEach((t, i) => {
      if (!(tk[0] >> i & 1)) return; const dn = tk[1] >> i & 1, px = t[0] * k, py = t[1] * k;
      x.globalAlpha = dn ? .5 : 1; x.fillStyle = dn ? "#3a8f6f" : imp ? "#ff8fa3" : TCOL[i]; x.beginPath(); x.arc(px, py, 7 + (dn ? 0 : Math.sin(now / 300 + i) * 1.2), 0, 7); x.fill();
      x.lineWidth = 3; x.strokeStyle = "rgba(0,0,0,.7)"; x.font = "700 10px 'DM Sans',sans-serif"; x.textAlign = "center"; x.textBaseline = "middle";
      const lb = (dn ? "✔ " : "") + t[2]; x.strokeText(lb, px, py + 16); x.fillStyle = dn ? "#9fe0c4" : "#fff"; x.fillText(lb, px, py + 16); x.globalAlpha = 1;
    });
    if (ls.sb && Math.floor(now / 300) % 2) { x.fillStyle = "#ff3b5c"; if (ls.sb[0] === 2) { const d = DOORS.find(z => z.id === ls.sb[2]); if (d) { x.beginPath(); x.arc((d.x + d.w / 2) * k, (d.y + d.h / 2) * k, 9, 0, 7); x.fill(); } } else (ls.sb[0] === 0 ? [LP] : RP.filter((p, i) => !(ls.sb[2] >> i & 1))).forEach(p => { x.beginPath(); x.arc(p[0] * k, p[1] * k, 9, 0, 7); x.fill(); }); }
    if (ghost && pos) pos.forEach((p, i) => { if (i !== myIdx && ls.p[i] && ls.p[i][2] && pl[i]) { x.fillStyle = pl[i][2]; x.strokeStyle = "#fff"; x.lineWidth = 1.5; x.beginPath(); x.arc(p[0] * k, p[1] * k, 5, 0, 7); x.fill(); x.stroke(); } });
    const c = pl && pl[myIdx] ? pl[myIdx][2] : "#fff", pr = (now / 800) % 1;
    x.strokeStyle = "#fff"; x.globalAlpha = 1 - pr; x.lineWidth = 2; x.beginPath(); x.arc(mp[0] * k, mp[1] * k, 8 + pr * 14, 0, 7); x.stroke(); x.globalAlpha = 1;
    x.fillStyle = c; x.lineWidth = 2; x.beginPath(); x.arc(mp[0] * k, mp[1] * k, 7, 0, 7); x.fill(); x.stroke();
    x.restore();
    txt("Tu es ici : " + roomAt(mp[0], mp[1]) + "  ·  M ou un appui pour fermer", CX, 546, "600 13px 'DM Sans',sans-serif", "#b9b2ff");
  }
  function taskAnim(kd, p, t) {                                           // petite animation propre à chaque type de tâche (boîte 76 × 52)
    switch (kd) {
      case "wires": [["#ff5d5d", 10], ["#ffd23f", 26], ["#4cc9f0", 42]].forEach(([cc, yy], i) => { const e = Math.max(0, Math.min(1, p * 1.5 - i * .2)); x.strokeStyle = cc; x.fillStyle = cc; x.beginPath(); x.moveTo(6, yy); x.lineTo(6 + 64 * e, yy); x.stroke(); x.beginPath(); x.arc(6, yy, 3, 0, 7); x.arc(70, yy, 3, 0, 7); x.fill(); if (e < 1) { x.globalAlpha = .5 + .5 * Math.sin(t * 20); x.beginPath(); x.arc(6 + 64 * e, yy, 4, 0, 7); x.fill(); x.globalAlpha = 1; } }); break;
      case "fuel": x.strokeRect(24, 5, 28, 42); x.globalAlpha = .85; x.fillRect(26, 45 - 38 * p, 24, 38 * p); x.globalAlpha = 1; x.fillRect(48, 12, 10, 3); break;
      case "cool": x.strokeRect(32, 4, 12, 36); x.beginPath(); x.arc(38, 44, 7, 0, 7); x.stroke(); x.fillStyle = `hsl(${10 + 190 * p},85%,60%)`; x.fillRect(35, 40 - 34 * p, 6, 34 * p + 2); x.beginPath(); x.arc(38, 44, 5, 0, 7); x.fill(); break;
      case "crate": for (let i = 0; i < 4; i++) if (p > i / 4) { const bx = 14 + (i % 2) * 24, by = 30 - Math.floor(i / 2) * 20 - (p < (i + 1) / 4 ? Math.sin(t * 12) * 2 : 0); x.strokeRect(bx, by, 22, 18); x.beginPath(); x.moveTo(bx, by); x.lineTo(bx + 22, by + 18); x.stroke(); } break;
      case "scan": x.beginPath(); x.arc(38, 16, 9, 0, 7); x.stroke(); x.strokeRect(24, 28, 28, 20); x.globalAlpha = .85; x.fillRect(8, 6 + 40 * (.5 + .5 * Math.sin(t * 4)), 60, 2); x.globalAlpha = 1; break;
      case "sample": x.strokeRect(30, 4, 16, 44); x.globalAlpha = .8; x.fillRect(32, 46 - 40 * p, 12, 40 * p); x.globalAlpha = 1; for (let i = 0; i < 3; i++) { x.beginPath(); x.arc(34 + i * 4, 44 - ((t * 20 + i * 13) % 36), 1.8, 0, 7); x.stroke(); } break;
      case "dl": case "up": { const up = kd === "up"; for (let i = 0; i < 4; i++) { const yy = (t * 34 + i * 13) % 52; x.globalAlpha = .4 + .6 * (up ? 1 - yy / 52 : yy / 52); x.fillRect(32, up ? 52 - yy : yy, 12, 6); } x.globalAlpha = 1; x.beginPath(); if (up) { x.moveTo(38, 2); x.lineTo(24, 16); x.lineTo(52, 16); } else { x.moveTo(38, 50); x.lineTo(24, 36); x.lineTo(52, 36); } x.closePath(); x.fill(); break; }
      case "align": { const d = 24 * (1 - p); x.beginPath(); x.arc(38 - d, 26, 12, 0, 7); x.stroke(); x.beginPath(); x.arc(38 + d, 26, 12, 0, 7); x.stroke(); x.beginPath(); x.moveTo(38, 4); x.lineTo(38, 48); x.moveTo(10, 26); x.lineTo(66, 26); x.lineWidth = 1; x.stroke(); break; }
      case "trash": x.strokeRect(24, 26, 28, 22); x.fillRect(20, 22, 36, 3); for (let i = 0; i < 3; i++) { const yy = (t * 36 + i * 11) % 28; x.fillRect(29 + i * 7, yy - 4, 5, 5); } break;
      case "shield": x.beginPath(); for (let i = 0; i < 6; i++) { const an = i * 1.0472 - 1.5708; x.lineTo(38 + Math.cos(an) * 22, 26 + Math.sin(an) * 22); } x.closePath(); x.globalAlpha = .15 + .6 * p; x.fill(); x.globalAlpha = 1; x.stroke(); break;
      case "ant": x.save(); x.translate(38, 38); x.rotate(-.9 + Math.sin(t * 2) * .6 * (1 - p)); x.beginPath(); x.arc(0, 0, 16, Math.PI, 0); x.stroke(); x.beginPath(); x.moveTo(0, 0); x.lineTo(0, -22); x.stroke(); x.restore(); x.globalAlpha = p; x.beginPath(); x.arc(38, 38, 22, -2.2, -.9); x.stroke(); x.beginPath(); x.arc(38, 38, 30, -2.2, -.9); x.stroke(); x.globalAlpha = 1; break;
      case "calib": x.beginPath(); for (let i = 0; i <= 64; i += 2) { const yy = 26 + Math.sin(i / 5 + t * 8) * 18 * (1 - p); if (i) x.lineTo(6 + i, yy); else x.moveTo(6 + i, yy); } x.stroke(); break;
      case "purge": for (let i = 0; i < 5; i++) { x.beginPath(); x.arc(14 + i * 12, 48 - ((t * 24 + i * 17) % 48), 3 + (i % 2), 0, 7); x.stroke(); } break;
      default: x.beginPath(); x.arc(38, 26, 14, t * 5, t * 5 + 4); x.stroke();
    }
  }
  function taskPanel(k, p, now) {                                         // fenêtre de la tâche en cours (bas du écran)
    const bx = 250, by = 452, bw = 262, bh = 72, c = TCOL[k];
    x.save(); x.fillStyle = "rgba(10,8,32,.84)"; rr(x, bx, by, bw, bh, 12); x.fill(); x.lineWidth = 2; x.strokeStyle = c; x.stroke();
    x.fillStyle = "rgba(0,0,0,.35)"; rr(x, bx + 12, by + 10, 76, 52, 8); x.fill();
    x.save(); x.beginPath(); x.rect(bx + 12, by + 10, 76, 52); x.clip(); x.translate(bx + 12, by + 10); x.strokeStyle = c; x.fillStyle = c; x.lineWidth = 2.5; taskAnim(KIND[k], p, now / 1000); x.restore();
    txt(ST[k][2], bx + 100, by + 20, "700 13px 'DM Sans',sans-serif", "#fff", "left");
    x.fillStyle = "rgba(255,255,255,.15)"; rr(x, bx + 100, by + 34, 150, 10, 5); x.fill(); x.fillStyle = c; rr(x, bx + 100, by + 34, Math.max(10, 150 * p), 10, 5); x.fill();
    txt(`${Math.round(p * 100)} % · reste immobile`, bx + 100, by + 57, "600 11px 'DM Sans',sans-serif", "#b9b2ff", "left");
    x.restore();
  }
  function setOv(tx) {
    if (tx === ovT) return; ovT = tx; ov.textContent = tx;
    ov.style.fontSize = tx.length <= 6 ? "min(72px,14vw)" : "min(26px,5vw)";
  }
  const txt = (s, px, py, font, col, al = "center") => { x.font = font; x.fillStyle = col; x.textAlign = al; x.textBaseline = "middle"; x.fillText(s, px, py); };

  // ----- mini-jeux : chaque poste de tâche = un vrai petit jeu à réussir. Le client envoie « fini », l'hôte valide -----
  const MGX = 130, MGY = 64, MGW = 540, MGH = 400, MC = { R: "#ff5d5d", Y: "#ffd23f", B: "#4cc9f0", P: "#ff6b81", G: "#7ae582", V: "#b79bff", O: "#ff9f43" };
  const rnd1 = (a, b) => a + Math.random() * (b - a), cl01 = v => Math.max(0, Math.min(1, v));
  const shuf = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const inC = (p, cx, cy, r) => Math.hypot(p.x - cx, p.y - cy) < r, inR = (p, rx, ry, w, h) => p.x >= rx && p.x <= rx + w && p.y >= ry && p.y <= ry + h;
  const angd = d => Math.abs(((d + Math.PI) % 6.283185 + 6.283185) % 6.283185 - Math.PI);
  const mbtn = (lb, bx, by, w, h, col, on) => { x.fillStyle = on ? col : "rgba(255,255,255,.1)"; rr(x, bx, by, w, h, 10); x.fill(); x.lineWidth = 2; x.strokeStyle = col; x.stroke(); txt(lb, bx + w / 2, by + h / 2, "700 17px 'DM Sans',sans-serif", on ? "#10102a" : "#fff"); };
  const bigBtn = (cx, cy, r, lb, col, on) => { x.fillStyle = on ? col : "rgba(255,255,255,.1)"; x.beginPath(); x.arc(cx, cy, r, 0, 7); x.fill(); x.lineWidth = 4; x.strokeStyle = col; x.stroke(); txt(lb, cx, cy, "800 15px 'DM Sans',sans-serif", on ? "#10102a" : "#fff"); };
  const slider = (sx, sy, len, v, col) => { x.strokeStyle = "rgba(255,255,255,.25)"; x.lineWidth = 8; x.beginPath(); x.moveTo(sx, sy); x.lineTo(sx + len, sy); x.stroke(); x.strokeStyle = col; x.beginPath(); x.moveTo(sx, sy); x.lineTo(sx + len * v, sy); x.stroke(); x.fillStyle = "#fff"; x.beginPath(); x.arc(sx + len * v, sy, 13, 0, 7); x.fill(); x.lineWidth = 3; x.strokeStyle = col; x.stroke(); };
  const GAMES = {
    wires() {                                                             // Brancher les câbles : relier les couleurs
      const cols = [MC.R, MC.Y, MC.B, MC.P], rt = shuf([0, 1, 2, 3]), con = [0, 0, 0, 0]; let dr = null;
      const L = i => [90, 95 + i * 70], Rr = j => [450, 95 + j * 70];
      return {
        hint: "Relie chaque câble à la prise de la même couleur (glisse)",
        down(p) { dr = null; for (let i = 0; i < 4; i++) if (!con[i] && inC(p, ...L(i), 28)) dr = { i, x: p.x, y: p.y }; },
        move(p) { if (dr) { dr.x = p.x; dr.y = p.y; } },
        up(p) { if (!dr) return; for (let j = 0; j < 4; j++) if (inC(p, ...Rr(j), 32) && rt[j] === dr.i) { con[dr.i] = 1; beep(520, .05, "square", .04); } dr = null; },
        get ok() { return con.every(Boolean); },
        draw() {
          x.lineWidth = 9;
          for (let i = 0; i < 4; i++) if (con[i]) { const j = rt.indexOf(i), [lx, ly] = L(i), [rx, ry] = Rr(j); x.strokeStyle = cols[i]; x.beginPath(); x.moveTo(lx, ly); x.bezierCurveTo(lx + 140, ly, rx - 140, ry, rx, ry); x.stroke(); }
          if (dr) { const [lx, ly] = L(dr.i); x.strokeStyle = cols[dr.i]; x.beginPath(); x.moveTo(lx, ly); x.lineTo(dr.x, dr.y); x.stroke(); }
          for (let i = 0; i < 4; i++) { const [lx, ly] = L(i), [rx, ry] = Rr(i); x.fillStyle = cols[i]; x.beginPath(); x.arc(lx, ly, 17, 0, 7); x.fill(); x.fillStyle = cols[rt[i]]; x.beginPath(); x.arc(rx, ry, 17, 0, 7); x.fill(); x.lineWidth = 3; x.strokeStyle = "#0a0820"; x.stroke(); }
        }
      };
    },
    align() {                                                             // Aligner les moteurs : deux curseurs sur leur repère
      const mk = () => { const t = rnd1(.15, .85); let v = t + (Math.random() < .5 ? -1 : 1) * rnd1(.3, .5); if (v < .05 || v > .95) v = t > .5 ? t - .4 : t + .4; return { t, v, lk: 0 }; };
      const S = [mk(), mk()], X = [180, 360]; let dr = -1;
      return {
        hint: "Fais glisser chaque curseur jusqu'au repère jaune",
        down(p) { dr = -1; for (let i = 0; i < 2; i++) if (!S[i].lk && Math.abs(p.x - X[i]) < 36 && Math.abs(p.y - (90 + S[i].v * 240)) < 30) dr = i; },
        move(p) { if (dr < 0) return; const s = S[dr]; s.v = cl01((p.y - 90) / 240); if (Math.abs(s.v - s.t) < .02) { s.v = s.t; s.lk = 1; dr = -1; beep(560, .08, "sine", .05, 800); } },
        up() { dr = -1; },
        get ok() { return S[0].lk && S[1].lk; },
        draw() {
          S.forEach((s, i) => {
            x.strokeStyle = "rgba(255,255,255,.25)"; x.lineWidth = 10; x.beginPath(); x.moveTo(X[i], 90); x.lineTo(X[i], 330); x.stroke();
            const ty = 90 + s.t * 240; x.strokeStyle = MC.Y; x.lineWidth = 3; x.beginPath(); x.moveTo(X[i] - 34, ty); x.lineTo(X[i] + 34, ty); x.stroke();
            x.fillStyle = s.lk ? MC.G : "#fff"; x.beginPath(); x.arc(X[i], 90 + s.v * 240, 15, 0, 7); x.fill();
            txt(s.lk ? "✔ aligné" : `Moteur ${i + 1}`, X[i] + 80, 90 + s.t * 240, "700 13px 'DM Sans',sans-serif", s.lk ? MC.G : "#b9b2ff", "left");
          });
        }
      };
    },
    cool() {                                                              // Refroidir le réacteur : maintenir pour garder la zone verte
      let T = .95, got = 0, hold = false;
      return {
        hint: "Maintiens le bouton : garde la zone verte pendant 3 s",
        down(p) { if (inC(p, 400, 200, 62)) hold = true; }, move() { }, up() { hold = false; },
        get ok() { return got >= 3; },
        draw(dt) {
          T = cl01(T + (hold ? -.3 : .22) * dt); const inb = T > .28 && T < .52; if (inb) got += dt;
          const yy = v => 330 - (10 + v * 240);
          x.fillStyle = "rgba(122,229,130,.28)"; x.fillRect(112, yy(.52), 66, yy(.28) - yy(.52));
          x.strokeStyle = "#fff"; x.lineWidth = 3; rr(x, 125, 70, 40, 262, 18); x.stroke();
          x.fillStyle = `hsl(${210 - T * 210},85%,55%)`; rr(x, 129, 330 - (10 + T * 240), 32, 10 + T * 240, 12); x.fill();
          bigBtn(400, 200, 62, hold ? "REFROIDIT…" : "MAINTENIR", MC.B, hold);
          x.fillStyle = "rgba(255,255,255,.15)"; rr(x, 300, 300, 200, 14, 7); x.fill(); x.fillStyle = inb ? MC.G : MC.B; rr(x, 300, 300, Math.max(14, 200 * Math.min(1, got / 3)), 14, 7); x.fill();
        }
      };
    },
    fuel() {                                                              // Faire le plein : maintenir pour remplir le réservoir
      let F = 0, hold = false;
      return {
        hint: "Maintiens le bouton jusqu'à ce que le réservoir soit plein (ça fuit si tu lâches)",
        down(p) { if (inC(p, 400, 200, 62)) hold = true; }, move() { }, up() { hold = false; },
        get ok() { return F >= 1; },
        draw(dt) {
          F = cl01(F + (hold ? .26 : -.06) * dt);
          x.strokeStyle = "#fff"; x.lineWidth = 4; rr(x, 140, 80, 110, 250, 14); x.stroke();
          x.fillStyle = MC.O; x.globalAlpha = .85; x.fillRect(144, 326 - 242 * F, 102, 242 * F); x.globalAlpha = 1;
          txt(`${Math.round(F * 100)} %`, 195, 205, "800 24px 'Bricolage Grotesque',sans-serif", "#fff");
          bigBtn(400, 200, 62, hold ? "REMPLIT…" : "MAINTENIR", MC.O, hold);
        }
      };
    },
    crate() {                                                             // Trier les caisses : glisser chaque caisse dans le bon bac
      const cl = [MC.O, MC.B, MC.V], nm = ["orange", "bleu", "violet"], BX = [30, 205, 380];
      const items = shuf([0, 0, 1, 1, 2, 2]).map((c, i) => { const px = 95 + (i % 3) * 175, py = 95 + Math.floor(i / 3) * 70; return { c, x: px, y: py, hx: px, hy: py, done: 0 }; });
      let dr = null;
      return {
        hint: "Glisse chaque caisse dans le bac de sa couleur",
        down(p) { dr = null; for (let i = items.length - 1; i >= 0; i--) { const o = items[i]; if (!o.done && Math.abs(p.x - o.x) < 30 && Math.abs(p.y - o.y) < 26) { dr = o; break; } } },
        move(p) { if (dr) { dr.x = p.x; dr.y = p.y; } },
        up() { if (!dr) return; const b = BX.findIndex(bx => inR({ x: dr.x, y: dr.y }, bx, 245, 130, 90)); if (b === dr.c) { const n = items.filter(o => o.done && o.c === b).length; dr.done = 1; dr.x = BX[b] + 38 + n * 54; dr.y = 300; beep(480, .06, "square", .04); } else { dr.x = dr.hx; dr.y = dr.hy; } dr = null; },
        get ok() { return items.every(o => o.done); },
        draw() {
          BX.forEach((bx, i) => { x.strokeStyle = cl[i]; x.lineWidth = 3; x.fillStyle = "rgba(255,255,255,.06)"; rr(x, bx, 245, 130, 90, 10); x.fill(); x.stroke(); txt(`Bac ${nm[i]}`, bx + 65, 262, "700 12px 'DM Sans',sans-serif", cl[i]); });
          items.forEach(o => { x.fillStyle = cl[o.c]; x.globalAlpha = .9; rr(x, o.x - 25, o.y - 20, 50, 40, 6); x.fill(); x.globalAlpha = 1; x.strokeStyle = "#0a0820"; x.lineWidth = 2; x.stroke(); x.beginPath(); x.moveTo(o.x - 25, o.y - 20); x.lineTo(o.x + 25, o.y + 20); x.stroke(); });
        }
      };
    },
    scan() {                                                              // Scanner médical : taper le code du patient
      const code = Array.from({ length: 5 }, () => 1 + Math.floor(Math.random() * 9)).join(""); let inp = "", bad = 0, fin = false;
      const press = d => { if (fin) return; if (code[inp.length] === d) { inp += d; beep(500 + inp.length * 60, .05, "square", .04); if (inp.length === code.length) fin = true; } else { inp = ""; bad = 1; beep(150, .15, "sawtooth", .05); } };
      return {
        hint: "Saisis le code du patient (boutons ou clavier)",
        down(p) { for (let i = 0; i < 9; i++) if (inR(p, 330 + (i % 3) * 66, 90 + Math.floor(i / 3) * 66, 58, 58)) press(String(i + 1)); },
        key(k) { if (/^[1-9]$/.test(k)) press(k); },
        get ok() { return fin; },
        draw(dt) {
          bad = Math.max(0, bad - dt * 2);
          txt("Code patient", 170, 90, "700 14px 'DM Sans',sans-serif", "#b9b2ff");
          txt(code.split("").join(" "), 170, 130, "800 34px 'Bricolage Grotesque',sans-serif", MC.Y);
          txt("Ta saisie", 170, 200, "700 14px 'DM Sans',sans-serif", "#b9b2ff");
          for (let i = 0; i < 5; i++) { x.fillStyle = bad > 0 ? "rgba(255,59,92,.4)" : "rgba(255,255,255,.1)"; rr(x, 76 + i * 34, 220, 30, 40, 6); x.fill(); if (inp[i]) txt(inp[i], 91 + i * 34, 241, "800 22px 'DM Sans',sans-serif", MC.G); }
          for (let i = 0; i < 9; i++) mbtn(String(i + 1), 330 + (i % 3) * 66, 90 + Math.floor(i / 3) * 66, 58, 58, MC.B, false);
        }
      };
    },
    dl() {                                                                // Télécharger les plans : cliquer les fichiers dans l'ordre
      const N = shuf([1, 2, 3, 4, 5, 6, 7, 8, 9]); let nx = 1, bad = -1, bt = 0;
      const T = i => [135 + (i % 3) * 94, 80 + Math.floor(i / 3) * 84];
      return {
        hint: "Clique les fichiers dans l'ordre : 1, 2, 3 … 9",
        down(p) { for (let i = 0; i < 9; i++) { const [tx, ty] = T(i); if (N[i] >= nx && inR(p, tx, ty, 84, 74)) { if (N[i] === nx) { nx++; beep(400 + nx * 40, .05, "square", .04); } else { bad = i; bt = .4; beep(150, .1, "sawtooth", .05); } } } },
        get ok() { return nx > 9; },
        draw(dt) {
          bt = Math.max(0, bt - dt);
          for (let i = 0; i < 9; i++) { const [tx, ty] = T(i), d = N[i] < nx, b = bt > 0 && bad === i; x.fillStyle = d ? "rgba(122,229,130,.25)" : b ? "rgba(255,59,92,.5)" : "rgba(76,201,240,.22)"; rr(x, tx, ty, 84, 74, 10); x.fill(); x.lineWidth = 2; x.strokeStyle = d ? MC.G : b ? "#ff3b5c" : MC.B; x.stroke(); txt(d ? "✔" : String(N[i]), tx + 42, ty + 37, "800 28px 'Bricolage Grotesque',sans-serif", d ? MC.G : "#fff"); }
        }
      };
    },
    calib() {                                                             // Calibrer le détecteur : faire coller l'onde à la cible
      const tg = [rnd1(.2, .85), rnd1(.2, .85)], v = [tg[0] > .5 ? .1 : .9, tg[1] > .5 ? .1 : .9], YS = [292, 326]; let dr = -1, hold = 0;
      const wy = (a, f, px) => 150 + Math.sin(px * (.03 + f * .07)) * (12 + a * 55);
      return {
        hint: "Règle l'amplitude et la fréquence pour que l'onde bleue colle à la jaune",
        down(p) { dr = -1; for (let i = 0; i < 2; i++) if (Math.abs(p.y - YS[i]) < 22 && p.x > 60 && p.x < 480) { dr = i; v[i] = cl01((p.x - 90) / 360); } },
        move(p) { if (dr >= 0) v[dr] = cl01((p.x - 90) / 360); }, up() { dr = -1; },
        get ok() { return hold >= .8; },
        draw(dt) {
          const m = Math.abs(v[0] - tg[0]) < .05 && Math.abs(v[1] - tg[1]) < .05; hold = m ? hold + dt : 0;
          x.fillStyle = "rgba(0,0,0,.35)"; rr(x, 40, 70, 460, 160, 10); x.fill();
          x.lineWidth = 3; x.setLineDash([6, 6]); x.strokeStyle = MC.Y; x.beginPath(); for (let px = 44; px <= 496; px += 3) px === 44 ? x.moveTo(px, wy(tg[0], tg[1], px)) : x.lineTo(px, wy(tg[0], tg[1], px)); x.stroke(); x.setLineDash([]);
          x.strokeStyle = m ? MC.G : MC.B; x.lineWidth = 4; x.beginPath(); for (let px = 44; px <= 496; px += 3) px === 44 ? x.moveTo(px, wy(v[0], v[1], px)) : x.lineTo(px, wy(v[0], v[1], px)); x.stroke();
          txt("Amplitude", 50, YS[0] - 20, "600 12px 'DM Sans',sans-serif", "#b9b2ff", "left"); txt("Fréquence", 50, YS[1] - 20, "600 12px 'DM Sans',sans-serif", "#b9b2ff", "left");
          slider(90, YS[0], 360, v[0], MC.B); slider(90, YS[1], 360, v[1], MC.B);
        }
      };
    },
    purge() {                                                             // Purger le circuit : ouvrir 3 vannes puis tirer le levier
      const val = [0, 0, 0]; let lv = 0, dr = false, fin = false;
      return {
        hint: "Ouvre les 3 vannes (clic), puis tire le levier jusqu'en bas",
        down(p) { for (let i = 0; i < 3; i++) if (!val[i] && inC(p, 130, 110 + i * 85, 34)) { val[i] = 1; beep(380, .08, "triangle", .05); } if (val.every(Boolean) && !fin && Math.abs(p.x - 400) < 44 && Math.abs(p.y - (90 + lv * 230)) < 36) dr = true; },
        move(p) { if (dr) { lv = cl01((p.y - 90) / 230); if (lv >= .97) { lv = 1; fin = true; dr = false; } } }, up() { dr = false; },
        get ok() { return fin; },
        draw(dt) {
          if (!dr && !fin) lv = Math.max(0, lv - 1.3 * dt);
          for (let i = 0; i < 3; i++) { const vy = 110 + i * 85; x.fillStyle = val[i] ? "rgba(122,229,130,.3)" : "rgba(255,59,92,.25)"; x.beginPath(); x.arc(130, vy, 34, 0, 7); x.fill(); x.strokeStyle = val[i] ? MC.G : "#ff6b81"; x.lineWidth = 4; x.stroke(); x.save(); x.translate(130, vy); x.rotate(val[i] ? 1.57 : 0); x.beginPath(); x.moveTo(-20, 0); x.lineTo(20, 0); x.moveTo(0, -20); x.lineTo(0, 20); x.stroke(); x.restore(); txt(val[i] ? "ouverte" : "fermée", 200, vy, "600 12px 'DM Sans',sans-serif", val[i] ? MC.G : "#ff8fa3", "left"); }
          x.strokeStyle = "rgba(255,255,255,.25)"; x.lineWidth = 14; x.beginPath(); x.moveTo(400, 90); x.lineTo(400, 320); x.stroke();
          const lk = val.every(Boolean); x.fillStyle = fin ? MC.G : lk ? MC.Y : "#666"; x.beginPath(); x.arc(400, 90 + lv * 230, 26, 0, 7); x.fill(); x.lineWidth = 3; x.strokeStyle = "#fff"; x.stroke();
          txt(lk ? "⬇" : "🔒", 400, 90 + lv * 230, "700 18px 'DM Sans',sans-serif", "#10102a");
        }
      };
    },
    trash() {                                                             // Vider les déchets : ramasser tous les déchets
      const EM = ["🍌", "📦", "🥫", "🧦", "🍎", "🧻", "🥤", "🦴"];
      const it = EM.map((e, i) => ({ e, x: 80 + (i % 4) * 125 + rnd1(-18, 18), y: 110 + Math.floor(i / 4) * 120 + rnd1(-14, 14), r: rnd1(-.5, .5), d: 0 }));
      return {
        hint: "Clique sur chaque déchet pour l'évacuer",
        down(p) { for (const o of it) if (!o.d && inC(p, o.x, o.y, 34)) { o.d = 1; beep(300 + Math.random() * 200, .05, "triangle", .05); break; } },
        get ok() { return it.every(o => o.d); },
        draw() {
          x.strokeStyle = "rgba(255,255,255,.3)"; x.lineWidth = 3; rr(x, 40, 280, 460, 60, 10); x.stroke(); txt(`${it.filter(o => o.d).length}/${it.length} évacués`, 270, 310, "700 15px 'DM Sans',sans-serif", MC.Y);
          it.forEach(o => { if (o.d) return; x.save(); x.translate(o.x, o.y); x.rotate(o.r); txt(o.e, 0, 0, "46px sans-serif", "#fff"); x.restore(); });
        }
      };
    },
    shield() {                                                            // Activer le bouclier : allumer tous les panneaux rouges
      const P = [[270, 195], [270, 112], [345, 153], [345, 237], [270, 278], [195, 237], [195, 153]], st = P.map(() => Math.random() < .35 ? 1 : 0); if (st.every(Boolean)) st[0] = 0;
      return {
        hint: "Clique sur tous les panneaux rouges pour les activer",
        down(p) { P.forEach((c, i) => { if (!st[i] && inC(p, c[0], c[1], 38)) { st[i] = 1; beep(420 + i * 40, .06, "sine", .05); } }); },
        get ok() { return st.every(Boolean); },
        draw() {
          P.forEach((c, i) => { x.beginPath(); for (let k = 0; k < 6; k++) { const an = k * 1.0472 - 1.5708; x.lineTo(c[0] + Math.cos(an) * 38, c[1] + Math.sin(an) * 38); } x.closePath(); x.fillStyle = st[i] ? "rgba(76,201,240,.6)" : "rgba(255,59,92,.6)"; x.fill(); x.lineWidth = 3; x.strokeStyle = st[i] ? MC.B : "#ff3b5c"; x.stroke(); });
        }
      };
    },
    up() {                                                                // Envoyer les données : répéter la séquence de lumières
      const seq = Array.from({ length: 4 }, () => Math.floor(Math.random() * 4)), pc = [MC.R, MC.G, MC.B, MC.Y], PX = i => [170 + (i % 2) * 110, 85 + Math.floor(i / 2) * 110];
      let mode = 0, t0 = 0, pos = 0, lit = -1, lt = 0, fin = false, msg = "Regarde la séquence…";
      return {
        hint: "Mémorise la séquence puis répète-la",
        down(p) { if (mode !== 1 || fin) return; for (let i = 0; i < 4; i++) { const [px, py] = PX(i); if (inR(p, px, py, 100, 100)) { lit = i; lt = .25; beep(300 + i * 100, .12, "sine", .05); if (i === seq[pos]) { pos++; if (pos === seq.length) fin = true; } else { mode = 0; t0 = 0; pos = 0; msg = "Raté : regarde encore la séquence…"; } } } },
        get ok() { return fin; },
        draw(dt, now) {
          if (mode === 0) { if (!t0) t0 = now; const e = now - t0 - 700; if (e < 0) lit = -1; else { const idx = Math.floor(e / 800); if (idx >= seq.length) { mode = 1; lit = -1; msg = "À toi !"; } else lit = e % 800 < 550 ? seq[idx] : -1; } }
          else { lt -= dt; if (lt <= 0) lit = -1; }
          for (let i = 0; i < 4; i++) { const [px, py] = PX(i); x.fillStyle = pc[i]; x.globalAlpha = lit === i ? 1 : .28; rr(x, px, py, 100, 100, 14); x.fill(); x.globalAlpha = 1; }
          txt(msg, 270, 62, "700 15px 'DM Sans',sans-serif", "#ffe9a8"); txt(`${pos}/${seq.length}`, 270, 322, "700 14px 'DM Sans',sans-serif", "#b9b2ff");
        }
      };
    },
    sample() {                                                            // Analyser un échantillon : repérer le tube différent (2 fois)
      let round = 0, odd = 0, cols = [], bad = 0, h = 0;
      const gen = () => { h = rnd1(0, 360); odd = Math.floor(Math.random() * 5); cols = Array.from({ length: 5 }, (_, i) => `hsl(${i === odd ? (h + 70) % 360 : h},72%,55%)`); }; gen();
      return {
        hint: "Un échantillon est contaminé : clique sur le tube différent (2 fois)",
        down(p) { for (let i = 0; i < 5; i++) if (inR(p, 95 + i * 80, 90, 56, 210)) { if (i === odd) { round++; if (round < 2) gen(); beep(600, .08, "sine", .05, 900); } else { gen(); bad = .8; beep(150, .15, "sawtooth", .05); } } },
        get ok() { return round >= 2; },
        draw(dt) {
          bad = Math.max(0, bad - dt);
          for (let i = 0; i < 5; i++) { const tx = 95 + i * 80; x.fillStyle = "rgba(255,255,255,.08)"; rr(x, tx, 90, 56, 210, 22); x.fill(); x.fillStyle = cols[i]; rr(x, tx + 5, 150, 46, 145, 18); x.fill(); x.strokeStyle = "#fff"; x.lineWidth = 3; rr(x, tx, 90, 56, 210, 22); x.stroke(); }
          txt(bad > 0 ? "Mauvais tube ! Nouvel échantillon…" : `Analyse ${Math.min(round + 1, 2)}/2`, 270, 66, "700 15px 'DM Sans',sans-serif", bad > 0 ? "#ff6b81" : "#ffe9a8");
        }
      };
    },
    ant() {                                                               // Orienter l'antenne : trouver le meilleur signal en tournant le cadran
      const tg = rnd1(-3, 3); let a = tg + Math.PI * .8 * (Math.random() < .5 ? 1 : -1), dr = false, hold = 0;
      const set = p => { a = Math.atan2(p.y - 190, p.x - 190); };
      return {
        hint: "Tourne le cadran (glisse) jusqu'à avoir le signal maximum, puis tiens",
        down(p) { dr = true; set(p); }, move(p) { if (dr) set(p); }, up() { dr = false; },
        get ok() { return hold >= 1; },
        draw(dt) {
          const d = angd(a - tg), s = Math.pow(1 - d / Math.PI, 3), m = d < .13; hold = m ? hold + dt : 0;
          x.strokeStyle = "rgba(255,255,255,.3)"; x.lineWidth = 6; x.beginPath(); x.arc(190, 190, 100, 0, 7); x.stroke();
          for (let i = 0; i < 24; i++) { const an = i * .2618; x.lineWidth = 2; x.beginPath(); x.moveTo(190 + Math.cos(an) * 100, 190 + Math.sin(an) * 100); x.lineTo(190 + Math.cos(an) * 90, 190 + Math.sin(an) * 90); x.stroke(); }
          x.strokeStyle = m ? MC.G : MC.Y; x.lineWidth = 7; x.beginPath(); x.moveTo(190, 190); x.lineTo(190 + Math.cos(a) * 100, 190 + Math.sin(a) * 100); x.stroke(); x.fillStyle = m ? MC.G : MC.Y; x.beginPath(); x.arc(190 + Math.cos(a) * 100, 190 + Math.sin(a) * 100, 13, 0, 7); x.fill(); x.beginPath(); x.arc(190, 190, 10, 0, 7); x.fill();
          for (let i = 0; i < 8; i++) { x.fillStyle = s * 8 > i ? (i > 5 ? MC.G : i > 2 ? MC.Y : "#ff6b81") : "rgba(255,255,255,.12)"; rr(x, 360, 290 - i * 28, 80, 22, 5); x.fill(); }
          txt("Signal", 400, 78, "700 14px 'DM Sans',sans-serif", "#b9b2ff"); txt(`${Math.round(s * 100)} %`, 400, 305, "800 18px 'DM Sans',sans-serif", "#fff");
          if (m) { x.fillStyle = "rgba(255,255,255,.15)"; rr(x, 120, 318, 140, 10, 5); x.fill(); x.fillStyle = MC.G; rr(x, 120, 318, Math.max(8, 140 * Math.min(1, hold)), 10, 5); x.fill(); }
        }
      };
    }
  };
  const mgNew = (k, now) => ({ k, t0: now, lt: now, g: GAMES[KIND[k]](), fin: 0, drag: null });
  const mgCancel = () => { if (!mg) return; mg = null; mgDis = true; cancelSeq++; sendInput(performance.now(), true); };
  const mgDraw = now => {
    const m = mg, c = TCOL[m.k], dt = Math.min(.05, (now - m.lt) / 1000); m.lt = now;
    x.fillStyle = "rgba(4,3,14,.72)"; x.fillRect(0, 0, W, H);
    x.save(); x.translate(MGX, MGY);
    x.fillStyle = "#14123a"; rr(x, 0, 0, MGW, MGH, 16); x.fill(); x.lineWidth = 3; x.strokeStyle = c; x.stroke();
    txt(ST[m.k][2], MGW / 2, 24, "800 20px 'Bricolage Grotesque',sans-serif", "#fff");
    x.fillStyle = "rgba(255,255,255,.12)"; rr(x, MGW - 40, 8, 30, 30, 8); x.fill(); txt("✕", MGW - 25, 23, "700 16px 'DM Sans',sans-serif", "#fff");
    x.save(); x.beginPath(); x.rect(0, 44, MGW, MGH - 90); x.clip(); x.lineCap = "round"; x.lineJoin = "round"; m.g.draw(dt, now); x.restore();
    txt(m.g.hint, MGW / 2, MGH - 22, "600 13px 'DM Sans',sans-serif", "#b9b2ff");
    if (!m.fin && m.g.ok) { m.fin = now; beep(660, .12, "sine", .05, 990); }
    if (m.fin) { x.fillStyle = "rgba(10,60,50,.72)"; rr(x, 0, 0, MGW, MGH, 16); x.fill(); txt("✔ Tâche terminée !", MGW / 2, MGH / 2, "800 30px 'Bricolage Grotesque',sans-serif", "#7dffd9"); }
    x.restore();
    if (m.fin && now - m.fin > 750) { mg = null; mgDis = true; doneSeq++; sendInput(performance.now(), true); }
  };

  function useInfo(s) {
    const q = s.p[myIdx]; if (!q) return ["UTILISER", 1];
    if (q[6]) return ["EN CONDUIT", 1];
    if (q[2]) { if (s.bd.some(b => Math.hypot(b[0] - q[0], b[1] - q[1]) < 72)) return ["SIGNALER", 0]; if (Math.hypot(q[0] - TB[0], q[1] - TB[1]) < 50) return ["URGENCE", 0];
      if (!isImp() && s.sb) { if (s.sb[0] === 0 && Math.hypot(q[0] - LP[0], q[1] - LP[1]) < 44) return ["RÉPARER", 0]; if (s.sb[0] === 1) for (let k = 0; k < 2; k++) if (!(s.sb[2] >> k & 1) && Math.hypot(q[0] - RP[k][0], q[1] - RP[k][1]) < 44) return ["RÉPARER", 0]; if (s.sb[0] === 2) { const d = DOORS.find(z => z.id === s.sb[2]); if (d && Math.hypot(q[0] - d.x - d.w / 2, q[1] - d.y - d.h / 2) < 62) return ["OUVRIR", 0]; } }
      if (Math.hypot(q[0] - CAMP[0], q[1] - CAMP[1]) < 44) return [s.cm && s.cm.includes(myIdx) ? "QUITTER" : "CAMÉRAS", 0]; }
    const tk = s.ts[myIdx] || [0, 0];
    for (let k = 0; k < ST.length; k++) if ((tk[0] >> k & 1) && !(tk[1] >> k & 1) && Math.hypot(q[0] - ST[k][0], q[1] - ST[k][1]) < 42) return ["TÂCHE", 0];
    return ["UTILISER", 1];
  }

  function cutscene(rsl, el) {                                            // éjection : le joueur file dans l'espace, le verdict apparaît ensuite
    x.fillStyle = "#03020a"; x.fillRect(0, 0, W, H);
    const t = el / 1000;
    for (let i = 0; i < 70; i++) { const sp = 140 + (i % 5) * 90, sx = (((i * 97.3 - t * sp) % W) + W) % W, sy = (i * 53.9) % H; x.globalAlpha = .3 + (i % 4) * .15; x.fillStyle = "#e8ecff"; x.fillRect(sx, sy, 1 + (i % 3), 1 + (i % 2)); }
    x.globalAlpha = 1;
    const ej = rsl.ej >= 0 ? pl[rsl.ej] : null;
    if (ej) {
      const px = -50 + (W + 100) * Math.min(1, t / 3.4), py = H / 2 + 20 + Math.sin(t * 2) * 16;
      x.save(); x.translate(px, py); x.rotate(t * 3.5); x.scale(2.4, 2.4); bean(0, 0, ej[2], 1, 1, false, false); x.restore();
      const msg = `${ej[1]} a été éjecté(e).`; txt(msg.slice(0, Math.min(msg.length, Math.floor(t * 18))), CX, 70, "800 28px 'Bricolage Grotesque',sans-serif", "#fff");
      x.globalAlpha = Math.max(0, Math.min(1, (t - 2) / .5)); txt(rsl.ei ? "C'était un imposteur ! 🎉" : "Ce n'était PAS un imposteur… 😬", CX, 112, "700 20px 'DM Sans',sans-serif", rsl.ei ? "#3ee6c4" : "#ff3b5c");
      x.globalAlpha = Math.max(0, Math.min(1, (t - 2.6) / .5)); txt(`Il reste ${rsl.ir} imposteur${rsl.ir > 1 ? "s" : ""}`, CX, 144, "600 16px 'DM Sans',sans-serif", "#b9b2ff"); x.globalAlpha = 1;
    } else {
      x.globalAlpha = Math.min(1, t / .6); txt("Personne n'a été éjecté.", CX, H / 2 - 14, "800 30px 'Bricolage Grotesque',sans-serif", "#fff");
      txt("Égalité ou majorité de « passer »", CX, H / 2 + 24, "700 18px 'DM Sans',sans-serif", "#ffe9a8"); x.globalAlpha = 1;
    }
  }
  function meeting(s, now) {
    x.fillStyle = "#08061a"; x.fillRect(0, 0, W, H); rects = [];
    const res = s.ph === "r", m = s.mt, rsl = s.rs, mine = s.p[myIdx] && s.p[myIdx][2];
    if (res && now - rStart < 3800) return cutscene(rsl, now - rStart);
    const bgG = x.createRadialGradient(CX, 60, 20, CX, 260, 520); bgG.addColorStop(0, "rgba(70,55,150,.5)"); bgG.addColorStop(1, "rgba(8,6,26,0)"); x.fillStyle = bgG; x.fillRect(0, 0, W, H);
    for (let i = 0; i < 26; i++) { const sx = (i * 137.5 + now * (.006 + (i % 4) * .004)) % W, sy = (i * 71.3) % H; x.globalAlpha = .12 + (i % 5) * .05; x.fillStyle = "#cfd6ff"; x.fillRect(sx, sy, 2, 2); }
    x.globalAlpha = 1;
    if (res) {
      const ej = rsl.ej >= 0 ? pl[rsl.ej] : null;
      txt(ej ? `${ej[1]} a été éjecté(e).` : "Personne n'a été éjecté.", CX, 40, "800 28px 'Bricolage Grotesque',sans-serif", "#fff");
      txt(ej ? (rsl.ei ? "C'était un imposteur ! 🎉" : "Ce n'était PAS un imposteur… 😬") : "Égalité ou majorité de « passer »", CX, 74, "700 18px 'DM Sans',sans-serif", ej ? (rsl.ei ? "#3ee6c4" : "#ff3b5c") : "#ffe9a8");
      txt(`Il reste ${rsl.ir} imposteur${rsl.ir > 1 ? "s" : ""}`, CX, 98, "600 15px 'DM Sans',sans-serif", "#b9b2ff");
    } else {
      mMax = Math.max(mMax, m.r);
      x.fillStyle = "rgba(255,255,255,.1)"; x.fillRect(0, 0, W, 6); x.fillStyle = m.r <= 8 ? "#ff3b5c" : "#7c6cff"; x.fillRect(0, 0, W * Math.max(0, m.r) / Math.max(1, mMax), 6);   // barre de temps
      if (m.r <= 5 && m.r !== lastTick) { lastTick = m.r; beep(880, .05, "square", .03); }
      const alive = s.p.filter(q => q[2]).length, voted = m.v.filter((v, i) => v && s.p[i] && s.p[i][2]).length;
      txt(m.b ? `📢 ${pl[m.c][1]} a trouvé un corps !` : `🚨 Réunion d'urgence : ${pl[m.c][1]}`, CX, 36, "800 26px 'Bricolage Grotesque',sans-serif", "#fff");
      txt(mine ? "Qui est l'imposteur ? Discutez, puis votez." : "👻 Les morts ne votent pas", CX, 70, "700 17px 'DM Sans',sans-serif", "#ffe9a8");
      txt(`${m.r} s`, 760, 36, "800 24px 'Bricolage Grotesque',sans-serif", m.r <= 8 ? "#ff3b5c" : "#9b8cff");
      txt(`🗳 ${voted}/${alive} ont voté`, CX, 96, "600 14px 'DM Sans',sans-serif", voted === alive ? "#3ee6c4" : "#b9b2ff");
    }
    s.p.forEach((q, i) => {
      const col = i < 5 ? 0 : 1, rx = 50 + col * 370, ry = 118 + (i % 5) * 56, al = q[2] ? 1 : .4;
      const sel = vote === `${mid}_${i}`, win = res && rsl.ej === i;
      x.globalAlpha = al; x.fillStyle = win ? "#5a2440" : sel ? "#4a3f95" : "#241f52"; rr(x, rx, ry, 330, 48, 12); x.fill();
      x.lineWidth = sel || win ? 3 : 1.5; x.strokeStyle = win ? "#ff3b5c" : sel ? "#ffd23f" : "#4b4590"; x.stroke();
      bean(rx + 26, ry + 26, pl[i][2], 1, 1);
      if (!res && i === m.c) txt("📢", rx + 8, ry + 9, "700 13px 'DM Sans',sans-serif", "#fff");
      txt(pl[i][1] + (i === myIdx ? " (toi)" : "") + (q[2] ? "" : " ✖"), rx + 54, ry + 24, "700 16px 'DM Sans',sans-serif", ls.ro[i] === "1" && isImp() ? "#ff6b81" : "#fff", "left");
      if (!res && m.v[i]) txt("✔ a voté", rx + 322, ry + 24, "600 13px 'DM Sans',sans-serif", "#3ee6c4", "right");
      if (res) txt(`🗳 ${rsl.vc[i]}`, rx + 322, ry + 24, "800 18px 'DM Sans',sans-serif", rsl.ej === i ? "#ff3b5c" : "#ffe9a8", "right");
      if (res && rsl.vt) { let k = 0; rsl.vt.forEach((v, vi) => { if (v === i && pl[vi]) { x.fillStyle = pl[vi][2]; x.strokeStyle = "rgba(0,0,0,.6)"; x.lineWidth = 1.5; x.beginPath(); x.arc(rx + 262 - k++ * 14, ry + 24, 6, 0, 7); x.fill(); x.stroke(); } }); }
      x.globalAlpha = 1;
      if (!res && mine && q[2]) rects.push({ x: rx, y: ry, w: 330, h: 48, t: i });
    });
    const sk = vote === `${mid}_99`;
    x.fillStyle = sk ? "#4a3f95" : "#241f52"; rr(x, 270, 420, 260, 46, 14); x.fill(); x.lineWidth = sk ? 3 : 1.5; x.strokeStyle = sk ? "#ffd23f" : "#4b4590"; x.stroke();
    txt(res ? `⏭ Passer : ${rsl.vc[rsl.vc.length - 1]}` : "⏭ Passer (ne pas voter)", CX, 443, "700 16px 'DM Sans',sans-serif", "#fff");
    if (res && rsl.vt) { let k = 0; rsl.vt.forEach((v, vi) => { if (v === rsl.vc.length - 1 && pl[vi]) { x.fillStyle = pl[vi][2]; x.strokeStyle = "rgba(0,0,0,.6)"; x.lineWidth = 1.5; x.beginPath(); x.arc(518 - k++ * 12, 443, 5, 0, 7); x.fill(); x.stroke(); } }); }
    if (!res && mine) rects.push({ x: 270, y: 420, w: 260, h: 46, t: 99 });
    const el = (now - mStart) / 1000;                                     // annonce qui claque au début de la réunion
    if (!res && el < 1.5) { const k2 = el < .25 ? 2.2 - el / .25 * 1.2 : 1; x.save(); x.globalAlpha = Math.max(0, el > 1.1 ? (1.5 - el) / .4 : 1); x.fillStyle = "rgba(8,6,24,.7)"; x.fillRect(0, H / 2 - 70, W, 140); x.translate(CX, H / 2); x.scale(k2, k2); txt(m.b ? "CORPS SIGNALÉ" : "RÉUNION D'URGENCE", 0, 0, "800 44px 'Bricolage Grotesque',sans-serif", m.b ? "#ff3b5c" : "#ffd23f"); x.restore(); }
  }
  const CX = 400;

  function frame(now) {
    if (!active) { raf = 0; return; }
    raf = requestAnimationFrame(frame);
    const dt = Math.min(.05, (now - (tPrev || now)) / 1000); tPrev = now; tNow = now;
    sendInput(now);
    x.setTransform(cv.width / W, 0, 0, cv.height / H, 0, 0);
    x.fillStyle = "#04030d"; x.fillRect(0, 0, W, H);
    const sm = sample(now - 110); if (!sm) return setOv("");
    const { a, b, f } = sm; ls = snaps[snaps.length - 1].s; const sa = a.s, sb = b.s;
    snaps.forEach(sn => { if (!sn.done && sn.at <= now - 110) { sn.done = true; (sn.s.ev || []).forEach(onEv); } });
    if (!pl) return;
    if (ls.ph !== lastPh) { if (ls.ph === "m") { mStart = now; mMax = 0; lastTick = -1; } else if (ls.ph === "r") rStart = now; if (ls.ph !== "p") bigMap = false; lastPh = ls.ph; }
    if (ls.mt) mid = ls.mt.id;
    const me = sa.p[myIdx], ghost = !!me && !me[2], imp = isImp();
    const pos = sa.p.map((qa, i) => { const qb = sb.p[i]; return qb && qa[2] && qb[2] ? [qa[0] + (qb[0] - qa[0]) * f, qa[1] + (qb[1] - qa[1]) * f] : [qa[0], qa[1]]; });
    const mvg = sa.p.map((qa, i) => { const qb = sb.p[i]; return !!qb && Math.hypot(qb[0] - qa[0], qb[1] - qa[1]) > .5; });   // en train de marcher ? (animation des jambes)
    const mp = pos[myIdx] || [TB[0], TB[1]], cam = !!ls.cm && ls.cm.includes(myIdx), dark = !!ls.sb && ls.sb[0] === 0 && !imp, VV = dark ? 85 : VIS;
    mpL = mp; ghL = ghost;
    const vis = (px, py) => ghost || (cam && inCam(px, py)) || (Math.hypot(px - mp[0], py - mp[1]) < VV && los(mp[0], mp[1], px, py));   // pas de vision à travers les murs (les fantômes voient tout)

    // caméra : suit le joueur ; aux caméras de surveillance on dézoome sur toute la carte
    const zt = cam && ls.ph === "p" ? W / WW : 1;
    zm += (zt - zm) * Math.min(1, dt * 7); if (Math.abs(zt - zm) < .003) zm = zt;
    const tx = zt < 1 ? WW / 2 : mp[0], ty = zt < 1 ? WH / 2 : mp[1];
    if (!camOn) { camCX = tx; camCY = ty; camOn = true; } else { const kk = Math.min(1, dt * 9); camCX += (tx - camCX) * kk; camCY += (ty - camCY) * kk; }
    const vw = W / zm, vh = H / zm, camX = Math.max(0, Math.min(WW - vw, camCX - vw / 2)), camY = Math.max(0, Math.min(WH - vh, camCY - vh / 2));
    x.save(); x.scale(zm, zm); x.translate(-camX, -camY);
    x.drawImage(background(), camX, camY, vw, vh, camX, camY, vw, vh);

    const tk = ls.ts[myIdx] || [0, 0];
    if (vis(TB[0], TB[1])) { const pu = .5 + .5 * Math.sin(now / 420), eg = x.createRadialGradient(TB[0], TB[1], 8, TB[0], TB[1], 48); eg.addColorStop(0, `rgba(255,59,92,${.28 * pu})`); eg.addColorStop(1, "rgba(255,59,92,0)"); x.fillStyle = eg; x.fillRect(TB[0] - 48, TB[1] - 48, 96, 96); }   // bouton d'urgence qui pulse
    (ls.bd || []).forEach(bd => { if (vis(bd[0], bd[1]) && pl[bd[2]]) corpse(bd[0], bd[1], pl[bd[2]][2]); });

    // joueurs : les vivants ne voient que ce qui est proche ; les fantômes voient tout (et les autres fantômes)
    let tgt = -1, td = KR;
    if (imp && !ghost && ls.ph === "p") ls.p.forEach((q, i) => { if (i !== myIdx && q[2] && ls.ro[i] !== "1") { const d = Math.hypot(pos[i][0] - mp[0], pos[i][1] - mp[1]); if (d < td) { td = d; tgt = i; } } });
    const order = pos.map((p, i) => i).filter(i => sa.p[i][2] || ghost).sort((i, j) => pos[i][1] - pos[j][1]);
    order.forEach(i => {
      const qa = sa.p[i], p = pos[i]; if (!pl[i] || (i !== myIdx && (!vis(p[0], p[1]) || (qa[6] && !imp && !ghost)))) return;   // un imposteur en conduit est invisible
      if (i === tgt) { x.strokeStyle = "#ff3b5c"; x.lineWidth = 3; x.beginPath(); x.arc(p[0], p[1], BR + 8, 0, 7); x.stroke(); }
      const gh = !qa[2];
      if (mvg[i] && !gh && now - (dustT[i] || 0) > 110 && parts.length < 150) { dustT[i] = now; parts.push({ x: p[0] - (qa[3] || 1) * 6, y: p[1] + BR, vx: (Math.random() - .5) * 14, vy: -8 - Math.random() * 8, l: .6, c: "rgba(190,185,255,.55)", s: 2.4 }); }
      bean(p[0], p[1], pl[i][2], qa[3] || 1, qa[6] ? .45 : 1, !gh && mvg[i], gh);
      const me2 = i === myIdx, red = ls.ro[i] === "1" && (imp || ls.o);
      x.font = "700 13px 'DM Sans',sans-serif"; x.textAlign = "center"; x.textBaseline = "alphabetic"; x.lineWidth = 3; x.strokeStyle = "rgba(0,0,0,.7)"; x.fillStyle = red ? "#ff4d6d" : me2 ? "#ffd23f" : "#fff";
      x.strokeText(pl[i][1], p[0], p[1] - BR * 1.2 - 6); x.fillText(pl[i][1], p[0], p[1] - BR * 1.2 - 6);
      if (qa[5] > 0) { x.lineWidth = 4; x.strokeStyle = "#3ee6c4"; x.beginPath(); x.arc(p[0], p[1] - BR * 1.2 - 24, 8, -Math.PI / 2, -Math.PI / 2 + 6.283 * qa[5] / 100); x.stroke(); }
    });
    if (!ghost && ls.ph === "p" && !cam) {                                          // vignette : on ne voit pas toute la carte
      const R = VV + 90; let vs = vigC.get(VV);
      if (!vs) { vs = document.createElement("canvas"); vs.width = vs.height = R * 2; const vg = vs.getContext("2d"), gr = vg.createRadialGradient(R, R, Math.min(120, VV * .5), R, R, R); gr.addColorStop(0, "rgba(4,3,14,0)"); gr.addColorStop(1, "rgba(4,3,14,.93)"); vg.fillStyle = gr; vg.fillRect(0, 0, R * 2, R * 2); vigC.set(VV, vs); }
      const L = Math.round(mp[0] - R), T = Math.round(mp[1] - R), Rg = L + R * 2, B = T + R * 2, X0 = camX - 2, Y0 = camY - 2, X1 = camX + vw + 2, Y1 = camY + vh + 2;
      x.drawImage(vs, L, T); x.fillStyle = "rgba(4,3,14,.93)";
      if (T > Y0) x.fillRect(X0, Y0, X1 - X0, T - Y0);
      if (B < Y1) x.fillRect(X0, B, X1 - X0, Y1 - B);
      const ya = Math.max(T, Y0), yb = Math.min(B, Y1);
      if (yb > ya) { if (L > X0) x.fillRect(X0, ya, L - X0, yb - ya); if (Rg < X1) x.fillRect(Rg, ya, X1 - Rg, yb - ya); }
    }
    if (cam && ls.ph === "p") x.drawImage(camMask(), 0, 0);                         // caméras : seuls le couloir et les portes sont visibles
    parts = parts.filter(q => (q.l -= dt * 2.2) > 0);
    parts.forEach(q => { q.x += q.vx * dt; q.y += q.vy * dt; x.globalAlpha = Math.max(0, q.l); x.fillStyle = q.c; x.beginPath(); x.arc(q.x, q.y, q.s * q.l, 0, 7); x.fill(); });
    floats = floats.filter(q => (q.l -= dt * .9) > 0);
    floats.forEach(q => { q.y -= dt * 26; x.globalAlpha = Math.min(1, q.l * 1.5); txt(q.t, q.x, q.y, "800 20px 'Bricolage Grotesque',sans-serif", "#7dffd9"); });
    x.globalAlpha = 1;
    if (ls.ph === "p") {                                                  // « ! » des tâches (visibles même dans le noir) + flèche vers la plus proche
      let nt = null, nd = 1e9;
      ST.forEach((s2, k) => {
        if (!(tk[0] >> k & 1) || (tk[1] >> k & 1)) return;
        const by = Math.sin(now / 250 + k) * 3, d = Math.hypot(s2[0] - mp[0], s2[1] - mp[1]); if (d < nd) { nd = d; nt = s2; }
        const pr = (now / 900 + k * .3) % 1; x.strokeStyle = imp ? "#ffb3c0" : "#ffd23f"; x.globalAlpha = .55 * (1 - pr); x.lineWidth = 2; x.beginPath(); x.arc(s2[0], s2[1], 20 + pr * 16, 0, 7); x.stroke(); x.globalAlpha = 1;
        x.shadowColor = x.fillStyle = imp ? "#ffb3c0" : "#ffd23f"; x.shadowBlur = 10;
        txt("!", s2[0], s2[1] - 26 + by, "800 22px 'Bricolage Grotesque',sans-serif", x.fillStyle); x.shadowBlur = 0;
      });
      if (nt && nd > 80) {
        const an = Math.atan2(nt[1] - mp[1], nt[0] - mp[0]); x.save(); x.translate(mp[0] + Math.cos(an) * 44, mp[1] + Math.sin(an) * 44); x.rotate(an);
        x.globalAlpha = .85; x.fillStyle = imp ? "#ff8fa3" : "#ffd23f"; x.beginPath(); x.moveTo(9, 0); x.lineTo(-5, -6); x.lineTo(-5, 6); x.closePath(); x.fill(); x.restore(); x.globalAlpha = 1;
      }
    }
    if (ls.ph === "p" && ls.dr) { const d = DOORS.find(z => z.id === ls.dr[0]); if (d) { x.save(); x.shadowColor = "#ff3b5c"; x.shadowBlur = 18; x.fillStyle = "#b51f45"; rr(x, d.x, d.y, d.w, d.h, 4); x.fill(); x.shadowBlur = 0; x.strokeStyle = "#ffd6df"; x.lineWidth = 2; x.stroke(); x.restore(); } }
    if (ls.ph === "p" && ls.sb) {                                           // sabotage en cours : panneaux à réparer qui clignotent
      const pu = .6 + .4 * Math.sin(now / 160);
      const mark = (p, rd) => { x.globalAlpha = pu; x.fillStyle = "#ff3b5c"; x.beginPath(); x.arc(p[0], p[1], 22, 0, 7); x.fill(); x.globalAlpha = 1; if (rd) rad(x, p[0], p[1], 12, "#fff"); else bolt(x, p[0], p[1], 12, "#fff"); };
      if (ls.sb[0] === 0) mark(LP, false); else if (ls.sb[0] === 1) { RP.forEach((p, k) => { if (!(ls.sb[2] >> k & 1)) mark(p, true); }); x.fillStyle = `rgba(255,30,60,${.08 + .07 * Math.sin(now / 120)})`; x.fillRect(camX, camY, vw, vh); }
    }
    if (ls.ph === "p" && ls.cm && ls.cm.length && !cam && Math.floor(now / 400) % 2 && vis(CAMP[0], CAMP[1])) { x.fillStyle = "#ff3b5c"; x.beginPath(); x.arc(CAMP[0] + 20, CAMP[1] - 18, 5, 0, 7); x.fill(); }   // voyant rouge : quelqu'un regarde les caméras
    x.restore();

    // ----- par-dessus la carte (écran) -----
    if (cam && ls.ph === "p") { x.fillStyle = "rgba(62,230,196,.05)"; for (let yy = 0; yy < H; yy += 4) x.fillRect(0, yy, W, 1); }
    if (ghost && ls.ph === "p") {
      if (!ghostTint) { ghostTint = document.createElement("canvas"); ghostTint.width = W; ghostTint.height = H; const tg2 = ghostTint.getContext("2d"), gg = tg2.createRadialGradient(W / 2, H / 2, H * .35, W / 2, H / 2, W * .62); gg.addColorStop(0, "rgba(120,100,255,0)"); gg.addColorStop(1, "rgba(120,100,255,.22)"); tg2.fillStyle = gg; tg2.fillRect(0, 0, W, H); }
      x.drawImage(ghostTint, 0, 0);
    }
    const [dn, tot] = ls.tp;
    x.fillStyle = "rgba(0,0,0,.55)"; rr(x, 10, 10, 210, 22, 11); x.fill();
    if (tot && dn) { const tg = x.createLinearGradient(10, 0, 220, 0); tg.addColorStop(0, "#2bd9b3"); tg.addColorStop(1, "#7dffd9"); x.fillStyle = tg; rr(x, 10, 10, Math.max(22, 210 * dn / tot), 22, 11); x.fill(); }
    txt(`Tâches ${dn}/${tot}`, 115, 22, "700 13px 'DM Sans',sans-serif", "#fff");
    let ly = 48; const mineT = ST.map((_, k) => k).filter(k => tk[0] >> k & 1);
    x.fillStyle = "rgba(6,5,20,.55)"; rr(x, 6, 38, 200, 24 + mineT.length * 16, 9); x.fill();
    txt(imp ? "Fausses tâches :" : "Mes tâches :", 14, ly, "700 12px 'DM Sans',sans-serif", imp ? "#ff8fa3" : "#b9b2ff", "left");
    mineT.forEach(k => { const d = tk[1] >> k & 1; ly += 16; x.fillStyle = TCOL[k]; x.globalAlpha = d ? .4 : 1; x.beginPath(); x.arc(17, ly, 3, 0, 7); x.fill(); x.globalAlpha = 1; txt(`${d ? "✔" : "▫"} ${ST[k][2]}`, 25, ly, "600 12px 'DM Sans',sans-serif", d ? "#6b9" : "#fff", "left"); });
    x.textAlign = "right"; x.font = "600 13px 'DM Sans',sans-serif"; x.fillStyle = "#ffe9a8"; x.textBaseline = "middle";
    (ls.kf || []).slice(-4).forEach((t2, i) => x.fillText(t2, W - 12, 18 + i * 18));
    if (ls.ph === "p" && ls.sb) txt(ls.sb[0] === 1 ? `☢️ RÉACTEUR : ${ls.sb[1]} s : répare les 2 panneaux !` : ls.sb[0] === 2 ? `🚪 PORTE FERMÉE : ${ls.sb[1]} s : approche et utilise pour ouvrir !` : `💡 Lumières coupées : répare le panneau ⚡ (${ls.sb[1]} s)`, CX, 56, "800 16px 'Bricolage Grotesque',sans-serif", "#ff6b81");
    if (cam && ls.ph === "p") txt("📹 CAMÉRAS : bouge pour quitter", CX, 516, "700 15px 'DM Sans',sans-serif", "#3ee6c4");
    if (ghost) txt("👻 Tu es un fantôme : traverse les murs et finis tes tâches !", CX, 20, "700 15px 'DM Sans',sans-serif", "#b9b2ff");
    if (ls.ph === "p" && ls.t < 5 && myIdx >= 0) {                          // annonce du rôle au début (fondu)
      const al = Math.max(0, Math.min(1, ls.t / .5, (5 - ls.t) / .7)), nI = ls.ro.split("").filter(c2 => c2 === "1").length, c0 = imp ? "224,36,63" : "46,200,170";
      const mates = ls.ro.split("").map((c2, i) => c2 === "1" && i !== myIdx && pl[i] ? pl[i][1] : null).filter(Boolean).join(", ");
      x.save(); x.globalAlpha = al; const bg2 = x.createLinearGradient(0, 0, W, 0); bg2.addColorStop(0, `rgba(${c0},0)`); bg2.addColorStop(.5, `rgba(${c0},.4)`); bg2.addColorStop(1, `rgba(${c0},0)`); x.fillStyle = bg2; x.fillRect(0, 70, W, 90);
      txt(imp ? "🔪 Tu es IMPOSTEUR" : "🧑‍🚀 Tu es ÉQUIPIER", CX, 98 + (1 - al) * 12, "800 32px 'Bricolage Grotesque',sans-serif", imp ? "#ff3b5c" : "#3ee6c4");
      txt(imp ? "Élimine en silence. Ne te fais pas voter !" + (mates ? ` Complice : ${mates}` : "") : `${nI} imposteur${nI > 1 ? "s" : ""} parmi vous : fais tes tâches et démasque-le${nI > 1 ? "s" : ""}.`, CX, 134, "600 15px 'DM Sans',sans-serif", "#fff");
      x.restore();
    }
    if (ls.ph === "p") minimap(tk, mp, ghost, imp, now, camX, camY, vw, vh, pos);
    if (ls.ph === "p" && !cam) txt(roomAt(mp[0], mp[1]).toUpperCase(), CX, 538, "800 13px 'Bricolage Grotesque',sans-serif", "rgba(255,255,255,.35)");
    if (mg && (ls.ph !== "p" || !me || me[6] || (!me[5] && now - mg.t0 > 1500))) mg = null;   // réunion, mort en conduit ou tâche coupée par l'hôte : on ferme
    if (!me || !me[5]) { if (!mg) mgDis = false; }
    if (!mg && !mgDis && ls.ph === "p" && me && me[5] > 0) { let tk2 = -1; for (let k = 0; k < ST.length; k++) if ((tk[0] >> k & 1) && !(tk[1] >> k & 1) && Math.hypot(mp[0] - ST[k][0], mp[1] - ST[k][1]) < 48) { tk2 = k; break; } if (tk2 >= 0) { mg = mgNew(tk2, now); stick = null; keys.clear(); } }
    if (ls.ph === "p") {
      const [lb, dim] = useInfo(ls); btn(USEB, lb, "#2e7dff", dim, lb);      // le fantôme a aussi son bouton (tâches)
      if (imp && !ghost) {
        const kc = me ? me[4] : 0, inV = !!(me && me[6]), nv = !!me && VENTS.some(v => Math.hypot(me[0] - v[0], me[1] - v[1]) < 36), sd = ls.sc > 0 || !!ls.sb;
        btn(KILLB, "TUER", "#e0243f", kc > 0 || tgt < 0 || inV, kc > 0 ? String(kc) : "TUER");
        btn(VENTB, "🕳️", "#6a4fd8", !inV && !nv, inV ? "↻" : "🕳️");
        btn(S1B, "💡", "#c98a00", sd, ls.sc > 0 && !ls.sb ? String(ls.sc) : "💡"); btn(S2B, "☢️", "#b3261e", sd, ls.sc > 0 && !ls.sb ? String(ls.sc) : "☢️"); btn(S3B, "🚪", "#8b5cf6", sd, ls.sc > 0 && !ls.sb ? String(ls.sc) : "🚪");
      }
    }
    if (bigMap && ls.ph === "p") bigmap(tk, mp, ghost, imp, now, pos);
    if (mg) mgDraw(now);
    if (flash) { const el = now - flash.t; if (el > flash.d) flash = null; else { x.fillStyle = `rgba(${flash.c},${(flash.a * (1 - el / flash.d)).toFixed(3)})`; x.fillRect(0, 0, W, H); if (flash.m) txt(flash.m, CX, H / 2, "800 34px 'Bricolage Grotesque',sans-serif", "#fff"); } }
    if (stick && ls.ph === "p") {
      x.fillStyle = "rgba(255,255,255,.08)"; x.strokeStyle = "rgba(255,255,255,.28)"; x.lineWidth = 2; x.beginPath(); x.arc(stick.ox, stick.oy, 55, 0, 7); x.fill(); x.stroke();
      x.fillStyle = "rgba(255,255,255,.65)"; x.beginPath(); x.arc(stick.ox + stick.dx * 55, stick.oy + stick.dy * 55, 22, 0, 7); x.fill();
    }
    if (ls.ph === "m" || ls.ph === "r") meeting(ls, now);
    x.textAlign = "start"; x.textBaseline = "alphabetic";
    setOv(ls.cd ? String(ls.cd) : ls.o ? (ls.msg || "Fin de partie") : ls.ph === "p" && ls.t > 5 && ls.t < 5.9 ? "" : "");
  }

  return {
    enter(c) {
      active = true; snaps = []; pl = null; lastEv = 0; parts = []; bigMap = false; flash = null; floats = []; lastPh = ""; mStart = rStart = mMax = 0; lastTick = -1; useSeq = killSeq = ventSeq = sabSeq = sabTy = doneSeq = cancelSeq = 0; mg = null; mgDis = false; vote = ""; sentStr = ""; sentAt = 0; stick = null; keys.clear(); tPrev = 0; myIdx = -1; ovT = "\u0000"; mid = 0; rects = []; ls = null; camOn = false; zm = 1;
      $("ghelp").textContent = "ZQSD / flèches : bouger · E ou Espace : utiliser / signaler · K ou Maj : tuer · V : conduit · 1 / 2 / 3 : saboter (imposteur) · M : grande carte · tâches = mini-jeux (Échap pour quitter) · fantôme : traverse les murs et finit ses tâches · glisse sur mobile";
      const myUid = getMe().uid;
      set(RF(`games/${c}/inputs/${myUid}`), "0,0,0,0,").catch(() => { });
      const un = onValue(RF(`games/${c}/state`), snap => {
        const v = snap.val(); if (!v) return; let s; try { s = JSON.parse(v); } catch { return; }
        if (s.k !== "amog") return;
        if (s.pl) { pl = s.pl; myIdx = pl.findIndex(p => p[0] === myUid); }
        const at = Math.max(performance.now(), snaps.length ? snaps[snaps.length - 1].at + 1 : 0);
        snaps.push({ at, s, done: false }); if (snaps.length > 14) snaps.shift();
      });
      raf = requestAnimationFrame(frame);
      return () => {
        active = false; un(); if (raf) cancelAnimationFrame(raf); raf = 0; mg = null; keys.clear(); stick = null; ov.textContent = ""; ovT = ""; bg = camM = visG = mmBase = ghostTint = null; gradC.clear(); vigC.clear();   // libère la mémoire des images
        x.setTransform(1, 0, 0, 1, 0, 0); x.globalAlpha = 1; x.setLineDash([]); x.textBaseline = "alphabetic"; x.textAlign = "start"; x.shadowBlur = 0;
      };
    }
  };
}
