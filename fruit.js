/* MoDa : « Fruit Forager » (d'après le jeu Roblox du même nom)
   Chaque joueur cueille des fruits sur les arbres dans le même monde, remplit son sac, vend au coffre « SELL HERE »,
   achète sacs et bottes chez Mike's Market, gagne de l'XP et des niveaux. Les joueurs du lobby (5 max) se voient en direct.
   Firebase : la progression de chacun est sauvegardée dans users/<uid>/fruit ; les positions passent par
   games/<code>/inputs/<uid> (même principe que le Mine Simulator). */
import * as C from "./fruitcore.js";
const { FRUITS, RAR, ZONES, WORLD, PADS, BAGS, BOOTS, PLOTS, SPOTS, BLOCKS, BRIDGE, HIDDEN, fmt } = C;

const RANGE = 72, NEAR = 100, SAVE_EVERY = 8000, SEND_EVERY = 110;
const BAGCOL = ["#9aa0a6", "#3fb950", "#e53935"];

// Les décors (arbres, cactus) sont les mêmes pour tout le monde (graine commune)
// ----- Fruits dessinés à la main (plus d'emoji) -----
const shade = (hex, k) => { const n = parseInt(hex.slice(1), 16), v = i => Math.max(0, Math.min(255, Math.round(((n >> i) & 255) * k))); return `rgb(${v(16)},${v(8)},${v(0)})`; };
function drawFruit(c, id, X, Y, r) {
  const f = FRUITS[id], col = f ? f.col : "#e53935", dk = shade(col, .68), lt = shade(col, 1.3);
  c.save(); c.translate(X, Y); c.lineJoin = "round"; c.lineCap = "round";
  const ell = (x0, y0, rx, ry, fill, rot = 0) => { c.fillStyle = fill; c.beginPath(); c.ellipse(x0, y0, rx, ry, rot, 0, 7); c.fill(); };
  const stem = (x0, y0, x1, y1) => { c.strokeStyle = "#6b4119"; c.lineWidth = Math.max(1.6, r * .15); c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke(); };
  const leaf = (x0, y0, rot, fill = "#3fae48") => { ell(x0, y0, r * .36, r * .17, fill, rot); };
  // corps : fond sombre, partie éclairée décalée vers le haut-gauche, contour, reflet
  const solid = (path, hi = true) => {
    c.beginPath(); path(); c.fillStyle = dk; c.fill();
    c.save(); c.clip(); c.fillStyle = col; c.beginPath(); c.arc(-r * .22, -r * .25, r * 1.25, 0, 7); c.fill(); c.fillStyle = lt; c.beginPath(); c.arc(-r * .4, -r * .45, r * .6, 0, 7); c.fill(); c.restore();
    c.beginPath(); path(); c.strokeStyle = "#00000066"; c.lineWidth = Math.max(1, r * .1); c.stroke();
    if (hi) ell(-r * .4, -r * .38, r * .2, r * .32, "#ffffffa0", .6);
  };
  switch (id) {
    case "apple": case "green_apple": {
      solid(() => { c.moveTo(0, -r * .5); c.bezierCurveTo(r * .55, -r * 1, r * 1.05, -r * .35, r * .95, r * .25); c.bezierCurveTo(r * .85, r * .85, r * .35, r * 1.02, 0, r * .84); c.bezierCurveTo(-r * .35, r * 1.02, -r * .85, r * .85, -r * .95, r * .25); c.bezierCurveTo(-r * 1.05, -r * .35, -r * .55, -r * 1, 0, -r * .5); c.closePath(); });
      stem(0, -r * .45, r * .1, -r * .95); leaf(r * .38, -r * .78, -.5); break; }
    case "pear": case "crimson_pear": {
      solid(() => { c.moveTo(0, -r * .98); c.bezierCurveTo(r * .32, -r * .98, r * .4, -r * .5, r * .52, -r * .15); c.bezierCurveTo(r * 1.1, r * .12, r * 1.0, r * .98, 0, r * .98); c.bezierCurveTo(-r * 1.0, r * .98, -r * 1.1, r * .12, -r * .52, -r * .15); c.bezierCurveTo(-r * .4, -r * .5, -r * .32, -r * .98, 0, -r * .98); c.closePath(); });
      stem(0, -r * .9, r * .12, -r * 1.2); leaf(r * .4, -r * 1.02, -.4); break; }
    case "sugar_apple": {
      solid(() => { c.arc(0, r * .05, r * .92, 0, 7); });
      c.strokeStyle = dk; c.lineWidth = Math.max(1, r * .1); [[-.45, -.35], [.15, -.5], [.55, -.1], [-.55, .2], [0, 0], [.4, .45], [-.15, .55]].forEach(([a, b]) => { c.beginPath(); c.arc(a * r, b * r, r * .22, .3, 2.9); c.stroke(); });
      stem(0, -r * .85, r * .05, -r * 1.1); break; }
    case "banana": case "embum_banana": case "java_banana": {
      c.rotate(-.25);
      solid(() => { c.moveTo(-r * 1, -r * .15); c.bezierCurveTo(-r * .7, r * .95, r * .75, r * .9, r * 1.02, -r * .6); c.bezierCurveTo(r * .55, r * .2, -r * .4, r * .38, -r * 1, -r * .15); c.closePath(); }, false);
      c.strokeStyle = dk; c.lineWidth = Math.max(1, r * .08); c.beginPath(); c.moveTo(-r * .7, r * .05); c.bezierCurveTo(-r * .2, r * .55, r * .4, r * .5, r * .85, -r * .35); c.stroke();
      ell(-r * .96, -r * .13, r * .14, r * .1, "#4a2c0f"); stem(r * 1.0, -r * .6, r * 1.12, -r * .92);
      ell(-r * .15, r * .22, r * .45, r * .1, "#ffffff66", -.15);
      if (id === "embum_banana") { c.fillStyle = "#6b3d00aa"; [[-.3, .35], [.2, .4], [.55, .2]].forEach(([a, b]) => { c.beginPath(); c.arc(a * r, b * r, r * .06, 0, 7); c.fill(); }); }
      break; }
    case "lemon": case "lime": {
      c.rotate(-.35);
      solid(() => { c.moveTo(-r * 1.05, 0); c.bezierCurveTo(-r * .7, -r * .8, r * .7, -r * .8, r * 1.05, 0); c.bezierCurveTo(r * .7, r * .8, -r * .7, r * .8, -r * 1.05, 0); c.closePath(); });
      ell(-r * 1.05, 0, r * .13, r * .1, col); ell(r * 1.05, 0, r * .13, r * .1, col);
      if (id === "lime") leaf(r * .5, -r * .72, -.7); break; }
    case "cactus_fruit": {
      solid(() => { c.ellipse(0, r * .05, r * .72, r * .95, 0, 0, 7); });
      c.strokeStyle = "#ffe9a8"; c.lineWidth = Math.max(1, r * .07); [[-.35, -.4], [.2, -.55], [.45, -.05], [-.45, .2], [0, .05], [.3, .55], [-.2, .6]].forEach(([a, b]) => { c.beginPath(); c.moveTo(a * r, b * r); c.lineTo(a * r + r * .13, b * r - r * .13); c.stroke(); });
      ell(0, -r * .92, r * .42, r * .17, "#3fae48"); ell(0, -r * 1.02, r * .2, r * .1, "#ff6fb5"); break; }
    default: solid(() => { c.arc(0, 0, r * .9, 0, 7); });
  }
  c.restore();
}
// ----- Icônes dessinées (pièce, ticket, sacs, bottes, caddie, cadenas) : remplacent tous les emojis -----
function drawIcon(c, name, X, Y, r) {
  if (FRUITS[name]) return drawFruit(c, name, X, Y, r);
  c.save(); c.translate(X, Y); c.lineJoin = "round"; c.lineCap = "round";
  const rrect = (x0, y0, w, hh, rad) => { c.beginPath(); c.moveTo(x0 + rad, y0); c.arcTo(x0 + w, y0, x0 + w, y0 + hh, rad); c.arcTo(x0 + w, y0 + hh, x0, y0 + hh, rad); c.arcTo(x0, y0 + hh, x0, y0, rad); c.arcTo(x0, y0, x0 + w, y0, rad); c.closePath(); };
  const fillOut = fill => { c.fillStyle = fill; c.fill(); c.strokeStyle = "#00000077"; c.lineWidth = Math.max(1, r * .1); c.stroke(); };
  const star = (rad, inner) => { c.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, q = i % 2 ? inner : rad; c.lineTo(Math.cos(a) * q, Math.sin(a) * q); } c.closePath(); c.fill(); };
  const pack = (main, dark, light) => {
    c.strokeStyle = dark; c.lineWidth = r * .2; c.beginPath(); c.arc(0, -r * .55, r * .3, Math.PI, 0); c.stroke();
    rrect(-r * .72, -r * .6, r * 1.44, r * 1.6, r * .3); fillOut(main); rrect(-r * .72, -r * .6, r * 1.44, r * .72, r * .3); fillOut(dark); rrect(-r * .46, r * .3, r * .92, r * .5, r * .12); fillOut(light);
    c.fillStyle = "#ffd23f"; c.fillRect(-r * .12, r * .02, r * .24, r * .22); c.fillStyle = "#ffffff40"; c.fillRect(-r * .6, -r * .5, r * .12, r * 1.2);
  };
  const boot = (main, dark, cuff, rivet) => {
    c.beginPath(); c.moveTo(-r * .5, -r * .95); c.lineTo(r * .3, -r * .95); c.lineTo(r * .3, r * .05); c.quadraticCurveTo(r * .7, r * .1, r * .95, r * .45); c.lineTo(r * .95, r * .85); c.lineTo(-r * .5, r * .85); c.closePath(); fillOut(main);
    c.fillStyle = dark; c.fillRect(-r * .5, r * .62, r * 1.45, r * .26); rrect(-r * .55, -r * .98, r * .9, r * .3, r * .08); fillOut(cuff);
    if (rivet) { c.fillStyle = rivet; [[-.2, -.4], [.05, -.2], [-.2, .1]].forEach(([a, b]) => { c.beginPath(); c.arc(a * r, b * r, r * .08, 0, 7); c.fill(); }); }
  };
  switch (name) {
    case "coin": c.beginPath(); c.arc(0, 0, r * .95, 0, 7); fillOut("#b8860b"); c.beginPath(); c.arc(-r * .03, -r * .04, r * .8, 0, 7); c.fillStyle = "#ffd23f"; c.fill(); c.strokeStyle = "#e0a800"; c.lineWidth = r * .12; c.beginPath(); c.arc(0, 0, r * .58, 0, 7); c.stroke(); c.fillStyle = "#e0a800"; star(r * .34, r * .14); c.fillStyle = "#ffffff90"; c.beginPath(); c.ellipse(-r * .42, -r * .42, r * .12, r * .22, .7, 0, 7); c.fill(); break;
    case "ticket": c.rotate(-.3); c.beginPath(); c.moveTo(-r * .95, -r * .55); c.lineTo(r * .95, -r * .55); c.lineTo(r * .95, -r * .15); c.arc(r * .95, 0, r * .15, -Math.PI / 2, Math.PI / 2, true); c.lineTo(r * .95, r * .55); c.lineTo(-r * .95, r * .55); c.lineTo(-r * .95, r * .15); c.arc(-r * .95, 0, r * .15, Math.PI / 2, -Math.PI / 2, true); c.closePath(); fillOut("#ff5fa2");
      c.setLineDash([r * .12, r * .12]); c.strokeStyle = "#ffffffaa"; c.lineWidth = r * .07; c.beginPath(); c.moveTo(-r * .4, -r * .45); c.lineTo(-r * .4, r * .45); c.stroke(); c.setLineDash([]); c.save(); c.translate(r * .32, 0); c.fillStyle = "#fff"; star(r * .3, r * .13); c.restore(); break;
    case "bag0": c.strokeStyle = "#7a4a21"; c.lineWidth = r * .18; c.beginPath(); c.arc(0, -r * .1, r * .5, Math.PI, 0); c.stroke(); rrect(-r * .9, -r * .1, r * 1.8, r * 1.0, r * .25); fillOut("#c98f4f"); rrect(-r * .9, -r * .1, r * 1.8, r * .4, r * .2); fillOut("#a8692f"); c.fillStyle = "#ffd23f"; c.fillRect(-r * .14, r * .12, r * .28, r * .22); break;
    case "bag1": pack("#3fae48", "#27803a", "#6fd678"); break;
    case "bag2": pack("#e53935", "#a8201c", "#ff7a74"); break;
    case "boots0": boot("#a8692f", "#4a2c0f", "#d49a5a", null); break;
    case "boots1": boot("#8fa3b8", "#4b5b6e", "#cfd9e4", "#e9f0f7"); break;
    case "cart": c.strokeStyle = "#f1f1f1"; c.lineWidth = r * .16; c.beginPath(); c.moveTo(-r, -r * .8); c.lineTo(-r * .6, -r * .8); c.lineTo(-r * .3, r * .35); c.lineTo(r * .75, r * .35); c.stroke();
      c.beginPath(); c.moveTo(-r * .5, -r * .4); c.lineTo(r * .95, -r * .4); c.lineTo(r * .75, r * .35); c.lineTo(-r * .3, r * .35); c.closePath(); fillOut("#ffd23f"); c.fillStyle = "#f1f1f1"; [[-.2, .72], [.6, .72]].forEach(([a, b]) => { c.beginPath(); c.arc(a * r, b * r, r * .2, 0, 7); c.fill(); c.stroke(); }); break;
    case "close": c.strokeStyle = "#fff"; c.lineWidth = r * .32; c.beginPath(); c.moveTo(-r * .6, -r * .6); c.lineTo(r * .6, r * .6); c.moveTo(r * .6, -r * .6); c.lineTo(-r * .6, r * .6); c.stroke(); break;
    case "lock": c.strokeStyle = "#cfd6df"; c.lineWidth = r * .28; c.beginPath(); c.arc(0, -r * .2, r * .5, Math.PI, 0); c.moveTo(r * .5, -r * .2); c.lineTo(r * .5, r * .1); c.moveTo(-r * .5, -r * .2); c.lineTo(-r * .5, r * .1); c.stroke(); rrect(-r * .75, -r * .05, r * 1.5, r * 1.0, r * .18); fillOut("#ffd23f"); c.fillStyle = "#7a5a00"; c.beginPath(); c.arc(0, r * .4, r * .14, 0, 7); c.fill(); c.fillRect(-r * .05, r * .4, r * .1, r * .28); break;
  }
  c.restore();
}
const fIcons = {};
const iconURL = id => fIcons[id] || (fIcons[id] = (() => { const cv = document.createElement("canvas"); cv.width = cv.height = 96; drawIcon(cv.getContext("2d"), id, 48, 52, 32); return cv.toDataURL(); })());
const fruitURL = iconURL;
const ico = (name, px) => `<img class="ic" alt="" width="${px}" height="${px}" src="${iconURL(name)}">`;

