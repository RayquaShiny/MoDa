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
  lime:         { n: "Lime",          e: "🍈", r: "rare",     v: 26, z: 2, col: "#9ccc3a" },   // valeur À CONFIRMER
  cactus_fruit: { n: "Fruit de cactus", e: "🌵", r: "rare",   v: 32, z: 2, col: "#e91e8c" },   // valeur À CONFIRMER
  banana:       { n: "Banane",        e: "🍌", r: "uncommon", v: 14, z: 2, col: "#ffe135" },
  lemon:        { n: "Citron",        e: "🍋", r: "uncommon", v: 18, z: 2, col: "#fff176" },
  embum_banana: { n: "Banane Embum",  e: "🍌", r: "rare",     v: 22, z: 2, col: "#ff9800" },
  java_banana:  { n: "Banane Java",   e: "🍌", r: "epic",     v: 84, z: 2, col: "#8fd3ff" }
};
export const FRUIT_IDS = Object.keys(FRUITS);

// ----- Carte : décalquée sur la vue de dessus du vrai jeu (coordonnées image × 4) -----
// La forme exacte des zones vient d'une grille : 1 case = 5 px de l'image = 20 px ici.
// S = Spawn, F = Forêt, D = Désert du haut (cactus, citrons), C = Désert en colonne (bananes), A = Forêt d'automne, T = Toundra, c = falaise, H = partie cachée, . = vide
export const K = 4;
export const WORLD = { w: 2500, h: 2050 };
export const CELL = 5 * K, MAP_OX = 5, MAP_OY = 5;
export const MAP = [
  "......................................................................ccccccccccccccccccccccc......................",
  ".................................................................cccccccccccccccccccccccccccc......................",
  "...................................ccccccccccc..............ccccccccccccccccccccccccccccccccc......................",
  "..................................cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc.....................",
  "..................................cccccccccccccccccccccccccccccccccccHHHHHHHHHHHHHHHHHHHHccccc.....................",
  "..................................cccccccccccccccccccccccccccccccccccHHHHHHHHHHHHHHHHHHHHccccc.....................",
  "..................................cccccccccccccccccccccccccccccccccccHHHHHHHHHHHHHHHHHHHHccccc.....................",
  "...........................cc...cccccccccccccccccccccccccccccccccccccHHHHHHHHHHHHHHHHHHHHccccc.....................",
  "...........................cccccccccDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDcHHHHHHHHHHHHHHHHHHHHccccc.....................",
  "...........................c......ccDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDcHHHHHHHHHHHHHHHHHHHHccccc.....................",
  "............................c.....ccDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDcHHHHHHHHHHHHHHHHHHHHccccc.....................",
  "...........................cccccccccDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDcHHHHHHHHHHHHHHHHHHHHccccc.....................",
  "...........................cccccccccDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDcHHHHHHHHHHHHHHHHHHHHccccc.....................",
  "...........................cc.....ccDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDcHHHHHHHHHHHHHHHHHHHHccccc.....................",
  "...........................ccccccccDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDcHHHHHHHHHHHHHHHHHHHHccccc.....................",
  "...................ccccccccccccccccDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDcHHHHHHHHHHHHHHHHHHHHccccc.....................",
  "...................ccccccccccccccccDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDAAAAAAAAAAAAAAAAAAAAAAcccc.....................",
  "....cccccccccccccccccccccccccccccccDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDAAAAAAAAAAAAAAAAAAAAAAAccc.....................",
  "....cccccccccccccccccccccccccccccccDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDAAAAAAAAAAAAAAAAAAAAAAAcccc....................",
  "....cccccccccccccccccccccccccccccccFFCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCAAAAAAAAAAAAAAAAAAAAAAAcccc....................",
  "....ccccccccccccccccccSSSSSSSSSSSSSFFFFFFFFFFFFFFFFFFCCCCCCCCCCCCCCCAAAAAAAAAAAAAAAAAAAAAAAAccc....................",
  "....cccccccccccccccccSSSSSSSSSSSSSSFFFFFFFFFFFFFFFFFFFCCCCCCCCCCCCCCAAAAAAAAAAAAAAAAAAAAAAAAccc....................",
  "....ccccSSSSSSSSSSSSSSSSSSSSSSSSSSSFFFFFFFFFFFFFFFFFFFCCCCCCCCCCCCCCAAAAAAAAAAAAAAAAAAAAAAAcccc....................",
  "....ccccSSSSSSSSSSSSSSSSSSSSSSSSSSSFFFFFFFFFFFFFFFFFFFCCCCCCCCCCCCCCAAAAAAAAAAAAAAAAAAAAAAAcccc....................",
  "....ccccSSSSSSSSSSSSSSSSSSSSSSSSSSSFFFFFFFFFFFFFFFFFFFCCCCCCCCCCCCCCAAAAAAAAAAAAAAAAAAAAAAAcccc....................",
  "....ccccSSSSSSSSSSSSSSSSSSSSSSSSSSSFFFFFFFFFFFFFFFFFFFCCCCCCCCCCCCCCAAAAAAAAAAAAAAAAAAAAAAAcccc....................",
  "....ccccSSSSSSSSSSSSSSSSSSSSSSSSSSSFFFFFFFFFFFFFFFFFFCCCCCCCCCCCCCCCCAAAAAAAAAAAAAAAAAAAAAAcccc....................",
  "....ccccSSSSSSSSSSSSSSSSSSSSSSSSSSSFFFFFFFFFFFFFFFFFFCCCCCCCCCCCCCCCCCAAAAAAAAAAAAAAAAAAAAAcccc....................",
  "....ccccSSSSSSSSSSSSSSSSSSSSSSSSSSSFFFFFFFFFFFFFFFFFFCCCCCCCCCCCCCCCCCAAAAAAAAAAAAAAAAAAAAAcccc....................",
  "....ccccSSSSSSSSSSSSSSSSSSSSSSSSSSSFFFFFFFFFFFFFFFFFFFCCCCCCCCCCCCCCCCAAAAAAAAAAAAAAAAAAAAAcccc....................",
  "...cccccSSSSSSSSSSSSSSSSSSSSSSSSSSSFFFFFFFFFFFFFFFFFFFCCCCCCCCCCCCCCCAAAAAAAAAAAAAAAAAAAAAAAccc....................",
  ".cccccccSSSSSSSSSSSSSSSSSSSSSSSSSSSFFFFFFFFFFFFFFFFFFFCCCCCCCCCCCCCCAAAAAAAAAAAAAAAAAAAAAAAAccc....................",
  ".cccccccSSSSSSSSSSSSSSSSSSSSSSSSSSSFFFFFFFFFFFFFFFFFFFCCCCCCCCCCCCCCAAAAAAAAAAAAAAAAAAAAAAAAccc....................",
  ".cccccccSSSSSSSSSSSSSSSSSSSSSSSSSSSFFFFFFFFFFFFFFFFFFFCCCCCCCCCCCCCCAAAAAAAAAAAAAAAAAAAAAAAAccc....................",
  ".cccccccSSSSSSSSSSSSSSSSSSSSSSSSSSSFFFFFFFFFFFFFFFFFFFCCCCCCCCCCCCCCAAAAAAAAAAAAAAAAAAAAAAAAcccc...................",
  ".cccccSSSSSSSSSSSSSSSSSSSSSSSSSSSSSFFFFFFFFFFFFFFFFFFFCCCCCCCCCCCCCCAAAAAAAAAAAAAAAAAAAAAAAAcccc...................",
  ".cccccSSSSSSSSSSSSSSSSSSSSSSSSSSSSSFFFFFFFFFFFFFFFFFFCCCCCCCCCCCCCCCAAAAAAAAAAAAAAAAAAAAAAAAcccc............cccc...",
  ".ccccSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSFFFFFFFFFFFFFFFFFFFCCCCCCCCCCCCCCAAAAAAAAAAAAAAAAAAAAAAAAcccccccccccccccccccc...",
  ".ccccSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSFFFFFFFFFFFFFFFFFFFCCCCCCCCCCCCCCAAAAAAAAAAAAAAAAAAAAAAAAcccccccccccccccccccc...",
  ".ccccSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSFFFFFFFFFFFFFFFFFFFCCCCCCCCCCCCCCAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAcccccc...",
  ".ccccSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSFFFFFFFFFFFFFFFFFFFCCCCCCCCCCCCCCAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAcccccc...",
  "cccccSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSFFFFFFFFFFFFFFFFFFFCCCCCCCCCCCCCCAAAAAAAAAAAAAAHHHHHHHHHHHHHHHHHHHHHHHHHHHHHH...",
  "cccccSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSFFFFFFFFFFFFFFFFFFFCCCCCCCCCCCCCCAAAAAAAAAAAAAAHHHHHHHHHHHHHHHHHHHHHHHHHHHHHH...",
  "cccccSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSFFFFFFFFFFFFFFFFFFFCCCCCCCCCCCCCCAAAAAAAAAAAAAAHHHHHHHHHHHHHHHHHHHHHHHHHHHHHH...",
  "cccccSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSFFFFFFFFFFFFFFFFFFFCCCCCCCCCCCCCCAAAAAAAAAAAAAAHHHHHHHHHHHHHHHHHHHHHHHHHHHHHH...",
  "cccccSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSFFFFFFFFFFFFFFFFFFFCCCCCCCCCCCCCCAAAAAAAAAAAAAAHHHHHHHHHHHHHHHHHHHHHHHHHHHHHH...",
  "cccccSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSFFFFFFFFFFFFFFFFFFFCCCCCCCCCCCCCCAAAAAAAAAAAcccHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHc..",
  "..ccccSSSSSSSSSSSSSSSSSSSSSSSSSSSSSFFFFFFFFFFFFFFFFFFFCCCCCTTTTTTTCCAAAAAAAAAAAcccHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHc..",
  "..cccccSSSSSSSSSSSSSSSSSSSSSSSSSSSSFFFFFFFFFFFFFFFFFFFCCTTTTTTTTTTTTTTATTAAAAAAcccHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHc..",
  "..cccccSSSSSSSSSSSSSSSSSSSSSSSSSSSSFFFFFFFFFFFFFFFFFFFTTTTTTTTTTTTTTTTTTTTTTAAccccHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHc..",
  "..cccccSSSSSSSSSSSSSSSSSSSSSSSSSSSSFFFFFFFFFFFFFFFFFFFTTTTTTTTTTTTTTTTTTTTTTTAccccHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHc..",
  "..cccccSSSSSSSSSSSSSSSSSSSSSSSSSSSSFFFFFFFFFFFFFFFFFFFTTTTTTTTTTTTTTTTTTTTTTTTccccHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHc..",
  "..cccccSSSSSSSSSSSSSSSSSSSSSSSSSSSSFFFFFFFFFFFFFFFFFFFTTTTTTTTTTTTTTTTTTTTTTTTccccHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHc..",
  "..cccccSSSSSSSSSSSSSSSSSSSSSSSSSSSSFFFFFFFFFFFFFFFFFFTTTTTTTTTTTTTTTTTTTTTTTTTccccHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHcc.",
  "..cccccSSSSSSSSSSSSSSSSSSSSSSSSSSSSFFFFFFFFFFFFFFFFFFTTTTTTTTTTTTTTTTTTTTTTTTTccccHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHcc.",
  "..cccccSSSSSSSSSSSSSSSSSSSSSSSSSSSSFFFFFFFFFFFFFFFFFFTTTTTTTTTTTTTTTTTTTTTTTTTccccHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHcc.",
  "..cccccSSSSSSSSSSSSSSSSSSSSSSSSSSSSFFFFFFFFFFFFFFFFFFTTTTTTTTTTTTTTTTTTTTTTTTTccccHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHcc.",
  "..ccccSSSSSSSSSSSSSSSSSSSSSSSSSSSSSFFFFFFFFFFFFFFFFFFFTTTTTTTTTTTTTTTTTTTTTTTTccccHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHcc.",
  "..ccccSSSSSSSSSSSSSSSSSSSSSSSSSSSSSFFFFFFFFFFFFFFFFFFFTTTTTTTTTTTTTTTTTTTTTTTTTcccHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHcc.",
  "..ccccSSSSSSSSSSSSSSSSSSSSSSSSSSSSSFFFFFFFFFFFFFFFFFFFTTTTTTTTTTTTTTTTTTTTTTTTTcccHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHcc.",
  "..ccccSSSSSSSSSSSSSSSSSSSSSSSSSSSSSFFFFFFFFFFFFFFFFFFFTTTTTTTTTTTTTTTTTTTTTTTTTcccHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHcc.",
  "..ccccSSSSSSSSSSSSSSSSSSSSSSSSSSSSSFFFFFFFFFFFFFFFFFFFTTTTTTTTTTTTTTTTTTTTTTTTTcccHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHcc.",
  ".................cccSSSSSSSSSSSSSSSFFFFFFFFFFFFFFFFFFFTTTTTTTTTTTTTTTTTTTTTTTTTcccHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHcc.",
  ".................cccSSSSSSSSSSSSSSSFFFFFFFFFFFFFFFFFFFTTTTTTTTTTTTTTTTTTTTTTTTTcccHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHcc.",
  ".................cccSSSSSSSSSSSSSSSFFFFFFFFFFFFFFFFFFFTTTTTTTTTTTTTTTTTTTTTTTTTcccHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHcc.",
  ".................ccccccccccccccccccFFFFFFFFFFFFFFFFFFFTTTTTTTTTTTTTTTTTTTTTTTTTTccHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHccc",
  "..................................cFFFFFFFFFFFFFFFFFFFTTTTTTTTTTTTTTTTTTTTTTTTTTccHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHccc",
  "..................................cFFFFFFFFFFFFFFFFFFFTTTTTTTTTTTTTTTTTTTTTTTTTTccHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHccc",
  "..................................cFFFFFFFFFFFFFFFFFFFTTTTTTTTTTTTTTTTTTTTTTTTTTccHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHccc",
  ".................................ccFFFFFFFFFFFFFFFFFFFTTTTTTTTTTTTTTTTTTTTTTTTTTccHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHccc",
  ".................................ccFFFFFFFFFFFFFFFFFFFTTTTTTTTTTTTTTTTTTTTTTTTTTccHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHccc",
  ".................................ccFFFFFFFFFFFFFFFFFFFTTTTTTTTTTTTTTTTTTTTTTTTTTccHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHccc",
  ".................................ccFFFFFFFFFFFFFFFFFFFTTTTTTTTTTTTTTTTTTTTTTTTTTccHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHccc",
  ".................................ccFFFFFFFFFFFFFFFFFFFTTTTTTTTTTTTTTTTTTTTTTTTTTccHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHccc",
  ".................................ccFFFFFFFFFFFFFFFFFFFTTTTTTTTTTTTTTTTTTTTTTTTTTcccccccc...........................",
  ".................................ccFFFFFFFFFFFFFFFFFFFTTTTTTTTTTTTTTTTTTTTTTTTTTcccccccc...........................",
  ".................................ccccccccccccccccccccccTTTTTTTTTTTTTTTTTTTTTTTTTTccccccc...........................",
  ".................................cccccccccccccccccccccccccccccccccTTTTTTTTTTTTTTTccccccc...........................",
  ".......................................cccccccccccccccccccccccccccccccTTTTTTTTTTcccccccc...........................",
  ".........................................cccccccc................cccccTTTTTTTTTTcccccccc...........................",
  ".........................................cccccccc................cccccTTTTTTTTTTcccccccc...........................",
  ".........................................cccccccc................cccccTTTTTTTTTTcccccccc...........................",
  ".........................................cccccccc................cccccTTTTTTTTTTcccccccc...........................",
  ".........................................cccccccc................cccccTTTTTTTTTTcccccccc...........................",
  ".........................................cccccccc................cccccTTTTTTTTTTccccccc............................",
  ".........................................cccccccc................cccccTTTTTTTTTTccccccc............................",
  ".........................................cccccccc.................ccccTTTTTTTTTTccccccc............................",
  ".........................................cccccccc.................ccccTTTTTTTTTTccccccc............................",
  "..................................................................ccTTTTTTTTTTTTccccccc............................",
  "..................................................................ccTTTTTTTTTTTTTcccccc............................",
  "..................................................................ccccccccccccccccccccc............................",
  "...................................................................cccccccccccccccccccc............................",
  "....................................................................ccccccccccccccccccc............................",
  "..............................................................................ccccccccc............................"
];
// Fusionne les cases d'un même type en rectangles (une ligne de cases → un rectangle, étendu vers le bas s'il se répète)
const cellRects = ch => {
  const out = []; let prev = {};
  MAP.forEach((row, j) => {
    const cur = {};
    for (let i = 0; i < row.length;) {
      if (row[i] !== ch) { i++; continue; }
      let e = i; while (e < row.length && row[e] === ch) e++;
      const k = i + "," + e; let q = prev[k];
      if (q) q.h += CELL; else { q = { x: (MAP_OX + i) * CELL, y: (MAP_OY + j) * CELL, w: (e - i) * CELL, h: CELL }; out.push(q); }
      cur[k] = q; i = e;
    }
    prev = cur;
  });
  return out;
};
const R = (x1, y1, x2, y2) => ({ x: x1 * K, y: y1 * K, w: (x2 - x1) * K, h: (y2 - y1) * K });
// Zones : Spawn (à gauche, avec les 5 parcelles), Forêt (milieu, côté pommes/poires, avec le Marché de Mike au sud), Désert.
// Le Désert demande le niveau 5 (À CONFIRMER : le wiki donne « Forêt 0-4, Désert 5-9 »). On y entre par la rampe « NIVEAU 5 » (à droite du pont) :
// on arrive dans la colonne des bananes. Pour atteindre le plateau des cactus et citrons (en haut), il faut ensuite MONTER par l'échelle depuis les bananes :
// il n'y a aucun passage direct depuis la Forêt (poires).
// La Toundra et la Forêt d'automne sont sur la carte mais fermées pour l'instant.
export const ZONES = [
  { id: "spawn",  n: "Spawn",           lvl: 0,  rects: cellRects("S") },
  { id: "forest", n: "Forêt",           lvl: 0,  rects: cellRects("F"), fruit: { n: 22, w: { apple: 40, pear: 25, green_apple: 18, crimson_pear: 10, sugar_apple: 7 } } },
  { id: "desert", n: "Désert (bananes)", lvl: 5, rects: cellRects("C"), fruit: { n: 14, w: { banana: 55, embum_banana: 30, java_banana: 15 } } },
  { id: "autumn", n: "Forêt d'automne", lvl: 15, closed: true, rects: cellRects("A") },
  { id: "tundra", n: "Toundra",         lvl: 10, closed: true, rects: cellRects("T") },
  { id: "cactus", n: "Désert (cactus)", lvl: 5,  rects: cellRects("D"), fruit: { n: 16, w: { lemon: 45, lime: 30, cactus_fruit: 25 } } }
];
export const CLIFFS = cellRects("c");
// Parcelles des joueurs (5 = le nombre de joueurs d'un serveur) : dessinées, mais sans fonction dans cette version
export const PLOTS = [R(69, 139, 125, 192), R(137, 131, 192, 185), R(55, 205, 111, 260), R(62, 271, 120, 328), R(131, 286, 190, 344)];
// Obstacles : clôture Spawn | Forêt (avec un passage), murs de falaise, rivière (traversable seulement sur le pont)
export const FENCES = [ { x: 794, y: 512, w: 12, h: 360 }, { x: 794, y: 1024, w: 12, h: 368 } ];
export const WALLS = [
  { x: 1180, y: 472, w: 16, h: 136 }, { x: 1180, y: 700, w: 16, h: 932 },          // mur Forêt | Désert + Toundra (la rampe « NIVEAU 5 » passe entre les deux)
  { x: 780,  y: 472, w: 408, h: 24 },                                               // falaise Forêt | plateau des cactus (aucun passage)
  { x: 1188, y: 472, w: 196, h: 16 }, { x: 1448, y: 472, w: 16, h: 16 }             // falaise bananes | cactus (l'échelle passe entre les deux)
];
export const RIVERS = [ { x: 800, y: 792, w: 204, h: 56 }, { x: 1048, y: 792, w: 132, h: 56 } ];
export const BRIDGE = { x: 1004, y: 772, w: 44, h: 112 };
// Décors non traversés par les fruits (pas des obstacles) : le coffre de vente, la rampe et l'échelle du Désert, le sable, l'oasis...
export const SPOTS = {
  chest: R(186, 238, 198, 250), ramp: R(268, 152, 296, 175), climb: R(346, 110, 362, 128), door: R(320, 244, 346, 260), pit: R(214, 331, 282, 397), oasis: R(207, 71, 230, 98),
  ice: R(329, 352, 353, 379), station: R(366, 410, 430, 475), ladder: R(395, 260, 417, 357)
};
export const HIDDEN = [R(368, 47, 471, 105), R(434, 228, 587, 393)]; // zones non montrées sur la carte (falaise pleine)
// Vente : le coffre « SELL HERE », à côté de la clôture, près du passage Spawn → Forêt. Boutique : le Marché de Mike, dans le carré marron au sud de la Forêt (côté pommes)
export const PADS = { sell: { x: 764, y: 976, n: "Vente" }, shop: { x: 992, y: 1470, n: "Mike's Market" } };
// Mike's Market : c'est le carré marron (le « bac à sable » de la vue de dessus) : une vraie salle fermée, avec une porte au nord
export const MARKET_WALLS = (() => { const p = SPOTS.pit, t = 16, cx = p.x + p.w / 2, d = 32; return [
  { x: p.x, y: p.y, w: cx - d - p.x, h: t }, { x: cx + d, y: p.y, w: p.x + p.w - cx - d, h: t },   // mur du nord, avec la porte au milieu
  { x: p.x, y: p.y, w: t, h: p.h }, { x: p.x + p.w - t, y: p.y, w: t, h: p.h }, { x: p.x, y: p.y + p.h - t, w: p.w, h: t }
]; })();
export const BLOCKS = FENCES.concat(WALLS, RIVERS, MARKET_WALLS);
// Zone du Marché + son parvis (ni arbres ni dalles dedans, pour que la porte et l'enseigne restent dégagées)
export const inMarket = (X, Y) => { const p = SPOTS.pit; return X > p.x - 30 && X < p.x + p.w + 30 && Y > p.y - 120 && Y < p.y + p.h + 30; };
// Même chose autour de la rampe « NIVEAU 5 », de l'échelle et de la porte du Désert
export const keepClear = (X, Y) => inMarket(X, Y) || [SPOTS.ramp, SPOTS.climb, SPOTS.door].some(r => X > r.x - 34 && X < r.x + r.w + 34 && Y > r.y - 34 && Y < r.y + r.h + 34) || Math.hypot(X - SIGN.x, Y - SIGN.y) < 80 || Math.hypot(X - PADS.sell.x, Y - PADS.sell.y) < 90;
export const SIGN = { x: 888, y: 1008 };   // panneau « SHOP → / ← DESERT » (la boutique est au sud, le Désert au nord)
export const SPAWN = { x: 672, y: 928 };
// Éléments relevés un par un sur la vue de dessus (en pixels de l'image, à multiplier par K)
export const TREES = [[235,133],[229,155],[238,171],[219,173],[283,178],[285,221],[214,244],[256,247],[272,255],[224,259],[285,266],[270,273],[236,272],[217,279],[231,293],[267,300],[216,310],[256,328]];   // arbres de la Forêt
export const CACTI = [[207,68],[216,68],[247,69],[291,68],[354,70],[267,101],[356,102],[229,103],[310,102],[304,130],[355,151],[341,170],[312,184],[341,199],[302,207],[353,219],[311,237],[308,256],[355,258]];    // cactus du Désert
export const BUSHES = [[376,276],[315,282],[345,284],[305,302],[381,310],[352,311],[341,321],[327,334],[352,336],[375,338],[378,357],[415,367],[357,371],[372,398],[417,399]];   // buissons de la Toundra
const inR = (X, Y, r) => X >= r.x && X < r.x + r.w && Y >= r.y && Y < r.y + r.h;
export const zoneOpen = (s, z) => !z.closed && s.lvl >= z.lvl;
// Peut-on marcher ici ? (open = false : on ignore le niveau, pour placer décors et fruits)
export const walkable = (s, X, Y) => ZONES.some(z => (!s || zoneOpen(s, z)) && z.rects.some(r => inR(X, Y, r))) && !BLOCKS.some(b => inR(X, Y, b));
export const onSpot = (X, Y, m = 0) => Object.values(SPOTS).concat(PLOTS).some(r => inR(X, Y, { x: r.x - m, y: r.y - m, w: r.w + 2 * m, h: r.h + 2 * m })) || BLOCKS.some(b => inR(X, Y, { x: b.x - m, y: b.y - m, w: b.w + 2 * m, h: b.h + 2 * m })) || inR(X, Y, { x: BRIDGE.x - m, y: BRIDGE.y - m, w: BRIDGE.w + 2 * m, h: BRIDGE.h + 2 * m });
// Chemins de dalles : un réseau logique. Spawn → parcelles ; Spawn → passage de la clôture → carrefour de la Forêt ;
// carrefour → porte du Marché ; carrefour → pont → rampe « NIVEAU 5 » ; colonne des bananes → porte et échelle ; plateau des cactus.
export const PATHS = [
  [[672, 928], [740, 918], [800, 920], [870, 940], [930, 962]],
  [[930, 962], [960, 1060], [985, 1160], [992, 1250], [992, 1288]],
  [[930, 962], [990, 900], [1026, 860], [1026, 780], [1030, 700], [1060, 656]],
  [[1196, 654], [1240, 680], [1262, 760], [1284, 860], [1318, 960]],
  [[1262, 760], [1330, 640], [1392, 540], [1416, 520]],
  [[1416, 432], [1330, 400], [1220, 380], [1100, 360], [980, 340], [880, 300]],
  [[672, 928], [600, 860], [520, 800], [490, 770]],
  [[672, 928], [690, 860], [700, 790], [690, 752]],
  [[672, 928], [600, 930], [520, 930], [462, 930]],
  [[672, 928], [600, 1000], [540, 1070], [500, 1100]],
  [[672, 928], [660, 1020], [650, 1100], [645, 1140]]
];
// Les dalles sont posées à intervalle régulier le long des chemins (jamais sur le pont, la rampe, l'échelle, la porte, la tuile d'apparition ou dans le Marché)
export const SLABS = (() => {
  const out = [], pit = SPOTS.pit, skip = [BRIDGE, SPOTS.ramp, SPOTS.climb, SPOTS.door, { x: 626, y: 884, w: 92, h: 88 }, { x: pit.x - 8, y: pit.y - 30, w: pit.w + 16, h: pit.h + 42 }];
  PATHS.forEach(P => { for (let i = 1; i < P.length; i++) {
    const [ax, ay] = P[i - 1], [bx, by] = P[i], n = Math.max(1, Math.round(Math.hypot(bx - ax, by - ay) / 46));
    for (let q = i === 1 ? 0 : 1; q <= n; q++) { const X = ax + (bx - ax) * q / n, Y = ay + (by - ay) * q / n;
      if (!walkable(null, X, Y) || skip.some(r => inR(X, Y, r)) || out.some(o => Math.hypot(o[0] * K - X, o[1] * K - Y) < 30)) continue; out.push([X / K, Y / K]); } } });
  return out;
})();
export const nearSlab = (X, Y, d) => SLABS.some(([a, b]) => Math.hypot(a * K - X, b * K - Y) < d);

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
