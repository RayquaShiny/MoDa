/* MoDa : « Amog Us » 🚀 : trouve les imposteurs avant qu'ils éliminent tout l'équipage !
   - 4 joueurs minimum (bots 🤖 compris, jusqu'à 10). 4-7 joueurs : 1 imposteur · 8-10 joueurs : 2 imposteurs.
   - Équipiers : font leurs 5 tâches (reste sur place 1,5 à 3,6 s selon la tâche) · Imposteurs : éliminent en silence (cooldown 12 s).
   - Un corps trouvé (SIGNALER) ou le bouton d'urgence de la cafétéria (1 fois par joueur) lance une réunion : on vote
     pour éjecter quelqu'un (ou on passe). Les morts deviennent des fantômes : ils traversent les murs et peuvent finir leurs tâches.
   - Victoire équipage : toutes les tâches faites OU tous les imposteurs éjectés. Victoire imposteurs : autant d'imposteurs que d'équipiers.
   - Vision réelle : on ne voit pas à travers les murs (les fantômes voient tout). Les bots raisonnent : témoins, suspects près du corps,
     faux alibis des imposteurs. Au résultat d'un vote, on voit qui a voté pour qui.
   - Même fonctionnement que Sumo Arena : l'hôte simule (30 pas/s) et publie games/<code>/state ; chaque joueur écrit
     « ax,ay,compteurUtiliser,compteurTuer,vote » dans games/<code>/inputs/<uid>. Aucun nouveau chemin Firebase. */

const W = 800, H = 560, RAD = 11, BR = 15, SPD = 125, DT = 1 / 30;   // W × H = fenêtre de vue (le canvas) ; la carte fait WW × WH et la caméra suit le joueur
const KCD0 = 8, KCD = 12, KR = 52, TT = 1.6, MT = 40, RT = 5.5, VIS = 290;
const K = 1.75, WW = 1400, WH = 980, sc = v => Math.round(v * K), scp = a => a.map(sc);   // la carte est 1,75 fois plus grande que l'ancienne (même plan)
const TB = scp([400, 125]);                                              // table d'urgence (cafétéria)
const ROOMS = [
  { n: "Moteurs", x: 30, y: 40, w: 200, h: 160 }, { n: "Cafétéria", x: 280, y: 40, w: 240, h: 160 }, { n: "Électricité", x: 570, y: 40, w: 200, h: 160 },
  { n: "Réacteur", x: 30, y: 360, w: 200, h: 160 }, { n: "Stockage", x: 280, y: 360, w: 240, h: 160 }, { n: "Médbay", x: 570, y: 360, w: 200, h: 160 }
].map(r => ({ n: r.n, x: sc(r.x), y: sc(r.y), w: sc(r.w), h: sc(r.h) }));
const CXS = [130, 400, 670].map(sc);
const FLOOR = [...ROOMS, { x: sc(30), y: sc(250), w: sc(740), h: sc(60) }];             // salles + couloir central
CXS.forEach(cx => { FLOOR.push({ x: cx - sc(35), y: sc(190), w: sc(70), h: sc(70) }, { x: cx - sc(35), y: sc(300), w: sc(70), h: sc(70) }); }); // portes
const ST = [[80, 100, "Moteurs"], [720, 100, "Électricité"], [80, 470, "Réacteur"], [330, 480, "Stockage"], [720, 470, "Médbay"], [330, 75, "Cafétéria"], [210, 280, "Couloir G"], [590, 280, "Couloir D"]].map(t => [sc(t[0]), sc(t[1]), t[2]]);

