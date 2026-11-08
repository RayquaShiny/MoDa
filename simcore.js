/* MoDa : « Mine Simulator » ⛏️ : règles et économie (aucune dépendance : testable hors navigateur) */

// Zones : ressource, vie d'un filon (hp), valeur d'une unité, unités par filon, prix de déblocage
export const ZONES = [
  { n: "Prairie",  e: "🍄", hp: 4,    val: 2,   yld: 3, cost: 0,      col: "#2f6b3a", r: { x: 60,   y: 480,  w: 620, h: 520 } },
  { n: "Forêt",    e: "🪵", hp: 30,   val: 14,  yld: 4, cost: 300,    col: "#1f5a4a", r: { x: 720,  y: 40,   w: 560, h: 420 } },
  { n: "Cavernes", e: "💎", hp: 250,  val: 120, yld: 4, cost: 6000,  col: "#3b3a6b", r: { x: 1320, y: 480,  w: 620, h: 520 } },
  { n: "Volcan",   e: "🌋", hp: 2000, val: 900, yld: 4, cost: 150000, col: "#7a2e1f", r: { x: 720,  y: 940,  w: 560, h: 420 } }
];
export const WORLD = { w: 2000, h: 1400 };
export const PADS = { sell: { x: 1000, y: 600, e: "💰", n: "Vente" }, shop: { x: 880, y: 790, e: "🛒", n: "Boutique", tab: "tools" }, egg: { x: 1000, y: 820, e: "🥚", n: "Œufs", tab: "eggs" }, reb: { x: 1120, y: 790, e: "⭐", n: "Renaissance", tab: "rebirth" } };

// Pets : multiplicateur de gains (les 3 meilleurs sont équipés automatiquement)
export const PETS = [
  { e: "🐥", n: "Poussin",   m: 0.10, r: "Commun" }, { e: "🐱", n: "Chat",    m: 0.25, r: "Rare" }, { e: "🐰", n: "Lapin",    m: 0.60, r: "Épique" }, { e: "🦊", n: "Renard",   m: 1.5,  r: "Légendaire" },
  { e: "🐺", n: "Loup",      m: 0.80, r: "Commun" }, { e: "🦁", n: "Lion",    m: 1.8,  r: "Rare" }, { e: "🐯", n: "Tigre",    m: 4,    r: "Épique" }, { e: "🐉", n: "Dragon",   m: 10,   r: "Légendaire" },
  { e: "🦄", n: "Licorne",   m: 6,    r: "Commun" }, { e: "🦅", n: "Aigle",   m: 15,   r: "Rare" }, { e: "🐲", n: "Hydre",    m: 40,   r: "Épique" }, { e: "👑", n: "Roi des pets", m: 120, r: "Légendaire" }
];
export const EGGS = [
  { n: "Œuf de ferme",   e: "🥚", cost: 300,   pets: [0, 1, 2, 3],    w: [60, 30, 9, 1] },
  { n: "Œuf des bois",   e: "🪺", cost: 4000,  pets: [4, 5, 6, 7],    w: [60, 30, 9, 1] },
  { n: "Œuf mythique",   e: "🔮", cost: 60000, pets: [8, 9, 10, 11],  w: [60, 30, 9, 1] }
];
export const MAXPETS = 60, SLOTS = 3;

export const toolCost = l => Math.round(15 * Math.pow(1.45, l));
export const bagCost = l => Math.round(20 * Math.pow(1.4, l));
export const power = l => 1 + l;
export const capacity = l => 15 + 10 * l;
export const rebirthCost = r => Math.round(400000 * Math.pow(5, r));
export const equipped = s => s.pets.slice().sort((a, b) => PETS[b].m - PETS[a].m).slice(0, SLOTS);
export const mult = s => (1 + equipped(s).reduce((t, p) => t + PETS[p].m, 0)) * (1 + 0.6 * s.rb);

export const fresh = () => ({ coins: 0, total: 0, tool: 0, bagL: 0, bn: 0, bv: 0, pets: [], zones: 1, rb: 0 });
export const sanitize = o => { // données venant de Firebase : on ne fait confiance à rien
  const s = fresh(), n = (v, d = 0) => (Number.isFinite(+v) && +v >= 0 ? +v : d);
  if (!o || typeof o !== "object") return s;
  s.coins = n(o.coins); s.total = n(o.total); s.tool = Math.floor(n(o.tool)); s.bagL = Math.floor(n(o.bagL)); s.rb = Math.floor(n(o.rb));
  s.zones = Math.max(1, Math.min(ZONES.length, Math.floor(n(o.zones, 1)))); s.bn = Math.floor(n(o.bn)); s.bv = n(o.bv);
  s.pets = (Array.isArray(o.pets) ? o.pets : Object.values(o.pets || {})).map(Number).filter(p => PETS[p]).slice(0, MAXPETS);
  if (s.bn > capacity(s.bagL)) { s.bn = capacity(s.bagL); }
  return s;
};

// Actions : renvoient true si elles ont réussi
export function buyTool(s) { const c = toolCost(s.tool); if (s.coins < c) return false; s.coins -= c; s.tool++; return true; }
export function buyBag(s) { const c = bagCost(s.bagL); if (s.coins < c) return false; s.coins -= c; s.bagL++; return true; }
export function unlockZone(s) { const z = ZONES[s.zones]; if (!z || s.coins < z.cost) return false; s.coins -= z.cost; s.zones++; return true; }
export function sell(s) { if (s.bn <= 0) return 0; const g = Math.round(s.bv * mult(s)); s.coins += g; s.total += g; s.bn = 0; s.bv = 0; return g; }
export function hatch(s, i, rnd = Math.random) {
  const e = EGGS[i]; if (!e || s.coins < e.cost) return -1; s.coins -= e.cost;
  let r = rnd() * e.w.reduce((a, b) => a + b, 0), k = 0; while (k < e.w.length - 1 && (r -= e.w[k]) >= 0) k++;
  const p = e.pets[k]; s.pets.push(p);
  if (s.pets.length > MAXPETS) { // inventaire plein : le moins bon pet part
    let w = 0; s.pets.forEach((q, j) => { if (PETS[q].m < PETS[s.pets[w]].m) w = j; }); s.pets.splice(w, 1);
  }
  return p;
}
export function rebirth(s) {
  const c = rebirthCost(s.rb); if (s.coins < c) return false;
  s.rb++; s.coins = 0; s.tool = 0; s.bagL = 0; s.bn = 0; s.bv = 0; return true; // on garde pets, zones et total
}
export const fmt = n => { n = Math.floor(n); if (n < 1e4) return String(n); const u = ["", "K", "M", "B", "T", "Qa"]; let i = 0, v = n; while (v >= 1000 && i < u.length - 1) { v /= 1000; i++; } return (v < 100 ? v.toFixed(1).replace(/\.0$/, "") : Math.round(v)) + u[i]; };
