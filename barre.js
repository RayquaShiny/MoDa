/* MoDa : « La barre malicieuse » 🌀 : une barre tourne sur le plateau, ne la touche pas !
   - Le dernier en vie gagne. S'il ne tient pas 5 s tout seul face à la barre, c'est la BARRE qui gagne.
   - La barre accélère avec le temps et joue des feintes : freinage trompeur puis coup de fouet, demi-tour,
     arrêt net, zigzag, rétractation puis jaillissement.
   - Capacités spéciales : turbo x2 pour tous, barre fantôme, mirage (fausse barre), double barre, commandes inversées.
   - Chaque joueur peut SAUTER 🦘 (Espace, bouton, clic droit) : on passe au-dessus de la barre (0,5 s, recharge 1,8 s).
   - Même fonctionnement que Sumo Arena : l'hôte simule (30 pas/s) et publie games/<code>/state ; chacun écrit
     « ax,ay,compteurSaut » dans games/<code>/inputs/<uid>. Aucun nouveau chemin Firebase. */

const W = 800, H = 560, CX = 400, CY = 285, BR = 16, HW = 8;
const ACC = 900, DAMP = 3.0, DT = 1 / 30, JUMP_T = .5, JUMP_CD = 1.8, SOLO = 5, PI2 = Math.PI * 2;
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
  (b, d) => [[d * b * 2, .35, .7], [d * b * 2, .35, 1], [d * b * 2, .35, .6], [d * b * 3, .6, 1]] // pulsation : la pointe respire
];
// Capacités spéciales (une à la fois, annoncées en haut de l'écran) : [nom, durée en s]
const ABS = [["⚡ TURBO x2 : tout le monde !", 4], ["👻 Barre fantôme", 3], ["🪞 Mirage : laquelle est la vraie ?", 4], ["🌀 Double barre", 4], ["🔀 Commandes inversées", 3.5]];