const NT = 5;                                                             // tâches par équipier (sur 8 postes)
const TTS = [2.7, 3.6, 3.0, 2.4, 3.3, 1.8, 1.5, 1.5];                    // durée de chaque tâche (même ordre que ST)
let GRID = null;                                                          // grille 1 px : 1 = sol (rend at/ok/los beaucoup plus rapides)
const at = (px, py) => {
  if (!GRID) { GRID = new Uint8Array(WW * WH); FLOOR.forEach(a => { for (let j = a.y; j <= a.y + a.h && j < WH; j++) GRID.fill(1, j * WW + a.x, j * WW + Math.min(WW - 1, a.x + a.w) + 1); }); }
  return px >= 0 && py >= 0 && px < WW && py < WH && GRID[(py | 0) * WW + (px | 0)] === 1;
};
const ok = (px, py) => at(px - RAD, py - RAD) && at(px + RAD, py - RAD) && at(px - RAD, py + RAD) && at(px + RAD, py + RAD);
const move = (q, dx, dy) => {
  if (!q.a) { q.x = Math.max(RAD, Math.min(WW - RAD, q.x + dx)); q.y = Math.max(RAD, Math.min(WH - RAD, q.y + dy)); return; }   // fantôme : traverse les murs (reste dans la carte)
  if (ok(q.x + dx, q.y + dy)) { q.x += dx; q.y += dy; } else if (ok(q.x + dx, q.y)) q.x += dx; else if (ok(q.x, q.y + dy)) q.y += dy;
};
const los = (ax, ay, bx, by) => { const n = Math.ceil(Math.hypot(bx - ax, by - ay) / 8); for (let i = 1; i < n; i++) { const f = i / n; if (!at(ax + (bx - ax) * f, ay + (by - ay) * f)) return false; } return true; }; // ligne de vue : aucun mur entre les deux
const zone = (px, py) => { const c = px < sc(255) ? 0 : px < sc(545) ? 1 : 2; return py <= sc(235) ? c : py >= sc(325) ? 3 + c : 6; };
const DP = k => [CXS[k % 3], k < 3 ? sc(215) : sc(345)], AP = k => [CXS[k % 3], sc(280)];
function route(px, py, tx, ty) {                                          // suite de points à suivre : porte → couloir → porte → cible
  const a = zone(px, py), b = zone(tx, ty), o = [];
  if (a === b) return [[tx, ty]];
  if (a < 6) o.push(DP(a), AP(a)); if (b < 6) o.push(AP(b), DP(b));
  o.push([tx, ty]); return o;
}
const VENTS = [[50, 180], [300, 180], [750, 180], [50, 375], [300, 375], [750, 375]].map(scp), VN = [1, 2, 0, 4, 5, 3];   // conduits : deux circuits de 3 (haut / bas)
const LP = scp([610, 170]), RP = [[200, 90], [200, 490]].map(scp), CAMP = scp([490, 170]);                              // panneau électrique, 2 panneaux du réacteur, caméras
const CAMZ = FLOOR.slice(6), inCam = (px, py) => CAMZ.some(a => px >= a.x && px <= a.x + a.w && py >= a.y && py <= a.y + a.h);   // les caméras couvrent le couloir et les portes
const pc = m => { let n = 0; while (m) { n += m & 1; m >>= 1; } return n; };
export const _t = { ok, move, route, los, ST, FLOOR, TB };

