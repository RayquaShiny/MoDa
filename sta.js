/* MoDa : « Sta I » 🚗 : un petit GTA 1 en ligne, vu de dessus.
   - Un serveur persistant : on clique sur la tuile et on arrive directement dedans (pas de lobby, pas de « lancer »).
     Serveurs STA1, STA2… (24 joueurs max chacun) : si le premier est plein, le suivant s'ouvre automatiquement.
   - L'HÔTE du serveur = le joueur arrivé en premier. S'il part, le suivant (par ordre d'arrivée) reprend la simulation
     là où elle en était : tout le monde calcule le même hôte à partir de lobbies/<code>/players/<uid>/j.
   - Chaque joueur écrit sa position dans games/<code>/p/<uid> (« x,y,angle,véhicule,étoiles,argent,pv,vitesse,coup,cible »).
     L'hôte simule PNJ (piétons, voitures, police) et publie games/<code>/state (JSON). Aucun nouveau chemin Firebase
     hormis users/<uid>/sta (ton argent, sauvegardé).
   - But : gagner de l'argent (courses en voiture, piétons écrasés), éviter la police (étoiles ★), finir premier du classement. */

const W = 800, H = 560, CELL = 360, ROAD = 100, N = 9, WORLD = N * CELL, BL = CELL - ROAD, SW = 14;
const POLICE = [6, 2], HOSP = [2, 6];
const SPAWN = { police: [6 * CELL + 180, 3 * CELL], hosp: [2 * CELL + 180, 7 * CELL] };
const CCOL = ["#e63946", "#f4a261", "#2a9d8f", "#457b9d", "#e9c46a", "#9b5de5", "#8d99ae", "#f1f1f1"];
const SKIN = ["#f1c27d", "#e0ac69", "#c68642", "#8d5524", "#ffdbac", "#d9a066"], SHIRT = ["#e63946", "#3a86ff", "#06d6a0", "#ffbe0b", "#8338ec", "#fb5607"];
const KEYS = { ArrowUp: "U", ArrowDown: "D", ArrowLeft: "L", ArrowRight: "R", z: "U", s: "D", q: "L", d: "R", w: "U", a: "L" };
const rnd = a => a[Math.floor(Math.random() * a.length)], rr = (a, b) => a + Math.random() * (b - a), clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const hs = (a, b) => { let h = (a * 374761393 + b * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return (h ^ (h >>> 16)) >>> 0; };
const isSpecial = (i, j) => (i === POLICE[0] && j === POLICE[1]) || (i === HOSP[0] && j === HOSP[1]);
const isPark = (i, j) => !isSpecial(i, j) && hs(i, j) % 6 === 0;
const lo = i => i * CELL + ROAD / 2, rc = v => Math.round(v / CELL) * CELL;
const angLerp = (a, b, k) => { let d = (b - a) % 6.283185; if (d > 3.141593) d -= 6.283185; if (d < -3.141593) d += 6.283185; return a + d * k; };

// Pousse un cercle (p.x, p.y, rayon r) hors des bâtiments et des bords du monde. Renvoie true s'il y a eu contact.
function push(p, r) {
  let hit = false;
  const i0 = Math.floor((p.x - ROAD / 2) / CELL), j0 = Math.floor((p.y - ROAD / 2) / CELL);
  for (let i = i0 - 1; i <= i0 + 1; i++) for (let j = j0 - 1; j <= j0 + 1; j++) {
    if (i < 0 || j < 0 || i >= N || j >= N || isPark(i, j)) continue;
    const x0 = lo(i) + SW, y0 = lo(j) + SW, x1 = x0 + BL - 2 * SW, y1 = y0 + BL - 2 * SW;
    const cx = clamp(p.x, x0, x1), cy = clamp(p.y, y0, y1), dx = p.x - cx, dy = p.y - cy, d = Math.hypot(dx, dy);
    if (d < r) {
      if (d > .001) { p.x = cx + dx / d * r; p.y = cy + dy / d * r; }
      else { const l = p.x - x0, rg = x1 - p.x, t = p.y - y0, b = y1 - p.y, m = Math.min(l, rg, t, b); if (m === l) p.x = x0 - r; else if (m === rg) p.x = x1 + r; else if (m === t) p.y = y0 - r; else p.y = y1 + r; }
      hit = true;
    }
  }
  const o = ROAD / 2 - r; const nx = clamp(p.x, -o, WORLD + o), ny = clamp(p.y, -o, WORLD + o); if (nx !== p.x || ny !== p.y) { p.x = nx; p.y = ny; hit = true; }
  return hit;
}
const parseP = s => { const a = String(s).split(","); return { x: +a[0] || 0, y: +a[1] || 0, a: +a[2] || 0, vid: +a[3] || 0, wl: +a[4] || 0, cash: +a[5] || 0, hp: +a[6] || 0, v: +a[7] || 0, hs: +a[8] || 0, hid: +a[9] || 0 }; };

export function createStaClient(env) {
  const { R: RF, set, get, remove, onValue, $, beep, getMe, getCode, getLobby, toast } = env;
  const cv = $("cv"), x = cv.getContext("2d");
  let active = false, raf = 0, timer = 0, tPrev = 0, c = "", myUid = "", unS = null, unP = null;
  // --- état partagé reçu ---
  let ls = null, lastT = 0, lastH = "", lastEv = 0, pd = {};
  const dPeds = new Map(), dCars = new Map(), dP = new Map();
  // --- simulation de l'hôte ---
  let hostOn = false, peds = [], cars = [], nid = 1, evs = [], evId = 0, lastHs = {}, spawnCd = 0, streamCd = 0, pubAt = 0, hostT = 0, cleanCd = 0;
  // --- moi ---
  const me = { x: 0, y: 0, a: 0, v: 0, vid: 0, hp: 100, cash: 0, heat: 0, wl: 0, hs: 0, hid: 0, dead: 0, msg: "", hurt: 0, bust: 0 };
  let keys = new Set(), stick = null, useReq = 0, job = null, myCol = 0, cam = { x: 0, y: 0, z: 1.2 }, sentAt = 0, sentStr = "", savedCash = -1, saveAt = 0, tNow = 0, hitDone = new Set();
  let splats = [], floats = [];

  const lobbyP = () => (getLobby() || {}).players || {};
  const activeP = () => { const lp = lobbyP(); return Object.entries(pd).filter(([u]) => lp[u]); };
  const hostUid = () => { const pl = lobbyP(); let b = null; for (const u in pl) { const j = pl[u].j || 1e15; if (!b || j < b[1] || (j === b[1] && u < b[0])) b = [u, j]; } return b && b[0]; };
  const far = (px, py, d) => !activeP().some(([, p]) => Math.hypot(p.x - px, p.y - py) < d);

  // ================= SIMULATION (hôte) =================
  const laneY = cr => rc(cr.y) + cr.dx * 22, laneX = cr => rc(cr.x) - cr.dy * 22;
  const mkCar = () => ({ id: nid++, x: 0, y: 0, a: 0, v: 0, c: Math.floor(Math.random() * 8), m: "d", o: "", tm: 0, dx: 1, dy: 0, sp: rr(110, 170), tg: "" });
  function roadSpawn(cr, base) {
    for (let t = 0; t < 8; t++) {
      let qx, qy; if (base) { const a = rr(0, 6.283), d = rr(600, 900); qx = clamp(base.x + Math.cos(a) * d, 0, WORLD); qy = clamp(base.y + Math.sin(a) * d, 0, WORLD); } else { const ps = activeP(); if (!ps.length) return false; const p = rnd(ps)[1], a = rr(0, 6.283), d = rr(560, 1000); qx = clamp(p.x + Math.cos(a) * d, 0, WORLD); qy = clamp(p.y + Math.sin(a) * d, 0, WORLD); }
      const s = Math.random() < .5 ? 1 : -1;
      if (Math.random() < .5) { cr.dx = s; cr.dy = 0; cr.x = qx; cr.y = laneY({ y: qy, dx: s }); } else { cr.dx = 0; cr.dy = s; cr.y = qy; cr.x = laneX({ x: qx, dy: s }); }
      cr.a = Math.atan2(cr.dy, cr.dx); if (far(cr.x, cr.y, 500)) return true;
    }
    return false;
  }
  function pick(cr, m) {
    const ix = cr.dx ? m / CELL : rc(cr.x) / CELL, iy = cr.dy ? m / CELL : rc(cr.y) / CELL, ds = [];
    [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dy]) => { const nx = ix + dx, ny = iy + dy; if (nx < 0 || ny < 0 || nx > N || ny > N) return; if (dx === -cr.dx && dy === -cr.dy) return; ds.push([dx, dy]); });
    if (!ds.length) ds.push([-cr.dx, -cr.dy]);
    const tg = cr.m === "c" && cr.tg && pd[cr.tg]; let d;
    if (tg) { let b = 1e18; ds.forEach(([dx, dy]) => { const v = Math.hypot((ix + dx) * CELL - tg.x, (iy + dy) * CELL - tg.y); if (v < b) { b = v; d = [dx, dy]; } }); }
    else { const st = ds.find(a => a[0] === cr.dx && a[1] === cr.dy); d = st && Math.random() < .6 ? st : rnd(ds); }
    cr.dx = d[0]; cr.dy = d[1];
  }
  function stepCar(cr, dt, ps) {
    const tg = cr.m === "c" && cr.tg && pd[cr.tg];
    let vt = cr.m === "c" ? (tg ? 195 + 20 * tg.wl : 140) : cr.sp;
    const ahead = (ox, oy, f1, l1) => { const rx = ox - cr.x, ry = oy - cr.y, f = rx * cr.dx + ry * cr.dy, l = Math.abs(-rx * cr.dy + ry * cr.dx); return f > 0 && f < f1 && l < l1 ? f : -1; };
    for (const o of cars) if (o !== cr && (o.m === "d" || o.m === "c" || o.m === "t")) { const f = ahead(o.x, o.y, 75, 26); if (f > 0) vt = Math.min(vt, f < 42 ? 0 : o.v * .9); }
    for (const [, p] of ps) if (ahead(p.x, p.y, 65, 22) > 0) vt = 0;
    for (const q of peds) if (ahead(q.x, q.y, 55, 14) > 0) vt = 0;
    if (tg && Math.hypot(tg.x - cr.x, tg.y - cr.y) < 70) vt = 0;
    cr.v += clamp(vt - cr.v, -380 * dt, 160 * dt);
    const dir = cr.dx || cr.dy, s0 = cr.dx ? cr.x : cr.y, s1 = s0 + dir * cr.v * dt, k0 = Math.floor(s0 / CELL), k1 = Math.floor(s1 / CELL);
    if (k0 !== k1) { const m = (dir > 0 ? k1 : k0) * CELL; if (cr.dx) cr.x = m; else cr.y = m; pick(cr, m); }
    else if (cr.dx) cr.x = s1; else cr.y = s1;
    const e = Math.min(1, 9 * dt);
    if (cr.dx) cr.y += (laneY(cr) - cr.y) * e; else cr.x += (laneX(cr) - cr.x) * e;
    cr.a = angLerp(cr.a, Math.atan2(cr.dy, cr.dx), Math.min(1, 10 * dt));
  }
  function sidewalk(q, px, py) {
    const i = clamp(Math.floor((px - ROAD / 2) / CELL), 0, N - 1), j = clamp(Math.floor((py - ROAD / 2) / CELL), 0, N - 1), x0 = lo(i), y0 = lo(j), e = Math.floor(Math.random() * 4), t = rr(0, BL);
    if (e === 0) { q.x = x0 + t; q.y = y0 + 7; } else if (e === 1) { q.x = x0 + t; q.y = y0 + BL - 7; } else if (e === 2) { q.x = x0 + 7; q.y = y0 + t; } else { q.x = x0 + BL - 7; q.y = y0 + t; }
  }
  const nearPt = (a, b) => { const ps = activeP(); if (!ps.length) return null; const p = rnd(ps)[1], an = rr(0, 6.283), d = rr(a, b); return [clamp(p.x + Math.cos(an) * d, 0, WORLD), clamp(p.y + Math.sin(an) * d, 0, WORLD)]; };

  function becomeHost() {
    hostOn = true; peds = []; cars = []; nid = 1; evs = []; evId = lastEv; lastHs = {}; streamCd = 0; spawnCd = 0; hostT = performance.now();
    if (ls && ls.pd) {
      ls.pd.forEach(a => peds.push({ id: a[0], x: a[1], y: a[2], h: a[3], sk: a[4], st: 0, tm: 1 }));
      ls.cr.forEach(a => { const ang = a[3]; let dx = Math.round(Math.cos(ang)), dy = Math.round(Math.sin(ang)); if (dx && dy) dy = 0; if (!dx && !dy) dx = 1; cars.push({ id: a[0], x: a[1], y: a[2], a: ang, v: a[4], c: a[5], m: a[6] === "t" ? "p" : a[6], o: "", tm: 30, dx, dy, sp: rr(110, 170), tg: "" }); });
      nid = Math.max(0, ...peds.map(q => q.id), ...cars.map(q => q.id)) + 1;
    }
  }
  function hostTick(dt) {
    const ps = activeP(), lp = lobbyP();
    const taken = {}; ps.forEach(([u, p]) => { if (p.vid) taken[p.vid] = [u, p]; });
    cars.forEach(cr => {
      const t = taken[cr.id];
      if (t) { cr.m = "t"; cr.o = t[0]; cr.x = t[1].x; cr.y = t[1].y; cr.a = t[1].a; cr.v = t[1].v; cr.tm = 0; }
      else if (cr.m === "t") { cr.m = "p"; cr.o = ""; cr.v = 0; cr.tm = 45; }
    });
    ps.forEach(([u, p]) => {                                              // piétons écrasés (annoncés par le conducteur)
      if (lastHs[u] === undefined) lastHs[u] = p.hs;
      else if (p.hs !== lastHs[u]) { lastHs[u] = p.hs; const i = peds.findIndex(q => q.id === p.hid); if (i >= 0) { evs.push([++evId, Math.round(peds[i].x), Math.round(peds[i].y), 1]); peds.splice(i, 1); } }
    });
    // police : cible = joueur recherché le plus proche
    const wanted = ps.filter(([, p]) => p.wl > 0);
    cars.forEach(cr => {
      if (cr.m === "c") {
        let b = 1e18; cr.tg = ""; wanted.forEach(([u, p]) => { const d = Math.hypot(p.x - cr.x, p.y - cr.y); if (d < b) { b = d; cr.tg = u; } });
        if (!cr.tg && far(cr.x, cr.y, 800)) cr.rm = 1;
      }
    });
    cars.forEach(cr => { if (cr.m === "d" || cr.m === "c") stepCar(cr, dt, ps); else if (cr.m === "p") { cr.tm -= dt; if (cr.tm <= 0) { if (far(cr.x, cr.y, 500)) cr.rm = 1; else cr.tm = 10; } } });
    const nc = cars.filter(q => q.m === "c" && !q.rm).length, want = Math.min(8, wanted.reduce((s, [, p]) => s + p.wl, 0));
    spawnCd -= dt;
    if (nc < want && spawnCd <= 0) { const cr = mkCar(); cr.m = "c"; cr.c = 0; if (roadSpawn(cr, rnd(wanted)[1])) { cars.push(cr); spawnCd = 1.6; } }
    peds.forEach(q => {
      q.tm -= dt; let sp = 38, dg = null;
      for (const cr of cars) if ((cr.m === "d" || cr.m === "c" || cr.m === "t") && cr.v > 40 && Math.hypot(cr.x - q.x, cr.y - q.y) < 80) { dg = cr; break; }
      if (dg) { q.h = Math.atan2(q.y - dg.y, q.x - dg.x); q.st = 1; q.tm = 1.2; sp = 95; } else if (q.tm <= 0) { q.h = rr(0, 6.283); q.tm = rr(2, 6); q.st = 0; }
      q.x += Math.cos(q.h) * sp * dt; q.y += Math.sin(q.h) * sp * dt;
      if (push(q, 5)) q.h += rr(1.2, 2.4);
    });
    streamCd -= dt;
    if (streamCd <= 0 && ps.length) {                                     // le monde « vit » autour des joueurs : on recycle ce qui est loin
      streamCd = 1; const np = ps.length;
      for (const q of peds) if (far(q.x, q.y, 1100)) { const pt = nearPt(520, 900); if (pt) sidewalk(q, pt[0], pt[1]); }
      const wp = Math.min(70, 34 + 4 * np);
      while (peds.length < wp) { const q = { id: nid++, x: 0, y: 0, h: rr(0, 6.283), sk: Math.floor(Math.random() * 6), st: 0, tm: rr(1, 4) }, pt = nearPt(520, 900); if (!pt) break; sidewalk(q, pt[0], pt[1]); peds.push(q); }
      cars = cars.filter(q => !q.rm);
      for (const cr of cars) if (cr.m === "d" && far(cr.x, cr.y, 1500)) roadSpawn(cr);
      const nd = cars.filter(q => q.m === "d").length, wc = Math.min(26, 14 + 2 * np);
      for (let i = nd; i < wc; i++) { const cr = mkCar(); if (roadSpawn(cr)) cars.push(cr); }
      if ((cleanCd -= 1) <= 0) { cleanCd = 5; Object.keys(pd).forEach(u => { if (!lp[u]) remove(RF(`games/${c}/p/${u}`)).catch(() => { }); }); }
    }
    evs = evs.slice(-10);
    const now = performance.now();
    if (now - pubAt > 130) { pubAt = now; publish(); }
  }
  function publish() {
    const r = Math.round, f2 = v => +v.toFixed(2);
    const s = { k: "sta", t: Date.now(), h: myUid, pd: peds.map(q => [q.id, r(q.x), r(q.y), f2(q.h), q.sk, q.st]), cr: cars.filter(q => !q.rm).map(q => [q.id, r(q.x), r(q.y), f2(q.a), r(q.v), q.c, q.m, q.o]), ev: evs };
    set(RF(`games/${c}/state`), JSON.stringify(s)).catch(() => { });
  }
  function simLoop() {
    if (!active) return;
    const h = hostUid();
    if (h === myUid) { if (!hostOn) becomeHost(); const now = performance.now(), dt = Math.min(.25, (now - hostT) / 1000); hostT = now; hostTick(dt); }
    else hostOn = false;
  }

  // ================= RÉCEPTION =================
  function onState(snap) {
    const v = snap.val(); if (!v) return; let s; try { s = JSON.parse(v); } catch { return; }
    if (s.k !== "sta" || !s.pd) return;
    if (s.h !== lastH) { lastH = s.h; lastT = 0; }
    if (s.t < lastT) return; lastT = s.t; ls = s;
    const seen = new Set();
    s.pd.forEach(a => { seen.add(a[0]); let d = dPeds.get(a[0]); if (!d) dPeds.set(a[0], d = { x: a[1], y: a[2], a: a[3] }); d.tx = a[1]; d.ty = a[2]; d.ta = a[3]; d.sk = a[4]; d.st = a[5]; });
    for (const k of dPeds.keys()) if (!seen.has(k)) dPeds.delete(k);
    const sc = new Set();
    s.cr.forEach(a => { sc.add(a[0]); let d = dCars.get(a[0]); if (!d) dCars.set(a[0], d = { x: a[1], y: a[2], a: a[3] }); d.tx = a[1]; d.ty = a[2]; d.ta = a[3]; d.v = a[4]; d.c = a[5]; d.m = a[6]; d.o = a[7]; });
    for (const k of dCars.keys()) if (!sc.has(k)) dCars.delete(k);
    (s.ev || []).forEach(e => { if (e[0] > lastEv) { lastEv = e[0]; splats.push({ x: e[1], y: e[2], t: tNow }); if (splats.length > 40) splats.shift(); if (Math.hypot(e[1] - me.x, e[2] - me.y) < 400) beep(130, .12, "square", .04, 60); } });
  }
  function onP(snap) { const o = snap.val() || {}, n = {}; Object.keys(o).forEach(u => { n[u] = parseP(o[u]); }); pd = n; }

  // ================= MOI =================
  const col = i => CCOL[(i | 0) % 8];
  function spawnAt(p) { me.x = p[0] + rr(-30, 30); me.y = p[1]; me.vid = 0; me.v = 0; me.hp = 100; me.dead = 0; me.heat = 0; me.bust = 0; job = null; cam.x = me.x; cam.y = me.y; }
  function die(why, loss, where) { me.dead = 2.2; me.msg = why; me.vid = 0; me.v = 0; me.heat = 0; me.cash = Math.floor(me.cash * (1 - loss)); me.where = where; beep(200, .4, "sawtooth", .06, 60); }
  function useKey() {
    if (me.dead > 0) return;
    if (me.vid) {
      for (const sg of [1, -1]) { const t = { x: me.x + Math.cos(me.a + sg * 1.5708) * 30, y: me.y + Math.sin(me.a + sg * 1.5708) * 30 }, q = { x: t.x, y: t.y }; if (!push(q, 8)) { me.x = t.x; me.y = t.y; break; } }
      me.vid = 0; me.v = 0; job = null; return;
    }
    let best = 0, bd = 48, bc = null;
    for (const [id, d] of dCars) if ((d.m === "d" || d.m === "p") && Math.hypot(d.x - me.x, d.y - me.y) < bd) { bd = Math.hypot(d.x - me.x, d.y - me.y); best = id; bc = d; }
    if (!best) return;
    me.vid = best; me.x = bc.x; me.y = bc.y; me.a = bc.a; me.v = bc.m === "d" ? bc.v : 0; myCol = bc.c;
    if (bc.m === "d") { me.heat += .8; floats.push({ x: me.x, y: me.y - 20, t: tNow, s: "🚗 Car-jacking !", c: "#ffd23f" }); }
    newJob();
  }
  function newJob() { for (let t = 0; t < 8; t++) { const jx = (1 + Math.floor(Math.random() * (N - 1))) * CELL, jy = (1 + Math.floor(Math.random() * (N - 1))) * CELL, d = Math.hypot(jx - me.x, jy - me.y); if (d > 700 || t === 7) { job = { x: jx, y: jy, d }; return; } } }
  function control(dt) {
    let ix = 0, iy = 0;
    if (stick) { const m = Math.hypot(stick.dx, stick.dy); if (m > .18) { const k = Math.min(1, (m - .18) / .7) / m; ix = stick.dx * k; iy = stick.dy * k; } }
    else { ix = (keys.has("R") ? 1 : 0) - (keys.has("L") ? 1 : 0); iy = (keys.has("D") ? 1 : 0) - (keys.has("U") ? 1 : 0); if (ix && iy && !me.vid) { ix *= .7071; iy *= .7071; } }
    if (me.vid) {
      const th = -iy;
      if (th > 0) me.v += th * 280 * dt; else if (th < 0) me.v += (me.v > 20 ? 520 : 160) * th * dt; else me.v -= Math.sign(me.v) * Math.min(Math.abs(me.v), 130 * dt);
      me.v = clamp(me.v, -110, 310);
      me.a += ix * 2.5 * dt * clamp(me.v / 110, -1, 1);
      me.x += Math.cos(me.a) * me.v * dt; me.y += Math.sin(me.a) * me.v * dt;
      if (push(me, 13)) { if (Math.abs(me.v) > 140) beep(80, .15, "sawtooth", .05, 30); me.v *= .35; }
    } else {
      const m = Math.hypot(ix, iy); if (m > .05) { me.a = Math.atan2(iy, ix); me.x += ix / Math.max(1, m) * 125 * dt; me.y += iy / Math.max(1, m) * 125 * dt; } me.v = m > .05 ? 125 : 0;
      push(me, 7);
    }
  }
  function interact(dt) {
    // piétons écrasés
    if (me.vid && Math.abs(me.v) > 60) for (const [id, d] of dPeds) if (!hitDone.has(id) && Math.hypot(d.x - me.x, d.y - me.y) < 20) {
      hitDone.add(id); me.cash += 50; me.heat += .8; me.hs++; me.hid = id; floats.push({ x: d.x, y: d.y - 10, t: tNow, s: "+$50", c: "#7ae582" }); beep(110, .1, "square", .05, 50); navigator.vibrate && navigator.vibrate(40);
    }
    if (hitDone.size > 30) for (const id of hitDone) if (!dPeds.has(id)) hitDone.delete(id);
    me.hurt -= dt;
    const ot = [];                                                         // autres véhicules en mouvement : [x, y, v]
    for (const d of dCars.values()) if (d.m === "d" || d.m === "c") ot.push([d.x, d.y, d.v, d.m]); else if (d.m === "p") ot.push([d.x, d.y, 0, "p"]);
    for (const [u, p] of activeP()) if (u !== myUid && p.vid) ot.push([dP.get(u) ? dP.get(u).x : p.x, dP.get(u) ? dP.get(u).y : p.y, p.v, "u"]);
    for (const [ox, oy, ov, om] of ot) {
      const dx = me.x - ox, dy = me.y - oy, d = Math.hypot(dx, dy);
      if (!me.vid) { if (ov > 50 && d < 19 && me.hurt <= 0) { me.hp -= Math.min(60, ov / 6); me.hurt = .6; me.x += dx / (d || 1) * 18; me.y += dy / (d || 1) * 18; beep(90, .15, "sawtooth", .05, 40); navigator.vibrate && navigator.vibrate(80); } }
      else if (d < 30 && ov !== undefined) { me.x += dx / (d || 1) * (30 - d); me.y += dy / (d || 1) * (30 - d); if (Math.abs(me.v) > 90) { me.v *= .5; beep(100, .1, "square", .04, 30); } if (om === "c") me.heat += dt * .5; }
    }
    // police : « arrêté » si un flic est collé à toi et que tu ne fonces pas
    let copNear = false, bust = false;
    for (const d of dCars.values()) if (d.m === "c") { const dd = Math.hypot(d.x - me.x, d.y - me.y); if (dd < 500) copNear = true; if (dd < 46) bust = true; }
    me.heat = Math.max(0, me.heat - dt * (copNear ? .02 : .09)); me.wl = Math.min(5, Math.ceil(me.heat - 1e-6));
    if (me.wl > 0 && bust && Math.abs(me.v) < 90) me.bust += dt; else me.bust = Math.max(0, me.bust - dt * 1.5);
    if (me.bust > .9) die("🚓 ARRÊTÉ ! −20 % de ton argent", .2, "police");
    if (me.hp <= 0) die("💀 K.O. : −10 % de ton argent", .1, "hosp");
    // conflit : deux joueurs montent dans la même voiture
    if (me.vid) for (const [u, p] of activeP()) if (u !== myUid && p.vid === me.vid && u < myUid) { me.vid = 0; me.v = 0; job = null; toast("Quelqu'un a pris cette voiture avant toi"); }
    // courses
    if (me.vid && !job) newJob();
    if (me.vid && job && Math.hypot(job.x - me.x, job.y - me.y) < 60) { const r = 200 + Math.round(job.d / 6); me.cash += r; floats.push({ x: me.x, y: me.y - 20, t: tNow, s: `+$${r} livraison !`, c: "#ffd23f" }); beep(660, .12, "triangle", .06); newJob(); }
  }
  function sendP(now) {
    const s = `${Math.round(me.x)},${Math.round(me.y)},${me.a.toFixed(2)},${me.vid},${me.wl},${Math.round(me.cash)},${Math.round(me.hp)},${Math.round(Math.abs(me.v))},${me.hs},${me.hid}`;
    if ((s === sentStr && now - sentAt < 700) || now - sentAt < 110) return;
    sentStr = s; sentAt = now; set(RF(`games/${c}/p/${myUid}`), s).catch(() => { });
    if (now - saveAt > 8000 && Math.round(me.cash) !== savedCash) { saveAt = now; savedCash = Math.round(me.cash); set(RF(`users/${myUid}/sta`), savedCash).catch(() => { }); }
  }

  // ================= DESSIN =================
  const txt = (s, px, py, size, color, al) => { x.font = `700 ${size}px system-ui,sans-serif`; x.textAlign = al || "center"; x.fillStyle = "#000a"; x.fillText(s, px + 1, py + 1); x.fillStyle = color || "#fff"; x.fillText(s, px, py); };
  function drawCar(px, py, a, color, cop, now, nm) {
    x.save(); x.translate(px, py); x.rotate(a);
    x.fillStyle = "#0005"; x.fillRect(-16, -6, 36, 18);
    x.fillStyle = cop ? "#eceff4" : color; x.fillRect(-18, -9, 36, 18);
    if (cop) { x.fillStyle = "#1d4ed8"; x.fillRect(-18, -2, 36, 4); }
    else { x.fillStyle = "#0003"; x.fillRect(-18, -9, 36, 3); x.fillRect(-18, 6, 36, 3); }
    x.fillStyle = "#16202c"; x.fillRect(-3, -7, 12, 14); x.fillStyle = "#9fd8ff55"; x.fillRect(7, -7, 4, 14);
    x.fillStyle = "#fff6b0"; x.fillRect(17, -8, 2, 4); x.fillRect(17, 4, 2, 4);
    x.fillStyle = "#ff3030"; x.fillRect(-19, -8, 2, 3); x.fillRect(-19, 5, 2, 3);
    if (cop) { const f = Math.floor(now / 160) % 2; x.fillStyle = f ? "#ff2a2a" : "#2a5bff"; x.fillRect(0, -8, 4, 8); x.fillStyle = f ? "#2a5bff" : "#ff2a2a"; x.fillRect(0, 0, 4, 8); }
    x.restore();
    if (nm) txt(nm, px, py - 20, 11);
  }
  function drawWalker(px, py, a, body, nm, skin) {
    x.fillStyle = "#0004"; x.beginPath(); x.arc(px + 2, py + 2, 6, 0, 7); x.fill();
    x.fillStyle = body; x.beginPath(); x.arc(px, py, 6, 0, 7); x.fill();
    x.fillStyle = skin || "#f1c27d"; x.beginPath(); x.arc(px + Math.cos(a) * 2, py + Math.sin(a) * 2, 3.6, 0, 7); x.fill();
    if (nm) txt(nm, px, py - 12, 11);
  }
  function drawWorld(vx0, vy0, vx1, vy1) {
    x.fillStyle = "#14161c"; x.fillRect(vx0, vy0, vx1 - vx0, vy1 - vy0);
    const rx0 = Math.max(vx0, -ROAD / 2), ry0 = Math.max(vy0, -ROAD / 2), rx1 = Math.min(vx1, WORLD + ROAD / 2), ry1 = Math.min(vy1, WORLD + ROAD / 2);
    if (rx1 <= rx0 || ry1 <= ry0) return;
    x.fillStyle = "#343741"; x.fillRect(rx0, ry0, rx1 - rx0, ry1 - ry0);
    x.strokeStyle = "#c9c36a"; x.lineWidth = 2; x.setLineDash([22, 22]);
    for (let i = Math.max(0, Math.ceil((vx0 - 5) / CELL)); i <= Math.min(N, Math.floor((vx1 + 5) / CELL)); i++) { x.beginPath(); x.moveTo(i * CELL, ry0); x.lineTo(i * CELL, ry1); x.stroke(); }
    for (let j = Math.max(0, Math.ceil((vy0 - 5) / CELL)); j <= Math.min(N, Math.floor((vy1 + 5) / CELL)); j++) { x.beginPath(); x.moveTo(rx0, j * CELL); x.lineTo(rx1, j * CELL); x.stroke(); }
    x.setLineDash([]);
    const i0 = clamp(Math.floor((vx0 - ROAD / 2) / CELL), 0, N - 1), i1 = clamp(Math.floor((vx1 - ROAD / 2) / CELL), 0, N - 1), j0 = clamp(Math.floor((vy0 - ROAD / 2) / CELL), 0, N - 1), j1 = clamp(Math.floor((vy1 - ROAD / 2) / CELL), 0, N - 1);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const bx = lo(i), by = lo(j), h = hs(i, j);
      x.fillStyle = "#8d909b"; x.fillRect(bx, by, BL, BL);
      if (isPark(i, j)) {
        x.fillStyle = "#3f8f4a"; x.fillRect(bx + SW, by + SW, BL - 2 * SW, BL - 2 * SW);
        for (let k = 0; k < 7; k++) { const tx = bx + SW + 20 + (hs(i + k, j * 7 + 1) % (BL - 2 * SW - 40)), ty = by + SW + 20 + (hs(j + k, i * 5 + 3) % (BL - 2 * SW - 40)); x.fillStyle = "#2c6e37"; x.beginPath(); x.arc(tx, ty, 15, 0, 7); x.fill(); x.fillStyle = "#3a8a47"; x.beginPath(); x.arc(tx - 3, ty - 3, 10, 0, 7); x.fill(); }
        continue;
      }
      const bw = BL - 2 * SW, sp = isSpecial(i, j), pol = i === POLICE[0] && j === POLICE[1];
      x.fillStyle = "#0004"; x.fillRect(bx + SW + 6, by + SW + 6, bw, bw);
      x.fillStyle = sp ? (pol ? "#2b4fb8" : "#e6edf3") : `hsl(${(h % 360)},${18 + h % 20}%,${34 + (h >> 8) % 18}%)`; x.fillRect(bx + SW, by + SW, bw, bw);
      x.strokeStyle = "#0006"; x.lineWidth = 3; x.strokeRect(bx + SW + 1.5, by + SW + 1.5, bw - 3, bw - 3);
      x.fillStyle = "#0002"; x.fillRect(bx + SW + 20 + (h >> 4) % 60, by + SW + 20 + (h >> 10) % 60, 50 + (h >> 14) % 50, 40 + (h >> 18) % 40);
      if (sp) { txt(pol ? "🚓 POLICE" : "🏥 HÔPITAL", bx + BL / 2, by + BL / 2 + 6, 22, pol ? "#fff" : "#d62828"); }
    }
  }
  function frame(now) {
    if (!active) { raf = 0; return; }
    raf = requestAnimationFrame(frame);
    const dt = Math.min(.05, (now - (tPrev || now)) / 1000); tPrev = now; tNow = now;
    // lissage des entités reçues
    const k = 1 - Math.exp(-13 * dt);
    for (const d of dPeds.values()) { d.x += (d.tx - d.x) * k; d.y += (d.ty - d.y) * k; d.a = angLerp(d.a, d.ta, k); }
    for (const d of dCars.values()) { if (Math.abs(d.tx - d.x) + Math.abs(d.ty - d.y) > 250) { d.x = d.tx; d.y = d.ty; } else { d.x += (d.tx - d.x) * k; d.y += (d.ty - d.y) * k; } d.a = angLerp(d.a, d.ta, k); }
    const lp = lobbyP();
    for (const [u, p] of activeP()) { if (u === myUid) continue; let d = dP.get(u); if (!d) dP.set(u, d = { x: p.x, y: p.y, a: p.a }); if (Math.abs(p.x - d.x) + Math.abs(p.y - d.y) > 300) { d.x = p.x; d.y = p.y; } else { d.x += (p.x - d.x) * k; d.y += (p.y - d.y) * k; } d.a = angLerp(d.a, p.a, k); d.vid = p.vid; d.cash = p.cash; d.wl = p.wl; d.v = p.v; }
    for (const u of dP.keys()) if (!lp[u]) dP.delete(u);
    // logique locale
    if (me.dead > 0) { me.dead -= dt; if (me.dead <= 0) { spawnAt(SPAWN[me.where || "hosp"]); } }
    else { if (useReq) { useReq = 0; useKey(); } control(dt); interact(dt); }
    useReq = 0;
    sendP(now);
    // caméra
    const tz = me.vid ? 1.15 - Math.min(.3, Math.abs(me.v) / 1000) : 1.35;
    cam.z += (tz - cam.z) * Math.min(1, 2.5 * dt); cam.x += (me.x + Math.cos(me.a) * (me.vid ? me.v * .25 : 0) - cam.x) * Math.min(1, 6 * dt); cam.y += (me.y + Math.sin(me.a) * (me.vid ? me.v * .25 : 0) - cam.y) * Math.min(1, 6 * dt);
    const S = cv.width / W, z = cam.z, vw = W / z, vh = H / z, vx0 = cam.x - vw / 2, vy0 = cam.y - vh / 2, vx1 = vx0 + vw, vy1 = vy0 + vh;
    x.setTransform(S * z, 0, 0, S * z, S * (W / 2 - cam.x * z), S * (H / 2 - cam.y * z));
    drawWorld(vx0, vy0, vx1, vy1);
    const inV = (px, py) => px > vx0 - 60 && px < vx1 + 60 && py > vy0 - 60 && py < vy1 + 60;
    splats.forEach(s => { const a = 1 - (now - s.t) / 30000; if (a > 0 && inV(s.x, s.y)) { x.globalAlpha = a * .7; x.fillStyle = "#a4161a"; x.beginPath(); x.arc(s.x, s.y, 9, 0, 7); x.fill(); x.globalAlpha = 1; } });
    splats = splats.filter(s => now - s.t < 30000);
    for (const [id, d] of dCars) if (d.m !== "t" && id !== me.vid && inV(d.x, d.y)) drawCar(d.x, d.y, d.a, col(d.c), d.m === "c", now);
    for (const d of dPeds.values()) if (inV(d.x, d.y)) drawWalker(d.x, d.y, d.a, SHIRT[d.sk % 6], "", SKIN[d.sk % 6]);
    for (const [u, d] of dP) if (inV(d.x, d.y)) { const pl = lp[u] || {}; if (d.vid) { const cc = dCars.get(d.vid); drawCar(d.x, d.y, d.a, col(cc ? cc.c : 0), false, now, pl.name); } else drawWalker(d.x, d.y, d.a, pl.color || "#fff", pl.name, "#f1c27d"); }
    if (me.dead <= 0) { if (me.vid) drawCar(me.x, me.y, me.a, col(myCol), false, now, ""); else drawWalker(me.x, me.y, me.a, (lp[myUid] || {}).color || "#fff", "", "#f1c27d"); x.strokeStyle = "#fff"; x.lineWidth = 1.5; x.beginPath(); x.arc(me.x, me.y, me.vid ? 24 : 12, 0, 7); x.globalAlpha = .35; x.stroke(); x.globalAlpha = 1; }
    if (job) { const f = (Math.sin(now / 250) + 1) / 2; x.strokeStyle = "#ffd23f"; x.lineWidth = 4; x.beginPath(); x.arc(job.x, job.y, 50 + f * 8, 0, 7); x.stroke(); x.fillStyle = "#ffd23f33"; x.fill(); txt("📦", job.x, job.y + 8, 24); }
    floats = floats.filter(f => now - f.t < 1400); floats.forEach(f => { x.globalAlpha = 1 - (now - f.t) / 1400; txt(f.s, f.x, f.y - (now - f.t) / 25, 14, f.c); }); x.globalAlpha = 1;
    // ----- HUD -----
    x.setTransform(S, 0, 0, S, 0, 0);
    txt(`$${Math.round(me.cash)}`, 14, 30, 24, "#7ae582", "left");
    txt("★".repeat(me.wl) + "☆".repeat(5 - me.wl), 14, 54, 20, me.wl ? (Math.floor(now / 250) % 2 ? "#ff4d6d" : "#4d79ff") : "#ffd23f", "left");
    x.fillStyle = "#0008"; x.fillRect(14, 64, 110, 9); x.fillStyle = me.hp > 40 ? "#3ee6c4" : "#ff4d6d"; x.fillRect(14, 64, 110 * clamp(me.hp, 0, 100) / 100, 9);
    const rank = [[myUid, me.cash]].concat(activeP().filter(([u]) => u !== myUid).map(([u, p]) => [u, p.cash])).sort((a, b) => b[1] - a[1]);
    txt(`Serveur ${c} · ${rank.length} joueur${rank.length > 1 ? "s" : ""}${hostOn ? " · hôte" : ""}`, W - 12, 20, 12, "#fff9", "right");
    rank.slice(0, 6).forEach(([u, cs], i) => { const pl = lp[u] || {}; x.fillStyle = pl.color || "#fff"; x.fillRect(W - 150, 30 + i * 18, 8, 8); txt(`${(pl.name || "?").slice(0, 10)}${u === myUid ? " (toi)" : ""}`, W - 136, 38 + i * 18, 12, "#fff", "left"); txt(`$${Math.round(cs)}`, W - 12, 38 + i * 18, 12, "#7ae582", "right"); });
    // mini-carte
    const mm = 130, mx = 10, my = H - mm - 10, mk = mm / WORLD;
    x.fillStyle = "#000b"; x.fillRect(mx - 2, my - 2, mm + 4, mm + 4); x.strokeStyle = "#5a5f6e"; x.lineWidth = 1; x.beginPath();
    for (let i = 0; i <= N; i++) { x.moveTo(mx + i * CELL * mk, my); x.lineTo(mx + i * CELL * mk, my + mm); x.moveTo(mx, my + i * CELL * mk); x.lineTo(mx + mm, my + i * CELL * mk); } x.stroke();
    const dot = (px, py, cl, r) => { x.fillStyle = cl; x.beginPath(); x.arc(mx + clamp(px, 0, WORLD) * mk, my + clamp(py, 0, WORLD) * mk, r, 0, 7); x.fill(); };
    dot(SPAWN.police[0], SPAWN.police[1], "#2b4fb8", 4); dot(SPAWN.hosp[0], SPAWN.hosp[1], "#e63946", 4);
    for (const d of dCars.values()) if (d.m === "c") dot(d.x, d.y, Math.floor(now / 200) % 2 ? "#ff2a2a" : "#2a5bff", 2.5);
    for (const [u, d] of dP) dot(d.x, d.y, (lp[u] || {}).color || "#fff", 2.5);
    if (job) dot(job.x, job.y, "#ffd23f", 4);
    dot(me.x, me.y, "#fff", 3.5);
    // bouton entrer / sortir (aussi pour le tactile)
    const bx = W - 56, by = H - 62; x.fillStyle = "#2e7dffcc"; x.beginPath(); x.arc(bx, by, 38, 0, 7); x.fill(); txt(me.vid ? "SORTIR" : "ENTRER", bx, by + 4, 12);
    if (!me.vid && me.dead <= 0) { let near = false; for (const d of dCars.values()) if ((d.m === "d" || d.m === "p") && Math.hypot(d.x - me.x, d.y - me.y) < 48) near = true; if (near) txt("E : monter dans la voiture", W / 2, H - 24, 14, "#ffd23f"); }
    if (me.vid && job) { const a = Math.atan2(job.y - me.y, job.x - me.x); txt(`📦 ${Math.round(Math.hypot(job.x - me.x, job.y - me.y) / 10)} m`, W / 2, 24, 14, "#ffd23f"); x.save(); x.translate(W / 2, 48); x.rotate(a); x.fillStyle = "#ffd23f"; x.beginPath(); x.moveTo(14, 0); x.lineTo(-8, -9); x.lineTo(-8, 9); x.fill(); x.restore(); }
    if (me.bust > .1) { x.fillStyle = "#2a5bff"; x.fillRect(W / 2 - 60, H / 2 + 40, 120 * clamp(me.bust / .9, 0, 1), 8); txt("ARRESTATION…", W / 2, H / 2 + 34, 12, "#8fb0ff"); }
    if (me.dead > 0) { x.fillStyle = "#000a"; x.fillRect(0, 0, W, H); txt(me.msg, W / 2, H / 2, 30, "#fff"); }
    if (stick) { x.fillStyle = "rgba(255,255,255,.08)"; x.strokeStyle = "rgba(255,255,255,.28)"; x.lineWidth = 2; x.beginPath(); x.arc(stick.ox, stick.oy, 55, 0, 7); x.fill(); x.stroke(); x.fillStyle = "rgba(255,255,255,.65)"; x.beginPath(); x.arc(stick.ox + stick.dx * 55, stick.oy + stick.dy * 55, 22, 0, 7); x.fill(); }
  }

  // ================= ENTRÉES =================
  addEventListener("keydown", e => {
    if (!active || /^(INPUT|TEXTAREA)$/.test(e.target.tagName)) return;
    if (e.key === " " || e.key === "e" || e.key === "E") { e.preventDefault(); if (!e.repeat) useReq = 1; return; }
    const k = KEYS[e.key.length > 1 ? e.key : e.key.toLowerCase()]; if (k) { e.preventDefault(); keys.add(k); }
  });
  addEventListener("keyup", e => { const k = KEYS[e.key.length > 1 ? e.key : e.key.toLowerCase()]; if (k) keys.delete(k); });
  addEventListener("blur", () => { keys.clear(); stick = null; });
  document.addEventListener("visibilitychange", () => { if (document.hidden) { keys.clear(); stick = null; } });
  const rel = e => { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) * W / r.width, y: (e.clientY - r.top) * H / r.height }; };
  cv.addEventListener("pointerdown", e => {
    if (!active) return; e.preventDefault(); const p = rel(e);
    if (e.button === 2 || Math.hypot(p.x - (W - 56), p.y - (H - 62)) < 40) { useReq = 1; return; }
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

  return {
    enter(code) {
      active = true; c = code; myUid = getMe().uid; ls = null; lastT = 0; lastH = ""; lastEv = 0; pd = {}; hostOn = false; keys = new Set(); stick = null; useReq = 0;
      dPeds.clear(); dCars.clear(); dP.clear(); splats = []; floats = []; hitDone = new Set(); lastHs = {}; sentStr = ""; sentAt = 0; savedCash = -1; saveAt = performance.now();
      Object.assign(me, { vid: 0, hp: 100, heat: 0, wl: 0, hs: 0, hid: 0, dead: 0, bust: 0, hurt: 0, v: 0, a: 0, cash: 0 });
      const ix = 2 + Math.floor(Math.random() * 5), iy = 2 + Math.floor(Math.random() * 5); spawnAt([ix * CELL, iy * CELL]);
      $("ghelp").textContent = "ZQSD / flèches : bouger · E ou Espace : monter / descendre d'une voiture · en voiture ↑ accélère, ↓ freine, ←→ tourne · livre les colis 📦, écrase des piétons, évite la police !";
      get(RF(`users/${myUid}/sta`)).then(s => { const v = +s.val(); if (v > 0 && me.cash === 0) { me.cash = v; savedCash = v; } }).catch(() => { });
      unS = onValue(RF(`games/${c}/state`), onState); unP = onValue(RF(`games/${c}/p`), onP);
      timer = setInterval(simLoop, 50); raf = requestAnimationFrame(frame);
      env.played && env.played("sta", true);
      return () => {
        active = false; clearInterval(timer); unS && unS(); unP && unP(); if (raf) cancelAnimationFrame(raf); raf = 0; keys.clear(); stick = null; hostOn = false;
        set(RF(`users/${myUid}/sta`), Math.round(me.cash)).catch(() => { }); remove(RF(`games/${c}/p/${myUid}`)).catch(() => { });
        x.setTransform(1, 0, 0, 1, 0, 0); x.globalAlpha = 1; x.setLineDash([]); x.textAlign = "start";
      };
    }
  };
}