// ---------------------------------------------------------------- Hôte
export async function startBarre(env) {
  const { R, update, remove, set, onValue, increment, getCode, getLobby, getMe, toast } = env;
  const c = getCode(), lob = getLobby() || {}, players = env.bots ? env.bots(lob) : lob.players || {}, ids = Object.keys(players);
  const isBot = u => u.indexOf("bot_") === 0;
  if (ids.length < 2) return toast("Il faut au moins 2 joueurs pour lancer La barre malicieuse (ajoute un bot 🤖 dans le lobby)");
  await remove(R(`games/${c}`));
  await update(R(`lobbies/${c}`), { status: "playing" });

  const rad = 170 + ids.length * 10, P = {}, I = {}, seen = {};
  let t = 0, ang = Math.random() * PI2, om = 0, tOm = 1.2, dir = Math.random() < .5 ? 1 : -1, len = 1, tLen = 1;
  let ab = -1, abT = 0, abNext = 8, lastAb = -1, q = [], curT = 0, gap = 2, solo = -1, res, evId = 0, evs = [], kf = [], pubN = 0;
  const off = Math.random() * PI2;
  ids.forEach((u, i) => {                                   // départ en cercle, à mi-rayon
    const a = off + i / ids.length * PI2, d = rad * .6;
    P[u] = { n: players[u].name, c: players[u].color, x: CX + Math.cos(a) * d, y: CY + Math.sin(a) * d, vx: 0, vy: 0, a: 1, cd: 0, j: 0 };
    I[u] = { ax: 0, ay: 0, d: 0, want: 0 };
  });
  const alive = () => ids.filter(u => P[u].a);
  const ev = (x, y, ty, ...r) => evs.push({ e: [Math.round(x), Math.round(y), ty, ++evId, ...r], u: pubN + 4 });
  const base = () => Math.min(2.6, 1.2 + t * .025) * (solo >= 0 ? 1.35 : 1);

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
    if (p.cd <= 0 && pr < L + BR && Math.abs(d) < .55 && om * d > 0 && Math.abs(d) / (Math.abs(om) || 1) < .4 && Math.random() < .8) i.want = .25;
    const ta = ang + Math.PI + om * .35, tr = rad * b.r;
    const vx = CX + Math.cos(ta) * tr - p.x, vy = CY + Math.sin(ta) * tr - p.y, m = Math.hypot(vx, vy) || 1;
    i.ax = vx / m + (Math.random() - .5) * .3; i.ay = vy / m + (Math.random() - .5) * .3;
  };

  const step = () => {
    ids.forEach(u => { if (isBot(u) && P[u].a) bot(u); });
    t += DT;
    // --- capacités spéciales : la première à 8 s, puis toutes les 6 à 10 s (4 à 6 s quand il ne reste qu'un joueur)
    if (ab >= 0) { if ((abT -= DT) <= 0) { ab = -1; abNext = t + (solo >= 0 ? 4 + Math.random() * 2 : 6 + Math.random() * 4); } }
    else if (t >= abNext) {
      do ab = Math.floor(Math.random() * ABS.length); while (ab === lastAb); lastAb = ab; abT = ABS[ab][1];
      kf.push([ABS[ab][0], pubN + 40]); ev(CX, CY, -3, ab);
    }
    const dtp = DT * (ab === 0 ? 2 : 1), sg = ab === 4 ? -1 : 1;   // turbo : le temps file x2 pour la barre ET les joueurs
    // --- la barre et ses feintes
    if (curT > 0) curT -= dtp;
    else if (q.length) { const s = q.shift(); tOm = s[0]; tLen = s[2] || 1; curT = s[1]; }
    else { tOm = dir * base(); tLen = 1; if ((gap -= dtp) <= 0) { const m = Math.floor(Math.random() * MOVES.length); if (m === 1) dir = -dir; q = MOVES[m](base(), dir); gap = .5 + Math.random() * 1.1; } }
    om += clamp(tOm - om, 9 * dtp); len += clamp(tLen - len, 1.2 * dtp);
    const a0 = ang; ang += om * dtp;
    // --- joueurs
    const al = alive();
    al.forEach(u => {
      const p = P[u], i = I[u];
      if (p.cd > 0) p.cd = Math.max(0, p.cd - DT);
      if (p.j > 0) p.j = Math.max(0, p.j - DT);
      if (i.want > 0) { i.want -= DT; if (p.cd <= 0) { p.j = JUMP_T; p.cd = JUMP_CD; i.want = 0; ev(p.x, p.y, -1, ids.indexOf(u)); } }
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
    for (let k = 1; k <= 6; k++) for (const arm of ab === 3 ? [0, Math.PI] : [0]) {   // double barre : 2 bras mortels
      const aa = a0 + (ang - a0) * k / 6 + arm, ux = Math.cos(aa), uy = Math.sin(aa);
      alive().forEach(u => {
        const p = P[u]; if (p.j > 0) return;                    // en l'air : intouchable
        const s = Math.max(0, Math.min(L, (p.x - CX) * ux + (p.y - CY) * uy));
        if (Math.hypot(p.x - CX - ux * s, p.y - CY - uy * s) < BR * .85 + HW) die(u);
      });
    }
    // --- règle des 5 secondes
    const n = alive().length;
    if (n === 0) res = null;                                     // plus personne : la barre gagne
    else if (n === 1) {
      if (solo < 0) { solo = SOLO; kf.push([`⏱️ ${P[alive()[0]].n} doit tenir ${SOLO} s !`, pubN + 40]); }
      else if ((solo -= DT) <= 0) res = alive()[0];
    }
  };

  const pub = (x = {}) => {
    pubN++;
    evs = evs.filter(o => o.u >= pubN); kf = kf.filter(e => e[1] > pubN);
    const o = {
      k: "barre", t: +t.toFixed(1), ab, at: ab >= 0 ? +abT.toFixed(1) : 0, a: +ang.toFixed(3), l: +len.toFixed(2), r: rad, s: solo >= 0 ? +Math.max(0, solo).toFixed(1) : -1,
      p: ids.map(u => { const p = P[u]; return [+p.x.toFixed(1), +p.y.toFixed(1), p.a, Math.round(p.cd / JUMP_CD * 100), p.j > 0 ? 1 : 0]; }),
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
const sh = (h, k) => { const m = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) || 0).map(v => Math.round(k > 0 ? v * (1 - k) : v + (255 - v) * -k)); return `rgb(${m})`; };

export function createBarreClient(env) {
  const { R, set, onValue, $, beep, getMe, getCode } = env;
  const cv = $("cv"), x = cv.getContext("2d"), btn = $("sdash"), ov = $("ov");
  let active = false, raf = 0, snaps = [], pl = null, lastEv = 0, parts = [], fl = [], jt = [], ang = [], jseq = 0, sentStr = "", sentAt = 0, stick = null, tPrev = 0, myIdx = -1, ovT = "", bg = null;
  const keys = new Set();

  const jump = () => { if (!active) return; jseq++; sendInput(performance.now(), true); };
  const sendInput = (now, force) => {
    let ix = 0, iy = 0;
    if (stick) { const m = Math.hypot(stick.dx, stick.dy); if (m > .18) { const k = Math.min(1, (m - .18) / .7) / m; ix = stick.dx * k; iy = stick.dy * k; } }
    else { ix = (keys.has("R") ? 1 : 0) - (keys.has("L") ? 1 : 0); iy = (keys.has("D") ? 1 : 0) - (keys.has("U") ? 1 : 0); if (ix && iy) { ix *= .7071; iy *= .7071; } }
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
    if (ty === -1) { spark(ex, ey, 8, col, 110); beep(380, .15, "sine", .05, 760); }
    else if (ty === -3) { spark(ex, ey, 18, "#ff3b5c", 200); beep(160, .35, "square", .06, 900); }
    else if (ty === -2) {
      spark(ex, ey, 14, col, 220); beep(180, .4, "sawtooth", .06, 50);
      fl.push({ x: ex, y: ey, col, t: 0 });
      if (e[4] === myIdx && typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(150);
    }
  };

  function sample(rt) {
    const n = snaps.length; if (!n) return null;
    let a = snaps[0], b = a, f = 0;
    if (rt >= snaps[n - 1].at) a = b = snaps[n - 1];
    else if (rt > snaps[0].at) for (let i = n - 1; i > 0; i--) if (snaps[i - 1].at <= rt) { a = snaps[i - 1]; b = snaps[i]; f = (rt - a.at) / Math.max(1, b.at - a.at); break; }
    return { a, b, f };
  }

  function background() {
    if (bg) return bg;
    bg = document.createElement("canvas"); bg.width = W; bg.height = H; const g = bg.getContext("2d");
    const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, "#0b0a1f"); gr.addColorStop(1, "#1c0f3a"); g.fillStyle = gr; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 50; i++) { g.fillStyle = `rgba(190,160,255,${.04 + (i % 5) * .02})`; g.beginPath(); g.arc((i * 211) % W, (i * 127) % H, 2 + (i * 7) % 5, 0, 7); g.fill(); }
    return bg;
  }
  function floor(r, danger) {
    x.fillStyle = "#171235"; x.beginPath(); x.arc(CX, CY + 14, r, 0, 7); x.fill();
    const g = x.createRadialGradient(CX, CY - r * .3, r * .1, CX, CY, r); g.addColorStop(0, "#4a3f95"); g.addColorStop(1, "#2c2663");
    x.fillStyle = g; x.beginPath(); x.arc(CX, CY, r, 0, 7); x.fill();
    x.strokeStyle = "rgba(255,255,255,.07)"; x.lineWidth = 2;
    for (let k = 40; k < r; k += 40) { x.beginPath(); x.arc(CX, CY, k, 0, 7); x.stroke(); }
    x.lineWidth = 5; x.strokeStyle = danger ? "#ff3b5c" : "#9b8cff"; x.beginPath(); x.arc(CX, CY, r - 1, 0, 7); x.stroke();
  }
  function bar(a, L, now, eye, al = 1, hub = true) {
    x.save(); x.globalAlpha = al; x.translate(CX, CY); x.rotate(a);
    x.fillStyle = "rgba(0,0,0,.35)"; x.fillRect(0, -HW + 9, L, HW * 2);
    for (let k = 0, i = 0; k < L; k += 28, i++) { x.fillStyle = i % 2 ? "#ffd23f" : "#ff3b5c"; x.fillRect(k, -HW, Math.min(28, L - k), HW * 2); }
    x.strokeStyle = "#2b0016"; x.lineWidth = 2; x.strokeRect(0, -HW, L, HW * 2);
    x.fillStyle = "#ff3b5c"; x.beginPath(); x.arc(L, 0, HW + 3, 0, 7); x.fill(); x.stroke();
    x.restore(); if (!hub) return;
    x.fillStyle = "#2b0016"; x.beginPath(); x.arc(CX, CY, 24, 0, 7); x.fill();      // moyeu : un visage malicieux
    x.strokeStyle = "#ff3b5c"; x.lineWidth = 3; x.stroke();
    const dx = Math.cos(eye), dy = Math.sin(eye);
    [-1, 1].forEach(s => {
      x.fillStyle = "#fff"; x.beginPath(); x.arc(CX + s * 9, CY - 3, 6, 0, 7); x.fill();
      x.fillStyle = "#14102b"; x.beginPath(); x.arc(CX + s * 9 + dx * 2.5, CY - 3 + dy * 2.5, 3, 0, 7); x.fill();
      x.strokeStyle = "#ff3b5c"; x.lineWidth = 2.5; x.beginPath(); x.moveTo(CX + s * 15, CY - 12 + 0); x.lineTo(CX + s * 3, CY - 8 - 0); x.stroke(); // sourcils en colère
    });
    x.strokeStyle = "#fff"; x.lineWidth = 2; x.beginPath(); x.arc(CX, CY + 5, 8, .15, Math.PI - .15); x.stroke();
  }
  function ball(px, py, col, a, h) {
    x.fillStyle = "rgba(0,0,0,.35)"; x.beginPath(); x.ellipse(px + 3, py + BR * .75, BR * (.95 - h * .004), BR * .5, 0, 0, 7); x.fill();
    py -= h;
    const g = x.createRadialGradient(px - BR * .35, py - BR * .4, 2, px, py, BR * 1.05);
    g.addColorStop(0, sh(col, -.55)); g.addColorStop(.35, col); g.addColorStop(1, sh(col, .45));
    x.fillStyle = g; x.beginPath(); x.arc(px, py, BR, 0, 7); x.fill(); x.lineWidth = 2; x.strokeStyle = sh(col, .6); x.stroke();
    const dx = Math.cos(a), dy = Math.sin(a);
    [-1, 1].forEach(s => {
      const ex = px + dx * BR * .42 - dy * BR * .34 * s, ey = py + dy * BR * .42 + dx * BR * .34 * s;
      x.fillStyle = "#fff"; x.beginPath(); x.arc(ex, ey, BR * .27, 0, 7); x.fill();
      x.fillStyle = "#14102b"; x.beginPath(); x.arc(ex + dx * BR * .09, ey + dy * BR * .09, BR * .13, 0, 7); x.fill();
    });
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
    x.setTransform(cv.width / W, 0, 0, cv.height / H, 0, 0);
    x.drawImage(background(), 0, 0);
    const sm = sample(now - 110);
    if (!sm) return setOv("");
    const { a, b, f } = sm, last = snaps[snaps.length - 1].s, sa = a.s, sb = b.s, rad = last.r || 230;
    snaps.forEach(sn => { if (!sn.done && sn.at <= now - 110) { sn.done = true; (sn.s.ev || []).forEach(onEv); } });
    floor(rad, last.s >= 0);
    const A = last.ab === undefined ? -1 : last.ab;

    // joueur vivant le plus proche : la barre le regarde
    let eye = sa.a, bd = 1e9;
    const barA = sa.a + (sb.a - sa.a) * f, barL = ((sa.l || 1) + ((sb.l || 1) - (sa.l || 1)) * f) * (rad - 4);
    sa.p.forEach(p => { if (p[2]) { const d = Math.hypot(p[0] - CX, p[1] - CY); if (d < bd) { bd = d; eye = Math.atan2(p[1] - CY, p[0] - CX); } } });

    fl = fl.filter(o => (o.t += dt) < .8);
    fl.forEach(o => { x.save(); x.globalAlpha = 1 - o.t / .8; x.translate(o.x, o.y); x.scale(1 - o.t / .8, 1 - o.t / .8); x.rotate(o.t * 8); ball(0, 0, o.col, 0, 0); x.restore(); });

    if (pl) {
      const draw = [];
      sa.p.forEach((qa, i) => {
        const qb = sb.p[i]; if (!qa[2] || !pl[i]) return;
        const px = qb && qb[2] ? qa[0] + (qb[0] - qa[0]) * f : qa[0], py = qb && qb[2] ? qa[1] + (qb[1] - qa[1]) * f : qa[1];
        if (qb && Math.hypot(qb[0] - qa[0], qb[1] - qa[1]) > .6) ang[i] = Math.atan2(qb[1] - qa[1], qb[0] - qa[0]);
        if (qa[4] && !jt[i]) jt[i] = now; if (!qa[4]) jt[i] = 0;
        draw.push([i, px, py, jt[i] ? 24 * Math.sin(Math.PI * Math.min(1, (now - jt[i]) / 500)) : 0]);
      });
      draw.sort((u, v) => u[2] - v[2]);
      const below = draw.filter(d => d[3] < 6), above = draw.filter(d => d[3] >= 6);
      const drawBalls = list => list.forEach(([i, px, py, h]) => {
        const me = i === myIdx;
        ball(px, py, pl[i][2], ang[i] || 0, h);
        if (me) { const cdv = last.p[i] ? last.p[i][3] / 100 : 0; x.lineWidth = 3; x.strokeStyle = cdv <= 0 ? "#3ee6c4" : "rgba(255,255,255,.4)"; x.beginPath(); x.arc(px, py - h, BR + 6, -Math.PI / 2, -Math.PI / 2 + PI2 * (1 - cdv)); x.stroke(); }
        x.font = "700 13px 'DM Sans',sans-serif"; x.textAlign = "center"; x.lineWidth = 3; x.strokeStyle = "rgba(0,0,0,.65)"; x.fillStyle = me ? "#ffd23f" : "#fff";
        x.strokeText(pl[i][1], px, py - h - BR - 9); x.fillText(pl[i][1], px, py - h - BR - 9);
        if (me) { x.fillStyle = "#ffd23f"; x.fillText("▼", px, py - h - BR - 22); }
        x.textAlign = "start";
      });
      if (A === 2) bar(Math.PI - barA, barL, now, eye, .78, false);     // mirage : fausse barre inoffensive (un peu transparente)
      if (A === 3) bar(barA + Math.PI, barL, now, eye, 1, false);       // second bras
      drawBalls(below); bar(barA, barL, now, eye, A === 1 ? .07 : 1); drawBalls(above);
      if (A === 0 || A === 4) { x.fillStyle = A === 0 ? "rgba(255,210,63,.07)" : "rgba(150,60,255,.13)"; x.fillRect(0, 0, W, H); }
      if (A >= 0 && !last.o) { x.textAlign = "center"; x.font = "800 24px 'Bricolage Grotesque',sans-serif"; x.fillStyle = Math.floor(now / 150) % 2 ? "#ffd23f" : "#fff"; x.fillText(`${AB[A]} · ${last.at.toFixed(1)} s`, CX, 26); x.textAlign = "start"; }   // un joueur en l'air passe AU-DESSUS de la barre

      x.font = "700 14px 'DM Sans',sans-serif"; x.textBaseline = "middle";
      last.p.forEach((q, i) => { const y = 18 + i * 20; x.globalAlpha = q[2] ? 1 : .4; x.fillStyle = pl[i][2]; x.beginPath(); x.arc(16, y, 6, 0, 7); x.fill(); x.fillStyle = "#fff"; x.fillText(pl[i][1] + (q[2] ? "" : " ✖"), 28, y); });
      x.globalAlpha = 1; x.textAlign = "right"; x.font = "600 13px 'DM Sans',sans-serif"; x.fillStyle = "#ffe9a8";
      (last.kf || []).slice(-4).forEach((t, i) => x.fillText(t, W - 12, 18 + i * 18));
      if (last.s >= 0 && !last.o) { x.textAlign = "center"; x.font = "800 22px 'Bricolage Grotesque',sans-serif"; x.fillStyle = Math.floor(now / 200) % 2 ? "#ff3b5c" : "#fff"; x.fillText(`⏱️ Tiens encore ${last.s.toFixed(1)} s !`, CX, H - 18); }
      x.textAlign = "start"; x.textBaseline = "alphabetic";
      const mq = last.p[myIdx], rdy = !mq || !mq[2] || mq[3] > 0, op = rdy ? ".45" : "1"; if (btn.style.opacity !== op) btn.style.opacity = op;
    }

    parts = parts.filter(o => (o.l -= dt * 2.2) > 0);
    parts.forEach(o => { o.x += o.vx * dt; o.y += o.vy * dt; x.globalAlpha = Math.max(0, o.l); x.fillStyle = o.c; x.beginPath(); x.arc(o.x, o.y, o.s * o.l, 0, 7); x.fill(); });
    x.globalAlpha = 1;
    if (stick) {
      x.fillStyle = "rgba(255,255,255,.08)"; x.strokeStyle = "rgba(255,255,255,.28)"; x.lineWidth = 2; x.beginPath(); x.arc(stick.ox, stick.oy, 55, 0, 7); x.fill(); x.stroke();
      x.fillStyle = "rgba(255,255,255,.65)"; x.beginPath(); x.arc(stick.ox + stick.dx * 55, stick.oy + stick.dy * 55, 22, 0, 7); x.fill();
    }
    setOv(last.cd ? String(last.cd) : last.o ? (last.msg || "Fin de partie") : last.t < .9 ? "GO !" : "");
  }

  return {
    enter(c) {
      active = true; snaps = []; pl = null; lastEv = 0; fl = []; parts = []; ang = []; jt = []; jseq = 0; sentStr = ""; sentAt = 0; stick = null; keys.clear(); tPrev = 0; myIdx = -1; ovT = "\u0000";
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