// ----- Arbres : un arbre différent pour chaque fruit (dessiné une fois dans un sprite, puis recopié) -----
function paintDecor(c, d, X, Y) {
  const blk = (x0, y0, w, hh, c0, hi, lo) => { c.fillStyle = c0; c.fillRect(x0, y0, w, hh); c.fillStyle = hi; c.fillRect(x0, y0, w, 4); c.fillRect(x0, y0, 4, hh); c.fillStyle = lo; c.fillRect(x0, y0 + hh - 4, w, 4); c.fillRect(x0 + w - 4, y0, 4, hh); };
  const trunk = h => blk(X - 8, Y - h, 16, h, "#7a4a21", "#a06a3a", "#573316");
  const tier = (w, h, yy, P) => blk(X - w / 2, Y - yy - h, w, h, P[0], P[1], P[2]);
  const fruits = (id, pts, r) => pts.forEach(([a, b]) => drawFruit(c, id, X + a, Y + b, r));
  c.fillStyle = "#00000040"; c.beginPath(); c.ellipse(X + 8, Y + 3, d.k === "tree" ? 38 : 28, 10, 0, 0, 7); c.fill();
  if (d.k === "tree") {
    if (d.f === "pear") { const P = ["#6aa33a", "#8dc556", "#4a7a28"]; trunk(40); tier(56, 30, 30, P); tier(46, 32, 58, P); tier(34, 26, 88, P); fruits("pear", [[-18, -40], [16, -36], [-10, -66], [12, -62], [0, -92]], 7); }
    else if (d.f === "green_apple") { const P = ["#4fa33a", "#74cc58", "#357a26"]; trunk(26); tier(90, 30, 22, P); tier(68, 28, 50, P); tier(42, 20, 76, P); fruits("green_apple", [[-30, -34], [26, -32], [-8, -40], [-18, -62], [18, -60], [0, -84]], 6.5); }
    else if (d.f === "crimson_pear") { const P = ["#2a6f5e", "#3f9a82", "#1c4f43"]; trunk(42); tier(52, 28, 36, P); tier(44, 30, 62, P); tier(30, 26, 90, P); fruits("crimson_pear", [[-16, -48], [14, -44], [-8, -72], [10, -70], [0, -98]], 7); }
    else if (d.f === "sugar_apple") { const P = ["#2f7d4a", "#4aa36a", "#205a35"]; trunk(20); tier(86, 26, 14, P); tier(64, 24, 38, P); tier(40, 18, 58, P); fruits("sugar_apple", [[-28, -22], [24, -20], [-12, -46], [14, -44], [0, -62]], 7.5); }
    else { const P = ["#2a8238", "#47ad56", "#1c6228"]; trunk(34); tier(72, 30, 28, P); tier(54, 28, 56, ["#2f8c3d", "#4fb85e", "#206a2c"]); tier(32, 20, 82, ["#37984a", "#5bc66b", "#277a35"]); fruits("apple", [[-24, -40], [20, -36], [-4, -46], [-14, -62], [16, -58], [0, -84]], 6.5); }
  } else if (d.k === "palm") {
    blk(X - 5, Y - 36, 10, 36, "#8a5a2b", "#b07a43", "#5e3a17"); blk(X - 2, Y - 62, 10, 28, "#8a5a2b", "#b07a43", "#5e3a17");
    blk(X - 40, Y - 76, 80, 13, "#3fae48", "#6cd674", "#2b8a35"); blk(X - 13, Y - 90, 26, 42, "#43b44d", "#6cd674", "#2b8a35"); blk(X - 28, Y - 70, 12, 12, "#2f9a3a", "#52c25b", "#237a2c"); blk(X + 16, Y - 70, 12, 12, "#2f9a3a", "#52c25b", "#237a2c");
    fruits(d.f, [[10, -52], [20, -48], [14, -40]], 8);
  } else if (d.k === "ctree") {
    const P = d.f === "lime" ? ["#2f9a4a", "#4fc26a", "#207636"] : ["#74b840", "#96d85c", "#528a2c"]; trunk(28); tier(60, 30, 28, P); tier(44, 24, 56, P); fruits(d.f, [[-20, -40], [16, -38], [-6, -50], [8, -62], [-12, -62]], 6);
  } else {
    const hh = 52 + (d.v || 0) * 6, g = ["#3f9a3a", "#62c85a", "#2a7a2a"];
    blk(X - 8, Y - hh, 16, hh, g[0], g[1], g[2]); blk(X - 24, Y - 38, 18, 10, g[0], g[1], g[2]); blk(X - 24, Y - 54, 10, 26, g[0], g[1], g[2]); blk(X + 6, Y - 30, 18, 10, g[0], g[1], g[2]); blk(X + 14, Y - 46, 10, 26, g[0], g[1], g[2]);
    fruits("cactus_fruit", [[-19, -60], [19, -50], [0, -hh - 6]], 5.5);
  }
}
const decorSprites = {};
const decorSprite = d => { const key = d.k + ":" + d.f + ":" + (d.v || 0); if (!decorSprites[key]) { const cv = document.createElement("canvas"); cv.width = 360; cv.height = 400; const c = cv.getContext("2d"); c.scale(2, 2); paintDecor(c, d, 90, 176); decorSprites[key] = cv; } return decorSprites[key]; };
const rng = seed => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const randIn = (z, r) => { const A = z.rects.map(q => q.w * q.h), tot = A.reduce((a, b) => a + b, 0); let t = r() * tot, i = 0; while (i < A.length - 1 && t >= A[i]) { t -= A[i]; i++; } const q = z.rects[i]; return { x: q.x + r() * q.w, y: q.y + r() * q.h }; };
const okSpot = (X, Y, m) => [[0, 0], [m, 0], [-m, 0], [0, m], [0, -m]].every(([a, b]) => C.walkable(null, X + a, Y + b)) && !C.onSpot(X, Y, m);
const segD = (p, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], l = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, ((p.x - a[0]) * dx + (p.y - a[1]) * dy) / l)); return Math.hypot(p.x - a[0] - t * dx, p.y - a[1] - t * dy); };
const nearPath = (p, d) => C.SLABS.some(([a, b]) => Math.hypot(p.x - a * C.K, p.y - b * C.K) < d);
const pickW = (w, r) => { let t = Object.values(w).reduce((a, b) => a + b, 0) * r, k; for (k in w) { t -= w[k]; if (t < 0) return k; } return k; };
export function genDecor() { // arbres, palmiers, cactus : positions relevées sur la vue de dessus du vrai jeu, un arbre différent par fruit
  const r = rng(4321), K = C.K, zone = id => C.ZONES.find(z => z.id === id);
  const pickW = w => { const e = Object.entries(w), t = e.reduce((a, [, v]) => a + v, 0); let q = r() * t; for (const [k, v] of e) if ((q -= v) < 0) return k; return e[0][0]; };
  const fw = zone("forest").fruit.w, bw = zone("desert").fruit.w, out = [];
  C.TREES.filter(([a, b]) => !C.keepClear(a * K, b * K) && !C.nearSlab(a * K, b * K + 34, 46)).forEach(([a, b]) => out.push({ k: "tree", f: pickW(fw), x: a * K, y: b * K + 34, v: 0 }));
  C.CACTI.filter(([a, b]) => !C.keepClear(a * K, b * K) && !C.nearSlab(a * K, b * K + 30, 40)).forEach(([a, b]) => out.push(b < 118 ? { k: "cactus", f: "cactus_fruit", x: a * K, y: b * K + 30, v: Math.floor(r() * 3) } : { k: "palm", f: pickW(bw), x: a * K, y: b * K + 34, v: 0 }));
  const cz = zone("cactus"), q = rng(777); let tries = 0, added = 0; // plateau des cactus : citronniers et limettiers
  while (added < 16 && tries++ < 800) { const p = randIn(cz, q); if (!C.walkable(null, p.x, p.y) || C.onSpot(p.x, p.y, 50) || C.keepClear(p.x, p.y) || C.nearSlab(p.x, p.y + 34, 50) || out.some(o => Math.hypot(o.x - p.x, o.y - 34 - p.y) < 80)) continue; out.push({ k: "ctree", f: added % 2 ? "lime" : "lemon", x: p.x, y: p.y + 34, v: 0 }); added++; }
  return out;
}

