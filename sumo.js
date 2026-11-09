/* MoDa : « Sumo Arena » 🤼 : pousse tes potes hors de l'arène, le dernier sur la plateforme gagne.
   - Chaque joueur est une bille : il se déplace (joystick / ZQSD / flèches) et peut charger 💨 (Espace, bouton, clic droit).
   - L'arène rétrécit par paliers (avec un avertissement rouge) : tôt ou tard, on se touche.
   - Même fonctionnement que Tanks : l'hôte simule (30 pas/s) et publie l'état dans games/<code>/state (~16 fois/s) ;
     chaque joueur écrit sa direction dans games/<code>/inputs/<uid> sous la forme "ax,ay,compteurCharge".
   - Aucun nouveau chemin Firebase : les règles existantes suffisent. */

const W = 800, H = 560, CX = 400, CY = 285, BR = 20;      // scène 800×560, centre de l'arène, rayon d'une bille
const RMIN = 80, SHRINK = 22, FIRST = 9, EVERY = 6;       // rayon minimal, pas de rétrécissement, 1er palier (s), délai entre paliers (s)
const ACC = 900, DAMP = 3.0;                              // accélération (px/s²) et frottement (1/s) : vitesse max ≈ 300 px/s
const DASH_V = 300, DASH_CD = 1.6, DASH_T = .28, DASH_M = 1.7, REST = .95, DT = 1 / 30;

