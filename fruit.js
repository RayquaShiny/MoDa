/* MoDa : « Fruit Forager » 🍎 (d'après le jeu Roblox du même nom)
   Chaque joueur cueille des fruits sur les arbres dans le même monde, remplit son sac, vend au coffre « SELL HERE »,
   achète sacs et bottes chez Mike's Market, gagne de l'XP et des niveaux. Les joueurs du lobby (5 max) se voient en direct.
   Firebase : la progression de chacun est sauvegardée dans users/<uid>/fruit ; les positions passent par
   games/<code>/inputs/<uid> (même principe que le Mine Simulator). */
import * as C from "./fruitcore.js";
const { FRUITS, RAR, ZONES, WORLD, PADS, BAGS, BOOTS, fmt } = C;

const RANGE = 72, NEAR = 100, SAVE_EVERY = 8000, SEND_EVERY = 110;
const BAGCOL = ["#9aa0a6", "#3fb950", "#e53935"];

// Les arbres sont les mêmes pour tout le monde (graine commune) mais chacun cueille les siens
const rng = seed => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
export function genTrees() {
  const out = [], r = rng(4321);
  [1, 2].forEach(zi => {
    const list = []; Object.entries(C.TREES[zi]).forEach(([id, n]) => { for (let i = 0; i < n; i++) list.push(id); });
    for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [list[i], list[j]] = [list[j], list[i]]; }
    const z = ZONES[zi].r, pts = [];
    list.forEach(id => {
      let p = null, tries = 0;
      while (tries++ < 500) {
        const X = z.x + 80 + r() * (z.w - 160), Y = z.y + 110 + r() * (z.h - 170);
        if (Math.abs(Y - 640) < 70 && (X < z.x + 140 || X > z.x + z.w - 140)) continue; // on laisse le passage libre vers le Spawn
        if (pts.every(q => (q.x - X) ** 2 + (q.y - Y) ** 2 > 130 * 130)) { p = { x: X, y: Y }; break; }
      }
      if (!p) p = { x: z.x + 80 + r() * (z.w - 160), y: z.y + 110 + r() * (z.h - 170) };
      pts.push(p); out.push({ z: zi, id, x: p.x, y: p.y, f: [0, 0, 0] }); // f[i] = 0 : fruit mûr, sinon heure de repousse
    });
  });
  return out;
}
const inRect = (x, y, r, m = 0) => x > r.x - m && x < r.x + r.w + m && y > r.y - m && y < r.y + r.h + m;

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
#fui .fc{background:linear-gradient(#ffe45c,#d9aa00);flex:1.5}#fui .ft{background:linear-gradient(#8a4dff,#5320c4);flex:1}
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
#fui .fs .fn{position:absolute;top:1px;left:5px;font:800 11px system-ui;opacity:.85}
#fui .fs .fk{position:absolute;top:1px;right:5px;font:800 11px system-ui}
#fui .fs .fr{position:absolute;bottom:2px;left:0;right:0;text-align:center;font:800 8px system-ui;letter-spacing:.2px}
#fui .fe0{font-size:12px;opacity:.7;color:#fff;text-shadow:0 1px 2px #000}
`;

// ----- Client -----
export function createFruitClient(env) {
  const { R, get, set, onValue, $, h, toast, beep, getMe, getCode, getLobby } = env;
  const cv = $("cv"), x = cv.getContext("2d"), mod = $("smod");
  const trees = [];
  let active = false, loaded = false, raf = 0, last = 0, s = C.fresh(), dirty = false, saveT = 0, sendT = 0, hudT = 0;
  let px = C.SPAWN.x, py = C.SPAWN.y, face = 1, mv = false, sel = null, fullMsgAt = 0, uiKey = "", camX = 1000, camY = 600, camOK = false, near = {}, tgt = null, holding = false;
  const keys = new Set(), floats = [], fx = [], others = {};
  let inputs = {}, stick = null;
  const me = () => getMe();

  // ---------- sauvegarde Firebase ----------
  const path = () => R(`users/${me().uid}/fruit`);
  function save(now) { if (!loaded || !dirty && !now) return; dirty = false; saveT = performance.now(); set(path(), { ...s, inv: { ...s.inv }, ts: Date.now() }).catch(() => { }); }
  const touch = () => { dirty = true; };

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
    root.innerHTML = `<div class="ftop"><div class="fb fc"><i>🪙</i><b id="fCoins">0</b></div><div class="fb ft"><i>🎟️</i><b id="fTix">0</b></div></div><div class="fxp"><div id="fXpF"></div></div><div class="flvl" id="fLvl"></div><div id="fPrompts"></div><div id="fBar"></div>`;
    cv.parentNode.append(root);
    ui = { coins: root.querySelector("#fCoins"), tix: root.querySelector("#fTix"), xp: root.querySelector("#fXpF"), lvl: root.querySelector("#fLvl"), prompts: root.querySelector("#fPrompts"), bar: root.querySelector("#fBar") };
    return ui;
  }
  const selId = () => { const st = C.stacks(s); if (!st.includes(sel)) sel = st[0] || null; return sel; };
  function renderUI(force) {
    if (!ui) return;
    ui.coins.textContent = s.coins.toLocaleString("fr-FR"); ui.tix.textContent = s.tickets.toLocaleString("fr-FR");
    ui.xp.style.width = Math.min(100, s.xp / C.xpNeed(s.lvl) * 100) + "%"; ui.lvl.textContent = "NIVEAU " + s.lvl;
    const st = C.stacks(s), id = selId(), cap = C.capacity(s), n = C.count(s);
    const p = [];
    if (near.sell && id) { const g = C.stackGain(s, id), a = C.allGain(s); p.push(["E", `Vendre ${FRUITS[id].n} (x${g.n}) · ${fmt(g.coins)} pièces${g.tickets ? " & " + g.tickets + " tickets" : ""}`, "E"]); p.push(["F", `Tout vendre · ${fmt(a.coins)} pièces${a.tickets ? " & " + a.tickets + " tickets" : ""}`, "F"]); }
    else if (near.sell) p.push(["", "Rien à vendre : cueille des fruits !", "", 1]);
    else if (near.shop) p.push(["E", "Ouvrir Mike's Market", "E"]);
    else if (near.tree) p.push(["E", `Cueillir ${FRUITS[near.tree.id].e} ${FRUITS[near.tree.id].n}`, "E"]);
    else if (tgt === "full") p.push(["", `Sac plein (${n}/${cap}) : va vendre !`, "", 1]);
    const key = [st.map(k => k + s.inv[k]).join(), id, cap, n, p.map(q => q[1]).join("|")].join("#");
    if (!force && key === uiKey) return; uiKey = key;
    ui.bar.replaceChildren(...st.map((k, i) => {
      const f = FRUITS[k], d = h("div"); d.className = "fs" + (k === id ? " on" : "");
      d.innerHTML = `<span class="fn">${i + 1}</span><span class="fk">x${s.inv[k]}</span>${f.e}<span class="fr" style="color:${RAR[f.r].c}">[${RAR[f.r].n.toUpperCase()}]</span>`;
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
  const float = (X, Y, t, col) => { if (floats.length < 30) floats.push({ x: X, y: Y, t, col, l: 1 }); };
  function afterSale(g, X, Y) {
    float(X, Y - 70, `+${fmt(g.coins)} 🪙` + (g.tickets ? `  +${g.tickets} 🎟️` : ""), "#ffd23f"); coinBurst(X, Y - 30); beep(780, .12, "sine", .06, 1560); touch(); save(true);
    if (g.up) { const lv = s.lvl; toast(`⭐ Niveau ${lv} !` + (lv === ZONES[2].lvl ? " Le Désert est débloqué 🏜️" : "")); beep(520, .2, "triangle", .05, 1040); }
    sel = null; renderUI(true);
  }
  function act(k) {
    if (!active || !loaded || !mod.hidden) return;
    if (k === "E") {
      if (near.sell) { const id = selId(); if (id) afterSale(C.sellStack(s, id), PADS.sell.x, PADS.sell.y); }
      else if (near.shop) openShop();
      else if (near.tree) {
        const t = near.tree, i = t.f.findIndex(v => v === 0);
        if (i < 0) return;
        if (!C.pick(s, t.id)) { float(px, py - 70, "Sac plein !", "#ff4d6d"); beep(180, .15, "sawtooth", .04); return; }
        t.f[i] = performance.now() + C.REGROW[FRUITS[t.id].r]; touch(); float(t.x, t.y - 70, `+1 ${FRUITS[t.id].e}`, "#fff"); beep(620, .06, "triangle", .04, 900);
        sel = t.id; renderUI(true);
      }
    } else if (k === "F" && near.sell) { const g = C.sellAll(s); if (g) afterSale(g, PADS.sell.x, PADS.sell.y); }
  }

  // ---------- boutique ----------
  const card = (title, sub, label, can, fn) => {
    const d = h("div"); d.className = "scard";
    const t = h("div"); t.append(h("b", title), h("div", sub)); t.lastChild.className = "hint";
    const b = h("button", label, fn); b.disabled = !can; d.append(t, b); return d;
  };
  function openShop() { mod.hidden = false; renderShop(); }
  function closeShop() { mod.hidden = true; }
  function renderShop() {
    if (mod.hidden) return; mod.replaceChildren();
    const top = h("div"); top.className = "stabs"; const tt = h("b", "🛒 Mike's Market"); const x0 = h("button", "✕", closeShop); x0.className = "alt"; top.append(tt, x0); mod.append(top);
    const m = h("div", `🪙 ${fmt(s.coins)}  ·  🎟️ ${s.tickets}`); m.className = "smoney"; mod.append(m);
    const body = h("div"); body.className = "sbody";
    const after = ok => { if (ok) { beep(700, .08, "square", .04, 1000); touch(); save(true); } else beep(160, .15, "sawtooth", .04); renderShop(); renderUI(true); };
    body.append(h("div", "Sacs")); body.lastChild.className = "hint";
    BAGS.forEach((b, i) => {
      if (i === 0) return body.append(card(`${b.e} ${b.n}`, `${b.cap} emplacements · de départ`, s.bag === 0 ? "Équipé" : "Possédé", false));
      const own = i <= s.bag, nxt = i === s.bag + 1;
      body.append(card(`${b.e} ${b.n}`, `${b.cap} emplacements`, own ? (i === s.bag ? "Équipé" : "Possédé") : nxt ? `Acheter · ${fmt(b.cost)} 🪙` : "🔒 Achète le précédent", nxt && s.coins >= b.cost, () => after(C.buyBag(s))));
    });
    body.append(h("div", "Bottes")); body.lastChild.className = "hint";
    BOOTS.forEach((b, i) => {
      const own = i < s.boots, nxt = i === s.boots;
      body.append(card(`${b.e} ${b.n}`, `Vitesse +${b.spd}`, own ? (i === s.boots - 1 ? "Équipées" : "Possédées") : nxt ? `Acheter · ${fmt(b.cost)} 🪙` : "🔒 Achète les précédentes", nxt && s.coins >= b.cost, () => after(C.buyBoots(s))));
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
  const rel = e => { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) * cv.width / r.width, y: (e.clientY - r.top) * cv.height / r.height }; };
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
    let ax = (keys.has("R") ? 1 : 0) - (keys.has("L") ? 1 : 0), ay = (keys.has("D") ? 1 : 0) - (keys.has("U") ? 1 : 0);
    if (stick && !ax && !ay) { ax = Math.abs(stick.dx) > .15 ? stick.dx : 0; ay = Math.abs(stick.dy) > .15 ? stick.dy : 0; }
    const m = Math.hypot(ax, ay); if (m > 1) { ax /= m; ay /= m; }
    const sp = C.speed(s), nx = Math.max(30, Math.min(WORLD.w - 30, px + ax * sp * dt)), ny = Math.max(90, Math.min(WORLD.h - 70, py + ay * sp * dt));
    const locked = (X, Y) => ZONES.some((z, i) => !C.zoneOpen(s, i) && inRect(X, Y, z.r, 14));
    if (!locked(nx, py)) px = nx; if (!locked(px, ny)) py = ny;
    if (ax) face = ax > 0 ? 1 : -1; mv = !!(ax || ay);
    // repousse des fruits
    for (const t of trees) for (let i = 0; i < C.MAXFRUIT; i++) if (t.f[i] && now >= t.f[i]) t.f[i] = 0;
    // ce qui est à portée
    near = {}; tgt = null;
    near.sell = (PADS.sell.x - px) ** 2 + (PADS.sell.y - py) ** 2 < NEAR * NEAR;
    near.shop = (PADS.shop.x - px) ** 2 + (PADS.shop.y - py) ** 2 < NEAR * NEAR;
    let bd = RANGE * RANGE;
    for (const t of trees) { if (!t.f.includes(0)) continue; const d = (t.x - px) ** 2 + (t.y - py) ** 2; if (d < bd) { bd = d; near.tree = t; } }
    if (near.tree && C.count(s) >= C.capacity(s)) { tgt = "full"; near.tree = null; }
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
  let worldC = null;
  function buildWorld() {
    const c = mk(WORLD.w, WORLD.h), g = c.getContext("2d"), W = WORLD.w, H = WORLD.h;
    g.fillStyle = "#2d6a35"; g.fillRect(0, 0, W, H);
    const zone = (r, base, stud) => { g.fillStyle = base; g.fillRect(r.x, r.y, r.w, r.h); g.fillStyle = stud; for (let yy = r.y; yy < r.y + r.h; yy += 40) for (let xx = r.x; xx < r.x + r.w; xx += 40) { g.fillRect(xx + 11, yy + 11, 18, 18); } };
    zone(ZONES[1].r, "#4cc556", "#46b950"); zone(ZONES[0].r, "#5fdc66", "#58d15f"); zone(ZONES[2].r, "#f1d87b", "#e8cd6c");
    const r = rng(7);
    // dalles de pierre : chemin du Spawn vers la Forêt et le Désert, et jusqu'au coffre et à la boutique
    const slab = (X, Y) => { g.fillStyle = "#5d5d68"; g.fillRect(X - 22, Y - 14, 44, 30); g.fillStyle = "#7c7c88"; g.fillRect(X - 22, Y - 14, 44, 24); g.fillStyle = "#8b8b97"; g.fillRect(X - 22, Y - 14, 44, 5); };
    for (let X = 300; X <= 1700; X += 58) slab(X, 640 + (r() - .5) * 16);
    for (let Y = 545; Y <= 735; Y += 46) slab(1000 + (r() - .5) * 10, Y);
    // clôture du Spawn (avec un passage de chaque côté)
    const fence = X => { for (let Y = 90; Y < 1110; Y += 36) { if (Y > 540 && Y < 730) continue; g.fillStyle = "#8a4b1f"; g.fillRect(X - 5, Y - 22, 10, 30); g.fillStyle = "#a8622c"; g.fillRect(X - 5, Y - 22, 10, 6); g.fillStyle = "#6e3a15"; g.fillRect(X - 3, Y - 14, 6, 4); g.fillRect(X - 3, Y, 6, 4); } };
    fence(ZONES[0].r.x); fence(ZONES[0].r.x + ZONES[0].r.w);
    // tuile d'apparition (étoile)
    g.fillStyle = "#f4f4f4"; g.fillRect(C.SPAWN.x - 34, C.SPAWN.y - 28, 68, 56); g.fillStyle = "#111"; g.beginPath();
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rad = i % 2 ? 7 : 19; g[i ? "lineTo" : "moveTo"](C.SPAWN.x + Math.cos(a) * rad, C.SPAWN.y + Math.sin(a) * rad); } g.closePath(); g.fill();
    // coffre « SELL HERE »
    const P = PADS.sell; g.fillStyle = "#0003"; g.beginPath(); g.ellipse(P.x, P.y + 40, 70, 14, 0, 0, 7); g.fill();
    g.fillStyle = "#8f4a1e"; g.fillRect(P.x - 58, P.y - 22, 116, 62); g.fillStyle = "#b9632a"; g.fillRect(P.x - 58, P.y - 40, 116, 24);
    g.fillStyle = "#7a3d16"; for (let i = 0; i < 6; i++) g.fillRect(P.x - 58 + i * 19.5, P.y - 22, 3, 62); g.fillStyle = "#d28a4a"; g.fillRect(P.x - 58, P.y - 40, 116, 5);
    g.fillStyle = "#3a2410"; g.fillRect(P.x - 9, P.y - 28, 18, 16);
    g.font = "800 24px system-ui,sans-serif"; g.textAlign = "center"; g.lineJoin = "round"; g.lineWidth = 6; g.strokeStyle = "#fff"; g.strokeText("SELL HERE", P.x, P.y - 54); g.fillStyle = "#111"; g.fillText("SELL HERE", P.x, P.y - 54);
    // Mike's Market
    const M = PADS.shop; g.fillStyle = "#0003"; g.beginPath(); g.ellipse(M.x, M.y + 46, 88, 14, 0, 0, 7); g.fill();
    g.fillStyle = "#7a4a21"; g.fillRect(M.x - 74, M.y - 6, 8, 52); g.fillRect(M.x + 66, M.y - 6, 8, 52);
    g.fillStyle = "#a8692f"; g.fillRect(M.x - 70, M.y + 14, 140, 34); g.fillStyle = "#c98542"; g.fillRect(M.x - 70, M.y + 14, 140, 8);
    for (let i = 0; i < 7; i++) { g.fillStyle = i % 2 ? "#fff" : "#e53935"; g.fillRect(M.x - 84 + i * 24, M.y - 36, 24, 34); }
    g.fillStyle = "#b5271f"; g.fillRect(M.x - 84, M.y - 4, 168, 6);
    g.font = "800 20px system-ui,sans-serif"; g.lineWidth = 5; g.strokeStyle = "#000b"; g.strokeText("Mike's Market", M.x, M.y - 48); g.fillStyle = "#fff"; g.fillText("Mike's Market", M.x, M.y - 48);
    return c;
  }
  function label(t, X, Y, col = "#fff", size = 13) { x.font = `800 ${size}px system-ui,sans-serif`; x.textAlign = "center"; x.lineJoin = "round"; x.lineWidth = 4; x.strokeStyle = "#000b"; x.strokeText(t, X, Y); x.fillStyle = col; x.fillText(t, X, Y); }
  function drawTree(t, isT, now) {
    const X = t.x, Y = t.y, des = t.z === 2, f = FRUITS[t.id];
    x.fillStyle = "#0003"; x.beginPath(); x.ellipse(X, Y + 2, 34, 9, 0, 0, 7); x.fill();
    x.fillStyle = des ? "#c79a5b" : "#7a4a21"; x.fillRect(X - 8, Y - 30, 16, 30); x.fillStyle = des ? "#a87d44" : "#5e3818"; x.fillRect(X + 2, Y - 30, 6, 30);
    if (des) { x.fillStyle = "#4f9d3a"; x.fillRect(X - 40, Y - 58, 80, 12); x.fillRect(X - 12, Y - 74, 24, 38); x.fillStyle = "#6fbf4a"; x.fillRect(X - 32, Y - 66, 64, 9); x.fillRect(X - 10, Y - 72, 20, 14); }
    else { x.fillStyle = "#2a8238"; x.fillRect(X - 36, Y - 54, 72, 32); x.fillStyle = "#379b45"; x.fillRect(X - 28, Y - 68, 56, 28); x.fillStyle = "#4fb85a"; x.fillRect(X - 16, Y - 82, 32, 22); x.fillStyle = "#ffffff18"; x.fillRect(X - 36, Y - 54, 72, 5); }
    const P = des ? [[-26, -50], [22, -48], [0, -68]] : [[-24, -38], [20, -34], [-2, -62]];
    x.font = "17px sans-serif"; x.textAlign = "center"; x.textBaseline = "middle";
    for (let i = 0; i < C.MAXFRUIT; i++) { if (t.f[i] === 0) { x.fillStyle = f.col; x.beginPath(); x.arc(X + P[i][0], Y + P[i][1], 9, 0, 7); x.fill(); x.fillText(f.e, X + P[i][0], Y + P[i][1] + 1); } }
    x.textBaseline = "alphabetic";
    if (isT) { const b = Math.sin(now / 160) * 3; x.fillStyle = "#fff"; x.beginPath(); x.moveTo(X, Y - 92 + b); x.lineTo(X - 8, Y - 106 + b); x.lineTo(X + 8, Y - 106 + b); x.closePath(); x.fill(); }
  }
  function avatar(X, Y, col, name, n, cap, boots, bag, moving, now, isMe, fc) {
    x.fillStyle = "#0004"; x.beginPath(); x.ellipse(X, Y + 2, 16, 5, 0, 0, 7); x.fill();
    const sw = moving ? Math.sin(now / 90) * 4 : 0;
    x.fillStyle = BAGCOL[Math.min(bag | 0, 2)]; x.fillRect(X - 15, Y - 34, 30, 22); x.fillStyle = "#0003"; x.fillRect(X - 15, Y - 16, 30, 4); // sac
    x.fillStyle = "#3b6fc4"; x.fillRect(X - 9, Y - 14 + sw, 8, 14 - sw); x.fillRect(X + 1, Y - 14 - sw, 8, 14 + sw);
    if (boots > 0) { x.fillStyle = boots > 1 ? "#9aa3ad" : "#8a5a2b"; x.fillRect(X - 10, Y - 4 + sw, 10, 6); x.fillRect(X, Y - 4 - sw, 10, 6); }
    x.fillStyle = col || "#ffd23f"; x.fillRect(X - 10, Y - 34, 20, 21); x.fillStyle = "#f5cd30"; x.fillRect(X - 16, Y - 33 + sw / 2, 6, 15); x.fillRect(X + 10, Y - 33 - sw / 2, 6, 15);
    x.fillRect(X - 8, Y - 52, 16, 17); x.fillStyle = "#222"; x.fillRect(X - 5 + (fc > 0 ? 1 : -1), Y - 46, 3, 4); x.fillRect(X + 2 + (fc > 0 ? 1 : -1), Y - 46, 3, 4);
    label(name, X, Y - 62, isMe ? "#ffd23f" : "#fff", 12);
    label(`${n}/${cap}`, X, Y - 76, n >= cap ? "#ff7a7a" : "#8dff8d", 11);
  }
  function draw(now) {
    x.setTransform(1, 0, 0, 1, 0, 0); x.fillStyle = "#1b3a22"; x.fillRect(0, 0, 800, 560);
    x.setTransform(1, 0, 0, 1, Math.round(400 - camX), Math.round(280 - camY));
    if (!worldC) worldC = buildWorld(); x.drawImage(worldC, 0, 0);
    ZONES.forEach((z, i) => { if (C.zoneOpen(s, i)) return; x.fillStyle = "#0a0a14aa"; x.fillRect(z.r.x, z.r.y, z.r.w, z.r.h); label(`🔒 Niveau ${z.lvl} requis`, z.r.x + 120, 640, "#fff", 18); });
    // cercle sous le coffre / la boutique quand on est à portée
    [["sell", "#ffd23f"], ["shop", "#8dff8d"]].forEach(([k, col]) => { if (!near[k]) return; const P = PADS[k]; x.strokeStyle = col; x.lineWidth = 3; x.globalAlpha = .6 + .3 * Math.sin(now / 200); x.beginPath(); x.ellipse(P.x, P.y + 40, 96, 22, 0, 0, 7); x.stroke(); x.globalAlpha = 1; });
    const list = trees.map(t => ({ y: t.y, f: () => drawTree(t, t === near.tree, now) }));
    const pl = (getLobby() && getLobby().players) || {};
    Object.entries(others).forEach(([u, o]) => { if (pl[u]) list.push({ y: o.dy, f: () => avatar(o.dx, o.dy, pl[u].color, pl[u].name, o.n | 0, o.cap | 0, o.boots | 0, o.bag | 0, o.mv, now, false, o.fc || 1) }); });
    list.push({ y: py, f: () => avatar(px, py, (pl[me().uid] && pl[me().uid].color) || "#ffd23f", me().name || "Moi", C.count(s), C.capacity(s), s.boots, s.bag, mv, now, true, face) });
    list.sort((a, b) => a.y - b.y).forEach(o => o.f());
    fx.forEach(p => { x.globalAlpha = Math.max(0, p.l); x.fillStyle = "#b8860b"; x.beginPath(); x.arc(p.x, p.y, 6, 0, 7); x.fill(); x.fillStyle = "#ffd23f"; x.beginPath(); x.arc(p.x, p.y, 4.8, 0, 7); x.fill(); }); x.globalAlpha = 1;
    floats.forEach(f => { x.globalAlpha = Math.max(0, Math.min(1, f.l * 1.5)); label(f.t, f.x, f.y, f.col, 16); }); x.globalAlpha = 1;
    x.setTransform(1, 0, 0, 1, 0, 0);
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
      px = C.SPAWN.x + (Math.random() - .5) * 120; py = C.SPAWN.y + 60; face = 1; Object.keys(others).forEach(k => delete others[k]);
      trees.length = 0; trees.push(...genTrees());
      keys.clear(); stick = null; mod.hidden = true; send.last = null; last = 0;
      $("ov").style.fontSize = "min(22px,4.5vw)"; $("ov").textContent = "Chargement de ta sauvegarde…";
      $("ghelp").textContent = "ZQSD / WASD / flèches pour bouger · E : cueillir / vendre · F : tout vendre · 1-9 : choisir un fruit";
      const myUid = me().uid;
      const ready = msg => { if (!active) return; loaded = true; $("ov").textContent = ""; renderUI(true); if (msg) toast(msg); if (!raf) raf = requestAnimationFrame(frame); };
      get(path()).then(r => { if (!active) return; s = C.sanitize(r.val()); ready(s.total > 0 ? `Bon retour ! 🪙 ${fmt(s.coins)}` : "Bienvenue ! Va dans la Forêt, cueille des fruits (E) et vends-les au coffre 🍎"); })
        .catch(() => ready("⚠️ Sauvegarde illisible : tu démarres à zéro (vérifie les règles Firebase pour users/<uid>/fruit)"));
      const un = onValue(R(`games/${c}/inputs`), snap => { inputs = snap.val() || {}; Object.entries(inputs).forEach(([u, v]) => { if (u !== myUid) parse(u, v); }); Object.keys(others).forEach(u => { if (!inputs[u]) delete others[u]; }); });
      return () => { if (active && loaded) save(true); active = false; un(); raf = 0; mod.hidden = true; $("ov").textContent = ""; $("score").replaceChildren(); scoreboard.k = ""; x.setTransform(1, 0, 0, 1, 0, 0); x.globalAlpha = 1; x.textBaseline = "alphabetic"; };
    }
  };
}