// ----- Hôte : ouvre la partie (chaque joueur gère sa propre progression) -----
export async function startFruit(env) {
  const { R, update, remove, set, increment, getCode } = env, c = getCode();
  await remove(R(`games/${c}`));
  await update(R(`lobbies/${c}`), { status: "playing" });
  if (env.played) env.played("fruit", true); else set(R("stats/gamesPlayed"), increment(1)).catch(() => { });
}

const CSS = `
#fui{position:absolute;inset:0;pointer-events:none;z-index:5;font-family:'Bricolage Grotesque',system-ui,sans-serif;-webkit-user-select:none;user-select:none;display:none}
body[data-g=fruit] #fui{display:block}
body[data-g=fruit] #pad,body[data-g=fruit] #gctl{display:none!important}
#fui .ftop{position:absolute;top:6px;left:6px;right:6px;display:flex;gap:6px}
#fui .fb{display:flex;align-items:center;gap:6px;border-radius:12px;padding:2px 12px 2px 6px;font-weight:800;font-size:clamp(14px,3.6vw,19px);color:#fff;text-shadow:0 1px 3px #000;border:2px solid #0006}
#fui .fc{background:linear-gradient(#ffe45c,#d9aa00);flex:1.5}#fui .fg{position:relative;overflow:hidden;background:#4a0d12;flex:1.2}#fui #fBagF{position:absolute;left:0;top:0;bottom:0;width:0;background:linear-gradient(#ff7a7a,#d4202c);transition:width .18s}#fui .fg>i,#fui .fg>b{position:relative}#fui .fg.full #fBagF{background:linear-gradient(#ffb454,#e2701a)}#fui .ic{display:inline-block;vertical-align:middle;pointer-events:none}
#fui .fb b{margin-left:auto}#fui .fb i{font-style:normal}
#fui .fxp{position:absolute;top:42px;left:6px;right:6px;height:11px;background:#0a2a52;border:2px solid #0006;border-radius:8px;overflow:hidden}
#fui #fXpF{height:100%;width:0;background:linear-gradient(#69c1ff,#1d73e0)}
#fui .flvl{position:absolute;top:57px;left:0;right:0;text-align:center;font-weight:800;font-size:15px;color:#fff;text-shadow:0 1px 3px #000,0 0 6px #000}
#fui #fPrompts{position:absolute;left:0;right:0;bottom:80px;display:flex;flex-direction:column;align-items:center;gap:6px}
#fui .fp{pointer-events:auto;display:flex;align-items:center;gap:10px;background:#000b;border-radius:12px;padding:6px 14px 6px 8px;color:#fff;font-weight:700;font-size:clamp(13px,3.4vw,16px);cursor:pointer;max-width:94%}
#fui .fp kbd{display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:50%;background:#fff3;border:2px solid #fff8;font:800 15px system-ui}
#fui .fp.dim{opacity:.7;pointer-events:none}
#fui #fBar{position:absolute;left:0;right:0;bottom:6px;display:flex;justify-content:center;gap:6px}
#fui .fs{pointer-events:auto;position:relative;width:56px;height:60px;border-radius:10px;background:#000b;border:2px solid #fff3;display:flex;align-items:center;justify-content:center;color:#fff;font-size:24px;cursor:pointer}
#fui .fs.on{border-color:#fff;box-shadow:0 0 0 2px #fff7}
#fui .fs .fi{width:38px;height:38px;margin-top:-8px;pointer-events:none}
#fui .fs .fn{position:absolute;top:1px;left:5px;font:800 11px system-ui;opacity:.85}
#fui .fs .fk{position:absolute;top:1px;right:5px;font:800 11px system-ui}
#fui .fs .fr{position:absolute;bottom:2px;left:0;right:0;text-align:center;font:800 8px system-ui;letter-spacing:.2px}
#fui .fe0{font-size:12px;opacity:.7;color:#fff;text-shadow:0 1px 2px #000}
`;