// ---------------------------------------------------------------- Hôte
export async function startSumo(env) {
  const { R, update, remove, set, onValue, increment, getCode, getLobby, getMe, toast } = env;
  const c = getCode(), players = (getLobby() || {}).players || {}, ids = Object.keys(players);
  if (ids.length < 2) return toast("Il faut au moins 2 joueurs pour lancer Sumo Arena");
  await remove(R(`games/${c}`));
  await update(R(`lobbies/${c}`), { status: "playing" });

  const rad0 = 190 + ids.length * 8;                      // l'arène est plus grande avec plus de joueurs
  const P = {}, I = {}, seen = {};
  let rad = rad0, tgt = rad0, t = 0, nextShrink = FIRST, evId = 0, evs = [], kf = [], pubN = 0;
  const off = Math.random() * 6.283;
  ids.forEach((u, i) => {                                 // départ en cercle : tout le monde à égalité
    const a = off + i / ids.length * 6.283, d = rad0 * .55;
    P[u] = { n: players[u].name, c: players[u].color, x: CX + Math.cos(a) * d, y: CY + Math.sin(a) * d, vx: 0, vy: 0, a: 1, cd: 0, dash: 0, hit: null, hitT: 0, k: 0 };
    I[u] = { ax: 0, ay: 0, d: 0, want: 0 };
  });
  const alive = () => ids.filter(u => P[u].a);
  const ev = (x, y, ty, ...r) => evs.push({ e: [Math.round(x), Math.round(y), ty, ++evId, ...r], u: pubN + 4 });

  const un = onValue(R(`games/${c}/inputs`), s => Object.entries(s.val() || {}).forEach(([u, v]) => {
    if (!P[u] || seen[u] === v) return; seen[u] = v;
    const a = String(v).split(","), ax = +a[0], ay = +a[1], d = +a[2], q = I[u];
    if (ax === ax && ay === ay) { const m = Math.hypot(ax, ay), k = m > 1 ? 1 / m : 1; q.ax = ax * k; q.ay = ay * k; }
    if (d === d && d !== q.d) { q.d = d; q.want = .25; }  // une charge demandée un peu trop tôt est gardée 0,25 s
  }));

  const fall = u => {
    const q = P[u]; q.a = 0; ev(q.x, q.y, -2, ids.indexOf(u), Math.round(q.vx), Math.round(q.vy));
    const k = q.hit && q.hit !== u && t - q.hitT < 3.5 ? q.hit : null; // le dernier qui l'a touché (3,5 s) marque
    if (k) { P[k].k++; kf.push([`${P[k].n} ➜ ${q.n}`, pubN + 40]); } else kf.push([`${q.n} est tombé`, pubN + 40]);
  };

  const step = () => {
    t += DT;
    if (t >= nextShrink && tgt > RMIN) { tgt = Math.max(RMIN, tgt - SHRINK); nextShrink += EVERY; }
    if (rad > tgt) rad = Math.max(tgt, rad - 24 * DT);
    const al = alive();
    al.forEach(u => {
      const q = P[u], i = I[u];
      if (q.cd > 0) q.cd = Math.max(0, q.cd - DT);
      if (q.dash > 0) q.dash = Math.max(0, q.dash - DT);
      if (i.want > 0) {
        i.want -= DT;
        if (q.cd <= 0) {                                  // charge : élan dans la direction visée (ou de déplacement)
          let dx = i.ax, dy = i.ay, m = Math.hypot(dx, dy);
          if (m < .2) { const s = Math.hypot(q.vx, q.vy); dx = s > 20 ? q.vx / s : 0; dy = s > 20 ? q.vy / s : 0; m = 1; }
          else { dx /= m; dy /= m; }
          if (dx || dy) { q.vx += dx * DASH_V; q.vy += dy * DASH_V; q.cd = DASH_CD; q.dash = DASH_T; i.want = 0; ev(q.x, q.y, -1, ids.indexOf(u)); }
        }
      }
      q.vx += i.ax * ACC * DT; q.vy += i.ay * ACC * DT;
      const f = Math.exp(-DAMP * DT); q.vx *= f; q.vy *= f;
      q.x += q.vx * DT; q.y += q.vy * DT;
    });
    for (let i = 0; i < al.length; i++) for (let j = i + 1; j < al.length; j++) {
      const A = P[al[i]], B = P[al[j]], dx = B.x - A.x, dy = B.y - A.y, d = Math.hypot(dx, dy), min = BR * 2;
      if (d >= min || d < .001) continue;
      const nx = dx / d, ny = dy / d, ma = A.dash > 0 ? DASH_M : 1, mb = B.dash > 0 ? DASH_M : 1, tot = ma + mb, ov = min - d;
      A.x -= nx * ov * mb / tot; A.y -= ny * ov * mb / tot; B.x += nx * ov * ma / tot; B.y += ny * ov * ma / tot; // le plus léger recule le plus
      A.hit = al[j]; A.hitT = t; B.hit = al[i]; B.hitT = t;
      const rv = (B.vx - A.vx) * nx + (B.vy - A.vy) * ny;
      if (rv < 0) {
        const j2 = -(1 + REST) * rv / (1 / ma + 1 / mb);
        A.vx -= j2 * nx / ma; A.vy -= j2 * ny / ma; B.vx += j2 * nx / mb; B.vy += j2 * ny / mb;
        ev((A.x + B.x) / 2, (A.y + B.y) / 2, Math.max(1, Math.round(-rv)), ids.indexOf(al[i]), ids.indexOf(al[j]));
      }
    }
    al.forEach(u => { const q = P[u]; if (Math.hypot(q.x - CX, q.y - CY) > rad) fall(u); }); // le centre de la bille passe le bord : tombé
  };

  const pub = (x = {}) => {
    pubN++;
    evs = evs.filter(o => o.u >= pubN); kf = kf.filter(e => e[1] > pubN);
    const o = {
      k: "sumo", t: +t.toFixed(1), r: +rad.toFixed(1), ns: tgt > RMIN ? +Math.max(0, nextShrink - t).toFixed(1) : -1,
      p: ids.map(u => { const q = P[u]; return [+q.x.toFixed(1), +q.y.toFixed(1), q.a, Math.round(q.cd / DASH_CD * 100), q.dash > 0 ? 1 : 0, q.k]; }),
      ev: evs.map(o2 => o2.e), kf: kf.map(e => e[0]), ...x
    };
    if (x.cd || x.o || pubN % 10 === 1) o.pl = ids.map(u => [u, P[u].n, P[u].c]); // uid, pseudo, couleur : de temps en temps seulement
    return set(R(`games/${c}/state`), JSON.stringify(o));
  };

  const finish = w => {
    un(); set(R("stats/gamesPlayed"), increment(1)).catch(() => { });
    pub({ o: 1, msg: w ? `🏆 ${P[w].n} gagne ! ☠ ${P[w].k}` : "Match nul" });
    setTimeout(async () => {
      if (getCode() !== c) return;                        // l'hôte a quitté entre-temps : on ne recrée rien
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
    if (getCode() !== c) { un(); return; }                // l'hôte a quitté : on arrête tout
    const now = performance.now(); acc = Math.min(.25, acc + (now - last) / 1000); last = now;
    const cp = (getLobby() || {}).players || {};
    ids.forEach(u => { if (P[u].a && !cp[u]) { P[u].a = 0; kf.push([`${P[u].n} a quitté la partie`, pubN + 40]); } });
    for (let n = 0; acc >= DT && n < 6 && alive().length > 1; n++) { step(); acc -= DT; }
    const al = alive();
    if (al.length <= 1) return finish(al[0]);
    pub(); setTimeout(loop, 55);
  };
  loop();
}

// ---------------------------------------------------------------- Client (tous les joueurs, hôte compris)
const KEYS = { ArrowUp: "U", w: "U", z: "U", ArrowDown: "D", s: "D", ArrowLeft: "L", a: "L", q: "L", ArrowRight: "R", d: "R" };
const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) || 0);
const mixC = {};
const mix = (h, k) => { const key = h + k; if (mixC[key]) return mixC[key]; // k>0 : vers le noir, k<0 : vers le blanc
  const m = hex(h).map(v => Math.round(k > 0 ? v * (1 - k) : v + (255 - v) * -k)); return mixC[key] = `rgb(${m[0]},${m[1]},${m[2]})`; };

