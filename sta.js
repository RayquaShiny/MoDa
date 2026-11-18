/* MoDa : « Sta I » 🚗 : un petit GTA 1 en ligne, vu de dessus.
   - Un serveur persistant : on clique sur la tuile et on arrive directement dedans (pas de lobby, pas de « lancer »).
     Serveurs STA1, STA2… (24 joueurs max chacun) : si le premier est plein, le suivant s'ouvre automatiquement.
   - L'HÔTE du serveur = le joueur arrivé en premier. S'il part, le suivant (par ordre d'arrivée) reprend la simulation
     là où elle en était : tout le monde calcule le même hôte à partir de lobbies/<code>/players/<uid>/j.
   - Chaque joueur écrit sa position dans games/<code>/p/<uid> (« x,y,angle,véhicule,étoiles,argent,pv,vitesse,coup,cible »).
     L'hôte simule PNJ (piétons, voitures, police) et publie games/<code>/state (JSON). Aucun nouveau chemin Firebase
     hormis users/<uid>/sta (ton argent, sauvegardé).
   - But : gagner de l'argent (courses en voiture, piétons écrasés), éviter la police (étoiles ★), finir premier du classement. */

const W = 800, H = 560, CELL = 360, ROAD = 100, N = 9, WORLD = N * CELL, BL = CELL - ROAD, SW = 18;
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
const WPN = [null,
  { n: "PISTOLET", rate: .34, rng: 340, pel: 1, spr: .02, car: 12, pvp: 14, heat: .05, max: 99, ammo: 30, snd: [330, .07, "square", .05, 140] },
  { n: "MITRAILLETTE", rate: .09, rng: 300, pel: 1, spr: .07, car: 6, pvp: 6, heat: .03, max: 300, ammo: 100, snd: [240, .05, "square", .04, 100] },
  { n: "FUSIL À POMPE", rate: .85, rng: 210, pel: 5, spr: .22, car: 9, pvp: 11, heat: .15, max: 50, ammo: 16, snd: [110, .16, "sawtooth", .08, 40] }];
// dégâts de carrosserie : 2 bits par zone (0 = avant, 1 = droite, 2 = arrière, 3 = gauche), niveau 0 à 3
const wear = id => hs(id | 0, 99) % 100 < 40 ? 1 << ([1, 1, 3, 0, 2, 1][hs(id | 0, 5) % 6] * 2) : 0;
const dmx = (a, b) => { let r = 0; for (let z = 0; z < 4; z++) r |= Math.max((a >> (z * 2)) & 3, (b >> (z * 2)) & 3) << (z * 2); return r; };
const dmSum = d => { let t = 0; for (let z = 0; z < 4; z++) t += ((d | 0) >> (z * 2)) & 3; return t; };
const inBld = (px, py) => { const i = Math.floor((px - ROAD / 2) / CELL), j = Math.floor((py - ROAD / 2) / CELL); if (i < 0 || j < 0 || i >= N || j >= N || isPark(i, j)) return false; const x0 = lo(i) + SW, y0 = lo(j) + SW; return px > x0 && px < x0 + BL - 2 * SW && py > y0 && py < y0 + BL - 2 * SW; };
const wallEnd = (ox, oy, ang, rng) => { const dx = Math.cos(ang), dy = Math.sin(ang); for (let t = 8; t <= rng; t += 6) if (inBld(ox + dx * t, oy + dy * t)) return t; return rng; };
const PICKS = [];
for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
  if (isPark(i, j) || isSpecial(i, j)) continue; const h = hs(i, j + 404); if (h % 2) continue;
  const e = (h >>> 3) % 4, t = 30 + (h >>> 6) % (BL - 60), x0 = lo(i), y0 = lo(j), ty = [1, 1, 2, 3][(h >>> 12) % 4];
  PICKS.push({ id: i * N + j, t: ty, x: e === 2 ? x0 + SW / 2 : e === 3 ? x0 + BL - SW / 2 : x0 + t, y: e === 0 ? y0 + SW / 2 : e === 1 ? y0 + BL - SW / 2 : y0 + t });
}
PICKS.push({ id: 900, t: 2, x: lo(POLICE[0]) + 130, y: lo(POLICE[1]) + BL - SW / 2 }, { id: 901, t: 1, x: lo(HOSP[0]) + 130, y: lo(HOSP[1]) + BL - SW / 2 });

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
const parseP = s => { const a = String(s).split(","); return { x: +a[0] || 0, y: +a[1] || 0, a: +a[2] || 0, vid: +a[3] || 0, wl: +a[4] || 0, cash: +a[5] || 0, hp: +a[6] || 0, v: +a[7] || 0, hs: +a[8] || 0, hid: +a[9] || 0, dm: +a[10] || 0, wpn: +a[11] || 0, fc: +a[12] || 0, fw: +a[13] || 0, cs: +a[14] || 0, cid: +a[15] || 0, ca: +a[16] || 0 }; };

