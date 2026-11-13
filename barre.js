/* MoDa : « La barre malicieuse » 🌀 : une barre tourne sur le plateau, ne la touche pas !
   - Le dernier en vie gagne. S'il ne tient pas 5 s tout seul face à la barre, c'est la BARRE qui gagne.
   - La barre accélère avec le temps et joue des feintes : freinage trompeur puis coup de fouet, demi-tour,
     arrêt net, zigzag, rétractation puis jaillissement.
   - Capacités spéciales : turbo x2 pour tous, barre fantôme, mirage (fausse barre), double barre, commandes inversées.
   - Chaque joueur peut SAUTER 🦘 (Espace, bouton, clic droit) : on passe au-dessus de la barre (0,5 s, recharge 1,8 s).
   - Même fonctionnement que Sumo Arena : l'hôte simule (30 pas/s) et publie games/<code>/state ; chacun écrit
     « ax,ay,compteurSaut » dans games/<code>/inputs/<uid>. Aucun nouveau chemin Firebase. */

const W = 800, H = 560, CX = 400, CY = 285, BR = 16, HW = 8;
const ACC = 900, DAMP = 3.0, DT = 1 / 30, PI2 = Math.PI * 2;
const wrap = a => { while (a > Math.PI) a -= PI2; while (a < -Math.PI) a += PI2; return a; };
const clamp = (v, m) => Math.max(-m, Math.min(m, v));
const TAUNTS = ["s'est fait balayer", "a pris la barre en pleine tête", "a été cueilli", "n'a pas sauté à temps", "est passé à la casserole"];

// Feintes : suites de [vitesse angulaire, durée en s, longueur (1 = pleine)]
const MOVES = [
  (b, d) => [[.15 * d * b, .7], [d * b * 2.3, .9]],            // freine comme si de rien n'était… puis coup de fouet
  (b, d) => [[-d * b * 1.2, 1.5]],                              // demi-tour
  (b, d) => [[0, .6], [d * b * 2.6, .7]],                       // arrêt net puis démarrage en trombe
  (b, d) => [[-d * b * 1.8, .45], [d * b * 1.8, .9]],           // zigzag
  (b, d) => [[d * b * .5, .5, .55], [d * b * 1.6, .9, 1]],      // se rétracte, puis jaillit
  (b, d) => [[0, 1.1], [-d * b * 3, .5]],                       // fausse pause, puis demi-tour éclair
  (b, d) => [[d * b * 2, .35, .7], [d * b * 2, .35, 1], [d * b * 2, .35, .6], [d * b * 3, .6, 1]], // pulsation : la pointe respire
  (b, d) => [[0, .35], [d * b * 2.6, .45], [0, .3], [-d * b * 2.6, .55]],                         // double fouet : coup, pause, contre-coup
  (b, d) => [[d * b * .1, 1], [d * b * 2.4, .9]],                                                  // faux ralenti long puis accélération
  (b, d) => [[d * b * 2.3, 1.3]],                                                                  // toupie
  (b, d) => [[-d * b * 1.6, .35], [0, .35], [d * b * 2.4, .35, .6], [-d * b * 2.4, .5, 1]]      // zigzag + rétractation
];
// Difficultés : s0 = vitesse de départ (rad/s), sg = gain par seconde, smax = plafond, acc = nervosité, delay = la barre attend avant de partir,
// ramp = durée de la montée en vitesse, gap0/gapMin/gapVar = délai entre feintes, ab* = capacités, jt/jcd = durée/recharge du saut,
// solo = secondes à tenir seul, hw = demi-largeur de la barre, shrink = rétrécissement du plateau par seconde (après 6 s), bot = fiabilité des bots
const ALL = [0, 1, 2, 3, 4, 5, 6];
const DIFFS = [
  { n: "Facile",    s0: .85, sg: .012, smax: 1.8, acc: 6,  delay: 2.2, ramp: 5,   gap0: 3,  gapMin: 1.4, gapVar: 1.8, abFirst: 16, abMin: 11,  abVar: 6, abSolo: [6, 3],     abs: [1, 2],             moves: [0, 1, 3],                                   jt: .6,  jcd: 1.2, solo: 4, hw: 7,  shrink: 0,    minRad: 1,  soloMul: 1.1,  bot: .8 },
  { n: "Normale",   s0: 1.2,  sg: .025, smax: 2.6, acc: 9,  delay: 1.2, ramp: 3,   gap0: 2,  gapMin: .5,  gapVar: 1.1, abFirst: 8,  abMin: 6,   abVar: 4, abSolo: [4, 2],     abs: [0, 1, 2, 3, 4],    moves: ALL,                                         jt: .5,  jcd: 1.8, solo: 5, hw: 8,  shrink: 0,    minRad: 1,  soloMul: 1.35, bot: .8 },
  { n: "Difficile", s0: 1.7,  sg: .05,  smax: 3.0, acc: 20, delay: .8,  ramp: 1.8, gap0: 1,  gapMin: .15, gapVar: .45, abFirst: 4,  abMin: 2.5, abVar: 2, abSolo: [2.5, 1.5], abs: [0, 1, 2, 3, 4, 3], moves: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 7, 10], jt: .4,  jcd: 2.0, solo: 8, hw: 11, shrink: .012, minRad: .6, soloMul: 1.4,  bot: .55 }
];
// Capacités spéciales (une à la fois, annoncées en haut de l'écran) : [nom, durée en s]
const ABS = [["⚡ TURBO x2 : tout le monde !", 4], ["👻 Barre fantôme", 3], ["🪞 Mirage : laquelle est la vraie ?", 4], ["🌀 Double barre", 4], ["🔀 Commandes inversées", 3.5]];