export function createSumoClient(env) {
  const { R, set, onValue, $, beep, getMe, getCode } = env;
  const cv = $("cv"), x = cv.getContext("2d"), btn = $("sdash"), ov = $("ov");
  let active = false, raf = 0, snaps = [], pl = null, lastEv = 0, fl = [], parts = [], ang = [], dseq = 0, sentStr = "", sentAt = 0;
  let stick = null, tPrev = 0, myIdx = -1, ovT = "", bg = null;
  const keys = new Set();

  const dash = () => { if (!active) return; dseq++; sendInput(performance.now(), true); };
  const sendInput = (now, force) => {
    let ix = 0, iy = 0;
    if (stick) { const m = Math.hypot(stick.dx, stick.dy); if (m > .18) { const k = Math.min(1, (m - .18) / .7) / m; ix = stick.dx * k; iy = stick.dy * k; } }
    else { ix = (keys.has("R") ? 1 : 0) - (keys.has("L") ? 1 : 0); iy = (keys.has("D") ? 1 : 0) - (keys.has("U") ? 1 : 0); if (ix && iy) { ix *= .7071; iy *= .7071; } }
    const str = `${ix.toFixed(2)},${iy.toFixed(2)},${dseq}`;
    if (str === sentStr || (!force && now - sentAt < 55)) return;
    sentStr = str; sentAt = now;
    set(R(`games/${getCode()}/inputs/${getMe().uid}`), str).catch(() => { });
  };

  // ----- commandes -----
  addEventListener("keydown", e => {
    if (!active || /^(INPUT|TEXTAREA)$/.test(e.target.tagName)) return;
    if (e.key === " " || e.key === "Shift") { e.preventDefault(); if (!e.repeat) dash(); return; }
    const k = KEYS[e.key.length > 1 ? e.key : e.key.toLowerCase()]; if (k) { e.preventDefault(); keys.add(k); }
  });
  addEventListener("keyup", e => { const k = KEYS[e.key.length > 1 ? e.key : e.key.toLowerCase()]; if (k) keys.delete(k); });
  addEventListener("blur", () => { keys.clear(); stick = null; });
  const rel = e => { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) * cv.width / r.width, y: (e.clientY - r.top) * cv.height / r.height }; };
  cv.addEventListener("pointerdown", e => {
    if (!active) return; e.preventDefault();
    if (e.button === 2) return dash();                    // clic droit = charge
    if (stick) return;
    try { cv.setPointerCapture(e.pointerId); } catch { }
    const p = rel(e); stick = { id: e.pointerId, ox: p.x, oy: p.y, dx: 0, dy: 0 };
  });
  cv.addEventListener("pointermove", e => {
    if (!stick || e.pointerId !== stick.id) return;
    const p = rel(e); let dx = p.x - stick.ox, dy = p.y - stick.oy; const d = Math.hypot(dx, dy), m = 55;
    if (d > m) { stick.ox += dx / d * (d - m); stick.oy += dy / d * (d - m); dx = dx / d * m; dy = dy / d * m; } // la base suit le doigt
    stick.dx = dx / m; stick.dy = dy / m;
  });
  const end = e => { if (stick && e.pointerId === stick.id) stick = null; };
  cv.addEventListener("pointerup", end); cv.addEventListener("pointercancel", end);
  cv.addEventListener("contextmenu", e => { if (active) e.preventDefault(); });
  btn.addEventListener("pointerdown", e => { if (!active) return; e.preventDefault(); dash(); });
  document.addEventListener("visibilitychange", () => { if (document.hidden) { keys.clear(); stick = null; } });

  // ----- effets -----
  const spark = (px, py, n, col, v) => { for (let i = 0; i < n && parts.length < 160; i++) { const a = Math.random() * 6.283, s = v * (.3 + Math.random() * .7); parts.push({ x: px, y: py, vx: Math.cos(a) * s, vy: Math.sin(a) * s, l: 1, c: col, s: 2 + Math.random() * 3 }); } };
  const onEv = e => {
    const [ex, ey, ty, id] = e; if (id <= lastEv) return; lastEv = id;
    const col = pl && pl[e[4]] ? pl[e[4]][2] : "#fff";
    if (ty >= 0) {
      spark(ex, ey, Math.min(14, 4 + ty / 60 | 0), "#ffe9a8", 120 + ty * .25);
      beep(110 + Math.min(ty, 600) * .25, .07, "square", ty > 250 ? .06 : .035);
      if ((e[4] === myIdx || e[5] === myIdx) && ty > 160 && typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(30);
    } else if (ty === -1) {
      spark(ex, ey, 10, col, 150); beep(280, .12, "sawtooth", .04, 720);
    } else if (ty === -2) {
      fl.push({ x: ex, y: ey, vx: e[5] || 0, vy: e[6] || 0, col, t: 0 });
      beep(420, .55, "triangle", .05, 70);
      if (e[4] === myIdx && typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(120);
    }
  };

  // ----- interpolation : on affiche 110 ms dans le passé, entre deux états reçus -----
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
    const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, "#0d0820"); gr.addColorStop(1, "#32101f"); g.fillStyle = gr; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(255,${80 + (i * 37) % 90},60,${.05 + (i % 5) * .015})`; g.beginPath(); g.arc((i * 211) % W, (i * 127) % H, 6 + (i * 13) % 26, 0, 7); g.fill(); }
    return bg;
  }
  function arena(r, ns, now) {
    const gl = x.createRadialGradient(CX, CY, Math.max(1, r), CX, CY, r + 90); gl.addColorStop(0, "rgba(255,77,46,.42)"); gl.addColorStop(1, "rgba(255,77,46,0)");
    x.fillStyle = gl; x.fillRect(0, 0, W, H);                // lueur de lave autour de la plateforme
    x.fillStyle = "#171235"; x.beginPath(); x.arc(CX, CY + 14, r, 0, 7); x.fill(); // épaisseur
    const g = x.createRadialGradient(CX, CY - r * .3, r * .1, CX, CY, r); g.addColorStop(0, "#4a3f95"); g.addColorStop(1, "#30296b");
    x.fillStyle = g; x.beginPath(); x.arc(CX, CY, r, 0, 7); x.fill();
    x.save(); x.beginPath(); x.arc(CX, CY, r, 0, 7); x.clip();
    x.strokeStyle = "rgba(255,255,255,.07)"; x.lineWidth = 2;
    for (let k = 40; k < 300; k += 40) { x.beginPath(); x.arc(CX, CY, k, 0, 7); x.stroke(); }
    x.beginPath(); x.moveTo(CX - r, CY); x.lineTo(CX + r, CY); x.moveTo(CX, CY - r); x.lineTo(CX, CY + r); x.stroke();
    x.restore();
    const warn = ns >= 0 && ns < 3;
    if (warn) { x.setLineDash([8, 8]); x.strokeStyle = "rgba(255,59,92,.55)"; x.lineWidth = 3; x.beginPath(); x.arc(CX, CY, Math.max(RMIN, r - SHRINK), 0, 7); x.stroke(); x.setLineDash([]); } // futur bord
    x.lineWidth = warn ? 7 : 5; x.strokeStyle = warn ? (Math.floor(now / 160) % 2 ? "#ff3b5c" : "#ffb3c0") : "#9b8cff";
    x.beginPath(); x.arc(CX, CY, r - 1, 0, 7); x.stroke();
  }
  function ball(px, py, col, a, dashing, now) {
    x.fillStyle = "rgba(0,0,0,.35)"; x.beginPath(); x.ellipse(px + 3, py + BR * .75, BR * .95, BR * .5, 0, 0, 7); x.fill();
    if (dashing) { x.fillStyle = mix(col, -.3) + "55"; x.beginPath(); x.arc(px, py, BR * 1.7, 0, 7); x.fill(); }
    const g = x.createRadialGradient(px - BR * .35, py - BR * .4, 2, px, py, BR * 1.05);
    g.addColorStop(0, mix(col, -.55)); g.addColorStop(.35, col); g.addColorStop(1, mix(col, .45));
    x.fillStyle = g; x.beginPath(); x.arc(px, py, BR, 0, 7); x.fill();
    x.lineWidth = 2; x.strokeStyle = mix(col, .6); x.stroke();
    const dx = Math.cos(a), dy = Math.sin(a);               // les yeux regardent où la bille va
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
  function hud(s, sa, now) {
    x.font = "700 14px 'DM Sans',sans-serif"; x.textAlign = "left"; x.textBaseline = "middle";
    s.p.forEach((q, i) => {
      const y = 18 + i * 20; x.globalAlpha = q[2] ? 1 : .4;
      x.fillStyle = pl[i][2]; x.beginPath(); x.arc(16, y, 6, 0, 7); x.fill();
      x.fillStyle = "#fff"; x.fillText(`${pl[i][1]}${q[5] ? "  ☠" + q[5] : ""}${q[2] ? "" : " ✖"}`, 28, y);
    });
    x.globalAlpha = 1; x.textAlign = "right"; x.font = "600 13px 'DM Sans',sans-serif"; x.fillStyle = "#ffe9a8";
    (s.kf || []).slice(-4).forEach((t, i) => x.fillText(t, W - 12, 18 + i * 18));
    if (s.ns >= 0 && s.ns < 3 && !s.o) {
      x.textAlign = "center"; x.font = "800 18px 'Bricolage Grotesque',sans-serif"; x.fillStyle = Math.floor(now / 200) % 2 ? "#ff3b5c" : "#fff";
      x.fillText("⚠️ L'arène rétrécit !", CX, 22);
    }
    x.textAlign = "start"; x.textBaseline = "alphabetic";
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
    const { a, b, f } = sm, last = snaps[snaps.length - 1].s, sa = a.s, sb = b.s;
    snaps.forEach(sn => { if (!sn.done && sn.at <= now - 110) { sn.done = true; (sn.s.ev || []).forEach(onEv); } });
    arena(sa.r + (sb.r - sa.r) * f, last.ns, now);

    // chutes : la bille rétrécit et tourne en tombant
    fl = fl.filter(q => (q.t += dt) < .9);
    fl.forEach(q => {
      q.x += q.vx * dt; q.y += q.vy * dt; q.vx *= .97; q.vy *= .97; const sc = Math.max(0, 1 - q.t / .9);
      x.save(); x.globalAlpha = sc; x.translate(q.x, q.y); x.scale(sc, sc); x.rotate(q.t * 6); ball(0, 0, q.col, 0, false, now); x.restore();
    });

    if (pl) {
      const draw = [];
      sa.p.forEach((qa, i) => {
        const qb = sb.p[i]; if (!qa[2] || !pl[i]) return;
        const px = qb && qb[2] ? qa[0] + (qb[0] - qa[0]) * f : qa[0], py = qb && qb[2] ? qa[1] + (qb[1] - qa[1]) * f : qa[1];
        if (qb && Math.hypot(qb[0] - qa[0], qb[1] - qa[1]) > .6) ang[i] = Math.atan2(qb[1] - qa[1], qb[0] - qa[0]);
        if (qa[4] && parts.length < 160) parts.push({ x: px, y: py, vx: 0, vy: 0, l: .8, c: pl[i][2], s: BR * .7 });
        draw.push([i, px, py, qa]);
      });
      draw.sort((u, v) => u[2] - v[2]);
      draw.forEach(([i, px, py, qa]) => {
        const me = i === myIdx;
        ball(px, py, pl[i][2], ang[i] || 0, qa[4], now);
        if (me) {                                           // anneau de recharge de la charge
          const cdv = last.p[i] ? last.p[i][3] / 100 : 0;
          x.lineWidth = 3; x.strokeStyle = cdv <= 0 ? "#3ee6c4" : "rgba(255,255,255,.4)";
          x.beginPath(); x.arc(px, py, BR + 6, -Math.PI / 2, -Math.PI / 2 + 6.283 * (1 - cdv)); x.stroke();
        }
        x.font = "700 13px 'DM Sans',sans-serif"; x.textAlign = "center"; x.lineWidth = 3; x.strokeStyle = "rgba(0,0,0,.65)"; x.fillStyle = me ? "#ffd23f" : "#fff";
        x.strokeText(pl[i][1], px, py - BR - 9); x.fillText(pl[i][1], px, py - BR - 9);
        if (me) { x.fillStyle = "#ffd23f"; x.fillText("▼", px, py - BR - 22); }
        x.textAlign = "start";
      });
      hud(last, sa, now);
      const mq = last.p[myIdx], rdy = !mq || !mq[2] || mq[3] > 0;
      const op = rdy ? ".45" : "1"; if (btn.style.opacity !== op) btn.style.opacity = op;
    }

    parts = parts.filter(q => (q.l -= dt * 2.2) > 0);
    parts.forEach(q => { q.x += q.vx * dt; q.y += q.vy * dt; x.globalAlpha = Math.max(0, q.l); x.fillStyle = q.c; x.beginPath(); x.arc(q.x, q.y, q.s * q.l, 0, 7); x.fill(); });
    x.globalAlpha = 1;

    if (stick) {                                            // joystick flottant (tactile / souris)
      x.fillStyle = "rgba(255,255,255,.08)"; x.strokeStyle = "rgba(255,255,255,.28)"; x.lineWidth = 2; x.beginPath(); x.arc(stick.ox, stick.oy, 55, 0, 7); x.fill(); x.stroke();
      x.fillStyle = "rgba(255,255,255,.65)"; x.beginPath(); x.arc(stick.ox + stick.dx * 55, stick.oy + stick.dy * 55, 22, 0, 7); x.fill();
    }
    setOv(last.cd ? String(last.cd) : last.o ? (last.msg || "Fin de partie") : last.t < .9 ? "GO !" : "");
  }

  return {
    enter(c) {
      active = true; snaps = []; pl = null; lastEv = 0; fl = []; parts = []; ang = []; dseq = 0; sentStr = ""; sentAt = 0; stick = null; keys.clear(); tPrev = 0; myIdx = -1; ovT = "\u0000";
      $("ghelp").textContent = "ZQSD / WASD / flèches : bouger · Espace ou clic droit : charge 💨 · glisse sur mobile";
      const myUid = getMe().uid;
      set(R(`games/${c}/inputs/${myUid}`), "0,0,0").catch(() => { });   // point de départ du compteur de charges
      const un = onValue(R(`games/${c}/state`), snap => {
        const v = snap.val(); if (!v) return; let s; try { s = JSON.parse(v); } catch { return; }
        if (s.k !== "sumo") return;
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
