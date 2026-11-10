/* MoDa : « Fruit Forager » 🍎 : règles et économie (aucune dépendance : testable hors navigateur)
   Contenu de la première version = uniquement ce qui est confirmé sur le vrai jeu (Roblox, FaultyMarkus Games).
   Les valeurs marquées « À CONFIRMER » sont des estimations en attendant des données plus précises. */

// Raretés : couleur d'étiquette et tickets rapportés par fruit vendu (Rare 1, Épique 1, Légendaire 2, Mythique 3)
export const RAR = {
  common:    { n: "Commun",     c: "#ffffff", t: 0 },
  uncommon:  { n: "Peu commun", c: "#9be28f", t: 0 },
  rare:      { n: "Rare",       c: "#ffb869", t: 1 },
  epic:      { n: "Épique",     c: "#b36bff", t: 1 },
  legendary: { n: "Légendaire", c: "#ffd23f", t: 2 },
  mythic:    { n: "Mythique",   c: "#4fe3ff", t: 3 }
};

// Fruits de la Forêt (zone 1) et du Désert (zone 2) : valeur de vente en pièces
// (la rareté exacte de chaque fruit est déduite des fourchettes du wiki : À CONFIRMER, sauf Pomme = Commun)
export const FRUITS = {
  apple:        { n: "Pomme",         e: "🍎", r: "common",   v: 2,  z: 1, col: "#e53935" },
  pear:         { n: "Poire",         e: "🍐", r: "common",   v: 3,  z: 1, col: "#c6d64a" },
  green_apple:  { n: "Pomme verte",   e: "🍏", r: "uncommon", v: 4,  z: 1, col: "#7cd04b" },
  crimson_pear: { n: "Poire carmin",  e: "🍐", r: "rare",     v: 12, z: 1, col: "#c2185b" },
  sugar_apple:  { n: "Pomme sucrée",  e: "🍈", r: "uncommon", v: 37, z: 1, col: "#a5d6a7" },
  banana:       { n: "Banane",        e: "🍌", r: "uncommon", v: 14, z: 2, col: "#ffe135" },
  lemon:        { n: "Citron",        e: "🍋", r: "uncommon", v: 18, z: 2, col: "#fff176" },
  embum_banana: { n: "Banane Embum",  e: "🍌", r: "rare",     v: 22, z: 2, col: "#ff9800" },
  java_banana:  { n: "Banane Java",   e: "🍌", r: "epic",     v: 84, z: 2, col: "#8fd3ff" }
};
export const FRUIT_IDS = Object.keys(FRUITS);