// ---------------------------------------------------------------- Hôte
export async function startBarre(env) {
  const { R, update, remove, set, onValue, increment, getCode, getLobby, getMe, toast } = env;
  const c = getCode(), lob = getLobby() || {}, dfi = (lob.opts || {}).df, dif = DIFFS[dfi === 0 || dfi === 2 ? dfi : 1], players = env.bots ? env.bots(lob) : lob.players || {}, ids = Object.keys(players);
  const isBot = u => u.indexOf("bot_") === 0;
  if (ids.length < 2) return toast("Il faut au moins 2 joueurs pour lancer La barre malicieuse (ajoute un bot 🤖 dans le lobby)");
  await remove(R(`games/${c}`));
  await update(R(`lobbies/${c}`), { status: "playing" });

  const rad0 = 170 + ids.length * 10, P = {}, I = {}, seen = {}, JT = dif.jt, JCD = dif.jcd, hw = dif.hw;
  let rad = rad0;
  let t = 0, ang = 0, om = 0, tOm = 0, dir = Math.random() < .5 ? 1 : -1, len = 1, tLen = 1;
  let ab = -1, abT = 0, abNext = dif.abFirst, lastAb = -1, q = [], curT = 0, gap = dif.delay + dif.gap0, solo = -1, res, evId = 0, evs = [], kf = [], pubN = 0;
  const off = Math.random() * PI2;
  ang = off + (2 * Math.floor(Math.random() * ids.length) + 1) * Math.PI / ids.length;   // la barre démarre pile ENTRE deux joueurs (jamais sur l'un d'eux)
  ids.forEach((u, i) => {                                   // départ en cercle, à mi-rayon
    const a = off + i / ids.length * PI2, d = rad * .6;
    P[u] = { n: players[u].name, c: players[u].color, x: CX + Math.cos(a) * d, y: CY + Math.sin(a) * d, vx: 0, vy: 0, a: 1, cd: 0, j: 0 };
    I[u] = { ax: 0, ay: 0, d: 0, want: 0 };
  });
  const alive = () => ids.filter(u => P[u].a);
  const ev = (x, y, ty, ...r) => evs.push({ e: [Math.round(x), Math.round(y), ty, ++evId, ...r], u: pubN + 4 });
  // la barre ATTEND (dif.delay) puis monte progressivement en vitesse : plus personne ne se fait tuer sans avoir pu réagir
  const base = () => t < dif.delay ? 0 : Math.min(dif.smax, dif.s0 + t * dif.sg) * Math.min(1, .35 + .65 * (t - dif.delay) / dif.ramp) * (solo >= 0 ? dif.soloMul : 1);

  const un = onValue(R(`games/${c}/inputs`), s => Object.entries(s.val() || {}).forEach(([u, v]) => {
    if (!P[u] || seen[u] === v) return; seen[u] = v;
    const a = String(v).split(","), ax = +a[0], ay = +a[1], d = +a[2], o = I[u];
    if (ax === ax && ay === ay) { const m = Math.hypot(ax, ay), k = m > 1 ? 1 / m : 1; o.ax = ax * k; o.ay = ay * k; }
    if (d === d && d !== o.d) { o.d = d; o.want = .25; }       // un saut demandé un peu tôt est gardé 0,25 s
  }));

  const die = u => {
    const p = P[u]; p.a = 0; ev(p.x, p.y, -2, ids.indexOf(u));
    kf.push([`${p.n} ${TAUNTS[Math.floor(Math.random() * TAUNTS.length)]}`, pubN + 40]);
  };

  // bots : restent à l'opposé de la barre, sautent (pas toujours…) quand elle arrive
  const bs = {};
  const bot = u => {
    const p = P[u], i = I[u], b = bs[u] || (bs[u] = { k: Math.floor(Math.random() * 4), r: .45 + Math.random() * .3 });
    if (b.k-- > 0) return; b.k = 2 + Math.floor(Math.random() * 3);
    const dx = p.x - CX, dy = p.y - CY, pr = Math.hypot(dx, dy), d = wrap(Math.atan2(dy, dx) - ang), L = (rad - 4) * len;
    if (p.cd <= 0 && pr < L + BR && Math.abs(d) < .55 && om * d > 0 && Math.abs(d) / (Math.abs(om) || 1) < .4 && Math.random() < dif.bot) i.want = .25;
    const ta = ang + Math.PI + om * .35, tr = rad * b.r;
    const vx = CX + Math.cos(ta) * tr - p.x, vy = CY + Math.sin(ta) * tr - p.y, m = Math.hypot(vx, vy) || 1;
    i.ax = vx / m + (Math.random() - .5) * .3; i.ay = vy / m + (Math.random() - .5) * .3;
  };

  const step = () => {
    ids.forEach(u => { if (isBot(u) && P[u].a) bot(u); });
    t += DT;
    // --- capacités spéciales : la première à 8 s, puis toutes les 6 à 10 s (4 à 6 s quand il ne reste qu'un joueur)
    if (ab >= 0) { if ((abT -= DT) <= 0) { ab = -1; abNext = t + (solo >= 0 ? dif.abSolo[0] + Math.random() * dif.abSolo[1] : dif.abMin + Math.random() * dif.abVar); } }
    else if (t >= abNext) {
      do ab = dif.abs[Math.floor(Math.random() * dif.abs.length)]; while (ab === lastAb); lastAb = ab; abT = ABS[ab][1];
      kf.push([ABS[ab][0], pubN + 40]); ev(CX, CY, -3, ab);
    }
    const dtp = DT * (ab === 0 ? 2 : 1), sg = ab === 4 ? -1 : 1;   // turbo : le temps file x2 pour la barre ET les joueurs
    // --- la barre et ses feintes
    if (curT > 0) curT -= dtp;
    else if (q.length) { const s = q.shift(); tOm = s[0]; tLen = s[2] || 1; curT = s[1]; }
    else { tOm = dir * base(); tLen = 1; if ((gap -= dtp) <= 0) { const m = dif.moves[Math.floor(Math.random() * dif.moves.length)]; if (m === 1) dir = -dir; q = MOVES[m](base(), dir); gap = dif.gapMin + Math.random() * dif.gapVar; } }
    om += clamp(tOm - om, dif.acc * dtp); len += clamp(tLen - len, 1.2 * dtp);
    const a0 = ang; ang += om * dtp;
    if (dif.shrink) rad = Math.max(rad0 * dif.minRad, rad0 * (1 - dif.shrink * Math.max(0, t - 6)));   // difficile : le plateau rétrécit
    // --- joueurs
    const al = alive();
    al.forEach(u => {
      const p = P[u], i = I[u];
      if (p.cd > 0) p.cd = Math.max(0, p.cd - DT);
      if (p.j > 0) p.j = Math.max(0, p.j - DT);
      if (i.want > 0) { i.want -= DT; if (p.cd <= 0) { p.j = JT; p.cd = JCD; i.want = 0; ev(p.x, p.y, -1, ids.indexOf(u)); } }
      p.vx += i.ax * sg * ACC * dtp; p.vy += i.ay * sg * ACC * dtp;
      const f = Math.exp(-DAMP * dtp); p.vx *= f; p.vy *= f;
      p.x += p.vx * dtp; p.y += p.vy * dtp;
      const dx = p.x - CX, dy = p.y - CY, d = Math.hypot(dx, dy), mx = rad - BR;
      if (d > mx) { p.x = CX + dx / d * mx; p.y = CY + dy / d * mx; }  // le bord est un mur
    });
    for (let i = 0; i < al.length; i++) for (let j = i + 1; j < al.length; j++) {
      const A = P[al[i]], B = P[al[j]], dx = B.x - A.x, dy = B.y - A.y, d = Math.hypot(dx, dy);
      if (d >= BR * 2 || d < .001) continue;
      const o = (BR * 2 - d) / 2; A.x -= dx / d * o; A.y -= dy / d * o; B.x += dx / d * o; B.y += dy / d * o;
    }
    // --- touché ? (4 sous-pas : la pointe va vite, elle ne doit pas « traverser »)
    const L = (rad - 4) * len;
    if (t > dif.delay + .5) for (let k = 1; k <= 6; k++) for (const arm of ab === 3 ? [0, Math.PI] : [0]) {   // double barre : 2 bras mortels
      const aa = a0 + (ang - a0) * k / 6 + arm, ux = Math.cos(aa), uy = Math.sin(aa);
      alive().forEach(u => {
        const p = P[u]; if (p.j > 0) return;                    // en l'air : intouchable
        const s = Math.max(0, Math.min(L, (p.x - CX) * ux + (p.y - CY) * uy));
        if (Math.hypot(p.x - CX - ux * s, p.y - CY - uy * s) < BR * .85 + hw) die(u);
      });
    }
    // --- règle des 5 secondes
    const n = alive().length;
    if (n === 0) res = null;                                     // plus personne : la barre gagne
    else if (n === 1) {
      if (solo < 0) { solo = dif.solo; kf.push([`⏱️ ${P[alive()[0]].n} doit tenir ${dif.solo} s !`, pubN + 40]); }
      else if ((solo -= DT) <= 0) res = alive()[0];
    }
  };

  const pub = (x = {}) => {
    pubN++;
    evs = evs.filter(o => o.u >= pubN); kf = kf.filter(e => e[1] > pubN);
    const o = {
      k: "barre", t: +t.toFixed(1), ab, at: ab >= 0 ? +abT.toFixed(1) : 0, a: +ang.toFixed(3), l: +len.toFixed(2), r: +rad.toFixed(1), w: hw, jd: JT, s: solo >= 0 ? +Math.max(0, solo).toFixed(1) : -1,
      p: ids.map(u => { const p = P[u]; return [+p.x.toFixed(1), +p.y.toFixed(1), p.a, Math.round(p.cd / JCD * 100), p.j > 0 ? 1 : 0]; }),
      ev: evs.map(o2 => o2.e), kf: kf.map(e => e[0]), ...x
    };
    if (x.cd || x.o || pubN % 10 === 1) o.pl = ids.map(u => [u, P[u].n, P[u].c]);
    return set(R(`games/${c}/state`), JSON.stringify(o));
  };

  const finish = w => {
    un(); if (env.played) env.played("barre"); else set(R("stats/gamesPlayed"), increment(1)).catch(() => { });
    pub({ o: 1, msg: w ? `🏆 ${P[w].n} a survécu à la barre !` : "🌀 La barre malicieuse gagne !" });
    setTimeout(async () => {
      if (getCode() !== c) return;
      const cp = (getLobby() || {}).players || {}, up = { status: "lobby" };
      ids.filter(u => cp[u]).forEach(u => up[`players/${u}/ready`] = u === getMe().uid);
      if (w && cp[w]) up[`players/${w}/wins`] = (cp[w].wins || 0) + 1;
      try { await update(R(`lobbies/${c}`), up); } catch { }
    }, 6000);
  };

  kf.push([`🎚️ Difficulté : ${dif.n}`, pubN + 70]);
  for (let n = 3; n > 0; n--) { await pub({ cd: n }); await new Promise(r => setTimeout(r, 1000)); if (getCode() !== c) { un(); return; } }
  ids.forEach(u => { I[u].want = 0; });
  let last = performance.now(), acc = 0;
  const loop = () => {
    if (getCode() !== c) { un(); return; }
    const now = performance.now(); acc = Math.min(.25, acc + (now - last) / 1000); last = now;
    const cp = (getLobby() || {}).players || {};
    ids.forEach(u => { if (P[u].a && !cp[u] && !isBot(u)) { P[u].a = 0; kf.push([`${P[u].n} a quitté la partie`, pubN + 40]); } });
    for (let n = 0; acc >= DT && n < 6 && res === undefined; n++) { step(); acc -= DT; }
    if (res !== undefined) return finish(res);
    pub(); setTimeout(loop, 55);
  };
  loop();
}

