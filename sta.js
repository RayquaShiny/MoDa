/* MoDa : « Sta I » 🚗 : un petit GTA 1 en ligne, vu de dessus.
   - Un serveur persistant : on clique sur la tuile et on arrive directement dedans (pas de lobby, pas de « lancer »).
     Serveurs STA1, STA2… (24 joueurs max chacun) : si le premier est plein, le suivant s'ouvre automatiquement.
   - L'HÔTE du serveur = le joueur arrivé en premier. S'il part, le suivant (par ordre d'arrivée) reprend la simulation
     là où elle en était : tout le monde calcule le même hôte à partir de lobbies/<code>/players/<uid>/j.
   - Chaque joueur écrit sa position dans games/<code>/p/<uid> (« x,y,angle,véhicule,étoiles,argent,pv,vitesse,coup,cible »).
     L'hôte simule PNJ (piétons, voitures, police) et publie games/<code>/state (JSON). Aucun nouveau chemin Firebase
     hormis users/<uid>/sta (ton argent) et users/<uid>/sta2 (garage, voiture rangée, armes et munitions : sauvegardés).
   - But : gagner de l'argent (courses en voiture, piétons écrasés), éviter la police (étoiles ★), finir premier du classement. */

const W = 800, H = 560, CELL = 360, ROAD = 100, N = 12, WORLD = N * CELL, BL = CELL - ROAD, SW = 18;
const POLICE = [6, 2], HOSP = [2, 6], GARAGE = [2, 2], GPRICE = 3500, ARMS = [6, 6], JAIL = [10, 8];   // JAIL : la PRISON, un vrai bâtiment (sud-est de la carte agrandie)
const HELI = 4000002, HELI_V = 300, HEL_HP = 200;   // hélicoptère du joueur (id spécial) · vitesse max · PV des hélicos de police
const GHOST = 4000001, GHOST_V = 560;   // voiture fantôme (owners ayant le garage) : id spécial, vitesse max (la normale est de 230)
const SPAWN = { police: [6 * CELL + 180, 3 * CELL], hosp: [2 * CELL + 180, 7 * CELL], jail: [JAIL[0] * CELL + 180, (JAIL[1] + 1) * CELL] };   // jail : devant la porte de la prison
const CCOL = ["#e63946", "#f4a261", "#2a9d8f", "#457b9d", "#e9c46a", "#9b5de5", "#8d99ae", "#f1f1f1"];
const SKIN = ["#f1c27d", "#e0ac69", "#c68642", "#8d5524", "#ffdbac", "#d9a066"], SHIRT = ["#e63946", "#3a86ff", "#06d6a0", "#ffbe0b", "#8338ec", "#fb5607"];
const KEYS = { ArrowUp: "U", ArrowDown: "D", ArrowLeft: "L", ArrowRight: "R", z: "U", s: "D", q: "L", d: "R", w: "U", a: "L" };
const rnd = a => a[Math.floor(Math.random() * a.length)], rr = (a, b) => a + Math.random() * (b - a), clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const hs = (a, b) => { let h = (a * 374761393 + b * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return (h ^ (h >>> 16)) >>> 0; };
// ===== PRISON & MAISONS : tous les réglages sont ici =====
const JAIL_BASE = 25, JAIL_STAR = 8, JAIL_LOSS = 0;      // prison : secondes de base + secondes par étoile (1★ = 33 s, 5★ = 65 s) · part de l'argent perdue à l'arrestation (0 = rien ; l'ancienne règle : .2)
const BRIBE_BASE = 50, BRIBE_SEC = 6;                     // corrompre le gardien : $ de base + $ par seconde de peine restante
const DIG_NEED = 10, DIG_RISK = .08, DIG_PENALTY = 10;    // évasion : appuis sur E au coin du mur · risque d'être entendu à chaque appui · secondes ajoutées si entendu
const FREE_HEAT = 1.6, ESC_HEAT = 1.6;                    // chaleur gagnée en faisant évader un ami / en s'évadant (1.6 = 2 étoiles)
const HOUSES = [                                          // quartier résidentiel de la zone agrandie (colonnes 9-11, lignes 3-4) · UNE SEULE maison par joueur : prix, nom, toit [base, clair, sombre], mur
  { i: 9, j: 3, p: 3000, n: "MAISON 1", r: ["#b5483a", "#d36a58", "#7e2f25"], w: "#ecdcc0" },
  { i: 10, j: 3, p: 3000, n: "MAISON 2", r: ["#3f6fb5", "#5e8fd6", "#2a4b80"], w: "#e4e0d2" },
  { i: 11, j: 3, p: 4500, n: "MAISON 3", r: ["#4f8a52", "#6fae72", "#35603a"], w: "#f0e6cf" },
  { i: 9, j: 4, p: 4500, n: "MAISON 4", r: ["#8a5aa8", "#a97ac8", "#5f3a78"], w: "#e9dcc8" },
  { i: 10, j: 4, p: 7000, n: "MAISON 5", r: ["#c8903a", "#e6b25c", "#8c6120"], w: "#f2ead8" },
  { i: 11, j: 4, p: 7000, n: "MAISON 6", r: ["#444b58", "#646d7e", "#2a2f39"], w: "#dcd8cc" }
];
const hIdx = (i, j) => HOUSES.findIndex(h => h.i === i && h.j === j);
const newBox = () => ({ c: 0, a: [0, 0, 0, 0], v: 0 });  // coffre d'une maison : argent, munitions des 4 armes (= les armes), gilet
const isSpecial = (i, j) => hIdx(i, j) >= 0 || (i === POLICE[0] && j === POLICE[1]) || (i === HOSP[0] && j === HOSP[1]) || (i === GARAGE[0] && j === GARAGE[1]) || (i === ARMS[0] && j === ARMS[1]) || (i === JAIL[0] && j === JAIL[1]);
const isPark = (i, j) => !isSpecial(i, j) && hs(i, j) % 6 === 0;
const lo = i => i * CELL + ROAD / 2, rc = v => Math.round(v / CELL) * CELL;
const HS = 140;   // côté de la maison elle-même (la parcelle fait 224 : pelouse tout autour, la maison est plus petite)
const hbox = (i, j) => { const sd = BL - 2 * SW; return hIdx(i, j) >= 0 ? [lo(i) + SW + (sd - HS) / 2, lo(j) + SW + 22, HS] : [lo(i) + SW, lo(j) + SW, sd]; };   // [x, y, côté] de la partie solide d'un bloc
const GZ = { x: lo(GARAGE[0]) + BL / 2, y: lo(GARAGE[1]) + BL - SW / 2 };   // zone du garage : sur le trottoir sud du bâtiment
// zones des magasins (pastilles au sol, sur le trottoir sud du bâtiment) : armurerie, distributeur de soins (hôpital)
const ZONES = {
  arms: { x: lo(ARMS[0]) + BL / 2, y: lo(ARMS[1]) + BL - SW / 2, c: "#ff5a4d", l: "ARMES" },
  heal: { x: lo(HOSP[0]) + 52, y: lo(HOSP[1]) + BL - SW / 2, c: "#7ae582", l: "SOINS" },
  jail: { x: lo(JAIL[0]) + BL / 2, y: lo(JAIL[1]) + BL - SW / 2, c: "#ff6b6b", l: "PRISON" }   // devant la porte de la prison : les amis libres peuvent y faire évader un détenu
};
const HZ = HOUSES.map(h => ({ x: lo(h.i) + BL / 2, y: lo(h.j) + BL - SW / 2 }));   // porte de chaque maison (trottoir sud)
// donneurs de missions : fixes, les mêmes pour tout le monde (trottoir ouest d'un bâtiment ordinaire)
const gcell = (i, j) => { while (isPark(i, j) || isSpecial(i, j)) i = (i + 1) % N; return [i, j]; };
const GIVERS = [["any", "LE BOSS", "MISSIONS", [0, 4], "#2b2b3a", 3]]   // un seul donneur, au bord ouest de la carte : il distribue TOUTES les missions, au hasard
  .map(([k, n, l, c, sh, sk]) => { const [i, j] = gcell(c[0], c[1]); return { k, n, l, x: lo(i) + SW / 2, y: lo(j) + BL / 2, a: Math.PI, sh, sk }; });
// le PILOTE : donneur de la quête de l'hélico. Caché : jamais sur la minicarte, étiquette visible seulement de près
const PILOT = (() => { const [i, j] = gcell(8, 7); return { n: "LE PILOTE", x: lo(i) + SW / 2, y: lo(j) + BL / 2, a: Math.PI }; })();
const RPG_CONTACT = (() => { const [i,j] = gcell(6,8); return { n:"MÉCANO", x:lo(i)+SW/2, y:lo(j)+BL/2, a:Math.PI, sh:"#d18a35", sk:5 }; })();
const RP = { x: lo(GARAGE[0]) + BL / 2, y: lo(GARAGE[1]) + BL / 2 + 10 };   // héliport sur le toit du garage
const CNAME = ["rouge", "orange", "turquoise", "bleue", "jaune", "violette", "grise", "blanche"];   // même ordre que CCOL
const SHOP_ARMS = [{ n: 1, p: 120 }, { n: 2, p: 400 }, { n: 3, p: 360 }], SHOP_BM = [{ n: 4, p: 900 }];
const angLerp = (a, b, k) => { let d = (b - a) % 6.283185; if (d > 3.141593) d -= 6.283185; if (d < -3.141593) d += 6.283185; return a + d * k; };
const WPN = [null,
  { n: "PISTOLET", rate: .34, rng: 340, pel: 1, spr: .02, car: 12, pvp: 14, heat: .05, max: 99, ammo: 30, snd: [330, .07, "square", .05, 140] },
  { n: "MITRAILLETTE", rate: .09, rng: 300, pel: 1, spr: .07, car: 6, pvp: 6, heat: .03, max: 300, ammo: 100, snd: [240, .05, "square", .04, 100] },
  { n: "FUSIL À POMPE", rate: .85, rng: 210, pel: 5, spr: .22, car: 9, pvp: 11, heat: .15, max: 50, ammo: 16, snd: [110, .16, "sawtooth", .08, 40] },
   { n: "RPG", rate: 1.1, rng: 430, pel: 1, spr: .01, car: 45, pvp: 28, heat: .2, max: 12, ammo: 3, snd: [75, .22, "sawtooth", .1, 35] }];
// dégâts de carrosserie : 2 bits par zone (0 = avant, 1 = droite, 2 = arrière, 3 = gauche), niveau 0 à 3
const carTy = id => { const k = (id | 0) % 12; return k < 10 ? k % 3 : k - 7; };   // modèle d'une voiture d'après son id : 0 berline · 1 coupé · 2 fourgon · 3 SUPERCAR 🏎️ · 4 ROADSTER 🏎️ (les voitures de sport : 1 id sur 6)
const SPORTV = [1, 1, 1, 1.3, 1.2];                                                     // bonus de vitesse max des modèles
const G2PRICE = 2500;                                                                    // 2e emplacement du garage (hors voiture fantôme)
const wear = id => hs(id | 0, 99) % 100 < 40 ? 1 << ([1, 1, 3, 0, 2, 1][hs(id | 0, 5) % 6] * 2) : 0;
const dmx = (a, b) => { let r = 0; for (let z = 0; z < 4; z++) r |= Math.max((a >> (z * 2)) & 3, (b >> (z * 2)) & 3) << (z * 2); return r; };
const dmSum = d => { let t = 0; for (let z = 0; z < 4; z++) t += ((d | 0) >> (z * 2)) & 3; return t; };
const inBld = (px, py) => { const i = Math.floor((px - ROAD / 2) / CELL), j = Math.floor((py - ROAD / 2) / CELL); if (i < 0 || j < 0 || i >= N || j >= N || isPark(i, j)) return false; const [x0, y0, bs] = hbox(i, j); return px > x0 && px < x0 + bs && py > y0 && py < y0 + bs; };
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
    const [x0, y0, bs] = hbox(i, j), x1 = x0 + bs, y1 = y0 + bs;
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
const parseP = s => { const a = String(s).split(","); return { x: +a[0] || 0, y: +a[1] || 0, a: +a[2] || 0, vid: +a[3] || 0, wl: +a[4] || 0, cash: +a[5] || 0, hp: +a[6] || 0, v: +a[7] || 0, hs: +a[8] || 0, hid: +a[9] || 0, dm: +a[10] || 0, wpn: +a[11] || 0, fc: +a[12] || 0, fw: +a[13] || 0, cs: +a[14] || 0, cid: +a[15] || 0, ca: +a[16] || 0, gn: +a[17] || 0, go: +a[18] || 0, gi: +a[19] || 0, gm: +a[20] || 0, hn: +a[21] || 0, pgx: +a[22] || 0, pgy: +a[23] || 0, pga: +a[24] || 0, ib: +a[25] || 0, hz: +a[26] || 0, jl: +a[27] || 0, fu: a[28] || "" }; };

export function createStaClient(env) {
  const { R: RF, set, get, remove, onValue, $, beep, getMe, getCode, getLobby, toast } = env;
  try { document.fonts.load('700 20px "Pricedown Bl"'); } catch (e) { }   // police GTA (Pricedown) : à charger explicitement pour le canvas
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
  const dPeds = new Map(), dCars = new Map(), dP = new Map(), dCops = new Map(), dHelis = new Map();
  // --- simulation de l'hôte ---
  let cops = [], helis = [], heliCd = 0, hostOn = false, peds = [], cars = [], nid = 1, evs = [], evId = 0, lastHs = {}, spawnCd = 0, streamCd = 0, pubAt = 0, hostT = 0, cleanCd = 0, lastGn = {};
  // --- moi ---
  const me = { x: 0, y: 0, a: 0, v: 0, vid: 0, hp: 100, cash: 0, heat: 0, wl: 0, hs: 0, hid: 0, dead: 0, msg: "", hurt: 0, bust: 0, carT: 99, wpn: 0, ammo: [0, 0, 0, 0, 0], dm: 0, fc: 0, fw: 0, cs: 0, cid: 0, ca: 0, cd: 0, flash: 0, dmCd: 0, scr: 0, lastCar: 0, lastCarT: 0, gunT: -1e9, g: 0, g2: 0, gcar: null, gcar2: null, gn: 0, go: 0, gi: 0, gm: 0, hu: 0, hz: 0, land: 0, w5: 0, hvx: 0, hvy: 0, hh: 100, rpgParts: [], rpgQuest: 0, ammoQuest: 0, rpgAmmoUnlocked: 0, arm: 0 };
  // --- gilets pare-balles : un seul gilet porté (me.arm = 0 aucun · 1 · 2 · 3), il réduit TOUS les dégâts reçus (balles, explosions, chocs). Perdu à la mort comme les armes.
  const VEST = [{ n: "GILET −10%", r: .10, p: 250 }, { n: "GILET −25%", r: .25, p: 600 }, { n: "GILET −50%", r: .50, p: 1200 }];
  const armK = () => 1 - (me.arm ? VEST[me.arm - 1].r : 0);
  let keys = new Set(), stick = null, useReq = 0, job = null, myCol = 0, cam = { x: 0, y: 0, z: 1.2 }, sentAt = 0, sentStr = "", savedCash = -1, saveAt = 0, tNow = 0, hitDone = new Set(), gLoaded = false, savedG = "";
  let tvOn = false, inn = null, jail = null, mis = null, tgt = null, lastMk = "", shop = "", mmBase = null;   // mission en cours, cible à éliminer, boutique ouverte
  let ejected = [], splats = [], floats = [], pendingPedHits = new Map(), brakeId = null, fireKey = false, fireId = null, killQ = [], carQ = [], killAt = 0, tracers = [], rockets = [], sparks = [], booms = [], wrecks = [], pickT = new Map(), lastFc = {}, lastCs = {};

  const lobbyP = () => (getLobby() || {}).players || {};
  const activeP = () => { const lp = lobbyP(); return Object.entries(pd).filter(([u]) => lp[u]); };
  const hostUid = () => { const pl = lobbyP(); let b = null; for (const u in pl) { const j = pl[u].j || 1e15; if (!b || j < b[1] || (j === b[1] && u < b[0])) b = [u, j]; } return b && b[0]; };
  const far = (px, py, d) => !activeP().some(([, p]) => Math.hypot(p.x - px, p.y - py) < d);

  // ================= SIMULATION (hôte) =================
  const laneY = cr => rc(cr.y) + cr.dx * 22, laneX = cr => rc(cr.x) - cr.dy * 22;
  const mkCar = () => { const c = { id: nid++, x: 0, y: 0, a: 0, v: 0, c: Math.floor(Math.random() * 8), m: "d", o: "", tm: 0, dx: 1, dy: 0, sp: rr(110, 170), tg: "" }; if (carTy(c.id) > 2) c.sp = Math.round(c.sp * 1.3); return c; };   // les voitures de sport roulent plus vite
  function roadSpawn(cr, base) {
    for (let t = 0; t < 8; t++) {
      let qx, qy; if (base) { const a = rr(0, 6.283), d = rr(600, 900); qx = clamp(base.x + Math.cos(a) * d, 0, WORLD - 1); qy = clamp(base.y + Math.sin(a) * d, 0, WORLD - 1); } else { const ps = activeP(); if (!ps.length) return false; const p = rnd(ps)[1], a = rr(0, 6.283), d = rr(560, 1000); qx = clamp(p.x + Math.cos(a) * d, 0, WORLD - 1); qy = clamp(p.y + Math.sin(a) * d, 0, WORLD - 1); }
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
    for (const o of cars) if (o !== cr && (o.m === "d" || o.m === "c" || o.m === "t" || o.m === "s")) { const f = ahead(o.x, o.y, 75, 26); if (f > 0) vt = Math.min(vt, f < 42 ? 0 : o.v * .9); }
    for (const [, p] of ps) if (ahead(p.x, p.y, 65, 22) > 0) vt = 0;
    for (const q of peds) if (ahead(q.x, q.y, 55, 14) > 0) vt = 0;
    if (tg && Math.hypot(tg.x - cr.x, tg.y - cr.y) < 70) vt = 0;
    cr.v += clamp(vt - cr.v, -380 * dt, 160 * dt);
    const dir = cr.dx || cr.dy, s0 = cr.dx ? cr.x : cr.y, s1 = s0 + dir * cr.v * dt, k0 = Math.floor(s0 / CELL), k1 = Math.floor(s1 / CELL);
    if (k0 !== k1) { const m = (dir > 0 ? k1 : k0) * CELL; if (cr.dx) cr.x = m; else cr.y = m; pick(cr, m); }
    else if (cr.dx) cr.x = s1; else cr.y = s1;
    if (cr.dx && (cr.x > WORLD || cr.x < 0)) { const mm = cr.x > WORLD ? WORLD : 0; cr.x = mm; pick(cr, mm); }   // jamais hors de la carte : demi-tour / virage au bord
    else if (cr.dy && (cr.y > WORLD || cr.y < 0)) { const mm = cr.y > WORLD ? WORLD : 0; cr.y = mm; pick(cr, mm); }
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
    hostOn = true; peds = []; cars = []; cops = []; helis = []; heliCd = 0; nid = 1; evs = []; evId = lastEv; lastHs = {}; lastCs = {}; lastGn = {}; streamCd = 0; spawnCd = 0; hostT = performance.now();
    if (ls && ls.pd) {
      ls.pd.forEach(a => peds.push({ id: a[0], x: a[1], y: a[2], h: a[3], sk: a[4], st: 0, tm: 1 }));
      ls.cr.forEach(a => { const ang = a[3]; let dx = Math.round(Math.cos(ang)), dy = Math.round(Math.sin(ang)); if (dx && dy) dy = 0; if (!dx && !dy) dx = 1; cars.push({ id: a[0], x: a[1], y: a[2], a: ang, v: a[4], c: a[5], m: a[6] === "t" ? "p" : a[6], dm: a[8] | 0, cp: a[9] | 0, cn: 2, o: "", tm: 30, dx, dy, sp: rr(110, 170), tg: "" }); });
      (ls.co || []).forEach(a => cops.push({ id: a[0], x: a[1], y: a[2], a: a[3], hp: a[4], car: a[5], cd: 1, tm: 0, bt: 0, bh: 0, idle: 0 }));
      (ls.he || []).forEach(a => helis.push({ id: a[0], x: a[1], y: a[2], a: a[3], hp: a[4], tg: "", cd: 1.5, ph: rr(0, 6.28), dr: Math.random() < .5 ? 1 : -1, vx: 0, vy: 0, burst: 0, lv: 0, hit: 0 }));
      nid = Math.max(0, ...peds.map(q => q.id), ...cars.map(q => q.id), ...cops.map(q => q.id), ...helis.map(q => q.id)) + 1;
    }
  }
  function hostTick(dt) {
    const ps = activeP(), lp = lobbyP();
    const taken = {}; ps.forEach(([u, p]) => { if (p.vid) taken[p.vid] = [u, p]; });
    cars.forEach(cr => {
      const t = taken[cr.id];
      if (t) { if (cr.m === "d") evs.push([++evId, Math.round(cr.x), Math.round(cr.y), 4, +cr.a.toFixed(2), cr.id]); cr.m = "t"; cr.o = t[0]; cr.x = t[1].x; cr.y = t[1].y; cr.a = t[1].a; cr.v = t[1].v; cr.tm = 0; cr.dm = t[1].dm; }   // car-jacking : l'événement 4 fait sortir le conducteur chez tout le monde
      else if (cr.m === "t") { cr.m = "p"; cr.o = ""; cr.v = 0; cr.tm = 45; }
    });
    ps.forEach(([u, p]) => {                                              // piétons écrasés (annoncés par le conducteur)
      if (lastHs[u] === undefined) lastHs[u] = p.hs;
      else if (p.hs !== lastHs[u]) { lastHs[u] = p.hs; const i = peds.findIndex(q => q.id === p.hid); if (i >= 0) { evs.push([++evId, Math.round(peds[i].x), Math.round(peds[i].y), 1]); peds.splice(i, 1); } }
    });
    ps.forEach(([u, p]) => {                                              // tirs sur les voitures (annoncés par le tireur)
      if (lastCs[u] === undefined) { lastCs[u] = p.cs; return; }
      if (p.cs === lastCs[u]) return; lastCs[u] = p.cs;
      const cr = cars.find(q => q.id === p.cid);
      if (!cr) { const cq = cops.find(q => q.id === p.cid); if (cq) { cq.hp -= p.ca; if (cq.hp <= 0) copDown(cq); } else { const he = helis.find(q => q.id === p.cid); if (he) { he.hp -= p.ca; he.hit = .15; if (he.hp <= 0) heliDown(he); } } return; }
      if (cr.rm || (cr.m !== "d" && cr.m !== "c" && cr.m !== "p" && cr.m !== "s")) return;
      cr.hp = (cr.hp === undefined ? (cr.m === "c" || cr.m === "s" ? 100 : 60) : cr.hp) - p.ca;
      if (cr.hp <= 0) {
        evs.push([++evId, Math.round(cr.x), Math.round(cr.y), 2, +cr.a.toFixed(2), cr.id, cr.m === "s" ? "c" : cr.m]); cr.rm = 1; cr.m = "x";
        cops.slice().forEach(q => { if (Math.hypot(q.x - cr.x, q.y - cr.y) < 60) { q.hp -= 60; if (q.hp <= 0) copDown(q); } });   // l'explosion blesse les policiers proches
      }
    });
    ps.forEach(([u, p]) => {                                              // garage : voiture rangée (retirée du monde) / sortie (recréée devant le joueur)
      if (lastGn[u] === undefined) { lastGn[u] = p.gn; return; }
      if (p.gn === lastGn[u]) return; lastGn[u] = p.gn;
      if (p.go === 1) { const cr = cars.find(q => q.id === p.gi); if (cr && !cr.rm && (cr.m === "t" || cr.m === "p" || cr.m === "d")) { cr.rm = 1; cr.m = "x"; } }
      else if (p.go === 2 && p.gi > 0 && !cars.some(q => q.id === p.gi)) cars.push({ id: p.gi, x: p.x, y: p.y, a: p.a, v: 0, c: p.gm & 7, m: "p", o: "", tm: 60, dx: 1, dy: 0, sp: 140, tg: "", dm: (p.gm >> 3) & 255, cp: (p.gm >> 11) & 1, cn: 2 });
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
    const nc = cars.filter(q => (q.m === "c" || q.m === "s") && !q.rm).length, want = Math.min(8, wanted.reduce((s, [, p]) => s + p.wl, 0));
    spawnCd -= dt;
    if (nc < want && spawnCd <= 0) { const cr = mkCar(); cr.m = "c"; cr.c = 0; cr.cp = 1; cr.cn = 2; if (roadSpawn(cr, rnd(wanted)[1])) { cars.push(cr); spawnCd = 1.6; } }
    cars.forEach(cr => {                                                  // les policiers sortent de la voiture quand un suspect à 2★ est proche
      if (cr.m === "c" && cr.tg && pd[cr.tg] && pd[cr.tg].wl >= 2 && (cr.cn | 0) > 0 && Math.hypot(pd[cr.tg].x - cr.x, pd[cr.tg].y - cr.y) < 230) {
        cr.m = "s"; cr.v = 0; cr.reTm = 0; const qx = -Math.sin(cr.a), qy = Math.cos(cr.a);
        for (let k = 0; k < cr.cn; k++) { const sg = k ? -1 : 1; cops.push({ id: nid++, x: cr.x + qx * 26 * sg, y: cr.y + qy * 26 * sg, a: cr.a, hp: 50, car: cr.id, cd: rr(.5, 1.2), tm: 0, bt: 0, bh: 0, idle: 0 }); }
      } else if (cr.m === "s") {                                          // plus personne à poursuivre : ils remontent dans la voiture
        let b = 1e18; wanted.forEach(([, p]) => { b = Math.min(b, Math.hypot(p.x - cr.x, p.y - cr.y)); });
        cr.reTm = b > 520 ? (cr.reTm || 0) + dt : 0;
        if (cr.reTm > 6) { cr.m = "c"; cr.cn = cops.filter(q => q.car === cr.id).length; cops = cops.filter(q => q.car !== cr.id); cr.tg = ""; cr.reTm = 0; if (!cr.cn) { cr.m = "p"; cr.tm = 60; } }
      }
    });
    cops.forEach(q => {                                                   // IA des policiers à pied : courent vers toi, s'arrêtent pour tirer
      let b = 1e18, t = null; wanted.forEach(([, p]) => { const d = Math.hypot(p.x - q.x, p.y - q.y); if (d < b) { b = d; t = p; } });
      q.cd -= dt; if (!t) { q.idle += dt; return; } q.idle = 0;
      const ang = Math.atan2(t.y - q.y, t.x - q.x); q.a = angLerp(q.a, ang, Math.min(1, 8 * dt));
      const los = b < 300 && wallEnd(q.x, q.y, ang, b) >= b - 6;
      if (!(los && b < 130)) { q.bt -= dt; const hd = q.bt > 0 ? q.bh : ang; q.x += Math.cos(hd) * 85 * dt; q.y += Math.sin(hd) * 85 * dt; if (push(q, 6)) {                                                      // bloqué par un immeuble : on suit la rue (grille) vers la cible
        const onV = Math.abs(q.x - rc(q.x)) < 52, onH = Math.abs(q.y - rc(q.y)) < 52;
        if (onV && (Math.abs(t.y - q.y) > 60 || !onH)) q.bh = t.y > q.y ? 1.5708 : -1.5708; else if (onH) q.bh = t.x > q.x ? 0 : 3.1416; else q.bh = ang + (Math.random() < .5 ? 1 : -1) * rr(1.2, 2.2);
        q.bt = 1.2;
      } }
      if (los && b < 290 && q.cd <= 0) { const sa = ang + rr(-1, 1) * (.05 + b / 2500); evs.push([++evId, Math.round(q.x), Math.round(q.y), 3, +sa.toFixed(2), q.id]); q.cd = rr(.8, 1.4); }
    });
    cops = cops.filter(q => q.idle < 25 && !far(q.x, q.y, 1500));
    heliSim(dt, wanted);
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
      const dkn = darkness(cycT()), wp = Math.max(8, Math.round(Math.min(70, 34 + 4 * np) * (1 - .65 * dkn)));   // moins de monde dehors la nuit
      if (peds.length > wp) { let ex = peds.length - wp; peds = peds.filter(q => { if (ex > 0 && far(q.x, q.y, 600)) { ex--; return false; } return true; }); }
      while (peds.length < wp) { const q = { id: nid++, x: 0, y: 0, h: rr(0, 6.283), sk: Math.floor(Math.random() * 6), st: 0, tm: rr(1, 4) }, pt = nearPt(520, 900); if (!pt) break; sidewalk(q, pt[0], pt[1]); peds.push(q); }
      cars = cars.filter(q => !q.rm);
      for (const cr of cars) if (cr.m === "d" && far(cr.x, cr.y, 1500)) roadSpawn(cr);
      const nd = cars.filter(q => q.m === "d").length, wc = Math.max(5, Math.round(Math.min(26, 14 + 2 * np) * (1 - .55 * dkn)));
      if (nd > wc) { let ex = nd - wc; for (const cr of cars) if (ex > 0 && cr.m === "d" && far(cr.x, cr.y, 700)) { cr.rm = 1; ex--; } }
      for (let i = nd; i < wc; i++) { const cr = mkCar(); if (roadSpawn(cr)) cars.push(cr); }
      if ((cleanCd -= 1) <= 0) { cleanCd = 5; Object.keys(pd).forEach(u => { if (!lp[u]) remove(RF(`games/${c}/p/${u}`)).catch(() => { }); }); }
    }
    evs = evs.slice(-30);
    const now = performance.now();
    if (now - pubAt > 130) { pubAt = now; publish(); }
  }

  // --- hélicoptères de police (hôte) : à 5★ ils arrivent du ciel, tournent autour de toi, te mitraillent et t'éclairent.
  //     Ils volent au-dessus des bâtiments. À 3★ ou moins ils repartent. On les abat avec les armes (PV : HEL_HP).
  function heliDown(h) {
    helis = helis.filter(o => o !== h); heliCd = rr(5, 10); evs.push([++evId, Math.round(h.x), Math.round(h.y), 6, +h.a.toFixed(2), h.id]);   // détruit : le prochain hélico de police ne repart qu'après 5 à 10 s
    cops.slice().forEach(q => { if (Math.hypot(q.x - h.x, q.y - h.y) < 70) { q.hp -= 60; if (q.hp <= 0) copDown(q); } });
  }
  function heliSim(dt, wanted) {
    const tg = wanted.filter(([, p]) => p.wl >= 4 && !p.ib), t5 = wanted.filter(([, p]) => p.wl >= 5 && !p.ib);
    heliCd -= dt;
    if (t5.length && helis.filter(h => !h.lv).length < Math.min(3, t5.length) && heliCd <= 0) {
      const t = rnd(t5)[1], an = rr(0, 6.283), d = rr(750, 950);
      helis.push({ id: nid++, x: clamp(t.x + Math.cos(an) * d, -40, WORLD + 40), y: clamp(t.y + Math.sin(an) * d, -40, WORLD + 40), a: an + Math.PI, hp: HEL_HP, tg: "", cd: 1.5, ph: an, dr: Math.random() < .5 ? 1 : -1, vx: 0, vy: 0, burst: 0, lv: 0, hit: 0 });
      heliCd = 5;
    }
    helis.forEach(h => {
      h.hit -= dt; let b = 1e18, t = null;
      tg.forEach(([, p]) => { const d = Math.hypot(p.x - h.x, p.y - h.y); if (d < b) { b = d; t = p; } });
      const e = Math.min(1, 1.8 * dt);
      if (!t) {                                                          // plus de suspect : l'hélico s'éloigne
        h.lv += dt; const ax = h.x - WORLD / 2, ay = h.y - WORLD / 2, m = Math.hypot(ax, ay) || 1;
        h.vx += (ax / m * 230 - h.vx) * e; h.vy += (ay / m * 230 - h.vy) * e; h.x += h.vx * dt; h.y += h.vy * dt;
        h.a = angLerp(h.a, Math.atan2(h.vy, h.vx), Math.min(1, 3 * dt)); return;
      }
      h.lv = 0; h.ph += h.dr * .5 * dt;                                  // il décrit un cercle autour de la cible, le nez pointé dessus
      const gx = t.x + Math.cos(h.ph) * 125, gy = t.y + Math.sin(h.ph) * 125, dx = gx - h.x, dy = gy - h.y, dd = Math.hypot(dx, dy), sp = clamp(dd * 1.4, 0, 270);
      h.vx += ((dd > 1 ? dx / dd * sp : 0) - h.vx) * e; h.vy += ((dd > 1 ? dy / dd * sp : 0) - h.vy) * e;
      h.x += h.vx * dt; h.y += h.vy * dt;
      h.a = angLerp(h.a, Math.atan2(t.y - h.y, t.x - h.x), Math.min(1, 3.2 * dt));
      h.cd -= dt;
      if (b < 340 && h.cd <= 0) {                                        // rafales de 6 coups, puis pause
        const sa = h.a + rr(-1, 1) * (.06 + b / 1800); evs.push([++evId, Math.round(h.x), Math.round(h.y), 5, +sa.toFixed(2), h.id]);
        if (++h.burst >= 6) { h.burst = 0; h.cd = rr(1.4, 2.4); } else h.cd = .16;
      }
    });
    helis = helis.filter(h => !(h.lv > 0 && (h.lv > 20 || far(h.x, h.y, 1200))));
  }
  function copDown(q) {                                                   // policier abattu : sang ; si les deux sont morts, la voiture est libre
    cops = cops.filter(o => o !== q); evs.push([++evId, Math.round(q.x), Math.round(q.y), 1, q.id]);
    const cr = cars.find(c2 => c2.id === q.car);
    if (cr && cr.m === "s" && !cops.some(o => o.car === cr.id)) { cr.m = "p"; cr.tm = 90; cr.v = 0; cr.o = ""; }
  }
  function publish() {
    const r = Math.round, f2 = v => +v.toFixed(2);
    const s = { k: "sta", t: Date.now(), h: myUid, pd: peds.map(q => [q.id, r(q.x), r(q.y), f2(q.h), q.sk, q.st]), cr: cars.filter(q => !q.rm).map(q => [q.id, r(q.x), r(q.y), f2(q.a), r(q.v), q.c, q.m, q.o, q.dm | 0, q.cp | 0]), co: cops.map(q => [q.id, r(q.x), r(q.y), f2(q.a), q.hp, q.car]), he: helis.map(q => [q.id, r(q.x), r(q.y), f2(q.a), r(q.hp), q.hit > 0 ? 1 : 0]), ev: evs };
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
    if (s.h !== myUid && +s.t > 1e12) { const off = s.t - Date.now(); clockOff = clockOff === null ? off : clockOff * .9 + off * .1; }   // horloge commune : alignée sur celle de l'hôte
    if (s.t < lastT) return; lastT = s.t; const firstSnap = !ls; ls = s;
    const seen = new Set();
    s.pd.forEach(a => { seen.add(a[0]); let d = dPeds.get(a[0]); if (!d) dPeds.set(a[0], d = { x: a[1], y: a[2], a: a[3] }); d.tx = a[1]; d.ty = a[2]; d.ta = a[3]; d.sk = a[4]; d.st = a[5]; });
    for (const k of dPeds.keys()) if (!seen.has(k)) dPeds.delete(k);
    const sc = new Set();
    s.cr.forEach(a => { sc.add(a[0]); let d = dCars.get(a[0]); if (!d) dCars.set(a[0], d = { x: a[1], y: a[2], a: a[3] }); d.tx = a[1]; d.ty = a[2]; d.ta = a[3]; d.v = a[4]; d.c = a[5]; d.m = a[6]; d.o = a[7]; d.dm = a[8] | 0; d.cp = a[9] | 0; });
    for (const k of dCars.keys()) if (!sc.has(k)) dCars.delete(k);
    const so = new Set();
    (s.co || []).forEach(a => { so.add(a[0]); let d = dCops.get(a[0]); if (!d) dCops.set(a[0], d = { x: a[1], y: a[2], a: a[3] }); d.tx = a[1]; d.ty = a[2]; d.ta = a[3]; d.hp = a[4]; });
    for (const k of dCops.keys()) if (!so.has(k)) dCops.delete(k);
    const sh = new Set();
    (s.he || []).forEach(a => { sh.add(a[0]); let d = dHelis.get(a[0]); if (!d) dHelis.set(a[0], d = { x: a[1], y: a[2], a: a[3] }); d.tx = a[1]; d.ty = a[2]; d.ta = a[3]; d.hp = a[4]; if (a[5]) d.fl = tNow; });
    for (const k of dHelis.keys()) if (!sh.has(k)) dHelis.delete(k);
    (s.ev || []).forEach(e => {
      if (e[0] <= lastEv) return; lastEv = e[0]; if (firstSnap) return;                // à l'arrivée on ignore l'historique des événements
      if (e[3] === 4) { ejectDriver(e[1], e[2], e[4] || 0, e[5] || 0); return; }   // conducteur éjecté d'une voiture volée
      if (e[3] === 3) {                                                   // un policier tire : traceur + touche calculée chez la victime
        const ang = e[4], dx = Math.cos(ang), dy = Math.sin(ang), ox = e[1] + dx * 10, oy = e[2] + dy * 10, en = wallEnd(ox, oy, ang, 330), cd = dCops.get(e[5]);
        tracers.push({ x0: ox, y0: oy, x1: ox + dx * en, y1: oy + dy * en, t: tNow }); if (cd) cd.flash = tNow;
        if (Math.hypot(e[1] - me.x, e[2] - me.y) < 450) SND.shot(1, dv(e[1], e[2], 450));
        if (me.dead <= 0 && me.vid !== HELI) { const rx = me.x - ox, ry = me.y - oy, f = rx * dx + ry * dy; if (f > 0 && f < en && Math.abs(-rx * dy + ry * dx) < (me.vid ? 15 : 8)) { me.hp -= 9 * (me.vid ? .6 : 1) * armK(); beep(150, .06, "square", .05, 50); navigator.vibrate && navigator.vibrate(40); if (me.vid && Math.random() < .35) dent(ang + Math.PI, 1); } }
        return;
      }
      if (e[3] === 5) {                                                   // hélico de police : mitrailleuse, tir du ciel (aucun mur ne l'arrête)
        const ang = e[4], dx = Math.cos(ang), dy = Math.sin(ang), ox = e[1] + dx * 24, oy = e[2] + dy * 24, en = 400, hd = dHelis.get(e[5]);
        tracers.push({ x0: ox, y0: oy, x1: ox + dx * en, y1: oy + dy * en, t: tNow }); if (hd) hd.fl = tNow;
        if (Math.hypot(e[1] - me.x, e[2] - me.y) < 600) SND.shot(2, dv(e[1], e[2], 600));
        if (me.dead <= 0 && !inn) { const rx = me.x - ox, ry = me.y - oy, f = rx * dx + ry * dy; if (f > 0 && f < en && Math.abs(-rx * dy + ry * dx) < (me.vid ? 16 : 8)) { if (me.vid === HELI) me.hh -= 5; else me.hp -= 7 * (me.vid ? .7 : 1) * armK(); beep(150, .06, "square", .05, 50); navigator.vibrate && navigator.vibrate(40); if (me.vid && me.vid !== HELI && Math.random() < .35) dent(ang + Math.PI, 1); } }
        return;
      }
      if (e[3] === 6) {                                                   // hélico abattu : explosion + épave qui brûle
        booms.push({ x: e[1], y: e[2], t: tNow }); booms.push({ x: e[1] + 14, y: e[2] - 10, t: tNow + 120 }); wrecks.push({ x: e[1], y: e[2], a: e[4] || 0, t: tNow, id: e[5] || 0, he: 1 }); if (wrecks.length > 8) wrecks.shift();
        SND.boom(dv(e[1], e[2], 900)); if (Math.hypot(e[1] - me.x, e[2] - me.y) < 80 && me.dead <= 0) hurtBoom();
        if (e[5] && e[5] === me.lastCar && tNow - me.lastCarT < 2500) { me.cash += 600; me.heat = Math.min(5, me.heat + .5); floats.push({ x: e[1], y: e[2] - 24, t: tNow, s: "🚁 HÉLICO ABATTU +$600", c: "#ffd23f" }); }
        return;
      }
      if (e[3] === 2) {                                                   // voiture détruite : explosion + épave
        booms.push({ x: e[1], y: e[2], t: tNow }); wrecks.push({ x: e[1], y: e[2], a: e[4] || 0, t: tNow, id: e[5] || 0 }); if (wrecks.length > 8) wrecks.shift();
        const dd = Math.hypot(e[1] - me.x, e[2] - me.y); SND.boom(dv(e[1], e[2], 700));
        if (dd < 75 && me.dead <= 0) hurtBoom();
        if (e[5] && e[5] === me.lastCar && tNow - me.lastCarT < 2500) { const rw = e[6] === "c" ? 300 : 100; me.cash += rw; me.heat = Math.min(5, me.heat + (e[6] === "c" ? .5 : .3)); floats.push({ x: e[1], y: e[2] - 20, t: tNow, s: `💥 +$${rw}`, c: "#ffd23f" }); }
        return;
      }
      if (e[4] && e[4] === me.lastCar && tNow - me.lastCarT < 2500) { me.cash += 150; me.heat = Math.min(5, me.heat + .8); floats.push({ x: e[1], y: e[2] - 14, t: tNow, s: "🚓 policier abattu +$150", c: "#ffd23f" }); }
      splats.push({ x: e[1], y: e[2], t: tNow }); if (splats.length > 40) splats.shift(); { const sv = dv(e[1], e[2], 420); SND.thud(sv * .6); SND.ped(sv); }
    });
  }
  function onP(snap) {
    const o = snap.val() || {}, n = {}; Object.keys(o).forEach(u => { n[u] = parseP(o[u]); }); pd = n;
    for (const u in n) {                                                  // tirs des autres : traceurs + touche calculée chez la victime
      if (u === myUid) continue; const p = n[u], old = lastFc[u]; lastFc[u] = p.fc; if (old === undefined || old === p.fc) continue;
      let k = (p.fc - old + 1000) % 1000; if (k > 8) k = 1; const W = WPN[p.fw]; if (!W) continue;
      const dd = dP.get(u); if (dd) { dd.flash = tNow; dd.fw = p.fw; } SND.shot(p.fw, dv(p.x, p.y, 520) * .8);
      for (let sh = 0; sh < k; sh++) for (let q = 0; q < W.pel; q++) {
        const ang = p.a + rr(-W.spr, W.spr), dx = Math.cos(ang), dy = Math.sin(ang), ox = p.x + dx * (p.vid ? 24 : 11), oy = p.y + dy * (p.vid ? 24 : 11), e = wallEnd(ox, oy, ang, W.rng);
        if (p.fw === 4) { rockets.push({ own: 0, x: ox, y: oy, dx, dy, ang, d: 0, max: W.rng, t: tNow, done: 0 }); continue; }
        else tracers.push({ x0: ox, y0: oy, x1: ox + dx * e, y1: oy + dy * e, t: tNow });
        if (me.dead > 0) continue;
        const rx = me.x - ox, ry = me.y - oy, f = rx * dx + ry * dy;
        if (f > 0 && f < e && Math.abs(-rx * dy + ry * dx) < (me.vid ? 15 : 8)) { if (me.vid === HELI) me.hh -= W.pvp * .6; else me.hp -= W.pvp * (me.vid ? .6 : 1) * armK(); beep(150, .05, "square", .04, 50); if (me.vid && Math.random() < .3) dent(ang + Math.PI, 1); }
      }
    }
  }

  // ================= MOI =================
  const col = i => CCOL[(i | 0) % 8];
  function spawnAt(p) { me.hz = 0; me.land = 0; me.x = p[0] + rr(-30, 30); me.y = p[1]; me.vid = 0; me.v = 0; me.hp = 100; me.dead = 0; me.heat = 0; me.bust = 0; job = null; cam.x = me.x; cam.y = me.y; }
  function die(why, loss, where) { pwFail("tu es tombé"); me.hz = 0; me.land = 0; shop = ""; if (mis) missionFail("tu es tombé"); me.dead = 2.2; me.msg = why; me.wpn = 0; me.arm = 0; me.ammo = [0, 0, 0, 0, 0]; me.vid = 0; me.v = 0; me.heat = 0; me.cash = Math.floor(me.cash * (1 - loss)); me.where = where; SND.wasted(); }
  const gStr = () => JSON.stringify({ g: me.g, c: me.gcar, g2: me.g2 ? 1 : 0, c2: me.gcar2, a: me.ammo.slice(1), w: me.wpn, h: me.hu ? 1 : 0, hh: Math.round(clamp(me.hh, 0, 100)), rp: me.rpgParts, rq: me.rpgQuest, aq: me.ammoQuest, rau: me.rpgAmmoUnlocked, ar: me.arm | 0, ho: me.hou | 0, hq: me.hsp, hb: me.hb.map(b => [Math.round(b.c), b.a[0], b.a[1], b.a[2], b.a[3], b.v]) });
  function persist(force) {                                               // argent (users/<uid>/sta) + garage, voiture rangée, armes et munitions (users/<uid>/sta2)
    const cash = Math.round(me.cash);
    if (force || cash !== savedCash) { savedCash = cash; set(RF(`users/${myUid}/sta`), cash).catch(() => { }); }
    if (!gLoaded) return;                                                 // on n'écrase jamais la sauvegarde avant de l'avoir lue
    const gs = gStr(); if (force || gs !== savedG) { savedG = gs; set(RF(`users/${myUid}/sta2`), gs).catch(() => { }); }
  }
  const inGarage = () => me.dead <= 0 && Math.hypot(me.x - GZ.x, me.y - GZ.y) < 62;
  const isOwner = () => { try { const o = env.isOwner; if (o !== undefined) return !!(typeof o === "function" ? o() : o); const m = getMe() || {}; return !!(m.owner || m.isOwner || m.role === "owner"); } catch { return false; } };
  function gAct() {                                                       // action de garage possible ici : "" | "buy" | "store" | "take" | "ghost" | "ghostPut"
    if (me.vid === HELI || !inGarage()) return "";
    if (!me.g) return "buy";
    if (me.vid) return me.vid === GHOST ? "ghostPut" : (!me.gcar || (me.g2 && !me.gcar2)) ? "store" : "";
    if (me.gcar || me.gcar2) return "take";
    return isOwner() ? "ghost" : "";
  }
  function ghostTake() {                                                  // voiture fantôme : rapide, aucun dégât ; n'existe pas dans le monde (pas de go/gi), seulement chez son conducteur
    me.pg = null; me.vid = GHOST; me.v = 0; myCol = 7; me.dm = 0; me.cop = 0; me.carT = 0; me.hp = 100; job = null;
    floats.push({ x: me.x, y: me.y - 22, t: tNow, s: "👻 VOITURE FANTÔME", c: "#9ad8ff" }); beep(880, .14, "triangle", .06);
  }

  // ================= HÉLICOPTÈRE DU JOUEUR =================
  // Débloqué par la quête du PILOTE (me.hu, sauvegardé dans users/<uid>/sta2). Il se range sur le toit du garage :
  // on le sort par l'échelle du garage (comme la voiture), on ne peut le poser que sur l'héliport (zone 🅷), jamais dans la rue.
  const hurtBoom = () => { if (me.vid === HELI) me.hh -= 25; else me.hp -= 30 * armK(); };   // explosion proche : la coque encaisse en hélico
  function heliTake() {
    if (!me.hu || !me.g) return;
    if (me.hh < 15) { toast("L'hélico est trop abîmé : fais-le réparer chez Rico (atelier du garage)"); return; }
    me.pg = null; me.vid = HELI; me.x = RP.x; me.y = RP.y; me.a = -Math.PI / 2; me.v = 0; me.hvx = 0; me.hvy = 0; me.hz = 0; me.land = 0; myCol = 7; me.dm = 0; me.cop = 0; me.carT = 0; job = null;
    cam.x = me.x; cam.y = me.y;
    floats.push({ x: me.x, y: me.y - 30, t: tNow, s: "🚁 DÉCOLLAGE !", c: "#ffd23f" }); beep(660, .12, "triangle", .06);
  }
  function heliLand() {
    if (me.hz < .95 || me.land) return;
    if (Math.hypot(me.x - RP.x, me.y - RP.y) > 62) { toast("Pose l'hélico sur l'héliport 🅷 du toit de ton garage"); return; }
    if (Math.abs(me.v) > 120) { toast("Ralentis pour te poser !"); return; }
    me.land = 1;
  }
  function heliStow() {
    me.vid = 0; me.v = 0; me.hvx = 0; me.hvy = 0; me.hz = 0; me.land = 0; me.x = GZ.x; me.y = GZ.y; me.a = Math.PI / 2;
    floats.push({ x: me.x, y: me.y - 22, t: tNow, s: "🚁 HÉLICO RANGÉ SUR LE TOIT", c: "#7ae582" }); beep(520, .1, "triangle", .06);
  }
  function heliFly(dt, ix, iy) {                                          // vol « arcade » : ↑ avance, ↓ freine / recule, ←→ pivote sur place ; l'hélico glisse un peu
    if (me.land) {                                                        // atterrissage automatique sur l'héliport
      me.hz -= dt / 1.3; const k = Math.max(0, 1 - 3 * dt); me.hvx *= k; me.hvy *= k;
      me.x += (RP.x - me.x) * Math.min(1, 3 * dt) + me.hvx * dt; me.y += (RP.y - me.y) * Math.min(1, 3 * dt) + me.hvy * dt; me.v = Math.hypot(me.hvx, me.hvy); me.thr = 0;
      if (me.hz <= 0) heliStow(); return;
    }
    if (me.hz < 1) me.hz = Math.min(1, me.hz + dt / 1.1);
    let th = -iy, sr = ix;
    if (stick) {
      const m = Math.hypot(ix, iy);
      if (brakeId !== null) { th = -1; sr = ix; }
      else if (m > .05) { let d = Math.atan2(iy, ix) - me.a; d = Math.atan2(Math.sin(d), Math.cos(d)); sr = clamp(d * 2.5, -1, 1); th = Math.abs(d) < 1.3 ? Math.max(.6, m) : .15; }
      else { th = 0; sr = 0; }
    } else if (brakeId !== null) th = -1;
    const ctl = me.hz > .55 ? 1 : 0;
    me.a += sr * 2.6 * ctl * dt;
    const fx = Math.cos(me.a), fy = Math.sin(me.a);
    me.thr = th > 0 ? Math.min(1, th) : 0; me.sk = 0;
    if (th > 0) { me.hvx += fx * 320 * th * ctl * dt; me.hvy += fy * 320 * th * ctl * dt; }
    else if (th < 0) { const k = Math.max(0, 1 - 2.6 * -th * dt); me.hvx *= k; me.hvy *= k; me.hvx -= fx * 120 * -th * ctl * dt; me.hvy -= fy * 120 * -th * ctl * dt; }
    else { const k = Math.max(0, 1 - .55 * dt); me.hvx *= k; me.hvy *= k; }
    { const vf = me.hvx * fx + me.hvy * fy, lx = me.hvx - fx * vf, ly = me.hvy - fy * vf, k = Math.max(0, 1 - 1.6 * dt); me.hvx = fx * vf + lx * k; me.hvy = fy * vf + ly * k; }   // glissade latérale amortie
    const sp = Math.hypot(me.hvx, me.hvy); if (sp > HELI_V) { me.hvx *= HELI_V / sp; me.hvy *= HELI_V / sp; }
    me.x += me.hvx * dt; me.y += me.hvy * dt;
    const o = ROAD / 2 - 13; me.x = clamp(me.x, -o, WORLD + o); me.y = clamp(me.y, -o, WORLD + o);   // il survole les bâtiments, seules les limites de la carte l'arrêtent
    me.v = Math.hypot(me.hvx, me.hvy); me.dm = Math.round(100 - me.hh);   // l'état de la coque est envoyé aux autres (fumée)
  }
  function garageDo(fromInn, slot) {
    if (!fromInn && !me.vid && me.g && inGarage()) { enterInn("garage"); return true; }   // à pied devant ton garage : on entre
    const a = gAct(); if (!a) return false;
    if (a === "ghost") { ghostTake(); return true; }
    if (a === "ghostPut") { me.vid = 0; me.v = 0; job = null; floats.push({ x: me.x, y: me.y - 22, t: tNow, s: "👻 FANTÔME RANGÉ", c: "#9ad8ff" }); beep(520, .1, "triangle", .06); return true; }
    if (a === "buy") {
      if (me.cash < GPRICE) { toast(`Il te faut $${GPRICE} pour acheter le garage`); return true; }
      me.cash -= GPRICE; me.g = 1; setTimeout(() => { if (active && me.wl === 0 && !inn && inGarage()) enterInn("garage"); }, 450); floats.push({ x: me.x, y: me.y - 22, t: tNow, s: `GARAGE ACHETÉ −$${GPRICE}`, c: "#7ae582" }); beep(660, .12, "triangle", .06); persist(true); return true;
    }
    if (a === "store") {
      const nc = { c: myCol & 7, t: carTy(me.vid), d: me.dm & 255, p: me.cop ? 1 : 0 }; if (!me.gcar) me.gcar = nc; else me.gcar2 = nc;   // 1er emplacement libre
      me.go = 1; me.gi = me.vid; me.gn = (me.gn + 1) % 1000; me.vid = 0; me.v = 0; me.cop = 0; job = null;
      floats.push({ x: me.x, y: me.y - 22, t: tNow, s: "VOITURE RANGÉE", c: "#7ae582" }); beep(520, .1, "triangle", .06); persist(true); return true;
    }
    const sl = slot === 2 && me.gcar2 ? 2 : slot === 1 && me.gcar ? 1 : me.gcar ? 1 : 2, g = sl === 1 ? me.gcar : me.gcar2; let id = 0;   // sortie : même modèle (carTy), même couleur, mêmes dégâts
    if (!g) return false;
    for (let k = 0; k < 600 && !id; k++) { const t = 100000 + Math.floor(Math.random() * 900000); if (carTy(t) === g.t && !wear(t)) id = t; }
    if (!id) { id = 100000; while (carTy(id) !== g.t) id++; }
    if (sl === 1) me.gcar = null; else me.gcar2 = null; me.go = 2; me.gi = id; me.gm = g.c + 8 * g.d + 2048 * (g.p ? 1 : 0); me.gn = (me.gn + 1) % 1000;
    me.vid = id; me.v = 0; myCol = g.c; me.dm = g.d; me.cop = g.p ? 1 : 0; me.carT = 0; newJob();
    floats.push({ x: me.x, y: me.y - 22, t: tNow, s: "VOITURE SORTIE", c: "#7ae582" }); beep(660, .1, "triangle", .06); persist(true); return true;
  }
  function ejectDriver(cx, cy, ca, cid) {                                 // le conducteur est jeté sur le côté de la voiture, au sol, puis se relève et s'enfuit
    if (cid && ejected.some(q => q.id === cid && tNow - q.t < 5000)) return;
    const sd = hs(cid | 0, 7) % 2 ? 1 : -1, an = ca + sd * 1.5708, p = { x: cx + Math.cos(an) * 30, y: cy + Math.sin(an) * 30 };
    if (push(p, 7)) { p.x = cx + Math.cos(an) * 30; p.y = cy + Math.sin(an) * 30; }
    ejected.push({ id: cid, x: p.x, y: p.y, a: an + rr(-.5, .5), fl: an, sk: hs(cid | 0, 3) % 6, t: tNow });
    if (ejected.length > 12) ejected.shift();
    if (Math.hypot(cx - me.x, cy - me.y) < 450) beep(140, .15, "square", .05, 60);
  }
  function drawEjected(q, now) {
    const age = now - q.t, sh = SHIRT[q.sk % 6], sk = SKIN[q.sk % 6];
    if (age < 3200) {                                                     // allongé au sol, étourdi
      x.save(); x.translate(q.x, q.y); x.rotate(q.a);
      x.fillStyle = "rgba(0,0,0,.35)"; x.beginPath(); x.ellipse(2, 2, 10, 6, 0, 0, 7); x.fill();
      x.fillStyle = "#14141a"; x.fillRect(-13, -4, 7, 3); x.fillRect(-12, 1, 7, 3);                       // jambes écartées
      x.fillStyle = "#101010"; x.fillRect(-6, -6, 12, 12); x.fillStyle = sh; x.fillRect(-5, -5, 10, 10);   // torse
      x.fillStyle = sk; x.fillRect(-2, -10, 3, 5); x.fillRect(2, 5, 3, 5);                                 // bras en croix
      x.fillStyle = "#101010"; x.beginPath(); x.arc(9, 0, 4.4, 0, 7); x.fill(); x.fillStyle = sk; x.beginPath(); x.arc(9, 0, 3.5, 0, 7); x.fill();
      x.fillStyle = "#2b1b10"; x.beginPath(); x.arc(8.3, 0, 3, 1.57, 4.71); x.fill();
      x.restore();
      for (let k = 0; k < 3; k++) { const an = now / 260 + k * 2.09; x.fillStyle = "#ffe14d"; x.fillRect(q.x + Math.cos(q.a) * 9 + Math.cos(an) * 8 - 1.5, q.y + Math.sin(q.a) * 9 + Math.sin(an) * 4 - 9, 3, 3); }   // étoiles qui tournent
    } else {                                                              // il se relève puis s'enfuit
      const f = (age - 3200) / 3000, ra = q.fl, run = f > .25 ? (f - .25) * 130 : 0;
      if (f >= 1) return;
      x.globalAlpha = f > .75 ? Math.max(0, 1 - (f - .75) / .25) : 1;
      drawWalker(q.x + Math.cos(ra) * run, q.y + Math.sin(ra) * run, ra, sh, sk, run > 0 ? now / 70 : null, 0, false);
      x.globalAlpha = 1;
    }
  }
  function useKey() {
    if (me.dead > 0) return;
    if (shop) { shop = ""; return; }
    if (inn) { innUse(); return; }
    if (me.vid === HELI) { heliLand(); return; }
    if (!me.vid) {
      if (nearBM()) { shop = "bm"; beep(660, .06, "triangle", .05); return; }
      const nh = nearHouse(); if (nh >= 0) { houseDo(nh); return; }
      const z = shopAt(); if (z) { if (z === "heal") healDo(); else if (z === "jail") { shop = "jail"; beep(660, .06, "triangle", .05); } else enterInn(z); return; }
      if (talkDo()) return;
    }
    if (garageDo()) return;
    if (me.vid) {
      const was = me.vid === GHOST ? { x: me.x, y: me.y, a: me.a } : null;   // la voiture fantôme reste là où tu l'as laissée
      for (const sg of [1, -1]) { const t = { x: me.x + Math.cos(me.a + sg * 1.5708) * 30, y: me.y + Math.sin(me.a + sg * 1.5708) * 30 }, q = { x: t.x, y: t.y }; if (!push(q, 8)) { me.x = t.x; me.y = t.y; break; } }
      me.vid = 0; me.v = 0; job = null; SND.door(); if (was) { me.pg = was; floats.push({ x: was.x, y: was.y - 22, t: tNow, s: "👻 FANTÔME GARÉ", c: "#9ad8ff" }); } return;
    }
    if (me.pg && isOwner() && Math.hypot(me.pg.x - me.x, me.pg.y - me.y) < 52) {   // seuls les owners peuvent remonter dans le fantôme
      const g = me.pg; me.pg = null; me.vid = GHOST; me.x = g.x; me.y = g.y; me.a = g.a; me.v = 0; myCol = 7; me.dm = 0; me.cop = 0; me.carT = 0; me.hp = 100; job = null; SND.door(); beep(880, .14, "triangle", .06); return;
    }
    let best = 0, bd = 48, bc = null;
    for (const [id, d] of dCars) if ((d.m === "d" || d.m === "p") && Math.hypot(d.x - me.x, d.y - me.y) < bd) { bd = Math.hypot(d.x - me.x, d.y - me.y); best = id; bc = d; }
    if (!best) return;
    SND.door(); SND.ignition(); me.vid = best; me.x = bc.x; me.y = bc.y; me.a = bc.a; me.v = bc.m === "d" ? bc.v : 0; myCol = bc.c; me.carT = 0; me.dm = dmx(bc.dm | 0, wear(best));
    me.cop = bc.cp | 0; if (bc.cp) { me.heat += 1.2; floats.push({ x: me.x, y: me.y - 20, t: tNow, s: "🚓 Voiture de police volée !", c: "#ffd23f" }); }
    if (bc.m === "d") { ejectDriver(bc.x, bc.y, bc.a, best); me.heat += .8; floats.push({ x: me.x, y: me.y - 20, t: tNow, s: "🚗 Car-jacking !", c: "#ffd23f" }); }
    newJob();
  }
  function dent(wa, sev) {                                                // la tôle se déforme du côté de l'impact (wa = angle monde vers le point d'impact)
    if (!me.vid || me.vid === GHOST || me.vid === HELI || me.dmCd > 0) return; me.dmCd = .35;
    const rel = Math.atan2(Math.sin(wa - me.a), Math.cos(wa - me.a)), z = Math.abs(rel) < .785 ? 0 : Math.abs(rel) > 2.356 ? 2 : rel > 0 ? 1 : 3;
    for (let k = 0; k < sev; k++) if (((me.dm >> (z * 2)) & 3) < 3) me.dm += 1 << (z * 2);
    SND.crash(sev); navigator.vibrate && navigator.vibrate(30);
  }
  const hasGun = () => me.ammo.some(v => v > 0);
  function selWpn(n) { if (n === 0 || me.ammo[n] > 0) me.wpn = n; }                // 0 = les poings 👊
  function cycleWpn() { for (let k = 1; k <= 4; k++) { const n = (me.wpn + k) % 5; if (n === 0 || me.ammo[n] > 0) { me.wpn = n; return; } } me.wpn = 0; }   // poings → armes possédées → poings
  // --- RPG : vraie roquette. Elle avance image par image et explose là où sont RÉELLEMENT les cibles à cet instant
  // (plus de calcul instantané au moment du tir : si la voiture roule, la roquette la suit dans le monde).
  const RK_SPEED = 620, RK_STEP = 5;
  const RK_SELF_R = 62, RK_SELF_DMG = 65;                                  // dégâts sur soi : max à bout portant, 0 à RK_SELF_R px du point d'impact
  function rocketProbe(q) {
    if (inBld(q.x, q.y)) return 2;
    for (const [id, d] of dCars) { if (d.m === "t" || (q.own && id === me.vid)) continue; if (Math.hypot(d.x - q.x, d.y - q.y) < 20) return 1; }
    for (const [id, d] of dPeds) { if (hitDone.has(id)) continue; if (Math.hypot(d.x - q.x, d.y - q.y) < 11) return 1; }
    for (const [id, d] of dCops) { if (hitDone.has(id)) continue; if (Math.hypot(d.x - q.x, d.y - q.y) < 11) return 1; }
    for (const [id, d] of dHelis) if (Math.hypot(d.x - q.x, d.y - q.y) < 22) return 1;
    if (q.own) {
      if (tgt && tgt.hp > 0 && Math.hypot(tgt.x - q.x, tgt.y - q.y) < 12) return 1;
      if (mis && mis.k === "truck" && mis.trk.hp > 0 && Math.hypot(mis.trk.x - q.x, mis.trk.y - q.y) < 21) return 1;
    } else if (me.dead <= 0 && Math.hypot(me.x - q.x, me.y - q.y) < (me.vid ? 19 : 10)) return 1;
    return 0;
  }
  function rocketBoom(q, now, wall) {
    q.done = 1; if (wall) { q.x -= q.dx * 3; q.y -= q.dy * 3; }
    booms.push({ x: q.x, y: q.y, t: now, rpg: 1 }); SND.boom(dv(q.x, q.y, 900)); sparks.push({ x: q.x, y: q.y, t: now });
    const W = WPN[4];
    if (!q.own) {                                                            // roquette d'un autre joueur : je prends les dégâts si je suis dans le souffle
      if (me.dead <= 0 && Math.hypot(me.x - q.x, me.y - q.y) < (me.vid ? 34 : 28)) { if (me.vid === HELI) me.hh -= W.pvp * .6; else me.hp -= W.pvp * (me.vid ? .6 : 1) * armK(); beep(150, .05, "square", .04, 50); if (me.vid && Math.random() < .3) dent(q.ang + Math.PI, 1); }
      return;
    }
    if (me.dead <= 0 && me.vid !== GHOST) {                                  // ma propre explosion : tirer à bout portant fait mal (linéaire selon la distance)
      const ds = Math.hypot(me.x - q.x, me.y - q.y);
      if (ds < RK_SELF_R) {
        const dm = RK_SELF_DMG * (1 - ds / RK_SELF_R) * (me.vid ? .6 : 1);
        if (me.vid === HELI) me.hh -= dm; else me.hp -= dm * armK();
        if (dm >= 1) { floats.push({ x: me.x, y: me.y - 24, t: now, s: `💥 −${Math.round(dm)}`, c: "#ff5a4d" }); beep(130, .08, "square", .05, 45); if (me.vid && me.vid !== HELI && Math.random() < .5) dent(q.ang + Math.PI, 1); }
      }
    }
    const pushCar = (id, v) => { me.lastCar = id; me.lastCarT = tNow; const l = carQ[carQ.length - 1]; if (l && l[0] === id) l[1] += v; else carQ.push([id, v]); if (carQ.length > 8) carQ.shift(); };
    const near = (d, r) => Math.hypot(d.x - q.x, d.y - q.y) < r;
    for (const [id, d] of dCars) if (d.m !== "t" && id !== me.vid && near(d, 34)) pushCar(id, W.car);
    for (const [id, d] of dHelis) if (near(d, 40)) pushCar(id, W.car);
    for (const [id, d] of dCops) if (!hitDone.has(id) && near(d, 28)) { me.heat = Math.min(5, me.heat + .1); pushCar(id, W.pvp); }
    for (const [id, d] of dPeds) if (!hitDone.has(id) && near(d, 26)) { hitDone.add(id); killQ.push(id); me.cash += 30; me.heat = Math.min(5, me.heat + .5); floats.push({ x: d.x, y: d.y - 10, t: tNow, s: "+$30", c: "#7ae582" }); splats.push({ x: d.x, y: d.y, t: tNow }); }
    if (tgt && tgt.hp > 0 && near(tgt, 28)) hitTgt(W.pvp * 1.3);
    if (mis && mis.k === "truck" && mis.trk.hp > 0 && near(mis.trk, 36)) hitTruck(W.car * 1.6);
  }
  function stepRockets(dt, now) {
    for (const q of rockets) {
      if (q.done) continue;
      let adv = RK_SPEED * dt, hit = 0;
      while (adv > 0 && !hit) {
        const st = Math.min(RK_STEP, adv); adv -= st; q.x += q.dx * st; q.y += q.dy * st; q.d += st;
        hit = rocketProbe(q);
        if (!hit && q.d >= q.max) hit = 1;
      }
      if (hit) rocketBoom(q, now, hit === 2); else if (now - q.t > 3000) q.done = 1;
    }
    rockets = rockets.filter(q => !q.done);
  }
  function trace(ox, oy, ang, W, deferPedHit = false) {                                        // un tir « hitscan » : s'arrête au mur, au piéton ou à la voiture touchée
    const dx = Math.cos(ang), dy = Math.sin(ang); let bf = me.vid === HELI ? W.rng : wallEnd(ox, oy, ang, W.rng), best = null;
    for (const [id, d] of dPeds) { if (hitDone.has(id)) continue; const rx = d.x - ox, ry = d.y - oy, f = rx * dx + ry * dy; if (f > 0 && f < bf && Math.abs(-rx * dy + ry * dx) < 8) { bf = f; best = ["p", id, d]; } }
    for (const [id, d] of dCars) { if (d.m === "t" || id === me.vid) continue; const rx = d.x - ox, ry = d.y - oy, f = rx * dx + ry * dy; if (f > 0 && f - 14 < bf && Math.abs(-rx * dy + ry * dx) < 17) { bf = Math.max(6, f - 14); best = ["c", id, d]; } }
    for (const [id, d] of dCops) { if (hitDone.has(id)) continue; const rx = d.x - ox, ry = d.y - oy, f = rx * dx + ry * dy; if (f > 0 && f < bf && Math.abs(-rx * dy + ry * dx) < 8) { bf = f; best = ["k", id, d]; } }
    for (const [id, d] of dHelis) { const rx = d.x - ox, ry = d.y - oy, f = rx * dx + ry * dy; if (f > 0 && f < W.rng && Math.abs(-rx * dy + ry * dx) < 20 && (!best || f < bf)) { bf = f; best = ["h", id, d]; } }   // les hélicos volent : aucun mur ne les protège
    if (tgt && tgt.hp > 0) { const rx = tgt.x - ox, ry = tgt.y - oy, f = rx * dx + ry * dy; if (f > 0 && f < bf && Math.abs(-rx * dy + ry * dx) < 9) { bf = f; best = ["t", 0, tgt]; } }
    if (mis && mis.k === "truck" && mis.trk.hp > 0) { const q = mis.trk, rx = q.x - ox, ry = q.y - oy, f = rx * dx + ry * dy; if (f > 0 && f - 20 < bf && Math.abs(-rx * dy + ry * dx) < 18) { bf = Math.max(6, f - 20); best = ["u", 0, q]; } }
    if (best) {
      if (best[0] === "k") { me.lastCar = best[1]; me.lastCarT = tNow; me.heat = Math.min(5, me.heat + .1); const l = carQ[carQ.length - 1]; if (l && l[0] === best[1]) l[1] += W.pvp; else carQ.push([best[1], W.pvp]); if (carQ.length > 8) carQ.shift(); }
      else if (best[0] === "t") { hitTgt(W.pvp * 1.3); }
      else if (best[0] === "u") { hitTruck(W.car * 1.6); }
      else if (best[0] === "p") { const d = best[2]; if (deferPedHit) { pendingPedHits.set(best[1], { due: tNow + Math.max(260, bf / 620 * 1000), x: d.x, y: d.y }); } else { hitDone.add(best[1]); killQ.push(best[1]); me.cash += 30; me.heat = Math.min(5, me.heat + .5); floats.push({ x: d.x, y: d.y - 10, t: tNow, s: "+$30", c: "#7ae582" }); splats.push({ x: d.x, y: d.y, t: tNow }); } }
      else { me.lastCar = best[1]; me.lastCarT = tNow; const l = carQ[carQ.length - 1]; if (l && l[0] === best[1]) l[1] += W.car; else carQ.push([best[1], W.car]); if (carQ.length > 8) carQ.shift(); }
    }
    if (best || bf < W.rng) sparks.push({ x: ox + dx * bf, y: oy + dy * bf, t: tNow });
    return bf;
  }
  // --- poings 👊 : portée courte, dans un cône devant toi. Piéton = 3 coups, policier = 10 dégâts/coup, cible de mission aussi.
  const FIST = { rate: .38, rng: 30, arc: .95, dm: 10, heat: .1 }, pedPunch = new Map();
  function punch(now) {
    me.cd = me.cdMax = FIST.rate; me.flash = .16; me.fc = (me.fc + 1) % 1000; me.fw = 0; me.heat = Math.min(5, me.heat + .02);
    const dx = Math.cos(me.a), dy = Math.sin(me.a); let best = null, bd = FIST.rng;
    const cand = (k, id, d, rad) => { const rx = d.x - me.x, ry = d.y - me.y, dist = Math.hypot(rx, ry) - (rad || 0); if (dist > bd || dist < -rad - 4) return; const an = Math.atan2(ry, rx), df = Math.abs(Math.atan2(Math.sin(an - me.a), Math.cos(an - me.a))); if (df < FIST.arc || dist < 8) { bd = dist; best = [k, id, d]; } };
    for (const [id, d] of dPeds) if (!hitDone.has(id)) cand("p", id, d, 6);
    for (const [id, d] of dCops) if (!hitDone.has(id)) cand("k", id, d, 6);
    if (tgt && tgt.hp > 0) cand("t", 0, tgt, 6);
    sparks.push({ x: me.x + dx * 18, y: me.y + dy * 18, t: tNow });
    if (!best) { beep(180, .04, "sine", .03, 120); return; }
    const [k, id, d] = best; beep(110, .07, "square", .06, 40); navigator.vibrate && navigator.vibrate(25);
    if (k === "p") {
      const n = (pedPunch.get(id) || 0) + 1; pedPunch.set(id, n); if (pedPunch.size > 200) pedPunch.clear();
      floats.push({ x: d.x, y: d.y - 10, t: tNow, s: n < 3 ? "👊" : "+$15", c: n < 3 ? "#fff" : "#7ae582" });
      if (n >= 3) { pedPunch.delete(id); hitDone.add(id); killQ.push(id); me.cash += 15; me.heat = Math.min(5, me.heat + .3); splats.push({ x: d.x, y: d.y, t: tNow }); }
    } else if (k === "k") { me.lastCar = id; me.lastCarT = tNow; me.heat = Math.min(5, me.heat + FIST.heat); const l = carQ[carQ.length - 1]; if (l && l[0] === id) l[1] += FIST.dm; else carQ.push([id, FIST.dm]); if (carQ.length > 8) carQ.shift(); }
    else hitTgt(FIST.dm);
  }
  function weapons(dt, now) {
    for (const [id, hit] of pendingPedHits) if (now >= hit.due) { pendingPedHits.delete(id); if (!hitDone.has(id) && dPeds.has(id)) { hitDone.add(id); killQ.push(id); me.cash += 30; me.heat = Math.min(5, me.heat + .5); floats.push({ x: hit.x, y: hit.y - 10, t: now, s: "+$30", c: "#7ae582" }); splats.push({ x: hit.x, y: hit.y, t: now }); } }
    me.cd -= dt; me.flash -= dt; me.dmCd -= dt;
    for (const p of PICKS) {                                              // ramassage des armes
      if (Math.abs(p.x - me.x) > 24 || Math.abs(p.y - me.y) > 24 || Math.hypot(p.x - me.x, p.y - me.y) > 24) continue;
      const t = pickT.get(p.id); if (t !== undefined && now - t < 45000) continue; pickT.set(p.id, now);
      const W = WPN[p.t], had = me.ammo[p.t] > 0; me.ammo[p.t] = Math.min(W.max, me.ammo[p.t] + W.ammo); if (!had || !me.wpn) me.wpn = p.t; me.gunT = now;
      floats.push({ x: me.x, y: me.y - 22, t: now, s: `🔫 ${W.n} +${W.ammo}`, c: "#ffe14d" }); beep(880, .1, "triangle", .06);
    }
    if (me.wpn && me.ammo[me.wpn] <= 0) cycleWpn();
    const heli = me.vid === HELI;
    if ((fireKey || fireId !== null) && me.cd <= 0) {
      if (heli || (me.wpn && me.ammo[me.wpn] > 0)) {                       // en hélico : mitraillette à munitions INFINIES (uniquement là) ; à pied / en voiture : munitions normales
        const wi = heli ? 2 : me.wpn, W = WPN[wi], dx = Math.cos(me.a), dy = Math.sin(me.a), ox = me.x + dx * (me.vid ? 24 : 11), oy = me.y + dy * (me.vid ? 24 : 11);
        if (!heli) me.ammo[wi]--;
        me.cd = me.cdMax = wi === 4 ? .92 : W.rate; me.fc = (me.fc + 1) % 1000; me.fw = wi; me.flash = wi === 4 ? .18 : .07; me.heat = Math.min(5, me.heat + W.heat);
        for (let q = 0; q < W.pel; q++) {
           const ang = me.a + rr(-W.spr, W.spr);
           if (wi === 4) { rockets.push({ own: 1, x: ox, y: oy, dx: Math.cos(ang), dy: Math.sin(ang), ang, d: 0, max: W.rng, t: now, done: 0 }); continue; }   // RPG : vraie roquette qui vole
           const e = trace(ox, oy, ang, W), ex = ox + Math.cos(ang) * e, ey = oy + Math.sin(ang) * e;
           tracers.push({ x0: ox, y0: oy, x1: ex, y1: ey, t: now });
         }
        SND.shot(wi, 1); navigator.vibrate && navigator.vibrate(wi === 4 ? 34 : 12);
      } else if (!me.wpn && !me.vid) punch(now);                           // pas d'arme en main : coup de poing 👊
    }
    if (now - killAt > 150) {                                             // on annonce à l'hôte un coup à la fois (piéton abattu / voiture touchée)
      killAt = now;
      if (killQ.length) { me.hs++; me.hid = killQ.shift(); }
      if (carQ.length) { const q = carQ.shift(); me.cs = (me.cs + 1) % 1000; me.cid = q[0]; me.ca = Math.min(255, Math.round(q[1])); }
    }
  }

  // ================= BOUTIQUES =================
  const inZ = z => Math.abs(me.x - z.x) < 46 && me.y > z.y - 9 && me.y < z.y + 27;
  const shopAt = () => { if (me.dead > 0) return ""; for (const k of ["heal", "arms", "jail"]) if (inZ(ZONES[k])) return k; return ""; };
  const healPrice = () => Math.max(20, Math.ceil((100 - me.hp) * 1.2));
  function healDo() {                                                     // distributeur de soins de l'hôpital : vie à fond contre de l'argent
    if (me.hp >= 99) { toast("Tu es déjà en pleine forme"); return; }
    const p = healPrice(); if (me.cash < p) { toast(`Il te faut $${p} pour te soigner`); return; }
    me.cash -= p; me.hp = 100; me.hurt = 0; floats.push({ x: me.x, y: me.y - 22, t: tNow, s: `❤️ SOIGNÉ −$${p}`, c: "#7ae582" }); beep(660, .12, "triangle", .06); persist(true);
  }
  function buyArm(a) {
    if (a.n === 4 && (!me.rpgAmmoUnlocked || me.rpgParts.length < 3)) { toast("Le vendeur ne te connaît pas : termine d’abord les quêtes du mécano."); return; }
    const WP = WPN[a.n];
    if (me.ammo[a.n] >= WP.max) { toast("Munitions déjà au maximum"); return; }
    if (me.cash < a.p) { toast(`Il te faut $${a.p}`); return; }
    const had = me.ammo[a.n] > 0; me.cash -= a.p; me.ammo[a.n] = Math.min(WP.max, me.ammo[a.n] + WP.ammo); if (!had || !me.wpn) me.wpn = a.n; me.gunT = tNow;
    floats.push({ x: me.x, y: me.y - 22, t: tNow, s: `🔫 ${WP.n} +${WP.ammo} −$${a.p}`, c: "#ffe14d" }); beep(880, .1, "triangle", .06); persist(true);
  }
  function buyVest(t) {
    if (me.arm >= t) { toast(me.arm === t ? "Tu portes déjà ce gilet" : "Tu portes déjà un meilleur gilet"); return; }
    const v = VEST[t - 1]; if (me.cash < v.p) { toast(`Il te faut $${v.p}`); return; }
    me.cash -= v.p; me.arm = t; floats.push({ x: me.x, y: me.y - 22, t: tNow, s: `🛡️ ${v.n} −$${v.p}`, c: "#9fd0ff" }); beep(700, .1, "triangle", .06); persist(true);
  }
  const vestRows = rows => shop !== "arms" ? rows : rows.concat(VEST.map((v, k) => { const t = k + 1; return { ic: 10 + t, nm: v.n, sub: `−${Math.round(v.r * 100)}% dégâts`, l: `${rows.length + t} · ${v.n}`, r: me.arm === t ? "ÉQUIPÉ" : me.arm > t ? "—" : `${v.p}`, ok: me.arm < t && me.cash >= v.p, f: () => buyVest(t) }; }));   // gilets : en bas du menu de l'armurerie
  const shopItems = () => {
    if (shop === "arms" || shop === "bm") return vestRows((shop === "bm" ? SHOP_BM : SHOP_ARMS).map(a => { const WP = WPN[a.n], full = me.ammo[a.n] >= WP.max, locked = a.n === 4 && (!me.rpgAmmoUnlocked || me.rpgParts.length < 3); return { ic: a.n, nm: WP.n, sub: `+${WP.ammo} (${me.ammo[a.n]}/${WP.max})`, bar: me.ammo[a.n] / WP.max, l: `${a.n} · ${WP.n} +${WP.ammo}`, r: locked ? "VERROUILLÉ" : full ? "PLEIN" : `${a.p}`, ok: !locked && !full && me.cash >= a.p, f: () => buyArm(a) }; }));
    if (shop === "chest" && inn && inn.k === "house") return chestRows();
    if (shop === "jail") return jailRows();
    if (shop === "garage") {
      const hp2 = Math.ceil((100 - clamp(me.hh, 0, 100)) * 10), out = [];
      [[1, me.gcar], [2, me.gcar2]].forEach(([sl, g]) => {
        if (sl === 2 && !me.g2) return; const tg = me.g2 ? ` #${sl}` : "";
        if (!g) { out.push({ l: `AUCUNE VOITURE RANGÉE${tg}`, r: "—", ok: false, f: () => { } }); return; }
        const d = dmSum(g.d), p = d * 80;
        out.push({ l: `RÉPARER LA TÔLE${tg}`, r: d ? `$${p}` : "IMPECCABLE", ok: d > 0 && me.cash >= p, f: () => repairDo(sl) },
          { l: g.p ? `REPEINDRE${tg} (POLICE : IMPOSSIBLE)` : `REPEINDRE${tg} (${CNAME[g.c]}→${CNAME[(g.c + 1) & 7]})`, r: "$150", ok: !g.p && me.cash >= 150, f: () => paintDo(sl) });
      });
      if (me.hu) out.push({ l: `RÉPARER L'HÉLICO (COQUE ${Math.round(clamp(me.hh, 0, 100))}%)`, r: hp2 ? `$${hp2}` : "IMPECCABLE", ok: hp2 > 0 && me.cash >= hp2, f: heliRepairDo });
      return out.map((it, k) => ({ ...it, l: `${k + 1} · ${it.l}` }));
    }
    return [];
  };
  const shopPick = i => { const it = shopItems()[i]; if (it) it.f(); };
  const SH = { pw: 380, py: 80 };
  // armurerie et camion : une CARTE par arme / gilet (grande icône, nom, munitions, barre de stock, prix) · garage : liste classique
  function shopLay() {
    const n = shopItems().length, g = shop === "arms" || shop === "bm";
    if (!g) return { g, n, pw: SH.pw, ph: 84 + n * 46, px: W / 2 - SH.pw / 2 };
    const cols = Math.min(n, 3), rows = Math.ceil(n / cols), pw = Math.max(270, cols * 110 + (cols - 1) * 8 + 28);
    return { g, n, cols, rows, pw, ph: 46 + rows * 136 + 30, px: W / 2 - pw / 2 };
  }
  function shopCard(L, i) { const gw = L.cols * 110 + (L.cols - 1) * 8; return { x: L.px + (L.pw - gw) / 2 + (i % L.cols) * 118, y: SH.py + 46 + Math.floor(i / L.cols) * 136, w: 110, h: 128 }; }
  function shopHit(p) {                                                   // -1 : hors du panneau · -2 : croix · -3 : panneau (rien) · ≥0 : ligne / carte
    const L = shopLay();
    if (p.x < L.px || p.x > L.px + L.pw || p.y < SH.py || p.y > SH.py + L.ph) return -1;
    if (p.x > L.px + L.pw - 44 && p.y < SH.py + 42) return -2;
    if (L.g) { for (let i = 0; i < L.n; i++) { const c = shopCard(L, i); if (p.x >= c.x && p.x <= c.x + c.w && p.y >= c.y && p.y <= c.y + c.h) return i; } return -3; }
    for (let i = 0; i < L.n; i++) { const ry = SH.py + 46 + i * 46; if (p.y >= ry && p.y <= ry + 38) return i; }
    return -3;
  }
  function drawShop(now) {
    const items = shopItems(), L = shopLay(), pw = L.pw, py = SH.py, ph = L.ph, px = L.px, zc = shop === "bm" ? "#b07bff" : shop === "chest" ? "#7ae582" : (ZONES[shop] || ROOMS[shop]).c;
    x.fillStyle = "rgba(10,10,16,.9)"; x.fillRect(px, py, pw, ph); x.strokeStyle = zc; x.lineWidth = 3; x.strokeRect(px, py, pw, ph);
    txt(shop === "garage" ? "🔧 ATELIER DE RICO" : shop === "bm" ? "🚚 LE CAMION" : shop === "chest" ? "🧰 TON COFFRE" : shop === "jail" ? "🔓 PRISON : FAIRE ÉVADER" : "🔫 ARMURERIE", W / 2, py + 30, 20, zc); txt("✖", px + pw - 22, py + 28, 18, "#fff");
    if (L.g) {
      items.forEach((it, i) => {
        const c = shopCard(L, i), cx = c.x + c.w / 2, dim = it.ok ? "#fff" : "#8a8a95";
        x.fillStyle = it.ok ? "rgba(255,255,255,.14)" : "rgba(255,255,255,.05)"; x.fillRect(c.x, c.y, c.w, c.h); x.strokeStyle = it.ok ? zc : "#555"; x.lineWidth = 1.5; x.strokeRect(c.x, c.y, c.w, c.h);
        txt(String(i + 1), c.x + 9, c.y + 16, 12, it.ok ? zc : "#8a8a95", "left");                                                       // numéro = touche du clavier
        x.save(); x.beginPath(); x.rect(c.x + 2, c.y + 4, c.w - 4, 66); x.clip(); x.globalAlpha = it.ok ? 1 : .45; wIcon(it.ic, cx, c.y + 38, 1.7); x.restore();   // grande icône (grisée si indisponible)
        txt(it.nm, cx, c.y + 80, 11, dim); txt(it.sub, cx, c.y + 94, 10, "#b8b8c4");
        if (it.bar !== undefined) { x.fillStyle = "#000"; x.fillRect(c.x + 12, c.y + 100, c.w - 24, 6); x.fillStyle = it.bar >= 1 ? "#3ee62f" : "#ff9d1e"; x.fillRect(c.x + 13, c.y + 101, (c.w - 26) * clamp(it.bar, 0, 1), 4); }   // stock de munitions
        txt(/^\d+$/.test(it.r) ? `$${it.r}` : it.r, cx, c.y + 121, 13, it.ok ? "#ffe14d" : "#8a8a95");
      });
      txt(`$${Math.round(me.cash)}${TOUCH ? "" : " · E / ÉCHAP : FERMER"}`, W / 2, py + ph - 12, 13, "#ffe14d");
      return;
    }
    items.forEach((it, i) => {
      const ry = py + 46 + i * 46; x.fillStyle = it.ok ? "rgba(255,255,255,.14)" : "rgba(255,255,255,.05)"; x.fillRect(px + 14, ry, pw - 28, 38); x.strokeStyle = it.ok ? zc : "#555"; x.lineWidth = 1.5; x.strokeRect(px + 14, ry, pw - 28, 38);
      txt(it.l, px + 26, ry + 25, 14, it.ok ? "#fff" : "#8a8a95", "left"); txt(it.r, px + pw - 26, ry + 25, 14, it.ok ? "#ffe14d" : "#8a8a95", "right");
    });
    txt(`$${Math.round(me.cash)}${TOUCH ? "" : " · E / ÉCHAP : FERMER"}`, W / 2, py + 46 + items.length * 46 + 16, 13, "#ffe14d");
  }
  function drawZone(z) {
    const near = me.dead <= 0 && inZ(z);
    x.globalAlpha = near ? .34 : .2; x.fillStyle = z.c; x.fillRect(z.x - 46, z.y - 9, 92, 36); x.globalAlpha = 1;
    x.strokeStyle = z.c; x.lineWidth = 2; x.setLineDash([8, 6]); x.strokeRect(z.x - 46, z.y - 9, 92, 36); x.setLineDash([]);
    if (z === ZONES.heal) { x.fillStyle = "#e9edf0"; x.fillRect(z.x - 11, z.y - 8, 22, 15); x.fillStyle = "#d62828"; x.fillRect(z.x - 2, z.y - 6, 4, 11); x.fillRect(z.x - 6, z.y - 2, 12, 4); }   // le distributeur
    x.font = "700 11px 'Pricedown Bl',Pricedown,Impact,sans-serif"; x.textAlign = "center"; x.fillStyle = "#000"; x.fillText(z.l, z.x + 1, z.y + 22); x.fillStyle = "#fff"; x.fillText(z.l, z.x, z.y + 21);
  }

  // ================= INTÉRIEURS (armurerie, garage) =================
  // Scène locale : rien de neuf sur Firebase hormis un drapeau « à l'intérieur » à la fin de ta ligne p (les autres ne te voient plus dans la rue).
  // Dedans, tu es à l'abri : pas de police, pas de tirs, tes PV sont figés. Impossible d'entrer quand on est recherché.
  const ROOMS = {
    arms: { w: 400, h: 290, name: "ARMURERIE", c: "#ff5a4d", door: { x: 200, hw: 26 },
      obs: [[14, 112, 372, 24], [14, 158, 36, 84], [350, 158, 36, 84], [156, 196, 88, 24], [18, 246, 34, 28], [352, 248, 28, 28]] },
    garage: { w: 580, h: 300, name: "GARAGE", c: "#ffd23f", door: { x: 220, hw: 50 },
      obs: [[18, 56, 160, 26], [86, 92, 20, 14], [136, 166, 28, 48], [436, 166, 28, 48], [516, 60, 42, 36], [18, 236, 26, 26], [48, 246, 22, 22], [526, 206, 32, 44]] }
  };
  ROOMS.house = { w: 520, h: 340, name: "MA MAISON", c: "#7ae582", door: { x: 260, hw: 30 },
    obs: [[20, 64, 104, 64], [128, 68, 24, 26], [172, 60, 70, 30], [300, 60, 204, 30], [332, 112, 104, 60], [486, 100, 18, 92], [436, 206, 68, 46], [16, 160, 30, 84], [100, 166, 36, 72], [56, 192, 34, 32], [24, 294, 24, 24], [468, 294, 24, 24]] };
  ROOMS.jail = { w: 520, h: 340, name: "PRISON", c: "#ff6b6b", door: { x: -999, hw: 0 },          // pas de porte : on ne sort que par les moyens prévus
    obs: [[22, 66, 100, 46], [250, 68, 44, 38], [172, 200, 46, 32], [298, 56, 8, 270]] };
  function enterInn(k, hk) {
    if (me.wl > 0 || me.bust > 0) { toast("La police te colle : impossible d'entrer !"); return; }
    const R = ROOMS[k]; inn = { k, hk: hk | 0, x: R.door.x, y: R.h - 34, a: -Math.PI / 2, t0: tNow, hp: me.hp, mv: false };
    shop = ""; me.v = 0; SND.door(); beep(1180, .07, "sine", .05); setTimeout(() => beep(1480, .09, "sine", .04), 90);
  }
  function leaveInn() { if (!inn) return; inn = null; shop = ""; me.a = Math.PI / 2; me.v = 0; SND.door(); }
  function innPush(p, r) {
    const R = ROOMS[inn.k], inDoor = Math.abs(p.x - R.door.x) < R.door.hw - r;
    p.x = clamp(p.x, 16 + r, R.w - 16 - r); p.y = clamp(p.y, 60 + r, inDoor ? R.h + 2 : R.h - 14 - r);
    for (const [ox, oy, ow, oh] of R.obs) {
      const cx = clamp(p.x, ox, ox + ow), cy = clamp(p.y, oy, oy + oh), dx = p.x - cx, dy = p.y - cy, d = Math.hypot(dx, dy);
      if (d < r) {
        if (d > .001) { p.x = cx + dx / d * r; p.y = cy + dy / d * r; }
        else { const l = p.x - ox, rg = ox + ow - p.x, t = p.y - oy, b = oy + oh - p.y, m = Math.min(l, rg, t, b); if (m === l) p.x = ox - r; else if (m === rg) p.x = ox + ow + r; else if (m === t) p.y = oy - r; else p.y = oy + oh + r; }
      }
    }
  }
  function innControl(dt) {
    if (inn.k === "jail" && jailTick(dt)) return;
    const R = ROOMS[inn.k]; let ix = 0, iy = 0;
    if (stick) { const m = Math.hypot(stick.dx, stick.dy); if (m > .18) { const k = Math.min(1, (m - .18) / .7) / m; ix = stick.dx * k; iy = stick.dy * k; } }
    else { ix = (keys.has("R") ? 1 : 0) - (keys.has("L") ? 1 : 0); iy = (keys.has("D") ? 1 : 0) - (keys.has("U") ? 1 : 0); }
    const m = Math.hypot(ix, iy); inn.mv = m > .05;
    if (inn.mv) { inn.a = Math.atan2(iy, ix); const k = 105 * dt / Math.max(1, m); inn.x += ix * k; inn.y += iy * k; }
    innPush(inn, 7); me.v = 0; me.bust = 0; if (me.hp < inn.hp) me.hp = inn.hp;
    if (inn.y > R.h - 10) leaveInn();
  }
  function innSpot() {                                                    // ce que E fait ici
    if (!inn) return null; const R = ROOMS[inn.k], p = inn;
    if (Math.hypot(p.x - R.door.x, p.y - (R.h - 20)) < 46) return { k: "door", h: "E : SORTIR" };
    if (inn.k === "house") {
      if (Math.hypot(p.x - 470, p.y - 226) < 58) return { k: "chest", h: "E : OUVRIR TON COFFRE (ARGENT, ARMES, GILET)" };
      if (p.x < 100 && p.y > 150 && p.y < 262) return { k: "tv", h: tvOn ? "E : ÉTEINDRE LA TÉLÉ" : "E : ALLUMER LA TÉLÉ 📺" };
      if (p.x < 170 && p.y < 150) return { k: "bed", h: me.hsp === inn.hk ? "🛏️ POINT DE RÉAPPARITION : ICI ✔" : "E : DORMIR ICI = POINT DE RÉAPPARITION" };
      return null;
    }
    if (inn.k === "jail") {
      if (jail && p.x > 240 && p.y > 120 && p.y < 262) return { k: "guard", h: `E : CORROMPRE LE GARDIEN ($${bribeCost()})` };
      if (jail && p.x < 100 && p.y > 252) return { k: "dig", h: `E : CREUSER LE MUR (${jail.dig}/${DIG_NEED}) · RISQUE D'ÊTRE ENTENDU` };
      return null;
    }
    if (inn.k === "arms") { if (p.y > 134 && p.y < 180 && p.x > 60 && p.x < 340) return { k: "counter", h: "E : ACHETER DES ARMES" }; return null; }
    if (me.hu && Math.hypot(p.x - 240, p.y - 98) < 36) return { k: "roof", h: "E : MONTER SUR LE TOIT · SORTIR L'HÉLICO 🚁" };
    if (p.y < 130 && p.x < 200) return { k: "bench", h: "E : ATELIER DE RICO (RÉPARER / REPEINDRE)" };
    if (Math.hypot(p.x - 150, p.y - 190) < 64) return me.gcar ? { k: "take", s: 1, h: me.g2 ? "E : SORTIR TA 1RE VOITURE" : "E : SORTIR TA VOITURE" } : { k: "none", h: "EMPLACEMENT LIBRE : RANGE TA VOITURE DEPUIS LA RUE" };
    if (isOwner() && Math.hypot(p.x - 300, p.y - 190) < 64) return { k: "ghost", h: "E : SORTIR LA VOITURE FANTÔME 👻" };
    if (Math.hypot(p.x - 450, p.y - 190) < 64) return !me.g2 ? { k: "buy2", h: `E : ACHETER UN EMPLACEMENT DE PLUS ($${G2PRICE})` } : me.gcar2 ? { k: "take", s: 2, h: "E : SORTIR TA 2E VOITURE" } : { k: "none", h: "2E EMPLACEMENT LIBRE : RANGE UNE VOITURE DEPUIS LA RUE" };
    return null;
  }
  function innUse() {
    const sp = innSpot(); if (!sp) return;
    if (sp.k === "door") leaveInn();
    else if (sp.k === "chest") { shop = "chest"; beep(880, .06, "triangle", .05); }
    else if (sp.k === "bed") { if (me.hsp !== inn.hk) { me.hsp = inn.hk; persist(true); floats.push({ x: me.x, y: me.y - 22, t: tNow, s: "🛏️ POINT DE RÉAPPARITION", c: "#7ae582" }); beep(660, .1, "triangle", .06); } }
    else if (sp.k === "tv") { tvOn = !tvOn; beep(tvOn ? 560 : 300, .07, "square", .04, tvOn ? 700 : 200); }
    else if (sp.k === "guard") bribeDo();
    else if (sp.k === "dig") digDo();
    else if (sp.k === "counter") { shop = "arms"; beep(880, .06, "triangle", .05); }
    else if (sp.k === "bench") { shop = "garage"; beep(660, .06, "triangle", .05); }
    else if (sp.k === "take") { leaveInn(); garageDo(true, sp.s); }
    else if (sp.k === "buy2") buySlot2();
    else if (sp.k === "ghost") { leaveInn(); ghostTake(); }
    else if (sp.k === "roof") { leaveInn(); heliTake(); }
  }
  function buySlot2() {                                                   // 2e emplacement du garage (un emplacement de plus pour ranger une voiture, distinct du fantôme)
    if (me.g2) return;
    if (me.cash < G2PRICE) { toast(`Il te faut $${G2PRICE} pour un emplacement de plus`); return; }
    me.cash -= G2PRICE; me.g2 = 1; floats.push({ x: me.x, y: me.y - 22, t: tNow, s: `🅿️ EMPLACEMENT ACHETÉ −$${G2PRICE}`, c: "#7ae582" }); beep(660, .12, "triangle", .06); setTimeout(() => beep(880, .12, "triangle", .06), 130); persist(true);
  }
  // ================= PRISON & MAISONS =================
  // Prison : arrêté (étoiles + flic collé) = confiscation des armes/gilet, puis cellule. Peine = JAIL_BASE + JAIL_STAR par étoile.
  // Sorties : la peine finie · corrompre le gardien ($) · creuser (E répété, risque d'être entendu) · un ami libre vient au commissariat (zone PRISON) et te fait évader.
  // Rien de neuf sur Firebase : « je suis en prison pour n s » (champ 27) et « je fais évader untel » (champ 28) voyagent dans ta ligne p.
  const owns = k => ((me.hou | 0) >> k) & 1;
  const bribeCost = () => BRIBE_BASE + BRIBE_SEC * Math.ceil(jail ? jail.t : 0);
  function startJail() {
    const t = me.jT || JAIL_BASE + JAIL_STAR;
    spawnAt(SPAWN.jail); shop = ""; me.heat = 0; me.wl = 0; me.v = 0;
    jail = { t, dig: 0 }; inn = { k: "jail", hk: 0, x: 130, y: 190, a: 0, t0: tNow, hp: me.hp, mv: false };
    toast(`🔒 En cellule pour ${Math.round(t)} s : attends, corromps le gardien, creuse le mur… ou un ami peut te faire évader`); SND.door();
  }
  function jailOut(p, heat, msg) {
    jail = null; leaveInn(); spawnAt(p); me.heat = heat; me.wl = Math.min(5, Math.ceil(heat - 1e-6)); toast(msg);
    beep(660, .1, "triangle", .06); setTimeout(() => beep(880, .12, "triangle", .06), 110); persist(true);
  }
  function jailTick(dt) {                                                 // true = libéré (on a quitté la cellule)
    if (!jail) { leaveInn(); return true; }
    jail.t -= dt;
    for (const [u, p] of activeP()) if (u !== myUid && p.fu === myUid && Math.hypot(p.x - ZONES.jail.x, p.y - ZONES.jail.y) < 160) {
      jailOut(SPAWN.jail, 0, `🔓 ${(lobbyP()[u] || {}).name || "Un ami"} t'a fait évader !`); return true;
    }
    if (jail.t <= 0) { jailOut(SPAWN.jail, 0, "Tu es libéré. Fais profil bas !"); return true; }
    return false;
  }
  function bribeDo() {
    const p = bribeCost(); if (me.cash < p) { toast(`Il te faut $${p} pour corrompre le gardien`); return; }
    me.cash -= p; jailOut(SPAWN.jail, 0, `💸 Le gardien a fermé les yeux (−$${p})`);
  }
  function digDo() {
    if (!jail) return;
    if (Math.random() < DIG_RISK) { jail.t += DIG_PENALTY; jail.dig = 0; toast(`🚨 Le gardien t'a entendu ! +${DIG_PENALTY} s et tout est à refaire`); beep(120, .2, "sawtooth", .07, 60); return; }
    jail.dig++; beep(300 + jail.dig * 30, .05, "square", .04, 200);
    if (jail.dig >= DIG_NEED) jailOut([JAIL[0] * CELL + 180, JAIL[1] * CELL], ESC_HEAT, "🏃 ÉVASION ! La police te recherche");
  }
  function jailFree(u) {                                                  // ami libre : faire évader un détenu depuis la zone PRISON
    const p = pd[u]; shop = ""; if (!p || !(p.jl > 0)) { toast("Il n'est déjà plus en prison"); return; }
    me.fu = u; me.fuT = tNow + 2500; me.heat = Math.min(5, Math.max(me.heat, FREE_HEAT));
    toast("🔓 Évasion en cours… la police est alertée !"); beep(520, .1, "square", .05);
  }
  // Maisons : acheter à la porte (E), entrer, coffre (argent · armes · gilet), lit = point de réapparition quand tu es K.O.
  // Chaque joueur a ses propres maisons (la maison 3 de l'un n'est pas celle de l'autre).
  const nearHouse = () => { if (me.vid || me.dead > 0 || inn) return -1; for (let k = 0; k < HOUSES.length; k++) if (inZ(HZ[k])) return k; return -1; };
  function houseDo(k) {
    const H = HOUSES[k];
    if (owns(k)) { enterInn("house", k); return; }
    if (me.hou) { toast("Tu as déjà une maison : une seule par joueur !"); return; }
    if (me.cash < H.p) { toast(`Il te faut $${H.p} pour acheter ${H.n}`); return; }
    me.cash -= H.p; me.hou |= 1 << k; if (me.hsp < 0) me.hsp = k;
    floats.push({ x: me.x, y: me.y - 22, t: tNow, s: `🏠 ${H.n} ACHETÉE −$${H.p}`, c: "#7ae582" }); beep(660, .12, "triangle", .06); setTimeout(() => beep(880, .12, "triangle", .06), 130); persist(true);
    setTimeout(() => { if (active && me.wl === 0 && !inn && me.dead <= 0 && nearHouse() === k) enterInn("house", k); }, 450);
  }
  function spawnAtHouse(k) { spawnAt([HZ[k].x, HZ[k].y]); toast(`🏠 Tu te réveilles chez toi (${HOUSES[k].n})`); }
  const fixWpn = () => { if (me.wpn > 0 && !(me.ammo[me.wpn] > 0)) { me.wpn = 0; cycleWpn(); } };
  function chestMoney(dir, amt) {
    const b = me.hb[inn.hk];
    amt = dir > 0 ? Math.min(amt, Math.floor(me.cash)) : Math.min(amt, Math.floor(b.c)); if (amt <= 0) return;
    if (dir > 0) { me.cash -= amt; b.c += amt; } else { b.c -= amt; me.cash += amt; }
    floats.push({ x: me.x, y: me.y - 22, t: tNow, s: `${dir > 0 ? "DÉPOSÉ" : "RETIRÉ"} $${amt}`, c: "#ffd23f" }); beep(dir > 0 ? 560 : 740, .08, "triangle", .05); persist(true);
  }
  function chestGear(dir) {
    const b = me.hb[inn.hk]; let n = 0;
    if (dir > 0) {
      for (let w = 1; w <= 4; w++) if (me.ammo[w] > 0) { b.a[w - 1] += me.ammo[w]; me.ammo[w] = 0; n++; }
      if (me.arm > 0) { if (!b.v) { b.v = me.arm; me.arm = 0; n++; } else toast("Le coffre contient déjà un gilet"); }
      fixWpn();
    } else {
      for (let w = 1; w <= 4; w++) { const t = Math.min(b.a[w - 1], WPN[w].max - me.ammo[w]); if (t > 0) { me.ammo[w] += t; b.a[w - 1] -= t; n++; } }
      if (b.v > me.arm) { const old = me.arm; me.arm = b.v; b.v = old; n++; }
      if (!me.wpn) cycleWpn();
    }
    if (!n) { toast(dir > 0 ? "Rien à ranger" : "Rien à reprendre (ou tes munitions sont pleines)"); return; }
    floats.push({ x: me.x, y: me.y - 22, t: tNow, s: dir > 0 ? "🧰 RANGÉ DANS LE COFFRE" : "🧰 REPRIS DU COFFRE", c: "#9fd0ff" }); beep(dir > 0 ? 560 : 740, .08, "triangle", .05); persist(true);
  }
  function chestRows() {
    const b = me.hb[inn.hk], gw = (a, v) => { const n = a.filter(q => q > 0).length; return `${n} arme${n > 1 ? "s" : ""}${v ? " + gilet" : ""}`; };
    const cash = Math.floor(me.cash), inC = Math.floor(b.c), mine = me.ammo.slice(1).some(q => q > 0) || me.arm > 0, held = b.a.some(q => q > 0) || b.v > 0;
    return [
      { l: "DÉPOSER $500", r: `COFFRE $${inC}`, ok: cash >= 1, f: () => chestMoney(1, 500) },
      { l: "DÉPOSER TOUT L'ARGENT", r: `$${cash}`, ok: cash >= 1, f: () => chestMoney(1, Infinity) },
      { l: "RETIRER $500", r: `COFFRE $${inC}`, ok: inC >= 1, f: () => chestMoney(-1, 500) },
      { l: "RETIRER TOUT L'ARGENT", r: `$${inC}`, ok: inC >= 1, f: () => chestMoney(-1, Infinity) },
      { l: "RANGER ARMES + GILET", r: gw(me.ammo.slice(1), me.arm), ok: mine, f: () => chestGear(1) },
      { l: "REPRENDRE ARMES + GILET", r: gw(b.a, b.v), ok: held, f: () => chestGear(-1) },
      { l: "POINT DE RÉAPPARITION ICI", r: me.hsp === inn.hk ? "✔ ICI" : "DÉFINIR", ok: me.hsp !== inn.hk, f: () => { me.hsp = inn.hk; persist(true); toast("🛏️ Point de réapparition défini"); } }
    ].map((it, k) => ({ ...it, l: `${k + 1} · ${it.l}` }));
  }
  function jailRows() {
    const L = activeP().filter(([u, p]) => u !== myUid && p.jl > 0);
    if (!L.length) return [{ l: "1 · PERSONNE EN PRISON POUR LE MOMENT", r: "—", ok: false, f: () => { } }];
    return L.slice(0, 8).map(([u, p], k) => ({ l: `${k + 1} · FAIRE ÉVADER ${((lobbyP()[u] || {}).name || "?").slice(0, 12).toUpperCase()}`, r: `${p.jl} s`, ok: true, f: () => jailFree(u) }));
  }
  function drawHouseZone(k) { const o = owns(k); drawZone({ x: HZ[k].x, y: HZ[k].y, c: o ? "#7ae582" : me.hou ? "#8a8f9a" : "#ffd23f", l: o ? `MAISON ${k + 1}` : me.hou ? "—" : `$${HOUSES[k].p}` }); }
  function drawHouseRoom(now, labels) {
    const R = ROOMS.house, w = R.w, h = R.h, H = HOUSES[inn.hk | 0], dx = R.door.x, hw = R.door.hw, sp = innSpot(), nc = !!(sp && sp.k === "chest"), spk = sp ? sp.k : "";
    const wd = H.r[0], wl = H.r[1], wk = H.r[2], ws = (Math.floor(now / 600) % 3);
    // sol : parquet · carrelage damier dans le coin cuisine
    for (let y = 58, n = 0; y < h; y += 14, n++) { fr(0, y, w, 14, n & 1 ? "#8d6643" : "#835d3d"); fr(0, y + 13, w, 1, "rgba(0,0,0,.28)"); for (let k = 0; k < 6; k++) fr((n * 97 + k * 89) % (w - 8), y, 1, 13, "rgba(0,0,0,.2)"); }
    for (let a = 0; a < 13; a++) for (let b = 0; b < 8; b++) fr(296 + a * 16, 58 + b * 16, 16, 16, (a + b) & 1 ? "#e8e4d8" : "#cfcabb");
    fr(296, 186, 208, 3, "rgba(0,0,0,.35)");
    // mur du fond : papier peint rayé, plinthe, fenêtres avec rideaux, tableau, horloge
    fr(0, 0, w, 58, H.w); for (let tx = 0; tx < w; tx += 16) fr(tx, 0, 1, 58, "rgba(0,0,0,.07)"); for (let tx = 8; tx < w; tx += 32) fr(tx, 0, 8, 44, "rgba(255,255,255,.12)");
    fr(0, 44, w, 3, wl); fr(0, 47, w, 7, wd); fr(0, 54, w, 4, "rgba(0,0,0,.38)");
    [58, 352].forEach(wx => {
      fr(wx - 2, 6, 68, 38, "#6b4a2b"); fr(wx + 2, 10, 60, 30, "#9fd3ee"); fr(wx + 2, 10, 60, 10, "#c5e6f6"); fr(wx + 30, 10, 3, 30, "#6b4a2b"); fr(wx + 2, 24, 60, 3, "#6b4a2b"); fr(wx - 4, 42, 72, 4, "#caa77a");
      fr(wx - 12, 5, 14, 40, wd); fr(wx + 66, 5, 14, 40, wd); for (let k = 0; k < 3; k++) { fr(wx - 10 + k * 4, 5, 1, 40, "rgba(0,0,0,.22)"); fr(wx + 68 + k * 4, 5, 1, 40, "rgba(0,0,0,.22)"); } fr(wx - 14, 3, 96, 3, "#3a2a1a");
    });
    fr(182, 10, 44, 30, "#c9a227"); fr(185, 13, 38, 24, "#a6d8ee"); fr(185, 26, 38, 11, "#58a34d"); x.fillStyle = "#e8e8f0"; x.beginPath(); x.moveTo(185, 26); x.lineTo(199, 15); x.lineTo(212, 26); x.fill(); fr(205, 15, 5, 5, "#ffe14d");   // tableau : montagne et soleil
    { const d = new Date(), ma = d.getMinutes() / 60 * 6.283 - 1.5708, ha = (d.getHours() % 12 + d.getMinutes() / 60) / 12 * 6.283 - 1.5708;
      x.fillStyle = "#3a2a1a"; x.beginPath(); x.arc(272, 24, 14, 0, 7); x.fill(); x.fillStyle = "#f4f0e4"; x.beginPath(); x.arc(272, 24, 12, 0, 7); x.fill();
      x.strokeStyle = "#222"; x.lineWidth = 1.5; x.beginPath(); x.moveTo(272, 24); x.lineTo(272 + Math.cos(ma) * 10, 24 + Math.sin(ma) * 10); x.stroke(); x.lineWidth = 2; x.beginPath(); x.moveTo(272, 24); x.lineTo(272 + Math.cos(ha) * 6, 24 + Math.sin(ha) * 6); x.stroke(); }
    // murs latéraux et bas (avec la porte)
    fr(0, 56, 16, h - 56, "#6e5a44"); fr(w - 16, 56, 16, h - 56, "#6e5a44"); fr(0, h - 14, dx - hw, 14, "#6e5a44"); fr(dx + hw, h - 14, w - dx - hw, 14, "#6e5a44");
    fr(16, 56, 2, h - 70, "rgba(0,0,0,.3)"); fr(w - 18, 56, 2, h - 70, "rgba(0,0,0,.3)");
    fr(dx - hw, h - 40, hw * 2, 26, "#7a2626"); fr(dx - hw, h - 40, hw * 2, 2, "#c9a227"); fr(dx - hw, h - 16, hw * 2, 2, "#c9a227");   // paillasson
    // tapis rond au centre
    x.fillStyle = "rgba(0,0,0,.2)"; x.beginPath(); x.ellipse(262, 252, 74, 34, 0, 0, 7); x.fill(); x.fillStyle = wl; x.beginPath(); x.ellipse(260, 250, 72, 32, 0, 0, 7); x.fill(); x.fillStyle = "#f1e8d2"; x.beginPath(); x.ellipse(260, 250, 60, 25, 0, 0, 7); x.fill(); x.strokeStyle = wd; x.lineWidth = 2; x.beginPath(); x.ellipse(260, 250, 48, 18, 0, 0, 7); x.stroke();
    // coin salon : tapis, télé sur meuble, canapé, table basse
    fr(48, 152, 120, 112, "#e3d8bf"); fr(48, 152, 120, 3, wd); fr(48, 261, 120, 3, wd); fr(48, 152, 3, 112, wd); fr(165, 152, 3, 112, wd); fr(56, 160, 104, 96, "rgba(0,0,0,.05)");
    fr(16, 160, 30, 84, "#3a2a1a"); fr(16, 160, 30, 3, "#5a3d22"); fr(18, 172, 10, 60, "#0b0b0f");
    if (tvOn) { const cs = ["#3b6fe0", "#e0a43b", "#3bd0a0"]; fr(19, 174, 8, 56, cs[ws]); fr(19, 174 + 14 * ((Math.floor(now / 300)) % 4), 8, 10, cs[(ws + 1) % 3]); pool(80, 202, 90, "rgba(120,160,255,.22)"); }
    else fr(19, 174, 8, 56, "#16181d");
    fr(32, 192, 8, 20, "#222"); fr(36, 200, 6, 4, "#7a7f8a");
    fr(100, 166, 36, 72, shade(wd, .85)); fr(126, 166, 10, 72, shade(wd, .6)); fr(102, 174, 24, 28, wd); fr(102, 204, 24, 28, wd); fr(102, 174, 24, 3, wl); fr(102, 204, 24, 3, wl); fr(100, 166, 36, 8, shade(wd, .7)); fr(100, 230, 36, 8, shade(wd, .7));
    fr(56, 192, 34, 32, "#4a3320"); fr(58, 194, 30, 28, "#8a5f2b"); fr(62, 198, 14, 10, "#e8e8ee"); fr(78, 210, 6, 6, "#fff"); fr(79, 211, 4, 4, "#6b3a1e");
    // chambre : lit, table de chevet avec lampe, armoire
    fr(20, 64, 104, 64, "#3a2a1a"); fr(20, 64, 104, 8, "#5a3d22"); fr(24, 72, 96, 52, "#eceef3"); fr(30, 76, 32, 18, "#fff"); fr(68, 76, 32, 18, "#fff"); fr(30, 92, 32, 2, "rgba(0,0,0,.12)"); fr(68, 92, 32, 2, "rgba(0,0,0,.12)");
    fr(24, 98, 96, 26, wd); fr(24, 98, 96, 4, wl); for (let k = 0; k < 6; k++) fr(30 + k * 16, 104, 8, 20, "rgba(255,255,255,.12)"); fr(24, 120, 96, 4, "rgba(0,0,0,.25)");
    fr(128, 68, 24, 26, "#6b4a2b"); fr(128, 68, 24, 3, "#8a5f2b"); x.fillStyle = "#f4d98a"; x.beginPath(); x.arc(140, 80, 8, 0, 7); x.fill(); x.fillStyle = "#fff6c8"; x.beginPath(); x.arc(140, 80, 4, 0, 7); x.fill();
    fr(172, 60, 70, 30, "#5a3d22"); fr(174, 62, 32, 26, "#7a5530"); fr(208, 62, 32, 26, "#7a5530"); fr(204, 62, 4, 26, "#3a2a1a"); fr(200, 72, 3, 8, "#c9a227"); fr(209, 72, 3, 8, "#c9a227");
    // cuisine : plan de travail, évier, cuisinière, frigo · table à manger avec 4 chaises
    fr(300, 60, 204, 30, "#6b4a2b"); fr(300, 60, 204, 24, "#d9d6cf"); fr(300, 84, 204, 6, "#4a3320");
    fr(312, 64, 40, 18, "#9aa8b5"); fr(316, 67, 32, 12, "#cfd9e2"); fr(330, 62, 5, 6, "#555");
    fr(366, 64, 40, 18, "#2a2a30"); x.strokeStyle = "#777"; x.lineWidth = 1.5; [[376, 70], [396, 70], [376, 78], [396, 78]].forEach(([bx, by]) => { x.beginPath(); x.arc(bx, by, 4, 0, 7); x.stroke(); });
    fr(416, 66, 22, 14, "#b3261e"); fr(418, 62, 18, 4, "#8a1b14");
    fr(462, 58, 42, 38, "#e9eef2"); fr(462, 58, 42, 3, "#fff"); fr(462, 76, 42, 2, "#9aa4ad"); fr(498, 64, 3, 10, "#8a949d"); fr(498, 82, 3, 10, "#8a949d");
    [[346, 114], [398, 114], [346, 160], [398, 160]].forEach(([cx2, cy2]) => { fr(cx2 - 8, cy2, 20, 12, "#8a5f2b"); fr(cx2 - 8, cy2, 20, 3, "#a97a3d"); });
    fr(338, 124, 92, 38, "#4a3320"); fr(340, 126, 88, 34, "#9a6a35"); fr(340, 126, 88, 3, "#b5813f"); fr(346, 134, 76, 18, wd); fr(346, 134, 76, 2, wl);
    fr(380, 138, 8, 10, "#e8e8ee"); fr(382, 130, 4, 8, "#3f9a38"); x.fillStyle = "#ff6b6b"; x.beginPath(); x.arc(384, 130, 3, 0, 7); x.fill(); fr(356, 140, 12, 8, "#fff"); fr(402, 140, 12, 8, "#fff");
    // bibliothèque, coffre, plantes
    fr(486, 100, 18, 92, "#5a3d22"); for (let k = 0; k < 7; k++) { fr(488, 102 + k * 13, 14, 11, "#2b1c10"); for (let b = 0; b < 4; b++) fr(488 + b * 3.5, 103 + k * 13, 3, 9, ["#c0392b", "#2e86c1", "#27ae60", "#f1c40f", "#8e44ad", "#e67e22"][(k * 3 + b * 5) % 6]); }
    fr(436, 226, 68, 26, "#6b4a22"); fr(436, 206, 68, 22, "#8a5f2b"); fr(436, 206, 68, 4, "#a97a3d"); fr(454, 206, 6, 46, "#c9a227"); fr(480, 206, 6, 46, "#c9a227"); fr(466, 220, 12, 12, "#ffd23f"); fr(470, 223, 4, 6, "#7a5a10"); fr(436, 250, 68, 2, "rgba(0,0,0,.3)");
    if (nc) pool(470, 228, 80, "rgba(255,215,80,.3)");
    [[24, 294], [468, 294]].forEach(([px2, py2]) => { fr(px2 + 4, py2 + 12, 16, 12, "#a0522d"); fr(px2 + 4, py2 + 12, 16, 3, "#c0703f"); [[12, 8, 9], [5, 12, 7], [19, 12, 7], [12, 3, 6]].forEach(([lx, ly, r2]) => { x.fillStyle = "#2f7a28"; x.beginPath(); x.arc(px2 + lx, py2 + ly, r2, 0, 7); x.fill(); }); x.fillStyle = "#43963a"; x.beginPath(); x.arc(px2 + 10, py2 + 6, 5, 0, 7); x.fill(); });
    labels.push(["COFFRE", 470, 268, nc ? "#ffe14d" : "#fff", 10], ["LIT", 72, 142, me.hsp === inn.hk ? "#7ae582" : (spk === "bed" ? "#ffe14d" : "#fff"), 10], ["TÉLÉ", 31, 254, spk === "tv" ? "#ffe14d" : "#fff", 10], ["SORTIE", dx, h - 24, "#fff", 10]);
    pool(72, 96, 80, "rgba(255,225,160," + (.13 + .02 * Math.sin(now / 700)) + ")"); pool(92, 64, 90, "rgba(190,225,255,.14)"); pool(386, 64, 90, "rgba(190,225,255,.14)"); pool(260, 150, 150, "rgba(255,236,200,.07)"); pool(dx, h - 10, 70, "rgba(190,225,255,.2)");
    // Finition premium : moulures, cadres, éclairage chaud et petits détails de vie (décor uniquement).
    x.save();
    fr(16, 56, w - 32, 3, "rgba(255,238,205,.55)"); fr(16, h - 20, w - 32, 2, "rgba(255,238,205,.18)");
    // crédence carrelée et hotte de cuisine
    for (let yy = 94; yy < 112; yy += 9) for (let xx = 302; xx < 502; xx += 18) { fr(xx, yy, 16, 7, (xx + yy) % 3 ? "#d7d1c4" : "#b8c8c8"); fr(xx, yy + 6, 16, 1, "rgba(70,80,80,.22)"); }
    fr(406, 58, 28, 5, "#777d83"); fr(412, 54, 16, 5, "#aab0b5"); fr(416, 48, 8, 7, "#777d83");
    // coussins du canapé, couture et pieds
    fr(104, 236, 7, 5, "#b9d3d0"); fr(124, 236, 7, 5, "#d7b78b");
    fr(104, 244, 5, 3, "#6b4a2b"); fr(128, 244, 5, 3, "#6b4a2b");
    // table basse avec magazine et tasse
    fr(68, 210, 16, 8, "#e8dfc8"); fr(70, 211, 12, 5, "#4e83a0"); fr(142, 208, 5, 6, "#f1eee5"); fr(143, 207, 3, 2, "#c9a227");
    // cadres et petites décorations murales
    fr(238, 8, 30, 30, "#76502d"); fr(241, 11, 24, 24, "#e8d8b8"); fr(244, 14, 18, 18, "#9bc5d6");
    x.fillStyle = "#4b8b52"; x.beginPath(); x.moveTo(244, 29); x.lineTo(253, 18); x.lineTo(262, 29); x.fill();
    fr(250, 16, 2, 7, "#f5d36c");
    // plantes en pot et ombres douces
    [[178,286],[490,286]].forEach(([px,py])=>{ x.fillStyle="rgba(0,0,0,.2)"; x.beginPath(); x.ellipse(px+10,py+15,13,4,0,0,7); x.fill(); fr(px+3,py+8,14,10,"#a85f38"); fr(px+2,py+7,16,3,"#d28a55"); for(let q=0;q<5;q++){x.fillStyle=["#397d43","#4d9a55","#2d6e3b"][q%3];x.beginPath();x.ellipse(px+9+Math.sin(q*2)*6,py+q*2,4,8,q*.55,0,7);x.fill();}});
    // tapis : motif central et petits points dorés
    x.strokeStyle="rgba(122,70,42,.45)";x.lineWidth=1;x.beginPath();x.ellipse(260,250,54,20,0,0,7);x.stroke();
    for(let q=0;q<8;q++){x.fillStyle="#c49a57";x.beginPath();x.arc(260+Math.cos(q*Math.PI/4)*48,250+Math.sin(q*Math.PI/4)*15,1.5,0,7);x.fill();}
    // éclairage plafond chaleureux et halo du salon
    pool(184, 62, 72, "rgba(255,224,160,.12)"); pool(390, 148, 92, "rgba(255,244,210,.10)");
    x.restore();
  }
  function drawJailRoom(now, labels) {
    const R = ROOMS.jail, w = R.w, h = R.h, sp = innSpot(), dg = jail ? jail.dig : 0, BX = 298, spk = sp ? sp.k : "", fl = .85 + .15 * Math.sin(now / 90) * Math.sin(now / 370 + 1);
    // sol : dalles de béton fissurées (cellule) · lino gris (couloir du gardien) avec ligne de sécurité
    for (let a = 0; a < 15; a++) for (let b = 0; b < 14; b++) fr(a * 20, 56 + b * 20, 20, 20, (a + b) & 1 ? "#4a4d55" : "#43464e");
    for (let a = 0; a < 11; a++) for (let b = 0; b < 14; b++) fr(BX + 8 + a * 20, 56 + b * 20, 20, 20, (a + b) & 1 ? "#6d727c" : "#656a74");
    for (let n = 0; n < 16; n++) fr(10 + hs(n, 1) % (BX - 40), 70 + hs(n, 2) % (h - 110), 6 + hs(n, 3) % 16, 1.5, "rgba(0,0,0,.28)");
    x.fillStyle = "rgba(20,40,60,.35)"; x.beginPath(); x.ellipse(262, 112, 16, 7, 0, 0, 7); x.fill();                  // flaque près des toilettes
    x.fillStyle = "#2a2c33"; x.beginPath(); x.arc(150, 296, 8, 0, 7); x.fill(); x.strokeStyle = "#5a5e68"; x.lineWidth = 1; for (let k = -4; k <= 4; k += 4) { x.beginPath(); x.moveTo(150 + k, 289); x.lineTo(150 + k, 303); x.stroke(); }   // bonde
    fr(BX + 26, 58, 3, h - 72, "#c9a227");
    // mur du fond : briques, fenêtre à barreaux avec lune, traits de jours comptés, casiers + clés + affiches côté gardien
    fr(0, 0, w, 58, "#2c2e36"); for (let ty = 0; ty < 58; ty += 10) for (let tx = ((ty / 10) & 1) * 12; tx < w; tx += 24) fr(tx, ty, 22, 8, "#383b45");
    fr(150, 8, 58, 36, "#1a1b20"); fr(154, 12, 50, 28, "#1b2a4a"); x.fillStyle = "#ecebc8"; x.beginPath(); x.arc(190, 24, 6, 0, 7); x.fill(); x.fillStyle = "#1b2a4a"; x.beginPath(); x.arc(192, 22, 5, 0, 7); x.fill();
    for (let k = 0; k < 5; k++) fr(160 + k * 9, 12, 3, 28, "#8c93a2"); fr(154, 24, 50, 2, "#8c93a2");
    x.strokeStyle = "#b9bdc6"; x.lineWidth = 1.5; x.beginPath(); for (let g = 0; g < 3; g++) { for (let k = 0; k < 4; k++) { x.moveTo(34 + g * 24 + k * 4, 16); x.lineTo(34 + g * 24 + k * 4, 34); } x.moveTo(32 + g * 24, 32); x.lineTo(50 + g * 24, 18); } x.stroke();
    fr(322, 10, 56, 32, "#3a2a1a"); fr(324, 12, 52, 28, "#4a3623"); for (let k = 0; k < 6; k++) { fr(330 + k * 8, 18, 3, 3, "#ffd23f"); fr(330 + k * 8, 20, 1, 8, "#ffd23f"); fr(330 + k * 8, 30, 3, 3, "#c9a227"); }
    fr(396, 8, 42, 34, "#e8e4d0"); for (let k = 0; k < 5; k++) fr(402, 14 + k * 6, 30, 2, "#9a9684"); fr(402, 10, 30, 3, "#b3261e");
    fr(450, 8, 34, 38, "#d9cfa8"); x.fillStyle = "#8a7a5a"; x.beginPath(); x.arc(467, 26, 8, 0, 7); x.fill(); fr(458, 36, 18, 6, "#8a7a5a"); fr(454, 11, 26, 3, "#b3261e");
    fr(0, 52, w, 6, "rgba(0,0,0,.45)"); fr(0, 56, 16, h - 56, "#1f2026"); fr(w - 16, 56, 16, h - 56, "#1f2026"); fr(0, h - 14, w, 14, "#1f2026");
    // faisceau de lune sur le sol de la cellule
    x.fillStyle = "rgba(190,205,255," + (.07 + .01 * Math.sin(now / 900)) + ")"; x.beginPath(); x.moveTo(154, 58); x.lineTo(204, 58); x.lineTo(248, 196); x.lineTo(178, 196); x.closePath(); x.fill();
    // cellule : lit superposé, toilettes + lavabo, petite table en fer
    fr(22, 66, 100, 46, "#2f3138"); fr(26, 70, 92, 18, "#9aa3b2"); fr(26, 90, 92, 18, "#b0b8c5"); fr(26, 70, 22, 18, "#e8e8ee"); fr(26, 90, 22, 18, "#e8e8ee"); fr(50, 72, 66, 14, "#6b5a3a"); fr(50, 92, 66, 14, "#7d6a45"); fr(112, 66, 6, 46, "#3a3d46"); for (let k = 0; k < 4; k++) fr(112, 70 + k * 10, 6, 2, "#8c93a2");
    fr(252, 70, 16, 12, "#cfd5da"); fr(250, 82, 20, 20, "#e6eaee"); x.fillStyle = "#9aa6b0"; x.beginPath(); x.ellipse(260, 92, 6, 7, 0, 0, 7); x.fill(); fr(274, 72, 18, 16, "#cfd5da"); fr(277, 75, 12, 10, "#a9b8c4"); fr(281, 70, 4, 5, "#555");
    fr(172, 200, 46, 28, "#7a6a50"); fr(172, 200, 46, 3, "#9a8a6a"); fr(174, 228, 4, 4, "#3a3d46"); fr(212, 228, 4, 4, "#3a3d46"); fr(180, 208, 8, 8, "#e8e8ee"); fr(200, 206, 10, 10, "#5a6a7a"); fr(202, 208, 6, 6, "#c9d3dd");
    // barreaux + porte de cellule avec cadenas
    fr(BX - 1, 56, 10, h - 70, "#2b2d34"); for (let by = 58; by < h - 14; by += 10) { fr(BX + 1, by, 6, 7, "#9097a6"); fr(BX + 1, by, 6, 1, "#d6dbe8"); fr(BX + 1, by + 6, 6, 1, "#4b5060"); }
    fr(BX - 4, 198, 16, 40, "#3d4049"); fr(BX - 4, 198, 16, 3, "#6a6e7a"); fr(BX - 4, 235, 16, 3, "#6a6e7a"); fr(BX, 214, 8, 8, "#c9a227"); fr(BX + 2, 210, 4, 5, "#8a6f18"); fr(BX - 6, 226, 4, 6, "#1b1c20");
    // côté gardien : bureau avec 2 écrans, clavier, tasse · casiers · porte blindée SORTIE
    fr(350, 200, 112, 36, "#5a3d22"); fr(350, 200, 112, 28, "#7d5a36"); fr(350, 226, 112, 3, "#3a2a1a");
    fr(366, 204, 28, 18, "#111"); fr(398, 204, 28, 18, "#111"); const gl = .55 + .25 * Math.sin(now / 250); x.globalAlpha = gl; fr(368, 206, 24, 14, "#2fd36a"); fr(400, 206, 24, 14, "#2fd36a"); x.globalAlpha = 1; fr(372, 211, 6, 6, "#0b3a1c"); fr(408, 209, 8, 8, "#0b3a1c");
    fr(372, 226, 40, 6, "#2a2a30"); fr(432, 210, 9, 9, "#fff"); fr(434, 212, 5, 5, "#6b3a1e"); fr(444, 208, 12, 10, "#2a2a30");
    fr(480, 70, 24, 112, "#5d6b7a"); fr(480, 70, 24, 3, "#8896a6"); for (let k = 0; k < 3; k++) { fr(482, 76 + k * 36, 20, 32, "#6e7d8d"); for (let v = 0; v < 4; v++) fr(485, 80 + k * 36 + v * 4, 14, 1.5, "#3a4450"); fr(497, 92 + k * 36, 3, 6, "#c9a227"); }
    fr(436, h - 20, 54, 6, "#2a2f36"); fr(440, h - 34, 46, 20, "#4a525c"); fr(444, h - 30, 38, 12, "#2f353d"); fr(446, h - 28, 34, 8, "#7fc4d9"); x.fillStyle = Math.floor(now / 500) % 2 ? "#ff3b30" : "#7a1a16"; x.beginPath(); x.arc(463, h - 40, 3, 0, 7); x.fill();
    // gardien en patrouille devant les barreaux
    { const gy = 168 + 26 * Math.sin(now / 1900); drawWalker(410, gy, Math.PI, "#1c2f6b", "#e0ac69", now / 110, 0, false, true); }
    // trou creusé dans le coin du mur fragile
    fr(18, 282, 70, 40, "#5a4a3a"); for (let r = 0; r < 4; r++) for (let c2 = 0; c2 < 4; c2++) fr(20 + c2 * 16 + (r & 1) * 6, 284 + r * 9, 13, 7, "#6d5b49");
    if (dg > 0) { fr(26, 292, 4 + dg * 5, 22, "#0c0a08"); x.strokeStyle = "#0c0a08"; x.lineWidth = 1; x.beginPath(); for (let k = 0; k < dg; k++) { x.moveTo(24 + k * 6, 286); x.lineTo(30 + k * 6, 298); } x.stroke(); for (let k = 0; k < Math.min(dg, 6); k++) fr(22 + (k * 23) % 60, 318, 4, 3, "#6d5b49"); }
    labels.push(["CELLULE", 150, 104, "#c9ced8", 10], ["TOILETTES", 270, 120, "#9aa3b2", 9], ["GARDIEN", 410, 140 + 26 * Math.sin(now / 1900), spk === "guard" ? "#ffe14d" : "#9fb4ff", 10], ["MUR FRAGILE", 52, 274, spk === "dig" ? "#ffe14d" : "#c9ced8", 10], ["SORTIE", 463, h - 46, "#9fe6a8", 9]);
    pool(150, 190, 160, "rgba(255,240,200," + (.1 * fl) + ")"); pool(410, 170, 110, "rgba(200,220,255,.12)"); pool(463, h - 30, 40, "rgba(140,230,255,.12)");
    if (dg > 0 && Math.floor(now / 400) % 2) pool(60, 300, 70, "rgba(255,60,50,.12)");
    // Finition prison : ambiance froide, signalétique, éclairage de sécurité et détails de cellule.
    x.save();
    // bandes de sécurité au seuil du couloir du gardien
    for(let q=0;q<10;q++){fr(BX+18+q*18,h-20,10,5,q&1?"#d2a83b":"#24262c");}
    fr(18, 54, w-36, 2, "rgba(190,200,220,.22)");
    // tuyaux et conduites apparentes sur le mur latéral
    fr(506, 64, 5, 214, "#343943"); fr(507, 64, 2, 214, "#737d8d");
    [82,146,214,276].forEach(py=>{fr(502,py,12,4,"#777f8d");fr(502,py+4,12,2,"#252932");});
    // affiche réglementaire et panneau d'identification de la cellule
    fr(218, 12, 54, 30, "#252a34"); fr(220, 14, 50, 26, "#c9c4ad"); fr(224, 18, 42, 3, "#8d302d");
    for(let q=0;q<3;q++)fr(224,24+q*5, q===1?28:38, 1.5, "#77786f");
    fr(22, 118, 82, 24, "#343a45"); fr(24, 120, 78, 20, "#20252e"); fr(27, 123, 72, 2, "#aab4c3");
    // éclairage de sécurité rouge qui pulse au-dessus de la porte blindée
    const alarm=.45+.45*(.5+.5*Math.sin(now/180));
    x.globalAlpha=alarm; pool(463, h-40, 52, "rgba(255,48,38,.3)"); x.globalAlpha=1;
    fr(448, 58, 32, 4, "#242831"); fr(452, 62, 24, 3, "#59616e");
    // ombres des barreaux projetées sur le sol de la cellule
    x.strokeStyle="rgba(8,10,16,.2)";x.lineWidth=2;x.beginPath();
    for(let q=0;q<7;q++){x.moveTo(20+q*15,116);x.lineTo(34+q*15,190);}x.stroke();
    // traces d'usure et petits rivets métalliques
    for(let q=0;q<12;q++){const px=BX+14+(q*29)%180,py=70+(q*47)%220;fr(px,py,2,2,"rgba(210,215,225,.22)");}
    x.restore();
  }
  function repairDo(sl) {
    const g = sl === 2 ? me.gcar2 : me.gcar; if (!g) { toast("Aucune voiture rangée"); return; }
    const d = dmSum(g.d), p = d * 80; if (!d) { toast("Ta voiture est déjà impeccable"); return; }
    if (me.cash < p) { toast(`Il te faut $${p}`); return; }
    me.cash -= p; g.d = 0; floats.push({ x: me.x, y: me.y - 22, t: tNow, s: `🔧 RÉPARÉE −$${p}`, c: "#7ae582" }); beep(660, .12, "triangle", .06); persist(true);
  }
  function heliRepairDo() {
    const p = Math.ceil((100 - clamp(me.hh, 0, 100)) * 10); if (!p) { toast("Ton hélico est déjà impeccable"); return; }
    if (me.cash < p) { toast(`Il te faut $${p}`); return; }
    me.cash -= p; me.hh = 100; floats.push({ x: me.x, y: me.y - 22, t: tNow, s: `🔧 HÉLICO RÉPARÉ −$${p}`, c: "#7ae582" }); beep(720, .1, "triangle", .06); persist(true);
  }
  function paintDo(sl) {
    const g = sl === 2 ? me.gcar2 : me.gcar; if (!g) { toast("Aucune voiture rangée"); return; }
    if (g.p) { toast("Impossible de repeindre une voiture de police"); return; }
    if (me.cash < 150) { toast("Il te faut $150"); return; }
    me.cash -= 150; g.c = (g.c + 1) & 7; floats.push({ x: me.x, y: me.y - 22, t: tNow, s: `🎨 ${CNAME[g.c].toUpperCase()} −$150`, c: "#ffd23f" }); beep(740, .1, "triangle", .06); persist(true);
  }
  const fr = (a, b, c, d, cl) => { x.fillStyle = cl; x.fillRect(a, b, c, d); };
  function pool(cx, cy, r, c0) {                                          // flaque de lumière
    const g = x.createRadialGradient(cx, cy, 2, cx, cy, r); g.addColorStop(0, c0); g.addColorStop(1, "rgba(255,255,255,0)");
    x.save(); x.globalCompositeOperation = "lighter"; x.fillStyle = g; x.fillRect(cx - r, cy - r, r * 2, r * 2); x.restore();
  }
  function wIcon(n, px, py, s) {
    x.save(); x.translate(px, py); x.scale(s, s);
    if (n === 1) { fr(-8, -3, 16, 5, "#15151a"); fr(-8, 2, 5, 7, "#15151a"); fr(-6, -3, 10, 2, "#3a3a44"); }
    else if (n === 2) { fr(-13, -3, 26, 5, "#15151a"); fr(-2, 2, 4, 9, "#15151a"); fr(-18, -2, 6, 3, "#15151a"); fr(-10, -3, 14, 2, "#3a3a44"); }
    else if (n === 4) { fr(-16, -4, 30, 8, "#3d4a2f"); fr(-16, -4, 30, 2, "#566644"); fr(-19, -5, 5, 10, "#15151a"); fr(-3, 4, 4, 7, "#15151a"); fr(8, -5, 3, 10, "#8b8b95"); x.fillStyle = "#b3261e"; x.beginPath(); x.moveTo(14, -4); x.lineTo(22, 0); x.lineTo(14, 4); x.fill(); }
    else if (n >= 11) {                                                   // gilet pare-balles : bouclier (bleu · or · rouge selon le niveau)
      x.fillStyle = "#15151a"; x.beginPath(); x.moveTo(-11, -11); x.lineTo(11, -11); x.lineTo(11, 2); x.quadraticCurveTo(11, 11, 0, 15); x.quadraticCurveTo(-11, 11, -11, 2); x.closePath(); x.fill();
      x.fillStyle = ["#7f9bb3", "#e0a93b", "#b3261e"][n - 11]; x.beginPath(); x.moveTo(-9, -9); x.lineTo(9, -9); x.lineTo(9, 2); x.quadraticCurveTo(9, 9, 0, 12.5); x.quadraticCurveTo(-9, 9, -9, 2); x.closePath(); x.fill();
      fr(-1, -9, 2, 21, "rgba(0,0,0,.25)"); fr(-9, -2, 18, 2, "rgba(0,0,0,.25)");
    }
    else { fr(-4, -3, 22, 3, "#15151a"); fr(-20, -3, 17, 6, "#7a4a22"); fr(-4, 0, 14, 2, "#3a3a44"); }
    x.restore();
  }
  function drawArmsRoom(now, labels) {
    const R = ROOMS.arms, w = R.w, h = R.h, dx = R.door.x, hw = R.door.hw, sp = innSpot(), near = !!(sp && sp.k === "counter"), pulse = .5 + .5 * Math.sin(now / 240);
    // --- sol de la boutique : carrelage clair/foncé, usure, bande jaune/noire devant le comptoir
    for (let ty = 56; ty < h; ty += 20) for (let tx = 0; tx < w; tx += 20) fr(tx, ty, 20, 20, ((tx + ty) / 20) & 1 ? "#413c4a" : "#37333f");
    for (let k = 0; k < 46; k++) fr(18 + (k * 97) % 360, 146 + (k * 53) % 98, 2 + k % 3, 1, "rgba(255,255,255,.06)");
    // --- derrière le comptoir : parquet en lattes + tapis du vendeur
    for (let y = 58, n = 0; y < 112; y += 6, n++) { fr(16, y, w - 32, 6, n & 1 ? "#573a24" : "#4e3420"); fr(16, y + 5, w - 32, 1, "rgba(0,0,0,.35)"); for (let k = 0; k < 3; k++) fr(16 + ((n * 71 + k * 131) % (w - 40)), y, 1, 5, "rgba(0,0,0,.28)"); }
    fr(138, 66, 124, 44, "#5a1f1f"); fr(138, 66, 124, 2, "#c9a227"); fr(138, 108, 124, 2, "#c9a227"); fr(138, 66, 2, 44, "#c9a227"); fr(260, 66, 2, 44, "#c9a227"); fr(143, 71, 114, 34, "#6a2828"); for (let k = 0; k < 5; k++) fr(150 + k * 24, 86, 6, 2, "#c9a227");
    for (let tx = 16; tx < w - 16; tx += 8) fr(tx, 140, 8, 3, (tx / 8) & 1 ? "#e0b81f" : "#1a1a1a");
    // --- tapis d'entrée rouge à liseré doré et croix dorées
    fr(dx - 28, 143, 56, h - 143, "#7a2626"); fr(dx - 26, 143, 2, h - 143, "#c9a227"); fr(dx + 24, 143, 2, h - 143, "#c9a227"); fr(dx - 22, 143, 1, h - 143, "rgba(0,0,0,.25)"); fr(dx + 21, 143, 1, h - 143, "rgba(0,0,0,.25)");
    for (let y = 154; y < h - 50; y += 22) if (y < 186 || y > 226) { fr(dx - 1, y, 2, 8, "#c9a227"); fr(dx - 4, y + 3, 8, 2, "#c9a227"); }
    // --- mur du fond : briques, lambris en bois, ombre en haut
    fr(0, 0, w, 58, "#512121"); for (let y = 11; y < 44; y += 11) { fr(0, y, w, 1, "rgba(0,0,0,.28)"); for (let c = (y / 11 & 1) * 14; c < w; c += 28) fr(c, y - 10, 1, 10, "rgba(0,0,0,.2)"); }
    for (let k = 0; k < 30; k++) fr((k * 53) % w, 3 + (k * 29) % 38, 6 + k % 5, 3, k & 1 ? "rgba(255,255,255,.035)" : "rgba(0,0,0,.07)");   // briques de teintes différentes
    fr(0, 0, w, 8, "rgba(0,0,0,.28)"); fr(0, 8, w, 6, "rgba(0,0,0,.12)");
    fr(0, 44, w, 10, "#3d1c12"); fr(0, 44, w, 2, "#7a4228"); for (let c = 10; c < w; c += 24) fr(c, 47, 1, 6, "rgba(0,0,0,.35)"); fr(0, 54, w, 4, "#2a0e0e");
    fr(0, 56, 14, h - 56, "#3f1818"); fr(w - 14, 56, 14, h - 56, "#3f1818"); fr(12, 56, 2, h - 56, "#6b2a2a"); fr(w - 14, 56, 2, h - 56, "#6b2a2a"); fr(14, 56, 2, h - 56, "rgba(0,0,0,.4)"); fr(w - 16, 56, 2, h - 56, "rgba(0,0,0,.4)");
    fr(0, h - 14, dx - hw, 14, "#3f1818"); fr(dx + hw, h - 14, w - dx - hw, 14, "#3f1818"); fr(0, h - 14, dx - hw, 2, "#6b2a2a"); fr(dx + hw, h - 14, w - dx - hw, 2, "#6b2a2a");
    fr(dx - hw, h - 14, hw * 2, 14, "#a9d8f5"); fr(dx - hw, h - 14, 3, 14, "#2a0e0e"); fr(dx + hw - 3, h - 14, 3, 14, "#2a0e0e"); fr(dx - hw + 5, h - 12, 10, 2, "rgba(255,255,255,.6)"); fr(dx - hw + 17, h - 12, 4, 2, "rgba(255,255,255,.4)");
    // --- enseigne néon (plaque + tube) en haut
    fr(146, 1, 108, 13, "#160808"); x.strokeStyle = Math.sin(now / 90) > .93 ? "#8a4a4a" : "#ff5a4d"; x.lineWidth = 1.2; x.strokeRect(147.5, 2.5, 105, 10);
    labels.push(["ARMES", 200, 11, Math.sin(now / 90) > .93 ? "#8a4a4a" : "#ff6a5a", 12]);
    // --- décor du mur : affiche, horloge, licence, impacts
    fr(30, 12, 22, 30, "#d9c89a"); fr(30, 12, 22, 2, "#b8a574"); fr(36, 18, 10, 10, "#8d5524"); fr(32, 33, 18, 2, "#6b1a1a"); fr(32, 37, 12, 1, "#6b1a1a");
    fr(143, 21, 14, 14, "#2a1208"); fr(145, 23, 10, 10, "#f2ead0"); fr(149, 25, 2, 5, "#222"); fr(149, 29, 4, 1, "#222"); fr(150, 28, 1, 1, "#c33");
    fr(240, 20, 20, 16, "#2a1208"); fr(242, 22, 16, 12, "#d9c89a"); fr(244, 25, 12, 1, "#7a5a2a"); fr(244, 28, 9, 1, "#7a5a2a"); fr(244, 31, 11, 1, "#7a5a2a");
    for (const [bx, by] of [[64, 40], [262, 40], [334, 41], [136, 38]]) { fr(bx, by, 2, 2, "#120606"); fr(bx - 1, by - 1, 4, 1, "rgba(0,0,0,.25)"); }
    // --- vitrines murales des 3 armes (cadre doré qui clignote quand on peut acheter)
    SHOP_ARMS.forEach((a, i) => { const px = 100 + i * 100; fr(px - 32, 15, 64, 31, "#1d0a0a"); fr(px - 31, 16, 62, 29, "#2a1010"); x.strokeStyle = near ? `rgba(255,225,77,${(.45 + .5 * pulse).toFixed(2)})` : "#b0802f"; x.lineWidth = near ? 1.6 : 1.2; x.strokeRect(px - 32.5, 15.5, 64, 31); fr(px - 30, 17, 60, 2, "rgba(255,230,180,.25)"); wIcon(a.n, px, 28, 1.3); labels.push([WPN[a.n].n, px, 41, "#fff", 10]); labels.push([`$${a.p}`, px, 52, "#ffe14d", 11]); });
    // râtelier à fusils
    fr(342, 8, 48, 40, "#2b1810"); fr(342, 8, 48, 2, "#7a4a22"); fr(342, 46, 48, 2, "#7a4a22"); fr(342, 8, 2, 40, "#7a4a22"); fr(388, 8, 2, 40, "#7a4a22");
    [[17, "#8a5a2c"], [27, "#6a4420"], [37, "#8a5a2c"]].forEach(([yy, cl], i) => { fr(358, yy, 28, 2, "#15151a"); fr(346, yy - 1, 14, 4, cl); fr(350 + i * 3, yy - 2, 6, 1, "#a87a44"); fr(366, yy - 2, 8, 2, "#3a3a44"); fr(360, yy, 22, 1, "#4a4a54"); fr(352, yy + 3, 3, 3, "#15151a"); });
    fr(372, 60, 10, 8, "#222"); fr(381, 62, 3, 3, Math.floor(now / 500) % 2 ? "#ff2a2a" : "#400");      // caméra
    // --- derrière le comptoir : caisses, coffre-fort, caisse enregistreuse, vendeur
    fr(22, 70, 32, 24, "#6b4a22"); fr(22, 70, 32, 3, "#8a6a3a"); fr(22, 82, 32, 1, "rgba(0,0,0,.4)"); fr(37, 70, 1, 24, "rgba(0,0,0,.35)"); fr(26, 62, 11, 8, "#3d5a2a"); fr(26, 62, 11, 2, "#5a7a3a"); fr(40, 64, 10, 6, "#8a6a1a"); fr(40, 64, 10, 2, "#c9a227"); fr(22, 94, 32, 2, "rgba(0,0,0,.35)");
    fr(58, 76, 22, 18, "#6b4a22"); fr(58, 76, 22, 3, "#8a6a3a"); fr(58, 85, 22, 1, "rgba(0,0,0,.4)"); fr(58, 94, 22, 2, "rgba(0,0,0,.35)");
    fr(346, 68, 34, 38, "#555a64"); fr(346, 68, 34, 3, "#7b808c"); fr(350, 75, 26, 27, "#3b3f48"); fr(360, 85, 8, 8, "#a8aeb8"); fr(362, 87, 4, 4, "#2a2e36"); fr(371, 87, 3, 10, "#e0b81f"); fr(346, 106, 34, 2, "rgba(0,0,0,.35)");
    drawWalker(200, 90, Math.PI / 2, "#2b2b2b", SKIN[2], null, 0, false); labels.push(["ARMAND", 200, 76, "#fff", 11]);
    if (near) labels.push(["💬", 214, 72 + Math.sin(now / 200) * 2, "#fff", 16]);
    // --- comptoir : bois veiné, coins dorés, vitrine à reflets et étiquettes de prix
    fr(14, 112, 372, 24, "#664022"); fr(14, 112, 372, 5, near ? `rgb(${150 + 60 * pulse | 0},${100 + 50 * pulse | 0},52)` : "#a06a38");
    for (let k = 0; k < 26; k++) fr(18 + (k * 41) % 350, 113 + k % 3, 8 + k % 6, 1, "rgba(255,230,180,.16)");
    fr(14, 135, 372, 1, "#e0b81f"); fr(14, 112, 4, 24, "#e0b81f"); fr(382, 112, 4, 24, "#e0b81f"); fr(14, 112, 4, 2, "#fff1b0"); fr(382, 112, 4, 2, "#fff1b0");
    fr(20, 124, 360, 10, "rgba(165,215,238,.6)");
    for (let i = 0; i < 6; i++) { const gx = 54 + i * 58; wIcon(1 + i % 3, gx, 129, .7); fr(gx - 4, 132, 8, 2, "#ffe14d"); fr(gx + 26, 124, 2, 10, "rgba(0,0,0,.3)"); fr(gx - 20 + ((now / 90 + i * 17) % 120 | 0) % 40, 125, 5, 1, "rgba(255,255,255,.4)"); }
    fr(300, 100, 26, 14, "#3a3a44"); fr(304, 102, 18, 6, "#3df0a0"); fr(306, 110, 14, 2, "#15151a");     // caisse
    fr(262, 108, 10, 4, "#e0b81f"); fr(265, 106, 4, 2, "#e0b81f");                                      // sonnette
    fr(100, 104, 14, 8, "#3d5a2a"); fr(100, 104, 14, 2, "#5a7a3a"); fr(118, 106, 10, 6, "#8a6a1a");
    fr(14, 136, 372, 5, "rgba(0,0,0,.38)");
    // --- vitrines latérales : cadre en bois, étagères, néon haut, reflets
    for (const sx of [14, 350]) { fr(sx - 1, 157, 38, 87, "#5b3a1e"); fr(sx, 158, 36, 84, "#3b3b46"); fr(sx + 2, 160, 32, 80, "rgba(125,195,225,.4)"); fr(sx + 4, 160, 2, 78, "rgba(255,255,255,.25)"); fr(sx + 2, 160, 32, 3, "rgba(255,235,190,.5)"); for (let i = 0; i < 2; i++) fr(sx + 2, 190 + i * 24, 32, 1, "rgba(255,255,255,.3)"); fr(sx - 1, 244, 38, 3, "rgba(0,0,0,.35)"); for (let i = 0; i < 3; i++) wIcon(1 + i, sx + 18, 178 + i * 24, .9); }
    // --- table centrale
    fr(156, 196, 88, 24, "#50505c"); fr(156, 196, 88, 3, "#7a7a88"); for (let k = 0; k < 6; k++) fr(162 + k * 14, 202, 10, 9, k & 1 ? "#d9b02e" : "#962f2f");
    fr(156, 220, 88, 3, "rgba(0,0,0,.35)"); fr(162, 190, 16, 8, "#3d5a2a"); fr(162, 190, 16, 2, "#5a7a3a"); fr(180, 192, 12, 6, "#8a6a1a");
    // --- coins de l'entrée : caisse et baril
    fr(18, 246, 34, 28, "#6b4a22"); fr(18, 246, 34, 4, "#8a6a3a"); fr(18, 258, 34, 1, "rgba(0,0,0,.4)"); fr(34, 246, 2, 28, "rgba(0,0,0,.35)"); fr(22, 252, 8, 5, "#3d5a2a"); fr(18, 274, 34, 2, "rgba(0,0,0,.35)");
    fr(352, 248, 28, 28, "#7a2020"); fr(352, 248, 28, 3, "#a03a3a"); fr(352, 258, 28, 2, "#3a0f0f"); fr(352, 268, 28, 2, "#3a0f0f"); fr(361, 252, 10, 4, "#ffd23f"); fr(352, 276, 28, 2, "rgba(0,0,0,.35)");
    // --- appliques sur les murs latéraux
    for (const sy of [84, 200]) for (const sx of [2, w - 12]) { fr(sx, sy, 10, 8, "#7a5a1a"); fr(sx + 1, sy + 1, 8, 6, "#e0b81f"); fr(sx + 3, sy + 2, 4, 4, "#fff4c0"); }
    labels.push(["SORTIE", dx, h - 24, "#fff", 10]);
    // --- lumières
    const fl = Math.sin(now / 90) > .93 ? .5 : 1;
    for (const px of [100, 200, 300]) pool(px, 30, 62, "rgba(255,232,185,.18)");
    pool(366, 28, 40, "rgba(255,232,185,.12)"); pool(200, 8, 100, `rgba(255,60,60,${(.14 * fl).toFixed(3)})`);
    for (const sy of [88, 204]) { pool(14, sy, 52, "rgba(255,215,140,.16)"); pool(w - 14, sy, 52, "rgba(255,215,140,.16)"); }
    pool(100, 170, 100, "rgba(255,190,150,.12)"); pool(300, 170, 100, "rgba(255,190,150,.12)"); pool(200, 80, 110, "rgba(255,200,140,.12)"); pool(dx, h - 10, 60, "rgba(190,225,255,.16)");
    if (near) pool(200, 124, 150, `rgba(255,225,120,${(.06 + .06 * pulse).toFixed(3)})`);
  }
  function drawGarageRoom(now, labels) {
    const R = ROOMS.garage, w = R.w, h = R.h, dx = R.door.x, hw = R.door.hw, g = me.gcar, own = isOwner(), sp = innSpot();
    fr(0, 58, w, h - 58, "#4b4e58"); for (let c = 110; c < w; c += 110) fr(c, 58, 1, h - 58, "rgba(0,0,0,.25)"); for (let r = 168; r < h; r += 110) fr(0, r, w, 1, "rgba(0,0,0,.25)");
    for (let n = 0; n < 16; n++) { x.fillStyle = "rgba(20,20,26,.28)"; x.beginPath(); x.ellipse(20 + hs(n, 3) % (w - 40), 80 + hs(n, 9) % (h - 110), 6 + hs(n, 5) % 11, 4 + hs(n, 7) % 7, 0, 0, 7); x.fill(); }
    for (const bx of [150, 300, 450]) { fr(bx - 32, 148, 64, 84, "#2e3139"); for (let k = 0; k < 8; k++) { fr(bx - 32 + k * 8, 148, 8, 4, k & 1 ? "#e6c83c" : "#14141a"); fr(bx - 32 + k * 8, 228, 8, 4, k & 1 ? "#14141a" : "#e6c83c"); } x.strokeStyle = "#e6c83c"; x.lineWidth = 1.5; x.strokeRect(bx - 38, 142, 76, 96); }
    fr(0, 0, w, 58, "#565b69"); for (let y = 8; y < 58; y += 8) fr(0, y, w, 1, "rgba(0,0,0,.25)"); fr(0, 0, w, 4, "#33363f"); fr(0, 54, w, 4, "#33363f");
    fr(22, 8, 150, 40, "#7a5c3a"); fr(34, 14, 3, 24, "#c0c0c8"); fr(31, 12, 9, 5, "#c0c0c8"); fr(58, 14, 3, 22, "#8a5a30"); fr(53, 12, 13, 6, "#444"); fr(86, 14, 3, 26, "#c0392b"); fr(100, 16, 14, 14, "#222"); fr(103, 19, 8, 8, "#666"); fr(130, 14, 3, 20, "#d9a441"); fr(126, 12, 11, 5, "#d9a441");   // tableau d'outils
    fr(260, 10, 100, 30, "#14141a"); x.strokeStyle = "#ffd23f"; x.lineWidth = 1.5; x.strokeRect(260.5, 10.5, 100, 30); labels.push(["GARAGE", 310, 32, "#ffd23f", 15]);
    fr(0, 56, 14, h - 56, "#3d414c"); fr(w - 14, 56, 14, h - 56, "#3d414c");
    fr(0, h - 14, dx - hw, 14, "#3d414c"); fr(dx + hw, h - 14, w - dx - hw, 14, "#3d414c"); fr(dx - hw, h - 14, hw * 2, 14, "#bfe0f5"); for (let k = 0; k < 12; k++) fr(dx - hw + k * 9, h - 14, 4, 3, k & 1 ? "#e6c83c" : "#14141a");
    fr(18, 56, 160, 26, "#5a4630"); fr(18, 56, 160, 5, "#7c6342"); fr(30, 62, 14, 8, "#c0392b"); fr(120, 62, 22, 8, "#8a8d99"); fr(150, 62, 10, 12, "#d9a441");   // établi
    drawWalker(96, 100, -Math.PI / 2, "#2a6fd1", SKIN[3], null, 0, false); labels.push(["RICO", 96, 118, "#fff", 11]);
    if (sp && sp.k === "bench") labels.push(["🔧", 96, 84 + Math.sin(now / 200) * 2, "#fff", 16]);
    for (const [bx, by] of [[31, 249], [59, 257]]) { x.fillStyle = "rgba(0,0,0,.3)"; x.beginPath(); x.arc(bx + 2, by + 2, 12, 0, 7); x.fill(); x.fillStyle = "#b23a2a"; x.beginPath(); x.arc(bx, by, 12, 0, 7); x.fill(); x.strokeStyle = "#6e1f15"; x.lineWidth = 2; x.beginPath(); x.arc(bx, by, 8, 0, 7); x.stroke(); }   // fûts
    for (let k = 0; k < 3; k++) { x.fillStyle = "#1a1a1f"; x.beginPath(); x.arc(534 + k * 2, 80 - k * 2, 15, 0, 7); x.fill(); x.fillStyle = "#777c88"; x.beginPath(); x.arc(534 + k * 2, 80 - k * 2, 6, 0, 7); x.fill(); }                  // pneus
    fr(526, 206, 32, 44, "#c0392b"); fr(526, 206, 32, 4, "#e05a49"); for (let k = 0; k < 4; k++) { fr(528, 214 + k * 9, 28, 1, "rgba(0,0,0,.4)"); fr(538, 217 + k * 9, 8, 2, "#ddd"); }   // servante
    if (g) { drawCar(150, 190, -Math.PI / 2, col(g.c), g.p ? 1 : false, now, g.t, g.d); labels.push([`ÉTAT ${Math.round(100 - dmSum(g.d) / 12 * 100)}%`, 150, 250, "#fff", 10]); }
    else labels.push(["LIBRE", 150, 194, "#e6c83c", 11]);
    if (own) { x.save(); x.globalAlpha = .6 + .25 * Math.sin(now / 260); drawCar(300, 190, -Math.PI / 2, "#cfeeff", false, now, GHOST, 0); x.restore(); labels.push(["👻 FANTÔME", 300, 250, "#9ad8ff", 10]); }
    else labels.push(["RÉSERVÉ", 300, 194, "#e6c83c", 11]);
    if (me.g2) {                                                                                  // 2e emplacement
      const g2 = me.gcar2;
      if (g2) { drawCar(450, 190, -Math.PI / 2, col(g2.c), g2.p ? 1 : false, now, g2.t, g2.d); labels.push([`ÉTAT ${Math.round(100 - dmSum(g2.d) / 12 * 100)}%`, 450, 250, "#fff", 10]); }
      else labels.push(["LIBRE", 450, 194, "#e6c83c", 11]);
    } else {                                                                                      // emplacement verrouillé : à acheter
      x.fillStyle = "rgba(8,8,12,.62)"; x.fillRect(412, 148, 76, 84); labels.push(["🔒 $" + G2PRICE, 450, 186, "#ffd23f", 13]); labels.push(["EMPLACEMENT +", 450, 250, "#ffd23f", 10]);
      if (sp && sp.k === "buy2") labels.push(["💬", 450, 140 + Math.sin(now / 200) * 2, "#fff", 16]);
    }
    if (me.hu) {                                                                                  // échelle + trappe vers le toit (héliport)
      fr(228, 8, 3, 50, "#9aa0ad"); fr(250, 8, 3, 50, "#9aa0ad"); for (let r = 14; r < 56; r += 8) fr(231, r, 19, 2, "#c0c4cf");
      fr(214, 80, 52, 36, "#2e3139"); for (let k = 0; k < 7; k++) { fr(214 + k * 8, 80, 8, 4, k & 1 ? "#e6c83c" : "#14141a"); fr(214 + k * 8, 112, 8, 4, k & 1 ? "#14141a" : "#e6c83c"); }
      fr(222, 92, 36, 12, "#1b1d23"); labels.push(["🚁 TOIT", 240, 102, "#ffd23f", 11]);
      if (sp && sp.k === "roof") labels.push(["💬", 240, 72 + Math.sin(now / 200) * 2, "#fff", 16]);
    }
    labels.push(["SORTIE", dx, h - 24, "#fff", 10]);
    pool(150, 170, 90, "rgba(255,240,200,.16)"); pool(300, 170, 90, own ? "rgba(150,210,255,.18)" : "rgba(255,240,200,.1)"); pool(450, 170, 90, me.g2 ? "rgba(255,240,200,.16)" : "rgba(255,240,200,.06)"); pool(90, 90, 80, "rgba(255,230,180,.12)"); pool(dx, h - 10, 70, "rgba(190,225,255,.2)");
  }
  function frameInside(now) {
    const R = ROOMS[inn.k], z = Math.min(1.7, (W - 20) / R.w), tx = Math.round((W / 2 - R.w / 2 * z) / LR), ty = Math.round((H / 2 - R.h / 2 * z) / LR), sxy = (wx, wy) => [wx * z + tx * LR, wy * z + ty * LR], labels = [];
    me.hp = Math.max(me.hp, 0);
    x = lx; x.setTransform(1, 0, 0, 1, 0, 0); x.fillStyle = "#08080c"; x.fillRect(0, 0, lc.width, lc.height);
    x.setTransform(z / LR, 0, 0, z / LR, tx, ty);
    if (inn.k === "arms") drawArmsRoom(now, labels); else if (inn.k === "house") drawHouseRoom(now, labels); else if (inn.k === "jail") drawJailRoom(now, labels); else drawGarageRoom(now, labels);
    drawWalker(inn.x, inn.y, inn.a, (lobbyP()[myUid] || {}).color || "#fff", "#f1c27d", inn.mv ? now / 85 : null, 0, false);
    { const ay = inn.y - 15 + Math.sin(now / 160) * 2; x.fillStyle = "#ffe14d"; x.strokeStyle = "#000"; x.lineWidth = 1; x.beginPath(); x.moveTo(inn.x, ay + 6); x.lineTo(inn.x - 5, ay - 2); x.lineTo(inn.x + 5, ay - 2); x.closePath(); x.fill(); x.stroke(); }
    x.setTransform(1, 0, 0, 1, 0, 0);                                      // pénombre autour de toi
    { const gx = inn.x * z / LR + tx, gy = inn.y * z / LR + ty, gr = x.createRadialGradient(gx, gy, 40, gx, gy, 250); gr.addColorStop(0, "rgba(0,0,0,0)"); gr.addColorStop(1, "rgba(0,0,0,.5)"); x.fillStyle = gr; x.fillRect(0, 0, lc.width, lc.height); }
    const S = cv.width / W; x = mx2; x.setTransform(1, 0, 0, 1, 0, 0); x.imageSmoothingEnabled = false; x.drawImage(lc, 0, 0, cv.width, cv.height); x.setTransform(S, 0, 0, S, 0, 0);
    labels.forEach(([s, wx, wy, c2, sz]) => { const [px, py] = sxy(wx, wy); txt(s, px, py, sz || 12, c2); });
    { const [fx, fy] = sxy(inn.x, inn.y - 14); floats = floats.filter(f => now - f.t < 1400); floats.forEach(f => { x.globalAlpha = 1 - (now - f.t) / 1400; txt(f.s, fx, fy - (now - f.t) / 25, 15, f.c); }); x.globalAlpha = 1; }
    txt(`$${Math.round(me.cash)}`, 14, 32, 28, "#ffe14d", "left");
    x.fillStyle = "#000"; x.fillRect(13, 42, 112, 11); x.fillStyle = me.hp > 40 ? "#3ee62f" : "#ff3b30"; x.fillRect(15, 44, 108 * clamp(me.hp, 0, 100) / 100, 7);
    txt(R.name, W / 2, 30, 20, R.c); if (inn.k === "jail" && jail) { const t = Math.max(0, Math.ceil(jail.t)); txt(`⏱ LIBÉRATION DANS ${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")} · UN AMI PEUT TE FAIRE ÉVADER`, W / 2, 48, 11, "#ff9f9f"); } else txt("À L'ABRI : LA POLICE NE TE VOIT PAS", W / 2, 48, 11, "#9be7ff");
    const sp = innSpot(); if (sp && !shop) txt(sp.h, W / 2, H - 60, 15, sp.k === "none" ? "#9a9aa5" : "#ffe14d");
    if (now - inn.t0 < 7000) txt(TOUCH ? "JOYSTICK : BOUGER · BOUTON : AGIR" : (inn.k === "jail" ? "ZQSD / FLÈCHES : BOUGER · E : AGIR (CREUSER AU COIN, CORROMPRE LE GARDIEN)" : "ZQSD / FLÈCHES : BOUGER · E : AGIR · ÉCHAP : SORTIR"), W / 2, H - 28, 12, "#fffa");
    { const bx = W - 56, by = H - 62; x.fillStyle = "#1f4fbf"; x.beginPath(); x.arc(bx, by, 38, 0, 7); x.fill(); x.strokeStyle = "#000"; x.lineWidth = 3; x.stroke(); txt(sp && sp.k === "door" ? "SORTIR" : "ACTION", bx, by + 4, 12); }
    if (shop) drawShop(now);
    if (stick) { x.fillStyle = "rgba(255,255,255,.08)"; x.strokeStyle = "rgba(255,255,255,.28)"; x.lineWidth = 2; x.beginPath(); x.arc(stick.ox, stick.oy, 55, 0, 7); x.fill(); x.stroke(); x.fillStyle = "rgba(255,255,255,.65)"; x.beginPath(); x.arc(stick.ox + stick.dx * 55, stick.oy + stick.dy * 55, 22, 0, 7); x.fill(); }
    const fa = 1 - (now - inn.t0) / 380; if (fa > 0) { x.fillStyle = `rgba(0,0,0,${fa})`; x.fillRect(0, 0, W, H); }
  }

  // ================= MISSIONS =================
  // Chaque mission est personnelle (calculée chez toi, rien n'est écrit sur Firebase) : voiture volée à livrer, police à semer, cible à éliminer.
  const nearGiver = () => (me.vid || me.dead > 0) ? null : GIVERS.find(g => Math.hypot(g.x - me.x, g.y - me.y) < 52) || null;

  // --- quête spéciale du PILOTE (hélicoptère) : 5 caisses de pièces à ramasser en ville (chaque caisse attire la police), puis retour chez lui SANS étoile, en 8 min.
  //     Comme les autres missions elle est personnelle (chez toi) ; seule la réussite est sauvegardée (me.hu).
  const nearPilot = () => (me.vid || me.dead > 0 || inn) ? null : (Math.hypot(PILOT.x - me.x, PILOT.y - me.y) < 52 ? PILOT : null);
  // Objets de quête cachés sur des trottoirs éloignés, sans marqueur sur la carte.
  // Quête 1 : 3 pièces de RPG aux quatre coins de la ville (cases fixes, loin du boss, du pilote et du mécano).
  const cellSpot = (ci, cj) => { for (let r = 0; r < 3; r++) for (let di = -r; di <= r; di++) for (let dj = -r; dj <= r; dj++) { const i = ci + di, j = cj + dj; if (i < 0 || j < 0 || i >= N || j >= N || isPark(i, j) || isSpecial(i, j)) continue; return { x: lo(i) + SW / 2, y: lo(j) + BL / 2 }; } return { x: lo(ci) + SW / 2, y: lo(cj) + BL / 2 }; };
  const RPG_PART_SPOTS = [cellSpot(1, 1), cellSpot(8, 3), cellSpot(3, 7)];
  // Quête 2 : livraison de poudre. On la récupère dans un entrepôt isolé, la police est alertée, puis on la livre à l'armurerie à temps.
  const POWDER_SPOT = cellSpot(0, 7), POWDER_TIME = 170;
  let pw = 0, pwT = 0;                                                    // 0 = rien · 1 = aller chercher la poudre · 2 = livrer (chrono)
  const nearMech = () => (!me.vid && !me.dead && !inn && Math.hypot(RPG_CONTACT.x - me.x, RPG_CONTACT.y - me.y) < 58);
  const pwFail = (why) => { if (pw === 2) { pw = 1; toast(`🧨 Livraison ratée (${why}) : retourne chercher la poudre.`); } };
  // Cycle jour/nuit commun à tous : 180 s de jour, 165 s de nuit (345 s), fondu de 12 s. L'horloge est celle de l'hôte (sinon l'horloge locale si on est l'hôte).
  const DAY_S = 180, NIGHT_S = 165, CYC_S = DAY_S + NIGHT_S, FADE_S = 12; let clockOff = null, dnOff = 0, admOpen = false, unD = null;   // dnOff : décalage de l'horloge jour/nuit fixé par le owner (partagé via games/<code>/dn)
  const gClk = () => Date.now() + (clockOff || 0) + dnOff, cycT = () => ((gClk() / 1000) % CYC_S + CYC_S) % CYC_S;
  function setPhase(target) {                                              // owner : target = secondes dans le cycle (0 = jour, DAY_S+1 = nuit) · null = automatique
    if (target === null) { dnOff = 0; remove(RF(`games/${c}/dn`)).catch(() => { }); }
    else { const base = Date.now() + (clockOff || 0), off = Math.round(target * 1000 - (base % (CYC_S * 1000))); dnOff = off; set(RF(`games/${c}/dn`), off).catch(() => { }); }
  }
  // ----- Panneau admin (owners) : bouton ⚙ en haut à gauche (ou touche P) → fenêtre centrée, dessinée PAR-DESSUS tout le HUD -----
  // La mise en page est calculée une seule fois à partir de ADM_SEC : le dessin et le clic utilisent exactement les mêmes rectangles.
  const ADM_GEAR = { x: 214, y: 24, r: 16 }, ADM_W = 336;
  const admMsg = m => { try { toast(m); } catch { } };
  const admTp = (z, nm) => { if (me.dead > 0) return; me.x = z.x; me.y = z.y; me.v = 0; cam.x = me.x; cam.y = me.y; admMsg(`📍 ${nm}`); };
  const admHeal = () => { if (me.dead > 0) return; me.hp = 100; me.hurt = 0; admMsg("❤️ Soigné"); };
  const admCalm = () => { me.heat = 0; me.wl = 0; me.bust = 0; admMsg("⭐ Recherché : 0"); };
  const admCash = n => { me.cash += n; persist(true); admMsg(`💰 +$${n}`); };
  const admArms = () => { for (let n = 1; n <= 4; n++) me.ammo[n] = WPN[n].max; if (!me.wpn) me.wpn = 1; me.gunT = performance.now(); persist(true); admMsg("🔫 Toutes les armes, munitions au max"); };
  const admFix = () => { me.dm = 0; me.hh = 100; persist(true); admMsg("🔧 Voiture / hélico réparés"); };
  const ADM_SEC = [                                                     // [titre, colonnes, [[libellé, action, actif?], …]]
    ["TEMPS", 3, [["☀️ JOUR", () => setPhase(0)], ["🌙 NUIT", () => setPhase(DAY_S + 1)], ["⟲ AUTO", () => setPhase(null), () => dnOff === 0]]],
    ["JOUEUR", 2, [["❤️ SOIN", admHeal], ["⭐ POLICE → 0", admCalm], ["💰 +$1 000", () => admCash(1000)], ["💰 +$10 000", () => admCash(10000)], ["🔫 ARMES MAX", admArms], ["🔧 RÉPARER", admFix]]],
    ["TÉLÉPORTATION", 3, [["🏠 GARAGE", () => admTp(GZ, "Garage")], ["🔫 ARMURERIE", () => admTp(ZONES.arms, "Armurerie")], ["🏥 HÔPITAL", () => admTp(ZONES.heal, "Hôpital")]]]
  ];
  const ADM_L = (() => {
    let y = 34; const bt = [], labs = [];
    ADM_SEC.forEach(([t, cols, bs]) => {
      labs.push({ t, y }); y += 14; const bw = (ADM_W - 20 - 6 * (cols - 1)) / cols;
      bs.forEach((b, i) => bt.push({ b, x: 10 + (i % cols) * (bw + 6), y: y + Math.floor(i / cols) * 28, w: bw, h: 24 }));
      y += Math.ceil(bs.length / cols) * 28 + 6;
    });
    return { bt, labs, h: y + 20 };
  })();
  const ADM = { x: (W - ADM_W) / 2, y: Math.round((H - ADM_L.h) / 2), w: ADM_W, h: ADM_L.h };
  let admFl = { i: -1, t: 0 };                                          // dernier bouton pressé (petit flash)
  // retourne : null = pas touché · -1 = engrenage · -2 = fermer (✕ ou clic en dehors) · -3 = clic dans la fenêtre (absorbé) · 0… = bouton
  const admHit = p => {
    if (!isOwner() || inn) return null;
    if (Math.hypot(p.x - ADM_GEAR.x, p.y - ADM_GEAR.y) < ADM_GEAR.r + 6) return -1;
    if (!admOpen) return null;
    if (p.x < ADM.x || p.x > ADM.x + ADM.w || p.y < ADM.y || p.y > ADM.y + ADM.h) return -2;
    if (p.x > ADM.x + ADM.w - 34 && p.y < ADM.y + 30) return -2;
    for (let i = 0; i < ADM_L.bt.length; i++) { const r = ADM_L.bt[i]; if (p.x >= ADM.x + r.x && p.x <= ADM.x + r.x + r.w && p.y >= ADM.y + r.y && p.y <= ADM.y + r.y + r.h) return i; }
    return -3;
  };
  function admDo(h) {
    if (h === -1) admOpen = !admOpen;
    else if (h === -2) admOpen = false;
    else if (h >= 0) { admFl = { i: h, t: performance.now() }; try { ADM_L.bt[h].b[1](); } catch (err) { admMsg("Action admin impossible"); } }
  }
  function drawAdm() {
    if (!isOwner() || inn) return;
    const g = ADM_GEAR, now = performance.now();
    x.fillStyle = admOpen ? "#ffd23f" : "rgba(0,0,0,.55)"; x.beginPath(); x.arc(g.x, g.y, g.r, 0, 7); x.fill(); x.strokeStyle = "#ffd23f"; x.lineWidth = 1.5; x.stroke(); txt("⚙", g.x, g.y + 6, 18, admOpen ? "#000" : "#fff");
    if (!admOpen) return;
    x.fillStyle = "rgba(0,0,0,.45)"; x.fillRect(0, 0, W, H);
    x.fillStyle = "rgba(10,10,16,.95)"; rrect(ADM.x, ADM.y, ADM.w, ADM.h, 10); x.fill(); x.strokeStyle = "#ffd23f"; x.lineWidth = 2; x.stroke();
    txt("🛠️ ADMIN", ADM.x + ADM.w / 2, ADM.y + 22, 15, "#ffd23f"); txt("✕", ADM.x + ADM.w - 17, ADM.y + 22, 16, "#fff");
    ADM_L.labs.forEach(l => txt(l.t, ADM.x + 12, ADM.y + l.y + 10, 11, "#9aa0b4", "left"));
    ADM_L.bt.forEach((r, i) => {
      const act = r.b[2] && r.b[2](), fl = admFl.i === i && now - admFl.t < 180;
      x.fillStyle = fl ? "#ffd23f" : act ? "rgba(255,210,63,.38)" : "rgba(255,255,255,.14)"; rrect(ADM.x + r.x, ADM.y + r.y, r.w, r.h, 6); x.fill();
      txt(r.b[0], ADM.x + r.x + r.w / 2, ADM.y + r.y + 17, 12, fl ? "#000" : "#fff");
    });
    const t = cycT(); txt(`${t < DAY_S ? "☀️ JOUR" : "🌙 NUIT"} · ${dnOff === 0 ? "AUTO" : "MANUEL"} · P ou Échap : fermer`, ADM.x + ADM.w / 2, ADM.y + ADM.h - 8, 10, "#9aa0b4");
  }
  const darkness = (t) => t < DAY_S - FADE_S ? 0 : t < DAY_S ? (t - (DAY_S - FADE_S)) / FADE_S : t < CYC_S - FADE_S ? 1 : (CYC_S - t) / FADE_S;
  // Camion noir : chaque nuit, il se gare à un endroit différent (même pour tout le monde, calculé depuis l'horloge commune). Aucune annonce, aucun marqueur.
  const bmPos = () => { const n = Math.floor(gClk() / 1000 / CYC_S), h = hs(n, 77), i = 1 + h % (N - 2), j = 1 + (h >>> 8) % (N - 2); return { x: i * CELL, y: j * CELL + CELL / 2 }; };
  const bmOn = () => darkness(cycT()) > .5;
  const nearBM = () => { if (me.vid || me.dead > 0 || inn || !bmOn()) return null; const q = bmPos(); return Math.abs(me.x - q.x) < 62 && Math.abs(me.y - q.y) < 74 ? q : null; };
  const PARTS = 5, PART_TIME = 480;                                      // difficulté de la quête : nombre de caisses · temps (s)
  function partSpots() {
    const out = [];
    for (let t = 0; t < 400 && out.length < PARTS; t++) {
      const jx = (1 + Math.floor(Math.random() * (N - 1))) * CELL, jy = (1 + Math.floor(Math.random() * (N - 1))) * CELL;
      if (Math.hypot(jx - me.x, jy - me.y) < 800 || out.some(q => Math.hypot(q.x - jx, q.y - jy) < 1000)) continue;
      out.push({ x: jx, y: jy, got: 0 });
    }
    while (out.length < PARTS) out.push({ x: ((out.length * 3 + 1) % (N - 1) + 1) * CELL, y: ((out.length * 5 + 2) % (N - 1) + 1) * CELL, got: 0 });
    return out;
  }
  function pilotTalk() {
    if (me.hu) { toast(me.g ? "LE PILOTE : « Ton hélico est sur le toit de ton garage. Bon vol ! »" : "LE PILOTE : « Il te faut le garage ($3500) : l'hélico se range sur son toit ! »"); return; }
    if (mis && mis.k === "heli") { if (mis.st === 1) { if (me.wl > 0) toast("LE PILOTE : « La police est sur tes talons ! Sème-la d'abord, je ne veux pas d'ennuis. »"); else heliUnlock(); } else toast(`LE PILOTE : « Il me manque encore ${PARTS - mis.got} caisse(s) de pièces ! »`); return; }
    if (mis) { toast("LE PILOTE : « Finis d'abord ta mission ! » (M : abandonner)"); return; }
    mis = { k: "heli", n: "LE PILOTE", st: 0, t: PART_TIME, cr: partSpots(), got: 0 };
    toast("LE PILOTE : « J'ai un hélico mais il lui manque 5 caisses de pièces 🔧, très loin les unes des autres. Chaque caisse attire la police, tu as 8 min, et ramène-les-moi sans étoile ! »"); beep(440, .1, "triangle", .06);
  }
  function heliUnlock() {
    me.hu = 1; mis = null; floats.push({ x: me.x, y: me.y - 26, t: tNow, s: "🚁 HÉLICOPTÈRE DÉBLOQUÉ !", c: "#ffd23f" });
    toast(me.g ? "LE PILOTE : « Il t'attend sur le toit de ton garage (échelle) ! »" : "LE PILOTE : « Achète le garage ($3500) : l'hélico se range sur son toit ! »");
    beep(784, .16, "triangle", .06); setTimeout(() => beep(988, .16, "triangle", .06), 160); persist(true);
  }
  function talkDo() {
    if (nearPilot()) { pilotTalk(); return true; }
    if (!me.vid && !inn && Math.hypot(RPG_CONTACT.x-me.x,RPG_CONTACT.y-me.y)<58) {
      if (!me.rpgQuest) { me.rpgQuest=1; persist(true); toast("MÉCANO : « Retrouve les 3 pièces du lance-roquettes que j’ai cachées en ville. »"); }
      else if (me.rpgParts.length<3) toast(`MÉCANO : « Il te manque encore ${3-me.rpgParts.length} pièce(s) RPG. »`);
      else if (me.rpgAmmoUnlocked) toast("MÉCANO : « Les munitions RPG sont à toi. Fais-en bon usage ! »");
      else if (!me.ammoQuest) { me.ammoQuest=1; pw=1; persist(true); toast("MÉCANO : « Pièces OK ! Il me faut de la poudre : va à l’entrepôt (marqueur orange), puis livre-la à l’armurerie en véhicule avant la fin du chrono. »"); }
      else if (pw===2) toast("MÉCANO : « Fonce livrer la poudre à l’armurerie ! »");
      else { pw=1; toast("MÉCANO : « La poudre t’attend à l’entrepôt (marqueur orange sur la carte). »"); }
      beep(620,.12,"triangle",.06); return true;
    }
    const g = nearGiver(); if (!g) return false;
    if (mis) { toast(`${g.n} : « Termine d’abord ta mission ! » (M : abandonner)`); return true; }
    startMis(g); return true;
  }
  function spawnTgt() {
    let q = null;
    for (let t = 0; t < 14; t++) {
      const i = 1 + Math.floor(Math.random() * (N - 2)), j = 1 + Math.floor(Math.random() * (N - 2)); if (isPark(i, j) || isSpecial(i, j)) continue;
      q = { x: 0, y: 0, h: rr(0, 6.283), tm: rr(1, 3), hp: 70, fl: 0, sk: Math.floor(Math.random() * 6) }; sidewalk(q, lo(i) + 20, lo(j) + 20);
      if (Math.hypot(q.x - me.x, q.y - me.y) > 800) break;
    }
    if (!q) { q = { x: 0, y: 0, h: 0, tm: 2, hp: 70, fl: 0, sk: 1 }; sidewalk(q, lo(4) + 20, lo(1) + 20); }
    return q;
  }
  function startMis(g) {
    const kinds = ["car", "cop", "hit", "truck"].filter(k => k !== lastMk), k = rnd(kinds); lastMk = k;   // au hasard à chaque fois (jamais deux fois de suite la même)
    if (k === "car") {
      const tc = 1 + Math.floor(Math.random() * 7); let d = null;
      for (let t = 0; t < 12 && !d; t++) { const jx = (1 + Math.floor(Math.random() * (N - 1))) * CELL, jy = (1 + Math.floor(Math.random() * (N - 1))) * CELL; if (Math.hypot(jx - me.x, jy - me.y) > 900) d = { x: jx, y: jy }; }
      if (!d) d = { x: 7 * CELL, y: 7 * CELL };
      mis = { k: "car", n: g.n, st: 0, tc, x: d.x, y: d.y, t: 480, no: me.vid, vid: 0, lost: 0, d: Math.hypot(d.x - me.x, d.y - me.y) };
      toast(`${g.n} : « Vole-moi une voiture ${CNAME[tc]} et amène-la au 🏁 »`);
    } else if (k === "cop") {
      me.heat = Math.max(me.heat, 2.6); me.wl = Math.max(me.wl, 3); mis = { k: "cop", n: g.n, st: 0, t: 210 };
      toast(`${g.n} : « Les flics te cherchent. Sème-les ! »`);
    } else if (k === "hit") {
      tgt = spawnTgt(); mis = { k: "hit", n: g.n, st: 0, t: 360 };
      toast(`${g.n} : « Une cible 🎯 se balade en ville. Élimine-la. »`);
    } else if (k === "truck") {
      const trk = spawnTruck(); mis = { k: "truck", n: g.n, st: 0, t: 300, trk };
      toast(`${g.n} : « Un camion blindé 🚚 traverse la ville avec de l'argent. Rentre-lui dedans ou tire dessus ! »`);
    }
    beep(440, .1, "triangle", .06);
  }
  // --- événement : camion blindé (personnel, comme la cible : calculé chez toi) ---
  function spawnTruck() {
    let ix = 4, iy = 4;
    for (let t = 0; t < 20; t++) { ix = 1 + Math.floor(Math.random() * (N - 1)); iy = 1 + Math.floor(Math.random() * (N - 1)); const d = Math.hypot(ix * CELL - me.x, iy * CELL - me.y); if (d > 900 && d < 2400) break; }
    const hz = Math.random() < .5, sg = Math.random() < .5 ? 1 : -1, tr = { dx: hz ? sg : 0, dy: hz ? 0 : sg, x: 0, y: 0, a: 0, v: 130, hp: 240, mx: 240, fl: 0, hit: 0 };
    tr.x = hz ? ix * CELL + tr.dx * 3 : ix * CELL - tr.dy * 22; tr.y = hz ? iy * CELL + tr.dx * 22 : iy * CELL + tr.dy * 3; tr.a = Math.atan2(tr.dy, tr.dx);
    return tr;
  }
  function truckStep(q, dt) {                                             // suit les voies de circulation, tourne au hasard aux carrefours
    const sp = (q.fl > 0 ? 200 : 150) * dt, px = q.x, py = q.y; q.fl -= dt; q.hit -= dt;
    q.x += q.dx * sp; q.y += q.dy * sp;
    const horiz = q.dx !== 0, a0 = horiz ? px : py, a1 = horiz ? q.x : q.y, kp = Math.floor(a0 / CELL), kn = Math.floor(a1 / CELL);
    if (kp !== kn) {
      const k = Math.max(kp, kn), cross = horiz ? Math.round(py / CELL) : Math.round(px / CELL), ix = horiz ? k : cross, iy = horiz ? cross : k, ds = [];
      [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dy]) => { const nx = ix + dx, ny = iy + dy; if (nx < 0 || ny < 0 || nx > N || ny > N) return; if (dx === -q.dx && dy === -q.dy) return; ds.push([dx, dy]); });
      if (!ds.length) ds.push([-q.dx, -q.dy]);
      const st = ds.find(d => d[0] === q.dx && d[1] === q.dy), d = st && Math.random() < .5 ? st : rnd(ds);
      q.dx = d[0]; q.dy = d[1];
      if (q.dx) { q.x = ix * CELL + q.dx * 3; q.y = iy * CELL + q.dx * 22; } else { q.x = ix * CELL - q.dy * 22; q.y = iy * CELL + q.dy * 3; }   // décalé de 3 px dans le sens de la marche : sinon le camion re-détecte le même carrefour et tourne en boucle
    }
    q.a = angLerp(q.a, Math.atan2(q.dy, q.dx), Math.min(1, 9 * dt));
  }
  function hitTruck(d) {
    const q = mis && mis.k === "truck" ? mis.trk : null; if (!q || q.hp <= 0) return;
    q.hp -= d; q.fl = 4; q.hit = .12; me.heat = Math.min(5, me.heat + .04); sparks.push({ x: q.x, y: q.y, t: tNow });
    if (q.hp <= 0) {
      booms.push({ x: q.x, y: q.y, t: tNow }); SND.thud(.8); me.heat = Math.min(5, me.heat + 1.2);
      const r = 900 + Math.min(300, Math.round(mis.t)); floats.push({ x: q.x, y: q.y - 20, t: tNow, s: "💰💰💰", c: "#ffd23f" });
      missionDone(r, "🚚 CAMION BRAQUÉ");
    }
  }
  function missionFail(why, quiet) { mis = null; tgt = null; toast(quiet ? "Mission abandonnée" : `Mission échouée : ${why}`); beep(150, .2, "sawtooth", .05, 70); }
  function missionDone(r, s) {
    me.cash += r; floats.push({ x: me.x, y: me.y - 26, t: tNow, s: `${s} +$${r}`, c: "#ffd23f" }); toast(`Mission réussie ! +$${r}`); beep(784, .16, "triangle", .06);
    mis = null; tgt = null; persist(true);
  }
  function hitTgt(d) {
    if (!tgt || tgt.hp <= 0) return;
    tgt.hp -= d; tgt.h = Math.atan2(tgt.y - me.y, tgt.x - me.x); tgt.fl = 5; splats.push({ x: tgt.x, y: tgt.y, t: tNow }); if (splats.length > 40) splats.shift();
    me.heat = Math.min(5, me.heat + .25);
    if (tgt.hp <= 0) { me.heat = Math.min(5, me.heat + 1); SND.thud(.8); SND.ped(.8); missionDone(600 + (mis ? Math.min(300, Math.round(mis.t)) : 0), "🎯 CIBLE ÉLIMINÉE"); }
  }
  function misPt() {                                                      // l'objectif à pointer (flèche + minicarte)
    if (!mis) return null;
    if (mis.k === "car") {
      if (mis.st === 0) { let b = 1e18, r = null; for (const d of dCars.values()) if (d.c === mis.tc && !d.cp && (d.m === "d" || d.m === "p")) { const q = Math.hypot(d.x - me.x, d.y - me.y); if (q < b) { b = q; r = { x: d.x, y: d.y, c: "#ffd23f" }; } } return r; }
      if (me.vid === mis.vid) return { x: mis.x, y: mis.y, c: "#5ee1ff" };
      const d = dCars.get(mis.vid); return d ? { x: d.x, y: d.y, c: "#ffd23f" } : null;
    }
    if (mis.k === "heli") {
      if (mis.st === 1) return { x: PILOT.x, y: PILOT.y, c: "#ffb703", nm: 1 };                  // nm : jamais pointé sur la minicarte
      let b = 1e18, r = null; for (const q of mis.cr) if (!q.got) { const d = Math.hypot(q.x - me.x, q.y - me.y); if (d < b) { b = d; r = { x: q.x, y: q.y, c: "#ffb703" }; } } return r;
    }
    if (mis.k === "hit" && tgt && tgt.hp > 0) return { x: tgt.x, y: tgt.y, c: "#ff3b30" };
    if (mis.k === "truck" && mis.trk.hp > 0) return { x: mis.trk.x, y: mis.trk.y, c: "#ffd23f" };
    return null;
  }
  function missions(dt) {
    if (shop && !inn && (me.vid || (shop === "bm" ? !nearBM() : shopAt() !== shop))) shop = "";
    if (tgt && tgt.hp > 0) {                                              // la cible se balade, et fuit quand elle est touchée
      tgt.tm -= dt; let sp = 34;
      if (tgt.fl > 0) { tgt.fl -= dt; sp = 100; } else if (tgt.tm <= 0) { tgt.h = rr(0, 6.283); tgt.tm = rr(2, 5); }
      tgt.x += Math.cos(tgt.h) * sp * dt; tgt.y += Math.sin(tgt.h) * sp * dt; if (push(tgt, 6)) tgt.h += rr(1.2, 2.4);
      if (me.vid && me.vid !== HELI && Math.abs(me.v) > 80 && Math.hypot(tgt.x - me.x, tgt.y - me.y) < 22) hitTgt(999);
    }
    if (me.rpgQuest && me.rpgParts.length < 3) RPG_PART_SPOTS.forEach((q,i)=>{if(!me.rpgParts.includes(i)&&Math.hypot(q.x-me.x,q.y-me.y)<22){me.rpgParts.push(i);persist(true);floats.push({x:q.x,y:q.y-18,t:tNow,s:`PIÈCE RPG ${me.rpgParts.length}/3`,c:"#ffd23f"});beep(880,.12,"triangle",.06);if(me.rpgParts.length===3)toast("Les 3 pièces sont réunies ! Le RPG est débloqué. Va à l’armurerie.");}});
    if (me.ammoQuest && !me.rpgAmmoUnlocked && me.rpgParts.length >= 3) {
      if (pw === 0) pw = 1;
      if (pw === 1 && Math.hypot(POWDER_SPOT.x - me.x, POWDER_SPOT.y - me.y) < 34) { pw = 2; pwT = POWDER_TIME; me.heat = Math.min(5, Math.max(me.heat, 2.2)); me.wl = Math.max(me.wl, 2); floats.push({ x: POWDER_SPOT.x, y: POWDER_SPOT.y - 18, t: tNow, s: "🧨 POUDRE RÉCUPÉRÉE", c: "#ff9a3d" }); toast("🚨 La police est alertée ! Livre la poudre à l’armurerie en véhicule."); beep(520, .14, "square", .05); }
      else if (pw === 2) {
        pwT -= dt;
        if (pwT <= 0) pwFail("temps écoulé");
        else if (me.vid && me.vid !== HELI && Math.hypot(ZONES.arms.x - me.x, ZONES.arms.y - me.y) < 90) { pw = 0; me.rpgAmmoUnlocked = 1; me.cash += 500; persist(true); floats.push({ x: me.x, y: me.y - 24, t: tNow, s: "🚀 MUNITIONS RPG DÉBLOQUÉES +$500", c: "#7ae582" }); toast("Livraison réussie ! Tu es maintenant digne de confiance pour acheter des munitions RPG… si tu trouves qui en vend."); beep(880, .12, "triangle", .06); setTimeout(() => beep(1175, .16, "triangle", .06), 130); }
        else if (!me.vid && Math.hypot(ZONES.arms.x - me.x, ZONES.arms.y - me.y) < 90 && Math.floor(tNow / 4000) !== Math.floor((tNow - dt * 1000) / 4000)) toast("Livre la poudre EN VÉHICULE !");
      }
    }
    if (!mis) return;
    mis.t -= dt; if (mis.t <= 0) { missionFail("temps écoulé"); return; }
    mis.el = (mis.el || 0) + dt;
    if (mis.k === "car") {
      if (mis.st === 0) {
        if (me.vid && me.vid < 100000 && me.vid !== mis.no && !me.cop && myCol === mis.tc) { mis.st = 1; mis.vid = me.vid; toast("Bonne voiture ! Livre-la au 🏁"); beep(660, .1, "triangle", .06); }
      } else if (me.vid === mis.vid) {
        mis.lost = 0;
        if (Math.hypot(mis.x - me.x, mis.y - me.y) < 60) {
          const r = Math.round((450 + mis.d / 6) * (1 - Math.min(.6, dmSum(me.dm) * .05)));
          me.go = 1; me.gi = me.vid; me.gn = (me.gn + 1) % 1000; me.vid = 0; me.v = 0; me.cop = 0; job = null; SND.door();   // la voiture est remise à Tony : elle disparaît du monde (même mécanisme que le garage)
          missionDone(r, "🏁 VOITURE LIVRÉE");
        }
      } else {
        mis.lost += dt; const car = dCars.get(mis.vid);
        if (car && car.m === "t" && car.o !== myUid) missionFail("on t'a volé la voiture");
        else if (!car && mis.lost > 4) missionFail("la voiture a disparu");
        else if (mis.lost > 120) missionFail("tu as abandonné la voiture");
      }
    } else if (mis.k === "truck") {
      const q = mis.trk; truckStep(q, dt);
      if (me.vid && me.vid !== HELI && Math.abs(me.v) > 100 && q.hit <= 0 && Math.hypot(q.x - me.x, q.y - me.y) < 34) {   // collision : le camion encaisse, ta voiture aussi
        const sv = Math.abs(me.v); hitTruck(Math.min(110, sv * .42)); q.hit = .5;
        if (me.vid !== GHOST) { me.v *= .35; dent(Math.atan2(q.y - me.y, q.x - me.x), sv > 170 ? 2 : 1); }
        beep(90, .12, "square", .05, 40); navigator.vibrate && navigator.vibrate(40);
      }
    } else if (mis.k === "heli") {
      if (mis.st === 0) for (const q of mis.cr) if (!q.got && Math.hypot(q.x - me.x, q.y - me.y) < 38) {
        q.got = 1; mis.got++; floats.push({ x: q.x, y: q.y - 20, t: tNow, s: `🔧 CAISSE ${mis.got}/${PARTS}`, c: "#ffb703" }); beep(880, .1, "triangle", .06);
        me.heat = Math.min(5, Math.max(me.heat, 1.6 + mis.got * .5)); toast("🚨 La police est alertée !");   // chaque caisse ramassée fait monter les étoiles
        if (mis.got >= PARTS) { mis.st = 1; toast("Les 5 caisses sont à bord ! Sème la police et retourne voir le pilote."); }
      }
    } else if (mis.k === "cop") {
      if (mis.el > 6 && me.wl === 0) missionDone(600 + Math.round(mis.t * 1.5), "🚓 POLICE SEMÉE");
    }
  }
  function drawMis(now) {                                                 // encadré + flèche vers l'objectif
    if (!mis) return;
    const tm = Math.max(0, Math.ceil(mis.t)), tt = `${Math.floor(tm / 60)}:${String(tm % 60).padStart(2, "0")}`; let l1 = "";
    if (mis.k === "car") l1 = mis.st === 0 ? `🚗 VOLE UNE VOITURE ${CNAME[mis.tc].toUpperCase()}` : me.vid === mis.vid ? "🚗 LIVRE-LA AU 🏁" : "🚗 RETOURNE DANS LA VOITURE !";
    else if (mis.k === "cop") l1 = `🚓 SÈME LA POLICE (${me.wl}★)`;
    else if (mis.k === "truck") l1 = `🚚 ARRÊTE LE CAMION BLINDÉ (${Math.max(0, Math.round(mis.trk.hp / mis.trk.mx * 100))}%)`;
    else if (mis.k === "heli") l1 = mis.st === 0 ? `🔧 PIÈCES D'HÉLICO ${mis.got}/${PARTS}` : me.wl > 0 ? "🚓 SÈME LA POLICE AVANT DE LIVRER" : "🚁 RAPPORTE-LES AU PILOTE";
    else l1 = "🎯 ÉLIMINE LA CIBLE";
    x.fillStyle = "rgba(0,0,0,.55)"; x.fillRect(10, 120, 276, 68);
    txt(`MISSION · ${mis.n}`, 18, 136, 11, "#ffd23f", "left"); txt(l1, 18, 154, 13, "#fff", "left"); txt(`⏱ ${tt}   ✖ ${TOUCH ? "ABANDONNER" : "M : ABANDONNER"}`, 18, 176, 12, "#ff9f43", "left");
    const pt = misPt();
    if (pt) {
      const a = Math.atan2(pt.y - me.y, pt.x - me.x), d = Math.hypot(pt.x - me.x, pt.y - me.y);
      if (d > 120) { const ax = W / 2 + Math.cos(a) * 96, ay = H / 2 + Math.sin(a) * 78; x.save(); x.translate(ax, ay); x.rotate(a); x.fillStyle = pt.c; x.strokeStyle = "#000"; x.lineWidth = 2; x.beginPath(); x.moveTo(15, 0); x.lineTo(-9, -10); x.lineTo(-9, 10); x.closePath(); x.fill(); x.stroke(); x.restore(); txt(`${Math.round(d / 10)} m`, ax, ay + 26, 12, pt.c); }
    } else if (mis.k === "car" && mis.st === 0) txt("cherche en ville…", W / 2, 24, 12, "#ffd23f");
  }
  function mkMini() {                                                     // fond de la minicarte, dessiné une seule fois : routes, blocs, parcs, bâtiments importants
    const S = 280, c2 = document.createElement("canvas"); c2.width = c2.height = S; const g = c2.getContext("2d"), k = S / WORLD;
    g.fillStyle = "#262a38"; g.fillRect(0, 0, S, S);
    g.strokeStyle = "rgba(255,255,255,.08)"; g.lineWidth = 1; g.beginPath();                          // lignes centrales des routes
    for (let i = 0; i <= N; i++) { g.moveTo(i * CELL * k, 0); g.lineTo(i * CELL * k, S); g.moveTo(0, i * CELL * k); g.lineTo(S, i * CELL * k); } g.stroke();
    const SP = [[POLICE, "#2f55c4", "P"], [HOSP, "#e9edf0", "+"], [GARAGE, "#6b7080", "G"], [ARMS, "#a14040", "A"], [JAIL, "#5d636b", "J"], ...HOUSES.map(h => [[h.i, h.j], "#3f7d4e", "H"])];
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      const bx = lo(i) * k, by = lo(j) * k, bs = BL * k, sp = SP.find(s => s[0][0] === i && s[0][1] === j), pk = isPark(i, j);
      g.fillStyle = sp ? sp[1] : pk ? "#2f6b2c" : hs(i, j) % 3 ? "#4b5066" : "#575d75"; g.fillRect(bx, by, bs, bs);
      g.strokeStyle = sp ? "#fff" : pk ? "#4f9a45" : "#7a8099"; g.lineWidth = sp ? 1.5 : 1; g.strokeRect(bx + .5, by + .5, bs - 1, bs - 1);
      if (pk) { g.fillStyle = "#245a22"; for (let t = 0; t < 4; t++) { g.beginPath(); g.arc(bx + 8 + hs(i + t, j) % (bs - 16), by + 8 + hs(j + t, i + 9) % (bs - 16), 3, 0, 7); g.fill(); } }
      if (sp) { g.font = "bold 18px 'Pricedown Bl',Pricedown,Impact,sans-serif"; g.textAlign = "center"; g.fillStyle = sp[0] === HOSP ? "#d62828" : "#fff"; g.fillText(sp[2], bx + bs / 2, by + bs / 2 + 6); }
    }
    return c2;
  }
  function newJob() { for (let t = 0; t < 8; t++) { const jx = (1 + Math.floor(Math.random() * (N - 1))) * CELL, jy = (1 + Math.floor(Math.random() * (N - 1))) * CELL, d = Math.hypot(jx - me.x, jy - me.y); if (d > 700 || t === 7) { job = { x: jx, y: jy, d }; return; } } }
  function control(dt) {
    let ix = 0, iy = 0;
    if (stick) { const m = Math.hypot(stick.dx, stick.dy); if (m > .18) { const k = Math.min(1, (m - .18) / .7) / m; ix = stick.dx * k; iy = stick.dy * k; } }
    else { ix = (keys.has("R") ? 1 : 0) - (keys.has("L") ? 1 : 0); iy = (keys.has("D") ? 1 : 0) - (keys.has("U") ? 1 : 0); if (ix && iy && !me.vid) { ix *= .7071; iy *= .7071; } }
    if (me.vid === HELI) { heliFly(dt, ix, iy); return; }
    if (me.vid) {
      // conduite « arcade » : ↑ accélère (et freine si on recule), ↓ freine puis recule, ←→ tourne le nez de la voiture (seulement si elle roule)
      let th = -iy, sr = ix;                                              // clavier : ↑↓ gaz/frein, ←→ volant
      if (stick) {                                                        // doigt / souris : la voiture tourne toute seule vers la direction montrée
        const m = Math.hypot(ix, iy);
        if (brakeId !== null) { th = -1; sr = ix; }
        else if (m > .05) { let d = Math.atan2(iy, ix) - me.a; d = Math.atan2(Math.sin(d), Math.cos(d)); sr = clamp(d * 2.2, -1, 1); th = Math.abs(d) < 1.6 ? Math.max(.6, m) : .5; }
        else { th = 0; sr = 0; }
      } else if (brakeId !== null) th = -1;
      const GH = me.vid === GHOST, CT = me.cop ? 0 : carTy(me.vid), MAXV = GH ? GHOST_V : 230 * SPORTV[CT] * (1 - .045 * dmSum(me.dm)), REV = 95;
      me.thr = th > 0 ? Math.min(1, th) : 0; me.sk = (th < 0 && me.v > 100) || (Math.abs(sr) > .85 && Math.abs(me.v) > 170) ? 1 : 0;   // pour le son : accélère / crisse
      if (th > 0) me.v += (me.v < -5 ? 620 : 330) * (GH ? 2.2 : CT > 2 ? 1.35 : 1) * th * dt;
      else if (th < 0) me.v -= (me.v > 10 ? 620 : 190) * -th * dt;
      else me.v -= Math.sign(me.v) * Math.min(Math.abs(me.v), 170 * dt);
      me.v = clamp(me.v, -REV, MAXV);
      me.a += sr * 2.9 * clamp(Math.abs(me.v) / 45, 0, 1) * (1 - .35 * Math.abs(me.v) / MAXV) * dt;
      const sx = me.x + Math.cos(me.a) * me.v * dt, sy = me.y + Math.sin(me.a) * me.v * dt;
      me.x = sx; me.y = sy;
      if (GH) { const o = ROAD / 2 - 13; me.x = clamp(me.x, -o, WORLD + o); me.y = clamp(me.y, -o, WORLD + o); }   // fantôme : traverse les bâtiments, seules les limites de la carte l'arrêtent
      else if (push(me, 13)) {                                                  // contre un mur : on glisse, et on ne perd de la vitesse que si on le prend de face
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
    if (me.vid && me.vid !== HELI && Math.abs(me.v) > 60) for (const [id, d] of dPeds) if (!hitDone.has(id) && Math.hypot(d.x - me.x, d.y - me.y) < 20) {
      hitDone.add(id); killQ.push(id); me.cash += 50; me.heat += .8; floats.push({ x: d.x, y: d.y - 10, t: tNow, s: "+$50", c: "#7ae582" }); beep(110, .1, "square", .05, 50); navigator.vibrate && navigator.vibrate(40);
    }
    for (const [id, d] of dCops) if (me.vid && me.vid !== HELI && Math.abs(me.v) > 60 && !hitDone.has(id) && Math.hypot(d.x - me.x, d.y - me.y) < 20) { hitDone.add(id); carQ.push([id, 255]); me.lastCar = id; me.lastCarT = tNow; me.heat = Math.min(5, me.heat + .8); beep(110, .1, "square", .05, 50); }   // policier écrasé
    if (hitDone.size > 30) for (const id of hitDone) if (!dPeds.has(id) && !dCops.has(id)) hitDone.delete(id);
    me.hurt -= dt;
    const ot = [];                                                         // autres véhicules en mouvement : [x, y, v]
    for (const d of dCars.values()) if (d.m === "d" || d.m === "c") ot.push([d.x, d.y, d.v, d.m]); else if (d.m === "p" || d.m === "s") ot.push([d.x, d.y, 0, "p"]);
    for (const [u, p] of activeP()) if (u !== myUid && p.vid && p.vid !== HELI) ot.push([dP.get(u) ? dP.get(u).x : p.x, dP.get(u) ? dP.get(u).y : p.y, p.v, "u"]);
    for (const [ox, oy, ov, om] of ot) {
      const dx = me.x - ox, dy = me.y - oy, d = Math.hypot(dx, dy);
      if (!me.vid) { if (ov > 50 && d < 19 && me.hurt <= 0) { me.hp -= Math.min(60, ov / 6) * armK(); me.hurt = .6; me.x += dx / (d || 1) * 18; me.y += dy / (d || 1) * 18; beep(90, .15, "sawtooth", .05, 40); navigator.vibrate && navigator.vibrate(80); } }
      else if (me.vid !== GHOST && me.vid !== HELI && d < 30 && ov !== undefined) { me.x += dx / (d || 1) * (30 - d); me.y += dy / (d || 1) * (30 - d); if (Math.abs(me.v) > 90) { const sv = Math.abs(me.v); me.v *= .5; dent(Math.atan2(-dy, -dx), sv > 170 ? 2 : 1); beep(100, .1, "square", .04, 30); } if (om === "c") me.heat += dt * .5; }
    }
    // police : « arrêté » si un flic est collé à toi et que tu ne fonces pas
    let copNear = false, bust = false;
    for (const d of dCars.values()) if (d.m === "c" || d.m === "s") { const dd = Math.hypot(d.x - me.x, d.y - me.y); if (dd < 500) copNear = true; if (d.m === "c" && dd < 46) bust = true; }
    for (const d of dCops.values()) { const dd = Math.hypot(d.x - me.x, d.y - me.y); if (dd < 500) copNear = true; if (dd < 30) bust = true; }
    for (const d of dHelis.values()) if (Math.hypot(d.x - me.x, d.y - me.y) < 600) copNear = true;   // un hélico de police au-dessus de toi : les étoiles ne descendent presque pas
    me.heat = Math.max(0, me.heat - dt * (copNear ? .02 : .09)); me.wl = Math.min(5, Math.ceil(me.heat - 1e-6));
    if (me.wl >= 5 && !me.w5) { me.w5 = 1; toast("🚁 5 étoiles : la police envoie des hélicoptères !"); } else if (me.wl < 4) me.w5 = 0;
    if (me.wl > 0 && bust && Math.abs(me.v) < 90) me.bust += dt; else me.bust = Math.max(0, me.bust - dt * 1.5);
    if (me.vid === GHOST) { me.hp = 100; me.bust = 0; me.hurt = 0; }
    if (me.vid === HELI) { me.bust = 0; me.hurt = 0; }   // en l'air : personne ne peut t'arrêter   // fantôme : ni blessé, ni arrêté
    if (me.bust > .9 && me.dead <= 0) { me.jT = JAIL_BASE + JAIL_STAR * Math.max(1, me.wl); die(`🚓 ARRÊTÉ ! PRISON : ${me.jT} s`, JAIL_LOSS, "police"); }
    if (me.hp <= 0) die("💀 K.O. : −10 % de ton argent", .1, "hosp");
    if (me.vid === HELI && me.hh <= 0) { me.hh = 0; die("💥 HÉLICO ABATTU : −10 % de ton argent (répare-le chez Rico)", .1, "hosp"); }
    // conflit : deux joueurs montent dans la même voiture
    if (me.vid && me.vid !== GHOST && me.vid !== HELI) for (const [u, p] of activeP()) if (u !== myUid && p.vid === me.vid && u < myUid) { me.vid = 0; me.v = 0; job = null; toast("Quelqu'un a pris cette voiture avant toi"); }
    // courses
    if (me.vid && me.vid !== HELI && !job) newJob();
    if (me.vid && job && Math.hypot(job.x - me.x, job.y - me.y) < 60) { const r = 200 + Math.round(job.d / 6); me.cash += r; floats.push({ x: me.x, y: me.y - 20, t: tNow, s: `+$${r} livraison !`, c: "#ffd23f" }); beep(660, .12, "triangle", .06); newJob(); }
  }
  function sendP(now) {
    const s = `${Math.round(me.x)},${Math.round(me.y)},${me.a.toFixed(2)},${me.vid},${me.wl},${Math.round(me.cash)},${Math.round(me.hp)},${Math.round(Math.abs(me.v))},${me.hs},${me.hid},${me.vid ? me.dm : 0},${me.wpn},${me.fc},${me.fw},${me.cs},${me.cid},${me.ca},${me.gn},${me.go},${me.gi},${me.gm},${me.hn | 0},${me.pg ? Math.round(me.pg.x) : 0},${me.pg ? Math.round(me.pg.y) : 0},${me.pg ? me.pg.a.toFixed(2) : 0},${inn ? 1 : 0},${me.vid === HELI ? me.hz.toFixed(2) : 0},${inn && jail ? Math.max(1, Math.ceil(jail.t)) : 0},${me.fuT > now ? me.fu : ""}`;
    if ((s === sentStr && now - sentAt < 700) || now - sentAt < 110) return;
    sentStr = s; sentAt = now; set(RF(`games/${c}/p/${myUid}`), s).catch(() => { });
    if (now - saveAt > 8000) { saveAt = now; persist(false); }
  }

  // ================= SON : tout est synthétisé en direct avec la Web Audio (aucun fichier audio, aucune musique existante) =================
  // Moteur à rapports de vitesse, sirène de police, klaxon (entendu par les autres joueurs), crissements, bruits de ville,
  // armes, explosions, tôle froissée, cris, argent, alerte « recherché », et une radio de voiture à 4 stations (touche R).
  let ac = null, mg = null, nbuf = null, heliV = null, eng = null, sirV = null, scrV = null, trfV = null, rIn = null, rOut = null, hornV = new Map();
  let sPrevCash = 0, sPrevWl = 0, sAmbT = 0, hornKey = false, hornId = null;
  const radio = { st: 1, next: 0, step: 0, nameT: -1e9 };
  try { const sv = +localStorage.getItem("moda.sta.radio"); if (sv >= 0 && sv <= 4) radio.st = sv; } catch { }
  const mtof = n => 440 * Math.pow(2, (n - 69) / 12);
  const A = () => {
    if (ac) return ac;
    try { ac = env.audio && env.audio(); } catch { ac = null; }
    if (!ac) return null;
    mg = ac.createGain(); mg.gain.value = .9; mg.connect(ac.destination);
    nbuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate); const d = nbuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return ac;
  };
  // bruit filtré : (départ, durée, filtre, fréquence début, fréquence fin, volume, résonance, sortie)
  const nz = (t, d, type, f0, f1, vol, q, dst) => {
    const s = ac.createBufferSource(), fl = ac.createBiquadFilter(), g = ac.createGain();
    s.buffer = nbuf; s.loop = true; fl.type = type; fl.frequency.setValueAtTime(f0, t); if (f1 !== f0) fl.frequency.exponentialRampToValueAtTime(f1, t + d); fl.Q.value = q || 1;
    g.gain.setValueAtTime(Math.max(.0002, vol), t); g.gain.exponentialRampToValueAtTime(.0001, t + d);
    s.connect(fl); fl.connect(g); g.connect(dst || mg); s.start(t, Math.random() * .8); s.stop(t + d + .03);
  };
  // note qui glisse de f0 à f1 en s'éteignant
  const sw = (t, f0, f1, d, type, vol, dst, cut) => {
    const o = ac.createOscillator(), g = ac.createGain(); o.type = type || "square"; o.frequency.setValueAtTime(f0, t); if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + d);
    g.gain.setValueAtTime(Math.max(.0002, vol), t); g.gain.exponentialRampToValueAtTime(.0001, t + d);
    if (cut) { const fl = ac.createBiquadFilter(); fl.type = "lowpass"; fl.frequency.value = cut; o.connect(fl); fl.connect(g); } else o.connect(g);
    g.connect(dst || mg); o.start(t); o.stop(t + d + .03);
  };
  // note de musique (attaque courte, filtre qui se ferme)
  const nt = (f, t, d, type, vol, dst, cut) => {
    const o = ac.createOscillator(), g = ac.createGain(); o.type = type; o.frequency.value = f;
    g.gain.setValueAtTime(.0001, t); g.gain.linearRampToValueAtTime(vol, t + .012); g.gain.exponentialRampToValueAtTime(.0001, t + d);
    if (cut) { const fl = ac.createBiquadFilter(); fl.type = "lowpass"; fl.frequency.setValueAtTime(cut[0], t); fl.frequency.exponentialRampToValueAtTime(cut[1], t + d); o.connect(fl); fl.connect(g); } else o.connect(g);
    g.connect(dst); o.start(t); o.stop(t + d + .03);
  };
  const kick = (t, v, o) => sw(t, 160, 42, .2, "sine", v, o);
  const snr = (t, v, o) => { nz(t, .15, "highpass", 1400, 1400, v, 1, o); sw(t, 200, 120, .09, "triangle", v * .6, o); };
  const hat = (t, v, op, o) => nz(t, op ? .2 : .05, "highpass", 7500, 7500, v, 1, o);
  // ---- Stations de radio (compositions originales, jouées par synthèse) ----
  const FB = [0, null, 0, null, 12, null, 0, 3, null, 5, null, 7, null, 5, 3, null], ACID = [0, 0, 12, null, 3, 0, null, 15, 0, 7, null, 10, 0, null, 5, 0];
  const PENT = [64, 67, 69, 71, 74], JCH = [[50, 53, 57, 60], [55, 59, 62, 65], [48, 52, 55, 59], [45, 49, 55, 59]], JRT = [38, 43, 36, 45], JSC = [62, 64, 65, 67, 69, 71, 72];
  const STN = [
    { n: "FUNK 88.1", bpm: 106, swing: 0, play(s, t, d, o) {                                   // funk : basse slap, accords « chicken scratch », batterie
      const st = s % 16, bar = Math.floor(s / 16) % 4, tr = [0, 0, 3, -2][bar], b = FB[st];
      if (b !== null) nt(mtof(40 + tr + b), t, d * 1.6, "sawtooth", .16, o, [900, 200]);
      if (st === 2 || st === 7 || st === 10 || st === 14) [64, 67, 71, 74].forEach(n => nt(mtof(n + tr), t, d * .9, "square", .03, o, [2800, 700]));
      if (st === 0 || st === 6 || st === 10 || (bar % 2 && st === 11)) kick(t, .5, o);
      if (st === 4 || st === 12) snr(t, .22, o);
      hat(t, st % 2 ? .05 : .09, st === 14, o);
    } },
    { n: "ROCK FM 99.5", bpm: 138, swing: 0, play(s, t, d, o) {                               // rock : accords de puissance, riff, crash
      const st = s % 16, bar = Math.floor(s / 16) % 4, r = [40, 43, 45, 38][bar];
      if (st % 2 === 0) { const L = st === 0 || st === 6 || st === 10 ? d * 3 : d * 1.2; nt(mtof(r), t, L, "sawtooth", .09, o, [1900, 500]); nt(mtof(r + 7), t, L, "sawtooth", .07, o, [1900, 500]); nt(mtof(r + 12), t, L, "sawtooth", .05, o, [1900, 500]); }
      if (bar >= 2 && (st === 0 || st === 3 || st === 6 || st === 10 || st === 12)) nt(mtof(PENT[(s * 7 + Math.floor(s / 16) * 3) % 5] + 12), t, d * 2.2, "square", .035, o, [3200, 900]);
      if (st === 0 || st === 8 || st === 10) kick(t, .6, o);
      if (st === 4 || st === 12) snr(t, .3, o);
      if (st === 0 && bar === 0) nz(t, .9, "highpass", 5000, 5000, .07, 1, o); else if (st % 2 === 0) hat(t, .06, false, o);
    } },
    { n: "TECHNO 303", bpm: 130, swing: 0, play(s, t, d, o) {                                  // techno : grosse caisse, basse acid, charleston
      const st = s % 16, bar = Math.floor(s / 16) % 4, a = ACID[st];
      if (st % 4 === 0) kick(t, .6, o);
      if (st === 4 || st === 12) nz(t, .12, "bandpass", 1800, 1800, .16, 1.5, o);
      if (st % 4 === 2) hat(t, .08, true, o); else hat(t, .03, false, o);
      if (a !== null) nt(mtof(36 + [0, 0, 3, -2][bar] + a), t, d * 1.1, "sawtooth", .12, o, [2600 + 800 * Math.sin(s / 7), 140]);
      if (st === 3 && bar % 2) [60, 63, 67].forEach(n => nt(mtof(n), t, d * 2, "triangle", .04, o, [2400, 500]));
    } },
    { n: "LOUNGE JAZZ", bpm: 96, swing: .22, play(s, t, d, o) {                                // jazz : contrebasse, ride swingué, piano électrique
      const st = s % 16, bar = Math.floor(s / 16) % 4, bt = st >> 2, rt = JRT[bar];
      if (st % 4 === 0) nt(mtof(rt + [0, 7, 12, 5][bt]), t, d * 3.4, "triangle", .22, o, [700, 220]);
      if (st === 0 || st === 4 || st === 6 || st === 8 || st === 12 || st === 14) hat(t, .05, true, o);
      if (st === 4 || st === 12) hat(t, .04, false, o);
      if (st === 0 || st === 10) JCH[bar].forEach(n => { nt(mtof(n + 12), t, d * 5, "sine", .04, o); nt(mtof(n + 24), t, d * 3, "triangle", .012, o, [3000, 800]); });
      if (st % 2 === 0 && hs(s, 13) % 5 === 0) nt(mtof(JSC[hs(s, 7) % 7] + 12), t, d * 3, "triangle", .05, o, [2600, 700]);
    } }
  ];
  function radioInit() {
    if (rIn) return;
    const hp = ac.createBiquadFilter(), lp = ac.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 130; lp.type = "lowpass"; lp.frequency.value = 4800;
    rOut = ac.createGain(); rOut.gain.value = 0; hp.connect(lp); lp.connect(rOut); rOut.connect(mg); rIn = hp;
  }
  function nextStation() {
    if (!me.vid || me.dead > 0 || !A()) return;
    radio.st = (radio.st + 1) % (STN.length + 1); radio.step = 0; radio.next = 0; radio.nameT = tNow;
    try { localStorage.setItem("moda.sta.radio", String(radio.st)); } catch { }
    const t = ac.currentTime; nz(t, .35, "bandpass", 400, 3800, .14, 2); sw(t, 600, 1900, .18, "sine", .03);          // « tuning » entre deux stations
  }
  function mkLoop(type, f, q) {
    const s = ac.createBufferSource(), fl = ac.createBiquadFilter(), g = ac.createGain();
    s.buffer = nbuf; s.loop = true; fl.type = type; fl.frequency.value = f; fl.Q.value = q || 1; g.gain.value = 0; s.connect(fl); fl.connect(g); g.connect(mg); s.start(); return { s, g, fl };
  }
  function mkHeli() {                                                     // « pof-pof-pof » des pales : bruit grave modulé à ~16 Hz
    const s = ac.createBufferSource(), fl = ac.createBiquadFilter(), am = ac.createGain(), g = ac.createGain(), l = ac.createOscillator(), lg = ac.createGain();
    s.buffer = nbuf; s.loop = true; fl.type = "lowpass"; fl.frequency.value = 260; fl.Q.value = 1.2; am.gain.value = .5; l.type = "sine"; l.frequency.value = 16; lg.gain.value = .5; g.gain.value = 0;
    l.connect(lg); lg.connect(am.gain); s.connect(fl); fl.connect(am); am.connect(g); g.connect(mg); s.start(); l.start(); return { s, l, g };
  }
  function mkSiren() {
    const o = ac.createOscillator(), l = ac.createOscillator(), lg = ac.createGain(), fl = ac.createBiquadFilter(), g = ac.createGain();
    o.type = "square"; o.frequency.value = 800; l.type = "sine"; l.frequency.value = .6; lg.gain.value = 260; l.connect(lg); lg.connect(o.frequency);
    fl.type = "lowpass"; fl.frequency.value = 1800; g.gain.value = 0; o.connect(fl); fl.connect(g); g.connect(mg); o.start(); l.start(); sirV = { o, l, g };
  }
  function hornOn(u, v, now) {
    let hv = hornV.get(u);
    if (!hv) {
      const o1 = ac.createOscillator(), o2 = ac.createOscillator(), fl = ac.createBiquadFilter(), g = ac.createGain();
      o1.type = o2.type = "square"; o1.frequency.value = 392; o2.frequency.value = 494; fl.type = "lowpass"; fl.frequency.value = 1700; g.gain.value = 0;
      o1.connect(fl); o2.connect(fl); fl.connect(g); g.connect(mg); o1.start(); o2.start(); hornV.set(u, hv = { o1, o2, g, t: now });
    }
    hv.g.gain.setTargetAtTime(v, ac.currentTime, .015); hv.t = now;
  }
  function sndStop() {
    const stop = v => { try { v && v.stop && v.stop(); } catch { } };
    if (heliV) { stop(heliV.s); stop(heliV.l); }
    if (eng) { stop(eng.o1); stop(eng.o2); } if (sirV) { stop(sirV.o); stop(sirV.l); } if (scrV) stop(scrV.s); if (trfV) stop(trfV.s);
    hornV.forEach(v => { stop(v.o1); stop(v.o2); }); hornV.clear();
    try { mg && mg.disconnect(); } catch { }
    heliV = eng = sirV = scrV = trfV = rIn = rOut = mg = ac = nbuf = null;
  }
  const dv = (px, py, r) => Math.pow(clamp(1 - Math.hypot(px - me.x, py - me.y) / (r || 520), 0, 1), 1.2);   // volume selon la distance
  const SND = {
    stop: sndStop,
    shot(w, v) {
      if (!A() || v <= .02) return; const t = ac.currentTime;
      if (w === 3) { nz(t, .28, "lowpass", 2600, 200, .5 * v, 1); sw(t, 120, 38, .22, "sawtooth", .35 * v, mg, 600); }
      else if (w === 2) { nz(t, .07, "bandpass", 2200, 900, .35 * v, 1.5); sw(t, 260, 90, .06, "square", .12 * v, mg, 1500); }
      else { nz(t, .12, "bandpass", 1800, 500, .45 * v, 1.2); sw(t, 340, 70, .1, "square", .16 * v, mg, 1800); }
    },
    boom(v) { if (!A() || v <= .02) return; const t = ac.currentTime; nz(t, .9, "lowpass", 1400, 70, .9 * v, 1); sw(t, 90, 28, .6, "sine", .7 * v); nz(t + .05, .5, "bandpass", 500, 120, .3 * v, 1); },
    crash(sev) { if (!A()) return; const t = ac.currentTime; nz(t, .22, "bandpass", 1100, 250, .25 * Math.min(1, .5 + sev * .25), 1.2); sw(t, 480, 170, .14, "square", .06); if (sev >= 2) nz(t + .02, .25, "highpass", 5200, 5200, .1, 1); },
    door() { if (!A()) return; const t = ac.currentTime; nz(t, .08, "lowpass", 900, 150, .35, 1); sw(t, 150, 60, .09, "triangle", .3); nz(t + .1, .05, "bandpass", 1500, 800, .15, 2); },
    ignition() { if (!A()) return; const t = ac.currentTime; sw(t + .1, 38, 85, .55, "sawtooth", .12, mg, 420); for (let k = 0; k < 3; k++) sw(t + k * .07, 75, 60, .05, "square", .04, mg, 500); },
    cash(big) { if (!A()) return; const t = ac.currentTime; [988, 1319].forEach((f, i) => sw(t + i * .07, f, f, .12, "square", .05)); if (big) { sw(t + .14, 1568, 1568, .25, "square", .05); nz(t + .14, .2, "highpass", 6500, 6500, .04, 1); } },
    wanted() { if (!A()) return; const t = ac.currentTime; for (let k = 0; k < 6; k++) { const f = k % 2 ? 660 : 880; sw(t + k * .11, f, f, .1, "square", .05); } },
    wasted() { if (!A()) return; const t = ac.currentTime; sw(t, 420, 70, 1, "sawtooth", .09, mg, 1500); nz(t, .5, "lowpass", 900, 90, .25, 1); sw(t + .15, 300, 50, .9, "triangle", .08); },
    thud(v) { if (!A() || v <= .02) return; const t = ac.currentTime; sw(t, 110, 40, .15, "sine", .5 * v); nz(t, .1, "lowpass", 400, 100, .3 * v, 1); },
    ped(v) {
      if (!A() || v <= .02) return; const t = ac.currentTime, o = ac.createOscillator(), g = ac.createGain(), fl = ac.createBiquadFilter();
      o.type = "sawtooth"; o.frequency.setValueAtTime(720, t); o.frequency.linearRampToValueAtTime(1150, t + .09); o.frequency.exponentialRampToValueAtTime(320, t + .42);
      fl.type = "lowpass"; fl.frequency.value = 2600; g.gain.setValueAtTime(.07 * v, t); g.gain.exponentialRampToValueAtTime(.0001, t + .45);
      o.connect(fl); fl.connect(g); g.connect(mg); o.start(t); o.stop(t + .5);
    }
  };
  function sndFrame(now) {
    if (!A()) return;
    const t = ac.currentTime, drv = me.vid && me.dead <= 0, sp = Math.abs(me.v), thr = me.thr || 0;
    mg.gain.value = env.muted && env.muted() ? 0 : .9;
    if (!sirV) mkSiren(); if (!scrV) scrV = mkLoop("bandpass", 2300, 5); if (!trfV) trfV = mkLoop("lowpass", 240, .7); radioInit();
    // (la voiture roule en silence : plus de bruit de moteur ; restent le crissement, le klaxon, les sirènes, la radio…)
    // circulation autour + sirènes de police proches
    let nc = 0, dm = 1e9;
    for (const d of dCars.values()) { const q = Math.hypot(d.x - me.x, d.y - me.y); if ((d.m === "d" || d.m === "c") && q < 320) nc++; if ((d.m === "c" || d.m === "s") && q < dm) dm = q; }
    for (const d of dP.values()) if (d.vid && Math.hypot(d.x - me.x, d.y - me.y) < 320) nc++;
    trfV.g.gain.setTargetAtTime(Math.min(.06, nc * .012), t, .3);
    { let hm = me.vid === HELI ? 0 : 1e9; for (const d of dHelis.values()) hm = Math.min(hm, Math.hypot(d.x - me.x, d.y - me.y)); for (const d of dP.values()) if (d.vid === HELI) hm = Math.min(hm, Math.hypot(d.x - me.x, d.y - me.y));
      if (!heliV) heliV = mkHeli(); heliV.g.gain.setTargetAtTime(hm < 900 ? .12 * Math.pow(1 - hm / 900, 1.4) : 0, t, .15); }
    sirV.g.gain.setTargetAtTime(dm < 700 ? .08 * Math.pow(1 - dm / 700, 1.5) : 0, t, .12);
    scrV.g.gain.setTargetAtTime(drv && me.sk ? .05 : 0, t, .04); scrV.fl.frequency.setTargetAtTime(1900 + sp * 3, t, .05);
    // klaxon (H) : les joueurs proches l'entendent aussi
    me.hn = (hornKey || hornId !== null) && drv ? 1 : 0;
    const act = new Set();
    if (me.hn) { hornOn(myUid, .09, now); act.add(myUid); }
    for (const [u, d] of dP) if (d.hn && d.vid) { const q = Math.hypot(d.x - me.x, d.y - me.y); if (q < 700) { hornOn(u, .09 * Math.pow(1 - q / 700, 1.3), now); act.add(u); } }
    hornV.forEach((v, u) => { if (!act.has(u)) { v.g.gain.setTargetAtTime(0, t, .02); if (now - v.t > 250) { try { v.o1.stop(); v.o2.stop(); } catch { } hornV.delete(u); } } });
    // radio : seulement dans une voiture
    rOut.gain.setTargetAtTime(drv && radio.st ? .55 : 0, t, .15);
    if (drv && radio.st) {
      const S = STN[radio.st - 1], d = 60 / S.bpm / 4;
      if (radio.next < t - .3) radio.next = t + .06;
      for (let n = 0; radio.next < t + .25 && n < 8; n++) { S.play(radio.step, radio.next + (S.swing && radio.step % 2 ? d * S.swing : 0), d, rIn); radio.next += d; radio.step++; }
    } else radio.next = 0;
    // argent gagné, niveau de recherche qui monte
    if (me.cash > sPrevCash + 19 && me.dead <= 0) SND.cash(me.cash - sPrevCash >= 100); sPrevCash = me.cash;
    if (me.wl > sPrevWl) SND.wanted(); sPrevWl = me.wl;
    // ambiance : klaxons et sirènes au loin
    if (now > sAmbT) {
      sAmbT = now + rr(7000, 16000);
      if (Math.random() < .65) { sw(t, 400, 400, .12, "square", .025, mg, 900); sw(t + .2, 400, 400, .25, "square", .025, mg, 900); } else sw(t, 600, 900, 1.2, "square", .02, mg, 1200);
    }
  }
  // ================= DESSIN (style GTA 1 : vue de dessus, rendu pixelisé 2×, ombres portées, toits plats) =================
const ROOF = [["#8b5a3c", "#a8714b", "#5e3a25"], ["#7d7d86", "#9a9aa5", "#55555d"], ["#a33b3b", "#c25353", "#6e2424"], ["#c9b27c", "#dcc794", "#8f7c4f"], ["#3d5a80", "#5577a3", "#27394f"], ["#6b7a3a", "#8a9a50", "#444f22"], ["#b0663a", "#cf8352", "#7a4222"], ["#9b9b9b", "#bdbdbd", "#666666"]];
const shadeC = new Map();
const shade = (hex, f) => { const k = hex + f; let v = shadeC.get(k); if (!v) { const n = parseInt(hex.slice(1), 16) || 0; v = `rgb(${Math.round((n >> 16 & 255) * f)},${Math.round((n >> 8 & 255) * f)},${Math.round((n & 255) * f)})`; shadeC.set(k, v); } return v; };
const txt = (s, px, py, size, color, al) => { x.font = `700 ${(size * .95).toFixed(1)}px 'Pricedown Bl',Pricedown,Impact,sans-serif`; x.textAlign = al || "center"; x.fillStyle = "#000"; x.fillText(s, px + 1.5, py + 1.5); x.fillStyle = color || "#fff"; x.fillText(s, px, py); };
const WALL = ["#b07a35", "#8b8d99", "#b5523c", "#c9a867", "#5f7fa8", "#8a8f4c", "#c27a3e", "#a9a49a"];
const rrect = (px, py, w, h, r) => { x.beginPath(); x.moveTo(px + r, py); x.arcTo(px + w, py, px + w, py + h, r); x.arcTo(px + w, py + h, px, py + h, r); x.arcTo(px, py + h, px, py, r); x.arcTo(px, py, px + w, py, r); x.closePath(); };
function drawCar(px, py, a, color, cop, now, id, dm) {
  const ty = cop ? 0 : carTy(id), S = 1.18, L = [38, 34, 42, 42, 38][ty] * S, Wd = [18, 16, 20, 18, 16.5][ty] * S, hl = L / 2, hw = Wd / 2;
  dm |= 0; const body = cop ? "#f3f3f3" : id === GHOST ? "#cfeeff" : color, gl = "#8fc7ea", gd = "#4f7a97";
  const cx0 = ty === 2 ? -hl + 3 : ty === 1 ? -hl + L * .3 : ty === 3 ? -hl + L * .36 : ty === 4 ? -hl + L * .38 : -hl + L * .2, cx1 = ty === 2 ? hl - L * .26 : ty === 3 ? hl - L * .34 : ty === 4 ? hl - L * .36 : hl - L * (ty === 1 ? .3 : .32), mid = (cx0 + cx1) / 2;
  x.save(); x.translate(px, py); x.rotate(a);
  if (id === GHOST) { x.globalAlpha = .5 + .18 * Math.sin(now / 160); x.shadowColor = "#7fd4ff"; x.shadowBlur = 14; }   // fantôme : translucide et lumineux
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
  if (ty === 4) {                                                                                  // roadster : décapotable, on voit l'habitacle et les deux sièges
    x.fillStyle = "#16161b"; rrect(cx0, -hw + 2.2, cx1 - cx0, Wd - 4.4, 3); x.fill(); x.fillStyle = "#3a3a44";
    x.fillRect(cx0 + 1.5, -hw + 3.4, 3.6, 5.4); x.fillRect(cx0 + 1.5, hw - 8.8, 3.6, 5.4); x.fillRect(cx0 + 5, -hw + 3.6, 4.6, 5); x.fillRect(cx0 + 5, hw - 8.6, 4.6, 5);
    x.fillStyle = "rgba(255,255,255,.5)"; x.fillRect(cx1 + L * .12, -2.4, hl - cx1 - L * .12 - 3, 1.1); x.fillRect(cx1 + L * .12, 1.3, hl - cx1 - L * .12 - 3, 1.1);
  }
  if (ty === 3) {                                                                                  // supercar : bande centrale + aileron arrière
    x.fillStyle = "rgba(10,10,14,.55)"; x.fillRect(-hl + 2, -1.1, L - 4, 2.2);
    x.fillStyle = shade(body, .6); x.fillRect(-hl - 1.5, -hw + .5, 4.5, Wd - 1); x.fillStyle = "#0c0c10"; x.fillRect(-hl - 1.5, -hw + .5, 1, Wd - 1);
  }
  if (ty === 2) { x.strokeStyle = "rgba(0,0,0,.22)"; x.lineWidth = 1; x.beginPath(); for (let t = cx0 + 6; t < cx1 - 2; t += 6) { x.moveTo(t, -hw + 3); x.lineTo(t, hw - 3); } x.stroke(); }
  x.fillStyle = "rgba(255,255,255,.28)"; x.fillRect(cx0 + 2, -hw + 3.4, cx1 - cx0 - 4, 1.4);
  if (ty === 1) { x.fillStyle = "#f4f4f4"; x.fillRect(-hl + 3, -2.4, L - 6, 1.8); x.fillRect(-hl + 3, .6, L - 6, 1.8); }   // coupé : bandes
  x.fillStyle = gl; x.beginPath(); x.moveTo(cx1, -hw + 2.8); x.lineTo(cx1 + L * .11, -hw + 4.6); x.lineTo(cx1 + L * .11, hw - 4.6); x.lineTo(cx1, hw - 2.8); x.closePath(); x.fill();   // pare-brise
  if (ty !== 2 && ty !== 4) { x.fillStyle = gd; x.fillRect(cx0 - L * .08, -hw + 3.4, L * .08, Wd - 6.8); }
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
    const lit = cop !== 1, f = Math.floor(now / 150) % 2; x.fillStyle = "#22222a"; x.fillRect(mid - 3, -hw + 2.6, 6, Wd - 5.2);
    if (lit) { x.fillStyle = f ? "rgba(255,40,40,.35)" : "rgba(40,90,255,.35)"; x.beginPath(); x.arc(mid, -hw * .45, 10, 0, 7); x.fill();
    x.fillStyle = f ? "rgba(40,90,255,.35)" : "rgba(255,40,40,.35)"; x.beginPath(); x.arc(mid, hw * .45, 10, 0, 7); x.fill(); }
    x.fillStyle = lit ? (f ? "#ff2a2a" : "#2a5bff") : "#6b2a2a"; x.fillRect(mid - 2.2, -hw + 3, 4.4, hw - 3); x.fillStyle = lit ? (f ? "#2a5bff" : "#ff2a2a") : "#2a3a6b"; x.fillRect(mid - 2.2, 0, 4.4, hw - 3);
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
  else if (p.t === 4) { x.fillStyle = "#3d4a2f"; x.fillRect(-10, -3, 20, 6); x.fillStyle = "#566644"; x.fillRect(-10, -3, 20, 1.6); x.fillStyle = "#15151a"; x.fillRect(-12, -3.6, 3, 7.2); x.fillRect(-2, 3, 3, 4); x.fillStyle = "#8b8b95"; x.fillRect(5, -3.6, 2, 7.2); x.fillStyle = "#b3261e"; x.beginPath(); x.moveTo(10, -3); x.lineTo(15, 0); x.lineTo(10, 3); x.fill(); }
  else { x.fillStyle = "#5b3a1e"; x.fillRect(-9, -2, 7, 5); x.fillStyle = "#101010"; x.fillRect(-3, -3, 12, 3); x.fillStyle = "#8b8b95"; x.fillRect(-3, -3, 12, 1.5); }
  x.restore();
}

function drawHeli(px, py, a, o) {                                                                   // hélicoptère vu de dessus (nez vers +x) : joueur ou police
  const now = o.now === undefined ? tNow : o.now, S = o.s || 1, al = o.alt === undefined ? 1 : o.alt, cop = !!o.cop, dead = !!o.dead, still = !!o.still;
  const body = o.body || (cop ? "#eef1f5" : "#2c313d"), accent = o.accent || (cop ? "#2a46a8" : "#ffd23f"), tip = o.tip || (cop ? "#e63946" : "#ffd23f");
  const dk = shade(body, .72), lt = shade(body, 1.18);
  if (o.beam && al > .5) {                                                                          // projecteur : cône + tache de lumière sur le sol
    const bx = px + Math.cos(a) * 112, by = py + Math.sin(a) * 112, nx = -Math.sin(a) * 44, ny = Math.cos(a) * 44;
    x.fillStyle = "rgba(255,255,225,.10)"; x.beginPath(); x.moveTo(px + Math.cos(a) * 20, py + Math.sin(a) * 20); x.lineTo(bx + nx, by + ny); x.lineTo(bx - nx, by - ny); x.closePath(); x.fill();
    pool(bx, by, 58, "rgba(255,255,230,.55)");
  }
  const so = 6 + 16 * al;                                                                           // ombre au sol : plus l'hélico est haut, plus elle s'écarte
  x.save(); x.translate(px + so * .6, py + so); x.rotate(a); x.scale(S, S); x.fillStyle = "rgba(0,0,0,.28)";
  x.beginPath(); x.ellipse(4, 0, 23, 10, 0, 0, 7); x.fill(); x.fillRect(-48, -2, 38, 4); x.fillRect(-50, -6, 5, 12); x.restore();
  if (!still) { x.fillStyle = "rgba(0,0,0,.09)"; x.beginPath(); x.arc(px + so * .6, py + so, 34 * S, 0, 7); x.fill(); }
  x.save(); x.translate(px, py); x.rotate(a); x.scale(S, S);
  const poly = (pts, fill) => { x.beginPath(); pts.forEach(([u, v], i) => i ? x.lineTo(u, v) : x.moveTo(u, v)); x.closePath(); x.fillStyle = fill; x.fill(); };
  x.fillStyle = "#101014"; x.fillRect(-15, -12.5, 33, 2.6); x.fillRect(-15, 9.9, 33, 2.6); x.fillRect(16, -12.5, 4, 2.6); x.fillRect(16, 9.9, 4, 2.6);   // patins
  x.fillStyle = "#1b1b22"; x.fillRect(-8, -10, 2.2, 20); x.fillRect(7, -10, 2.2, 20);                                                         // traverses
  poly([[-9, -6], [-48, -3.4], [-48, 3.4], [-9, 6]], "#0c0c10"); poly([[-9, -4.8], [-47, -2.4], [-47, 2.4], [-9, 4.8]], body);                 // poutre de queue
  poly([[-9, -4.8], [-47, -2.4], [-47, -.6], [-9, -1.4]], "rgba(255,255,255,.22)"); poly([[-9, 1.6], [-47, .8], [-47, 2.4], [-9, 4.8]], "rgba(0,0,0,.22)");
  x.fillStyle = accent; x.fillRect(-44, -.9, 34, 1.8);
  x.fillStyle = "#0c0c10"; x.fillRect(-40, -9.2, 10, 18.4); x.fillStyle = dk; x.fillRect(-39, -8.2, 8, 16.4); x.fillStyle = lt; x.fillRect(-39, -8.2, 8, 3);   // stabilisateur
  poly([[-37, -1.6], [-49.5, -1.6], [-51, 1.6], [-37, 1.6]], dk); x.fillStyle = accent; x.fillRect(-50.5, -1.1, 3, 2.2);                          // dérive
  { const ta = still || dead ? 1 : now / 22; x.fillStyle = still || dead ? "rgba(0,0,0,0)" : "rgba(210,220,230,.28)"; x.beginPath(); x.ellipse(-48, 4.6, 1.7, 6.4, 0, 0, 7); x.fill();
    x.fillStyle = "#15151a"; x.fillRect(-49, 4.6 + 5.6 * Math.sin(ta) - 1.2, 2.2, 2.4); x.fillRect(-49, 4.6 - 5.6 * Math.sin(ta) - 1.2, 2.2, 2.4); }   // rotor de queue
  const fus = () => { x.beginPath(); x.moveTo(24, 0); x.bezierCurveTo(24, -6.5, 15, -10.5, 3, -10.5); x.bezierCurveTo(-6, -10.5, -12, -7, -14, -4.8); x.lineTo(-14, 4.8); x.bezierCurveTo(-12, 7, -6, 10.5, 3, 10.5); x.bezierCurveTo(15, 10.5, 24, 6.5, 24, 0); x.closePath(); };
  fus(); x.fillStyle = body; x.fill(); x.lineJoin = "round"; x.lineWidth = 2.2; x.strokeStyle = "#0c0c10"; x.stroke();                      // fuselage
  x.save(); fus(); x.clip();
  x.fillStyle = "rgba(255,255,255,.22)"; x.fillRect(-16, -11, 42, 6); x.fillStyle = "rgba(0,0,0,.26)"; x.fillRect(-16, 5.5, 42, 6);
  if (cop) { x.fillStyle = "#2a46a8"; x.fillRect(-10, -11, 5, 22); x.fillRect(-2, -11, 2, 22); } else { x.fillStyle = accent; x.fillRect(-16, -1.3, 18, 2.6); x.fillRect(-10, -11, 2.4, 22); }
  x.fillStyle = "rgba(0,0,0,.35)"; x.fillRect(-4, -11, 1, 6); x.fillRect(-4, 5, 1, 6);                                                         // joints de portes
  x.restore();
  if (o.flash) { fus(); x.globalAlpha = .55; x.fillStyle = "#fff"; x.fill(); x.globalAlpha = 1; }
  const gp = () => { x.beginPath(); x.moveTo(21.2, 0); x.bezierCurveTo(21.2, -4.6, 15.5, -7.8, 8, -7.8); x.lineTo(8, 7.8); x.bezierCurveTo(15.5, 7.8, 21.2, 4.6, 21.2, 0); x.closePath(); };
  { const g = x.createLinearGradient(0, -8, 0, 8); g.addColorStop(0, dead ? "#2b2f33" : "#c6ecff"); g.addColorStop(1, dead ? "#15181b" : "#3d7aa8"); gp(); x.fillStyle = g; x.fill(); x.lineWidth = 1.3; x.strokeStyle = "#0c0c10"; x.stroke(); }   // verrière
  if (!dead) { poly([[10, -6.6], [17, -5.2], [16, -3.6], [9.5, -5]], "rgba(255,255,255,.4)"); poly([[11, 3], [15, 3.8], [14.4, 5], [10.4, 4.4]], "rgba(255,255,255,.22)"); }
  x.fillStyle = "#0c0c10"; x.fillRect(13.6, -7.8, 1.3, 15.6);
  rrect(-13, -7.4, 19.5, 14.8, 4); x.fillStyle = dk; x.fill(); x.strokeStyle = "#0c0c10"; x.lineWidth = 1.2; x.stroke();                      // capot moteur
  rrect(-12, -6.4, 17.5, 4.4, 2); x.fillStyle = lt; x.fill();
  x.fillStyle = "rgba(0,0,0,.4)"; for (let k = 0; k < 4; k++) x.fillRect(-11 + k * 3.6, -.8, 1.3, 6.4);                                       // grilles d'aération
  x.fillStyle = "#101014"; x.fillRect(-16, -3.6, 3.4, 2.4); x.fillRect(-16, 1.2, 3.4, 2.4);                                                   // échappements
  if (!dead) {
    x.fillStyle = "#ff3030"; x.fillRect(1, -12.2, 2.6, 2.2); x.fillStyle = "#30ff60"; x.fillRect(1, 10, 2.6, 2.2);                              // feux de position
    if (Math.floor(now / 450) % 2) { x.fillStyle = "#ff2a2a"; x.fillRect(-51.5, -1, 2.4, 2.4); pool(-50, 0, 12, "rgba(255,40,40,.45)"); }       // feu à éclats
    if (cop) {
      const f = Math.floor(now / 150) % 2; x.fillStyle = "#16161c"; x.fillRect(2, -7.4, 4, 14.8);
      x.fillStyle = f ? "#ff2a2a" : "#2a5bff"; x.fillRect(2.4, -7, 3.2, 6.6); x.fillStyle = f ? "#2a5bff" : "#ff2a2a"; x.fillRect(2.4, .4, 3.2, 6.6);
      pool(4, -4, 24, f ? "rgba(255,40,40,.5)" : "rgba(40,90,255,.5)"); pool(4, 4, 24, f ? "rgba(40,90,255,.5)" : "rgba(255,40,40,.5)");
      x.fillStyle = "#fffbe0"; x.beginPath(); x.arc(19, 0, 1.9, 0, 7); x.fill();                                                               // projecteur sous le nez
    } else { x.fillStyle = "#fff4a3"; x.fillRect(22, -3.6, 1.6, 2); x.fillRect(22, 1.6, 1.6, 2); }                                            // phares
  }
  x.fillStyle = "#0c0c10"; x.beginPath(); x.arc(0, 0, 5.4, 0, 7); x.fill(); x.fillStyle = "#3a3d49"; x.beginPath(); x.arc(0, 0, 4, 0, 7); x.fill();   // mât
  const R = 34, rot = o.rot === undefined ? now / 38 : o.rot;                                                                                  // rotor principal : 4 pales, flou de mouvement
  if (!still) { x.fillStyle = "rgba(190,205,220,.10)"; x.beginPath(); x.arc(0, 0, R, 0, 7); x.fill(); x.strokeStyle = "rgba(225,235,245,.2)"; x.lineWidth = 1; x.stroke(); }
  for (let g = 0; g < (still ? 1 : 3); g++) {
    x.save(); x.rotate(rot - g * .42); x.globalAlpha = g === 0 ? 1 : g === 1 ? .34 : .15;
    for (let b = 0; b < 4; b++) { x.save(); x.rotate(b * Math.PI / 2); x.fillStyle = "#15151a"; x.fillRect(3, -1.5, R - 3, 3); x.fillStyle = tip; x.fillRect(R - 7, -1.5, 7, 3); x.restore(); }
    x.restore();
  }
  x.globalAlpha = 1; x.fillStyle = "#2a2a32"; x.beginPath(); x.arc(0, 0, 3.4, 0, 7); x.fill(); x.fillStyle = "#9aa0b0"; x.beginPath(); x.arc(-.6, -.6, 1.7, 0, 7); x.fill();
  x.lineJoin = "miter"; x.restore();
}
function heliSmoke(px, py, a, now, k0) {                                                            // fumée noire d'un hélico abîmé
  for (let k = 0; k < 4; k++) { const u = ((now / 40 + k * 8 + k0) % 32); x.fillStyle = `rgba(45,45,45,${Math.max(0, .5 - u / 70).toFixed(2)})`; x.beginPath(); x.arc(px - Math.cos(a) * (14 + u) + Math.sin(now / 200 + k) * 2, py - Math.sin(a) * (14 + u), 4 + u / 6, 0, 7); x.fill(); }
}
function drawHeliWreck(w, now) {                                                                    // épave d'hélico : carcasse noircie, rotor figé, flammes puis fumée
  drawHeli(w.x, w.y, w.a, { alt: 0, body: "#2a2a2e", accent: "#444", tip: "#333", still: 1, dead: 1, rot: (w.id % 7) * .5 });
  if (now - w.t < 12000) for (let k = 0; k < 4; k++) { const f = Math.floor(now / 90 + k * 2) % 2; x.fillStyle = f ? "#ff7a1a" : "#ffd23f"; x.beginPath(); x.arc(w.x + Math.cos(w.a) * (k * 7 - 10) + Math.sin(now / 70 + k) * 1.5, w.y + Math.sin(w.a) * (k * 7 - 10) + Math.cos(now / 80 + k) * 2.5 - 3, 4 + (k % 2) * 2 + f, 0, 7); x.fill(); }
  for (let k = 0; k < 3; k++) { const u = ((now / 45 + k * 9) % 27); x.fillStyle = `rgba(55,55,55,${Math.max(0, .42 - u / 80).toFixed(2)})`; x.beginPath(); x.arc(w.x + Math.sin(now / 300 + k) * 3, w.y - 6 - u, 5 + u / 5, 0, 7); x.fill(); }
}
function drawRoofPad(cx, cy, sc) {                                                                  // héliport sur le toit du garage (+ ton hélico s'il est rangé)
  const now = tNow;
  x.fillStyle = "#262933"; x.beginPath(); x.arc(cx, cy, 50 * sc, 0, 7); x.fill();
  x.strokeStyle = "#ffd23f"; x.lineWidth = 3 * sc; x.beginPath(); x.arc(cx, cy, 45 * sc, 0, 7); x.stroke();
  for (let k = 0; k < 8; k++) { const an = k * Math.PI / 4 + .39; x.fillStyle = Math.floor(now / 500 + k) % 2 ? "#ff3b30" : "#5a1410"; x.fillRect(cx + Math.cos(an) * 50 * sc - 2, cy + Math.sin(an) * 50 * sc - 2, 4, 4); }
  if (me.hu && me.vid !== HELI) drawHeli(cx, cy, -Math.PI / 2, { alt: 0, still: 1, rot: .5, s: .92 * sc, accent: (lobbyP()[myUid] || {}).color || "#ffd23f", now });
  else { x.font = `bold ${Math.round(40 * sc)}px 'Pricedown Bl',Pricedown,Impact,sans-serif`; x.textAlign = "center"; x.fillStyle = "#ffd23f"; x.fillText("H", cx, cy + 14 * sc); }
}
function drawPart(q, now, labels) {                                                                 // caisse de pièces (quête du pilote)
  const b = Math.sin(now / 260) * 1.5;
  x.fillStyle = "rgba(255,183,3,.22)"; x.beginPath(); x.arc(q.x, q.y, 26 + Math.sin(now / 200) * 3, 0, 7); x.fill();
  x.fillStyle = "rgba(0,0,0,.4)"; x.fillRect(q.x - 11, q.y + 8, 24, 5);
  x.fillStyle = "#101010"; x.fillRect(q.x - 12, q.y - 11 + b, 24, 22); x.fillStyle = "#7a5230"; x.fillRect(q.x - 10.5, q.y - 9.5 + b, 21, 19);
  x.fillStyle = "#5e3d22"; x.fillRect(q.x - 10.5, q.y - 1 + b, 21, 2); x.fillStyle = "#c0c0c8"; x.fillRect(q.x - 10.5, q.y - 9.5 + b, 3, 3); x.fillRect(q.x + 7.5, q.y + 6.5 + b, 3, 3);
  labels.push(["🔧", q.x, q.y + 5 + b, "#fff", 14]); labels.push(["PIÈCES", q.x, q.y - 22, "#ffb703", 10]);
}
function drawWreck(w, now) {
  if (w.he) { drawHeliWreck(w, now); return; }
  drawCar(w.x, w.y, w.a, "#262626", false, now, w.id, 255);
  if (now - w.t < 9000) for (let k = 0; k < 3; k++) { x.fillStyle = (Math.floor(now / 90 + k) % 2) ? "#ff7a1a" : "#ffd23f"; x.beginPath(); x.arc(w.x + (k - 1) * 7 + Math.sin(now / 70 + k) * 1.5, w.y + Math.cos(now / 80 + k) * 3 - 4, 4 + (k % 2) * 2, 0, 7); x.fill(); }
}
function drawWalker(px, py, a, body, skin, ph, wpn, flash, hat, rl) {
  x.fillStyle = "rgba(0,0,0,.35)"; x.beginPath(); x.arc(px + 2, py + 2, 6, 0, 7); x.fill();
  x.save(); x.translate(px, py); x.rotate(a);
  const sw = ph !== null ? Math.sin(ph) : 0, sk = skin || "#f1c27d";
  if (ph !== null) { x.fillStyle = "#14141a"; x.fillRect(sw * 3.4 - 2, -4, 4.5, 2.8); x.fillRect(-sw * 3.4 - 2, 1.2, 4.5, 2.8); }   // pieds
  x.fillStyle = "#101010"; x.fillRect(-3.6, -6.8, 7.2, 13.6); x.fillStyle = body; x.fillRect(-2.8, -6, 5.6, 12);                   // épaules / haut
  if (wpn) {                                                                                                                        // bras tendus + arme
    x.fillStyle = sk; x.fillRect(1, -3.8, 6, 2.2); x.fillRect(1, 1.6, 6, 2.2);
    if (wpn === 1) { x.fillStyle = "#111"; x.fillRect(6, -1, 6, 2); } else if (wpn === 2) { x.fillStyle = "#111"; x.fillRect(5, -1.3, 10, 2.6); x.fillRect(8, 1.2, 2, 3); } else if (wpn === 4) {
      const rp = rl === undefined ? 1 : rl, k = rp < .5 ? 0 : (rp - .5) / .5;                                                  // rechargement : tube vide, puis la roquette glisse dans le tube
      x.fillStyle = "#3d4a2f"; x.fillRect(-2, -2.2, 17, 4.4); x.fillStyle = "#566644"; x.fillRect(-2, -2.2, 17, 1.4); x.fillStyle = "#15151a"; x.fillRect(-4, -2.8, 3, 5.6); x.fillRect(5, 2.2, 2, 3); x.fillStyle = "#8b8b95"; x.fillRect(11, -2.8, 2, 5.6);
      if (k > 0) { const sh = (1 - k) * -7; x.fillStyle = "#b3261e"; x.beginPath(); x.moveTo(15 + sh, -2.4); x.lineTo(20 + sh, 0); x.lineTo(15 + sh, 2.4); x.fill(); }   // ogive visible seulement si une roquette est chargée
      else { x.fillStyle = "#07070a"; x.fillRect(14, -2, 1.6, 4); }                                                              // bouche du tube vide
    } else { x.fillStyle = "#5b3a1e"; x.fillRect(4, -1.3, 4, 2.6); x.fillStyle = "#8b8b95"; x.fillRect(8, -1, 9, 2); }
    if (flash) { const tx = wpn === 1 ? 12 : wpn === 2 ? 15 : wpn === 4 ? 20 : 17; x.fillStyle = "#fff2a8"; x.fillRect(tx, -2.5, 4, 5); x.fillStyle = "#ff9d1e"; x.fillRect(tx + 1, -1, 6, 2); if (wpn === 4) { x.fillStyle = "rgba(255,200,120,.8)"; x.fillRect(-12, -3, 8, 6); x.fillStyle = "rgba(160,160,160,.7)"; x.fillRect(-18, -2, 6, 4); } }
  } else if (flash) {                                                                                                                // coup de poing : un bras part vers l'avant (gauche / droite en alternance)
    const pr = me.fc & 1 ? 1 : -1; x.fillStyle = sk; x.fillRect(1, pr * 3.2 - 1.1, 9, 2.2); x.beginPath(); x.arc(10.5, pr * 3.2, 2.4, 0, 7); x.fill(); x.fillRect(-1, -pr * 3.2 - 1.1, 3.2, 2.4);
  } else { x.fillStyle = sk; x.fillRect(sw * 2.4 - 1.5, -7.6, 3.2, 2.4); x.fillRect(-sw * 2.4 - 1.5, 5.2, 3.2, 2.4); }              // bras qui balancent
  x.fillStyle = "#101010"; x.beginPath(); x.arc(0, 0, 3.3, 0, 7); x.fill(); x.fillStyle = sk; x.beginPath(); x.arc(0, 0, 2.6, 0, 7); x.fill();
  if (hat) { x.fillStyle = "#0f1c4d"; x.beginPath(); x.arc(0, 0, 3.2, 0, 7); x.fill(); x.fillStyle = "#ffd23f"; x.fillRect(1.4, -.7, 1.4, 1.4); }   // casquette de policier
  else { x.fillStyle = "#2b1b10"; x.beginPath(); x.arc(-.6, 0, 2.2, 1.57, 4.71); x.fill(); }                                               // cheveux
  x.restore();
}
function drawSplat(s, al) {                                                                      // sang « GTA 1 » : étoile épineuse rouge
  const h = hs(Math.round(s.x), Math.round(s.y)); x.globalAlpha = al;
  const spike = (r0, r1, n, col, off) => { x.fillStyle = col; x.beginPath(); for (let k = 0; k < n * 2; k++) { const an = k * Math.PI / n + off, rad = k % 2 ? r0 : r1 * (.7 + ((h >>> (k % 24)) & 3) * .15); x.lineTo(s.x + Math.cos(an) * rad, s.y + Math.sin(an) * rad); } x.closePath(); x.fill(); };
  spike(4, 13, 8, "#7d0c12", h % 6); spike(3, 9, 7, "#b3141c", h % 5); spike(2, 4.5, 5, "#d9232b", h % 4);
  x.fillStyle = "#9b1018"; for (let k = 0; k < 6; k++) { const an = ((h >>> k) % 628) / 100, d = 12 + (h >>> (k + 3)) % 7; x.fillRect(s.x + Math.cos(an) * d, s.y + Math.sin(an) * d, 2, 2); }
  x.globalAlpha = 1;
}
function drawStar(cx, cy, ro, on, fl, now, i) {                                                  // étoile de recherche : dorée et brillante si active, creuse sinon
  const ri = ro * .45, path = () => { x.beginPath(); for (let k = 0; k < 10; k++) { const an = -Math.PI / 2 + k * Math.PI / 5, r = k % 2 ? ri : ro; x.lineTo(cx + Math.cos(an) * r, cy + Math.sin(an) * r); } x.closePath(); };
  x.lineJoin = "round";
  x.save(); x.translate(1.5, 2.5); path(); x.fillStyle = "rgba(0,0,0,.55)"; x.fill(); x.restore();
  if (on) {
    x.fillStyle = fl ? "rgba(255,50,50,.35)" : "rgba(50,100,255,.35)"; x.beginPath(); x.arc(cx, cy, ro + 5 + Math.sin(now / 120 + i) * 1.2, 0, 7); x.fill();
    const g = x.createLinearGradient(cx, cy - ro, cx, cy + ro); g.addColorStop(0, "#fff7b0"); g.addColorStop(.5, "#ffcf1f"); g.addColorStop(1, "#e08a00");
    path(); x.fillStyle = g; x.fill(); x.lineWidth = 2.6; x.strokeStyle = "#000"; x.stroke();
    x.lineWidth = 1; x.strokeStyle = "rgba(255,255,255,.7)"; x.beginPath(); x.moveTo(cx - ro * .55, cy - ro * .1); x.lineTo(cx - ro * .15, cy - ro * .1); x.lineTo(cx, cy - ro * .62); x.stroke();
  } else { path(); x.fillStyle = "#26262e"; x.fill(); x.lineWidth = 2.6; x.strokeStyle = "#000"; x.stroke(); x.lineWidth = 1; x.strokeStyle = "#5a5a66"; x.stroke(); }
  x.lineJoin = "miter";
}
function drawGarageZone(now) {                                                                    // pastille jaune au sol devant le garage
  const gx = GZ.x, gy = GZ.y, near = inGarage();
  x.fillStyle = near ? "rgba(255,210,63,.32)" : "rgba(255,210,63,.18)"; x.fillRect(gx - 46, gy - 9, 92, 36);
  x.strokeStyle = "#ffd23f"; x.lineWidth = 2; x.setLineDash([8, 6]); x.strokeRect(gx - 46, gy - 9, 92, 36); x.setLineDash([]);
  x.font = "700 11px 'Pricedown Bl',Pricedown,Impact,sans-serif"; x.textAlign = "center"; const t = me.g ? "GARAGE" : `$${GPRICE}`;
  x.fillStyle = "#000"; x.fillText(t, gx + 1, gy + 15); x.fillStyle = me.g ? "#fff" : "#ffe14d"; x.fillText(t, gx, gy + 14);
}
function drawLot(i, j) {                                                         // parcelle d'une maison : pelouse, clôture blanche, allée en dalles, arbres, buissons, panneau
  const k = hIdx(i, j), H = HOUSES[k], sd = BL - 2 * SW, lx0 = lo(i) + SW, ly0 = lo(j) + SW, [hx, hy, hz] = hbox(i, j), cx = hx + hz / 2, o = owns(k);
  x.fillStyle = patGrass; x.fillRect(lx0, ly0, sd, sd);
  x.fillStyle = "#34702a"; for (let n = 0; n < 6; n++) x.fillRect(lx0 + hs(i + n, j) % (sd - 30), ly0 + hs(j + n, i + 9) % (sd - 30), 30, 22);
  const py0 = hy + hz, py1 = ly0 + sd;                                              // allée de la porte jusqu'au portail
  x.fillStyle = "#c7c0ad"; x.fillRect(cx - 14, py0, 28, py1 - py0);
  x.fillStyle = "rgba(0,0,0,.18)"; for (let y2 = py0 + 10; y2 < py1; y2 += 12) x.fillRect(cx - 14, y2, 28, 1.5);
  x.fillStyle = "rgba(0,0,0,.22)"; x.fillRect(cx - 14, py0, 2, py1 - py0); x.fillRect(cx + 12, py0, 2, py1 - py0);
  const fx0 = lx0 + 3, fy0 = ly0 + 3, fx1 = lx0 + sd - 3, fy1 = ly0 + sd - 3;      // clôture
  const rail = (ax, ay, rw2, rh2) => { x.fillStyle = "rgba(0,0,0,.28)"; x.fillRect(ax + 2, ay + 2, rw2, rh2); x.fillStyle = "#f3eee2"; x.fillRect(ax, ay, rw2, rh2); };
  rail(fx0, fy0, fx1 - fx0, 3); rail(fx0, fy0, 3, fy1 - fy0); rail(fx1 - 3, fy0, 3, fy1 - fy0); rail(fx0, fy1 - 3, cx - 20 - fx0, 3); rail(cx + 20, fy1 - 3, fx1 - cx - 20, 3);
  x.fillStyle = "#fffdf5"; for (let t = fx0 + 4; t < fx1 - 4; t += 9) { x.fillRect(t, fy0 - 2, 2, 7); if (t < cx - 22 || t > cx + 22) x.fillRect(t, fy1 - 4, 2, 7); }
  x.fillStyle = H.r[0]; x.fillRect(cx - 24, fy1 - 6, 5, 10); x.fillRect(cx + 19, fy1 - 6, 5, 10);   // poteaux du portail aux couleurs du toit
  const tree = (tx, ty, r) => { x.fillStyle = "rgba(0,0,0,.3)"; x.beginPath(); x.arc(tx + 5, ty + 5, r, 0, 7); x.fill(); x.fillStyle = "#1f5a1c"; x.beginPath(); x.arc(tx, ty, r, 0, 7); x.fill(); x.fillStyle = "#2f7a28"; x.beginPath(); x.arc(tx - 1, ty - 1, r * .65, 0, 7); x.fill(); x.fillStyle = "#43963a"; x.beginPath(); x.arc(tx - 4, ty - 4, r * .3, 0, 7); x.fill(); };
  tree(lx0 + 20, ly0 + 22, 15); tree(lx0 + sd - 20, ly0 + 22, 15); if (hs(i, j) & 1) tree(lx0 + 22, ly0 + sd - 40, 12); else tree(lx0 + sd - 22, ly0 + sd - 40, 12);
  const bush = (bx2, by2) => { x.fillStyle = "#245a22"; x.beginPath(); x.arc(bx2, by2, 8, 0, 7); x.fill(); x.fillStyle = "#3f9a38"; x.beginPath(); x.arc(bx2 - 1.5, by2 - 1.5, 5, 0, 7); x.fill(); };
  [18, 34, hz - 34, hz - 18].forEach(d => bush(hx + d, hy + hz + 9));
  for (let n = 0; n < 8; n++) { x.fillStyle = [H.r[1], "#ffd23f", "#fff", "#ff8fa3"][n & 3]; x.fillRect(hx + 10 + (n * 37) % (hz - 20), hy + hz + 16 + (n % 3) * 4, 3, 3); }   // plate-bande fleurie
  const sx = cx + 46, sy = ly0 + sd - 44;                                          // panneau devant la maison
  x.fillStyle = "#5a3a22"; x.fillRect(sx - 1.5, sy, 3, 20);
  x.fillStyle = o ? "#2e7d3a" : me.hou ? "#6b7080" : "#c9302c"; x.fillRect(sx - 30, sy - 24, 60, 25); x.strokeStyle = "#fff"; x.lineWidth = 1.5; x.strokeRect(sx - 29, sy - 23, 58, 23);
  x.font = "bold 9px 'Pricedown Bl',Pricedown,Impact,sans-serif"; x.textAlign = "center"; x.fillStyle = "#fff";
  x.fillText(o ? "MA MAISON" : me.hou ? "NON DISPO" : "À VENDRE", sx, sy - 13); x.fillText(o ? "✔" : me.hou ? "(1 MAX)" : "$" + H.p, sx, sy - 3);
}
function drawWorld(vx0, vy0, vx1, vy1) {
  x.fillStyle = "#1b1b1f"; x.fillRect(vx0, vy0, vx1 - vx0, vy1 - vy0);
  const R2 = ROAD / 2, rx0 = Math.max(vx0, -R2), ry0 = Math.max(vy0, -R2), rx1 = Math.min(vx1, WORLD + R2), ry1 = Math.min(vy1, WORLD + R2);
  if (rx1 <= rx0 || ry1 <= ry0) return;
  x.fillStyle = patRoad; x.fillRect(rx0, ry0, rx1 - rx0, ry1 - ry0);
  const ia = Math.max(0, Math.ceil((vx0 - R2) / CELL)), ib = Math.min(N, Math.floor((vx1 + R2) / CELL)), ja = Math.max(0, Math.ceil((vy0 - R2) / CELL)), jb = Math.min(N, Math.floor((vy1 + R2) / CELL));
  x.lineWidth = 2;
  for (let i = ia; i <= ib; i++) { const cx = i * CELL; x.setLineDash([]); x.strokeStyle = "#d9d9d9"; x.beginPath(); x.moveTo(cx - 44, ry0); x.lineTo(cx - 44, ry1); x.moveTo(cx + 44, ry0); x.lineTo(cx + 44, ry1); x.stroke(); x.strokeStyle = "#e6c83c"; x.setLineDash([16, 16]); x.lineDashOffset = ((ry0 % 32) + 32) % 32; x.beginPath(); x.moveTo(cx, ry0); x.lineTo(cx, ry1); x.stroke(); }
  for (let j = ja; j <= jb; j++) { const cy = j * CELL; x.setLineDash([]); x.strokeStyle = "#d9d9d9"; x.beginPath(); x.moveTo(rx0, cy - 44); x.lineTo(rx1, cy - 44); x.moveTo(rx0, cy + 44); x.lineTo(rx1, cy + 44); x.stroke(); x.strokeStyle = "#e6c83c"; x.setLineDash([16, 16]); x.lineDashOffset = ((rx0 % 32) + 32) % 32; x.beginPath(); x.moveTo(rx0, cy); x.lineTo(rx1, cy); x.stroke(); }
  x.setLineDash([]); x.lineDashOffset = 0;
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
    if (hIdx(i, j) >= 0) drawLot(i, j);
    if (i === GARAGE[0] && j === GARAGE[1]) drawGarageZone(tNow);
    else if (i === ARMS[0] && j === ARMS[1]) drawZone(ZONES.arms);
    else if (i === HOSP[0] && j === HOSP[1]) drawZone(ZONES.heal);
    else if (i === JAIL[0] && j === JAIL[1]) drawZone(ZONES.jail);
    else if (hIdx(i, j) >= 0) drawHouseZone(hIdx(i, j));
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
    const h = hs(i, j), [ox, oy, bw] = hbox(i, j), jl = i === JAIL[0] && j === JAIL[1], pol = i === POLICE[0] && j === POLICE[1], hos = i === HOSP[0] && j === HOSP[1], gar = i === GARAGE[0] && j === GARAGE[1], arm = i === ARMS[0] && j === ARMS[1], hk = hIdx(i, j);
    const pal = gar ? ["#4a4e5a", "#6b7080", "#2d3039"] : pol ? ["#2f55c4", "#5a7fe0", "#1c3585"] : hos ? ["#e9edf0", "#ffffff", "#aab3ba"] : arm ? ["#7a2a2a", "#a14040", "#4a1616"] : jl ? ["#5d636b", "#7d858f", "#3c4148"] : hk >= 0 ? HOUSES[hk].r : ROOF[h % ROOF.length];
    const wc = gar ? "#59606f" : pol ? "#3f66d0" : hos ? "#e3e8ec" : arm ? "#8a3a3a" : jl ? "#7b8189" : hk >= 0 ? HOUSES[hk].w : WALL[h % 8], k = .17 * (pol || hos || gar || arm || jl ? 1.1 : hk >= 0 ? .55 : .8 + (h % 4) * .13);
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
      if (hk >= 0) {                                                                // maison : 2 fenêtres de chaque côté de la porte (mur sud), 1 au milieu ailleurs, volets colorés
        const quad = (p1, p2, p3, p4) => { x.beginPath(); x.moveTo(p1[0], p1[1]); x.lineTo(p2[0], p2[1]); x.lineTo(p3[0], p3[1]); x.lineTo(p4[0], p4[1]); x.closePath(); };
        const south = g0[1] === oy + bw && g1[1] === oy + bw;
        (south ? [.2, .8] : [.5]).forEach(tc2 => {
          const w3 = .085, u0 = .34, u1 = .78;
          x.fillStyle = HOUSES[hk].r[0]; quad(Q(tc2 - w3 - .05, u0), Q(tc2 - w3, u0), Q(tc2 - w3, u1), Q(tc2 - w3 - .05, u1)); x.fill(); quad(Q(tc2 + w3, u0), Q(tc2 + w3 + .05, u0), Q(tc2 + w3 + .05, u1), Q(tc2 + w3, u1)); x.fill();
          x.fillStyle = "#9fd3ee"; quad(Q(tc2 - w3, u0), Q(tc2 + w3, u0), Q(tc2 + w3, u1), Q(tc2 - w3, u1)); x.fill();
          x.strokeStyle = "#fff"; x.lineWidth = 2; x.stroke();
          x.lineWidth = 1; x.beginPath(); const m1 = Q(tc2, u0), m2 = Q(tc2, u1), m3 = Q(tc2 - w3, (u0 + u1) / 2), m4 = Q(tc2 + w3, (u0 + u1) / 2); x.moveTo(m1[0], m1[1]); x.lineTo(m2[0], m2[1]); x.moveTo(m3[0], m3[1]); x.lineTo(m4[0], m4[1]); x.stroke();
        });
      } else for (let c = 0; c < nc; c++) for (let r = 0; r < nr; r++) {
        const t0 = (c + .2) / nc, t1 = (c + .8) / nc, u0 = .1 + (r + .15) / nr * .82, u1 = .1 + (r + .75) / nr * .82, hv = (h >>> ((c + r * 3) % 28)) & 3;
        x.fillStyle = gar ? (hv & 1 ? "#20232b" : "#2c303a") : pol ? (hv & 1 ? "#e8f0ff" : "#aac0ff") : hos ? (hv & 1 ? "#8fc7ea" : "#cfe9f7") : jl ? "#101216" : hk >= 0 ? ["#f4d58d", "#e9c46a", "#9ad1d4", "#f4d58d"][hv] : ["#3b84b3", "#2f6f9c", "#b84455", "#58a0c4"][hv];
        const a1 = Q(t0, u0), a2 = Q(t1, u0), a3 = Q(t1, u1), a4 = Q(t0, u1);
        x.beginPath(); x.moveTo(a1[0], a1[1]); x.lineTo(a2[0], a2[1]); x.lineTo(a3[0], a3[1]); x.lineTo(a4[0], a4[1]); x.closePath(); x.fill();
        x.strokeStyle = "rgba(0,0,0,.45)"; x.lineWidth = 1; x.stroke();
        if (jl) { x.strokeStyle = "#9aa1ad"; x.beginPath(); for (let b = 1; b < 4; b++) { const p1 = Q(t0 + (t1 - t0) * b / 4, u0), p2 = Q(t0 + (t1 - t0) * b / 4, u1); x.moveTo(p1[0], p1[1]); x.lineTo(p2[0], p2[1]); } x.stroke(); }   // barreaux
      }
      if ((gar || arm || jl || hk >= 0) && g0[1] === oy + bw && g1[1] === oy + bw) {                                      // la porte (mur sud) : E pour entrer
        const dX = gar ? GZ.x : hk >= 0 ? HZ[hk].x : jl ? ZONES.jail.x : ZONES.arms.x, hwd = (gar ? 34 : jl ? 26 : hk >= 0 ? 22 : 18) / bw, tc = (dX - ox) / bw, uh = gar ? .56 : hk >= 0 ? .5 : .62, dc = gar ? "#ffd23f" : hk >= 0 ? (owns(hk) ? "#7ae582" : "#ffd23f") : jl ? "#ff6b6b" : "#ff5a4d", pt = (a, b) => { x.lineTo(a[0], a[1]); };
        const d1 = Q(tc - hwd, 0), d2 = Q(tc + hwd, 0), d3 = Q(tc + hwd, uh), d4 = Q(tc - hwd, uh);
        x.fillStyle = gar ? "#7d8190" : jl ? "#15171b" : hk >= 0 ? "#5a3a22" : "#241012"; x.beginPath(); x.moveTo(d1[0], d1[1]); pt(d2); pt(d3); pt(d4); x.closePath(); x.fill();
        if (gar) { x.strokeStyle = "rgba(0,0,0,.38)"; x.lineWidth = 1; x.beginPath(); for (let s2 = 1; s2 < 8; s2++) { const p = Q(tc - hwd, uh * s2 / 8), q = Q(tc + hwd, uh * s2 / 8); x.moveTo(p[0], p[1]); x.lineTo(q[0], q[1]); } x.stroke(); }
        else if (jl) { x.strokeStyle = "#aeb4bf"; x.lineWidth = 2; x.beginPath(); for (let s3 = 1; s3 < 7; s3++) { const tt = tc - hwd + 2 * hwd * s3 / 7, p3 = Q(tt, 0), q3 = Q(tt, uh); x.moveTo(p3[0], p3[1]); x.lineTo(q3[0], q3[1]); } x.stroke(); }   // grille de la porte
        else if (hk < 0) { const e1 = Q(tc - hwd * .7, .06), e2 = Q(tc + hwd * .7, .06), e3 = Q(tc + hwd * .7, uh - .08), e4 = Q(tc - hwd * .7, uh - .08); x.globalAlpha = .6; x.fillStyle = "#ff9a8a"; x.beginPath(); x.moveTo(e1[0], e1[1]); pt(e2); pt(e3); pt(e4); x.closePath(); x.fill(); x.globalAlpha = 1; }
        x.strokeStyle = dc; x.lineWidth = 2; x.beginPath(); x.moveTo(d1[0], d1[1]); pt(d4); pt(d3); pt(d2); x.stroke();
        const s1 = Q(tc - hwd, uh + .05), s2b = Q(tc + hwd, uh + .05), s3 = Q(tc + hwd, uh + .15), s4 = Q(tc - hwd, uh + .15);
        x.fillStyle = dc; x.beginPath(); x.moveTo(s1[0], s1[1]); pt(s2b); pt(s3); pt(s4); x.closePath(); x.fill();   // enseigne lumineuse
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
    if (pol) { x.fillStyle = "#fff"; x.fillRect(rx + 14 * sc, ry + rw / 2 - 26 * sc, rw - 28 * sc, 3); x.fillRect(rx + 14 * sc, ry + rw / 2 + 24 * sc, rw - 28 * sc, 3); x.font = `bold ${Math.round(28 * sc)}px 'Pricedown Bl',Pricedown,Impact,sans-serif`; x.textAlign = "center"; x.fillText("POLICE", rx + rw / 2, ry + rw / 2 + 9 * sc); }
    else if (hos) { x.strokeStyle = "#d62828"; x.lineWidth = 4; x.beginPath(); x.arc(rx + rw / 2, ry + rw / 2, 46 * sc, 0, 7); x.stroke(); x.fillStyle = "#d62828"; x.fillRect(rx + rw / 2 - 8 * sc, ry + rw / 2 - 26 * sc, 16 * sc, 52 * sc); x.fillRect(rx + rw / 2 - 26 * sc, ry + rw / 2 - 8 * sc, 52 * sc, 16 * sc); }
    else if (gar) { x.fillStyle = "#ffd23f"; x.fillRect(rx + 14 * sc, ry + 22 * sc, rw - 28 * sc, 3); x.fillRect(rx + 14 * sc, ry + rw - 25 * sc, rw - 28 * sc, 3); x.font = `bold ${Math.round(24 * sc)}px 'Pricedown Bl',Pricedown,Impact,sans-serif`; x.textAlign = "center"; x.fillStyle = "#fff"; x.fillText("GARAGE", rx + rw / 2, ry + 52 * sc); drawRoofPad(rx + rw / 2, ry + rw / 2 + 10 * sc, sc); }
    else if (arm) { x.strokeStyle = "#ffb4a8"; x.lineWidth = 3; const cx2 = rx + rw / 2, cy2 = ry + rw / 2 - 8 * sc; x.beginPath(); x.arc(cx2, cy2, 38 * sc, 0, 7); x.stroke(); x.beginPath(); x.moveTo(cx2 - 52 * sc, cy2); x.lineTo(cx2 + 52 * sc, cy2); x.moveTo(cx2, cy2 - 52 * sc); x.lineTo(cx2, cy2 + 52 * sc); x.stroke(); x.font = `bold ${Math.round(24 * sc)}px 'Pricedown Bl',Pricedown,Impact,sans-serif`; x.textAlign = "center"; x.fillStyle = "#fff"; x.fillText("ARMURERIE", rx + rw / 2, ry + rw / 2 + 74 * sc); }
    else if (jl) {                                                                                       // prison : toit béton, grillage, barbelés, 4 miradors à lumière rouge, plaque PRISON
      x.fillStyle = "#4b5159"; x.fillRect(rx + 10 * sc, ry + 10 * sc, rw - 20 * sc, rw - 20 * sc);
      x.strokeStyle = "#9aa1ad"; x.lineWidth = 1; x.beginPath(); for (let t = 10 * sc; t < rw - 10 * sc; t += 8 * sc) { x.moveTo(rx + t, ry + 10 * sc); x.lineTo(rx + t, ry + rw - 10 * sc); x.moveTo(rx + 10 * sc, ry + t); x.lineTo(rx + rw - 10 * sc, ry + t); } x.stroke();
      x.strokeStyle = "#d9dde4"; x.lineWidth = 2; x.setLineDash([3, 3]); x.strokeRect(rx + 10 * sc, ry + 10 * sc, rw - 20 * sc, rw - 20 * sc); x.setLineDash([]);
      [[0, 0], [1, 0], [0, 1], [1, 1]].forEach(([a2, b2]) => { const tx = rx + (a2 ? rw - 40 * sc : 4 * sc), ty = ry + (b2 ? rw - 40 * sc : 4 * sc); x.fillStyle = "rgba(0,0,0,.35)"; x.fillRect(tx + 4, ty + 4, 36 * sc, 36 * sc); x.fillStyle = pal[2]; x.fillRect(tx, ty, 36 * sc, 36 * sc); x.fillStyle = pal[1]; x.fillRect(tx + 3 * sc, ty + 3 * sc, 30 * sc, 30 * sc); x.fillStyle = Math.floor(tNow / 400) % 2 ? "#ff3b30" : "#7a1a16"; x.beginPath(); x.arc(tx + 18 * sc, ty + 18 * sc, 6 * sc, 0, 7); x.fill(); });
      x.fillStyle = "#1c1e23"; x.fillRect(rx + rw / 2 - 52 * sc, ry + rw / 2 - 16 * sc, 104 * sc, 32 * sc); x.font = `bold ${Math.round(22 * sc)}px 'Pricedown Bl',Pricedown,Impact,sans-serif`; x.textAlign = "center"; x.fillStyle = "#ff6b6b"; x.fillText("PRISON", rx + rw / 2, ry + rw / 2 + 8 * sc); }
    else if (hk >= 0) {                                                                                  // maison : toit à deux pentes (nord clair, sud sombre), faîtage, tuiles, cheminée, lucarne
      x.fillStyle = pal[1]; x.fillRect(rx, ry, rw, rw / 2); x.fillStyle = pal[0]; x.fillRect(rx, ry + rw / 2, rw, rw / 2);
      x.strokeStyle = "rgba(0,0,0,.2)"; x.lineWidth = 1; x.beginPath(); for (let t = 9 * sc; t < rw / 2 - 2; t += 9 * sc) { x.moveTo(rx, ry + t); x.lineTo(rx + rw, ry + t); x.moveTo(rx, ry + rw - t); x.lineTo(rx + rw, ry + rw - t); } x.stroke();
      x.fillStyle = pal[2]; x.fillRect(rx - 2, ry + rw / 2 - 3, rw + 4, 6); x.fillStyle = pal[1]; x.fillRect(rx - 2, ry + rw / 2 - 3, rw + 4, 2);
      x.fillStyle = "rgba(0,0,0,.28)"; x.fillRect(rx, ry + rw - 7, rw, 7); x.fillStyle = pal[2]; x.fillRect(rx, ry, rw, 4);
      const dwx = rx + rw * .5 - 14 * sc, dwy = ry + rw * .62; x.fillStyle = "rgba(0,0,0,.3)"; x.fillRect(dwx + 3, dwy + 3, 28 * sc, 22 * sc); x.fillStyle = wc; x.fillRect(dwx, dwy, 28 * sc, 22 * sc); x.fillStyle = "#9fd3ee"; x.fillRect(dwx + 4 * sc, dwy + 5 * sc, 20 * sc, 14 * sc); x.fillStyle = pal[2]; x.fillRect(dwx - 2 * sc, dwy - 3 * sc, 32 * sc, 4 * sc);
      const chx = rx + rw * .7, chy = ry + rw * .12; x.fillStyle = "rgba(0,0,0,.3)"; x.fillRect(chx + 3, chy + 3, 20 * sc, 26 * sc); x.fillStyle = "#8a4b3a"; x.fillRect(chx, chy, 20 * sc, 26 * sc); x.fillStyle = "#b3624e"; x.fillRect(chx, chy, 20 * sc, 4 * sc); x.fillStyle = "#2b2220"; x.fillRect(chx + 4 * sc, chy + 6 * sc, 12 * sc, 14 * sc); }
    else for (let n = 0; n < 3; n++) { const w = 18 + (h >>> (n * 5)) % 18, hh = 14 + (h >>> (n * 4 + 2)) % 16, px = rx + (22 + (h >>> (n * 6)) % (bw - 70)) * sc, py = ry + (22 + (h >>> (n * 7 + 1)) % (bw - 60)) * sc; x.fillStyle = pal[1]; x.fillRect(px, py, w * sc, hh * sc); x.fillStyle = pal[2]; x.fillRect(px, py + (hh - 3) * sc, w * sc, 3); x.fillRect(px + (w - 3) * sc, py, 3, hh * sc); }
  });
}
function drawTruck(q, now, labels) {
  const L = 54, Wd = 24, hl = L / 2, hw = Wd / 2;
  x.save(); x.translate(q.x, q.y); x.rotate(q.a);
  x.fillStyle = "rgba(0,0,0,.4)"; rrect(-hl + 4, -hw + 4, L, Wd, 4); x.fill();
  x.fillStyle = "#08080c"; [[-hl * .62, -1], [hl * .5, -1], [-hl * .62, 1], [hl * .5, 1]].forEach(([wx, sd]) => x.fillRect(wx - 5, sd < 0 ? -hw - 2 : hw - 1.4, 10, 3.4));
  x.fillStyle = "#0c0c10"; rrect(-hl - 1, -hw - 1, L + 2, Wd + 2, 5); x.fill();
  x.fillStyle = q.hit > 0 ? "#fff" : "#5f6f7d"; rrect(-hl, -hw, L, Wd, 4); x.fill();                       // caisse blindée
  x.fillStyle = "#47545f"; x.fillRect(-hl + 3, -hw + 3, L * .62, Wd - 6);
  x.fillStyle = "#ffd23f"; x.font = "bold 15px 'Pricedown Bl',Pricedown,Impact,sans-serif"; x.textAlign = "center"; x.fillText("$", -hl + 3 + L * .31, 5);
  x.fillStyle = "#8fc7ea"; x.fillRect(hl - 15, -hw + 3, 9, Wd - 6);                                       // cabine + pare-brise
  x.fillStyle = "#e9edf0"; x.fillRect(hl - 3, -hw + 2, 2, 4); x.fillRect(hl - 3, hw - 6, 2, 4);             // phares
  x.restore();
  x.fillStyle = "#000"; x.fillRect(q.x - 21, q.y - 30, 42, 6); x.fillStyle = q.hp / q.mx > .4 ? "#3ee62f" : "#ff3b30"; x.fillRect(q.x - 20, q.y - 29, 40 * clamp(q.hp / q.mx, 0, 1), 4);
  labels.push(["🚚", q.x, q.y - 36, "#fff", 18]);
}
function frame(now) {
  if (!active) { raf = 0; return; }
  raf = requestAnimationFrame(frame);
  const dt = Math.min(.05, (now - (tPrev || now)) / 1000); tPrev = now; tNow = now;
  const k = 1 - Math.exp(-13 * dt);
  for (const d of dPeds.values()) { d.x += (d.tx - d.x) * k; d.y += (d.ty - d.y) * k; d.a = angLerp(d.a, d.ta, k); }
  for (const d of dCops.values()) { d.x += (d.tx - d.x) * k; d.y += (d.ty - d.y) * k; d.a = angLerp(d.a, d.ta, k); }
  for (const d of dHelis.values()) { if (Math.abs(d.tx - d.x) + Math.abs(d.ty - d.y) > 300) { d.x = d.tx; d.y = d.ty; } else { d.x += (d.tx - d.x) * k; d.y += (d.ty - d.y) * k; } d.a = angLerp(d.a, d.ta, k); }
  for (const d of dCars.values()) { if (Math.abs(d.tx - d.x) + Math.abs(d.ty - d.y) > 250) { d.x = d.tx; d.y = d.ty; } else { d.x += (d.tx - d.x) * k; d.y += (d.ty - d.y) * k; } d.a = angLerp(d.a, d.ta, k); }
  const lp = lobbyP();
  for (const [u, p] of activeP()) { if (u === myUid) continue; let d = dP.get(u); if (!d) dP.set(u, d = { x: p.x, y: p.y, a: p.a }); if (Math.abs(p.x - d.x) + Math.abs(p.y - d.y) > 300) { d.x = p.x; d.y = p.y; } else { d.x += (p.x - d.x) * k; d.y += (p.y - d.y) * k; } d.a = angLerp(d.a, p.a, k); d.vid = p.vid; d.cash = p.cash; d.wl = p.wl; d.v = p.v; d.dm = p.dm; d.wpn = p.wpn; d.hn = p.hn; d.ib = p.ib; d.hz = p.hz; }
  for (const u of dP.keys()) if (!lp[u]) dP.delete(u);
  if (me.dead > 0) { me.dead -= dt; if (me.dead <= 0) { if (me.where === "police") startJail(); else if (me.hsp >= 0 && owns(me.hsp)) spawnAtHouse(me.hsp); else spawnAt(SPAWN[me.where || "hosp"]); } }
  else { if (useReq) { useReq = 0; useKey(); } if (inn) { innControl(dt); missions(dt); } else { control(dt); interact(dt); weapons(dt, now); missions(dt); } }
  stepRockets(dt, now);                                                  // les roquettes volent même si je suis mort ou dans un bâtiment
  useReq = 0; if (me.vid) me.carT += dt;
  sendP(now); sndFrame(now);
  if (inn) { frameInside(now); return; }
  // caméra (zoom fixe par paliers : l'image pixelisée reste nette)
  const spd = me.vid ? Math.abs(me.v) : 0, tz = me.vid ? 1.1 - Math.min(.2, spd / 230 * .2) : 1.45;
  cam.z += (tz - cam.z) * Math.min(1, 3 * dt);
  cam.x += (me.x + (me.vid ? Math.cos(me.a) * me.v * .12 : 0) - cam.x) * Math.min(1, 9 * dt); cam.y += (me.y + (me.vid ? Math.sin(me.a) * me.v * .12 : 0) - cam.y) * Math.min(1, 9 * dt);
  const S = cv.width / W, z = cam.z, vw = W / z, vh = H / z, vx0 = cam.x - vw / 2, vy0 = cam.y - vh / 2, vx1 = vx0 + vw, vy1 = vy0 + vh;
  const boomPower = booms.reduce((v,b)=>{const age=now-b.t,dist=Math.hypot(b.x-me.x,b.y-me.y),power=1.65;return age>=0&&age<680?Math.max(v,(1-age/680)*Math.max(0,1-dist/1250)*power):v;},0), shake=boomPower*8;
   const tx = Math.round((W / 2 - cam.x * z) / LR + (shake?Math.sin(now*.12)*shake:0)), ty = Math.round((H / 2 - cam.y * z) / LR + (shake?Math.cos(now*.15)*shake*.7:0)), sxy = (wx, wy) => [wx * z + tx * LR, wy * z + ty * LR];
  const labels = [];
  x = lx; x.setTransform(z / LR, 0, 0, z / LR, tx, ty);                              // le monde est dessiné en basse résolution…
  drawWorld(vx0, vy0, vx1, vy1);
  const inV = (px, py) => px > vx0 - 60 && px < vx1 + 60 && py > vy0 - 60 && py < vy1 + 60;
  splats.forEach(s => { const a = 1 - (now - s.t) / 30000; if (a > 0 && inV(s.x, s.y)) drawSplat(s, a); });
  splats = splats.filter(s => now - s.t < 30000);
  for (const p of PICKS) if (inV(p.x, p.y) && !(pickT.has(p.id) && now - pickT.get(p.id) < 45000)) drawPick(p, now);
  wrecks = wrecks.filter(w => now - w.t < 25000); wrecks.forEach(w => { if (inV(w.x, w.y)) drawWreck(w, now); });
  for (const [cid, d] of dCops) if (!hitDone.has(cid) && inV(d.x, d.y)) drawWalker(d.x, d.y, d.a, "#2a46a8", "#f1c27d", Math.hypot(d.tx - d.x, d.ty - d.y) > 1.2 ? now / 85 : null, 1, now - (d.flash || -1e9) < 70, true);
  ejected = ejected.filter(q => now - q.t < 6300); ejected.forEach(q => { if (inV(q.x, q.y)) drawEjected(q, now); });
  // Objets de quête : halo animé et icônes contrastées directement dans la ville.
  if (me.rpgQuest && me.rpgParts.length<3) RPG_PART_SPOTS.forEach((q,i)=>{ if(!me.rpgParts.includes(i)&&inV(q.x,q.y)){
    const pulse=.7+.3*Math.sin(now/150); x.save(); x.globalAlpha=pulse; x.fillStyle="rgba(255,205,45,.3)"; x.beginPath(); x.arc(q.x,q.y,19,0,7); x.fill();
    x.fillStyle="#ffd23f"; x.strokeStyle="#4b3100"; x.lineWidth=2.5; x.beginPath(); x.arc(q.x,q.y,10,0,7); x.fill(); x.stroke();
    x.fillStyle="#fff6bd"; x.fillRect(q.x-2,q.y-6,4,12); x.fillRect(q.x-6,q.y-2,12,4); x.restore();
  }});
  if (me.ammoQuest && !me.rpgAmmoUnlocked && pw === 1 && inV(POWDER_SPOT.x, POWDER_SPOT.y)) {
    const q = POWDER_SPOT, pulse = .7 + .3 * Math.sin(now / 150); x.save(); x.globalAlpha = pulse; x.fillStyle = "rgba(255,140,40,.3)"; x.beginPath(); x.arc(q.x, q.y, 22, 0, 7); x.fill();
    x.fillStyle = "#ff9a3d"; x.strokeStyle = "#4b2200"; x.lineWidth = 2.5; x.fillRect(q.x - 8, q.y - 8, 16, 16); x.strokeRect(q.x - 8, q.y - 8, 16, 16); x.fillStyle = "#fff"; x.fillRect(q.x - 5, q.y - 1, 10, 3); x.restore();
    labels.push(["🧨", q.x, q.y - 22 + Math.sin(now / 200) * 3, "#ff9a3d", 18]);
  }
  for (const [pid, d] of dPeds) if (!hitDone.has(pid) && inV(d.x, d.y)) drawWalker(d.x, d.y, d.a, SHIRT[d.sk % 6], SKIN[d.sk % 6], now / 85 + d.tx);
  for (const g of GIVERS) if (inV(g.x, g.y)) {
    const dd = Math.hypot(g.x - me.x, g.y - me.y); drawWalker(g.x, g.y, dd < 170 ? Math.atan2(me.y - g.y, me.x - g.x) : g.a, g.sh, SKIN[g.sk], null, 0, false);
    labels.push([g.n, g.x, g.y - 20, "#fff"]); if (!mis) labels.push(["❗", g.x, g.y - 38 + Math.sin(now / 200) * 3, "#ffd23f", 20]);
  }
  if (inV(RPG_CONTACT.x,RPG_CONTACT.y)) {
    const dd=Math.hypot(RPG_CONTACT.x-me.x,RPG_CONTACT.y-me.y), pa=dd<170?Math.atan2(me.y-RPG_CONTACT.y,me.x-RPG_CONTACT.x):RPG_CONTACT.a;
    drawWalker(RPG_CONTACT.x,RPG_CONTACT.y,pa,RPG_CONTACT.sh,SKIN[RPG_CONTACT.sk],null,0,false);
    x.save(); x.translate(RPG_CONTACT.x,RPG_CONTACT.y); x.fillStyle="#30343b"; x.fillRect(-5,-10,10,4); x.fillStyle="#ffd23f"; x.fillRect(-3,-12,6,2); x.restore();
    if(dd<245){ labels.push([RPG_CONTACT.n,RPG_CONTACT.x,RPG_CONTACT.y-20,"#fff"]); labels.push(["🧩",RPG_CONTACT.x,RPG_CONTACT.y-38+Math.sin(now/200)*3,"#ffd23f",19]); }
  }
  if (bmOn()) { const q = bmPos(); if (inV(q.x, q.y)) {
    const L = 104, Wd = 40, t0 = q.y - L / 2;
    x.save(); x.fillStyle = "rgba(0,0,0,.4)"; rrect(q.x - Wd / 2 + 5, t0 + 5, Wd, L, 5); x.fill();
    x.fillStyle = "#0b0b10"; x.strokeStyle = "#000"; x.lineWidth = 1.5; rrect(q.x - Wd / 2, t0, Wd, L, 5); x.fill(); x.stroke();      // remorque
    x.fillStyle = "#15151c"; x.fillRect(q.x - Wd / 2 + 4, t0 + 6, Wd - 8, 58);
    x.fillStyle = "#1c1c26"; x.fillRect(q.x - 1, t0 + 6, 2, 58);
    x.fillStyle = "#08080c"; rrect(q.x - Wd / 2 + 2, t0 + 68, Wd - 4, 34, 4); x.fill();                                              // cabine
    x.fillStyle = "#2a3646"; x.fillRect(q.x - Wd / 2 + 6, t0 + 90, Wd - 12, 8);                                                       // pare-brise
    x.fillStyle = "#fff4a3"; x.fillRect(q.x - Wd / 2 + 4, t0 + 100, 6, 3); x.fillRect(q.x + Wd / 2 - 10, t0 + 100, 6, 3);
    x.fillStyle = "#c01818"; x.fillRect(q.x - Wd / 2 + 3, t0 + 1, 6, 3); x.fillRect(q.x + Wd / 2 - 9, t0 + 1, 6, 3);
    x.fillStyle = "#050507"; [t0 + 10, t0 + 40, t0 + 80].forEach(wy => { x.fillRect(q.x - Wd / 2 - 3, wy, 4, 14); x.fillRect(q.x + Wd / 2 - 1, wy, 4, 14); });
    x.restore();
    const dx2 = q.x + 36, dy2 = q.y + 14, dd = Math.hypot(dx2 - me.x, dy2 - me.y);
    drawWalker(dx2, dy2, dd < 200 ? Math.atan2(me.y - dy2, me.x - dx2) : Math.PI, "#1a1a22", SKIN[3], null, 0, false, 1);
    if (dd < 200) labels.push(["CHAUFFEUR", dx2, dy2 - 20, "#cdb8ff"]); if (dd < 130) labels.push(["💬", dx2, dy2 - 36 + Math.sin(now / 200) * 3, "#fff", 16]);
  } }
  if (inV(PILOT.x, PILOT.y)) {                                                                      // le pilote (quête de l'hélico) : casquette de cuir + lunettes
    const dd = Math.hypot(PILOT.x - me.x, PILOT.y - me.y), pa = dd < 170 ? Math.atan2(me.y - PILOT.y, me.x - PILOT.x) : PILOT.a;
    drawWalker(PILOT.x, PILOT.y, pa, "#6b4a22", SKIN[1], null, 0, false);
    x.save(); x.translate(PILOT.x, PILOT.y); x.rotate(pa); x.fillStyle = "#3a2812"; x.beginPath(); x.arc(0, 0, 3.5, 0, 7); x.fill(); x.fillStyle = "#8fd3ff"; x.fillRect(1.5, -3, 1.9, 6); x.restore();
    if (dd < 240) { labels.push([PILOT.n, PILOT.x, PILOT.y - 20, "#fff"]); if (!me.hu && !mis) labels.push(["🚁", PILOT.x, PILOT.y - 38 + Math.sin(now / 200) * 3, "#ffd23f", 20]); }
  }
  for (const [id, d] of dCars) if (d.m !== "t" && id !== me.vid && inV(d.x, d.y)) drawCar(d.x, d.y, d.a, col(d.c), d.m === "c" || d.m === "s" ? 2 : d.cp ? 1 : false, now, id, dmx(d.dm | 0, wear(id)));
  if (me.pg && inV(me.pg.x, me.pg.y)) drawCar(me.pg.x, me.pg.y, me.pg.a, "#cfeeff", false, now, GHOST, 0);   // fantômes garés (le tien et ceux des autres owners)
  for (const [u, p] of activeP()) if (u !== myUid && p.pgx && inV(p.pgx, p.pgy)) drawCar(p.pgx, p.pgy, p.pga, "#cfeeff", false, now, GHOST, 0);
  for (const [u, d] of dP) if (!d.ib && inV(d.x, d.y)) { const pl = lp[u] || {}; if (d.vid === HELI) { } else if (d.vid) { const cc = dCars.get(d.vid); drawCar(d.x, d.y, d.a, col(cc ? cc.c : 0), cc && cc.cp ? 1 : false, now, d.vid, d.dm); } else drawWalker(d.x, d.y, d.a, pl.color || "#fff", "#f1c27d", d.v > 0 ? now / 85 : null, d.wpn, now - (d.flash || -1e9) < 70, false, d.wpn === 4 && d.fw === 4 ? clamp((now - (d.flash || -1e9)) / 920, 0, 1) : 1); labels.push([pl.name || "?", d.x, d.y - (d.vid ? 20 : 12), "#fff"]); }
  if (me.dead <= 0) { if (me.vid === HELI) { } else if (me.vid) drawCar(me.x, me.y, me.a, col(myCol), me.cop ? 1 : false, now, me.vid, me.dm); else drawWalker(me.x, me.y, me.a, (lp[myUid] || {}).color || "#fff", "#f1c27d", me.v > 0 ? now / 85 : null, me.wpn, me.flash > 0, false, me.wpn === 4 && me.fw === 4 && me.cd > 0 ? clamp(1 - me.cd / .92, 0, 1) : 1); x.fillStyle = "#ffe14d"; const ay = me.y - (me.vid === HELI ? 46 : me.vid ? 24 : 15) + Math.sin(now / 160) * 2; x.beginPath(); x.moveTo(me.x, ay + 6); x.lineTo(me.x - 5, ay - 2); x.lineTo(me.x + 5, ay - 2); x.fill(); }
  // ----- ciel : hélicoptères (au-dessus de tout, bâtiments compris) -----
  for (const [u, d] of dP) if (!d.ib && d.vid === HELI && inV(d.x, d.y)) { drawHeli(d.x, d.y, d.a, { alt: d.hz, accent: (lp[u] || {}).color || "#ffd23f", rot: now / 38 + u.length * 1.7, now }); if (d.dm > 55 && d.vid === HELI && !d.ib && inV(d.x, d.y)) heliSmoke(d.x, d.y, d.a, now, u.length); }
  if (me.dead <= 0 && me.vid === HELI) { drawHeli(me.x, me.y, me.a, { alt: me.hz, accent: (lp[myUid] || {}).color || "#ffd23f", now }); if (me.hh < 45) heliSmoke(me.x, me.y, me.a, now, 0); }
  for (const [id, d] of dHelis) if (inV(d.x, d.y)) {
    drawHeli(d.x, d.y, d.a, { cop: 1, beam: 1, flash: now - (d.fl || -1e9) < 70, rot: now / 38 + id * 1.3, now });
    if (d.hp < HEL_HP * .45) for (let k = 0; k < 4; k++) { const u = ((now / 40 + k * 8) % 32); x.fillStyle = `rgba(45,45,45,${Math.max(0, .5 - u / 70).toFixed(2)})`; x.beginPath(); x.arc(d.x - Math.cos(d.a) * (14 + u) + Math.sin(now / 200 + k) * 2, d.y - Math.sin(d.a) * (14 + u), 4 + u / 6, 0, 7); x.fill(); }
  }
  rockets.forEach(q => {
     const hx = q.x, hy = q.y;
     if (!q.done) {
       const ang = q.ang, dx = q.dx, dy = q.dy;
       // Sillage court qui suit la roquette : plus de ligne persistante sur tout le trajet.
       const tail = Math.min(34, q.d);
       x.save(); x.lineCap = "round";
       x.globalAlpha = .24; x.strokeStyle = "#ffb34d"; x.lineWidth = 11;
       x.beginPath(); x.moveTo(hx-dx*tail,hy-dy*tail); x.lineTo(hx-dx*7,hy-dy*7); x.stroke();
       x.globalAlpha = .78; x.strokeStyle = "#ff7626"; x.lineWidth = 4;
       x.beginPath(); x.moveTo(hx-dx*tail,hy-dy*tail); x.lineTo(hx-dx*8,hy-dy*8); x.stroke();
       // Flamme animée et corps orienté dans la trajectoire.
       const flick = 8 + Math.sin(now/24 + q.t)*3;
       x.fillStyle = "#ff6b24"; x.beginPath(); x.moveTo(hx-dx*9,hy-dy*9); x.lineTo(hx-dx*(15+flick),hy-dy*(15+flick)); x.lineTo(hx-dx*5-dy*3,hy-dy*5+dx*3); x.closePath(); x.fill();
       x.translate(hx,hy); x.rotate(ang);
       x.fillStyle = "#ff8a24"; x.beginPath(); x.moveTo(-10,-2); x.lineTo(-15,-6); x.lineTo(-4,-4); x.closePath(); x.fill();
       x.beginPath(); x.moveTo(-10,2); x.lineTo(-15,6); x.lineTo(-4,4); x.closePath(); x.fill();
       x.fillStyle = "#dce8ef"; x.fillRect(-9,-3,14,6);
       x.fillStyle = "#fff2a8"; x.beginPath(); x.moveTo(5,-3); x.lineTo(11,0); x.lineTo(5,3); x.closePath(); x.fill();
       x.restore();
     }
   });
   tracers = tracers.filter(t => now - t.t < 90);
  tracers.forEach(t => { const age = now - t.t; x.globalAlpha = 1 - age / 90; x.strokeStyle = "#fff2a8"; x.lineWidth = 1.6; x.beginPath(); x.moveTo(t.x0, t.y0); x.lineTo(t.x1, t.y1); x.stroke(); if (age < 45) { x.fillStyle = "#ffd23f"; x.beginPath(); x.arc(t.x0, t.y0, 4.5, 0, 7); x.fill(); } });
  x.globalAlpha = 1;
  sparks = sparks.filter(q => now - q.t < 160); sparks.forEach(q => { const age = (now - q.t) / 160; x.fillStyle = age < .5 ? "#fff6c2" : "#ff9d1e"; for (let k = 0; k < 4; k++) x.fillRect(q.x + Math.cos(k * 1.7 + q.x) * age * 7 - 1, q.y + Math.sin(k * 1.7 + q.x) * age * 7 - 1, 2, 2); });
  booms = booms.filter(q => now - q.t < (q.rpg ? 1050 : 650)); booms.forEach(q => {
     const age = now - q.t, life = q.rpg ? 1050 : 650, a2 = clamp(age / life, 0, 1), r = 8 + a2 * (q.rpg ? 118 : 60);
     x.save(); x.globalAlpha = (1-a2) * (q.rpg ? .9 : 1);
     if (q.rpg) {
       x.strokeStyle = "#fff0a6"; x.lineWidth = 5*(1-a2)+1; x.beginPath(); x.arc(q.x,q.y,r*.82,0,7); x.stroke();
       x.strokeStyle = "#ff7626"; x.lineWidth = 3*(1-a2)+.5; x.beginPath(); x.arc(q.x,q.y,r,0,7); x.stroke();
       x.fillStyle = "#3c3330"; for(let k=0;k<7;k++){const ang=k*2.399, rr2=r*.48+a2*18, rad=5+(k%3)*2; x.globalAlpha=(1-a2)*.38; x.beginPath(); x.arc(q.x+Math.cos(ang)*rr2,q.y+Math.sin(ang)*rr2,rad*(.7+a2),0,7); x.fill();}
       x.globalAlpha=(1-a2)*.9;
     }
     x.fillStyle = "#ff9d1e"; x.beginPath(); x.arc(q.x,q.y,r*(q.rpg?.72:1),0,7); x.fill();
     x.fillStyle = "#ffe066"; x.beginPath(); x.arc(q.x,q.y,r*.65,0,7); x.fill();
     x.fillStyle = "#fff"; x.beginPath(); x.arc(q.x,q.y,r*.3,0,7); x.fill();
     x.restore();
   }); x.globalAlpha = 1;
  if (job) { const f = (Math.sin(now / 250) + 1) / 2; x.strokeStyle = "#ffd23f"; x.lineWidth = 4; x.beginPath(); x.arc(job.x, job.y, 50 + f * 8, 0, 7); x.stroke(); x.fillStyle = "rgba(255,210,63,.25)"; x.fill(); labels.push(["📦", job.x, job.y + 8, "#fff", 26]); }
  if (mis && mis.k === "car" && mis.st === 1) { const f = (Math.sin(now / 250) + 1) / 2; x.strokeStyle = "#5ee1ff"; x.lineWidth = 4; x.beginPath(); x.arc(mis.x, mis.y, 50 + f * 8, 0, 7); x.stroke(); x.fillStyle = "rgba(94,225,255,.25)"; x.fill(); labels.push(["🏁", mis.x, mis.y + 8, "#fff", 26]); }
  if (mis && mis.k === "heli" && mis.st === 0) for (const q of mis.cr) if (!q.got && inV(q.x, q.y)) drawPart(q, now, labels);
  if (tgt && tgt.hp > 0 && inV(tgt.x, tgt.y)) { drawWalker(tgt.x, tgt.y, tgt.h, "#16161d", SKIN[tgt.sk % 6], now / (tgt.fl > 0 ? 55 : 90), 0, false); x.strokeStyle = "#ff3b30"; x.lineWidth = 2; x.beginPath(); x.arc(tgt.x, tgt.y, 15 + Math.sin(now / 150) * 2, 0, 7); x.stroke(); labels.push(["🎯", tgt.x, tgt.y - 20, "#fff", 18]); }
  if (mis && mis.k === "truck" && mis.trk.hp > 0 && inV(mis.trk.x, mis.trk.y)) drawTruck(mis.trk, now, labels);
  { const dk = darkness(cycT()); if (dk > .01) {                           // nuit : voile bleu sombre, avec un halo de lumière autour de toi
    x.setTransform(1, 0, 0, 1, 0, 0); const [lx0, ly0] = sxy(me.x, me.y), gx = lx0 / LR, gy = ly0 / LR, gr = x.createRadialGradient(gx, gy, 20, gx, gy, 230 / LR * 2.2);
    gr.addColorStop(0, `rgba(8,12,40,${(.28 * dk).toFixed(3)})`); gr.addColorStop(1, `rgba(4,6,28,${(.74 * dk).toFixed(3)})`); x.fillStyle = gr; x.fillRect(0, 0, lc.width, lc.height); } }
  x = mx2; x.setTransform(1, 0, 0, 1, 0, 0); x.imageSmoothingEnabled = false; x.drawImage(lc, 0, 0, cv.width, cv.height);   // …puis agrandie sans lissage = look GTA 1
  x.setTransform(S, 0, 0, S, 0, 0);
  labels.forEach(([s, wx, wy, c2, sz]) => { const [px, py] = sxy(wx, wy); if (px > -50 && px < W + 50 && py > -30 && py < H + 30) txt(s, px, py, sz || 12, c2); });
  { const t = cycT(), isDay = t < DAY_S, left = Math.ceil(isDay ? DAY_S - t : CYC_S - t); txt(`${isDay ? "☀️ JOUR" : "🌙 NUIT"} ${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`, W - 14, H - 12, 12, isDay ? "#ffe14d" : "#9db8ff", "right"); }
  floats = floats.filter(f => now - f.t < 1400); floats.forEach(f => { const [px, py] = sxy(f.x, f.y); x.globalAlpha = 1 - (now - f.t) / 1400; txt(f.s, px, py - (now - f.t) / 25, 15, f.c); }); x.globalAlpha = 1;
  // ----- HUD -----
  txt(`$${Math.round(me.cash)}`, 14, 32, 28, "#ffe14d", "left");
  for (let i = 0; i < 5; i++) drawStar(24 + i * 26, 46, 11.5, i < me.wl, Math.floor(now / 250) % 2, now, i);
  x.fillStyle = "#000"; x.fillRect(13, 62, 112, 11); x.fillStyle = me.hp > 40 ? "#3ee62f" : "#ff3b30"; x.fillRect(15, 64, 108 * clamp(me.hp, 0, 100) / 100, 7);
  if (me.arm) { wIcon(10 + me.arm, 138, 67, .6); txt(`−${Math.round(VEST[me.arm - 1].r * 100)}%`, 150, 71, 11, "#cfe6ff", "left"); }   // gilet porté : bouclier + réduction des dégâts
  if (me.vid === HELI) txt("🚁 MITRAILLETTE ×∞", 14, 94, 14, "#3ee6c4", "left");
  else if (!me.vid && !me.wpn) txt("👊 POINGS", 14, 94, 14, "#fff", "left");
  if (me.wpn && me.vid !== HELI) {                                                                                                  // arme en main : icône, compteur de munitions, indicateur de rechargement
    const W = WPN[me.wpn], am = me.ammo[me.wpn], low = am <= Math.max(1, Math.round(W.max * .1)), cdm = me.cdMax || .5, fast = cdm < .2;
    const rl = fast ? 1 : clamp(1 - me.cd / cdm, 0, 1), ready = rl >= 1;
    x.fillStyle = "rgba(0,0,0,.5)"; rrect(10, 80, 200, 60, 8); x.fill(); x.strokeStyle = ready ? "rgba(255,255,255,.25)" : "rgba(255,157,30,.7)"; x.lineWidth = 1.5; x.stroke();
    wIcon(me.wpn, 40, 104, 1);
    txt(W.n, 70, 96, 12, "#fff", "left"); txt(ready ? "PRÊT" : "RECHARGE", 204, 96, 10, ready ? "#3ee62f" : "#ff9d1e", "right");
    txt(`×${am}`, 70, 120, 20, low ? (Math.floor(now / 250) % 2 ? "#ff5a4d" : "#fff") : "#ffe14d", "left");
    if (me.wpn === 4) for (let i = 0; i < Math.min(am, 12); i++) { const rx = 114 + i * 7.2; x.fillStyle = "#3d4a2f"; x.fillRect(rx, 111, 4, 4); x.fillStyle = "#b3261e"; x.beginPath(); x.moveTo(rx + 4, 110); x.lineTo(rx + 7, 113); x.lineTo(rx + 4, 116); x.fill(); }   // une mini-roquette par roquette restante
    x.fillStyle = "#000"; x.fillRect(70, 127, 130, 7); x.fillStyle = ready ? "#3ee62f" : "#ff9d1e"; x.fillRect(71, 128, 128 * rl, 5);
    txt(me.ammo.slice(1).map((v, i) => v ? `${i + 1}:${v}` : "").filter(Boolean).join("  "), 14, 156, 11, "#ffe14d", "left");
  }
  if (!TOUCH && hasGun() && me.vid !== HELI && now - me.gunT < 9000) txt("F : TIRER · X ou 0-1-2-3 : CHANGER D'ARME (0 = POINGS 👊)", W / 2, H - 40, 13, "#ffe14d");
  if (TOUCH && (hasGun() || me.vid === HELI || !me.vid)) { const fb = fireId !== null; x.fillStyle = fb ? "#ff5a4d" : "#b3261e"; x.beginPath(); x.arc(W - 56, H - 142, 34, 0, 7); x.fill(); x.strokeStyle = "#000"; x.lineWidth = 3; x.stroke(); txt(me.vid === HELI || me.wpn ? "FEU" : "👊", W - 56, H - 138, 14); if (hasGun() && me.vid !== HELI) { x.fillStyle = "#555a66"; x.beginPath(); x.arc(W - 136, H - 136, 26, 0, 7); x.fill(); x.stroke(); txt("ARME", W - 136, H - 132, 11); } }
  const rank = [[myUid, me.cash]].concat(activeP().filter(([u]) => u !== myUid).map(([u, p]) => [u, p.cash])).sort((a, b) => b[1] - a[1]);
  txt(`SERVEUR ${c} · ${rank.length} JOUEUR${rank.length > 1 ? "S" : ""}${hostOn ? " · HÔTE" : ""}`, W - 12, 18, 12, "#fffa", "right");
  rank.slice(0, 6).forEach(([u, cs], i) => { const pl = lp[u] || {}; x.fillStyle = pl.color || "#fff"; x.fillRect(W - 170, 28 + i * 18, 9, 9); txt(`${(pl.name || "?").slice(0, 10)}${u === myUid ? "*" : ""}`, W - 156, 37 + i * 18, 12, "#fff", "left"); txt(`$${Math.round(cs)}`, W - 12, 37 + i * 18, 12, "#ffe14d", "right"); });
  const mm = 140, mx = 12, my = H - mm - 12, mk = mm / WORLD;
  if (!mmBase) mmBase = mkMini();
  const mpx = wx => mx + clamp(wx, 0, WORLD) * mk, mpy = wy => my + clamp(wy, 0, WORLD) * mk, pul = (per) => (now % per) / per;
  x.fillStyle = "rgba(0,0,0,.45)"; rrect(mx - 2, my + 3, mm + 4, mm + 4, 14); x.fill();                  // ombre portée
  x.save(); rrect(mx, my, mm, mm, 12); x.clip(); x.imageSmoothingEnabled = true; x.drawImage(mmBase, mx, my, mm, mm);
  x.strokeStyle = "rgba(255,255,255,.4)"; x.lineWidth = 1; x.strokeRect(mx + vx0 * mk, my + vy0 * mk, vw * mk, vh * mk);   // ce que l'écran montre
  const dot = (wx, wy, cl, r) => { x.fillStyle = cl; x.strokeStyle = "rgba(0,0,0,.8)"; x.lineWidth = 1; x.beginPath(); x.arc(mpx(wx), mpy(wy), r, 0, 7); x.fill(); x.stroke(); };
  const arrow = (wx, wy, a, cl) => { x.save(); x.translate(mpx(wx), mpy(wy)); x.rotate(a); x.fillStyle = cl; x.strokeStyle = "#000"; x.lineWidth = 1.5; x.beginPath(); x.moveTo(6.5, 0); x.lineTo(-4.5, -4.5); x.lineTo(-2, 0); x.lineTo(-4.5, 4.5); x.closePath(); x.fill(); x.stroke(); x.restore(); };
  const ping = (wx, wy, cl, r) => { const f = pul(1100); x.globalAlpha = .7 * (1 - f); x.strokeStyle = cl; x.lineWidth = 1.5; x.beginPath(); x.arc(mpx(wx), mpy(wy), r + f * 9, 0, 7); x.stroke(); x.globalAlpha = 1; };
  dot(ZONES.arms.x, ZONES.arms.y, "#ff5a4d", 2.6); dot(ZONES.heal.x, ZONES.heal.y, "#7ae582", 2.6);
  if (!mis) GIVERS.forEach(g => { dot(g.x, g.y, "#ffd23f", 3); });
  for (const d of dCars.values()) if (d.m === "c") { const fl = Math.floor(now / 200) % 2; dot(d.x, d.y, fl ? "#ff2a2a" : "#2a5bff", 2.8); }
  for (const d of dCops.values()) dot(d.x, d.y, "#7da2ff", 1.8);
  for (const d of dHelis.values()) { const fl = Math.floor(now / 200) % 2; dot(d.x, d.y, fl ? "#ff2a2a" : "#2a5bff", 3.6); }
  for (const d of dP.values()) if (!d.ib) arrow(d.x, d.y, d.a, "#ff3b30");                                         // les autres joueurs : flèches rouges
  if (job) dot(job.x, job.y, "#ffd23f", 3.5);
  if (me.rpgQuest && me.rpgParts.length < 3) RPG_PART_SPOTS.forEach((q, i) => { if (!me.rpgParts.includes(i)) { ping(q.x, q.y, "#ffd23f", 3); dot(q.x, q.y, "#ffd23f", 3); } });
  if (me.ammoQuest && !me.rpgAmmoUnlocked && pw === 1) { ping(POWDER_SPOT.x, POWDER_SPOT.y, "#ff9a3d", 4); dot(POWDER_SPOT.x, POWDER_SPOT.y, "#ff9a3d", 4); }
  if (pw === 2) { ping(ZONES.arms.x, ZONES.arms.y, "#ff9a3d", 5); }
  { const mp = misPt(); if (mp && !mp.nm) { ping(mp.x, mp.y, mp.c, 4); dot(mp.x, mp.y, mp.c, 4); } }
  if (me.wl > 0 && Math.floor(now / 250) % 2) { x.strokeStyle = "rgba(255,60,60,.9)"; x.lineWidth = 2; rrect(mx + 1, my + 1, mm - 2, mm - 2, 11); x.stroke(); }   // recherché : le cadre clignote
  HOUSES.forEach((h, k) => { if (owns(k)) dot(HZ[k].x, HZ[k].y, "#7ae582", 3); });
  ping(me.x, me.y, "#fff", 3);
  arrow(me.x, me.y, me.a, "#fff");   // toi : une flèche blanche dans le sens de la marche
  x.restore();
  x.strokeStyle = "#0b0c10"; x.lineWidth = 4; rrect(mx, my, mm, mm, 12); x.stroke(); x.strokeStyle = "#e8e8f0"; x.lineWidth = 1.5; rrect(mx, my, mm, mm, 12); x.stroke();   // cadre
  txt("N", mx + mm - 10, my + 14, 11, "#fffc");
  const bx = W - 56, by = H - 62; x.fillStyle = "#1f4fbf"; x.beginPath(); x.arc(bx, by, 38, 0, 7); x.fill(); x.strokeStyle = "#000"; x.lineWidth = 3; x.stroke(); txt(gAct() ? "GARAGE" : !me.vid && (shopAt() || nearGiver() || nearHouse() >= 0) ? "ACTION" : me.vid ? "SORTIR" : "ENTRER", bx, by + 4, 12);
  { const ga = gAct(); if (ga || (me.g && me.vid !== HELI && inGarage())) txt(ga === "buy" ? `E : ACHETER LE GARAGE ($${GPRICE})` : ga === "store" ? "E : RANGER LA VOITURE" : !me.vid ? (isOwner() ? "E : ENTRER AU GARAGE · G : FANTÔME 👻" : "E : ENTRER AU GARAGE") : ga === "take" ? (me.g && isOwner() ? "E : SORTIR TA VOITURE · G : FANTÔME 👻" : "E : SORTIR TA VOITURE") : ga === "ghost" ? "E : SORTIR LA VOITURE FANTÔME 👻" : ga === "ghostPut" ? "E : RANGER LE FANTÔME" : me.vid ? "GARAGE PLEIN" : "GARAGE VIDE", W / 2, H - 60, 15, ga === "buy" && me.cash < GPRICE ? "#ff9f43" : "#ffe14d"); }
  if (me.dead <= 0 && !shop) {
    let h = "", hc = "#ffe14d"; const sa = shopAt(), nh = nearHouse();
    if (nh >= 0) { h = owns(nh) ? `E : ENTRER CHEZ TOI (${HOUSES[nh].n})` : me.hou ? "TU AS DÉJÀ UNE MAISON : UNE SEULE PAR JOUEUR" : `E : ACHETER ${HOUSES[nh].n} ($${HOUSES[nh].p})`; if (!owns(nh) && (me.hou || me.cash < HOUSES[nh].p)) hc = "#ff9f43"; }
    else if (sa) { if (me.vid) h = `DESCENDS (E) POUR ${sa === "heal" ? "TE SOIGNER" : sa === "jail" ? "OUVRIR LA PRISON" : "ACHETER DES ARMES"}`; else if (sa === "heal") { const p = healPrice(); h = me.hp >= 99 ? "TU ES EN PLEINE FORME" : `E : TE SOIGNER ($${p})`; if (me.hp < 99 && p > me.cash) hc = "#ff9f43"; } else if (sa === "jail") h = "E : PRISON (FAIRE ÉVADER UN AMI)"; else h = "E : ENTRER DANS L'ARMURERIE"; }
    else { const g = nearGiver(); if (g) h = mis ? `${g.n} : TU AS DÉJÀ UNE MISSION` : `E : PARLER À ${g.n} (${g.l})`; else if (nearBM()) h = "E : PARLER AU CHAUFFEUR 🚚"; else if (nearMech()) h = pw === 2 ? `🧨 LIVRE LA POUDRE À L’ARMURERIE : ${Math.max(0, Math.ceil(pwT))}s` : "E : PARLER AU MÉCANO (QUÊTE RPG 🧩)"; else if (nearPilot()) h = me.hu ? "E : PARLER AU PILOTE" : mis && mis.k === "heli" ? (mis.st === 1 ? "E : RENDRE LES PIÈCES AU PILOTE" : "E : PARLER AU PILOTE") : mis ? "LE PILOTE : TU AS DÉJÀ UNE MISSION" : "E : PARLER AU PILOTE (QUÊTE SPÉCIALE 🚁)"; }
    if (h) txt(h, W / 2, H - 60, 15, hc);
  }
  drawMis(now);
  if (pw === 2) { const tm = Math.max(0, Math.ceil(pwT)), tt = `${Math.floor(tm / 60)}:${String(tm % 60).padStart(2, "0")}`, yy = mis ? 196 : 168;
    x.fillStyle = "rgba(0,0,0,.55)"; x.fillRect(10, yy, 276, 50); txt("QUÊTE RPG · LIVRAISON", 18, yy + 16, 11, "#ff9a3d", "left"); txt(`🧨 ARMURERIE · ⏱ ${tt}`, 18, yy + 38, 13, tm < 30 && Math.floor(now / 300) % 2 ? "#ff5a4d" : "#fff", "left");
    const a = Math.atan2(ZONES.arms.y - me.y, ZONES.arms.x - me.x), d = Math.hypot(ZONES.arms.x - me.x, ZONES.arms.y - me.y);
    if (d > 120) { const ax = W / 2 + Math.cos(a) * 96, ay = H / 2 + Math.sin(a) * 78; x.save(); x.translate(ax, ay); x.rotate(a); x.fillStyle = "#ff9a3d"; x.strokeStyle = "#000"; x.lineWidth = 2; x.beginPath(); x.moveTo(15, 0); x.lineTo(-9, -9); x.lineTo(-9, 9); x.closePath(); x.fill(); x.stroke(); x.restore(); } }
  if (shop) drawShop(now);
  if (me.vid && TOUCH) { const bb = brakeId !== null; x.fillStyle = bb ? "#ff5a4d" : "#b3261e"; x.beginPath(); x.arc(W - 140, H - 48, 34, 0, 7); x.fill(); x.stroke(); txt("FREIN", W - 140, H - 44, 13); x.fillStyle = "#2f4f9f"; x.beginPath(); x.arc(W - 224, H - 48, 28, 0, 7); x.fill(); x.stroke(); txt("RADIO", W - 224, H - 44, 11); x.fillStyle = hornId !== null ? "#ffd23f" : "#8a6d1a"; x.beginPath(); x.arc(W - 196, H - 106, 28, 0, 7); x.fill(); x.stroke(); txt("KLAXON", W - 196, H - 102, 10); }
  if (!me.vid && me.dead <= 0 && me.pg && isOwner() && Math.hypot(me.pg.x - me.x, me.pg.y - me.y) < 52) txt("E : REMONTER DANS LE FANTÔME 👻", W / 2, H - 44, 14, "#9ad8ff");
  if (!me.vid && me.dead <= 0) { let near = false; for (const d of dCars.values()) if ((d.m === "d" || d.m === "p") && Math.hypot(d.x - me.x, d.y - me.y) < 48) near = true; if (near) txt("E : MONTER DANS LA VOITURE", W / 2, H - 24, 14, "#ffe14d"); }
  if (me.vid && me.dead <= 0) {
    { const ro = radio.st > 0, fresh = now - radio.nameT < 2500; txt(`📻 ${ro ? STN[radio.st - 1].n : "RADIO COUPÉE"}${TOUCH ? "" : "  ·  R : CHANGER  ·  H : KLAXON"}`, W / 2, H - 34, fresh ? 15 : 12, ro ? "#9be7ff" : "#9a9aa5"); }
    const kmh = Math.round(Math.abs(me.v) * .5);
    if (me.vid === HELI) txt(`🚁 ${kmh} km/h · COQUE ${Math.round(clamp(me.hh, 0, 100))}%`, W / 2, H - 14, 16, me.hh < 35 ? "#ff5a4d" : "#fff"); else txt(`${kmh} km/h · ÉTAT ${Math.round(100 - dmSum(me.dm) / 12 * 100)}%${me.v < -3 ? "  ◄ MARCHE ARRIÈRE" : ""}`, W / 2, H - 14, 16, me.v < -3 ? "#ff9f43" : "#fff");
    if (me.carT < 9) { x.fillStyle = "rgba(0,0,0,.65)"; x.fillRect(W / 2 - 230, H - 96, 460, 54); txt(TOUCH ? "POUSSE LE JOYSTICK VERS OÙ TU VEUX ALLER" : (me.vid === HELI ? "↑ AVANCER · ↓ FREINER / RECULER · F : MITRAILLETTE ∞" : "↑ ACCÉLÉRER · ↓ FREINER / RECULER"), W / 2, H - 74, 13, "#fff"); txt(TOUCH ? "LÂCHE = ROULE LIBRE · FREIN = FREINER / RECULER" : (me.vid === HELI ? "← → PIVOTER · E = SE POSER SUR L'HÉLIPORT 🅷 DU GARAGE" : "← → TOURNER (SEULEMENT QUAND LA VOITURE ROULE) · E = SORTIR"), W / 2, H - 54, 12, "#ffe14d"); }
    if (job) { const a = Math.atan2(job.y - me.y, job.x - me.x); txt(`📦 ${Math.round(Math.hypot(job.x - me.x, job.y - me.y) / 10)} m`, W / 2, 26, 15, "#ffd23f"); x.save(); x.translate(W / 2, 52); x.rotate(a); x.fillStyle = "#ffd23f"; x.strokeStyle = "#000"; x.lineWidth = 2; x.beginPath(); x.moveTo(15, 0); x.lineTo(-9, -10); x.lineTo(-9, 10); x.closePath(); x.fill(); x.stroke(); x.restore(); }
  }
  if (me.vid === HELI && me.dead <= 0 && !me.land) {                                                // guidage vers l'héliport
    const d = Math.hypot(RP.x - me.x, RP.y - me.y);
    if (d > 70) { const a = Math.atan2(RP.y - me.y, RP.x - me.x); txt(`🅷 TOIT DU GARAGE ${Math.round(d / 10)} m`, W / 2, 26, 14, "#ffd23f"); x.save(); x.translate(W / 2, 52); x.rotate(a); x.fillStyle = "#ffd23f"; x.strokeStyle = "#000"; x.lineWidth = 2; x.beginPath(); x.moveTo(15, 0); x.lineTo(-9, -10); x.lineTo(-9, 10); x.closePath(); x.fill(); x.stroke(); x.restore(); }
    else txt(Math.abs(me.v) < 120 ? "E : SE POSER SUR LE TOIT 🅷" : "RALENTIS POUR TE POSER", W / 2, H - 60, 15, "#ffe14d");
  }
  if (me.bust > .1) { x.fillStyle = "#2a5bff"; x.fillRect(W / 2 - 60, H / 2 + 40, 120 * clamp(me.bust / .9, 0, 1), 8); txt("ARRESTATION…", W / 2, H / 2 + 34, 13, "#8fb0ff"); }
  if (me.dead > 0) { x.fillStyle = "rgba(0,0,0,.65)"; x.fillRect(0, 0, W, H); txt(me.msg, W / 2, H / 2, 30, "#fff"); }
  if (stick) { x.fillStyle = "rgba(255,255,255,.08)"; x.strokeStyle = "rgba(255,255,255,.28)"; x.lineWidth = 2; x.beginPath(); x.arc(stick.ox, stick.oy, 55, 0, 7); x.fill(); x.stroke(); x.fillStyle = "rgba(255,255,255,.65)"; x.beginPath(); x.arc(stick.ox + stick.dx * 55, stick.oy + stick.dy * 55, 22, 0, 7); x.fill(); }
  drawAdm();
}

// ================= ENTRÉES =================
  addEventListener("keydown", e => {
    if (!active || /^(INPUT|TEXTAREA)$/.test(e.target.tagName)) return;
    if (e.key === "f" || e.key === "F") { fireKey = true; e.preventDefault(); return; }
    if (e.key === "x" || e.key === "X") { if (!e.repeat) cycleWpn(); e.preventDefault(); return; }
    if (e.key === "r" || e.key === "R") { if (!e.repeat) nextStation(); e.preventDefault(); return; }
    if (e.key === "h" || e.key === "H") { hornKey = true; e.preventDefault(); return; }
    if (inn && e.key === "Escape" && !shop) { if (inn.k !== "jail") leaveInn(); return; }
    if (admOpen && e.key === "Escape") { admOpen = false; e.preventDefault(); return; }
    if ((e.key === "p" || e.key === "P") && !e.repeat && isOwner() && !inn) { admOpen = !admOpen; e.preventDefault(); return; }
    if ((e.key === "g" || e.key === "G") && !shop && !inn) { if (!e.repeat && me.g && isOwner() && inGarage() && !me.vid && me.dead <= 0) ghostTake(); e.preventDefault(); return; }
    if (shop) { const d2 = /^(Digit|Numpad)([1-9])$/.exec(e.code || ""); if (d2) { shopPick(+d2[2] - 1); e.preventDefault(); return; } if (e.key === "Escape") { shop = ""; return; } }
    if ((e.key === "m" || e.key === "M") && mis) { if (!e.repeat) missionFail("", true); e.preventDefault(); return; }
    const dg = /^(Digit|Numpad)([0-4])$/.exec(e.code || ""); if (dg) { selWpn(+dg[2]); return; }
    if (e.key === " " || e.key === "e" || e.key === "E") { e.preventDefault(); if (!e.repeat) useReq = 1; return; }
    const k = KEYS[e.key.length > 1 ? e.key : e.key.toLowerCase()]; if (k) { e.preventDefault(); keys.add(k); }
  });
  addEventListener("keyup", e => { if (e.key === "f" || e.key === "F") fireKey = false; if (e.key === "h" || e.key === "H") hornKey = false; const k = KEYS[e.key.length > 1 ? e.key : e.key.toLowerCase()]; if (k) keys.delete(k); });
  addEventListener("blur", () => { keys.clear(); stick = null; brakeId = null; fireKey = false; fireId = null; hornKey = false; hornId = null; });
  document.addEventListener("visibilitychange", () => { if (document.hidden) { keys.clear(); stick = null; brakeId = null; fireKey = false; fireId = null; hornKey = false; hornId = null; } });
  const rel = e => { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) * W / r.width, y: (e.clientY - r.top) * H / r.height }; };
  cv.addEventListener("pointerdown", e => {
    if (!active) return; e.preventDefault(); const p = rel(e);
    { const ah = admHit(p); if (ah !== null) { admDo(ah); return; } }
    if (shop) { const r = shopHit(p); if (r !== -1) { if (r === -2) shop = ""; else if (r >= 0) shopPick(r); return; } }
    if (mis && p.x > 10 && p.x < 286 && p.y > 160 && p.y < 188) { missionFail("", true); return; }
    if ((hasGun() || me.vid === HELI || !me.vid) && Math.hypot(p.x - (W - 56), p.y - (H - 142)) < 38) { fireId = e.pointerId; try { cv.setPointerCapture(e.pointerId); } catch { } return; }
    if (hasGun() && me.vid !== HELI && Math.hypot(p.x - (W - 136), p.y - (H - 136)) < 30) { cycleWpn(); return; }
    if (e.button === 2 || Math.hypot(p.x - (W - 56), p.y - (H - 62)) < 40) { useReq = 1; return; }
    if (me.vid && Math.hypot(p.x - (W - 140), p.y - (H - 48)) < 38) { brakeId = e.pointerId; try { cv.setPointerCapture(e.pointerId); } catch { } return; }
    if (me.vid && Math.hypot(p.x - (W - 224), p.y - (H - 48)) < 32) { nextStation(); return; }
    if (me.vid && Math.hypot(p.x - (W - 196), p.y - (H - 106)) < 32) { hornId = e.pointerId; try { cv.setPointerCapture(e.pointerId); } catch { } return; }
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
  const end = e => { if (fireId === e.pointerId) fireId = null; if (hornId === e.pointerId) hornId = null; if (brakeId === e.pointerId) brakeId = null; if (stick && e.pointerId === stick.id) stick = null; };
  cv.addEventListener("pointerup", end); cv.addEventListener("pointercancel", end);
  cv.addEventListener("contextmenu", e => { if (active) e.preventDefault(); });

  return {
    enter(code) {
      active = true; c = code; myUid = getMe().uid; ls = null; lastT = 0; lastH = ""; lastEv = 0; pd = {}; hostOn = false; keys = new Set(); stick = null; brakeId = null; useReq = 0;
      dPeds.clear(); dCars.clear(); dCops.clear(); dHelis.clear(); helis = []; dP.clear(); ejected = []; sPrevCash = 0; sPrevWl = 0; sAmbT = performance.now() + 8000; hornKey = false; hornId = null; me.pg = null; splats = []; floats = []; hitDone = new Set(); lastHs = {}; sentStr = ""; sentAt = 0; savedCash = -1; saveAt = performance.now(); gLoaded = false; savedG = ""; lastGn = {};
      Object.assign(me, { vid: 0, hp: 100, heat: 0, wl: 0, hs: 0, hid: 0, dead: 0, bust: 0, hurt: 0, v: 0, a: 0, cash: 0, cop: 0, wpn: 0, ammo: [0, 0, 0, 0, 0], dm: 0, fc: 0, fw: 0, cs: 0, cid: 0, ca: 0, cd: 0, flash: 0, dmCd: 0, scr: 0, lastCar: 0, lastCarT: 0, gunT: -1e9, g: 0, g2: 0, gcar: null, gcar2: null, gn: 0, go: 0, gi: 0, gm: 0, hu: 0, hz: 0, land: 0, w5: 0, hvx: 0, hvy: 0, hh: 100, rpgParts: [], rpgQuest: 0, ammoQuest: 0, rpgAmmoUnlocked: 0, arm: 0, hou: 0, hsp: -1, hb: HOUSES.map(newBox), fu: "", fuT: 0, jT: 0 });
      inn = null; jail = null; mis = null; tgt = null; pw = 0; pwT = 0; shop = ""; killQ = []; carQ = []; pendingPedHits = new Map(); tracers = []; rockets = []; sparks = []; booms = []; wrecks = []; pickT = new Map(); lastFc = {}; lastCs = {}; fireKey = false; fireId = null;
      const ix = 2 + Math.floor(Math.random() * 5), iy = 2 + Math.floor(Math.random() * 5); spawnAt([ix * CELL, iy * CELL]);
      $("ghelp").textContent = "ZQSD / flèches : bouger · E ou Espace : monter / descendre d'une voiture · en voiture ↑ accélère, ↓ freine, ←→ tourne · livre les colis 📦, écrase des piétons, évite la police ! · Sans arme tu frappes avec tes poings 👊 (F : 3 coups pour un piéton) ; ramasse les armes au sol : F tirer, X changer d'arme (0 = poings, 1-2-3) · en hélico : mitraillette à munitions infinies (F) · les voitures se cabossent ! · garage ($3500 ; à l'intérieur, un 2e emplacement pour une voiture de plus : $2500) : va sur la zone jaune et appuie sur E (owners : voiture fantôme 👻 invincible qui traverse les bâtiments, tu peux en descendre : elle reste garée et seuls les owners peuvent y remonter (E) ; au garage : ranger le fantôme (E), G pour en sortir un) · R : changer de radio (4 stations), H : klaxon · missions : parle au BOSS ❗ au bord ouest de la carte (E) : missions aléatoires (voitures, cavale, contrat, camion blindé 🚚), M pour abandonner · armurerie et distributeur de soins (hôpital) : va sur leur zone et appuie sur E · 🏎️ des voitures de sport (Supercar, Roadster) roulent en ville : bien plus rapides, vole-les et range-les au garage ! · 🚁 hélicoptère : un pilote mystérieux traîne quelque part en ville (il n'est PAS sur la carte) : trouve-le et réussis sa quête pour débloquer un hélico, rangé sur le toit de ton garage (échelle dans le garage) ; E pour te poser sur la zone 🅷 du toit · à 5★ la police envoie des hélicos : abats-les ! · 🔒 arrêté = PRISON (≈30 s, plus avec plus d'étoiles) : attends, corromps le gardien, creuse le mur (E) ou un ami te fait évader depuis la zone PRISON, devant la prison (grand bâtiment gris au sud-est de la carte) · 🏠 quartier résidentiel à l'est de la carte : achète UNE maison (une seule par joueur ; E à la porte) : coffre pour ranger argent, armes et gilet, et lit = point de réapparition";
      get(RF(`users/${myUid}/sta`)).then(s => { const v = +s.val(); if (v > 0 && me.cash === 0) { me.cash = v; savedCash = v; sPrevCash = v; } }).catch(() => { });
      get(RF(`users/${myUid}/sta2`)).then(s => {                           // garage, voiture rangée, armes et munitions
        try {
          const v = JSON.parse(String(s.val() || "null"));
          if (v && typeof v === "object") {
            me.g = v.g ? 1 : 0; me.hu = v.h ? 1 : 0; me.hh = v.hh === undefined ? 100 : clamp(Math.round(+v.hh) || 0, 0, 100); const gc = v.c; const rdCar = q => q && Number.isFinite(+q.t) ? { c: (+q.c | 0) & 7, t: clamp(+q.t | 0, 0, 4), d: (+q.d | 0) & 255, p: q.p ? 1 : 0 } : null; me.gcar = rdCar(gc); me.g2 = v.g2 ? 1 : 0; me.gcar2 = me.g2 ? rdCar(v.c2) : null;
            if (Array.isArray(v.a)) { for (let n = 1; n <= 4; n++) me.ammo[n] = clamp(Math.floor(+v.a[n - 1]) || 0, 0, WPN[n].max); const w = +v.w | 0; me.wpn = w >= 1 && w <= 4 && me.ammo[w] > 0 ? w : 0; if (!me.wpn) cycleWpn(); } me.rpgParts = Array.isArray(v.rp) ? v.rp.filter(n=>Number.isInteger(n)&&n>=0&&n<3) : []; me.rpgQuest = v.rq ? 1 : 0; me.ammoQuest = v.aq ? 1 : 0; me.rpgAmmoUnlocked = v.rau ? 1 : 0; me.arm = clamp(+v.ar | 0, 0, 3); if (me.rpgAmmoUnlocked && me.rpgParts.length < 3) me.rpgParts = [0, 1, 2]; pw = me.ammoQuest && !me.rpgAmmoUnlocked ? 1 : 0;
            me.hou = (+v.ho | 0) & ((1 << HOUSES.length) - 1);                    // maisons possédées + coffres + point de réapparition
            if (Array.isArray(v.hb)) HOUSES.forEach((_, k) => { const q = v.hb[k]; if (Array.isArray(q)) me.hb[k] = { c: Math.max(0, Math.floor(+q[0]) || 0), a: [1, 2, 3, 4].map(n => clamp(Math.floor(+q[n]) || 0, 0, 9999)), v: clamp(+q[5] | 0, 0, 3) }; });
            { const hq = Number.isInteger(+v.hq) ? +v.hq : -1; me.hsp = hq >= 0 && hq < HOUSES.length && ((me.hou >> hq) & 1) ? hq : -1; }
          }
        } catch { }
        gLoaded = true; savedG = gStr();
      }).catch(() => { });
      dnOff = 0; unD = onValue(RF(`games/${c}/dn`), snap => { const v = snap.val(); dnOff = typeof v === "number" ? v : 0; }); unS = onValue(RF(`games/${c}/state`), onState); unP = onValue(RF(`games/${c}/p`), onP);
      timer = setInterval(simLoop, 50); raf = requestAnimationFrame(frame);
      env.played && env.played("sta", true);
      return () => {
        active = false; clearInterval(timer); unS && unS(); unP && unP(); unD && unD(); unD = null; admOpen = false; if (raf) cancelAnimationFrame(raf); raf = 0; keys.clear(); stick = null; hostOn = false; fireKey = false; fireId = null;
        SND.stop(); persist(true); remove(RF(`games/${c}/p/${myUid}`)).catch(() => { });
        x.setTransform(1, 0, 0, 1, 0, 0); x.globalAlpha = 1; x.setLineDash([]); x.textAlign = "start";
      };
    }
  };
}
