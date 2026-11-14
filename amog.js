/* MoDa : « Amog Us » 🚀 : trouve les imposteurs avant qu'ils éliminent tout l'équipage !
   - 4 joueurs minimum (bots 🤖 compris, jusqu'à 10). 4-7 joueurs : 1 imposteur · 8-10 joueurs : 2 imposteurs.
   - Équipiers : font leurs 5 tâches (reste sur place 1,5 à 3,6 s selon la tâche) · Imposteurs : éliminent en silence (cooldown 12 s).
   - Un corps trouvé (SIGNALER) ou le bouton d'urgence de la cafétéria (1 fois par joueur) lance une réunion : on vote
     pour éjecter quelqu'un (ou on passe). Les morts deviennent des fantômes : ils peuvent finir leurs tâches.
   - Victoire équipage : toutes les tâches faites OU tous les imposteurs éjectés. Victoire imposteurs : autant d'imposteurs que d'équipiers.
   - Vision réelle : on ne voit pas à travers les murs (les fantômes voient tout). Les bots raisonnent : témoins, suspects près du corps,
     faux alibis des imposteurs. Au résultat d'un vote, on voit qui a voté pour qui.
   - Même fonctionnement que Sumo Arena : l'hôte simule (30 pas/s) et publie games/<code>/state ; chaque joueur écrit
     « ax,ay,compteurUtiliser,compteurTuer,vote » dans games/<code>/inputs/<uid>. Aucun nouveau chemin Firebase. */

const W = 800, H = 560, RAD = 11, BR = 15, SPD = 125, DT = 1 / 30;
const KCD0 = 8, KCD = 12, KR = 52, TT = 1.6, MT = 40, RT = 5.5, VIS = 250;
const TB = [400, 125];                                                   // table d'urgence (cafétéria)
const ROOMS = [
  { n: "Moteurs", x: 30, y: 40, w: 200, h: 160 }, { n: "Cafétéria", x: 280, y: 40, w: 240, h: 160 }, { n: "Électricité", x: 570, y: 40, w: 200, h: 160 },
  { n: "Réacteur", x: 30, y: 360, w: 200, h: 160 }, { n: "Stockage", x: 280, y: 360, w: 240, h: 160 }, { n: "Médbay", x: 570, y: 360, w: 200, h: 160 }
];
const CXS = [130, 400, 670];
const FLOOR = [...ROOMS, { x: 30, y: 250, w: 740, h: 60 }];             // salles + couloir central
CXS.forEach(cx => { FLOOR.push({ x: cx - 35, y: 190, w: 70, h: 70 }, { x: cx - 35, y: 300, w: 70, h: 70 }); }); // portes
const ST = [[80, 100, "Moteurs"], [720, 100, "Électricité"], [80, 470, "Réacteur"], [330, 480, "Stockage"], [720, 470, "Médbay"], [330, 75, "Cafétéria"], [210, 280, "Couloir G"], [590, 280, "Couloir D"]];

const NT = 5;                                                             // tâches par équipier (sur 8 postes)
const TTS = [2.7, 3.6, 3.0, 2.4, 3.3, 1.8, 1.5, 1.5];                    // durée de chaque tâche (même ordre que ST)
const at = (px, py) => FLOOR.some(a => px >= a.x && px <= a.x + a.w && py >= a.y && py <= a.y + a.h);
const ok = (px, py) => at(px - RAD, py - RAD) && at(px + RAD, py - RAD) && at(px - RAD, py + RAD) && at(px + RAD, py + RAD);
const move = (q, dx, dy) => { if (ok(q.x + dx, q.y + dy)) { q.x += dx; q.y += dy; } else if (ok(q.x + dx, q.y)) q.x += dx; else if (ok(q.x, q.y + dy)) q.y += dy; };
const los = (ax, ay, bx, by) => { const n = Math.ceil(Math.hypot(bx - ax, by - ay) / 8); for (let i = 1; i < n; i++) { const f = i / n; if (!at(ax + (bx - ax) * f, ay + (by - ay) * f)) return false; } return true; }; // ligne de vue : aucun mur entre les deux
const zone = (px, py) => { const c = px < 255 ? 0 : px < 545 ? 1 : 2; return py <= 235 ? c : py >= 325 ? 3 + c : 6; };
const DP = k => [CXS[k % 3], k < 3 ? 215 : 345], AP = k => [CXS[k % 3], 280];
function route(px, py, tx, ty) {                                          // suite de points à suivre : porte → couloir → porte → cible
  const a = zone(px, py), b = zone(tx, ty), o = [];
  if (a === b) return [[tx, ty]];
  if (a < 6) o.push(DP(a), AP(a)); if (b < 6) o.push(AP(b), DP(b));
  o.push([tx, ty]); return o;
}
const pc = m => { let n = 0; while (m) { n += m & 1; m >>= 1; } return n; };
export const _t = { ok, move, route, los, ST, FLOOR, TB };

