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

// Zones : 0 = Spawn (centre), 1 = Forêt, 2 = Désert. Le Désert demande le niveau 5 (À CONFIRMER : le wiki donne « Forêt 0-4, Désert 5-9 »)
export const WORLD = { w: 2000, h: 1200 };
export const ZONES = [
  { n: "Spawn",  lvl: 0, r: { x: 780,  y: 380, w: 440, h: 440 } },
  { n: "Forêt",  lvl: 0, r: { x: 40,   y: 80,  w: 740, h: 1040 } },
  { n: "Désert", lvl: 5, r: { x: 1220, y: 80,  w: 740, h: 1040 } }
];
// Arbres par zone (type de fruit : nombre d'arbres)
export const TREES = [
  null,
  { apple: 6, pear: 4, green_apple: 3, crimson_pear: 2, sugar_apple: 1 },
  { banana: 5, lemon: 4, embum_banana: 3, java_banana: 2 }
];
export const PADS = {
  sell: { x: 1000, y: 500, n: "Vente" },
  shop: { x: 1000, y: 770, n: "Mike's Market" }
};
export const SPAWN = { x: 1000, y: 640 };

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

// Repousse d'un fruit sur son arbre (en ms) : À CONFIRMER (le vrai délai n'est pas connu)
export const REGROW = { common: 20000, uncommon: 30000, rare: 45000, epic: 60000, legendary: 90000, mythic: 120000 };
export const MAXFRUIT = 3; // fruits visibles par arbre (À CONFIRMER)

// Niveaux : l'XP vient de la vente (1 pièce = 1 XP) ; paliers À CONFIRMER
export const xpNeed = l => 30 + 20 * l;

export const capacity = s => BAGS[s.bag].cap;
export const speed = s => BASE_SPEED + (s.boots > 0 ? BOOTS[s.boots - 1].spd * PX_PER_STUD : 0);
export const count = s => FRUIT_IDS.reduce((t, k) => t + (s.inv[k] || 0), 0);
export const stacks = s => FRUIT_IDS.filter(k => s.inv[k] > 0);
export const zoneOpen = (s, z) => s.lvl >= ZONES[z].lvl;

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