// ----- Carte : reprise de la vue de dessus du vrai jeu (coordonnées image × 4) -----
export const K = 4;
export const WORLD = { w: 2500, h: 2050 };
const R = (x1, y1, x2, y2) => ({ x: x1 * K, y: y1 * K, w: (x2 - x1) * K, h: (y2 - y1) * K });
// Zones : Spawn (à gauche, avec les 5 parcelles), Forêt (milieu), Désert (en haut à droite). Le Désert demande le niveau 5
// (À CONFIRMER : le wiki donne « Forêt 0-4, Désert 5-9 »). Forêt d'automne et Toundra sont sur la carte mais fermées dans cette version.
export const ZONES = [
  { id: "spawn",  n: "Spawn",           lvl: 0,  rects: [R(68, 128, 200, 348)] },
  { id: "forest", n: "Forêt",           lvl: 0,  rects: [R(200, 128, 297, 405)],                    fruit: { n: 22, w: { apple: 40, pear: 25, green_apple: 18, crimson_pear: 10, sugar_apple: 7 } } },
  { id: "desert", n: "Désert",          lvl: 5,  rects: [R(203, 62, 360, 118), R(297, 118, 372, 272)], fruit: { n: 20, w: { banana: 38, lemon: 30, embum_banana: 20, java_banana: 12 } } },
  { id: "autumn", n: "Forêt d'automne", lvl: 15, closed: true, rects: [R(372, 105, 490, 262)] },
  { id: "tundra", n: "Toundra",         lvl: 10, closed: true, rects: [R(297, 272, 430, 432), R(365, 410, 430, 475)] }
];
// Parcelles des joueurs (5 = le nombre de joueurs d'un serveur) : dessinées, mais sans fonction dans cette version
export const PLOTS = [R(68, 138, 127, 192), R(137, 130, 192, 185), R(55, 205, 112, 262), R(63, 270, 122, 320), R(132, 286, 190, 345)];
// Obstacles : murs de falaise (avec un passage Spawn→Forêt et un passage Forêt→Désert), rivière (traversable seulement sur le pont)
export const BLOCKS = [
  { x: 796,  y: 512,  w: 10,  h: 360 }, { x: 796,  y: 1024, w: 10, h: 368 },   // mur Spawn | Forêt
  { x: 1180, y: 700,  w: 16,  h: 388 },                                          // mur Forêt | Désert
  { x: 800,  y: 792,  w: 200, h: 48 },  { x: 1052, y: 792,  w: 136, h: 48 }     // rivière de chaque côté du pont
];
export const BRIDGE = { x: 1000, y: 776, w: 52, h: 80 };
// Décors non traversés par les fruits (pas des obstacles)
export const SPOTS = {
  white: R(238, 136, 252, 150), hut: R(270, 153, 295, 172), pit: R(215, 335, 280, 395), oasis: R(207, 68, 229, 95),
  ice: R(330, 350, 355, 378), station: R(365, 410, 430, 475), ladder: { x: 1596, y: 1000, w: 44, h: 440 }
};
export const HIDDEN = [R(368, 47, 470, 105), R(433, 228, 587, 393)]; // zones non montrées sur la carte (falaise pleine)
export const PADS = { sell: { x: 700, y: 1085, n: "Vente" }, shop: { x: 540, y: 930, n: "Mike's Market" } };
export const SPAWN = { x: 672, y: 928 };
export const PATHS = [ // dalles de pierre
  [[672, 928], [800, 948], [900, 940], [1000, 900], [1026, 800], [1030, 720], [1080, 640], [1188, 600], [1260, 590], [1330, 520], [1330, 420], [1250, 360], [1100, 340], [950, 350]],
  [[672, 928], [560, 800], [440, 700]], [[672, 928], [660, 740], [660, 640]], [[672, 928], [500, 930], [330, 928]], [[672, 928], [560, 1060], [420, 1170]], [[672, 928], [650, 1100], [650, 1240]],
  [[1026, 880], [1010, 1050], [1000, 1250], [990, 1340]], [[1000, 900], [920, 1000]]
];
const inR = (X, Y, r) => X >= r.x && X < r.x + r.w && Y >= r.y && Y < r.y + r.h;
export const zoneOpen = (s, z) => !z.closed && s.lvl >= z.lvl;
// Peut-on marcher ici ? (open = false : on ignore le niveau, pour placer décors et fruits)
export const walkable = (s, X, Y) => ZONES.some(z => (!s || zoneOpen(s, z)) && z.rects.some(r => inR(X, Y, r))) && !BLOCKS.some(b => inR(X, Y, b));
export const onSpot = (X, Y, m = 0) => Object.values(SPOTS).concat(PLOTS).some(r => inR(X, Y, { x: r.x - m, y: r.y - m, w: r.w + 2 * m, h: r.h + 2 * m })) || BLOCKS.some(b => inR(X, Y, { x: b.x - m, y: b.y - m, w: b.w + 2 * m, h: b.h + 2 * m })) || inR(X, Y, { x: BRIDGE.x - m, y: BRIDGE.y - m, w: BRIDGE.w + 2 * m, h: BRIDGE.h + 2 * m });

// Sacs (emplacements = nombre de fruits portés) et bottes (bonus de vitesse en « unités Roblox » ; le saut n'existe pas dans cette version 2D)
export const BAGS = [
  { n: "Mini sac",         e: "👜", cap: 2, cost: 0 },
  { n: "Beginner Green Bag", e: "🎒", cap: 3, cost: 20 },
  { n: "Red Ranger Bag",   e: "🎒", cap: 4, cost: 100 }
];
export const BOOTS = [
  { n: "Leather Boots", e: "🥾", spd: 2, cost: 250 },
  { n: "Iron Boots",    e: "🥾", spd: 4, cost: 1250 }
];
export const PX_PER_STUD = 14.7;   // 16 unités/s de marche Roblox = 235 px/s ici
export const BASE_SPEED = 235;