export function createStaClient(env) {
  const { R: RF, set, get, remove, onValue, $, beep, getMe, getCode, getLobby, toast } = env;
  const cv = $("cv"), mx2 = cv.getContext("2d"), LR = 2, lc = document.createElement("canvas"), lx = lc.getContext("2d");
  lc.width = W / LR; lc.height = H / LR; let x = mx2;
  const mkPat = (base, sp, n) => { const c2 = document.createElement("canvas"); c2.width = c2.height = 128; const g = c2.getContext("2d"); g.fillStyle = base; g.fillRect(0, 0, 128, 128); let seed = 7; const r = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff; for (let i = 0; i < n; i++) { g.fillStyle = sp[Math.floor(r() * sp.length)]; g.fillRect(Math.floor(r() * 64) * 2, Math.floor(r() * 64) * 2, 2, 2); } return lx.createPattern(c2, "repeat") || base; };
  const patRoad = mkPat("#5d5c7b", ["#524f70", "#6a6888", "#4b4968"], 750), patGrass = mkPat("#3c7d2c", ["#33702a", "#478b36", "#2d6424"], 650);
  const patSide = (() => { const c2 = document.createElement("canvas"); c2.width = c2.height = 128; const g = c2.getContext("2d"), T = 32, cs = ["#cfc89c", "#c8c194", "#d3cca2", "#c2bb8e"]; let seed = 11; const r = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    for (let ty = 0; ty < 4; ty++) for (let tx = 0; tx < 4; tx++) { const ox = tx * T, oy = ty * T; g.fillStyle = cs[Math.floor(r() * 4)]; g.fillRect(ox, oy, T, T); g.fillStyle = "#e9e3bb"; g.fillRect(ox, oy, T, 2); g.fillRect(ox, oy, 2, T); g.fillStyle = "#9a9468"; g.fillRect(ox, oy + T - 2, T, 2); g.fillRect(ox + T - 2, oy, 2, T); for (let n = 0; n < 22; n++) { g.fillStyle = r() < .5 ? "#b5ae82" : "#dad4aa"; g.fillRect(ox + 2 + Math.floor(r() * 14) * 2, oy + 2 + Math.floor(r() * 14) * 2, 2, 2); } }
    return lx.createPattern(c2, "repeat") || "#cfc89c"; })();
  const TOUCH = typeof matchMedia === "function" && matchMedia("(pointer:coarse)").matches;
  let active = false, raf = 0, timer = 0, tPrev = 0, c = "", myUid = "", unS = null, unP = null;
  // --- état partagé reçu ---
  let ls = null, lastT = 0, lastH = "", lastEv = 0, pd = {};
  const dPeds = new Map(), dCars = new Map(), dP = new Map();
  // --- simulation de l'hôte ---
  let hostOn = false, peds = [], cars = [], nid = 1, evs = [], evId = 0, lastHs = {}, spawnCd = 0, streamCd = 0, pubAt = 0, hostT = 0, cleanCd = 0;
  // --- moi ---
  const me = { x: 0, y: 0, a: 0, v: 0, vid: 0, hp: 100, cash: 0, heat: 0, wl: 0, hs: 0, hid: 0, dead: 0, msg: "", hurt: 0, bust: 0, carT: 99, wpn: 0, ammo: [0, 0, 0, 0], dm: 0, fc: 0, fw: 0, cs: 0, cid: 0, ca: 0, cd: 0, flash: 0, dmCd: 0, scr: 0, lastCar: 0, lastCarT: 0, gunT: -1e9 };
  let keys = new Set(), stick = null, useReq = 0, job = null, myCol = 0, cam = { x: 0, y: 0, z: 1.2 }, sentAt = 0, sentStr = "", savedCash = -1, saveAt = 0, tNow = 0, hitDone = new Set();
  let splats = [], floats = [], brakeId = null, fireKey = false, fireId = null, killQ = [], carQ = [], killAt = 0, tracers = [], sparks = [], booms = [], wrecks = [], pickT = new Map(), lastFc = {}, lastCs = {};

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
    if (e === 0) { q.x = x0 + t; q.y = y0 + SW / 2; } else if (e === 1) { q.x = x0 + t; q.y = y0 + BL - SW / 2; } else if (e === 2) { q.x = x0 + SW / 2; q.y = y0 + t; } else { q.x = x0 + BL - SW / 2; q.y = y0 + t; }
  }
  const nearPt = (a, b) => { const ps = activeP(); if (!ps.length) return null; const p = rnd(ps)[1], an = rr(0, 6.283), d = rr(a, b); return [clamp(p.x + Math.cos(an) * d, 0, WORLD), clamp(p.y + Math.sin(an) * d, 0, WORLD)]; };

  function becomeHost() {
    hostOn = true; peds = []; cars = []; nid = 1; evs = []; evId = lastEv; lastHs = {}; lastCs = {}; streamCd = 0; spawnCd = 0; hostT = performance.now();
    if (ls && ls.pd) {
      ls.pd.forEach(a => peds.push({ id: a[0], x: a[1], y: a[2], h: a[3], sk: a[4], st: 0, tm: 1 }));
      ls.cr.forEach(a => { const ang = a[3]; let dx = Math.round(Math.cos(ang)), dy = Math.round(Math.sin(ang)); if (dx && dy) dy = 0; if (!dx && !dy) dx = 1; cars.push({ id: a[0], x: a[1], y: a[2], a: ang, v: a[4], c: a[5], m: a[6] === "t" ? "p" : a[6], dm: a[8] | 0, o: "", tm: 30, dx, dy, sp: rr(110, 170), tg: "" }); });
      nid = Math.max(0, ...peds.map(q => q.id), ...cars.map(q => q.id)) + 1;
    }
  }
  function hostTick(dt) {
    const ps = activeP(), lp = lobbyP();
    const taken = {}; ps.forEach(([u, p]) => { if (p.vid) taken[p.vid] = [u, p]; });
    cars.forEach(cr => {
      const t = taken[cr.id];
      if (t) { cr.m = "t"; cr.o = t[0]; cr.x = t[1].x; cr.y = t[1].y; cr.a = t[1].a; cr.v = t[1].v; cr.tm = 0; cr.dm = t[1].dm; }
      else if (cr.m === "t") { cr.m = "p"; cr.o = ""; cr.v = 0; cr.tm = 45; }
    });
    ps.forEach(([u, p]) => {                                              // piétons écrasés (annoncés par le conducteur)
      if (lastHs[u] === undefined) lastHs[u] = p.hs;
      else if (p.hs !== lastHs[u]) { lastHs[u] = p.hs; const i = peds.findIndex(q => q.id === p.hid); if (i >= 0) { evs.push([++evId, Math.round(peds[i].x), Math.round(peds[i].y), 1]); peds.splice(i, 1); } }
    });
    ps.forEach(([u, p]) => {                                              // tirs sur les voitures (annoncés par le tireur)
      if (lastCs[u] === undefined) { lastCs[u] = p.cs; return; }
      if (p.cs === lastCs[u]) return; lastCs[u] = p.cs;
      const cr = cars.find(q => q.id === p.cid); if (!cr || cr.rm || (cr.m !== "d" && cr.m !== "c" && cr.m !== "p")) return;
      cr.hp = (cr.hp === undefined ? (cr.m === "c" ? 100 : 60) : cr.hp) - p.ca;
      if (cr.hp <= 0) { evs.push([++evId, Math.round(cr.x), Math.round(cr.y), 2, +cr.a.toFixed(2), cr.id, cr.m]); cr.rm = 1; cr.m = "x"; }
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
    const s = { k: "sta", t: Date.now(), h: myUid, pd: peds.map(q => [q.id, r(q.x), r(q.y), f2(q.h), q.sk, q.st]), cr: cars.filter(q => !q.rm).map(q => [q.id, r(q.x), r(q.y), f2(q.a), r(q.v), q.c, q.m, q.o, q.dm | 0]), ev: evs };
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
    s.cr.forEach(a => { sc.add(a[0]); let d = dCars.get(a[0]); if (!d) dCars.set(a[0], d = { x: a[1], y: a[2], a: a[3] }); d.tx = a[1]; d.ty = a[2]; d.ta = a[3]; d.v = a[4]; d.c = a[5]; d.m = a[6]; d.o = a[7]; d.dm = a[8] | 0; });
    for (const k of dCars.keys()) if (!sc.has(k)) dCars.delete(k);
    (s.ev || []).forEach(e => {
      if (e[0] <= lastEv) return; lastEv = e[0];
      if (e[3] === 2) {                                                   // voiture détruite : explosion + épave
        booms.push({ x: e[1], y: e[2], t: tNow }); wrecks.push({ x: e[1], y: e[2], a: e[4] || 0, t: tNow, id: e[5] || 0 }); if (wrecks.length > 8) wrecks.shift();
        const dd = Math.hypot(e[1] - me.x, e[2] - me.y); if (dd < 500) beep(70, .35, "sawtooth", .09, 30);
        if (dd < 75 && me.dead <= 0) me.hp -= 30;
        if (e[5] && e[5] === me.lastCar && tNow - me.lastCarT < 2500) { const rw = e[6] === "c" ? 300 : 100; me.cash += rw; me.heat = Math.min(5, me.heat + (e[6] === "c" ? .5 : .3)); floats.push({ x: e[1], y: e[2] - 20, t: tNow, s: `💥 +$${rw}`, c: "#ffd23f" }); }
        return;
      }
      splats.push({ x: e[1], y: e[2], t: tNow }); if (splats.length > 40) splats.shift(); if (Math.hypot(e[1] - me.x, e[2] - me.y) < 400) beep(130, .12, "square", .04, 60);
    });
  }
  function onP(snap) {
    const o = snap.val() || {}, n = {}; Object.keys(o).forEach(u => { n[u] = parseP(o[u]); }); pd = n;
    for (const u in n) {                                                  // tirs des autres : traceurs + touche calculée chez la victime
      if (u === myUid) continue; const p = n[u], old = lastFc[u]; lastFc[u] = p.fc; if (old === undefined || old === p.fc) continue;
      let k = (p.fc - old + 1000) % 1000; if (k > 8) k = 1; const W = WPN[p.fw]; if (!W) continue;
      const dd = dP.get(u); if (dd) dd.flash = tNow;
      for (let sh = 0; sh < k; sh++) for (let q = 0; q < W.pel; q++) {
        const ang = p.a + rr(-W.spr, W.spr), dx = Math.cos(ang), dy = Math.sin(ang), ox = p.x + dx * (p.vid ? 24 : 11), oy = p.y + dy * (p.vid ? 24 : 11), e = wallEnd(ox, oy, ang, W.rng);
        tracers.push({ x0: ox, y0: oy, x1: ox + dx * e, y1: oy + dy * e, t: tNow });
        if (me.dead > 0) continue;
        const rx = me.x - ox, ry = me.y - oy, f = rx * dx + ry * dy;
        if (f > 0 && f < e && Math.abs(-rx * dy + ry * dx) < (me.vid ? 15 : 8)) { me.hp -= W.pvp * (me.vid ? .6 : 1); beep(150, .05, "square", .04, 50); if (me.vid && Math.random() < .3) dent(ang + Math.PI, 1); }
      }
    }
  }

  // ================= MOI =================
  const col = i => CCOL[(i | 0) % 8];
  function spawnAt(p) { me.x = p[0] + rr(-30, 30); me.y = p[1]; me.vid = 0; me.v = 0; me.hp = 100; me.dead = 0; me.heat = 0; me.bust = 0; job = null; cam.x = me.x; cam.y = me.y; }
  function die(why, loss, where) { me.dead = 2.2; me.msg = why; me.wpn = 0; me.ammo = [0, 0, 0, 0]; me.vid = 0; me.v = 0; me.heat = 0; me.cash = Math.floor(me.cash * (1 - loss)); me.where = where; beep(200, .4, "sawtooth", .06, 60); }
  function useKey() {
    if (me.dead > 0) return;
    if (me.vid) {
      for (const sg of [1, -1]) { const t = { x: me.x + Math.cos(me.a + sg * 1.5708) * 30, y: me.y + Math.sin(me.a + sg * 1.5708) * 30 }, q = { x: t.x, y: t.y }; if (!push(q, 8)) { me.x = t.x; me.y = t.y; break; } }
      me.vid = 0; me.v = 0; job = null; return;
    }
    let best = 0, bd = 48, bc = null;
    for (const [id, d] of dCars) if ((d.m === "d" || d.m === "p") && Math.hypot(d.x - me.x, d.y - me.y) < bd) { bd = Math.hypot(d.x - me.x, d.y - me.y); best = id; bc = d; }
    if (!best) return;
    me.vid = best; me.x = bc.x; me.y = bc.y; me.a = bc.a; me.v = bc.m === "d" ? bc.v : 0; myCol = bc.c; me.carT = 0; me.dm = dmx(bc.dm | 0, wear(best));
    if (bc.m === "d") { me.heat += .8; floats.push({ x: me.x, y: me.y - 20, t: tNow, s: "🚗 Car-jacking !", c: "#ffd23f" }); }
    newJob();
  }
  function dent(wa, sev) {                                                // la tôle se déforme du côté de l'impact (wa = angle monde vers le point d'impact)
    if (!me.vid || me.dmCd > 0) return; me.dmCd = .35;
    const rel = Math.atan2(Math.sin(wa - me.a), Math.cos(wa - me.a)), z = Math.abs(rel) < .785 ? 0 : Math.abs(rel) > 2.356 ? 2 : rel > 0 ? 1 : 3;
    for (let k = 0; k < sev; k++) if (((me.dm >> (z * 2)) & 3) < 3) me.dm += 1 << (z * 2);
    beep(120, .12, "square", .05, 50); navigator.vibrate && navigator.vibrate(30);
  }
  const hasGun = () => me.ammo.some(v => v > 0);
  function selWpn(n) { if (me.ammo[n] > 0) me.wpn = n; }
  function cycleWpn() { for (let k = 1; k <= 3; k++) { const n = (me.wpn - 1 + k + 3) % 3 + 1; if (me.ammo[n] > 0) { me.wpn = n; return; } } me.wpn = 0; }
  function trace(ox, oy, ang, W) {                                        // un tir « hitscan » : s'arrête au mur, au piéton ou à la voiture touchée
    const dx = Math.cos(ang), dy = Math.sin(ang); let bf = wallEnd(ox, oy, ang, W.rng), best = null;
    for (const [id, d] of dPeds) { if (hitDone.has(id)) continue; const rx = d.x - ox, ry = d.y - oy, f = rx * dx + ry * dy; if (f > 0 && f < bf && Math.abs(-rx * dy + ry * dx) < 8) { bf = f; best = ["p", id, d]; } }
    for (const [id, d] of dCars) { if (d.m === "t" || id === me.vid) continue; const rx = d.x - ox, ry = d.y - oy, f = rx * dx + ry * dy; if (f > 0 && f - 14 < bf && Math.abs(-rx * dy + ry * dx) < 17) { bf = Math.max(6, f - 14); best = ["c", id, d]; } }
    if (best) {
      if (best[0] === "p") { const d = best[2]; hitDone.add(best[1]); killQ.push(best[1]); me.cash += 30; me.heat = Math.min(5, me.heat + .5); floats.push({ x: d.x, y: d.y - 10, t: tNow, s: "+$30", c: "#7ae582" }); splats.push({ x: d.x, y: d.y, t: tNow }); }
      else { me.lastCar = best[1]; me.lastCarT = tNow; const l = carQ[carQ.length - 1]; if (l && l[0] === best[1]) l[1] += W.car; else carQ.push([best[1], W.car]); if (carQ.length > 8) carQ.shift(); }
    }
    if (best || bf < W.rng) sparks.push({ x: ox + dx * bf, y: oy + dy * bf, t: tNow });
    return bf;
  }
  function weapons(dt, now) {
    me.cd -= dt; me.flash -= dt; me.dmCd -= dt;
    for (const p of PICKS) {                                              // ramassage des armes
      if (Math.abs(p.x - me.x) > 24 || Math.abs(p.y - me.y) > 24 || Math.hypot(p.x - me.x, p.y - me.y) > 24) continue;
      const t = pickT.get(p.id); if (t !== undefined && now - t < 45000) continue; pickT.set(p.id, now);
      const W = WPN[p.t], had = me.ammo[p.t] > 0; me.ammo[p.t] = Math.min(W.max, me.ammo[p.t] + W.ammo); if (!had || !me.wpn) me.wpn = p.t; me.gunT = now;
      floats.push({ x: me.x, y: me.y - 22, t: now, s: `🔫 ${W.n} +${W.ammo}`, c: "#ffe14d" }); beep(880, .1, "triangle", .06);
    }
    if (me.wpn && me.ammo[me.wpn] <= 0) cycleWpn();
    if ((fireKey || fireId !== null) && me.wpn && me.cd <= 0 && me.ammo[me.wpn] > 0) {
      const W = WPN[me.wpn], dx = Math.cos(me.a), dy = Math.sin(me.a), ox = me.x + dx * (me.vid ? 24 : 11), oy = me.y + dy * (me.vid ? 24 : 11);
      me.ammo[me.wpn]--; me.cd = W.rate; me.fc = (me.fc + 1) % 1000; me.fw = me.wpn; me.flash = .07; me.heat = Math.min(5, me.heat + W.heat);
      for (let q = 0; q < W.pel; q++) { const ang = me.a + rr(-W.spr, W.spr), e = trace(ox, oy, ang, W); tracers.push({ x0: ox, y0: oy, x1: ox + Math.cos(ang) * e, y1: oy + Math.sin(ang) * e, t: now }); }
      beep(...W.snd); navigator.vibrate && navigator.vibrate(12);
    }
    if (now - killAt > 150) {                                             // on annonce à l'hôte un coup à la fois (piéton abattu / voiture touchée)
      killAt = now;
      if (killQ.length) { me.hs++; me.hid = killQ.shift(); }
      if (carQ.length) { const q = carQ.shift(); me.cs = (me.cs + 1) % 1000; me.cid = q[0]; me.ca = Math.min(255, Math.round(q[1])); }
    }
  }
  function newJob() { for (let t = 0; t < 8; t++) { const jx = (1 + Math.floor(Math.random() * (N - 1))) * CELL, jy = (1 + Math.floor(Math.random() * (N - 1))) * CELL, d = Math.hypot(jx - me.x, jy - me.y); if (d > 700 || t === 7) { job = { x: jx, y: jy, d }; return; } } }
  function control(dt) {
    let ix = 0, iy = 0;
    if (stick) { const m = Math.hypot(stick.dx, stick.dy); if (m > .18) { const k = Math.min(1, (m - .18) / .7) / m; ix = stick.dx * k; iy = stick.dy * k; } }
    else { ix = (keys.has("R") ? 1 : 0) - (keys.has("L") ? 1 : 0); iy = (keys.has("D") ? 1 : 0) - (keys.has("U") ? 1 : 0); if (ix && iy && !me.vid) { ix *= .7071; iy *= .7071; } }
    if (me.vid) {
      // conduite « arcade » : ↑ accélère (et freine si on recule), ↓ freine puis recule, ←→ tourne le nez de la voiture (seulement si elle roule)
      let th = -iy, sr = ix;                                              // clavier : ↑↓ gaz/frein, ←→ volant
      if (stick) {                                                        // doigt / souris : la voiture tourne toute seule vers la direction montrée
        const m = Math.hypot(ix, iy);
        if (brakeId !== null) { th = -1; sr = ix; }
        else if (m > .05) { let d = Math.atan2(iy, ix) - me.a; d = Math.atan2(Math.sin(d), Math.cos(d)); sr = clamp(d * 2.2, -1, 1); th = Math.abs(d) < 1.6 ? Math.max(.6, m) : .5; }
        else { th = 0; sr = 0; }
      } else if (brakeId !== null) th = -1;
      const MAXV = 230 * (1 - .045 * dmSum(me.dm)), REV = 95;
      if (th > 0) me.v += (me.v < -5 ? 620 : 330) * th * dt;
      else if (th < 0) me.v -= (me.v > 10 ? 620 : 190) * -th * dt;
      else me.v -= Math.sign(me.v) * Math.min(Math.abs(me.v), 170 * dt);
      me.v = clamp(me.v, -REV, MAXV);
      me.a += sr * 2.9 * clamp(Math.abs(me.v) / 45, 0, 1) * (1 - .35 * Math.abs(me.v) / MAXV) * dt;
      const sx = me.x + Math.cos(me.a) * me.v * dt, sy = me.y + Math.sin(me.a) * me.v * dt;
      me.x = sx; me.y = sy;
      if (push(me, 13)) {                                                  // contre un mur : on glisse, et on ne perd de la vitesse que si on le prend de face
        const cx = me.x - sx, cy = me.y - sy, cl = Math.hypot(cx, cy);
        if (cl > .01 && Math.abs(me.v) > 1) { const dot = (Math.cos(me.a) * cx + Math.sin(me.a) * cy) / cl * Math.sign(me.v); if (dot > -.35 && Math.abs(me.v) > 70) { me.scr += Math.abs(me.v) * dt; if (me.scr > 110) { me.scr = 0; dent(Math.atan2(-cy, -cx), 1); } }   // frottement : le flanc se froisse
          if (dot < 0) { if (Math.abs(me.v) > 110 && -dot > .35) dent(Math.atan2(-cy, -cx), Math.abs(me.v) > 190 ? 2 : 1); if (Math.abs(me.v) > 140 && -dot > .5) beep(80, .12, "sawtooth", .05, 30); me.v *= 1 + dot * .75; } }
      }
    } else {
      const m = Math.hypot(ix, iy); if (m > .05) { me.a = Math.atan2(iy, ix); me.x += ix / Math.max(1, m) * 125 * dt; me.y += iy / Math.max(1, m) * 125 * dt; } me.v = m > .05 ? 125 : 0;
      push(me, 7);
    }
  }
  function interact(dt) {
    // piétons écrasés
    if (me.vid && Math.abs(me.v) > 60) for (const [id, d] of dPeds) if (!hitDone.has(id) && Math.hypot(d.x - me.x, d.y - me.y) < 20) {
      hitDone.add(id); killQ.push(id); me.cash += 50; me.heat += .8; floats.push({ x: d.x, y: d.y - 10, t: tNow, s: "+$50", c: "#7ae582" }); beep(110, .1, "square", .05, 50); navigator.vibrate && navigator.vibrate(40);
    }
    if (hitDone.size > 30) for (const id of hitDone) if (!dPeds.has(id)) hitDone.delete(id);
    me.hurt -= dt;
    const ot = [];                                                         // autres véhicules en mouvement : [x, y, v]
    for (const d of dCars.values()) if (d.m === "d" || d.m === "c") ot.push([d.x, d.y, d.v, d.m]); else if (d.m === "p") ot.push([d.x, d.y, 0, "p"]);
    for (const [u, p] of activeP()) if (u !== myUid && p.vid) ot.push([dP.get(u) ? dP.get(u).x : p.x, dP.get(u) ? dP.get(u).y : p.y, p.v, "u"]);
    for (const [ox, oy, ov, om] of ot) {
      const dx = me.x - ox, dy = me.y - oy, d = Math.hypot(dx, dy);
      if (!me.vid) { if (ov > 50 && d < 19 && me.hurt <= 0) { me.hp -= Math.min(60, ov / 6); me.hurt = .6; me.x += dx / (d || 1) * 18; me.y += dy / (d || 1) * 18; beep(90, .15, "sawtooth", .05, 40); navigator.vibrate && navigator.vibrate(80); } }
      else if (d < 30 && ov !== undefined) { me.x += dx / (d || 1) * (30 - d); me.y += dy / (d || 1) * (30 - d); if (Math.abs(me.v) > 90) { const sv = Math.abs(me.v); me.v *= .5; dent(Math.atan2(-dy, -dx), sv > 170 ? 2 : 1); beep(100, .1, "square", .04, 30); } if (om === "c") me.heat += dt * .5; }
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
    const s = `${Math.round(me.x)},${Math.round(me.y)},${me.a.toFixed(2)},${me.vid},${me.wl},${Math.round(me.cash)},${Math.round(me.hp)},${Math.round(Math.abs(me.v))},${me.hs},${me.hid},${me.vid ? me.dm : 0},${me.wpn},${me.fc},${me.fw},${me.cs},${me.cid},${me.ca}`;
    if ((s === sentStr && now - sentAt < 700) || now - sentAt < 110) return;
    sentStr = s; sentAt = now; set(RF(`games/${c}/p/${myUid}`), s).catch(() => { });
    if (now - saveAt > 8000 && Math.round(me.cash) !== savedCash) { saveAt = now; savedCash = Math.round(me.cash); set(RF(`users/${myUid}/sta`), savedCash).catch(() => { }); }
  }

  // ================= DESSIN (style GTA 1 : vue de dessus, rendu pixelisé 2×, ombres portées, toits plats) =================
const ROOF = [["#8b5a3c", "#a8714b", "#5e3a25"], ["#7d7d86", "#9a9aa5", "#55555d"], ["#a33b3b", "#c25353", "#6e2424"], ["#c9b27c", "#dcc794", "#8f7c4f"], ["#3d5a80", "#5577a3", "#27394f"], ["#6b7a3a", "#8a9a50", "#444f22"], ["#b0663a", "#cf8352", "#7a4222"], ["#9b9b9b", "#bdbdbd", "#666666"]];
const shadeC = new Map();
const shade = (hex, f) => { const k = hex + f; let v = shadeC.get(k); if (!v) { const n = parseInt(hex.slice(1), 16) || 0; v = `rgb(${Math.round((n >> 16 & 255) * f)},${Math.round((n >> 8 & 255) * f)},${Math.round((n & 255) * f)})`; shadeC.set(k, v); } return v; };
const txt = (s, px, py, size, color, al) => { x.font = `700 ${size}px "Courier New",monospace`; x.textAlign = al || "center"; x.fillStyle = "#000"; x.fillText(s, px + 1.5, py + 1.5); x.fillStyle = color || "#fff"; x.fillText(s, px, py); };
const WALL = ["#b07a35", "#8b8d99", "#b5523c", "#c9a867", "#5f7fa8", "#8a8f4c", "#c27a3e", "#a9a49a"];
const rrect = (px, py, w, h, r) => { x.beginPath(); x.moveTo(px + r, py); x.arcTo(px + w, py, px + w, py + h, r); x.arcTo(px + w, py + h, px, py + h, r); x.arcTo(px, py + h, px, py, r); x.arcTo(px, py, px + w, py, r); x.closePath(); };
function drawCar(px, py, a, color, cop, now, id, dm) {
  const ty = cop ? 0 : (id | 0) % 3, S = 1.18, L = (ty === 2 ? 42 : ty === 1 ? 34 : 38) * S, Wd = (ty === 2 ? 20 : ty === 1 ? 16 : 18) * S, hl = L / 2, hw = Wd / 2;
  dm |= 0; const body = cop ? "#f3f3f3" : color, gl = "#8fc7ea", gd = "#4f7a97";
  const cx0 = ty === 2 ? -hl + 3 : ty === 1 ? -hl + L * .3 : -hl + L * .2, cx1 = ty === 2 ? hl - L * .26 : hl - L * (ty === 1 ? .3 : .32), mid = (cx0 + cx1) / 2;
  x.save(); x.translate(px, py); x.rotate(a);
  x.fillStyle = "rgba(0,0,0,.4)"; rrect(-hl + 4, -hw + 4, L, Wd, 5); x.fill();                    // ombre
  x.fillStyle = "#08080c"; [[-hl * .62, -1], [hl * .55, -1], [-hl * .62, 1], [hl * .55, 1]].forEach(([wx, sd]) => x.fillRect(wx - 4.5, sd < 0 ? -hw - 1.8 : hw - 1.2, 9, 3));   // roues
  x.fillStyle = "#0c0c10"; rrect(-hl - 1, -hw - 1, L + 2, Wd + 2, 6); x.fill();                  // contour
  x.fillStyle = body; rrect(-hl, -hw, L, Wd, 5); x.fill();                                        // carrosserie
  x.fillStyle = "rgba(255,255,255,.2)"; rrect(-hl + 1, -hw + 1, L - 2, Wd * .3, 3); x.fill();    // reflet
  x.fillStyle = "rgba(0,0,0,.22)"; rrect(-hl + 1, hw - Wd * .26, L - 2, Wd * .26 - 1, 3); x.fill();
  if (cop) { x.fillStyle = "#16161c"; x.fillRect(-hl + 5, -hw + .5, L - 10, 3.2); x.fillRect(-hl + 5, hw - 3.7, L - 10, 3.2); }
  x.fillStyle = "#0c0c10"; x.fillRect(cx1 - 1, -hw - 2.2, 3.4, 3); x.fillRect(cx1 - 1, hw - .8, 3.4, 3);   // rétroviseurs
  x.fillStyle = body; x.fillRect(cx1 - .5, -hw - 1.6, 2.4, 2); x.fillRect(cx1 - .5, hw - .4, 2.4, 2);
  x.fillStyle = cop ? "#dcdcdc" : shade(body, ty === 2 ? .8 : .9); rrect(cx0, -hw + 2.2, cx1 - cx0, Wd - 4.4, 3); x.fill();   // toit
  if (ty === 2) { x.strokeStyle = "rgba(0,0,0,.22)"; x.lineWidth = 1; x.beginPath(); for (let t = cx0 + 6; t < cx1 - 2; t += 6) { x.moveTo(t, -hw + 3); x.lineTo(t, hw - 3); } x.stroke(); }
  x.fillStyle = "rgba(255,255,255,.28)"; x.fillRect(cx0 + 2, -hw + 3.4, cx1 - cx0 - 4, 1.4);
  if (ty === 1) { x.fillStyle = "#f4f4f4"; x.fillRect(-hl + 3, -2.4, L - 6, 1.8); x.fillRect(-hl + 3, .6, L - 6, 1.8); }   // coupé : bandes
  x.fillStyle = gl; x.beginPath(); x.moveTo(cx1, -hw + 2.8); x.lineTo(cx1 + L * .11, -hw + 4.6); x.lineTo(cx1 + L * .11, hw - 4.6); x.lineTo(cx1, hw - 2.8); x.closePath(); x.fill();   // pare-brise
  if (ty !== 2) { x.fillStyle = gd; x.fillRect(cx0 - L * .08, -hw + 3.4, L * .08, Wd - 6.8); }
  x.fillStyle = "rgba(15,35,55,.55)"; x.fillRect(cx0 + 1, -hw + 2.2, cx1 - cx0 - 2, 1.3); x.fillRect(cx0 + 1, hw - 3.5, cx1 - cx0 - 2, 1.3);   // vitres latérales
  x.fillStyle = "rgba(0,0,0,.16)"; x.fillRect(cx1 + L * .14, -1.8, hl - cx1 - L * .14 - 4, 3.6);   // nervure de capot
  x.fillStyle = "#2a2a30"; x.fillRect(hl - 1.2, -hw + 4.2, 1.2, Wd - 8.4); x.fillRect(-hl, -hw + 4.2, 1.2, Wd - 8.4);   // pare-chocs
  x.fillStyle = "#fff4a3"; x.fillRect(hl - 2.8, -hw + 1.2, 3, 4); x.fillRect(hl - 2.8, hw - 5.2, 3, 4);                  // phares
  x.fillStyle = "#d1121f"; x.fillRect(-hl, -hw + 1.2, 2.6, 4); x.fillRect(-hl, hw - 5.2, 2.6, 4);                         // feux arrière
  if (dm) {
    drawDents(dm, id, hl, hw, body);
    if ((dm & 3) >= 2) { x.fillStyle = "#2b2b1a"; x.fillRect(hl - 2.8, -hw + 1.2, 3, 4); if ((dm & 3) === 3) x.fillRect(hl - 2.8, hw - 5.2, 3, 4); }
    if (((dm >> 4) & 3) >= 2) { x.fillStyle = "#3a0d0d"; x.fillRect(-hl, hw - 5.2, 2.6, 4); }
    if ((dm & 3) >= 2) { x.strokeStyle = "rgba(255,255,255,.85)"; x.lineWidth = 1; x.beginPath(); x.moveTo(cx1 + 1, -hw + 4); x.lineTo(cx1 + L * .09, -1); x.lineTo(cx1 + 2, hw - 4); x.moveTo(cx1 + L * .09, -1); x.lineTo(cx1 + L * .1, 3); x.stroke(); }   // pare-brise fissuré
  }
  if (cop) {
    const f = Math.floor(now / 150) % 2; x.fillStyle = "#22222a"; x.fillRect(mid - 3, -hw + 2.6, 6, Wd - 5.2);
    x.fillStyle = f ? "rgba(255,40,40,.35)" : "rgba(40,90,255,.35)"; x.beginPath(); x.arc(mid, -hw * .45, 10, 0, 7); x.fill();
    x.fillStyle = f ? "rgba(40,90,255,.35)" : "rgba(255,40,40,.35)"; x.beginPath(); x.arc(mid, hw * .45, 10, 0, 7); x.fill();
    x.fillStyle = f ? "#ff2a2a" : "#2a5bff"; x.fillRect(mid - 2.2, -hw + 3, 4.4, hw - 3); x.fillStyle = f ? "#2a5bff" : "#ff2a2a"; x.fillRect(mid - 2.2, 0, 4.4, hw - 3);
  }
  x.restore();
  if (dmSum(dm) >= 6) for (let k = 0; k < 3; k++) {                                              // moteur fumant
    const u = ((now / 45 + k * 9) % 27); x.fillStyle = `rgba(55,55,55,${(.42 - u / 80).toFixed(2)})`; x.beginPath(); x.arc(px + Math.cos(a) * hl * .75 + (k - 1) * 3, py + Math.sin(a) * hl * .75 - u, 3.5 + k * 1.4 + u / 12, 0, 7); x.fill();
  }
}
function drawDents(dm, id, hl, hw, body) {                                                       // tôle enfoncée, plis, métal à nu, brûlures
  for (let z = 0; z < 4; z++) {
    const n = (dm >> (z * 2)) & 3; if (!n) continue;
    const e = z & 1 ? hw : hl, sp = (z & 1 ? hl * 1.7 : hw * 1.7) * (.5 + n * .16), hh = hs(id | 0, z + 11), dp = 1.4 + n * 1.8, st = 8;
    x.save(); x.rotate(z * Math.PI / 2);
    const pts = []; for (let k = 0; k <= st; k++) pts.push([e - Math.sin(Math.PI * k / st) * dp * (.55 + ((hh >>> k) & 3) * .22), -sp / 2 + sp * k / st]);
    x.fillStyle = "#0c0c10"; x.beginPath(); x.moveTo(e + 1.5, -sp / 2); pts.forEach(p => x.lineTo(p[0], p[1])); x.lineTo(e + 1.5, sp / 2); x.closePath(); x.fill();   // la tôle rentre
    x.fillStyle = shade(body, .55); x.beginPath(); x.moveTo(pts[0][0], pts[0][1]); pts.forEach(p => x.lineTo(p[0], p[1])); for (let k = st; k >= 0; k--) x.lineTo(pts[k][0] - dp * .9 - 1.2 - ((hh >>> (k + 5)) & 3) * .5, pts[k][1]); x.closePath(); x.fill();
    x.lineWidth = 1; for (let k = 0; k < 2 + n; k++) { const t = -sp / 2 + sp * (k + .6) / (2 + n); x.strokeStyle = k & 1 ? "rgba(255,255,255,.45)" : "rgba(0,0,0,.6)"; x.beginPath(); x.moveTo(e - dp * .4, t); x.lineTo(e - dp * 1.9 - 3.5, t + ((hh >>> k) & 1 ? 2 : -2)); x.stroke(); }
    if (n >= 2) { x.fillStyle = "#a3a3ab"; for (let k = 0; k < 3; k++) x.fillRect(e - dp - 2 - k, -sp / 3 + k * sp / 3 - 1, 3, 2); }
    if (n >= 3) { x.fillStyle = "rgba(15,15,15,.55)"; x.fillRect(e - dp - 5, -sp / 4, 5, sp / 2); }
    x.restore();
  }
}
function drawPick(p, now) {                                                                      // arme au sol
  const b = Math.sin(now / 280 + p.id) * 1.5;
  x.fillStyle = "rgba(255,225,90,.22)"; x.beginPath(); x.arc(p.x, p.y, 13 + Math.sin(now / 200 + p.id) * 1.5, 0, 7); x.fill();
  x.fillStyle = "rgba(0,0,0,.4)"; x.fillRect(p.x - 7, p.y + 5, 15, 3);
  x.save(); x.translate(p.x, p.y + b); x.rotate(-.35);
  if (p.t === 1) { x.fillStyle = "#101010"; x.fillRect(-6, -3, 12, 5); x.fillStyle = "#6c6c76"; x.fillRect(-6, -3, 12, 2); x.fillStyle = "#3a2a1a"; x.fillRect(-5, 1, 4, 5); }
  else if (p.t === 2) { x.fillStyle = "#101010"; x.fillRect(-8, -3, 16, 5); x.fillStyle = "#5a5a64"; x.fillRect(-8, -3, 16, 2); x.fillStyle = "#101010"; x.fillRect(-2, 2, 4, 6); x.fillStyle = "#3a2a1a"; x.fillRect(-9, -2, 4, 4); }
  else { x.fillStyle = "#5b3a1e"; x.fillRect(-9, -2, 7, 5); x.fillStyle = "#101010"; x.fillRect(-3, -3, 12, 3); x.fillStyle = "#8b8b95"; x.fillRect(-3, -3, 12, 1.5); }
  x.restore();
}
function drawWreck(w, now) {
  drawCar(w.x, w.y, w.a, "#262626", false, now, w.id, 255);
  if (now - w.t < 9000) for (let k = 0; k < 3; k++) { x.fillStyle = (Math.floor(now / 90 + k) % 2) ? "#ff7a1a" : "#ffd23f"; x.beginPath(); x.arc(w.x + (k - 1) * 7 + Math.sin(now / 70 + k) * 1.5, w.y + Math.cos(now / 80 + k) * 3 - 4, 4 + (k % 2) * 2, 0, 7); x.fill(); }
}
function drawWalker(px, py, a, body, skin, ph, wpn, flash) {
  x.fillStyle = "rgba(0,0,0,.35)"; x.beginPath(); x.arc(px + 2, py + 2, 6, 0, 7); x.fill();
  x.save(); x.translate(px, py); x.rotate(a);
  const sw = ph !== null ? Math.sin(ph) : 0, sk = skin || "#f1c27d";
  if (ph !== null) { x.fillStyle = "#14141a"; x.fillRect(sw * 3.4 - 2, -4, 4.5, 2.8); x.fillRect(-sw * 3.4 - 2, 1.2, 4.5, 2.8); }   // pieds
  x.fillStyle = "#101010"; x.fillRect(-3.6, -6.8, 7.2, 13.6); x.fillStyle = body; x.fillRect(-2.8, -6, 5.6, 12);                   // épaules / haut
  if (wpn) {                                                                                                                        // bras tendus + arme
    x.fillStyle = sk; x.fillRect(1, -3.8, 6, 2.2); x.fillRect(1, 1.6, 6, 2.2);
    if (wpn === 1) { x.fillStyle = "#111"; x.fillRect(6, -1, 6, 2); } else if (wpn === 2) { x.fillStyle = "#111"; x.fillRect(5, -1.3, 10, 2.6); x.fillRect(8, 1.2, 2, 3); } else { x.fillStyle = "#5b3a1e"; x.fillRect(4, -1.3, 4, 2.6); x.fillStyle = "#8b8b95"; x.fillRect(8, -1, 9, 2); }
    if (flash) { const tx = wpn === 1 ? 12 : wpn === 2 ? 15 : 17; x.fillStyle = "#fff2a8"; x.fillRect(tx, -2.5, 4, 5); x.fillStyle = "#ff9d1e"; x.fillRect(tx + 1, -1, 6, 2); }
  } else { x.fillStyle = sk; x.fillRect(sw * 2.4 - 1.5, -7.6, 3.2, 2.4); x.fillRect(-sw * 2.4 - 1.5, 5.2, 3.2, 2.4); }              // bras qui balancent
  x.fillStyle = "#101010"; x.beginPath(); x.arc(0, 0, 3.3, 0, 7); x.fill(); x.fillStyle = sk; x.beginPath(); x.arc(0, 0, 2.6, 0, 7); x.fill();
  x.fillStyle = "#2b1b10"; x.beginPath(); x.arc(-.6, 0, 2.2, 1.57, 4.71); x.fill();                                               // cheveux
  x.restore();
}
function drawSplat(s, al) {                                                                      // sang « GTA 1 » : étoile épineuse rouge
  const h = hs(Math.round(s.x), Math.round(s.y)); x.globalAlpha = al;
  const spike = (r0, r1, n, col, off) => { x.fillStyle = col; x.beginPath(); for (let k = 0; k < n * 2; k++) { const an = k * Math.PI / n + off, rad = k % 2 ? r0 : r1 * (.7 + ((h >>> (k % 24)) & 3) * .15); x.lineTo(s.x + Math.cos(an) * rad, s.y + Math.sin(an) * rad); } x.closePath(); x.fill(); };
  spike(4, 13, 8, "#7d0c12", h % 6); spike(3, 9, 7, "#b3141c", h % 5); spike(2, 4.5, 5, "#d9232b", h % 4);
  x.fillStyle = "#9b1018"; for (let k = 0; k < 6; k++) { const an = ((h >>> k) % 628) / 100, d = 12 + (h >>> (k + 3)) % 7; x.fillRect(s.x + Math.cos(an) * d, s.y + Math.sin(an) * d, 2, 2); }
  x.globalAlpha = 1;
}
function drawWorld(vx0, vy0, vx1, vy1) {
  x.fillStyle = "#1b1b1f"; x.fillRect(vx0, vy0, vx1 - vx0, vy1 - vy0);
  const R2 = ROAD / 2, rx0 = Math.max(vx0, -R2), ry0 = Math.max(vy0, -R2), rx1 = Math.min(vx1, WORLD + R2), ry1 = Math.min(vy1, WORLD + R2);
  if (rx1 <= rx0 || ry1 <= ry0) return;
  x.fillStyle = patRoad; x.fillRect(rx0, ry0, rx1 - rx0, ry1 - ry0);
  const ia = Math.max(0, Math.ceil((vx0 - R2) / CELL)), ib = Math.min(N, Math.floor((vx1 + R2) / CELL)), ja = Math.max(0, Math.ceil((vy0 - R2) / CELL)), jb = Math.min(N, Math.floor((vy1 + R2) / CELL));
  x.lineWidth = 2;
  for (let i = ia; i <= ib; i++) { const cx = i * CELL; x.setLineDash([]); x.strokeStyle = "#d9d9d9"; x.beginPath(); x.moveTo(cx - 44, ry0); x.lineTo(cx - 44, ry1); x.moveTo(cx + 44, ry0); x.lineTo(cx + 44, ry1); x.stroke(); x.strokeStyle = "#e6c83c"; x.setLineDash([16, 16]); x.beginPath(); x.moveTo(cx, ry0); x.lineTo(cx, ry1); x.stroke(); }
  for (let j = ja; j <= jb; j++) { const cy = j * CELL; x.setLineDash([]); x.strokeStyle = "#d9d9d9"; x.beginPath(); x.moveTo(rx0, cy - 44); x.lineTo(rx1, cy - 44); x.moveTo(rx0, cy + 44); x.lineTo(rx1, cy + 44); x.stroke(); x.strokeStyle = "#e6c83c"; x.setLineDash([16, 16]); x.beginPath(); x.moveTo(rx0, cy); x.lineTo(rx1, cy); x.stroke(); }
  x.setLineDash([]);
  for (let i = ia; i <= ib; i++) for (let j = ja; j <= jb; j++) {               // carrefours (on efface les lignes) + passages piétons
    const cx = i * CELL, cy = j * CELL;
    x.fillStyle = patRoad; x.fillRect(cx - R2, cy - R2, ROAD, ROAD); x.fillStyle = "#dcdcdc";
    for (let k = 0; k < 11; k++) { const o = -44 + k * 8; if (i < N) x.fillRect(cx + R2 + 4, cy + o, 12, 4); if (i > 0) x.fillRect(cx - R2 - 16, cy + o, 12, 4); if (j < N) x.fillRect(cx + o, cy + R2 + 4, 4, 12); if (j > 0) x.fillRect(cx + o, cy - R2 - 16, 4, 12); }
  }
  const i0 = clamp(Math.floor((vx0 - R2) / CELL), 0, N - 1), i1 = clamp(Math.floor((vx1 - R2) / CELL), 0, N - 1), j0 = clamp(Math.floor((vy0 - R2) / CELL), 0, N - 1), j1 = clamp(Math.floor((vy1 - R2) / CELL), 0, N - 1);
  const blds = [];
  for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {              // passe 1 : trottoirs larges en dalles, bords arrondis, parcs
    const bx = lo(i), by = lo(j), ox = bx + SW, oy = by + SW, bw = BL - 2 * SW;
    x.fillStyle = "rgba(30,26,58,.42)"; rrect(bx - 6, by - 6, BL + 12, BL + 12, 32); x.fill();         // ombre du bord de trottoir sur la route
    x.fillStyle = patSide; rrect(bx, by, BL, BL, 26); x.fill();
    x.strokeStyle = "#f0ecd0"; x.lineWidth = 3; rrect(bx + 1.5, by + 1.5, BL - 3, BL - 3, 25); x.stroke();   // bordure claire
    x.strokeStyle = "#8a845c"; x.lineWidth = 1.5; rrect(bx - .5, by - .5, BL + 1, BL + 1, 26.5); x.stroke();
    if (!isPark(i, j)) { blds.push([i, j]); continue; }
    x.fillStyle = patGrass; x.fillRect(ox, oy, bw, bw);
    x.fillStyle = "#34702a"; for (let k = 0; k < 8; k++) x.fillRect(ox + hs(i + k, j) % (bw - 30), oy + hs(j + k, i + 9) % (bw - 30), 30, 22);
    x.fillStyle = "#b9a878"; x.fillRect(ox + bw / 2 - 5, oy, 10, bw); x.fillRect(ox, oy + bw / 2 - 5, bw, 10);
    for (let k = 0; k < 6; k++) { const tx = ox + 18 + hs(i * 3 + k, j) % (bw - 36), ty = oy + 18 + hs(j * 5 + k, i + 2) % (bw - 36); x.fillStyle = "rgba(0,0,0,.3)"; x.beginPath(); x.arc(tx + 5, ty + 5, 14, 0, 7); x.fill(); x.fillStyle = "#1f5a1c"; x.beginPath(); x.arc(tx, ty, 14, 0, 7); x.fill(); x.fillStyle = "#2f7a28"; x.beginPath(); x.arc(tx - 1, ty - 1, 9, 0, 7); x.fill(); x.fillStyle = "#43963a"; x.beginPath(); x.arc(tx - 4, ty - 4, 4, 0, 7); x.fill(); }
  }
  // passe 2 : bâtiments en perspective (murs visibles côté caméra, toit décalé), du plus loin au plus proche
  const dist = b => Math.hypot(lo(b[0]) + BL / 2 - cam.x, lo(b[1]) + BL / 2 - cam.y);
  blds.sort((p, q) => dist(q) - dist(p));
  blds.forEach(([i, j]) => {
    const h = hs(i, j), bw = BL - 2 * SW, ox = lo(i) + SW, oy = lo(j) + SW, pol = i === POLICE[0] && j === POLICE[1], hos = i === HOSP[0] && j === HOSP[1];
    const pal = pol ? ["#2f55c4", "#5a7fe0", "#1c3585"] : hos ? ["#e9edf0", "#ffffff", "#aab3ba"] : ROOF[h % ROOF.length];
    const wc = pol ? "#3f66d0" : hos ? "#e3e8ec" : WALL[h % 8], k = .17 * (pol || hos ? 1.1 : .8 + (h % 4) * .13);
    const P = (gx, gy) => [gx + (gx - cam.x) * k, gy + (gy - cam.y) * k];
    const g00 = [ox, oy], g10 = [ox + bw, oy], g11 = [ox + bw, oy + bw], g01 = [ox, oy + bw], r00 = P(ox, oy), r10 = P(ox + bw, oy), r11 = P(ox + bw, oy + bw), r01 = P(ox, oy + bw);
    x.fillStyle = "rgba(0,0,0,.4)"; x.fillRect(ox + 14, oy + 14, bw, bw);                         // ombre portée
    const wall = (g0, g1, r0, r1, sh) => {
      if (Math.hypot(r0[0] - g0[0], r0[1] - g0[1]) < .8) return;
      const Q = (t, u) => { const gx = g0[0] + (g1[0] - g0[0]) * t, gy = g0[1] + (g1[1] - g0[1]) * t, rx = r0[0] + (r1[0] - r0[0]) * t, ry = r0[1] + (r1[1] - r0[1]) * t; return [gx + (rx - gx) * u, gy + (ry - gy) * u]; };
      x.fillStyle = shade(wc, sh); x.beginPath(); x.moveTo(g0[0], g0[1]); x.lineTo(g1[0], g1[1]); x.lineTo(r1[0], r1[1]); x.lineTo(r0[0], r0[1]); x.closePath(); x.fill();
      x.strokeStyle = "rgba(0,0,0,.17)"; x.lineWidth = 1; x.beginPath(); for (let s = 1; s < 14; s++) { const p = Q(s / 14, 0), q = Q(s / 14, 1); x.moveTo(p[0], p[1]); x.lineTo(q[0], q[1]); } x.stroke();   // briques / stries verticales
      if (hos) { x.strokeStyle = "#d62828"; x.lineWidth = 3; const p = Q(0, .5), q = Q(1, .5); x.beginPath(); x.moveTo(p[0], p[1]); x.lineTo(q[0], q[1]); x.stroke(); }
      const nc = 7, nr = 3;
      for (let c = 0; c < nc; c++) for (let r = 0; r < nr; r++) {
        const t0 = (c + .2) / nc, t1 = (c + .8) / nc, u0 = .1 + (r + .15) / nr * .82, u1 = .1 + (r + .75) / nr * .82, hv = (h >>> ((c + r * 3) % 28)) & 3;
        x.fillStyle = pol ? (hv & 1 ? "#e8f0ff" : "#aac0ff") : hos ? (hv & 1 ? "#8fc7ea" : "#cfe9f7") : ["#3b84b3", "#2f6f9c", "#b84455", "#58a0c4"][hv];
        const a1 = Q(t0, u0), a2 = Q(t1, u0), a3 = Q(t1, u1), a4 = Q(t0, u1);
        x.beginPath(); x.moveTo(a1[0], a1[1]); x.lineTo(a2[0], a2[1]); x.lineTo(a3[0], a3[1]); x.lineTo(a4[0], a4[1]); x.closePath(); x.fill();
        x.strokeStyle = "rgba(0,0,0,.45)"; x.lineWidth = 1; x.stroke();
      }
      x.strokeStyle = shade(wc, 1.3); x.lineWidth = 2; x.beginPath(); x.moveTo(r0[0], r0[1]); x.lineTo(r1[0], r1[1]); x.stroke();            // corniche
      x.strokeStyle = "rgba(0,0,0,.5)"; x.beginPath(); x.moveTo(g0[0], g0[1]); x.lineTo(g1[0], g1[1]); x.stroke();                            // pied du mur
    };
    if (cam.x < ox) wall(g00, g01, r00, r01, .82);
    if (cam.x > ox + bw) wall(g10, g11, r10, r11, .6);
    if (cam.y < oy) wall(g00, g10, r00, r10, 1);
    if (cam.y > oy + bw) wall(g01, g11, r01, r11, .7);
    const rx = r00[0], ry = r00[1], rw = r10[0] - r00[0], sc = rw / bw;                              // toit
    x.fillStyle = pal[0]; x.fillRect(rx, ry, rw, rw);
    for (let n = 0; n < 24; n++) { x.fillStyle = n & 1 ? pal[1] : pal[2]; x.globalAlpha = .45; x.fillRect(rx + hs(h, n) % Math.floor(rw), ry + hs(n, h) % Math.floor(rw), 2, 2); } x.globalAlpha = 1;
    x.fillStyle = pal[1]; x.fillRect(rx, ry, rw, 3); x.fillRect(rx, ry, 3, rw);
    x.fillStyle = pal[2]; x.fillRect(rx, ry + rw - 5, rw, 5); x.fillRect(rx + rw - 5, ry, 5, rw);
    x.strokeStyle = pal[2]; x.lineWidth = 2; x.strokeRect(rx + 14 * sc, ry + 14 * sc, rw - 28 * sc, rw - 28 * sc);
    if (pol) { x.fillStyle = "#fff"; x.fillRect(rx + 14 * sc, ry + rw / 2 - 26 * sc, rw - 28 * sc, 3); x.fillRect(rx + 14 * sc, ry + rw / 2 + 24 * sc, rw - 28 * sc, 3); x.font = `bold ${Math.round(28 * sc)}px "Courier New",monospace`; x.textAlign = "center"; x.fillText("POLICE", rx + rw / 2, ry + rw / 2 + 9 * sc); }
    else if (hos) { x.strokeStyle = "#d62828"; x.lineWidth = 4; x.beginPath(); x.arc(rx + rw / 2, ry + rw / 2, 46 * sc, 0, 7); x.stroke(); x.fillStyle = "#d62828"; x.fillRect(rx + rw / 2 - 8 * sc, ry + rw / 2 - 26 * sc, 16 * sc, 52 * sc); x.fillRect(rx + rw / 2 - 26 * sc, ry + rw / 2 - 8 * sc, 52 * sc, 16 * sc); }
    else for (let n = 0; n < 3; n++) { const w = 18 + (h >>> (n * 5)) % 18, hh = 14 + (h >>> (n * 4 + 2)) % 16, px = rx + (22 + (h >>> (n * 6)) % (bw - 70)) * sc, py = ry + (22 + (h >>> (n * 7 + 1)) % (bw - 60)) * sc; x.fillStyle = pal[1]; x.fillRect(px, py, w * sc, hh * sc); x.fillStyle = pal[2]; x.fillRect(px, py + (hh - 3) * sc, w * sc, 3); x.fillRect(px + (w - 3) * sc, py, 3, hh * sc); }
  });
}
function frame(now) {
  if (!active) { raf = 0; return; }
  raf = requestAnimationFrame(frame);
  const dt = Math.min(.05, (now - (tPrev || now)) / 1000); tPrev = now; tNow = now;
  const k = 1 - Math.exp(-13 * dt);
  for (const d of dPeds.values()) { d.x += (d.tx - d.x) * k; d.y += (d.ty - d.y) * k; d.a = angLerp(d.a, d.ta, k); }
  for (const d of dCars.values()) { if (Math.abs(d.tx - d.x) + Math.abs(d.ty - d.y) > 250) { d.x = d.tx; d.y = d.ty; } else { d.x += (d.tx - d.x) * k; d.y += (d.ty - d.y) * k; } d.a = angLerp(d.a, d.ta, k); }
  const lp = lobbyP();
  for (const [u, p] of activeP()) { if (u === myUid) continue; let d = dP.get(u); if (!d) dP.set(u, d = { x: p.x, y: p.y, a: p.a }); if (Math.abs(p.x - d.x) + Math.abs(p.y - d.y) > 300) { d.x = p.x; d.y = p.y; } else { d.x += (p.x - d.x) * k; d.y += (p.y - d.y) * k; } d.a = angLerp(d.a, p.a, k); d.vid = p.vid; d.cash = p.cash; d.wl = p.wl; d.v = p.v; d.dm = p.dm; d.wpn = p.wpn; }
  for (const u of dP.keys()) if (!lp[u]) dP.delete(u);
  if (me.dead > 0) { me.dead -= dt; if (me.dead <= 0) spawnAt(SPAWN[me.where || "hosp"]); }
  else { if (useReq) { useReq = 0; useKey(); } control(dt); interact(dt); weapons(dt, now); }
  useReq = 0; if (me.vid) me.carT += dt;
  sendP(now);
  // caméra (zoom fixe par paliers : l'image pixelisée reste nette)
  const spd = me.vid ? Math.abs(me.v) : 0, tz = me.vid ? 1.1 - Math.min(.2, spd / 230 * .2) : 1.45;
  cam.z += (tz - cam.z) * Math.min(1, 3 * dt);
  cam.x += (me.x + (me.vid ? Math.cos(me.a) * me.v * .12 : 0) - cam.x) * Math.min(1, 9 * dt); cam.y += (me.y + (me.vid ? Math.sin(me.a) * me.v * .12 : 0) - cam.y) * Math.min(1, 9 * dt);
  const S = cv.width / W, z = cam.z, vw = W / z, vh = H / z, vx0 = cam.x - vw / 2, vy0 = cam.y - vh / 2, vx1 = vx0 + vw, vy1 = vy0 + vh;
  const tx = Math.round((W / 2 - cam.x * z) / LR), ty = Math.round((H / 2 - cam.y * z) / LR), sxy = (wx, wy) => [wx * z + tx * LR, wy * z + ty * LR];
  const labels = [];
  x = lx; x.setTransform(z / LR, 0, 0, z / LR, tx, ty);                              // le monde est dessiné en basse résolution…
  drawWorld(vx0, vy0, vx1, vy1);
  const inV = (px, py) => px > vx0 - 60 && px < vx1 + 60 && py > vy0 - 60 && py < vy1 + 60;
  splats.forEach(s => { const a = 1 - (now - s.t) / 30000; if (a > 0 && inV(s.x, s.y)) drawSplat(s, a); });
  splats = splats.filter(s => now - s.t < 30000);
  for (const p of PICKS) if (inV(p.x, p.y) && !(pickT.has(p.id) && now - pickT.get(p.id) < 45000)) drawPick(p, now);
  wrecks = wrecks.filter(w => now - w.t < 25000); wrecks.forEach(w => { if (inV(w.x, w.y)) drawWreck(w, now); });
  for (const [pid, d] of dPeds) if (!hitDone.has(pid) && inV(d.x, d.y)) drawWalker(d.x, d.y, d.a, SHIRT[d.sk % 6], SKIN[d.sk % 6], now / 85 + d.tx);
  for (const [id, d] of dCars) if (d.m !== "t" && id !== me.vid && inV(d.x, d.y)) drawCar(d.x, d.y, d.a, col(d.c), d.m === "c", now, id, dmx(d.dm | 0, wear(id)));
  for (const [u, d] of dP) if (inV(d.x, d.y)) { const pl = lp[u] || {}; if (d.vid) { const cc = dCars.get(d.vid); drawCar(d.x, d.y, d.a, col(cc ? cc.c : 0), false, now, d.vid, d.dm); } else drawWalker(d.x, d.y, d.a, pl.color || "#fff", "#f1c27d", d.v > 0 ? now / 85 : null, d.wpn, now - (d.flash || -1e9) < 70); labels.push([pl.name || "?", d.x, d.y - (d.vid ? 20 : 12), "#fff"]); }
  if (me.dead <= 0) { if (me.vid) drawCar(me.x, me.y, me.a, col(myCol), false, now, me.vid, me.dm); else drawWalker(me.x, me.y, me.a, (lp[myUid] || {}).color || "#fff", "#f1c27d", me.v > 0 ? now / 85 : null, me.wpn, me.flash > 0); x.fillStyle = "#ffe14d"; const ay = me.y - (me.vid ? 24 : 15) + Math.sin(now / 160) * 2; x.beginPath(); x.moveTo(me.x, ay + 6); x.lineTo(me.x - 5, ay - 2); x.lineTo(me.x + 5, ay - 2); x.fill(); }
  tracers = tracers.filter(t => now - t.t < 90);
  tracers.forEach(t => { const age = now - t.t; x.globalAlpha = 1 - age / 90; x.strokeStyle = "#fff2a8"; x.lineWidth = 1.6; x.beginPath(); x.moveTo(t.x0, t.y0); x.lineTo(t.x1, t.y1); x.stroke(); if (age < 45) { x.fillStyle = "#ffd23f"; x.beginPath(); x.arc(t.x0, t.y0, 4.5, 0, 7); x.fill(); } });
  x.globalAlpha = 1;
  sparks = sparks.filter(q => now - q.t < 160); sparks.forEach(q => { const age = (now - q.t) / 160; x.fillStyle = age < .5 ? "#fff6c2" : "#ff9d1e"; for (let k = 0; k < 4; k++) x.fillRect(q.x + Math.cos(k * 1.7 + q.x) * age * 7 - 1, q.y + Math.sin(k * 1.7 + q.x) * age * 7 - 1, 2, 2); });
  booms = booms.filter(q => now - q.t < 650); booms.forEach(q => { const a2 = (now - q.t) / 650, r = 8 + a2 * 60; x.globalAlpha = 1 - a2; x.fillStyle = "#ff9d1e"; x.beginPath(); x.arc(q.x, q.y, r, 0, 7); x.fill(); x.fillStyle = "#ffe066"; x.beginPath(); x.arc(q.x, q.y, r * .65, 0, 7); x.fill(); x.fillStyle = "#fff"; x.beginPath(); x.arc(q.x, q.y, r * .3, 0, 7); x.fill(); }); x.globalAlpha = 1;
  if (job) { const f = (Math.sin(now / 250) + 1) / 2; x.strokeStyle = "#ffd23f"; x.lineWidth = 4; x.beginPath(); x.arc(job.x, job.y, 50 + f * 8, 0, 7); x.stroke(); x.fillStyle = "rgba(255,210,63,.25)"; x.fill(); labels.push(["📦", job.x, job.y + 8, "#fff", 26]); }
  x = mx2; x.setTransform(1, 0, 0, 1, 0, 0); x.imageSmoothingEnabled = false; x.drawImage(lc, 0, 0, cv.width, cv.height);   // …puis agrandie sans lissage = look GTA 1
  x.setTransform(S, 0, 0, S, 0, 0);
  labels.forEach(([s, wx, wy, c2, sz]) => { const [px, py] = sxy(wx, wy); if (px > -50 && px < W + 50 && py > -30 && py < H + 30) txt(s, px, py, sz || 12, c2); });
  floats = floats.filter(f => now - f.t < 1400); floats.forEach(f => { const [px, py] = sxy(f.x, f.y); x.globalAlpha = 1 - (now - f.t) / 1400; txt(f.s, px, py - (now - f.t) / 25, 15, f.c); }); x.globalAlpha = 1;
  // ----- HUD -----
  txt(`$${Math.round(me.cash)}`, 14, 32, 28, "#ffe14d", "left");
  for (let i = 0; i < 5; i++) { const hx = 22 + i * 22, on = i < me.wl, fl = on && Math.floor(now / 250) % 2; x.fillStyle = "#000"; x.beginPath(); x.arc(hx, 46, 9, 0, 7); x.fill(); x.fillStyle = on ? "#f1c27d" : "#3a3a40"; x.beginPath(); x.arc(hx, 47, 7, 0, 7); x.fill(); x.fillStyle = on ? (fl ? "#ff3b3b" : "#2a5bff") : "#2a2a30"; x.fillRect(hx - 8, 38, 16, 6); x.fillRect(hx - 5, 34, 10, 5); x.fillStyle = on ? "#ffe14d" : "#3a3a40"; x.fillRect(hx - 2, 35, 4, 3); }
  x.fillStyle = "#000"; x.fillRect(13, 62, 112, 11); x.fillStyle = me.hp > 40 ? "#3ee62f" : "#ff3b30"; x.fillRect(15, 64, 108 * clamp(me.hp, 0, 100) / 100, 7);
  if (me.wpn) { const W = WPN[me.wpn]; txt(`${W.n} ×${me.ammo[me.wpn]}`, 14, 94, 14, "#fff", "left"); txt(me.ammo.slice(1).map((v, i) => v ? `${i + 1}:${v}` : "").filter(Boolean).join("  "), 14, 110, 11, "#ffe14d", "left"); }
  if (!TOUCH && hasGun() && now - me.gunT < 9000) txt("F : TIRER · X ou 1-2-3 : CHANGER D'ARME", W / 2, H - 40, 13, "#ffe14d");
  if (TOUCH && hasGun()) { const fb = fireId !== null; x.fillStyle = fb ? "#ff5a4d" : "#b3261e"; x.beginPath(); x.arc(W - 56, H - 142, 34, 0, 7); x.fill(); x.strokeStyle = "#000"; x.lineWidth = 3; x.stroke(); txt("FEU", W - 56, H - 138, 14); x.fillStyle = "#555a66"; x.beginPath(); x.arc(W - 136, H - 136, 26, 0, 7); x.fill(); x.stroke(); txt("ARME", W - 136, H - 132, 11); }
  const rank = [[myUid, me.cash]].concat(activeP().filter(([u]) => u !== myUid).map(([u, p]) => [u, p.cash])).sort((a, b) => b[1] - a[1]);
  txt(`SERVEUR ${c} · ${rank.length} JOUEUR${rank.length > 1 ? "S" : ""}${hostOn ? " · HÔTE" : ""}`, W - 12, 18, 12, "#fffa", "right");
  rank.slice(0, 6).forEach(([u, cs], i) => { const pl = lp[u] || {}; x.fillStyle = pl.color || "#fff"; x.fillRect(W - 170, 28 + i * 18, 9, 9); txt(`${(pl.name || "?").slice(0, 10)}${u === myUid ? "*" : ""}`, W - 156, 37 + i * 18, 12, "#fff", "left"); txt(`$${Math.round(cs)}`, W - 12, 37 + i * 18, 12, "#ffe14d", "right"); });
  const mm = 130, mx = 10, my = H - mm - 10, mk = mm / WORLD;
  x.fillStyle = "#000"; x.fillRect(mx - 3, my - 3, mm + 6, mm + 6); x.fillStyle = "#3a3c42"; x.fillRect(mx, my, mm, mm); x.strokeStyle = "#6d7079"; x.lineWidth = 1; x.beginPath();
  for (let i = 0; i <= N; i++) { x.moveTo(mx + i * CELL * mk, my); x.lineTo(mx + i * CELL * mk, my + mm); x.moveTo(mx, my + i * CELL * mk); x.lineTo(mx + mm, my + i * CELL * mk); } x.stroke();
  const dot = (px, py, cl, r) => { x.fillStyle = cl; x.fillRect(mx + clamp(px, 0, WORLD) * mk - r, my + clamp(py, 0, WORLD) * mk - r, r * 2, r * 2); };
  dot(SPAWN.police[0], SPAWN.police[1], "#2f55c4", 4); dot(SPAWN.hosp[0], SPAWN.hosp[1], "#e63946", 4);
  for (const d of dCars.values()) if (d.m === "c") dot(d.x, d.y, Math.floor(now / 200) % 2 ? "#ff2a2a" : "#2a5bff", 2.5);
  for (const [u, d] of dP) dot(d.x, d.y, (lp[u] || {}).color || "#fff", 2.5);
  if (job) dot(job.x, job.y, "#ffd23f", 4);
  dot(me.x, me.y, "#fff", 3);
  const bx = W - 56, by = H - 62; x.fillStyle = "#1f4fbf"; x.beginPath(); x.arc(bx, by, 38, 0, 7); x.fill(); x.strokeStyle = "#000"; x.lineWidth = 3; x.stroke(); txt(me.vid ? "SORTIR" : "ENTRER", bx, by + 4, 12);
  if (me.vid && TOUCH) { const bb = brakeId !== null; x.fillStyle = bb ? "#ff5a4d" : "#b3261e"; x.beginPath(); x.arc(W - 140, H - 48, 34, 0, 7); x.fill(); x.stroke(); txt("FREIN", W - 140, H - 44, 13); }
  if (!me.vid && me.dead <= 0) { let near = false; for (const d of dCars.values()) if ((d.m === "d" || d.m === "p") && Math.hypot(d.x - me.x, d.y - me.y) < 48) near = true; if (near) txt("E : MONTER DANS LA VOITURE", W / 2, H - 24, 14, "#ffe14d"); }
  if (me.vid && me.dead <= 0) {
    const kmh = Math.round(Math.abs(me.v) * .5);
    txt(`${kmh} km/h · ÉTAT ${Math.round(100 - dmSum(me.dm) / 12 * 100)}%${me.v < -3 ? "  ◄ MARCHE ARRIÈRE" : ""}`, W / 2, H - 14, 16, me.v < -3 ? "#ff9f43" : "#fff");
    if (me.carT < 9) { x.fillStyle = "rgba(0,0,0,.65)"; x.fillRect(W / 2 - 230, H - 96, 460, 54); txt(TOUCH ? "POUSSE LE JOYSTICK VERS OÙ TU VEUX ALLER" : "↑ ACCÉLÉRER · ↓ FREINER / RECULER", W / 2, H - 74, 13, "#fff"); txt(TOUCH ? "LÂCHE = ROULE LIBRE · FREIN = FREINER / RECULER" : "← → TOURNER (SEULEMENT QUAND LA VOITURE ROULE) · E = SORTIR", W / 2, H - 54, 12, "#ffe14d"); }
    if (job) { const a = Math.atan2(job.y - me.y, job.x - me.x); txt(`📦 ${Math.round(Math.hypot(job.x - me.x, job.y - me.y) / 10)} m`, W / 2, 26, 15, "#ffd23f"); x.save(); x.translate(W / 2, 52); x.rotate(a); x.fillStyle = "#ffd23f"; x.strokeStyle = "#000"; x.lineWidth = 2; x.beginPath(); x.moveTo(15, 0); x.lineTo(-9, -10); x.lineTo(-9, 10); x.closePath(); x.fill(); x.stroke(); x.restore(); }
  }
  if (me.bust > .1) { x.fillStyle = "#2a5bff"; x.fillRect(W / 2 - 60, H / 2 + 40, 120 * clamp(me.bust / .9, 0, 1), 8); txt("ARRESTATION…", W / 2, H / 2 + 34, 13, "#8fb0ff"); }
  if (me.dead > 0) { x.fillStyle = "rgba(0,0,0,.65)"; x.fillRect(0, 0, W, H); txt(me.msg, W / 2, H / 2, 30, "#fff"); }
  if (stick) { x.fillStyle = "rgba(255,255,255,.08)"; x.strokeStyle = "rgba(255,255,255,.28)"; x.lineWidth = 2; x.beginPath(); x.arc(stick.ox, stick.oy, 55, 0, 7); x.fill(); x.stroke(); x.fillStyle = "rgba(255,255,255,.65)"; x.beginPath(); x.arc(stick.ox + stick.dx * 55, stick.oy + stick.dy * 55, 22, 0, 7); x.fill(); }
}

// ================= ENTRÉES =================
  addEventListener("keydown", e => {
    if (!active || /^(INPUT|TEXTAREA)$/.test(e.target.tagName)) return;
    if (e.key === "f" || e.key === "F") { fireKey = true; e.preventDefault(); return; }
    if (e.key === "x" || e.key === "X") { if (!e.repeat) cycleWpn(); e.preventDefault(); return; }
    const dg = /^(Digit|Numpad)([1-3])$/.exec(e.code || ""); if (dg) { selWpn(+dg[2]); return; }
    if (e.key === " " || e.key === "e" || e.key === "E") { e.preventDefault(); if (!e.repeat) useReq = 1; return; }
    const k = KEYS[e.key.length > 1 ? e.key : e.key.toLowerCase()]; if (k) { e.preventDefault(); keys.add(k); }
  });
  addEventListener("keyup", e => { if (e.key === "f" || e.key === "F") fireKey = false; const k = KEYS[e.key.length > 1 ? e.key : e.key.toLowerCase()]; if (k) keys.delete(k); });
  addEventListener("blur", () => { keys.clear(); stick = null; brakeId = null; fireKey = false; fireId = null; });
  document.addEventListener("visibilitychange", () => { if (document.hidden) { keys.clear(); stick = null; brakeId = null; fireKey = false; fireId = null; } });
  const rel = e => { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) * W / r.width, y: (e.clientY - r.top) * H / r.height }; };
  cv.addEventListener("pointerdown", e => {
    if (!active) return; e.preventDefault(); const p = rel(e);
    if (hasGun() && Math.hypot(p.x - (W - 56), p.y - (H - 142)) < 38) { fireId = e.pointerId; try { cv.setPointerCapture(e.pointerId); } catch { } return; }
    if (hasGun() && Math.hypot(p.x - (W - 136), p.y - (H - 136)) < 30) { cycleWpn(); return; }
    if (e.button === 2 || Math.hypot(p.x - (W - 56), p.y - (H - 62)) < 40) { useReq = 1; return; }
    if (me.vid && Math.hypot(p.x - (W - 140), p.y - (H - 48)) < 38) { brakeId = e.pointerId; try { cv.setPointerCapture(e.pointerId); } catch { } return; }
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
  const end = e => { if (fireId === e.pointerId) fireId = null; if (brakeId === e.pointerId) brakeId = null; if (stick && e.pointerId === stick.id) stick = null; };
  cv.addEventListener("pointerup", end); cv.addEventListener("pointercancel", end);
  cv.addEventListener("contextmenu", e => { if (active) e.preventDefault(); });

  return {
    enter(code) {
      active = true; c = code; myUid = getMe().uid; ls = null; lastT = 0; lastH = ""; lastEv = 0; pd = {}; hostOn = false; keys = new Set(); stick = null; brakeId = null; useReq = 0;
      dPeds.clear(); dCars.clear(); dP.clear(); splats = []; floats = []; hitDone = new Set(); lastHs = {}; sentStr = ""; sentAt = 0; savedCash = -1; saveAt = performance.now();
      Object.assign(me, { vid: 0, hp: 100, heat: 0, wl: 0, hs: 0, hid: 0, dead: 0, bust: 0, hurt: 0, v: 0, a: 0, cash: 0, wpn: 0, ammo: [0, 0, 0, 0], dm: 0, fc: 0, fw: 0, cs: 0, cid: 0, ca: 0, cd: 0, flash: 0, dmCd: 0, scr: 0, lastCar: 0, lastCarT: 0, gunT: -1e9 });
      killQ = []; carQ = []; tracers = []; sparks = []; booms = []; wrecks = []; pickT = new Map(); lastFc = {}; lastCs = {}; fireKey = false; fireId = null;
      const ix = 2 + Math.floor(Math.random() * 5), iy = 2 + Math.floor(Math.random() * 5); spawnAt([ix * CELL, iy * CELL]);
      $("ghelp").textContent = "ZQSD / flèches : bouger · E ou Espace : monter / descendre d'une voiture · en voiture ↑ accélère, ↓ freine, ←→ tourne · livre les colis 📦, écrase des piétons, évite la police ! · Ramasse les armes au sol : F tirer, X changer d'arme (1-2-3) · les voitures se cabossent !";
      get(RF(`users/${myUid}/sta`)).then(s => { const v = +s.val(); if (v > 0 && me.cash === 0) { me.cash = v; savedCash = v; } }).catch(() => { });
      unS = onValue(RF(`games/${c}/state`), onState); unP = onValue(RF(`games/${c}/p`), onP);
      timer = setInterval(simLoop, 50); raf = requestAnimationFrame(frame);
      env.played && env.played("sta", true);
      return () => {
        active = false; clearInterval(timer); unS && unS(); unP && unP(); if (raf) cancelAnimationFrame(raf); raf = 0; keys.clear(); stick = null; hostOn = false; fireKey = false; fireId = null;
        set(RF(`users/${myUid}/sta`), Math.round(me.cash)).catch(() => { }); remove(RF(`games/${c}/p/${myUid}`)).catch(() => { });
        x.setTransform(1, 0, 0, 1, 0, 0); x.globalAlpha = 1; x.setLineDash([]); x.textAlign = "start";
      };
    }
  };
}
