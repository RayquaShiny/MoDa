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
// S = Spawn, F = Forêt, D = Désert (bananes), C = Désert (cactus), M = Marché de Mike, A = Forêt d'automne, T = Toundra, c = falaise, H = partie cachée, . = vide
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
  "....cccccccccccccccccccccccccccccccFFDDDDDDDDDDDDDDDDDCCCCCCCCCCCCCCAAAAAAAAAAAAAAAAAAAAAAAcccc....................",
  "....ccccccccccccccccccSSSSSSSSSSSSSFFFFFFFFFFFFFFFFFFDCCCCCCCCCCCCCCAAAAAAAAAAAAAAAAAAAAAAAAccc....................",
  "....cccccccccccccccccSSSSSSSSSSSSSSFFFFFFFFFFFFFFFFFFFCCCCCCCCCCCCCCAAAAAAAAAAAAAAAAAAAAAAAAccc....................",
  "....ccccSSSSSSSSSSSSSSSSSSSSSSSSSSSFFFFFFFFFFFFFFFFFFFCCCCCCCCCCCCCCAAAAAAAAAAAAAAAAAAAAAAAcccc....................",
  "....ccccSSSSSSSSSSSSSSSSSSSSSSSSSSSFFFFFFFFFFFFFFFFFFFCCCCCCCCCCCCCCAAAAAAAAAAAAAAAAAAAAAAAcccc....................",
  "....ccccSSSSSSSSSSSSSSSSSSSSSSSSSSSFFFFFFFFFFFFFFFFFFFCCCCCCCCCCCCCCAAAAAAAAAAAAAAAAAAAAAAAcccc....................",
  "....ccccSSSSSSSSSSSSSSSSSSSSSSSSSSSFFFFFFFFFFFFFFFFFFFCCCCCCCCCCCCCCAAAAAAAAAAAAAAAAAAAAAAAcccc....................",
  "....ccccSSSSSSSSSSSSSSSSSSSSSSSSSSSFFFFFFFFFFFFFFFFFFDCCCCCCCCCCCCCCCAAAAAAAAAAAAAAAAAAAAAAcccc....................",
  "....ccccSSSSSSSSSSSSSSSSSSSSSSSSSSSFFFFFFFFFFFFFFFFFFDCCCCCCCCCCCCCCCCAAAAAAAAAAAAAAAAAAAAAcccc....................",
  "....ccccSSSSSSSSSSSSSSSSSSSSSSSSSSSFFFFFFFFFFFFFFFFFFDCCCCCCCCCCCCCCCCAAAAAAAAAAAAAAAAAAAAAcccc....................",
  "....ccccSSSSSSSSSSSSSSSSSSSSSSSSSSSFFFFFFFFFFFFFFFFFFFCCCCCCCCCCCCCCCCAAAAAAAAAAAAAAAAAAAAAcccc....................",
  "...cccccSSSSSSSSSSSSSSSSSSSSSSSSSSSFFFFFFFFFFFFFFFFFFFCCCCCCCCCCCCCCCAAAAAAAAAAAAAAAAAAAAAAAccc....................",
  ".cccccccSSSSSSSSSSSSSSSSSSSSSSSSSSSFFFFFFFFFFFFFFFFFFFCCCCCCCCCCCCCCAAAAAAAAAAAAAAAAAAAAAAAAccc....................",
  ".cccccccSSSSSSSSSSSSSSSSSSSSSSSSSSSFFFFFFFFFFFFFFFFFFFCCCCCCCCCCCCCCAAAAAAAAAAAAAAAAAAAAAAAAccc....................",
  ".cccccccSSSSSSSSSSSSSSSSSSSSSSSSSSSFFFFFFFFFFFFFFFFFFFCCCCCCCCCCCCCCAAAAAAAAAAAAAAAAAAAAAAAAccc....................",
  ".cccccccSSSSSSSSSSSSSSSSSSSSSSSSSSSFFFFFFFFFFFFFFFFFFFCCCCCCCCCCCCCCAAAAAAAAAAAAAAAAAAAAAAAAcccc...................",
  ".cccccSSSSSSSSSSSSSSSSSSSSSSSSSSSSSFFFFFFFFFFFFFFFFFFFCCCCCCCCCCCCCCAAAAAAAAAAAAAAAAAAAAAAAAcccc...................",
  ".cccccSSSSSSSSSSSSSSSSSSSSSSSSSSSSSFFFFFFFFFFFFFFFFFFDCCCCCCCCCCCCCCAAAAAAAAAAAAAAAAAAAAAAAAcccc............cccc...",
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
  ".................................ccccccccMMMMMMMMccccccTTTTTTTTTTTTTTTTTTTTTTTTTTccccccc...........................",
  ".................................ccccccccMMMMMMMMcccccccccccccccccTTTTTTTTTTTTTTTccccccc...........................",
  ".......................................ccMMMMMMMMcccccccccccccccccccccTTTTTTTTTTcccccccc...........................",
  ".........................................MMMMMMMM................cccccTTTTTTTTTTcccccccc...........................",
  ".........................................MMMMMMMM................cccccTTTTTTTTTTcccccccc...........................",
  ".........................................MMMMMMMM................cccccTTTTTTTTTTcccccccc...........................",
  ".........................................MMMMMMMM................cccccTTTTTTTTTTcccccccc...........................",
  ".........................................MMMMMMMM................cccccTTTTTTTTTTcccccccc...........................",
  ".........................................MMMMMMMM................cccccTTTTTTTTTTccccccc............................",
  ".........................................MMMMMMMM................cccccTTTTTTTTTTccccccc............................",
  ".........................................MMMMMMMM.................ccccTTTTTTTTTTccccccc............................",
  ".........................................MMMMMMMM.................ccccTTTTTTTTTTccccccc............................",
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
// Zones : Spawn (à gauche, avec les 5 parcelles), Forêt (milieu, côté pommes/poires), Marché de Mike (la salle sous la Forêt), Désert.
// Le Désert demande le niveau 5 (À CONFIRMER : le wiki donne « Forêt 0-4, Désert 5-9 ») et s'y entre par la rampe « NIVEAU 5 » : on arrive dans la zone des bananes,
// puis on MONTE par l'échelle pour atteindre la zone des cactus et citrons (pas de passage direct depuis la Forêt).
// La Toundra et la Forêt d'automne sont sur la carte mais fermées pour l'instant.
export const ZONES = [
  { id: "spawn",  n: "Spawn",           lvl: 0,  rects: cellRects("S") },
  { id: "forest", n: "Forêt",           lvl: 0,  rects: cellRects("F"), fruit: { n: 22, w: { apple: 40, pear: 25, green_apple: 18, crimson_pear: 10, sugar_apple: 7 } } },
  { id: "desert", n: "Désert (bananes)", lvl: 5, rects: cellRects("D"), fruit: { n: 14, w: { banana: 55, embum_banana: 30, java_banana: 15 } } },
  { id: "autumn", n: "Forêt d'automne", lvl: 15, closed: true, rects: cellRects("A") },
  { id: "tundra", n: "Toundra",         lvl: 10, closed: true, rects: cellRects("T") },
  { id: "cactus", n: "Désert (cactus)", lvl: 5,  rects: cellRects("C"), fruit: { n: 16, w: { lemon: 45, lime: 30, cactus_fruit: 25 } } },
  { id: "market", n: "Marché de Mike",  lvl: 0,  rects: cellRects("M") }
];
export const CLIFFS = cellRects("c");
// Parcelles des joueurs (5 = le nombre de joueurs d'un serveur) : dessinées, mais sans fonction dans cette version
export const PLOTS = [R(69, 139, 125, 192), R(137, 131, 192, 185), R(55, 205, 111, 260), R(62, 271, 120, 328), R(131, 286, 190, 344)];
// Obstacles : clôture Spawn | Forêt (avec un passage), murs de falaise, rivière (traversable seulement sur le pont)
export const FENCES = [ { x: 794, y: 512, w: 12, h: 360 }, { x: 794, y: 1024, w: 12, h: 368 } ];
export const WALLS = [
  { x: 1180, y: 472, w: 16, h: 1160 },                                              // mur Forêt | Désert + Toundra
  { x: 812,  y: 472, w: 132, h: 16 }, { x: 1024, y: 472, w: 164, h: 16 },           // falaise Forêt | bananes (la rampe passe entre les deux)
  { x: 1188, y: 472, w: 196, h: 16 }, { x: 1448, y: 472, w: 16, h: 16 }             // falaise bananes | cactus (l'échelle passe entre les deux)
];
export const RIVERS = [ { x: 800, y: 792, w: 204, h: 56 }, { x: 1048, y: 792, w: 132, h: 56 } ];
export const BLOCKS = FENCES.concat(WALLS, RIVERS);
export const BRIDGE = { x: 1004, y: 772, w: 44, h: 112 };
// Décors non traversés par les fruits (pas des obstacles) : le coffre de vente, la rampe et l'échelle du Désert, le sable, l'oasis...
export const SPOTS = {
  white: R(238, 133, 253, 151), chest: R(186, 238, 198, 250), ramp: R(236, 112, 256, 134), climb: R(346, 110, 362, 128), pit: R(214, 331, 282, 397), oasis: R(207, 71, 230, 98),
  ice: R(329, 352, 353, 379), station: R(366, 410, 430, 475), ladder: R(395, 260, 417, 357)
};
export const HIDDEN = [R(368, 47, 471, 105), R(434, 228, 587, 393)]; // zones non montrées sur la carte (falaise pleine)
// Vente : le coffre « SELL HERE », à côté de la clôture, près du passage Spawn → Forêt. Boutique : la salle du Marché de Mike, sous la Forêt (côté pommes)
export const PADS = { sell: { x: 764, y: 976, n: "Vente" }, shop: { x: 1000, y: 1740, n: "Mike's Market" } };
export const SPAWN = { x: 672, y: 928 };
// Éléments relevés un par un sur la vue de dessus (en pixels de l'image, à multiplier par K)
export const SLABS = [[363,66],[246,88],[299,88],[264,88],[280,88],[236,90],[254,90],[314,90],[272,92],[290,92],[325,92],[307,94],[329,100],[324,108],[462,108],[328,116],[459,118],[478,122],[244,124],[326,126],[457,127],[195,126],[448,129],[131,132],[438,133],[328,134],[66,138],[406,139],[435,142],[416,142],[326,144],[399,143],[444,145],[425,146],[453,148],[296,149],[368,152],[322,152],[375,152],[244,154],[422,155],[314,155],[413,158],[458,158],[242,164],[310,164],[264,164],[409,167],[256,168],[462,168],[244,172],[314,172],[252,174],[322,175],[465,177],[254,182],[324,183],[463,186],[444,189],[166,190],[326,192],[128,199],[170,200],[324,200],[136,203],[463,207],[326,208],[166,208],[408,211],[138,212],[148,216],[324,216],[468,216],[168,218],[405,220],[152,224],[328,224],[464,225],[254,226],[492,226],[189,229],[409,229],[118,232],[138,232],[180,232],[154,233],[197,233],[324,233],[128,234],[144,234],[166,232],[134,233],[206,234],[250,234],[215,237],[406,238],[327,242],[140,243],[246,243],[166,244],[219,246],[236,246],[228,249],[137,252],[170,254],[128,257],[405,257],[232,258],[125,265],[166,266],[236,266],[244,269],[418,268],[341,271],[168,275],[248,278],[330,279],[244,286],[332,288],[240,294],[250,296],[330,297],[260,299],[270,302],[244,304],[326,306],[317,311],[242,314],[314,321],[246,324],[311,331],[222,334],[313,342],[310,354],[404,357],[314,364],[401,366],[218,368],[312,374],[376,378],[367,382],[338,382],[386,382],[316,384],[358,385],[333,391],[390,392],[353,396],[314,397],[343,398],[332,401],[323,402]];   // dalles de pierre
export const TREES = [[235,133],[229,155],[238,171],[219,173],[283,178],[285,221],[214,244],[256,247],[272,255],[224,259],[285,266],[270,273],[236,272],[217,279],[231,293],[267,300],[216,310],[256,328]];   // arbres de la Forêt
export const CACTI = [[207,68],[216,68],[247,69],[291,68],[354,70],[267,101],[356,102],[229,103],[310,102],[304,130],[355,151],[341,170],[312,184],[341,199],[302,207],[353,219],[311,237],[308,256],[355,258]];    // cactus du Désert
export const BUSHES = [[376,276],[315,282],[345,284],[305,302],[381,310],[352,311],[341,321],[327,334],[352,336],[375,338],[378,357],[415,367],[357,371],[372,398],[417,399]];   // buissons de la Toundra
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