// ----- Client -----
export function createFruitClient(env) {
  const { R, get, set, onValue, $, h, toast, beep, getMe, getCode, getLobby } = env;
  const cv = $("cv"), x = cv.getContext("2d"), mod = $("smod");
  const items = []; let decor = [];
  let active = false, loaded = false, raf = 0, last = 0, s = C.fresh(), dirty = false, saveT = 0, sendT = 0, hudT = 0;
  let px = C.SPAWN.x, py = C.SPAWN.y, face = 1, mv = false, sel = null, fullMsgAt = 0, uiKey = "", camX = 1000, camY = 600, camOK = false, near = {}, tgt = null, holding = false;
  const keys = new Set(), floats = [], fx = [], others = {};
  let inputs = {}, stick = null;
  const me = () => getMe();

  // ---------- sauvegarde Firebase ----------
  const path = () => R(`users/${me().uid}/fruit`);
  function save(now) { if (!loaded || !dirty && !now) return; dirty = false; saveT = performance.now(); set(path(), { ...s, inv: { ...s.inv }, ts: Date.now() }).catch(() => { }); }
  const touch = () => { dirty = true; };

  // ---------- fruits posés au sol ----------
  function spawnItem(it) {
    for (let t = 0; t < 300; t++) {
      const p = randIn(it.zone, Math.random); if (!okSpot(p.x, p.y, 34)) continue;
      if (items.some(o => o !== it && !o.back && (o.x - p.x) ** 2 + (o.y - p.y) ** 2 < 90 * 90)) continue;
      it.x = p.x; it.y = p.y; break;
    }
    it.id = pickW(it.zone.fruit.w, Math.random()); it.back = 0;
  }

  // ---------- positions des autres joueurs ----------
  function parse(u, v) {
    if (typeof v !== "string") return; const a = v.split(","); if (a.length < 7) return;
    const o = others[u] || (others[u] = { x: +a[0], y: +a[1], dx: +a[0], dy: +a[1] });
    o.x = +a[0]; o.y = +a[1]; o.lvl = +a[2]; o.n = +a[3]; o.cap = +a[4]; o.boots = +a[5]; o.bag = +a[6];
  }
  function send(now) {
    if (!active || !loaded) return;
    const str = [Math.round(px), Math.round(py), s.lvl, C.count(s), C.capacity(s), s.boots, s.bag].join(",");
    if (send.last === str && now - send.at < 2500) return; send.last = str; send.at = now;
    set(R(`games/${getCode()}/inputs/${me().uid}`), str).catch(() => { });
  }

  // ---------- interface (HTML par-dessus le canvas) ----------
  let ui = null;
  function buildUI() {
    if (ui) return ui;
    const st = document.createElement("style"); st.textContent = CSS; document.head.append(st);
    const root = document.createElement("div"); root.id = "fui";
    root.innerHTML = `<div class="ftop"><div class="fb fc"><i>${ico("coin", 26)}</i><b id="fCoins">0</b></div><div class="fb fg" id="fBagBox"><div id="fBagF"></div><i id="fBagI"></i><b id="fBag">0/0</b></div></div><div class="fxp"><div id="fXpF"></div></div><div class="flvl" id="fLvl"></div><div id="fPrompts"></div><div id="fBar"></div>`;
    cv.parentNode.append(root);
    ui = { coins: root.querySelector("#fCoins"), bag: root.querySelector("#fBag"), bagF: root.querySelector("#fBagF"), bagI: root.querySelector("#fBagI"), bagBox: root.querySelector("#fBagBox"), bagIc: -1, xp: root.querySelector("#fXpF"), lvl: root.querySelector("#fLvl"), prompts: root.querySelector("#fPrompts"), bar: root.querySelector("#fBar") };
    return ui;
  }
  const selId = () => { const st = C.stacks(s); if (!st.includes(sel)) sel = st[0] || null; return sel; };
  function renderUI(force) {
    if (!ui) return;
    ui.coins.textContent = s.coins.toLocaleString("fr-FR"); { const cp = C.capacity(s), cn = C.count(s); ui.bag.textContent = cn + "/" + cp; ui.bagF.style.width = Math.min(100, cn / cp * 100) + "%"; ui.bagBox.classList.toggle("full", cn >= cp); if (ui.bagIc !== s.bag) { ui.bagIc = s.bag; ui.bagI.innerHTML = ico("bag" + s.bag, 28); } }
    ui.xp.style.width = Math.min(100, s.xp / C.xpNeed(s.lvl) * 100) + "%"; ui.lvl.textContent = "NIVEAU " + s.lvl;
    const st = C.stacks(s), id = selId(), cap = C.capacity(s), n = C.count(s);
    const p = [];
    if (near.sell && id) { const g = C.stackGain(s, id), a = C.allGain(s); p.push(["E", `Vendre ${FRUITS[id].n} (x${g.n}) · ${fmt(g.coins)} pièces${g.tickets ? " & " + g.tickets + " tickets" : ""}`, "E"]); p.push(["F", `Tout vendre · ${fmt(a.coins)} pièces${a.tickets ? " & " + a.tickets + " tickets" : ""}`, "F"]); }
    else if (near.sell) p.push(["", "Rien à vendre : cueille des fruits !", "", 1]);
    else if (near.shop) p.push(["E", "Ouvrir Mike's Market", "E"]);
    else if (near.item) p.push(["E", `Ramasser ${FRUITS[near.item.id].n}`, "E"]);
    else if (tgt === "full") p.push(["", `Sac plein (${n}/${cap}) : va vendre !`, "", 1]);
    const key = [st.map(k => k + s.inv[k]).join(), id, cap, n, p.map(q => q[1]).join("|")].join("#");
    if (!force && key === uiKey) return; uiKey = key;
    ui.bar.replaceChildren(...st.map((k, i) => {
      const f = FRUITS[k], d = h("div"); d.className = "fs" + (k === id ? " on" : "");
      d.innerHTML = `<span class="fn">${i + 1}</span><span class="fk">x${s.inv[k]}</span><img class="fi" alt="" src="${fruitURL(k)}"><span class="fr" style="color:${RAR[f.r].c}">[${RAR[f.r].n.toUpperCase()}]</span>`;
      d.onpointerdown = e => { e.stopPropagation(); sel = k; renderUI(true); }; return d;
    }));
    if (!st.length) { const e0 = h("div", `Sac : ${n}/${cap}`); e0.className = "fe0"; ui.bar.append(e0); }
    ui.prompts.replaceChildren(...p.map(q => {
      const d = h("div"); d.className = "fp" + (q[3] ? " dim" : ""); if (q[0]) { const k = h("kbd", q[0]); d.append(k); } d.append(h("span", q[1]));
      if (q[2]) d.onpointerdown = e => { e.stopPropagation(); e.preventDefault(); act(q[2]); }; return d;
    }));
  }

  // ---------- actions ----------
  function coinBurst(X, Y) { for (let i = 0; i < 10 && fx.length < 100; i++) { const a = -Math.PI / 2 + (Math.random() - .5) * 2.2, v = 110 + Math.random() * 120; fx.push({ x: X, y: Y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, l: 1, g: 520 }); } }
  const float = (X, Y, t, col, ic) => { if (floats.length < 30) floats.push({ x: X, y: Y, t, col, l: 1, ic }); };
  function afterSale(g, X, Y) {
    float(X, Y - 70, `+${fmt(g.coins)}`, "#ffd23f", "coin"); if (g.tickets) float(X, Y - 46, `+${g.tickets}`, "#ff8fd0", "ticket"); coinBurst(X, Y - 30); beep(780, .12, "sine", .06, 1560); touch(); save(true);
    if (g.up) { const lv = s.lvl; toast(`Niveau ${lv} !` + (lv === ZONES[2].lvl ? " Le Désert est débloqué" : "")); beep(520, .2, "triangle", .05, 1040); }
    sel = null; renderUI(true);
  }
  function act(k) {
    if (!active || !loaded || !mod.hidden) return;
    if (k === "E") {
      if (near.sell) { const id = selId(); if (id) afterSale(C.sellStack(s, id), PADS.sell.x, PADS.sell.y); }
      else if (near.shop) openShop();
      else if (near.item) {
        const it = near.item;
        if (!C.pick(s, it.id)) { float(px, py - 70, "Sac plein !", "#ff4d6d"); beep(180, .15, "sawtooth", .04); return; }
        it.back = performance.now() + C.RESPAWN[FRUITS[it.id].r]; touch(); float(it.x, it.y - 40, "+1", "#fff", it.id); beep(620, .06, "triangle", .04, 900);
        sel = it.id; renderUI(true);
      }
    } else if (k === "F" && near.sell) { const g = C.sellAll(s); if (g) afterSale(g, PADS.sell.x, PADS.sell.y); }
  }

  // ---------- boutique ----------
  const card = (title, sub, label, can, fn) => {
    const d = h("div"); d.className = "scard";
    const t = h("div"), tb = h("b"); tb.innerHTML = title; t.append(tb, h("div", sub)); t.lastChild.className = "hint";
    const b = h("button", "", fn); b.innerHTML = label; b.disabled = !can; d.append(t, b); return d;
  };
  function openShop() { mod.hidden = false; renderShop(); }
  function closeShop() { mod.hidden = true; }
  function renderShop() {
    if (mod.hidden) return; mod.replaceChildren();
    const top = h("div"); top.className = "stabs"; const tt = h("b"); tt.innerHTML = ico("cart", 24) + " Mike's Market"; const x0 = h("button", "", closeShop); x0.innerHTML = ico("close", 20); x0.className = "alt"; top.append(tt, x0); mod.append(top);
    const m = h("div"); m.innerHTML = `${ico("coin", 20)} ${fmt(s.coins)} &nbsp;·&nbsp; ${ico("ticket", 20)} ${s.tickets}`; m.className = "smoney"; mod.append(m);
    const body = h("div"); body.className = "sbody";
    const after = ok => { if (ok) { beep(700, .08, "square", .04, 1000); touch(); save(true); } else beep(160, .15, "sawtooth", .04); renderShop(); renderUI(true); };
    body.append(h("div", "Sacs")); body.lastChild.className = "hint";
    BAGS.forEach((b, i) => {
      if (i === 0) return body.append(card(`${ico("bag" + i, 26)} ${b.n}`, `${b.cap} emplacements · de départ`, s.bag === 0 ? "Équipé" : "Possédé", false));
      const own = i <= s.bag, nxt = i === s.bag + 1;
      body.append(card(`${ico("bag" + i, 26)} ${b.n}`, `${b.cap} emplacements`, own ? (i === s.bag ? "Équipé" : "Possédé") : nxt ? `Acheter · ${fmt(b.cost)} ${ico("coin", 16)}` : `${ico("lock", 16)} Achète le précédent`, nxt && s.coins >= b.cost, () => after(C.buyBag(s))));
    });
    body.append(h("div", "Bottes")); body.lastChild.className = "hint";
    BOOTS.forEach((b, i) => {
      const own = i < s.boots, nxt = i === s.boots;
      body.append(card(`${ico("boots" + i, 26)} ${b.n}`, `Vitesse +${b.spd}`, own ? (i === s.boots - 1 ? "Équipées" : "Possédées") : nxt ? `Acheter · ${fmt(b.cost)} ${ico("coin", 16)}` : `${ico("lock", 16)} Achète les précédentes`, nxt && s.coins >= b.cost, () => after(C.buyBoots(s))));
    });
    mod.append(body);
  }
  mod.addEventListener("pointerdown", () => { holding = true; }); addEventListener("pointerup", () => { holding = false; });

  // ---------- entrées ----------
  const KEYS = { ArrowUp: "U", w: "U", z: "U", ArrowDown: "D", s: "D", ArrowLeft: "L", a: "L", q: "L", ArrowRight: "R", d: "R" };
  addEventListener("keydown", e => {
    if (!active || /^(INPUT|TEXTAREA)$/.test(e.target.tagName)) return;
    const kk = e.key.length > 1 ? e.key : e.key.toLowerCase(), k = KEYS[kk];
    if (k) { e.preventDefault(); keys.add(k); }
    else if (kk === "e") act("E"); else if (kk === "f") act("F");
    else if (/^[1-9]$/.test(kk)) { const st = C.stacks(s)[+kk - 1]; if (st) { sel = st; renderUI(true); } }
    else if (kk === "Escape") closeShop();
  });
  addEventListener("keyup", e => { const k = KEYS[e.key.length > 1 ? e.key : e.key.toLowerCase()]; if (k) keys.delete(k); });
  addEventListener("blur", () => keys.clear());
  const rel = e => { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) * 800 / r.width, y: (e.clientY - r.top) * 560 / r.height }; };
  cv.addEventListener("pointerdown", e => { if (!active) return; e.preventDefault(); try { cv.setPointerCapture(e.pointerId); } catch { } const p = rel(e); stick = { id: e.pointerId, ox: p.x, oy: p.y, dx: 0, dy: 0 }; });
  cv.addEventListener("pointermove", e => {
    if (!stick || e.pointerId !== stick.id) return; const p = rel(e); let dx = p.x - stick.ox, dy = p.y - stick.oy; const d = Math.hypot(dx, dy), m = 55;
    if (d > m) { stick.ox += dx / d * (d - m); stick.oy += dy / d * (d - m); dx = p.x - stick.ox; dy = p.y - stick.oy; }
    stick.dx = dx / m; stick.dy = dy / m;
  });
  const end = e => { if (stick && (!e || e.pointerId === stick.id)) stick = null; };
  cv.addEventListener("pointerup", end); cv.addEventListener("pointercancel", end);

  // ---------- simulation (locale) ----------
  function update(dt, now) {
    if (env.vpos && now - (update.v || 0) > 200) { update.v = now; env.vpos({ x: px, y: py }, Object.fromEntries(Object.entries(others).map(([u, o]) => [u, { x: o.x, y: o.y }])), 550); } // chat vocal de proximité
    let ax = (keys.has("R") ? 1 : 0) - (keys.has("L") ? 1 : 0), ay = (keys.has("D") ? 1 : 0) - (keys.has("U") ? 1 : 0);
    if (stick && !ax && !ay) { ax = Math.abs(stick.dx) > .15 ? stick.dx : 0; ay = Math.abs(stick.dy) > .15 ? stick.dy : 0; }
    const m = Math.hypot(ax, ay); if (m > 1) { ax /= m; ay /= m; }
    const sp = C.speed(s), nx = px + ax * sp * dt, ny = py + ay * sp * dt;
    if (C.walkable(s, nx, py)) px = nx; if (C.walkable(s, px, ny)) py = ny;
    if (ax) face = ax > 0 ? 1 : -1; mv = !!(ax || ay);
    // les fruits ramassés réapparaissent ailleurs dans leur zone
    for (const it of items) if (it.back && now >= it.back) spawnItem(it);
    // ce qui est à portée
    near = {}; tgt = null;
    near.sell = (PADS.sell.x - px) ** 2 + (PADS.sell.y - py) ** 2 < NEAR * NEAR;
    near.shop = (PADS.shop.x - px) ** 2 + (PADS.shop.y - py) ** 2 < NEAR * NEAR;
    let bd = RANGE * RANGE;
    for (const it of items) { if (it.back) continue; const d = (it.x - px) ** 2 + (it.y - py) ** 2; if (d < bd) { bd = d; near.item = it; } }
    if (near.item && C.count(s) >= C.capacity(s)) { tgt = "full"; near.item = null; }
    if (!near.shop && mod.hidden === false) closeShop();
    floats.forEach(f => { f.y -= 38 * dt; f.l -= dt * .9; }); for (let i = floats.length - 1; i >= 0; i--) if (floats[i].l <= 0) floats.splice(i, 1);
    for (let i = fx.length - 1; i >= 0; i--) { const p = fx[i]; p.l -= dt * 1.4; p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; if (p.l <= 0) fx.splice(i, 1); }
    Object.values(others).forEach(o => { const ex = o.x - o.dx, ey = o.y - o.dy; o.mv = Math.hypot(ex, ey) > 3; if (Math.abs(ex) > 1.5) o.fc = ex > 0 ? 1 : -1; o.dx += ex * Math.min(1, dt * 10); o.dy += ey * Math.min(1, dt * 10); });
    { const tx = Math.max(400, Math.min(WORLD.w - 400, px)), ty = Math.max(280, Math.min(WORLD.h - 280, py)); if (!camOK) { camX = tx; camY = ty; camOK = true; } else { const k = Math.min(1, dt * 7); camX += (tx - camX) * k; camY += (ty - camY) * k; } }
    if (now - sendT > SEND_EVERY) { sendT = now; send(now); }
    if (now - hudT > 120) { hudT = now; renderUI(); if (!mod.hidden && !holding) renderShop(); scoreboard(); }
    if (dirty && now - saveT > SAVE_EVERY) save();
  }
  function scoreboard() {
    const rows = [{ n: me().name || "Moi", c: "#ffd23f", l: s.lvl, me: 1 }];
    const pl = (getLobby() && getLobby().players) || {};
    Object.entries(others).forEach(([u, o]) => { if (pl[u]) rows.push({ n: pl[u].name, c: pl[u].color, l: o.lvl || 0 }); });
    rows.sort((a, b) => b.l - a.l); const key = rows.map(r => r.n + r.l).join("|");
    if (scoreboard.k !== key) { scoreboard.k = key; $("score").replaceChildren(...rows.slice(0, 6).map((r, i) => { const d = h("span", `${i + 1}. ${r.n} · niv. ${r.l}`); d.style.color = r.c; if (r.me) d.style.fontWeight = 700; return d; })); }
  }

  // ---------- dessin ----------
  const mk = (w, hh) => { const c = document.createElement("canvas"); c.width = w; c.height = hh; return c; };
  let worldC = null, DPR = 1; const WS = 1.5; // le canvas suit la résolution de l'écran (net sur téléphone) ; le décor fixe est dessiné à 1,5x
  const fit = () => { DPR = Math.min(3, Math.max(1, window.devicePixelRatio || 1)); const w = Math.round(800 * DPR); if (cv.width !== w) { cv.width = w; cv.height = Math.round(560 * DPR); } x.imageSmoothingEnabled = true; x.imageSmoothingQuality = "high"; };
  function buildWorld() {
    const c = mk(Math.round(WORLD.w * WS), Math.round(WORLD.h * WS)), g = c.getContext("2d"), r = rng(7); g.scale(WS, WS);
    const rr = (X, Y, w, hh, rad) => { g.beginPath(); g.moveTo(X + rad, Y); g.arcTo(X + w, Y, X + w, Y + hh, rad); g.arcTo(X + w, Y + hh, X, Y + hh, rad); g.arcTo(X, Y + hh, X, Y, rad); g.arcTo(X, Y, X + w, Y, rad); g.closePath(); };
    const blk = (X, Y, w, hh, c0, hi, lo) => { g.fillStyle = c0; g.fillRect(X, Y, w, hh); g.fillStyle = hi; g.fillRect(X, Y, w, 3); g.fillRect(X, Y, 3, hh); g.fillStyle = lo; g.fillRect(X, Y + hh - 3, w, 3); g.fillRect(X + w - 3, Y, 3, hh); };
    g.fillStyle = "#23262d"; g.fillRect(0, 0, WORLD.w, WORLD.h);
    // couleurs des sols par zone (base, tenon clair, tenon sombre) : les zones fermées sont complètement noires

    const COL = { spawn: ["#4fbf5c", "#66d572", "#3a9a47"], forest: ["#5ccc66", "#76e381", "#46a852"], desert: ["#efd57a", "#f9e69b", "#cfb35a"], cactus: ["#efd57a", "#f9e69b", "#cfb35a"], autumn: ["#000000", "#000000", "#000000"], tundra: ["#000000", "#000000", "#000000"] }; // zones fermées : complètement noires
    // falaises et murs : de la couleur de leur zone (plus foncée), jamais grises
    const zoneAt = (X, Y) => ZONES.find(z => z.rects.some(q => X >= q.x && X < q.x + q.w && Y >= q.y && Y < q.y + q.h));
    const dist = (q, z) => Math.min(...z.rects.map(r => { const cx = q.x + q.w / 2, cy = q.y + q.h / 2; return Math.hypot(Math.max(r.x - cx, 0, cx - (r.x + r.w)), Math.max(r.y - cy, 0, cy - (r.y + r.h))); }));
    const nearZone = q => ZONES.reduce((b, z) => dist(q, z) < dist(q, b) ? z : b, ZONES[0]);
    const WP = ["desert", "cactus", "forest", "spawn", "tundra", "autumn"]; // pour un mur entre deux zones : la zone la plus haute donne sa couleur
    const wallZone = (X, Y) => { const ids = [[-34, 0], [34, 0], [0, -34], [0, 34]].map(([a, b]) => zoneAt(X + a, Y + b)).filter(Boolean).map(z => z.id); return WP.find(id => ids.includes(id)) || "forest"; };
    const wcol = id => id === "tundra" || id === "autumn" ? { face: "#000000", top: "#030305", stud: "#0c0c10" } : { face: shade(COL[id][0], .5), top: shade(COL[id][0], .74), stud: shade(COL[id][0], .9) };
    const cl = []; ZONES.forEach(z => z.rects.forEach(q => cl.push({ x: q.x - 12, y: q.y - 12, w: q.w + 24, h: q.h + 24, id: z.id }))); C.CLIFFS.forEach(q => cl.push({ x: q.x, y: q.y, w: q.w, h: q.h, id: nearZone(q).id }));
    cl.forEach(q => { g.fillStyle = wcol(q.id).face; g.fillRect(q.x, q.y + 20, q.w, q.h); });
    cl.forEach(q => { g.fillStyle = wcol(q.id).top; g.fillRect(q.x, q.y, q.w, q.h); });
    cl.forEach(q => { g.fillStyle = wcol(q.id).stud; for (let yy = Math.ceil(q.y / 28) * 28; yy < q.y + q.h; yy += 28) for (let xx = Math.ceil(q.x / 28) * 28; xx < q.x + q.w; xx += 28) g.fillRect(xx + 5, yy + 5, 16, 16); });
    g.fillStyle = "#000"; HIDDEN.forEach(q => g.fillRect(q.x, q.y, q.w, q.h + 20)); // parties de la carte pas encore montrées : noires
    // sols : couleur de base + tenons (« studs ») en relief comme dans Roblox
    ZONES.forEach(z => z.rects.forEach(q => { g.fillStyle = COL[z.id][0]; g.fillRect(q.x, q.y, q.w, q.h); }));
    ZONES.forEach(z => { const [, lt, dk] = COL[z.id]; z.rects.forEach(q => { for (let yy = Math.ceil(q.y / 32) * 32; yy < q.y + q.h; yy += 32) for (let xx = Math.ceil(q.x / 32) * 32; xx < q.x + q.w; xx += 32) { const X = xx + 16, Y = yy + 16; if (X < q.x + 9 || X > q.x + q.w - 9 || Y < q.y + 9 || Y > q.y + q.h - 9) continue; g.fillStyle = dk; g.beginPath(); g.arc(X + 1.5, Y + 2.5, 7, 0, 7); g.fill(); g.fillStyle = lt; g.beginPath(); g.arc(X, Y, 7, 0, 7); g.fill(); g.fillStyle = "#ffffff30"; g.beginPath(); g.arc(X - 2, Y - 2.5, 3, 0, 7); g.fill(); } }); });
    // parcelles des joueurs (damier en bois) + panneau
    PLOTS.forEach(q => { g.fillStyle = "#0003"; g.fillRect(q.x + 5, q.y + 9, q.w, q.h); const n = 29; for (let yy = 0; yy < q.h; yy += n) for (let xx = 0; xx < q.w; xx += n) { g.fillStyle = ((xx / n | 0) + (yy / n | 0)) % 2 ? "#e8ab88" : "#c97f58"; g.fillRect(q.x + xx, q.y + yy, Math.min(n, q.w - xx), Math.min(n, q.h - yy)); } g.strokeStyle = "#7a4429"; g.lineWidth = 6; g.strokeRect(q.x, q.y, q.w, q.h); g.strokeStyle = "#f3bd9c"; g.lineWidth = 2; g.strokeRect(q.x + 5, q.y + 5, q.w - 10, q.h - 10);
      g.fillStyle = "#7a4a21"; g.fillRect(q.x + q.w / 2 - 3, q.y + q.h + 6, 6, 18); blk(q.x + q.w / 2 - 38, q.y + q.h + 4, 76, 22, "#b57a43", "#d29a5c", "#8a5a2b"); g.fillStyle = "#fff"; g.font = "800 12px system-ui,sans-serif"; g.textAlign = "center"; g.fillText("Parcelle", q.x + q.w / 2, q.y + q.h + 20); });
    // Forêt : bac de sable, petite cabane, cube blanc ; Désert : oasis ; Toundra : glace, ladder, station ; Forêt d'automne : arbres orange
    const P = SPOTS; { const pit = P.pit, dx = pit.x + pit.w / 2; // ===== Mike's Market =====
      g.fillStyle = "#0004"; g.fillRect(pit.x + 8, pit.y + 12, pit.w, pit.h);
      g.fillStyle = "#e3b87d"; g.fillRect(pit.x + 16, pit.y + 16, pit.w - 32, pit.h - 32); g.strokeStyle = "#cd9d60"; g.lineWidth = 2; for (let yy = pit.y + 44; yy < pit.y + pit.h - 16; yy += 28) { g.beginPath(); g.moveTo(pit.x + 16, yy); g.lineTo(pit.x + pit.w - 16, yy); g.stroke(); }
      C.MARKET_WALLS.forEach(b => { g.fillStyle = "#6b4119"; g.fillRect(b.x, b.y + 7, b.w, b.h); blk(b.x, b.y, b.w, b.h, "#b57a43", "#d49a5a", "#8f5c2c"); });
      const sy = pit.y + pit.h - 16 - 50; blk(pit.x + 28, sy, pit.w - 56, 50, "#6b4119", "#8b5a2b", "#4a2c0f"); const items = ["#8b5a2b", "#3fb950", "#e53935", "#4fa3ff", "#ffd23f", "#b36bff", "#9aa3ad", "#e53935", "#3fb950", "#ffd23f"]; items.forEach((c0, k) => blk(pit.x + 40 + k * ((pit.w - 90) / 10), sy + 12, 16, 28, c0, "#ffffff55", "#00000040"));
      blk(pit.x + 22, pit.y + 60, 14, 120, "#6b4119", "#8b5a2b", "#4a2c0f"); blk(pit.x + pit.w - 36, pit.y + 60, 14, 120, "#6b4119", "#8b5a2b", "#4a2c0f");
      for (let k = 0; k < 4; k++) { blk(pit.x + 24, pit.y + 66 + k * 28, 10, 18, items[k], "#ffffff55", "#00000040"); blk(pit.x + pit.w - 34, pit.y + 66 + k * 28, 10, 18, items[k + 4], "#ffffff55", "#00000040"); }
      for (let k = 0; k < 8; k++) { g.fillStyle = k % 2 ? "#fff" : "#e53935"; g.fillRect(dx - 56 + k * 14, pit.y - 24, 14, 26); } g.fillStyle = "#b5271f"; g.fillRect(dx - 56, pit.y - 2, 112, 5);
      g.fillStyle = "#7a4a21"; g.fillRect(dx - 60, pit.y - 24, 5, 40); g.fillRect(dx + 55, pit.y - 24, 5, 40);
      blk(dx - 84, pit.y - 62, 168, 30, "#b57a43", "#d49a5a", "#8f5c2c"); g.font = "800 20px system-ui,sans-serif"; g.textAlign = "center"; g.lineJoin = "round"; g.lineWidth = 5; g.strokeStyle = "#3a2410"; g.strokeText("Mike's Market", dx, pit.y - 40); g.fillStyle = "#fff"; g.fillText("Mike's Market", dx, pit.y - 40); }
    g.fillStyle = "#7a4a21"; g.fillRect(P.ramp.x, P.ramp.y, P.ramp.w, P.ramp.h); g.fillStyle = "#b9803f"; for (let xx = P.ramp.x + 6; xx < P.ramp.x + P.ramp.w - 24; xx += 14) g.fillRect(xx, P.ramp.y + 4, 8, P.ramp.h - 8); // rampe Forêt → bananes (vers l'est)
    g.fillStyle = "#4b5567"; g.fillRect(P.ramp.x + P.ramp.w - 22, P.ramp.y - 6, 26, P.ramp.h + 12); g.fillStyle = "#7be3a0aa"; g.fillRect(P.ramp.x + P.ramp.w - 16, P.ramp.y + 2, 14, P.ramp.h - 4); // porte « NIVEAU 5 »
    g.fillStyle = "#7a4a21"; g.fillRect(P.climb.x, P.climb.y, P.climb.w, P.climb.h); g.fillStyle = "#b9803f"; for (let xx = P.climb.x + 4; xx < P.climb.x + P.climb.w; xx += 12) g.fillRect(xx, P.climb.y - 4, 7, P.climb.h + 8); // échelle bananes → cactus
    g.fillStyle = "#2b2f3a"; g.fillRect(P.door.x, P.door.y, P.door.w, P.door.h); g.strokeStyle = "#c9822f"; g.lineWidth = 8; g.strokeRect(P.door.x + 4, P.door.y + 4, P.door.w - 8, P.door.h - 8); // porte « Open During Weekend »
    { const SG = C.SIGN; g.fillStyle = "#7a4a21"; g.fillRect(SG.x - 4, SG.y, 8, 44); g.save(); g.translate(SG.x, SG.y); g.rotate(-.12); g.fillStyle = "#a8692f"; g.fillRect(-48, -32, 96, 42); g.fillStyle = "#fff"; g.font = "800 14px system-ui,sans-serif"; g.textAlign = "center"; g.fillText("SHOP →", 0, -16); g.fillText("← DESERT", 0, 2); g.restore(); } // panneau
    g.font = "800 20px system-ui,sans-serif"; g.textAlign = "center"; g.lineJoin = "round"; g.lineWidth = 5; g.strokeStyle = "#000b"; g.strokeText("NIVEAU 5", P.ramp.x + P.ramp.w / 2, P.ramp.y - 10); g.fillStyle = "#fff"; g.fillText("NIVEAU 5", P.ramp.x + P.ramp.w / 2, P.ramp.y - 10);
    g.fillStyle = "#d9b66a"; g.fillRect(P.oasis.x - 10, P.oasis.y - 10, P.oasis.w + 20, P.oasis.h + 20); g.fillStyle = "#4a90e2"; g.fillRect(P.oasis.x, P.oasis.y, P.oasis.w, P.oasis.h);
    // rivière + pont
    C.RIVERS.forEach(b => { g.fillStyle = "#2a6fb8"; g.fillRect(b.x, b.y - 4, b.w, b.h + 8); g.fillStyle = "#3f94e8"; g.fillRect(b.x, b.y, b.w, b.h); g.fillStyle = "#7dc0ff"; for (let yy = b.y + 12; yy < b.y + b.h - 8; yy += 20) for (let xx = b.x + 10 + (yy % 40); xx < b.x + b.w - 24; xx += 52) g.fillRect(xx, yy, 24, 4); });
    g.fillStyle = "#0003"; g.fillRect(BRIDGE.x + 4, BRIDGE.y + 8, BRIDGE.w, BRIDGE.h); g.fillStyle = "#6b4119"; g.fillRect(BRIDGE.x - 4, BRIDGE.y, BRIDGE.w + 8, BRIDGE.h); for (let yy = BRIDGE.y + 2; yy < BRIDGE.y + BRIDGE.h; yy += 12) { g.fillStyle = "#b57a43"; g.fillRect(BRIDGE.x + 2, yy, BRIDGE.w - 4, 9); g.fillStyle = "#d49a5a"; g.fillRect(BRIDGE.x + 2, yy, BRIDGE.w - 4, 2); } g.fillStyle = "#8f5c2c"; for (let yy = BRIDGE.y; yy < BRIDGE.y + BRIDGE.h; yy += 28) { g.fillRect(BRIDGE.x - 6, yy, 8, 10); g.fillRect(BRIDGE.x + BRIDGE.w - 2, yy, 8, 10); }
    // murs de falaise avec leurs passages
    C.WALLS.forEach(b => { const long = b.w > b.h, n = Math.max(1, Math.round((long ? b.w : b.h) / 40)); for (let i = 0; i < n; i++) { const q = long ? { x: b.x + b.w * i / n, y: b.y, w: b.w / n + 1, h: b.h } : { x: b.x, y: b.y + b.h * i / n, w: b.w, h: b.h / n + 1 }; const w = wcol(wallZone(q.x + q.w / 2, q.y + q.h / 2)); g.fillStyle = w.face; g.fillRect(q.x, q.y + 14, q.w, q.h); g.fillStyle = w.top; g.fillRect(q.x, q.y, q.w, q.h); g.fillStyle = w.stud; g.fillRect(q.x, q.y, q.w, 4); } }); // murs aux couleurs des zones
    C.FENCES.forEach(b => { g.fillStyle = "#0003"; g.fillRect(b.x + 6, b.y + 6, b.w, b.h); g.fillStyle = "#a8692f"; g.fillRect(b.x, b.y, b.w, b.h); g.fillStyle = "#d49a5a"; g.fillRect(b.x, b.y, 3, b.h); for (let yy = b.y; yy < b.y + b.h; yy += 34) { g.fillStyle = "#7a4a21"; g.fillRect(b.x - 7, yy, b.w + 14, 11); g.fillStyle = "#b9803f"; g.fillRect(b.x - 7, yy, b.w + 14, 3); } }); // clôture Spawn | Forêt
    // dalles de pierre
    const slab = (X, Y) => { g.fillStyle = "#0004"; rr(X - 15, Y - 7, 36, 26, 4); g.fill(); g.fillStyle = "#555a6e"; rr(X - 18, Y - 12, 36, 26, 4); g.fill(); g.fillStyle = "#757a90"; rr(X - 18, Y - 12, 36, 20, 4); g.fill(); g.fillStyle = "#a0a5bb"; [[-9, -5], [6, -5], [-9, 3], [6, 3]].forEach(([a, b]) => { g.beginPath(); g.arc(X + a, Y + b, 3.2, 0, 7); g.fill(); }); g.fillStyle = "#ffffff28"; g.fillRect(X - 16, Y - 11, 32, 2); };
    C.SLABS.forEach(([a, b]) => slab(a * C.K, b * C.K));
    // tuile d'apparition (étoile)
    g.fillStyle = "#0004"; g.fillRect(C.SPAWN.x - 30, C.SPAWN.y - 22, 74, 62); blk(C.SPAWN.x - 38, C.SPAWN.y - 32, 76, 64, "#f4f4f4", "#ffffff", "#b4bac6"); g.fillStyle = "#111"; g.beginPath();
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rad = i % 2 ? 7 : 19; g[i ? "lineTo" : "moveTo"](C.SPAWN.x + Math.cos(a) * rad, C.SPAWN.y + Math.sin(a) * rad); } g.closePath(); g.fill();
    // coffre « SELL HERE »
    const S = PADS.sell; g.save(); g.translate(S.x, S.y); g.scale(.75, .75); g.translate(-S.x, -S.y); g.fillStyle = "#0003"; g.beginPath(); g.ellipse(S.x, S.y + 40, 70, 14, 0, 0, 7); g.fill();
    g.fillStyle = "#8f4a1e"; g.fillRect(S.x - 58, S.y - 22, 116, 62); g.fillStyle = "#b9632a"; g.fillRect(S.x - 58, S.y - 40, 116, 24);
    g.fillStyle = "#7a3d16"; for (let i = 0; i < 6; i++) g.fillRect(S.x - 58 + i * 19.5, S.y - 22, 3, 62); g.fillStyle = "#d28a4a"; g.fillRect(S.x - 58, S.y - 40, 116, 5);
    g.fillStyle = "#3ddc5a"; g.fillRect(S.x - 46, S.y - 36, 92, 16); g.fillStyle = "#7dffa0"; g.fillRect(S.x - 46, S.y - 36, 92, 4); g.fillStyle = "#3a2410"; g.fillRect(S.x - 9, S.y - 18, 18, 14); g.strokeStyle = "#4a2410"; g.lineWidth = 3; g.strokeRect(S.x - 58, S.y - 40, 116, 80);
    g.font = "800 24px system-ui,sans-serif"; g.textAlign = "center"; g.lineJoin = "round"; g.lineWidth = 6; g.strokeStyle = "#fff"; g.strokeText("SELL HERE", S.x, S.y - 54); g.fillStyle = "#111"; g.fillText("SELL HERE", S.x, S.y - 54); g.restore();
    // comptoir de Mike dans la salle
    const M = PADS.shop; g.fillStyle = "#0003"; g.beginPath(); g.ellipse(M.x, M.y + 44, 80, 12, 0, 0, 7); g.fill();
    g.fillStyle = "#7a4a21"; g.fillRect(M.x - 66, M.y - 8, 7, 50); g.fillRect(M.x + 59, M.y - 8, 7, 50);
    blk(M.x - 62, M.y + 14, 124, 32, "#a8692f", "#d49a5a", "#7a4a21");
    for (let i = 0; i < 7; i++) { g.fillStyle = i % 2 ? "#fff" : "#e53935"; g.fillRect(M.x - 77 + i * 22, M.y - 34, 22, 30); } g.fillStyle = "#b5271f"; g.fillRect(M.x - 77, M.y - 6, 154, 5);
    return c;
  }
  function label(t, X, Y, col = "#fff", size = 13) { x.font = `800 ${size}px system-ui,sans-serif`; x.textAlign = "center"; x.lineJoin = "round"; x.lineWidth = 4; x.strokeStyle = "#000b"; x.strokeText(t, X, Y); x.fillStyle = col; x.fillText(t, X, Y); }
  function drawDecor(d) { x.drawImage(decorSprite(d), d.x - 90, d.y - 176, 180, 200); }
  function drawItem(it, isT, now) {
    const f = FRUITS[it.id], X = it.x, Y = it.y, b = Math.sin(now / 320 + it.x) * 2.5;
    x.fillStyle = "#0004"; x.beginPath(); x.ellipse(X, Y + 6, 11, 4, 0, 0, 7); x.fill();
    x.fillStyle = "#00000038"; x.beginPath(); x.arc(X, Y - 8 + b, 18, 0, 7); x.fill(); x.lineWidth = 3; x.strokeStyle = RAR[f.r].c; x.stroke(); drawFruit(x, it.id, X, Y - 8 + b, 13.5);
    if (isT) { x.strokeStyle = "#fff"; x.lineWidth = 3; x.globalAlpha = .6 + .3 * Math.sin(now / 150); x.beginPath(); x.arc(X, Y - 8 + b, 23, 0, 7); x.stroke(); x.globalAlpha = 1; }
  }
  function avatar(X, Y, col, name, n, cap, boots, bag, moving, now, isMe, fc) {
    x.fillStyle = "#0004"; x.beginPath(); x.ellipse(X, Y + 2, 16, 5, 0, 0, 7); x.fill();
    const sw = moving ? Math.sin(now / 90) * 4 : 0;
    x.fillStyle = BAGCOL[Math.min(bag | 0, 2)]; x.fillRect(X - 15, Y - 34, 30, 22); x.fillStyle = "#0003"; x.fillRect(X - 15, Y - 16, 30, 4); // sac
    x.fillStyle = "#3b6fc4"; x.fillRect(X - 9, Y - 14 + sw, 8, 14 - sw); x.fillRect(X + 1, Y - 14 - sw, 8, 14 + sw);
    if (boots > 0) { x.fillStyle = boots > 1 ? "#9aa3ad" : "#8a5a2b"; x.fillRect(X - 10, Y - 4 + sw, 10, 6); x.fillRect(X, Y - 4 - sw, 10, 6); }
    x.fillStyle = col || "#ffd23f"; x.fillRect(X - 10, Y - 34, 20, 21); x.fillStyle = "#f5cd30"; x.fillRect(X - 16, Y - 33 + sw / 2, 6, 15); x.fillRect(X + 10, Y - 33 - sw / 2, 6, 15);
    x.fillRect(X - 8, Y - 52, 16, 17); x.fillStyle = "#ffffff40"; x.fillRect(X - 8, Y - 52, 16, 4); x.strokeStyle = "#00000070"; x.lineWidth = 1.5; x.strokeRect(X - 8, Y - 52, 16, 17); x.strokeRect(X - 10, Y - 34, 20, 21); x.fillStyle = "#222"; x.fillRect(X - 5 + (fc > 0 ? 1 : -1), Y - 46, 3, 4); x.fillRect(X + 2 + (fc > 0 ? 1 : -1), Y - 46, 3, 4);
    label(name, X, Y - 62, isMe ? "#ffd23f" : "#fff", 12);
    label(`${n}/${cap}`, X, Y - 76, n >= cap ? "#ff7a7a" : "#8dff8d", 11);
  }
  function draw(now) {
    fit(); x.setTransform(DPR, 0, 0, DPR, 0, 0); x.fillStyle = "#23262d"; x.fillRect(0, 0, 800, 560);
    x.setTransform(DPR, 0, 0, DPR, Math.round((400 - camX) * DPR), Math.round((280 - camY) * DPR));
    if (!worldC) worldC = buildWorld(); x.drawImage(worldC, 0, 0, WORLD.w, WORLD.h);
    ZONES.forEach(z => { if (C.zoneOpen(s, z)) return; const q = z.rects.slice().sort((m, n) => n.w * n.h - m.w * m.h)[0];
      if (z.closed) { z.rects.forEach(r => { x.fillStyle = "#000"; x.fillRect(r.x - 1, r.y - 1, r.w + 2, r.h + 2); }); label(z.n, q.x + q.w / 2, q.y + q.h / 2 - 34, "#8d93a3", 20); label("SOON", q.x + q.w / 2, q.y + q.h / 2 + 12, "#fff", 46); return; }
      z.rects.forEach(r => { x.fillStyle = "#0a0a14b3"; x.fillRect(r.x, r.y, r.w, r.h); }); drawIcon(x, "lock", q.x + q.w / 2, q.y + q.h / 2 - 34, 17); label(`Niveau ${z.lvl} requis`, q.x + q.w / 2, q.y + q.h / 2 + 4, "#fff", 20); });
    // cercle sous le coffre / la boutique quand on est à portée
    [["sell", "#ffd23f"], ["shop", "#8dff8d"]].forEach(([k, col]) => { if (!near[k]) return; const P = PADS[k]; x.strokeStyle = col; x.lineWidth = 3; x.globalAlpha = .6 + .3 * Math.sin(now / 200); x.beginPath(); x.ellipse(P.x, P.y + 40, 96, 22, 0, 0, 7); x.stroke(); x.globalAlpha = 1; });
    const vx0 = camX - 460, vx1 = camX + 460, vy0 = camY - 380, vy1 = camY + 360, inV = (X, Y) => X > vx0 && X < vx1 && Y > vy0 && Y < vy1;
    const list = []; decor.forEach(d => { if (inV(d.x, d.y)) list.push({ y: d.y, f: () => drawDecor(d) }); });
    items.forEach(it => { if (!it.back && inV(it.x, it.y)) list.push({ y: it.y - 20, f: () => drawItem(it, it === near.item, now) }); });
    const pl = (getLobby() && getLobby().players) || {};
    Object.entries(others).forEach(([u, o]) => { if (pl[u]) list.push({ y: o.dy, f: () => avatar(o.dx, o.dy, pl[u].color, pl[u].name, o.n | 0, o.cap | 0, o.boots | 0, o.bag | 0, o.mv, now, false, o.fc || 1) }); });
    list.push({ y: py, f: () => avatar(px, py, (pl[me().uid] && pl[me().uid].color) || "#ffd23f", me().name || "Moi", C.count(s), C.capacity(s), s.boots, s.bag, mv, now, true, face) });
    list.sort((a, b) => a.y - b.y).forEach(o => o.f());
    fx.forEach(p => { x.globalAlpha = Math.max(0, p.l); x.fillStyle = "#b8860b"; x.beginPath(); x.arc(p.x, p.y, 6, 0, 7); x.fill(); x.fillStyle = "#ffd23f"; x.beginPath(); x.arc(p.x, p.y, 4.8, 0, 7); x.fill(); }); x.globalAlpha = 1;
    floats.forEach(f => { x.globalAlpha = Math.max(0, Math.min(1, f.l * 1.5)); label(f.t, f.x, f.y, f.col, 16); if (f.ic) drawIcon(x, f.ic, f.x + 26, f.y - 6, 10); }); x.globalAlpha = 1;
    x.setTransform(DPR, 0, 0, DPR, 0, 0);
    if (stick) { x.globalAlpha = .35; x.fillStyle = "#fff"; x.beginPath(); x.arc(stick.ox, stick.oy, 40, 0, 7); x.fill(); x.beginPath(); x.arc(stick.ox + stick.dx * 40, stick.oy + stick.dy * 40, 20, 0, 7); x.fill(); x.globalAlpha = 1; }
  }
  function frame(now) {
    if (!active) { raf = 0; return; } raf = requestAnimationFrame(frame);
    const dt = Math.min(.05, (now - (last || now)) / 1000); last = now;
    if (loaded) update(dt, now); draw(now);
  }
  document.addEventListener("visibilitychange", () => { if (document.hidden && active) save(true); });

  return {
    enter(c) {
      buildUI();
      active = true; loaded = false; camOK = false; fx.length = 0; floats.length = 0; s = C.fresh(); dirty = false; sel = null; uiKey = ""; near = {}; tgt = null;
      px = C.SPAWN.x + (Math.random() - .5) * 80; py = C.SPAWN.y - 8; face = 1; Object.keys(others).forEach(k => delete others[k]);
      decor = genDecor(); items.length = 0;
      ZONES.filter(z => z.fruit).forEach(z => { for (let i = 0; i < z.fruit.n; i++) { const it = { zone: z, x: 0, y: 0, id: "apple", back: 0 }; items.push(it); spawnItem(it); } });
      keys.clear(); stick = null; mod.hidden = true; send.last = null; last = 0;
      $("ov").style.fontSize = "min(22px,4.5vw)"; $("ov").textContent = "Chargement de ta sauvegarde…";
      $("ghelp").textContent = "ZQSD / WASD / flèches pour bouger · E : ramasser / vendre · F : tout vendre · 1-9 : choisir un fruit";
      const myUid = me().uid;
      const ready = msg => { if (!active) return; loaded = true; $("ov").textContent = ""; renderUI(true); if (msg) toast(msg); if (!raf) raf = requestAnimationFrame(frame); };
      get(path()).then(r => { if (!active) return; s = C.sanitize(r.val()); ready(s.total > 0 ? `Bon retour ! ${fmt(s.coins)} pièces` : "Bienvenue ! Ramasse les fruits au sol (E) et vends-les au coffre"); })
        .catch(() => ready("Sauvegarde illisible : tu démarres à zéro (vérifie les règles Firebase pour users/<uid>/fruit)"));
      const un = onValue(R(`games/${c}/inputs`), snap => { inputs = snap.val() || {}; Object.entries(inputs).forEach(([u, v]) => { if (u !== myUid) parse(u, v); }); Object.keys(others).forEach(u => { if (!inputs[u]) delete others[u]; }); });
      return () => { if (active && loaded) save(true); active = false; un(); raf = 0; mod.hidden = true; $("ov").textContent = ""; $("score").replaceChildren(); scoreboard.k = ""; x.setTransform(1, 0, 0, 1, 0, 0); x.globalAlpha = 1; x.textBaseline = "alphabetic"; };
    }
  };
}