// Les fruits sont posés au sol ; un fruit ramassé réapparaît ailleurs dans sa zone après ce délai (en ms) : À CONFIRMER (nombre de fruits par zone et délais inconnus)
export const RESPAWN = { common: 12000, uncommon: 20000, rare: 35000, epic: 50000, legendary: 80000, mythic: 120000 };

// Niveaux : l'XP vient de la vente (1 pièce = 1 XP) ; paliers À CONFIRMER
export const xpNeed = l => 30 + 20 * l;

export const capacity = s => BAGS[s.bag].cap;
export const speed = s => BASE_SPEED + (s.boots > 0 ? BOOTS[s.boots - 1].spd * PX_PER_STUD : 0);
export const count = s => FRUIT_IDS.reduce((t, k) => t + (s.inv[k] || 0), 0);
export const stacks = s => FRUIT_IDS.filter(k => s.inv[k] > 0);

export const fresh = () => ({ coins: 0, tickets: 0, xp: 0, lvl: 0, bag: 0, boots: 0, inv: {}, total: 0 });
export const sanitize = o => { // données venant de Firebase : on ne fait confiance à rien
  const s = fresh(), n = (v, d = 0) => (Number.isFinite(+v) && +v >= 0 ? +v : d);
  if (!o || typeof o !== "object") return s;
  s.coins = n(o.coins); s.tickets = Math.floor(n(o.tickets)); s.xp = n(o.xp); s.lvl = Math.floor(n(o.lvl)); s.total = n(o.total);
  s.bag = Math.min(BAGS.length - 1, Math.floor(n(o.bag))); s.boots = Math.min(BOOTS.length, Math.floor(n(o.boots)));
  const inv = o.inv && typeof o.inv === "object" ? o.inv : {}; let room = capacity(s);
  FRUIT_IDS.forEach(k => { const c = Math.min(room, Math.floor(n(inv[k]))); if (c > 0) { s.inv[k] = c; room -= c; } });
  return s;
};

// Ajoute de l'XP et monte de niveau ; renvoie le nombre de niveaux gagnés
export function addXp(s, x) { s.xp += x; let up = 0; while (s.xp >= xpNeed(s.lvl)) { s.xp -= xpNeed(s.lvl); s.lvl++; up++; } return up; }

// Actions : renvoient true si elles ont réussi
export function pick(s, id) { if (!FRUITS[id] || count(s) >= capacity(s)) return false; s.inv[id] = (s.inv[id] || 0) + 1; return true; }
export const stackGain = (s, id) => { const c = s.inv[id] || 0, f = FRUITS[id]; return f ? { coins: c * f.v, tickets: c * RAR[f.r].t, n: c } : { coins: 0, tickets: 0, n: 0 }; };
export const allGain = s => stacks(s).reduce((a, k) => { const g = stackGain(s, k); a.coins += g.coins; a.tickets += g.tickets; a.n += g.n; return a; }, { coins: 0, tickets: 0, n: 0 });
function cash(s, g) { s.coins += g.coins; s.tickets += g.tickets; s.total += g.coins; return addXp(s, g.coins); }
export function sellStack(s, id) { const g = stackGain(s, id); if (!g.n) return null; delete s.inv[id]; g.up = cash(s, g); return g; }
export function sellAll(s) { const g = allGain(s); if (!g.n) return null; s.inv = {}; g.up = cash(s, g); return g; }
export function buyBag(s) { const b = BAGS[s.bag + 1]; if (!b || s.coins < b.cost) return false; s.coins -= b.cost; s.bag++; return true; }
export function buyBoots(s) { const b = BOOTS[s.boots]; if (!b || s.coins < b.cost) return false; s.coins -= b.cost; s.boots++; return true; }

export const fmt = n => { n = Math.floor(n); if (n < 1e4) return String(n); const u = ["", "K", "M", "B", "T", "Qa"]; let i = 0, v = n; while (v >= 1000 && i < u.length - 1) { v /= 1000; i++; } return (v < 100 ? v.toFixed(1).replace(/\.0$/, "") : Math.round(v)) + u[i]; };