// ---------------------------------------------------------------- Client (tous les joueurs, hôte compris)
const KEYS = { ArrowUp: "U", w: "U", z: "U", ArrowDown: "D", s: "D", ArrowLeft: "L", a: "L", q: "L", ArrowRight: "R", d: "R" };
const AB = ABS.map(a => a[0]);
const ACR = ["255,210,63", "170,215,255", "255,100,220", "255,59,92", "160,90,255"], AC = ["#ffd23f", "#aad7ff", "#ff64dc", "#ff3b5c", "#a05aff"];   // couleur de chaque capacité
const rgba = (h, a) => `rgba(${[1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) || 0)},${a})`;
const sh = (h, k) => { const m = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) || 0).map(v => Math.round(k > 0 ? v * (1 - k) : v + (255 - v) * -k)); return `rgb(${m})`; };

/* Vue 2,5D avec perspective douce : le plateau est incliné (K), ce qui est proche de la caméra est un peu plus grand (PERSP),
   les objets ont du volume. La caméra tourne autour du plateau pour rester du côté de TON personnage, et reste fixe quand on saute. */
const K = .7, PERSP = .0007, BH = 13, FT = 18, JH = 36;   // inclinaison, perspective, hauteur de la barre, épaisseur du plateau, hauteur de saut