// ---------------------------------------------------------------- Hôte
export async function startAmog(env) {
  const { R: RF, update, remove, set, onValue, increment, getCode, getLobby, getMe, toast } = env;
  const c = getCode(), lob = getLobby() || {}, players = env.bots ? env.bots(lob) : lob.players || {}, ids = Object.keys(players).slice(0, 10);
  const op = lob.opts || {}, SPD = [110, 140, 175][op.as === 0 || op.as === 2 ? op.as : 1], MT = [20, 40, 60][op.av === 0 || op.av === 2 ? op.av : 1];   // réglages de l'hôte : vitesse, durée du vote
  const isBot = u => u.indexOf("bot_") === 0, rnd = a => a[Math.floor(Math.random() * a.length)];
  if (ids.length < 4) return toast("Il faut au moins 4 joueurs pour lancer Amog Us (ajoute des bots 🤖 dans le lobby)");
  await remove(RF(`games/${c}`));
  await update(RF(`lobbies/${c}`), { status: "playing" });

  const nImp = op.ai >= 1 ? Math.max(1, Math.min(op.ai | 0, Math.floor((ids.length - 1) / 2))) : ids.length >= 8 ? 2 : 1, imps = new Set(ids.slice().sort(() => Math.random() - .5).slice(0, nImp));
  const P = {}, I = {}, seen = {}, bs = {};
  const gb = u => bs[u] || (bs[u] = { p: [], w: 0, k: 0, sus: {}, fl: 0 });   // mémoire d'un bot : sus = suspicion par joueur (≥ 10 : a vu le crime)
  let sab = null, sbcd = 20, t = 0, ph = "c", mid = 0, mt = 0, rt = 0, mcaller = -1, mrep = 0, near = new Set(), bodies = [], evs = [], kf = [], pubN = 0, evId = 0, over = null, rs = null;
  ids.forEach((u, i) => {
    const a = i / ids.length * 6.283, s = [0, 1, 2, 3, 4, 5, 6, 7].sort(() => Math.random() - .5).slice(0, NT);
    P[u] = { n: players[u].name, c: players[u].color, x: TB[0] + Math.cos(a) * 58, y: TB[1] + Math.sin(a) * 58, a: 1, f: 1, imp: imps.has(u) ? 1 : 0, kcd: KCD0, ch: 0, chS: -1, asg: s.reduce((m, k) => m | 1 << k, 0), dn: 0, em: 0, gone: 0, iv: -1, cm: 0 };
    I[u] = { ax: 0, ay: 0, uc: 0, kc: 0, wu: 0, wk: 0, v: null, vc: 0, sc: 0, wv: 0, ws: 0, sty: 0 };
  });
  const ev = (px, py, ty, ...r) => evs.push({ e: [Math.round(px), Math.round(py), ty, ++evId, ...r], u: pubN + 4 });

  const un = onValue(RF(`games/${c}/inputs`), s => Object.entries(s.val() || {}).forEach(([u, v]) => {
    if (!P[u] || seen[u] === v) return; seen[u] = v;
    const a = String(v).split(","), ax = +a[0], ay = +a[1], uc = +a[2], kc = +a[3], q = I[u];
    if (ax === ax && ay === ay) { const m = Math.hypot(ax, ay), k = m > 1 ? 1 / m : 1; q.ax = ax * k; q.ay = ay * k; }
    if (uc === uc && uc !== q.uc) { q.uc = uc; q.wu = .3; }               // action demandée un peu trop tôt : gardée 0,3 s
    if (kc === kc && kc !== q.kc) { q.kc = kc; q.wk = .3; }
    if (a[5] !== undefined) {                                             // conduit (V) et sabotage (1 / 2)
      const vc = +a[5], sc = +a[6], sty = +a[7];
      if (vc === vc && vc !== q.vc) { q.vc = vc; q.wv = .3; }
      if (sc === sc && sc !== q.sc) { q.sc = sc; q.sty = sty === 1 ? 1 : 0; q.ws = .3; }
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
    sab = null; ids.forEach(o => { P[o].iv = -1; P[o].cm = 0; });          // une réunion annule le sabotage et ferme les conduits / caméras
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
  const sabotage = (u, ty) => {                                           // 0 = lumières (25 s), 1 = réacteur (35 s, 2 panneaux à réparer)
    const q = P[u]; if (!q.imp || !q.a || q.gone || sab || sbcd > 0 || ph !== "p") return false;
    sab = ty === 1 ? { t: "r", r: 35, f: 0 } : { t: "l", r: 25, f: 0 }; sbcd = 30; ev(0, 0, 5, ty); return true;
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
    if (q.imp && q.a && !sab && sbcd <= 0 && Math.random() < .004) { i.ws = .3; i.sty = Math.random() < .35 ? 1 : 0; }   // l'imposteur (bot) sabote de temps en temps
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
      if (sab && (sab.r -= DT) <= 0) { if (sab.t === "r") over = "i"; sab = null; }   // réacteur non réparé : les imposteurs gagnent
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
      p: ids.map(u => { const q = P[u]; return [Math.round(q.x), Math.round(q.y), q.a, q.f, Math.ceil(q.kcd), Math.round(q.chS >= 0 ? q.ch / (TTS[q.chS] || TT) * 100 : 0), q.iv >= 0 ? 1 : 0]; }),
      bd: bodies.map(b => [Math.round(b.x), Math.round(b.y), b.i]), ts: ids.map(u => [P[u].asg, P[u].dn]), tp: [dn, tot],
      ro: ids.map(u => P[u].imp ? 1 : 0).join(""), ev: evs.map(o2 => o2.e), kf: kf.map(e => e[0]), cm: ids.map((u, i) => P[u].cm ? i : -1).filter(i => i >= 0), sb: sab ? [sab.t === "r" ? 1 : 0, Math.ceil(sab.r), sab.f] : 0, sc: Math.ceil(sbcd), ...x
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
const mix = (h, k) => { const key = h + k; if (mixC[key]) return mixC[key]; const m = hex(h).map(v => Math.round(k > 0 ? v * (1 - k) : v + (255 - v) * -k)); return mixC[key] = `rgb(${m[0]},${m[1]},${m[2]})`; };
const rr = (g, px, py, w, h, r) => { g.beginPath(); g.moveTo(px + r, py); g.arcTo(px + w, py, px + w, py + h, r); g.arcTo(px + w, py + h, px, py + h, r); g.arcTo(px, py + h, px, py, r); g.arcTo(px, py, px + w, py, r); g.closePath(); };
const USEB = { x: 730, y: 488, r: 48 }, KILLB = { x: 622, y: 500, r: 38 }, VENTB = { x: 622, y: 436, r: 26 }, S1B = { x: 548, y: 508, r: 26 }, S2B = { x: 548, y: 446, r: 26 };
let mpL = [400, 285], ghL = false;   // ma position et mon état au dernier dessin (pour les effets visibles seulement de près)

export function createAmogClient(env) {
  const { R: RF, set, onValue, $, beep, getMe, getCode } = env;
  const cv = $("cv"), x = cv.getContext("2d"), ov = $("ov");
  let active = false, raf = 0, snaps = [], pl = null, lastEv = 0, parts = [], useSeq = 0, killSeq = 0, vote = "", sentStr = "", sentAt = 0;
  let stick = null, tPrev = 0, myIdx = -1, ovT = "", bg = null, mid = 0, rects = [], ls = null;
  const keys = new Set();
  let ventSeq = 0, sabSeq = 0, sabTy = 0, camCX = 0, camCY = 0, camOn = false, zm = 1, tNow = 0, camM = null, visG = null, mmBase = null, ghostTint = null; const gradC = new Map(), vigC = new Map();

  const sendInput = (now, force) => {
    let ix = 0, iy = 0;
    if (stick) { const m = Math.hypot(stick.dx, stick.dy); if (m > .18) { const k = Math.min(1, (m - .18) / .7) / m; ix = stick.dx * k; iy = stick.dy * k; } }
    else { ix = (keys.has("R") ? 1 : 0) - (keys.has("L") ? 1 : 0); iy = (keys.has("D") ? 1 : 0) - (keys.has("U") ? 1 : 0); if (ix && iy) { ix *= .7071; iy *= .7071; } }
    const str = `${ix.toFixed(2)},${iy.toFixed(2)},${useSeq},${killSeq},${vote},${ventSeq},${sabSeq},${sabTy}`;
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
    if (e.key === " " || e.key === "e" || e.key === "E") { e.preventDefault(); if (!e.repeat) doUse(); return; }
    if (e.key === "k" || e.key === "K" || e.key === "Shift") { e.preventDefault(); if (!e.repeat) doKill(); return; }
    if (e.key === "v" || e.key === "V") { e.preventDefault(); if (!e.repeat) doVent(); return; }
    if (e.key === "1" || e.key === "2") { if (!e.repeat) doSab(+e.key - 1); return; }
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
    if (e.button === 2) return doUse();
    if (hit(p, USEB)) return doUse();
    if (isImp() && hit(p, KILLB)) return doKill();
    if (isImp() && hit(p, VENTB)) return doVent();
    if (isImp() && hit(p, S1B)) return doSab(0);
    if (isImp() && hit(p, S2B)) return doSab(1);
    if (stick) return;
    try { cv.setPointerCapture(e.pointerId); } catch { }
    stick = { id: e.pointerId, ox: p.x, oy: p.y, dx: 0, dy: 0 };
  });
  cv.addEventListener("pointermove", e => {
    if (!stick || e.pointerId !== stick.id) return;
    const p = rel(e); let dx = p.x - stick.ox, dy = p.y - stick.oy; const d = Math.hypot(dx, dy), m = 55;
    if (d > m) { stick.ox += dx / d * (d - m); stick.oy += dy / d * (d - m); dx = dx / d * m; dy = dy / d * m; }
    stick.dx = dx / m; stick.dy = dy / m;
  });
  const end = e => { if (stick && e.pointerId === stick.id) stick = null; };
  cv.addEventListener("pointerup", end); cv.addEventListener("pointercancel", end);
  cv.addEventListener("contextmenu", e => { if (active) e.preventDefault(); });
  document.addEventListener("visibilitychange", () => { if (document.hidden) { keys.clear(); stick = null; } });

  const spark = (px, py, n, col, v) => { for (let i = 0; i < n && parts.length < 160; i++) { const a = Math.random() * 6.283, s = v * (.3 + Math.random() * .7); parts.push({ x: px, y: py, vx: Math.cos(a) * s, vy: Math.sin(a) * s, l: 1, c: col, s: 2 + Math.random() * 3 }); } };
  const vib = ms => { if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(ms); };
  const onEv = e => {
    const [ex, ey, ty, id] = e; if (id <= lastEv) return; lastEv = id;
    if (ty === 1) { spark(ex, ey, 14, "#ff3b5c", 160); beep(90, .3, "sawtooth", .06, 40); if (e[4] === myIdx) vib(200); }
    else if (ty === 2) { spark(ex, ey, 6, "#3ee6c4", 90); if (e[4] === myIdx) beep(660, .12, "sine", .05, 990); }
    else if (ty === 3) { beep(300, .6, "sawtooth", .06, 700); vib(150); }
    else if (ty === 4) { if (ghL || (Math.hypot(ex - mpL[0], ey - mpL[1]) < VIS && los(mpL[0], mpL[1], ex, ey))) { spark(ex, ey, 10, "#8a85b8", 70); beep(140, .18, "triangle", .05, 70); } }   // quelqu'un entre ou sort d'un conduit
    else if (ty === 5) { beep(220, .7, "square", .07, 120); vib(120); }                                    // sabotage !
  };

  function sample(rt) {
    const n = snaps.length; if (!n) return null;
    let a = snaps[0], b = a, f = 0;
    if (rt >= snaps[n - 1].at) a = b = snaps[n - 1];
    else if (rt > snaps[0].at) for (let i = n - 1; i > 0; i--) if (snaps[i - 1].at <= rt) { a = snaps[i - 1]; b = snaps[i]; f = (rt - a.at) / Math.max(1, b.at - a.at); break; }
    return { a, b, f };
  }

  // ----- dessin -----
  const TCOL = ["#ff9f43", "#ffd23f", "#ff6b81", "#b79bff", "#3ee6c4", "#4cc9f0", "#7ae582", "#4cc9f0"];   // couleur de chaque poste de tâche
  const RTINT = ["#ff8a3d", "#4c8dff", "#ffd23f", "#ff3b5c", "#c79a52", "#3ee6c4"];                         // ambiance de chaque salle
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
    g.save(); g.shadowColor = "rgba(0,0,0,.7)"; g.shadowBlur = 30; g.fillStyle = "#26225a"; FLOOR.forEach(a => g.fillRect(a.x - 16, a.y - 16, a.w + 32, a.h + 32)); g.restore();   // coque : plusieurs couches pour le relief
    g.fillStyle = "#4a4496"; FLOOR.forEach(a => g.fillRect(a.x - 11, a.y - 11, a.w + 22, a.h + 22));
    g.fillStyle = "#2f2b6e"; FLOOR.forEach(a => g.fillRect(a.x - 6, a.y - 6, a.w + 12, a.h + 12));
    g.fillStyle = "#6e66c8"; FLOOR.forEach(a => g.fillRect(a.x - 2, a.y - 2, a.w + 4, a.h + 4));
    const fl = g.createLinearGradient(0, 0, WW, WH); fl.addColorStop(0, "#221f4a"); fl.addColorStop(1, "#191638");
    g.fillStyle = fl; FLOOR.forEach(a => g.fillRect(a.x, a.y, a.w, a.h));
    g.save(); g.beginPath(); FLOOR.forEach(a => g.rect(a.x, a.y, a.w, a.h)); g.clip();
    ROOMS.forEach((r, i) => { const rg = g.createRadialGradient(r.x + r.w / 2, r.y + r.h / 2, 10, r.x + r.w / 2, r.y + r.h / 2, r.w * .75); rg.addColorStop(0, RTINT[i] + "33"); rg.addColorStop(1, RTINT[i] + "00"); g.fillStyle = rg; g.fillRect(r.x, r.y, r.w, r.h); });
    g.strokeStyle = "rgba(160,150,255,.07)"; g.lineWidth = 1;
    for (let i = 0; i < WW; i += 50) { g.beginPath(); g.moveTo(i + .5, 0); g.lineTo(i + .5, WH); g.stroke(); }
    for (let j = 0; j < WH; j += 50) { g.beginPath(); g.moveTo(0, j + .5); g.lineTo(WW, j + .5); g.stroke(); }
    g.fillStyle = "rgba(255,255,255,.025)"; for (let i = 0; i < WW; i += 100) for (let j = 0; j < WH; j += 100) g.fillRect(i, j, 50, 50);   // damier discret
    const cr = FLOOR[6]; g.strokeStyle = "rgba(62,230,196,.28)"; g.lineWidth = 3; g.setLineDash([18, 14]); g.beginPath(); g.moveTo(cr.x + 10, cr.y + cr.h / 2); g.lineTo(cr.x + cr.w - 10, cr.y + cr.h / 2); g.stroke(); g.setLineDash([]);
    const ringAt = (cx, cy, r, col, lw, al) => { g.globalAlpha = al; g.strokeStyle = col; g.lineWidth = lw; g.beginPath(); g.arc(cx, cy, r, 0, 7); g.stroke(); g.globalAlpha = 1; };
    { const r = ROOMS[0]; [[.3, .62], [.72, .62]].forEach(([fx, fy]) => { const cx = r.x + r.w * fx, cy = r.y + r.h * fy; ringAt(cx, cy, 52, "#ff8a3d", 4, .35); ringAt(cx, cy, 34, "#ff8a3d", 2, .3); ringAt(cx, cy, 14, "#ffd23f", 3, .4); g.strokeStyle = "#ff8a3d"; g.lineWidth = 3; g.globalAlpha = .3; for (let k = 0; k < 6; k++) { const an = k * 1.047; g.beginPath(); g.moveTo(cx + Math.cos(an) * 16, cy + Math.sin(an) * 16); g.lineTo(cx + Math.cos(an) * 34, cy + Math.sin(an) * 34); g.stroke(); } g.globalAlpha = 1; }); }   // Moteurs : deux turbines peintes
    ringAt(TB[0], TB[1], 118, "#4c8dff", 5, .25); ringAt(TB[0], TB[1], 92, "#4c8dff", 2, .3); ringAt(TB[0], TB[1], 62, "#9bb8ff", 2, .25);   // Cafétéria : tapis rond
    { const r = ROOMS[2]; g.strokeStyle = "rgba(255,210,63,.3)"; g.lineWidth = 4; g.beginPath(); g.moveTo(r.x, r.y + r.h - 50); g.lineTo(LP[0], r.y + r.h - 50); g.lineTo(LP[0], LP[1] + 18); g.moveTo(r.x + r.w, r.y + 80); g.lineTo(LP[0] + 70, r.y + 80); g.lineTo(LP[0] + 70, LP[1]); g.lineTo(LP[0] + 20, LP[1]); g.stroke(); }   // Électricité : conduits
    { const r = ROOMS[3], cx = r.x + r.w * .68, cy = r.y + r.h * .5, cg = g.createRadialGradient(cx, cy, 5, cx, cy, 90); cg.addColorStop(0, "rgba(255,59,92,.45)"); cg.addColorStop(1, "rgba(255,59,92,0)"); g.fillStyle = cg; g.fillRect(cx - 90, cy - 90, 180, 180); ringAt(cx, cy, 62, "#ff3b5c", 4, .4); ringAt(cx, cy, 40, "#ff3b5c", 2, .4); rad(g, cx, cy, 26, "rgba(255,80,110,.5)"); }   // Réacteur : cœur
    { const r = ROOMS[4]; g.strokeStyle = "rgba(232,185,35,.45)"; g.lineWidth = 3; [[.08, .1, .24, .3], [.38, .1, .24, .3], [.68, .1, .24, .3]].forEach(([fx, fy, fw, fh]) => { const bx = r.x + r.w * fx, by = r.y + r.h * fy, bw = r.w * fw, bh = r.h * fh; g.strokeRect(bx, by, bw, bh); g.globalAlpha = .5; g.beginPath(); g.moveTo(bx, by); g.lineTo(bx + bw, by + bh); g.moveTo(bx + bw, by); g.lineTo(bx, by + bh); g.stroke(); g.globalAlpha = 1; }); }   // Stockage : zones de caisses peintes
    { const r = ROOMS[5], cx = r.x + r.w * .5, cy = r.y + r.h * .45; ringAt(cx, cy, 56, "#3ee6c4", 3, .35); ringAt(cx, cy, 44, "#3ee6c4", 1.5, .3); g.fillStyle = "rgba(62,230,196,.3)"; g.fillRect(cx - 6, cy - 22, 12, 44); g.fillRect(cx - 22, cy - 6, 44, 12); }   // Médbay : croix et scanner
    CXS.forEach(cx => { g.globalAlpha = .6; hazard(g, cx - sc(35) + 4, ROOMS[0].y + ROOMS[0].h - 4, sc(70) - 8, 8); hazard(g, cx - sc(35) + 4, ROOMS[3].y - 4, sc(70) - 8, 8); }); g.globalAlpha = 1;   // portes : bandes de danger
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
    x.save(); x.globalAlpha *= al; x.translate(px, py + (gh ? Math.sin(tNow / 260 + px) * 3 - 3 : 0)); x.scale(f || 1, 1);
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
  function minimap(tk, mp, ghost, imp, now, camX, camY, vw, vh) {        // mini-carte : plan, mes tâches restantes, ma position
    const mw = 150, mh = 105, mx = 12, my = H - mh - 12, k = mw / WW;
    if (!mmBase) {
      mmBase = document.createElement("canvas"); mmBase.width = mw + 10; mmBase.height = mh + 10; const mg = mmBase.getContext("2d");
      mg.fillStyle = "rgba(6,5,20,.72)"; rr(mg, 0, 0, mw + 10, mh + 10, 9); mg.fill(); mg.strokeStyle = "rgba(160,150,255,.5)"; mg.lineWidth = 1.5; mg.stroke();
      mg.fillStyle = "#4b4596"; FLOOR.forEach(a => mg.fillRect(5 + a.x * k, 5 + a.y * k, Math.max(1, a.w * k), Math.max(1, a.h * k)));
    }
    x.drawImage(mmBase, mx - 5, my - 5);
    ST.forEach((t, i) => { if (!(tk[0] >> i & 1) || (tk[1] >> i & 1)) return; x.fillStyle = imp ? "#ff8fa3" : "#ffd23f"; x.beginPath(); x.arc(mx + t[0] * k, my + t[1] * k, 3, 0, 7); x.fill(); });
    if (ls.sb && Math.floor(now / 300) % 2) { x.fillStyle = "#ff3b5c"; (ls.sb[0] === 0 ? [LP] : RP.filter((p, i) => !(ls.sb[2] >> i & 1))).forEach(p => { x.beginPath(); x.arc(mx + p[0] * k, my + p[1] * k, 4, 0, 7); x.fill(); }); }
    x.strokeStyle = "rgba(255,255,255,.55)"; x.lineWidth = 1; x.strokeRect(mx + camX * k, my + camY * k, vw * k, vh * k);
    const c = pl && pl[myIdx] ? pl[myIdx][2] : "#fff"; x.fillStyle = c; x.strokeStyle = "#fff"; x.lineWidth = 1.5; x.beginPath(); x.arc(mx + mp[0] * k, my + mp[1] * k, 3.5, 0, 7); x.fill(); x.stroke();
  }
  function setOv(tx) {
    if (tx === ovT) return; ovT = tx; ov.textContent = tx;
    ov.style.fontSize = tx.length <= 6 ? "min(72px,14vw)" : "min(26px,5vw)";
  }
  const txt = (s, px, py, font, col, al = "center") => { x.font = font; x.fillStyle = col; x.textAlign = al; x.textBaseline = "middle"; x.fillText(s, px, py); };

  function useInfo(s) {
    const q = s.p[myIdx]; if (!q) return ["UTILISER", 1];
    if (q[6]) return ["EN CONDUIT", 1];
    if (q[2]) { if (s.bd.some(b => Math.hypot(b[0] - q[0], b[1] - q[1]) < 72)) return ["SIGNALER", 0]; if (Math.hypot(q[0] - TB[0], q[1] - TB[1]) < 50) return ["URGENCE", 0];
      if (!isImp() && s.sb) { if (s.sb[0] === 0 && Math.hypot(q[0] - LP[0], q[1] - LP[1]) < 44) return ["RÉPARER", 0]; if (s.sb[0] === 1) for (let k = 0; k < 2; k++) if (!(s.sb[2] >> k & 1) && Math.hypot(q[0] - RP[k][0], q[1] - RP[k][1]) < 44) return ["RÉPARER", 0]; }
      if (Math.hypot(q[0] - CAMP[0], q[1] - CAMP[1]) < 44) return [s.cm && s.cm.includes(myIdx) ? "QUITTER" : "CAMÉRAS", 0]; }
    const tk = s.ts[myIdx] || [0, 0];
    for (let k = 0; k < ST.length; k++) if ((tk[0] >> k & 1) && !(tk[1] >> k & 1) && Math.hypot(q[0] - ST[k][0], q[1] - ST[k][1]) < 42) return ["TÂCHE", 0];
    return ["UTILISER", 1];
  }

  function meeting(s, now) {
    x.fillStyle = "rgba(8,6,24,.94)"; x.fillRect(0, 0, W, H); rects = [];
    const res = s.ph === "r", m = s.mt, rsl = s.rs, mine = s.p[myIdx] && s.p[myIdx][2];
    if (res) {
      const ej = rsl.ej >= 0 ? pl[rsl.ej] : null;
      txt(ej ? `${ej[1]} a été éjecté(e).` : "Personne n'a été éjecté.", CX, 40, "800 28px 'Bricolage Grotesque',sans-serif", "#fff");
      txt(ej ? (rsl.ei ? "C'était un imposteur ! 🎉" : "Ce n'était PAS un imposteur… 😬") : "Égalité ou majorité de « passer »", CX, 74, "700 18px 'DM Sans',sans-serif", ej ? (rsl.ei ? "#3ee6c4" : "#ff3b5c") : "#ffe9a8");
      txt(`Il reste ${rsl.ir} imposteur${rsl.ir > 1 ? "s" : ""}`, CX, 98, "600 15px 'DM Sans',sans-serif", "#b9b2ff");
    } else {
      txt(m.b ? `📢 ${pl[m.c][1]} a trouvé un corps !` : `🚨 Réunion d'urgence : ${pl[m.c][1]}`, CX, 36, "800 26px 'Bricolage Grotesque',sans-serif", "#fff");
      txt(mine ? "Qui est l'imposteur ? Discutez, puis votez." : "👻 Les morts ne votent pas", CX, 70, "700 17px 'DM Sans',sans-serif", "#ffe9a8");
      txt(`${m.r} s`, 760, 36, "800 24px 'Bricolage Grotesque',sans-serif", m.r <= 8 ? "#ff3b5c" : "#9b8cff");
    }
    s.p.forEach((q, i) => {
      const col = i < 5 ? 0 : 1, rx = 50 + col * 370, ry = 118 + (i % 5) * 56, al = q[2] ? 1 : .4;
      const sel = vote === `${mid}_${i}`;
      x.globalAlpha = al; x.fillStyle = sel ? "#4a3f95" : "#241f52"; rr(x, rx, ry, 330, 48, 12); x.fill();
      x.lineWidth = sel ? 3 : 1.5; x.strokeStyle = sel ? "#ffd23f" : "#4b4590"; x.stroke();
      bean(rx + 26, ry + 26, pl[i][2], 1, 1);
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
    if (ls.ph === "p" && ls.sb) {                                           // sabotage en cours : panneaux à réparer qui clignotent
      const pu = .6 + .4 * Math.sin(now / 160);
      const mark = (p, rd) => { x.globalAlpha = pu; x.fillStyle = "#ff3b5c"; x.beginPath(); x.arc(p[0], p[1], 22, 0, 7); x.fill(); x.globalAlpha = 1; if (rd) rad(x, p[0], p[1], 12, "#fff"); else bolt(x, p[0], p[1], 12, "#fff"); };
      if (ls.sb[0] === 0) mark(LP, false); else { RP.forEach((p, k) => { if (!(ls.sb[2] >> k & 1)) mark(p, true); }); x.fillStyle = `rgba(255,30,60,${.08 + .07 * Math.sin(now / 120)})`; x.fillRect(camX, camY, vw, vh); }
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
    let ly = 48; txt(imp ? "Fausses tâches :" : "Mes tâches :", 12, ly, "700 12px 'DM Sans',sans-serif", imp ? "#ff8fa3" : "#b9b2ff", "left");
    ST.forEach((s2, k) => { if (!(tk[0] >> k & 1)) return; ly += 16; txt(`${tk[1] >> k & 1 ? "✔" : "▫"} ${s2[2]}`, 12, ly, "600 12px 'DM Sans',sans-serif", tk[1] >> k & 1 ? "#6b9" : "#fff", "left"); });
    x.textAlign = "right"; x.font = "600 13px 'DM Sans',sans-serif"; x.fillStyle = "#ffe9a8"; x.textBaseline = "middle";
    (ls.kf || []).slice(-4).forEach((t2, i) => x.fillText(t2, W - 12, 18 + i * 18));
    if (ls.ph === "p" && ls.sb) txt(ls.sb[0] ? `☢️ RÉACTEUR : ${ls.sb[1]} s : répare les 2 panneaux !` : `💡 Lumières coupées : répare le panneau ⚡ (${ls.sb[1]} s)`, CX, 56, "800 16px 'Bricolage Grotesque',sans-serif", "#ff6b81");
    if (cam && ls.ph === "p") txt("📹 CAMÉRAS : bouge pour quitter", CX, 540, "700 15px 'DM Sans',sans-serif", "#3ee6c4");
    if (ghost) txt("👻 Tu es un fantôme : traverse les murs et finis tes tâches !", CX, 20, "700 15px 'DM Sans',sans-serif", "#b9b2ff");
    if (ls.ph === "p" && ls.t < 5 && myIdx >= 0) {                          // annonce du rôle au début
      txt(imp ? "🔪 Tu es IMPOSTEUR" : "🧑‍🚀 Tu es ÉQUIPIER", CX, 90, "800 30px 'Bricolage Grotesque',sans-serif", imp ? "#ff3b5c" : "#3ee6c4");
      txt(imp ? "Élimine en silence. Ne te fais pas voter !" : "Fais tes tâches et trouve les imposteurs.", CX, 122, "600 15px 'DM Sans',sans-serif", "#fff");
    }
    if (ls.ph === "p") minimap(tk, mp, ghost, imp, now, camX, camY, vw, vh);
    if (ls.ph === "p") {
      const [lb, dim] = useInfo(ls); btn(USEB, lb, "#2e7dff", dim, lb);      // le fantôme a aussi son bouton (tâches)
      if (imp && !ghost) {
        const kc = me ? me[4] : 0, inV = !!(me && me[6]), nv = !!me && VENTS.some(v => Math.hypot(me[0] - v[0], me[1] - v[1]) < 36), sd = ls.sc > 0 || !!ls.sb;
        btn(KILLB, "TUER", "#e0243f", kc > 0 || tgt < 0 || inV, kc > 0 ? String(kc) : "TUER");
        btn(VENTB, "🕳️", "#6a4fd8", !inV && !nv, inV ? "↻" : "🕳️");
        btn(S1B, "💡", "#c98a00", sd, ls.sc > 0 && !ls.sb ? String(ls.sc) : "💡"); btn(S2B, "☢️", "#b3261e", sd, ls.sc > 0 && !ls.sb ? String(ls.sc) : "☢️");
      }
    }
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
      active = true; snaps = []; pl = null; lastEv = 0; parts = []; useSeq = killSeq = ventSeq = sabSeq = sabTy = 0; vote = ""; sentStr = ""; sentAt = 0; stick = null; keys.clear(); tPrev = 0; myIdx = -1; ovT = "\u0000"; mid = 0; rects = []; ls = null; camOn = false; zm = 1;
      $("ghelp").textContent = "ZQSD / flèches : bouger · E ou Espace : utiliser / signaler · K ou Maj : tuer · V : conduit · 1 / 2 : saboter (imposteur) · fantôme : traverse les murs et finit ses tâches · glisse sur mobile";
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
        active = false; un(); if (raf) cancelAnimationFrame(raf); raf = 0; keys.clear(); stick = null; ov.textContent = ""; ovT = ""; bg = camM = visG = mmBase = ghostTint = null; gradC.clear(); vigC.clear();   // libère la mémoire des images
        x.setTransform(1, 0, 0, 1, 0, 0); x.globalAlpha = 1; x.setLineDash([]); x.textBaseline = "alphabetic"; x.textAlign = "start"; x.shadowBlur = 0;
      };
    }
  };
}