// ---------------------------------------------------------------- Hôte
export async function startAmog(env) {
  const { R: RF, update, remove, set, onValue, increment, getCode, getLobby, getMe, toast } = env;
  const c = getCode(), lob = getLobby() || {}, players = env.bots ? env.bots(lob) : lob.players || {}, ids = Object.keys(players).slice(0, 10);
  const isBot = u => u.indexOf("bot_") === 0, rnd = a => a[Math.floor(Math.random() * a.length)];
  if (ids.length < 4) return toast("Il faut au moins 4 joueurs pour lancer Amog Us (ajoute des bots 🤖 dans le lobby)");
  await remove(RF(`games/${c}`));
  await update(RF(`lobbies/${c}`), { status: "playing" });

  const nImp = ids.length >= 8 ? 2 : 1, imps = new Set(ids.slice().sort(() => Math.random() - .5).slice(0, nImp));
  const P = {}, I = {}, seen = {}, bs = {};
  const gb = u => bs[u] || (bs[u] = { p: [], w: 0, k: 0, sus: {}, fl: 0 });   // mémoire d'un bot : sus = suspicion par joueur (≥ 10 : a vu le crime)
  let t = 0, ph = "c", mid = 0, mt = 0, rt = 0, mcaller = -1, mrep = 0, near = new Set(), bodies = [], evs = [], kf = [], pubN = 0, evId = 0, over = null, rs = null;
  ids.forEach((u, i) => {
    const a = i / ids.length * 6.283, s = [0, 1, 2, 3, 4, 5, 6, 7].sort(() => Math.random() - .5).slice(0, NT);
    P[u] = { n: players[u].name, c: players[u].color, x: TB[0] + Math.cos(a) * 58, y: TB[1] + Math.sin(a) * 58, a: 1, f: 1, imp: imps.has(u) ? 1 : 0, kcd: KCD0, ch: 0, chS: -1, asg: s.reduce((m, k) => m | 1 << k, 0), dn: 0, em: 0, gone: 0 };
    I[u] = { ax: 0, ay: 0, uc: 0, kc: 0, wu: 0, wk: 0, v: null };
  });
  const ev = (px, py, ty, ...r) => evs.push({ e: [Math.round(px), Math.round(py), ty, ++evId, ...r], u: pubN + 4 });

  const un = onValue(RF(`games/${c}/inputs`), s => Object.entries(s.val() || {}).forEach(([u, v]) => {
    if (!P[u] || seen[u] === v) return; seen[u] = v;
    const a = String(v).split(","), ax = +a[0], ay = +a[1], uc = +a[2], kc = +a[3], q = I[u];
    if (ax === ax && ay === ay) { const m = Math.hypot(ax, ay), k = m > 1 ? 1 / m : 1; q.ax = ax * k; q.ay = ay * k; }
    if (uc === uc && uc !== q.uc) { q.uc = uc; q.wu = .3; }               // action demandée un peu trop tôt : gardée 0,3 s
    if (kc === kc && kc !== q.kc) { q.kc = kc; q.wk = .3; }
    if (a[4]) { const [m, tg] = a[4].split("_"); if (+m === mid && ph === "m") q.v = +tg; }
  }));

  const chk = () => {
    let ai = 0, ac = 0, tot = 0, dn = 0;
    ids.forEach(u => { const q = P[u]; if (q.a && !q.gone) q.imp ? ai++ : ac++; if (!q.imp && !q.gone) { tot += NT; dn += pc(q.dn); } });
    return !ai ? "c" : ai >= ac ? "i" : tot && dn >= tot ? "c" : null;
  };

  const meet = (u, bd) => {
    near = new Set(bd ? ids.filter(o => P[o].a && !P[o].gone && Math.hypot(P[o].x - bd.x, P[o].y - bd.y) < 190) : []);   // qui traînait près du corps
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
    const q = P[u];
    if (q.a) {
      const bd = bodies.find(b => Math.hypot(b.x - q.x, b.y - q.y) < 72); if (bd) { meet(u, bd); return true; }
      if (q.em < 1 && Math.hypot(q.x - TB[0], q.y - TB[1]) < 50) { q.em++; meet(u, null); return true; }
    }
    if (q.chS < 0) for (let s = 0; s < ST.length; s++) if ((q.asg >> s & 1) && !(q.dn >> s & 1) && Math.hypot(q.x - ST[s][0], q.y - ST[s][1]) < 42) { q.chS = s; q.ch = 0; return true; }
    return false;
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
    if (b.fl > 0) { b.fl -= DT; if (b.p.length) { follow(q, i, b); return; } }
    if (b.w > 0) { b.w -= DT; return; }
    const go = (px, py) => { b.p = route(q.x, q.y, px, py); };
    if (q.a && !q.imp) {                                                  // corps en vue : on le signale (7 fois sur 10)
      let bd = null, bdd = 150; bodies.forEach(o => { const d = Math.hypot(o.x - q.x, o.y - q.y); if (d < bdd && los(q.x, q.y, o.x, o.y)) { bdd = d; bd = o; } });
      if (bd) { if (!b.rep) b.rep = Math.random() < .7 ? 1 : -1; if (b.rep > 0) { if (bdd < 60) { i.wu = .3; return; } if (!b.p.length || b.k++ % 20 === 0) go(bd.x, bd.y); follow(q, i, b); return; } } else b.rep = 0;
    }
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
    if (!b.p.length) { if (b.idle) { b.idle = 0; b.w = 1 + Math.random() * 3; return; } const s = rnd(ST); go(s[0], s[1]); b.idle = 1; }
    follow(q, i, b);
  };

  const step = () => {
    if (ph === "p") {
      t += DT;
      ids.forEach(u => { if (isBot(u)) bot(u); });
      ids.forEach(u => {
        if (ph !== "p") return;
        const q = P[u], i = I[u]; if (q.gone) return;
        if (q.kcd > 0) q.kcd = Math.max(0, q.kcd - DT);
        if (i.wu > 0) { i.wu -= DT; if (use(u)) i.wu = 0; }
        if (ph !== "p") return;
        if (i.wk > 0) { i.wk -= DT; if (q.imp && q.a && q.kcd <= 0 && kill(u)) i.wk = 0; }
        const mg = Math.hypot(i.ax, i.ay);
        if (q.chS >= 0) {                                                 // tâche en cours : on reste sur place
          const s = ST[q.chS];
          if ((mg > .5 && q.ch > .35) || Math.hypot(q.x - s[0], q.y - s[1]) > 48) q.chS = -1;
          else if ((q.ch += DT) >= (TTS[q.chS] || TT)) { q.dn |= 1 << q.chS; q.chS = -1; if (!q.imp) ev(q.x, q.y, 2, ids.indexOf(u)); }
        }
        if (q.chS < 0 && mg > .02) { move(q, i.ax * SPD * DT, i.ay * SPD * DT); if (Math.abs(i.ax) > .1) q.f = i.ax > 0 ? 1 : -1; }
      });
      over = chk();
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
      p: ids.map(u => { const q = P[u]; return [+q.x.toFixed(1), +q.y.toFixed(1), q.a, q.f, Math.ceil(q.kcd), Math.round(q.chS >= 0 ? q.ch / (TTS[q.chS] || TT) * 100 : 0)]; }),
      bd: bodies.map(b => [Math.round(b.x), Math.round(b.y), b.i]), ts: ids.map(u => [P[u].asg, P[u].dn]), tp: [dn, tot],
      ro: ids.map(u => P[u].imp ? 1 : 0).join(""), ev: evs.map(o2 => o2.e), kf: kf.map(e => e[0]), ...x
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
const USEB = { x: 730, y: 488, r: 48 }, KILLB = { x: 622, y: 500, r: 38 };

export function createAmogClient(env) {
  const { R: RF, set, onValue, $, beep, getMe, getCode } = env;
  const cv = $("cv"), x = cv.getContext("2d"), ov = $("ov");
  let active = false, raf = 0, snaps = [], pl = null, lastEv = 0, parts = [], useSeq = 0, killSeq = 0, vote = "", sentStr = "", sentAt = 0;
  let stick = null, tPrev = 0, myIdx = -1, ovT = "", bg = null, mid = 0, rects = [], ls = null;
  const keys = new Set();

  const sendInput = (now, force) => {
    let ix = 0, iy = 0;
    if (stick) { const m = Math.hypot(stick.dx, stick.dy); if (m > .18) { const k = Math.min(1, (m - .18) / .7) / m; ix = stick.dx * k; iy = stick.dy * k; } }
    else { ix = (keys.has("R") ? 1 : 0) - (keys.has("L") ? 1 : 0); iy = (keys.has("D") ? 1 : 0) - (keys.has("U") ? 1 : 0); if (ix && iy) { ix *= .7071; iy *= .7071; } }
    const str = `${ix.toFixed(2)},${iy.toFixed(2)},${useSeq},${killSeq},${vote}`;
    if (str === sentStr || (!force && now - sentAt < 55)) return;
    sentStr = str; sentAt = now;
    set(RF(`games/${getCode()}/inputs/${getMe().uid}`), str).catch(() => { });
  };
  const isImp = () => !!ls && myIdx >= 0 && ls.ro[myIdx] === "1";
  const doUse = () => { if (!active || !ls || ls.ph !== "p") return; useSeq++; sendInput(performance.now(), true); };
  const doKill = () => { if (!active || !ls || ls.ph !== "p" || !isImp()) return; killSeq++; sendInput(performance.now(), true); };
  const hit = (p, b) => Math.hypot(p.x - b.x, p.y - b.y) < b.r + 8;

  addEventListener("keydown", e => {
    if (!active || /^(INPUT|TEXTAREA)$/.test(e.target.tagName)) return;
    if (e.key === " " || e.key === "e" || e.key === "E") { e.preventDefault(); if (!e.repeat) doUse(); return; }
    if (e.key === "k" || e.key === "K" || e.key === "Shift") { e.preventDefault(); if (!e.repeat) doKill(); return; }
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
  };

  function sample(rt) {
    const n = snaps.length; if (!n) return null;
    let a = snaps[0], b = a, f = 0;
    if (rt >= snaps[n - 1].at) a = b = snaps[n - 1];
    else if (rt > snaps[0].at) for (let i = n - 1; i > 0; i--) if (snaps[i - 1].at <= rt) { a = snaps[i - 1]; b = snaps[i]; f = (rt - a.at) / Math.max(1, b.at - a.at); break; }
    return { a, b, f };
  }

  // ----- dessin -----
  function background() {
    if (bg) return bg;
    bg = document.createElement("canvas"); bg.width = W; bg.height = H; const g = bg.getContext("2d");
    g.fillStyle = "#07061a"; g.fillRect(0, 0, W, H);
    g.fillStyle = "#4b4590"; FLOOR.forEach(a => g.fillRect(a.x - 6, a.y - 6, a.w + 12, a.h + 12));
    g.fillStyle = "#1d1a3d"; FLOOR.forEach(a => g.fillRect(a.x, a.y, a.w, a.h));
    g.save(); g.beginPath(); FLOOR.forEach(a => g.rect(a.x, a.y, a.w, a.h)); g.clip();
    g.strokeStyle = "rgba(255,255,255,.045)"; g.lineWidth = 1;
    for (let i = 0; i < W; i += 40) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, H); g.stroke(); }
    for (let j = 0; j < H; j += 40) { g.beginPath(); g.moveTo(0, j); g.lineTo(W, j); g.stroke(); }
    g.restore();
    g.font = "700 13px 'DM Sans',sans-serif"; g.textAlign = "left"; g.fillStyle = "rgba(255,255,255,.22)";
    ROOMS.forEach(r => g.fillText(r.n.toUpperCase(), r.x + 10, r.y + r.h - 10));
    g.fillStyle = "#3b3570"; g.beginPath(); g.arc(TB[0], TB[1], 26, 0, 7); g.fill(); g.strokeStyle = "#9b8cff"; g.lineWidth = 3; g.stroke();
    g.fillStyle = "#ff3b5c"; g.beginPath(); g.arc(TB[0], TB[1], 9, 0, 7); g.fill();
    ST.forEach(s => { g.fillStyle = "#2d2a5c"; rr(g, s[0] - 13, s[1] - 13, 26, 26, 6); g.fill(); g.strokeStyle = "#6a62c9"; g.lineWidth = 2; g.stroke(); });
    return bg;
  }
  function bean(px, py, col, f, al) {
    x.save(); x.globalAlpha = al; x.translate(px, py); x.scale(f, 1);
    x.fillStyle = "rgba(0,0,0,.35)"; x.beginPath(); x.ellipse(0, BR * .95, BR * .9, BR * .35, 0, 0, 7); x.fill();
    x.fillStyle = mix(col, .35); rr(x, -BR - 6, -3, 9, 18, 4); x.fill();
    const g = x.createLinearGradient(-BR, 0, BR, 0); g.addColorStop(0, mix(col, -.25)); g.addColorStop(.6, col); g.addColorStop(1, mix(col, .4));
    x.fillStyle = g; rr(x, -BR * .85, -BR * 1.2, BR * 1.7, BR * 2.2, BR * .8); x.fill();
    x.fillStyle = "#9fe4ff"; x.beginPath(); x.ellipse(BR * .25, -BR * .45, BR * .62, BR * .38, 0, 0, 7); x.fill();
    x.fillStyle = "rgba(255,255,255,.7)"; x.beginPath(); x.ellipse(BR * .45, -BR * .6, BR * .2, BR * .1, 0, 0, 7); x.fill();
    x.restore();
  }
  function corpse(px, py, col) {
    x.fillStyle = "rgba(0,0,0,.3)"; x.beginPath(); x.ellipse(px, py + 9, BR, BR * .4, 0, 0, 7); x.fill();
    x.fillStyle = col; x.beginPath(); x.ellipse(px, py + 5, BR * .9, BR * .65, 0, Math.PI, 0); x.fill(); x.fillRect(px - BR * .9, py + 5, BR * 1.8, 4);
    x.fillStyle = "#f4efe0"; x.fillRect(px - 2, py - 12, 4, 11); [-3, 3].forEach(d => { x.beginPath(); x.arc(px + d, py - 13, 3, 0, 7); x.fill(); });
  }
  function btn(b, label, col, dim, sub) {
    x.globalAlpha = dim ? .45 : 1; x.fillStyle = col; x.beginPath(); x.arc(b.x, b.y, b.r, 0, 7); x.fill();
    x.lineWidth = 4; x.strokeStyle = "rgba(255,255,255,.55)"; x.stroke();
    x.fillStyle = "#fff"; x.textAlign = "center"; x.textBaseline = "middle"; x.font = `800 ${b.r > 40 ? 15 : 14}px 'Bricolage Grotesque',sans-serif`;
    x.fillText(sub || label, b.x, b.y); x.globalAlpha = 1;
  }
  function setOv(tx) {
    if (tx === ovT) return; ovT = tx; ov.textContent = tx;
    ov.style.fontSize = tx.length <= 6 ? "min(72px,14vw)" : "min(26px,5vw)";
  }
  const txt = (s, px, py, font, col, al = "center") => { x.font = font; x.fillStyle = col; x.textAlign = al; x.textBaseline = "middle"; x.fillText(s, px, py); };

  function useInfo(s) {
    const q = s.p[myIdx]; if (!q) return ["UTILISER", 1];
    if (q[2]) { if (s.bd.some(b => Math.hypot(b[0] - q[0], b[1] - q[1]) < 72)) return ["SIGNALER", 0]; if (Math.hypot(q[0] - TB[0], q[1] - TB[1]) < 50) return ["URGENCE", 0]; }
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
    const dt = Math.min(.05, (now - (tPrev || now)) / 1000); tPrev = now;
    sendInput(now);
    x.setTransform(cv.width / W, 0, 0, cv.height / H, 0, 0);
    x.drawImage(background(), 0, 0);
    const sm = sample(now - 110); if (!sm) return setOv("");
    const { a, b, f } = sm; ls = snaps[snaps.length - 1].s; const sa = a.s, sb = b.s;
    snaps.forEach(sn => { if (!sn.done && sn.at <= now - 110) { sn.done = true; (sn.s.ev || []).forEach(onEv); } });
    if (!pl) return;
    if (ls.mt) mid = ls.mt.id;
    const me = sa.p[myIdx], ghost = !!me && !me[2], imp = isImp();
    const pos = sa.p.map((qa, i) => { const qb = sb.p[i]; return qb && qa[2] && qb[2] ? [qa[0] + (qb[0] - qa[0]) * f, qa[1] + (qb[1] - qa[1]) * f] : [qa[0], qa[1]]; });
    const mp = pos[myIdx] || [CX, 285], vis = (px, py) => ghost || (Math.hypot(px - mp[0], py - mp[1]) < VIS && los(mp[0], mp[1], px, py));   // pas de vision à travers les murs

    // tâches à faire (les miennes) : « ! » jaune qui rebondit
    const tk = ls.ts[myIdx] || [0, 0];
    (ls.bd || []).forEach(bd => { if (vis(bd[0], bd[1]) && pl[bd[2]]) corpse(bd[0], bd[1], pl[bd[2]][2]); });

    // joueurs : les vivants ne voient que ce qui est proche ; les fantômes voient tout (et les autres fantômes)
    let tgt = -1, td = KR;
    if (imp && !ghost && ls.ph === "p") ls.p.forEach((q, i) => { if (i !== myIdx && q[2] && ls.ro[i] !== "1") { const d = Math.hypot(pos[i][0] - mp[0], pos[i][1] - mp[1]); if (d < td) { td = d; tgt = i; } } });
    const order = pos.map((p, i) => i).filter(i => sa.p[i][2] || ghost).sort((i, j) => pos[i][1] - pos[j][1]);
    order.forEach(i => {
      const qa = sa.p[i], p = pos[i]; if (!pl[i] || (i !== myIdx && !vis(p[0], p[1]))) return;
      if (i === tgt) { x.strokeStyle = "#ff3b5c"; x.lineWidth = 3; x.beginPath(); x.arc(p[0], p[1], BR + 8, 0, 7); x.stroke(); }
      bean(p[0], p[1], pl[i][2], qa[3] || 1, qa[2] ? 1 : .4);
      const me2 = i === myIdx, red = ls.ro[i] === "1" && (imp || ls.o);
      x.font = "700 13px 'DM Sans',sans-serif"; x.textAlign = "center"; x.textBaseline = "alphabetic"; x.lineWidth = 3; x.strokeStyle = "rgba(0,0,0,.7)"; x.fillStyle = red ? "#ff4d6d" : me2 ? "#ffd23f" : "#fff";
      x.strokeText(pl[i][1], p[0], p[1] - BR * 1.2 - 6); x.fillText(pl[i][1], p[0], p[1] - BR * 1.2 - 6);
      if (qa[5] > 0) { x.lineWidth = 4; x.strokeStyle = "#3ee6c4"; x.beginPath(); x.arc(p[0], p[1] - BR * 1.2 - 24, 8, -Math.PI / 2, -Math.PI / 2 + 6.283 * qa[5] / 100); x.stroke(); }
    });
    if (!ghost && ls.ph === "p") {                                          // vignette : on ne voit pas toute la carte
      const g = x.createRadialGradient(mp[0], mp[1], 120, mp[0], mp[1], VIS + 90); g.addColorStop(0, "rgba(4,3,14,0)"); g.addColorStop(1, "rgba(4,3,14,.93)");
      x.fillStyle = g; x.fillRect(0, 0, W, H);
    }
    parts = parts.filter(q => (q.l -= dt * 2.2) > 0);
    parts.forEach(q => { q.x += q.vx * dt; q.y += q.vy * dt; x.globalAlpha = Math.max(0, q.l); x.fillStyle = q.c; x.beginPath(); x.arc(q.x, q.y, q.s * q.l, 0, 7); x.fill(); });
    x.globalAlpha = 1;
    if (ls.ph === "p") {                                                  // « ! » des tâches (visibles même dans le noir) + flèche vers la plus proche
      let nt = null, nd = 1e9;
      ST.forEach((s, k) => {
        if (!(tk[0] >> k & 1) || (tk[1] >> k & 1)) return;
        const by = Math.sin(now / 250 + k) * 3, d = Math.hypot(s[0] - mp[0], s[1] - mp[1]); if (d < nd) { nd = d; nt = s; }
        x.shadowColor = x.fillStyle = imp ? "#ffb3c0" : "#ffd23f"; x.shadowBlur = 10;
        txt("!", s[0], s[1] - 24 + by, "800 22px 'Bricolage Grotesque',sans-serif", x.fillStyle); x.shadowBlur = 0;
      });
      if (nt && nd > 80) {
        const an = Math.atan2(nt[1] - mp[1], nt[0] - mp[0]); x.save(); x.translate(mp[0] + Math.cos(an) * 44, mp[1] + Math.sin(an) * 44); x.rotate(an);
        x.globalAlpha = .85; x.fillStyle = imp ? "#ff8fa3" : "#ffd23f"; x.beginPath(); x.moveTo(9, 0); x.lineTo(-5, -6); x.lineTo(-5, 6); x.closePath(); x.fill(); x.restore(); x.globalAlpha = 1;
      }
    }

    // HUD : barre de tâches, liste, rôle, boutons
    const [dn, tot] = ls.tp;
    x.fillStyle = "rgba(0,0,0,.55)"; rr(x, 10, 10, 210, 22, 11); x.fill();
    x.fillStyle = "#3ee6c4"; if (tot && dn) { rr(x, 10, 10, Math.max(22, 210 * dn / tot), 22, 11); x.fill(); }
    txt(`Tâches ${dn}/${tot}`, 115, 22, "700 13px 'DM Sans',sans-serif", "#fff");
    let ly = 48; txt(imp ? "Fausses tâches :" : "Mes tâches :", 12, ly, "700 12px 'DM Sans',sans-serif", imp ? "#ff8fa3" : "#b9b2ff", "left");
    ST.forEach((s, k) => { if (!(tk[0] >> k & 1)) return; ly += 16; txt(`${tk[1] >> k & 1 ? "✔" : "▫"} ${s[2]}`, 12, ly, "600 12px 'DM Sans',sans-serif", tk[1] >> k & 1 ? "#6b9" : "#fff", "left"); });
    x.textAlign = "right"; x.font = "600 13px 'DM Sans',sans-serif"; x.fillStyle = "#ffe9a8"; x.textBaseline = "middle";
    (ls.kf || []).slice(-4).forEach((t2, i) => x.fillText(t2, W - 12, 18 + i * 18));
    if (ghost) txt("👻 Tu es un fantôme : finis tes tâches !", CX, 20, "700 15px 'DM Sans',sans-serif", "#b9b2ff");
    if (ls.ph === "p" && ls.t < 5 && myIdx >= 0) {                          // annonce du rôle au début
      txt(imp ? "🔪 Tu es IMPOSTEUR" : "🧑‍🚀 Tu es ÉQUIPIER", CX, 90, "800 30px 'Bricolage Grotesque',sans-serif", imp ? "#ff3b5c" : "#3ee6c4");
      txt(imp ? "Élimine en silence. Ne te fais pas voter !" : "Fais tes tâches et trouve les imposteurs.", CX, 122, "600 15px 'DM Sans',sans-serif", "#fff");
    }
    if (ls.ph === "p" && !ghost) {
      const [lb, dim] = useInfo(ls); btn(USEB, lb, "#2e7dff", dim, lb);
      if (imp) { const kc = me ? me[4] : 0; btn(KILLB, "TUER", "#e0243f", kc > 0 || tgt < 0, kc > 0 ? String(kc) : "TUER"); }
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
      active = true; snaps = []; pl = null; lastEv = 0; parts = []; useSeq = killSeq = 0; vote = ""; sentStr = ""; sentAt = 0; stick = null; keys.clear(); tPrev = 0; myIdx = -1; ovT = "\u0000"; mid = 0; rects = []; ls = null;
      $("ghelp").textContent = "ZQSD / flèches : bouger · E ou Espace : utiliser / signaler · K ou Maj : tuer (imposteur) · glisse sur mobile";
      const myUid = getMe().uid;
      set(RF(`games/${c}/inputs/${myUid}`), "0,0,0,0,").catch(() => { });
      const un = onValue(RF(`games/${c}/state`), snap => {
        const v = snap.val(); if (!v) return; let s; try { s = JSON.parse(v); } catch { return; }
        if (s.k !== "amog") return;
        if (s.pl) { pl = s.pl; myIdx = pl.findIndex(p => p[0] === myUid); }
        const at = Math.max(performance.now(), snaps.length ? snaps[snaps.length - 1].at + 1 : 0);
        snaps.push({ at, s, done: false }); if (snaps.length > 14) snaps.shift();
        if (env.vpos && pl && s.p) { // chat vocal : en réunion tout le monde s'entend (sauf les fantômes, que seuls les fantômes entendent) ; sinon, selon la distance
          const meDead = myIdx >= 0 && s.p[myIdx] && !s.p[myIdx][2], o = {};
          pl.forEach((q, i) => { const p = s.p[i]; if (p && (p[2] || meDead)) o[q[0]] = { x: p[0], y: p[1] }; });
          const m = o[myUid] || null;
          if (s.ph === "m") { const all = {}; pl.forEach((q, i) => { const p = s.p[i]; if (p && (p[2] || meDead)) all[q[0]] = { x: 0, y: 0 }; }); env.vpos({ x: 0, y: 0 }, all, 450); }
          else env.vpos(m, o, 260);
        }
      });
      raf = requestAnimationFrame(frame);
      return () => {
        active = false; un(); if (raf) cancelAnimationFrame(raf); raf = 0; keys.clear(); stick = null; ov.textContent = ""; ovT = "";
        x.setTransform(1, 0, 0, 1, 0, 0); x.globalAlpha = 1; x.setLineDash([]); x.textBaseline = "alphabetic"; x.textAlign = "start"; x.shadowBlur = 0;
      };
    }
  };
}