export function createBarreClient(env) {
  const { R, set, onValue, $, beep, getMe, getCode } = env;
  const cv = $("cv"), x = cv.getContext("2d"), btn = $("sdash"), ov = $("ov");
  let active = false, raf = 0, snaps = [], pl = null, lastEv = 0, parts = [], fl = [], jt = [], ang = [], jseq = 0, sentStr = "", sentAt = 0, stick = null, tPrev = 0, myIdx = -1, ovT = "", bg = null, rings = [], hit = 0, vg = null, shk = 0;   // shk : intensité du tremblement de caméra (px)
  const keys = new Set();
  let camA = 0, camInit = false, cc = 1, cs = 0;
  // monde (x, y, hauteur z) → écran [x, y, échelle]
  const P = (wx, wy, z = 0) => { const dx = wx - CX, dy = wy - CY, vx = dx * cc - dy * cs, vy = dx * cs + dy * cc, s = 1 + vy * PERSP; return [CX + vx * s, CY + vy * K * s - z * s, s]; };
  const Vy = (wx, wy) => (wx - CX) * cs + (wy - CY) * cc;   // profondeur (plus grand = plus près de la caméra)

  const jump = () => { if (!active) return; jseq++; sendInput(performance.now(), true); };
  const sendInput = (now, force) => {
    let ix = 0, iy = 0;
    if (stick) { const m = Math.hypot(stick.dx, stick.dy); if (m > .18) { const k = Math.min(1, (m - .18) / .7) / m; ix = stick.dx * k; iy = stick.dy * k; } }
    else { ix = (keys.has("R") ? 1 : 0) - (keys.has("L") ? 1 : 0); iy = (keys.has("D") ? 1 : 0) - (keys.has("U") ? 1 : 0); if (ix && iy) { ix *= .7071; iy *= .7071; } }
    { const wx = ix * cc + iy * cs, wy = -ix * cs + iy * cc; ix = wx; iy = wy; }     // haut de l'écran = loin de la caméra, quel que soit l'angle
    const str = `${ix.toFixed(2)},${iy.toFixed(2)},${jseq}`;
    if (str === sentStr || (!force && now - sentAt < 55)) return;
    sentStr = str; sentAt = now;
    set(R(`games/${getCode()}/inputs/${getMe().uid}`), str).catch(() => { });
  };

  addEventListener("keydown", e => {
    if (!active || /^(INPUT|TEXTAREA)$/.test(e.target.tagName)) return;
    if (e.key === " " || e.key === "Shift") { e.preventDefault(); if (!e.repeat) jump(); return; }
    const k = KEYS[e.key.length > 1 ? e.key : e.key.toLowerCase()]; if (k) { e.preventDefault(); keys.add(k); }
  });
  addEventListener("keyup", e => { const k = KEYS[e.key.length > 1 ? e.key : e.key.toLowerCase()]; if (k) keys.delete(k); });
  addEventListener("blur", () => { keys.clear(); stick = null; });
  const rel = e => { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) * cv.width / r.width, y: (e.clientY - r.top) * cv.height / r.height }; };
  cv.addEventListener("pointerdown", e => {
    if (!active) return; e.preventDefault();
    if (e.button === 2) return jump();
    if (stick) return;
    try { cv.setPointerCapture(e.pointerId); } catch { }
    const p = rel(e); stick = { id: e.pointerId, ox: p.x, oy: p.y, dx: 0, dy: 0 };
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
  btn.addEventListener("pointerdown", e => { if (!active) return; e.preventDefault(); jump(); });
  document.addEventListener("visibilitychange", () => { if (document.hidden) { keys.clear(); stick = null; } });

  const spark = (px, py, n, col, v) => { for (let i = 0; i < n && parts.length < 160; i++) { const a = Math.random() * PI2, s = v * (.3 + Math.random() * .7); parts.push({ x: px, y: py, vx: Math.cos(a) * s, vy: Math.sin(a) * s, l: 1, c: col, s: 2 + Math.random() * 3 }); } };
  const onEv = e => {
    const [ex, ey, ty, id] = e; if (id <= lastEv) return; lastEv = id;
    const col = pl && pl[e[4]] ? pl[e[4]][2] : "#fff";
    if (ty === -1) { if (e[4] === myIdx) shk = Math.max(shk, 5); rings.push({ x: ex, y: ey, col, t: 0, s: .6 }); spark(ex, ey, 8, col, 110); beep(380, .15, "sine", .05, 760); }
    else if (ty === -3) { rings.push({ x: ex, y: ey, col: "#ff3b5c", t: 0, s: 5 }); spark(ex, ey, 18, "#ff3b5c", 200); beep(160, .35, "square", .06, 900); }
    else if (ty === -2) {
      rings.push({ x: ex, y: ey, col, t: 0, s: 2 }); spark(ex, ey, 22, col, 240); beep(180, .4, "sawtooth", .06, 50);
      fl.push({ x: ex, y: ey, col, t: 0 });
      if (e[4] === myIdx) { hit = .7; if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(150); }
    }
  };

  function sample(rt) {
    const n = snaps.length; if (!n) return null;
    let a = snaps[0], b = a, f = 0;
    if (rt >= snaps[n - 1].at) a = b = snaps[n - 1];
    else if (rt > snaps[0].at) for (let i = n - 1; i > 0; i--) if (snaps[i - 1].at <= rt) { a = snaps[i - 1]; b = snaps[i]; f = (rt - a.at) / Math.max(1, b.at - a.at); break; }
    return { a, b, f };
  }

  // ---- Aides
  const rr = (x0, y0, w, h, r) => { x.beginPath(); x.moveTo(x0 + r, y0); x.arcTo(x0 + w, y0, x0 + w, y0 + h, r); x.arcTo(x0 + w, y0 + h, x0, y0 + h, r); x.arcTo(x0, y0 + h, x0, y0, r); x.arcTo(x0, y0, x0 + w, y0, r); x.closePath(); };
  const pill = (txt, cx, cy, font, fg, bgc, bd) => {
    x.font = font; const w = x.measureText(txt).width + 20, h = parseInt(font.match(/(\d+)px/)[1]) + 10;
    rr(cx - w / 2, cy - h / 2, w, h, h / 2); x.fillStyle = bgc; x.fill(); if (bd) { x.lineWidth = 2; x.strokeStyle = bd; x.stroke(); }
    x.textAlign = "center"; x.textBaseline = "middle"; x.fillStyle = fg; x.fillText(txt, cx, cy + 1);
  };
  function vignette() {
    if (vg) return vg;
    vg = document.createElement("canvas"); vg.width = W; vg.height = H; const g = vg.getContext("2d");
    const gr = g.createRadialGradient(CX, CY, 230, CX, CY, 520); gr.addColorStop(0, "rgba(4,2,16,0)"); gr.addColorStop(1, "rgba(4,2,16,.72)"); g.fillStyle = gr; g.fillRect(0, 0, W, H);
    return vg;
  }

  // ---- Décor
  function background() {
    if (bg) return bg;
    bg = document.createElement("canvas"); bg.width = W; bg.height = H; const g = bg.getContext("2d");
    const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, "#0a0920"); gr.addColorStop(.6, "#190e38"); gr.addColorStop(1, "#2a1352"); g.fillStyle = gr; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 70; i++) { g.fillStyle = `rgba(200,175,255,${.03 + (i % 5) * .02})`; g.beginPath(); g.arc((i * 211) % W, (i * 127) % H, 1 + (i * 7) % 4, 0, 7); g.fill(); }
    const gl = g.createRadialGradient(CX, CY + 40, 40, CX, CY + 40, 420); gl.addColorStop(0, "rgba(120,80,255,.28)"); gl.addColorStop(1, "rgba(120,80,255,0)"); g.fillStyle = gl; g.fillRect(0, 0, W, H);   // halo sous le plateau
    return bg;
  }
  const circ = (r, z, n = 72) => { x.beginPath(); for (let i = 0; i <= n; i++) { const a = i / n * PI2, q = P(CX + Math.cos(a) * r, CY + Math.sin(a) * r, z); i ? x.lineTo(q[0], q[1]) : x.moveTo(q[0], q[1]); } x.closePath(); };
  function floor(r, danger, now) {
    const ry = r * K, rim = danger ? "#ff3b5c" : "#9b8cff", pulse = .5 + .5 * Math.sin(now / 160);
    x.save(); x.translate(10, 12); x.fillStyle = "rgba(0,0,0,.38)"; circ(r + 4, -FT); x.fill(); x.restore();                            // ombre portée
    const sg = x.createLinearGradient(CX - r, 0, CX + r, 0); sg.addColorStop(0, "#2a2168"); sg.addColorStop(.4, "#3a2f80"); sg.addColorStop(1, "#130d33");
    x.fillStyle = sg; for (let z = -FT; z < 0; z += 2) { circ(r, z, 56); x.fill(); }                                                // flanc
    circ(r, -FT, 56); x.lineWidth = 3; x.strokeStyle = danger ? "#7a0f28" : "#463cab"; x.stroke();
    const g = x.createLinearGradient(0, CY - ry * 1.05, 0, CY + ry * 1.05); g.addColorStop(0, "#6657c4"); g.addColorStop(.5, "#3d3289"); g.addColorStop(1, "#262060");
    circ(r, 0); x.fillStyle = g; x.fill();                                                                                          // dessus
    x.save(); circ(r, 0); x.clip();
    x.fillStyle = "rgba(255,255,255,.04)";                                                                                          // damier de secteurs (repères qui tournent avec la caméra)
    for (let k = 0; k < 16; k += 2) { x.beginPath(); const c0 = P(CX, CY); x.moveTo(c0[0], c0[1]); for (let j = 0; j <= 6; j++) { const a = (k + j / 6) / 16 * PI2, q = P(CX + Math.cos(a) * r, CY + Math.sin(a) * r); x.lineTo(q[0], q[1]); } x.closePath(); x.fill(); }
    x.strokeStyle = "rgba(255,255,255,.08)"; x.lineWidth = 2; for (let k = 50; k < r; k += 50) { circ(k, 0, 56); x.stroke(); }
    x.lineWidth = 1; x.strokeStyle = "rgba(255,255,255,.07)"; for (let k = 0; k < 16; k++) { const a = k / 16 * PI2, c0 = P(CX, CY), q = P(CX + Math.cos(a) * r, CY + Math.sin(a) * r); x.beginPath(); x.moveTo(c0[0], c0[1]); x.lineTo(q[0], q[1]); x.stroke(); }
    const hl = x.createRadialGradient(CX, CY - ry * .45, 10, CX, CY - ry * .2, r * 1.05); hl.addColorStop(0, "rgba(255,255,255,.14)"); hl.addColorStop(1, "rgba(255,255,255,0)");   // reflet lustré
    x.fillStyle = hl; x.fillRect(0, 0, W, H);
    if (danger) { const dg = x.createRadialGradient(CX, CY, r * .45, CX, CY, r * 1.05); dg.addColorStop(0, "rgba(255,59,92,0)"); dg.addColorStop(1, `rgba(255,59,92,${(.12 + .18 * pulse).toFixed(2)})`); x.fillStyle = dg; x.fillRect(0, 0, W, H); }   // le bord rougeoie
    x.restore();
    x.save(); x.shadowColor = rim; x.shadowBlur = danger ? 16 + 10 * pulse : 14; circ(r - 1, 0); x.lineWidth = 6; x.strokeStyle = rim; x.stroke(); x.restore();   // bord néon
    circ(r - 8, 0); x.lineWidth = 1.5; x.strokeStyle = "rgba(255,255,255,.3)"; x.stroke();
  }

  // ---- Volumes
  const poly = (c, z, dx = 0, dy = 0) => { x.beginPath(); c.forEach((p, i) => { const q = P(p[0], p[1], z); i ? x.lineTo(q[0] + dx, q[1] + dy) : x.moveTo(q[0] + dx, q[1] + dy); }); x.closePath(); };
  const quad = (ax, ay, bx, by, hw) => { const dx = bx - ax, dy = by - ay, m = Math.hypot(dx, dy) || 1, nx = -dy / m * hw, ny = dx / m * hw; return [[ax + nx, ay + ny], [bx + nx, by + ny], [bx - nx, by - ny], [ax - nx, ay - ny]]; };
  function box(c, top, side, mid) {                           // poutre : flancs empilés, dessus, reflet
    x.fillStyle = side; x.strokeStyle = "#2b0016"; x.lineWidth = 1.5;
    poly(c, 0); x.fill(); x.stroke();
    for (let z = 2; z < BH; z += 2) { poly(c, z); x.fill(); }
    poly(c, BH); x.fillStyle = top; x.fill(); x.stroke();
    const m0 = P(mid[0], mid[1], BH), m1 = P(mid[2], mid[3], BH);
    x.strokeStyle = "rgba(255,255,255,.35)"; x.lineWidth = 2; x.beginPath(); x.moveTo(m0[0], m0[1]); x.lineTo(m1[0], m1[1]); x.stroke();
  }
  function cyl(wx, wy, r, hg, top, side, rim, lw) {           // cylindre (base du moyeu, bout de la barre)
    const [sx, sy, s] = P(wx, wy), rx = r * s, ry = r * s * K;
    x.fillStyle = side; for (let z = 0; z < hg; z += 2) { x.beginPath(); x.ellipse(sx, sy - z * s, rx, ry, 0, 0, 7); x.fill(); }
    x.beginPath(); x.ellipse(sx, sy - hg * s, rx, ry, 0, 0, 7); x.fillStyle = top; x.fill(); x.lineWidth = lw; x.strokeStyle = rim; x.stroke();
  }
  function head(eye) {                                         // le moyeu : une grosse tête malicieuse, debout, qui regarde le joueur le plus proche
    cyl(CX, CY, 27, 8, "#3a0b24", "#2b0016", "#ff3b5c", 3);
    const [sx, sy, s] = P(CX, CY, 8 + 20), R0 = 22;
    x.save(); x.translate(sx, sy); x.scale(s, s);
    const g = x.createRadialGradient(-7, -9, 2, 0, 0, R0 * 1.1); g.addColorStop(0, "#7a1a48"); g.addColorStop(.5, "#3a0b24"); g.addColorStop(1, "#1a0010");
    x.fillStyle = g; x.beginPath(); x.arc(0, 0, R0, 0, 7); x.fill(); x.lineWidth = 3; x.strokeStyle = "#ff3b5c"; x.stroke();
    const dx = Math.cos(eye) * 2.8, dy = Math.sin(eye) * 2.4;
    [-1, 1].forEach(k => {
      x.fillStyle = "#fff"; x.beginPath(); x.ellipse(k * 8, -3, 6, 6.8, 0, 0, 7); x.fill();
      x.fillStyle = "#14102b"; x.beginPath(); x.arc(k * 8 + dx, -3 + dy, 3.2, 0, 7); x.fill();
      x.strokeStyle = "#ff3b5c"; x.lineWidth = 3; x.lineCap = "round"; x.beginPath(); x.moveTo(k * 14, -13); x.lineTo(k * 3, -8); x.stroke();   // sourcils en colère
    });
    x.strokeStyle = "#fff"; x.lineWidth = 2.2; x.beginPath(); x.arc(0, 7, 8, .2, Math.PI - .2); x.stroke(); x.lineCap = "butt";
    x.fillStyle = "rgba(255,255,255,.18)"; x.beginPath(); x.ellipse(-8, -14, 7, 3.5, -.5, 0, 7); x.fill();                                    // reflet
    x.restore();
  }
  /* Personnage : petit « haricot » rond et haut, pieds, reflet, joues, bouche, étirement au saut.
     (sx, gy) = point au sol, sc = échelle de perspective, fa = direction du regard DANS LA VUE, st = étirement (> 1 en l'air). */
  function sprite(sx, gy, sc, col, fa, st) {
    x.globalAlpha = 1;
    const r = BR * sc, w = r * (1.02 / Math.sqrt(st)), hh = r * 1.3 * st, cy = gy - hh + r * .15, fx = Math.cos(fa), fy = Math.sin(fa);
    x.fillStyle = sh(col, .5); x.strokeStyle = "rgba(10,5,30,.7)"; x.lineWidth = 1.5;
    [-1, 1].forEach(k => { x.beginPath(); x.ellipse(sx + k * w * .42, gy - r * .12, r * .34, r * .2, 0, 0, 7); x.fill(); x.stroke(); });                // pieds
    const g = x.createRadialGradient(sx - w * .4, cy - hh * .5, 1, sx, cy, hh * 1.15);
    g.addColorStop(0, sh(col, -.62)); g.addColorStop(.4, col); g.addColorStop(1, sh(col, .5));
    x.fillStyle = g; x.beginPath(); x.ellipse(sx, cy, w, hh, 0, 0, 7); x.fill();
    x.lineWidth = 3.5; x.strokeStyle = "rgba(10,5,30,.85)"; x.stroke();
    x.lineWidth = 2; x.strokeStyle = "rgba(255,255,255,.28)"; x.beginPath(); x.ellipse(sx, cy, w - 3, hh - 3, 0, -.5, 1.05); x.stroke();                       // liseré de lumière côté soleil
    const al = Math.max(0, Math.min(1, (fy + .4) / .5));                                                                                       // de dos : on ne voit plus le visage
    if (al > 0) {
      x.globalAlpha = al; const ex = sx + fx * w * .5, ey = cy - hh * .22 + Math.max(0, fy) * hh * .08, sp = w * (.2 + .22 * Math.max(0, fy)), er = r * .3;
      x.fillStyle = "rgba(255,110,140,.32)"; [-1, 1].forEach(k => { x.beginPath(); x.ellipse(ex + k * sp * 1.3, ey + er * 1.5, er * .55, er * .32, 0, 0, 7); x.fill(); });   // joues
      [-1, 1].forEach(k => {
        const px = ex + k * sp, qx = px + fx * er * .35, qy = ey + fy * er * .35;
        x.fillStyle = "#fff"; x.beginPath(); x.ellipse(px, ey, er, er * 1.2, 0, 0, 7); x.fill();
        x.fillStyle = "#14102b"; x.beginPath(); x.ellipse(qx, qy, er * .55, er * .68, 0, 0, 7); x.fill();
        x.fillStyle = "#fff"; x.beginPath(); x.arc(qx - er * .15, qy - er * .22, er * .16, 0, 7); x.fill();                                         // éclat dans l'œil
      });
      x.strokeStyle = "#14102b"; x.fillStyle = "#14102b"; x.lineWidth = 1.8;
      if (st > 1.03) { x.beginPath(); x.ellipse(ex, ey + er * 2, er * .5, er * .62, 0, 0, 7); x.fill(); }                                         // bouche ouverte en l'air
      else { x.beginPath(); x.arc(ex, ey + er * 1.55, er * .6, .2 * Math.PI, .8 * Math.PI); x.stroke(); }                                          // petit sourire
      x.globalAlpha = 1;
    }
    x.fillStyle = "rgba(255,255,255,.5)"; x.beginPath(); x.ellipse(sx - w * .42, cy - hh * .58, w * .2, hh * .13, -.55, 0, 7); x.fill();      // reflet
    x.globalAlpha = 1;
  }
  function setOv(t) {
    if (t === ovT) return; ovT = t; ov.textContent = t;
    ov.style.fontSize = t.length <= 6 ? "min(72px,14vw)" : "min(30px,6vw)";
  }

  function frame(now) {
    if (!active) { raf = 0; return; }
    raf = requestAnimationFrame(frame);
    const dt = Math.min(.05, (now - (tPrev || now)) / 1000); tPrev = now;
    sendInput(now);
    const T = (ax, ay) => x.setTransform(cv.width / W, 0, 0, cv.height / H, ax * cv.width / W, ay * cv.height / H);   // décalage de caméra (le décor de fond et l'interface restent fixes)
    T(0, 0);
    x.globalAlpha = 1;
    x.drawImage(background(), 0, 0);
    for (let i = 0; i < 36; i++) { x.globalAlpha = .2 + .4 * Math.sin(now / 600 + i * 1.7) ** 2; x.fillStyle = "#cdb8ff"; const z = 1 + (i % 3) * .6; x.fillRect((i * 173 + 40) % W, (i * 97 + 20) % H, z, z); }   // étoiles qui scintillent
    x.globalAlpha = 1;
    const sm = sample(now - 110);
    if (!sm) return setOv("");
    const { a, b, f } = sm, last = snaps[snaps.length - 1].s, sa = a.s, sb = b.s, rad = last.r || 230;
    snaps.forEach(sn => { if (!sn.done && sn.at <= now - 110) { sn.done = true; (sn.s.ev || []).forEach(onEv); } });
    const A = last.ab === undefined ? -1 : last.ab;

    // caméra : du côté de mon personnage, mouvement doux ; le saut ne la bouge pas
    const mi = sa.p[myIdx], mj = sb.p[myIdx];
    if (mi && mi[2]) {
      const mx = mj && mj[2] ? mi[0] + (mj[0] - mi[0]) * f : mi[0], my = mj && mj[2] ? mi[1] + (mj[1] - mi[1]) * f : mi[1], ddx = mx - CX, ddy = my - CY;
      if (Math.hypot(ddx, ddy) > 40) { const tg = Math.PI / 2 - Math.atan2(ddy, ddx); camA = camInit ? camA + wrap(tg - camA) * Math.min(1, dt * 3.5) : tg; camInit = true; }
    }
    cc = Math.cos(camA); cs = Math.sin(camA);
    shk = Math.max(0, shk - dt * 32);                                                  // tremblement façon Stumble Guys : sec, court, qui s'éteint vite
    const shx = Math.sin(now * .19) * shk, shy = Math.cos(now * .23) * shk * .8;
    T(shx, shy);
    floor(rad, last.s >= 0, now);
    rings = rings.filter(o => (o.t += dt) < .65);                                                       // ondes de choc au sol (saut, atterrissage, mort, capacité)
    rings.forEach(o => { const k = o.t / .65, q = P(o.x, o.y), r0 = (12 + 44 * k * (o.s || 1)) * q[2]; x.globalAlpha = (1 - k) * .85; x.lineWidth = 3 * (1 - k) + 1; x.strokeStyle = o.col; x.beginPath(); x.ellipse(q[0], q[1], r0, r0 * K, 0, 0, 7); x.stroke(); });
    x.globalAlpha = 1;

    let eye = sa.a, bd = 1e9;
    const barA = sa.a + (sb.a - sa.a) * f, barL = ((sa.l || 1) + ((sb.l || 1) - (sa.l || 1)) * f) * (rad - 4);
    const tr = Math.max(-1.2, Math.min(1.2, wrap(sb.a - sa.a) * 4));   // traînée de la barre (où elle était il y a un instant)
    sa.p.forEach(p => { if (p[2]) { const d = Math.hypot(p[0] - CX, p[1] - CY); if (d < bd) { bd = d; eye = Math.atan2(p[1] - CY, p[0] - CX); } } });

    fl = fl.filter(o => (o.t += dt) < .8);
    fl.forEach(o => { const k = 1 - o.t / .8, q = P(o.x, o.y); x.save(); x.globalAlpha = k; x.translate(q[0], q[1] - 20 * q[2]); x.scale(k, k); x.rotate(o.t * 8); sprite(0, 20 * q[2], q[2], o.col, Math.PI / 2, 1); x.restore(); });
    x.globalAlpha = 1;

    if (pl) {
      const shad = [], list = [], top = [], labels = [], hwv = last.w || HW;
      const addBar = (ba, L, al, tr) => {
        const ux = Math.cos(ba), uy = Math.sin(ba);
        shad.push(() => { x.globalAlpha = al; x.fillStyle = "rgba(0,0,0,.34)"; poly(quad(CX, CY, CX + ux * L, CY + uy * L, hwv), 0, 10, 5); x.fill(); x.globalAlpha = 1; });
        if (Math.abs(tr) > .015) shad.push(() => {
          const c0 = P(CX, CY);
          [[1, .08], [.6, .1], [.28, .13]].forEach(([m, aa]) => {
            x.fillStyle = `rgba(255,59,92,${(aa * al).toFixed(3)})`; x.beginPath(); x.moveTo(c0[0], c0[1]);
            for (let j = 0; j <= 8; j++) { const a2 = ba - tr * m * j / 8, q = P(CX + Math.cos(a2) * L, CY + Math.sin(a2) * L); x.lineTo(q[0], q[1]); }
            x.closePath(); x.fill();
          });
        });
        for (let k = 0, i = 0; k < L; k += 28, i++) {
          const k2 = Math.min(L, k + 28), ax = CX + ux * k, ay = CY + uy * k, bx = CX + ux * k2, by = CY + uy * k2, c = quad(ax, ay, bx, by, hwv), mid = [ax, ay, bx, by];
          list.push({ d: Vy((ax + bx) / 2, (ay + by) / 2), al, fn: () => i % 2 ? box(c, "#ffd23f", "#b8921a", mid) : box(c, "#ff3b5c", "#a01535", mid) });
        }
        list.push({ d: Vy(CX + ux * L, CY + uy * L) + 1, al, fn: () => {
          const q = P(CX + ux * L, CY + uy * L, BH + 3), rg = 30 * q[2];
          x.save(); x.globalCompositeOperation = "lighter"; const g = x.createRadialGradient(q[0], q[1], 2, q[0], q[1], rg); g.addColorStop(0, "rgba(255,80,110,.55)"); g.addColorStop(1, "rgba(255,80,110,0)"); x.fillStyle = g; x.fillRect(q[0] - rg, q[1] - rg, rg * 2, rg * 2); x.restore();   // halo du bout
          cyl(CX + ux * L, CY + uy * L, hwv + 3, BH + 3, "#ff3b5c", "#a01535", "#2b0016", 2);
        } });
      };
      if (A === 2) addBar(Math.PI - barA, barL, .78, -tr);
      if (A === 3) addBar(barA + Math.PI, barL, 1, tr);
      addBar(barA, barL, A === 1 ? .1 : 1, tr);
      shad.push(() => { const q = P(CX, CY); x.fillStyle = "rgba(0,0,0,.34)"; x.beginPath(); x.ellipse(q[0] + 11, q[1] + 5, 30 * q[2], 30 * q[2] * K, 0, 0, 7); x.fill(); });
      list.push({ d: 26, al: 1, fn: () => head(eye + camA) });

      sa.p.forEach((qa, i) => {
        const qb = sb.p[i]; if (!qa[2] || !pl[i]) return;
        const wx = qb && qb[2] ? qa[0] + (qb[0] - qa[0]) * f : qa[0], wy = qb && qb[2] ? qa[1] + (qb[1] - qa[1]) * f : qa[1];
        if (qb && Math.hypot(qb[0] - qa[0], qb[1] - qa[1]) > .6) ang[i] = Math.atan2(qb[1] - qa[1], qb[0] - qa[0]);
        if (qa[4] && !jt[i]) jt[i] = now; if (!qa[4] && jt[i]) { jt[i] = 0; rings.push({ x: wx, y: wy, col: pl[i][2], t: 0, s: .7 }); if (i === myIdx) shk = Math.max(shk, 3); }
        const u = jt[i] ? Math.min(1, (now - jt[i]) / ((last.jd || .5) * 1000)) : 0, h = JH * Math.sin(Math.PI * u), st = jt[i] ? 1 + .13 * Math.abs(Math.cos(Math.PI * u)) : 1;
        const col = pl[i][2], me = i === myIdx, [px, gy, sc] = P(wx, wy), sk = Math.max(.45, 1 - h / 100);
        shad.push(() => {
          x.save(); x.globalCompositeOperation = "lighter"; x.translate(px, gy); x.scale(1, K);                                  // halo coloré au sol
          const gg = x.createRadialGradient(0, 0, 2, 0, 0, 44 * sc); gg.addColorStop(0, rgba(col, me ? .42 : .22)); gg.addColorStop(1, rgba(col, 0)); x.fillStyle = gg; x.beginPath(); x.arc(0, 0, 44 * sc, 0, 7); x.fill(); x.restore();
          x.fillStyle = `rgba(0,0,0,${(.45 * sk).toFixed(2)})`; x.beginPath(); x.ellipse(px, gy, BR * sk * 1.1 * sc, BR * sk * 1.1 * sc * K, 0, 0, 7); x.fill();
          if (me) {                                            // anneau de recharge du saut, posé au sol
            const cdv = last.p[i] ? last.p[i][3] / 100 : 0, rr = (BR + 8) * sc;
            x.lineWidth = 3; x.strokeStyle = cdv <= 0 ? "#3ee6c4" : "rgba(255,255,255,.5)";
            x.beginPath(); x.ellipse(px, gy, rr, rr * K, 0, -Math.PI / 2, -Math.PI / 2 + PI2 * (1 - cdv)); x.stroke();
          }
        });
        const it = { d: Vy(wx, wy) + .5, al: 1, fn: () => sprite(px, gy - h * sc, sc, col, (ang[i] || 0) + camA, st) };
        (h >= 10 ? top : list).push(it);
        labels.push(() => {
          const ly = gy - h * sc - BR * sc * 2.6 * st - 8;
          pill(pl[i][1], px, ly, "700 13px 'DM Sans',sans-serif", me ? "#ffd23f" : "#fff", "rgba(10,5,30,.62)", me ? "#ffd23f" : rgba(col, .8));
          if (me) { x.fillStyle = "#ffd23f"; x.fillText("▼", px, ly - 20); }
          x.textAlign = "start"; x.textBaseline = "alphabetic";
        });
      });

      shad.forEach(fn => fn());
      list.sort((u, v) => u.d - v.d).forEach(it => { x.globalAlpha = it.al; it.fn(); x.globalAlpha = 1; });
      top.forEach(it => it.fn());
      labels.forEach(fn => fn());
      T(0, 0);                                                         // l'interface ne tremble pas

      x.drawImage(vignette(), 0, 0);
      if (A >= 0) { const g = x.createRadialGradient(CX, CY, 200, CX, CY, 470); g.addColorStop(0, `rgba(${ACR[A]},0)`); g.addColorStop(1, `rgba(${ACR[A]},${(.2 + .1 * Math.sin(now / 120)).toFixed(2)})`); x.fillStyle = g; x.fillRect(0, 0, W, H); }   // bords colorés selon la capacité
      if (hit > 0) { hit -= dt; const g = x.createRadialGradient(CX, CY, 120, CX, CY, 480); g.addColorStop(0, "rgba(255,20,60,0)"); g.addColorStop(1, `rgba(255,20,60,${Math.min(.6, hit).toFixed(2)})`); x.fillStyle = g; x.fillRect(0, 0, W, H); }   // flash rouge quand on meurt
      if (A >= 0 && !last.o) pill(`${AB[A]} · ${last.at.toFixed(1)} s`, CX, 26, "800 22px 'Bricolage Grotesque',sans-serif", "#fff", "rgba(10,5,30,.7)", Math.floor(now / 150) % 2 ? AC[A] : "#fff");

      x.font = "700 14px 'DM Sans',sans-serif"; x.textAlign = "start"; x.textBaseline = "middle";
      last.p.forEach((q, i) => {
        const y = 18 + i * 20, t = pl[i][1] + (q[2] ? "" : " ✖");
        x.globalAlpha = q[2] ? 1 : .45; rr(6, y - 11, x.measureText(t).width + 38, 22, 11); x.fillStyle = "rgba(10,5,30,.5)"; x.fill();
        x.fillStyle = pl[i][2]; x.beginPath(); x.arc(18, y, 6, 0, 7); x.fill(); x.lineWidth = 1.5; x.strokeStyle = "rgba(255,255,255,.6)"; x.stroke();
        x.fillStyle = "#fff"; x.fillText(t, 30, y);
      });
      x.globalAlpha = 1; x.textAlign = "right"; x.textBaseline = "alphabetic"; x.font = "600 13px 'DM Sans',sans-serif"; x.lineWidth = 3; x.strokeStyle = "rgba(0,0,0,.6)"; x.fillStyle = "#ffe9a8";
      (last.kf || []).slice(-4).forEach((t, i) => { x.strokeText(t, W - 12, 18 + i * 18); x.fillText(t, W - 12, 18 + i * 18); });
      if (last.s >= 0 && !last.o) pill(`⏱️ Tiens encore ${last.s.toFixed(1)} s !`, CX, H - 24, "800 20px 'Bricolage Grotesque',sans-serif", "#fff", Math.floor(now / 200) % 2 ? "rgba(255,59,92,.85)" : "rgba(10,5,30,.75)", "#fff");
      x.textAlign = "start"; x.textBaseline = "alphabetic";
      const mq = last.p[myIdx], rdy = !mq || !mq[2] || mq[3] > 0, op = rdy ? ".45" : "1"; if (btn.style.opacity !== op) btn.style.opacity = op;
    }

    T(shx, shy);
    parts = parts.filter(o => (o.l -= dt * 2.2) > 0);
    parts.forEach(o => { o.x += o.vx * dt; o.y += o.vy * dt; const q = P(o.x, o.y, 8); x.globalAlpha = Math.max(0, o.l); x.fillStyle = o.c; x.beginPath(); x.arc(q[0], q[1], o.s * o.l * q[2], 0, 7); x.fill(); });
    x.globalAlpha = 1; T(0, 0);
    if (stick) {
      x.fillStyle = "rgba(255,255,255,.08)"; x.strokeStyle = "rgba(255,255,255,.28)"; x.lineWidth = 2; x.beginPath(); x.arc(stick.ox, stick.oy, 55, 0, 7); x.fill(); x.stroke();
      x.fillStyle = "rgba(255,255,255,.65)"; x.beginPath(); x.arc(stick.ox + stick.dx * 55, stick.oy + stick.dy * 55, 22, 0, 7); x.fill();
    }
    setOv(last.cd ? String(last.cd) : last.o ? (last.msg || "Fin de partie") : last.t < .9 ? "GO !" : "");
  }

  return {
    enter(c) {
      active = true; snaps = []; pl = null; lastEv = 0; fl = []; parts = []; ang = []; jt = []; jseq = 0; sentStr = ""; sentAt = 0; stick = null; keys.clear(); tPrev = 0; myIdx = -1; ovT = "\u0000"; rings = []; hit = 0; shk = 0; camA = 0; camInit = false; cc = 1; cs = 0;
      $("ghelp").textContent = "ZQSD / WASD / flèches : bouger · Espace ou clic droit : sauter 🦘 par-dessus la barre · glisse sur mobile";
      const myUid = getMe().uid;
      set(R(`games/${c}/inputs/${myUid}`), "0,0,0").catch(() => { });
      const un = onValue(R(`games/${c}/state`), snap => {
        const v = snap.val(); if (!v) return; let s; try { s = JSON.parse(v); } catch { return; }
        if (s.k !== "barre") return;
        if (s.pl) { pl = s.pl; myIdx = pl.findIndex(p => p[0] === myUid); }
        const at = Math.max(performance.now(), snaps.length ? snaps[snaps.length - 1].at + 1 : 0);
        snaps.push({ at, s, done: false }); if (snaps.length > 14) snaps.shift();
      });
      raf = requestAnimationFrame(frame);
      return () => {
        active = false; un(); if (raf) cancelAnimationFrame(raf); raf = 0; keys.clear(); stick = null; ov.textContent = ""; ovT = "";
        x.setTransform(1, 0, 0, 1, 0, 0); x.globalAlpha = 1; x.setLineDash([]); x.textBaseline = "alphabetic"; x.textAlign = "start";
      };
    }
  };
}
