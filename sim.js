/* MoDa : « Mine Simulator » ⛏️ (simulator à la Roblox)
   Chaque joueur farme dans le même monde : il se déplace, mine des filons, remplit son sac, vend, achète des
   améliorations, éclot des pets, débloque des zones et renaît. Les joueurs du lobby se voient en direct.
   Firebase : la progression de chacun est sauvegardée dans users/<uid>/sim ; les positions passent par
   games/<code>/inputs/<uid> (même chemin que les autres jeux). */
import * as C from "./simcore.js";
const { ZONES, WORLD, PADS, PETS, EGGS, fmt } = C;

const EMOS = ["👋", "😂", "🔥", "👍", "😎", "💪"];
const SPEED = 235, HIT = 0.5, RANGE = 78, RESPAWN = 8000, SAVE_EVERY = 8000, SEND_EVERY = 110;

// Les filons sont les mêmes pour tout le monde (graine commune) mais chacun mine les siens
const rng = seed => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
export function genNodes() {
  const out = [], r = rng(1234);
  ZONES.forEach((z, zi) => {
    const pts = []; let tries = 0;
    while (pts.length < 14 && tries++ < 400) {
      const x = z.r.x + 50 + r() * (z.r.w - 100), y = z.r.y + 50 + r() * (z.r.h - 100);
      if (pts.every(p => (p.x - x) ** 2 + (p.y - y) ** 2 > 95 * 95)) pts.push({ x, y });
    }
    pts.forEach(p => out.push({ z: zi, x: p.x, y: p.y, hp: z.hp, back: 0, shake: 0 }));
  });
  return out;
}
const inRect = (x, y, r, m = 0) => x > r.x - m && x < r.x + r.w + m && y > r.y - m && y < r.y + r.h + m;

// ----- Hôte : ouvre la partie (rien d'autre : chaque joueur gère sa propre progression) -----
export async function startSim(env) {
  const { R, update, remove, set, increment, getCode } = env, c = getCode();
  await remove(R(`games/${c}`));
  await update(R(`lobbies/${c}`), { status: "playing" });
  set(R("stats/gamesPlayed"), increment(1)).catch(() => { });
}

// ----- Client -----
export function createSimClient(env) {
  const { R, get, set, onValue, $, h, toast, beep, getMe, getCode, getLobby } = env;
  const cv = $("cv"), x = cv.getContext("2d");
  const nodes = genNodes();
  let active = false, loaded = false, raf = 0, last = 0, s = C.fresh(), dirty = false, saveT = 0, sendT = 0, hudT = 0;
  let px = 1000, py = 700, vx = 0, vy = 0, face = 1, hitT = 0, target = null, fullMsgAt = 0, padIn = {}, tab = "tools", lastHatch = "", emoSeq = 0, myEmo = null, hpAcc = 0;
  const keys = new Set(), floats = [], others = {}, trail = [{ x: 1000, y: 700 }, { x: 1000, y: 700 }, { x: 1000, y: 700 }];
  let inputs = {}, stick = null;
  const fx = []; let camX = 1000, camY = 700, camOK = false;
  const me = () => getMe();

  // ---------- sauvegarde Firebase ----------
  const path = () => R(`users/${me().uid}/sim`);
  function save(now) {
    if (!loaded || !dirty && !now) return; dirty = false; saveT = performance.now();
    const o = { ...s, pets: s.pets.slice(), ts: Date.now() };
    set(path(), o).catch(() => { });
  }
  const touch = () => { dirty = true; };

  // ---------- positions des autres joueurs ----------
  function parse(u, v) {
    if (typeof v !== "string") return; const a = v.split(","); if (a.length < 7) return;
    const o = others[u] || (others[u] = { x: +a[0], y: +a[1], dx: +a[0], dy: +a[1], seq: 0, em: null });
    o.x = +a[0]; o.y = +a[1]; o.rb = +a[2]; o.t = +a[3]; o.pets = a[4]; const seq = +a[6];
    if (seq && seq !== o.seq) { o.em = { e: EMOS[+a[5]] || "👋", at: performance.now() }; o.seq = seq; }
  }
  function send(now) {
    if (!active || !loaded) return;
    const str = [Math.round(px), Math.round(py), s.rb, Math.round(s.total), C.equipped(s).map(p => PETS[p].e).join(""), myEmo ? myEmo.i : 0, myEmo ? myEmo.seq : 0].join(",");
    if (send.last === str && now - send.at < 2500) return; send.last = str; send.at = now;
    set(R(`games/${getCode()}/inputs/${me().uid}`), str).catch(() => { });
  }

  // ---------- entrées ----------
  const KEYS = { ArrowUp: "U", w: "U", z: "U", ArrowDown: "D", s: "D", ArrowLeft: "L", a: "L", q: "L", ArrowRight: "R", d: "R" };
  addEventListener("keydown", e => { if (!active || /^(INPUT|TEXTAREA)$/.test(e.target.tagName)) return; const k = KEYS[e.key.length > 1 ? e.key : e.key.toLowerCase()]; if (k) { e.preventDefault(); keys.add(k); } });
  addEventListener("keyup", e => { const k = KEYS[e.key.length > 1 ? e.key : e.key.toLowerCase()]; if (k) keys.delete(k); });
  addEventListener("blur", () => keys.clear());
  const rel = e => { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) * cv.width / r.width, y: (e.clientY - r.top) * cv.height / r.height }; };
  cv.addEventListener("pointerdown", e => { if (!active) return; e.preventDefault(); try { cv.setPointerCapture(e.pointerId); } catch { } const p = rel(e); stick = { id: e.pointerId, ox: p.x, oy: p.y, dx: 0, dy: 0 }; });
  cv.addEventListener("pointermove", e => { if (!stick || e.pointerId !== stick.id) return; const p = rel(e); let dx = p.x - stick.ox, dy = p.y - stick.oy; const d = Math.hypot(dx, dy), m = 55; if (d > m) { stick.ox += dx / d * (d - m); stick.oy += dy / d * (d - m); dx = dx / d * m; dy = dy / d * m; } stick.dx = dx / m; stick.dy = dy / m; });
  const end = e => { if (stick && (!e || e.pointerId === stick.id)) stick = null; };
  cv.addEventListener("pointerup", end); cv.addEventListener("pointercancel", end);

  // ---------- boutique ----------
  const mod = $("smod"); let holding = false, shopKey = "";
  mod.addEventListener("pointerdown", () => { holding = true; }); addEventListener("pointerup", () => { holding = false; }); addEventListener("pointercancel", () => { holding = false; });
  const TABS = [["tools", "⚒️ Outils"], ["eggs", "🥚 Œufs"], ["zones", "🗺️ Zones"], ["rebirth", "⭐ Renaissance"]];
  const card = (title, sub, label, can, fn) => {
    const d = h("div"); d.className = "scard";
    const t = h("div"); t.append(h("b", title), h("div", sub)); t.lastChild.className = "hint";
    const b = h("button", label, fn); b.disabled = !can; d.append(t, b); return d;
  };
  function openShop(t) { if (t) tab = t; mod.hidden = false; renderShop(); }
  function closeShop() { mod.hidden = true; }
  function renderShop() {
    if (mod.hidden) return; shopKey = tab + s.coins + "|" + s.pets.length; mod.replaceChildren();
    const top = h("div"); top.className = "stabs";
    TABS.forEach(([k, l]) => { const b = h("button", l, () => { tab = k; renderShop(); }); b.className = k === tab ? "" : "alt"; top.append(b); });
    const x0 = h("button", "✕", closeShop); x0.className = "alt"; top.append(x0); mod.append(top);
    const m = h("div", `💰 ${fmt(s.coins)}  ·  gains ×${C.mult(s).toFixed(2)}`); m.className = "smoney"; mod.append(m);
    const body = h("div"); body.className = "sbody";
    const afterBuy = ok => { if (ok) { beep(700, .08, "square", .04, 1000); touch(); save(true); } else beep(160, .15, "sawtooth", .04); renderShop(); hud(true); };
    if (tab === "tools") {
      body.append(
        card(`⛏️ Pioche niv. ${s.tool + 1}`, `Puissance ${C.power(s.tool)} → ${C.power(s.tool + 1)} par coup`, `Améliorer · ${fmt(C.toolCost(s.tool))} 💰`, s.coins >= C.toolCost(s.tool), () => afterBuy(C.buyTool(s))),
        card(`🎒 Sac niv. ${s.bagL + 1}`, `Capacité ${C.capacity(s.bagL)} → ${C.capacity(s.bagL + 1)}`, `Agrandir · ${fmt(C.bagCost(s.bagL))} 💰`, s.coins >= C.bagCost(s.bagL), () => afterBuy(C.buyBag(s))));
    } else if (tab === "eggs") {
      EGGS.forEach((eg, i) => {
        const chances = eg.pets.map((p, k) => `${PETS[p].e} ${eg.w[k]}%`).join("  ");
        body.append(card(`${eg.e} ${eg.n}`, chances, `Éclore · ${fmt(eg.cost)} 💰`, s.coins >= eg.cost, () => {
          const p = C.hatch(s, i); if (p >= 0) { lastHatch = `${PETS[p].e} ${PETS[p].n} (${PETS[p].r}) · +${Math.round(PETS[p].m * 100)}% de gains !`; beep(520, .2, "triangle", .05, 1040); float(px, py - 50, PETS[p].e, "#fff"); }
          afterBuy(p >= 0);
        }));
      });
      if (lastHatch) { const l = h("div", "🎉 " + lastHatch); l.className = "shatch"; body.append(l); }
      const cnt = {}; s.pets.forEach(p => cnt[p] = (cnt[p] || 0) + 1);
      const eq = C.equipped(s), inv = h("div", s.pets.length ? "Tes pets : " + Object.keys(cnt).sort((a, b) => PETS[b].m - PETS[a].m).map(p => `${PETS[p].e}×${cnt[p]}`).join("  ") : "Tu n'as pas encore de pet. Éclos un œuf !"); inv.className = "hint";
      const e2 = h("div", `Équipés (les ${C.SLOTS} meilleurs) : ${eq.map(p => PETS[p].e).join(" ") || "—"}`); e2.className = "hint"; body.append(inv, e2);
    } else if (tab === "zones") {
      ZONES.forEach((z, i) => {
        const open = i < s.zones, next = i === s.zones;
        body.append(card(`${z.e} ${z.n}`, `${z.hp} PV · ${z.val} 💰 l'unité`, open ? "✔ Débloquée" : next ? `Débloquer · ${fmt(z.cost)} 💰` : "🔒 Débloque d'abord la précédente", next && s.coins >= z.cost, () => afterBuy(C.unlockZone(s))));
      });
    } else {
      const c = C.rebirthCost(s.rb);
      body.append(card(`⭐ Renaissance n°${s.rb + 1}`, `Remet pièces, pioche et sac à zéro (tu gardes zones et pets). Gains permanents ×${(1 + 0.6 * s.rb).toFixed(1)} → ×${(1 + 0.6 * (s.rb + 1)).toFixed(1)}`, `Renaître · ${fmt(c)} 💰`, s.coins >= c, () => { const ok = C.rebirth(s); if (ok) { toast("⭐ Tu renais plus fort !"); beep(400, .5, "sine", .06, 1600); } afterBuy(ok); }));
    }
    mod.append(body);
  }

  // ---------- emotes ----------
  const emo = $("semo");
  EMOS.forEach((e, i) => emo.append(h("button", e, () => { myEmo = { i, seq: ++emoSeq, at: performance.now() }; emo.hidden = true; send(performance.now()); })));
  $("sEmo").onclick = () => { emo.hidden = !emo.hidden; };
  $("sShop").onclick = () => { if (mod.hidden) openShop(); else closeShop(); };
  
  // ---------- interface ----------
  function float(x0, y0, t, col) { if (floats.length < 40) floats.push({ x: x0, y: y0, t, col, l: 1 }); }
  function hud(force) {
    const rows = [{ n: me().name || "Moi", c: "#ffd23f", t: s.total, rb: s.rb, me: 1 }];
    const pl = (getLobby() && getLobby().players) || {};
    Object.entries(others).forEach(([u, o]) => { if (pl[u]) rows.push({ n: pl[u].name, c: pl[u].color, t: o.t || 0, rb: o.rb || 0 }); });
    rows.sort((a, b) => b.t - a.t); const key = rows.map(r => r.n + r.t + r.rb).join("|");
    if (force || hud.k !== key) { hud.k = key; $("score").replaceChildren(...rows.slice(0, 6).map((r, i) => { const d = h("span", `${i + 1}. ${r.n}${r.rb ? " ⭐" + r.rb : ""} · ${fmt(r.t)}`); d.style.color = r.c; if (r.me) d.style.fontWeight = 700; return d; })); }
  }
  // ---------- simulation (locale) ----------
  function update(dt, now) {
    // déplacement : clavier ou joystick flottant
    let ax = (keys.has("R") ? 1 : 0) - (keys.has("L") ? 1 : 0), ay = (keys.has("D") ? 1 : 0) - (keys.has("U") ? 1 : 0);
    if (stick && !ax && !ay) { ax = Math.abs(stick.dx) > .15 ? stick.dx : 0; ay = Math.abs(stick.dy) > .15 ? stick.dy : 0; }
    const m = Math.hypot(ax, ay); if (m > 1) { ax /= m; ay /= m; }
    const nx = Math.max(20, Math.min(WORLD.w - 20, px + ax * SPEED * dt)), ny = Math.max(20, Math.min(WORLD.h - 20, py + ay * SPEED * dt));
    const locked = (X, Y) => ZONES.some((z, i) => i >= s.zones && inRect(X, Y, z.r, 14));
    if (!locked(nx, py)) px = nx; if (!locked(px, ny)) py = ny; // les zones verrouillées sont infranchissables
    if (ax) face = ax > 0 ? 1 : -1; vx = ax; vy = ay;
    // pets : ils suivent en file indienne
    trail.forEach((t, i) => { const tx = i ? trail[i - 1].x : px, ty = i ? trail[i - 1].y : py, d = Math.hypot(tx - t.x, ty - t.y); if (d > 34) { const k = (d - 34) / d; t.x += (tx - t.x) * Math.min(1, k * dt * 14 + .02); t.y += (ty - t.y) * Math.min(1, k * dt * 14 + .02); } });
    // minage automatique du filon le plus proche
    target = null; let bd = RANGE * RANGE;
    for (const n of nodes) { if (n.z >= s.zones) continue; if (n.back && now < n.back) continue; if (n.back) { n.back = 0; n.hp = ZONES[n.z].hp; } const d = (n.x - px) ** 2 + (n.y - py) ** 2; if (d < bd) { bd = d; target = n; } }
    const cap = C.capacity(s.bagL);
    if (target) {
      if (s.bn >= cap) { if (now - fullMsgAt > 2500) { fullMsgAt = now; float(px, py - 40, "Sac plein ! 💰", "#ff4d6d"); beep(180, .15, "sawtooth", .04); } }
      else {
        hitT += dt;
        if (hitT >= HIT) {
          hitT = 0; const z = ZONES[target.z]; target.hp -= C.power(s.tool); target.shake = .15; chips(target, 3); beep(260 + Math.random() * 60, .04, "square", .02);
          if (target.hp <= 0) {
            target.back = now + RESPAWN; const n = Math.min(z.yld, cap - s.bn); s.bn += n; s.bv += n * z.val; touch(); chips(target, 14, true);
            float(target.x, target.y - 20, `+${n} ${z.e}`, "#ffd23f"); beep(620, .07, "triangle", .04, 900);
            for (let i = 0; i < 6; i++) floats.length < 40 && floats.push({ x: target.x + (Math.random() - .5) * 40, y: target.y + (Math.random() - .5) * 20, t: "•", col: "#fff", l: .6 });
          }
        }
      }
    } else hitT = 0;
    nodes.forEach(n => { if (n.shake > 0) n.shake -= dt; });
    // pads : vente automatique, boutique / œufs / renaissance en s'approchant
    for (const k in PADS) {
      const p = PADS[k], near = (p.x - px) ** 2 + (p.y - py) ** 2 < 64 * 64;
      if (near && !padIn[k]) {
        if (k === "sell") { const g = C.sell(s); if (g > 0) { float(p.x, p.y - 30, `+${fmt(g)} 💰`, "#ffd23f"); coinBurst(p.x, p.y); beep(780, .12, "sine", .06, 1560); touch(); save(true); } }
        else openShop(p.tab);
      }
      if (near && k === "sell" && s.bn > 0) { const g = C.sell(s); float(p.x, p.y - 30, `+${fmt(g)} 💰`, "#ffd23f"); coinBurst(p.x, p.y); beep(780, .12, "sine", .06, 1560); touch(); }
      padIn[k] = near;
    }
    floats.forEach(f => { f.y -= 38 * dt; f.l -= dt * .9; }); for (let i = floats.length - 1; i >= 0; i--) if (floats[i].l <= 0) floats.splice(i, 1);
    Object.values(others).forEach(o => { const ex = o.x - o.dx, ey = o.y - o.dy; o.mv = Math.hypot(ex, ey) > 3; if (Math.abs(ex) > 1.5) o.fc = ex > 0 ? 1 : -1; o.dx += ex * Math.min(1, dt * 10); o.dy += ey * Math.min(1, dt * 10); });
    // éclats et pièces : gravité, puis disparition
    for (let i = fx.length - 1; i >= 0; i--) { const p = fx[i]; p.l -= dt * (p.ring ? 3 : 1.4); if (!p.ring) { p.vy += (p.g || 0) * dt; p.x += p.vx * dt; p.y += p.vy * dt; } if (p.l <= 0) fx.splice(i, 1); }
    // caméra : suit le joueur en douceur
    { const tx = Math.max(400, Math.min(WORLD.w - 400, px)), ty = Math.max(280, Math.min(WORLD.h - 280, py)); if (!camOK) { camX = tx; camY = ty; camOK = true; } else { const k = Math.min(1, dt * 7); camX += (tx - camX) * k; camY += (ty - camY) * k; } }
    if (now - sendT > SEND_EVERY) { sendT = now; send(now); }
    if (now - hudT > 250) { hudT = now; hud(); if (!mod.hidden && !holding && shopKey !== tab + s.coins + "|" + s.pets.length) renderShop(); }
    if (dirty && now - saveT > SAVE_EVERY) save();
  }

  // ---------- dessin ----------
  const rrg = (g, a, b, w, hh, r) => { g.beginPath(); g.moveTo(a + r, b); g.arcTo(a + w, b, a + w, b + hh, r); g.arcTo(a + w, b + hh, a, b + hh, r); g.arcTo(a, b + hh, a, b, r); g.arcTo(a, b, a + w, b, r); g.closePath(); };
  const rr = (a, b, w, hh, r) => rrg(x, a, b, w, hh, r);
  const LOWFX = (navigator.hardwareConcurrency || 8) <= 4 || matchMedia("(hover:none) and (pointer:coarse)").matches;
  const mk = (w, hh) => { const c = document.createElement("canvas"); c.width = w; c.height = hh; return c; };
  const sprites = {};
  const glowSpr = col => sprites[col] || (sprites[col] = (() => { const c = mk(84, 84), g = c.getContext("2d"), gr = g.createRadialGradient(42, 42, 2, 42, 42, 40); gr.addColorStop(0, col + "aa"); gr.addColorStop(1, col + "00"); g.fillStyle = gr; g.fillRect(0, 0, 84, 84); return c; })());
  const glow = (col, X, Y, r, a = 1) => { x.globalAlpha = a; x.drawImage(glowSpr(col), X - r, Y - r, 2 * r, 2 * r); x.globalAlpha = 1; };
  const TIER = [[35, "#5ad1ff"], [20, "#ffd23f"], [10, "#e3e8f2"], [5, "#9aa0a8"], [0, "#b08a5a"]];
  const tierCol = l => TIER.find(t => l >= t[0])[1];
  const ZCHIP = ["#e8504a", "#a8733a", "#6fd8ff", "#ff7a2a"];

  // Décor fixe (herbe, place pavée, sols des zones) : dessiné une seule fois puis recopié à chaque image
  let worldC = null, vigC = null;
  function world() {
    if (worldC) return worldC;
    const W = WORLD.w, Hh = WORLD.h, c = mk(W, Hh), g = c.getContext("2d"), r = rng(99);
    g.fillStyle = "#14281b"; g.fillRect(0, 0, W, Hh);
    for (let k = 0; k < 700; k++) { const X = r() * W, Y = r() * Hh, q = 25 + r() * 70; g.fillStyle = r() < .5 ? "#1a352373" : "#0f201673"; g.beginPath(); g.ellipse(X, Y, q, q * .6, r() * 3, 0, 7); g.fill(); }
    g.lineCap = "round"; g.lineWidth = 2;
    for (let k = 0; k < 900; k++) { const X = r() * W, Y = r() * Hh; g.strokeStyle = r() < .5 ? "#2a5a38" : "#1f4a2d"; for (let b = -1; b <= 1; b++) { g.beginPath(); g.moveTo(X + b * 3, Y); g.lineTo(X + b * 5 + (r() - .5) * 3, Y - 5 - r() * 5); g.stroke(); } }
    // hub : place pavée avec un anneau de runes
    const HB = { x: 700, y: 480, w: 600, h: 460 };
    g.fillStyle = "#0007"; rrg(g, HB.x + 6, HB.y + 12, HB.w, HB.h, 30); g.fill();
    g.save(); rrg(g, HB.x, HB.y, HB.w, HB.h, 30); g.clip();
    for (let X = HB.x; X < HB.x + HB.w; X += 50) for (let Y = HB.y; Y < HB.y + HB.h; Y += 50) {
      const v = (r() * 14) | 0; g.fillStyle = `rgb(${40 + v},${32 + v},${82 + v})`; g.fillRect(X, Y, 50, 50);
      g.fillStyle = "#ffffff0e"; g.fillRect(X, Y, 50, 2); g.fillRect(X, Y, 2, 50); g.fillStyle = "#0000003c"; g.fillRect(X, Y + 48, 50, 2); g.fillRect(X + 48, Y, 2, 50);
    }
    g.translate(1000, 710); g.strokeStyle = "#9d7cff30"; g.lineWidth = 3;
    [190, 150].forEach(q => { g.beginPath(); g.arc(0, 0, q, 0, 7); g.stroke(); });
    g.setLineDash([8, 14]); g.beginPath(); g.arc(0, 0, 170, 0, 7); g.stroke(); g.setLineDash([]);
    for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; g.beginPath(); g.moveTo(Math.cos(a) * 60, Math.sin(a) * 60); g.lineTo(Math.cos(a) * 150, Math.sin(a) * 150); g.stroke(); }
    g.restore();
    g.strokeStyle = "#6a5fc0"; g.lineWidth = 5; rrg(g, HB.x, HB.y, HB.w, HB.h, 30); g.stroke(); g.strokeStyle = "#ffffff1c"; g.lineWidth = 2; rrg(g, HB.x + 5, HB.y + 5, HB.w - 10, HB.h - 10, 26); g.stroke();
    [[735, 515], [1265, 515], [735, 905], [1265, 905]].forEach(([X, Y]) => { // lampadaires
      const gr = g.createRadialGradient(X, Y - 20, 0, X, Y - 20, 90); gr.addColorStop(0, "#ffb02e40"); gr.addColorStop(1, "#ffb02e00"); g.fillStyle = gr; g.fillRect(X - 90, Y - 110, 180, 180);
      g.fillStyle = "#0006"; g.beginPath(); g.ellipse(X, Y + 4, 10, 4, 0, 0, 7); g.fill();
      g.fillStyle = "#2a2250"; g.fillRect(X - 3, Y - 26, 6, 28); g.fillStyle = "#ffd23f"; g.beginPath(); g.arc(X, Y - 30, 7, 0, 7); g.fill(); g.fillStyle = "#fff6c8"; g.beginPath(); g.arc(X - 1.5, Y - 31.5, 3, 0, 7); g.fill();
    });
    // sols des zones, chacun avec sa petite ambiance
    ZONES.forEach((z, i) => {
      const q = z.r; g.save(); rrg(g, q.x, q.y, q.w, q.h, 26); g.clip();
      g.fillStyle = z.col; g.fillRect(q.x, q.y, q.w, q.h);
      for (let k = 0; k < 80; k++) { const X = q.x + r() * q.w, Y = q.y + r() * q.h, s2 = 20 + r() * 60; g.fillStyle = k % 2 ? "#ffffff0b" : "#00000030"; g.beginPath(); g.ellipse(X, Y, s2, s2 * .6, r() * 3, 0, 7); g.fill(); }
      const rx = () => q.x + 20 + r() * (q.w - 40), ry = () => q.y + 20 + r() * (q.h - 40);
      if (i === 0) { // prairie : herbe haute et fleurs
        g.lineWidth = 2; for (let k = 0; k < 320; k++) { const X = rx(), Y = ry(); g.strokeStyle = k % 3 ? "#4a9a5a" : "#3b8048"; for (let b = -1; b <= 1; b++) { g.beginPath(); g.moveTo(X + b * 3, Y); g.lineTo(X + b * 5 + (r() - .5) * 4, Y - 6 - r() * 6); g.stroke(); } }
        const FC = ["#ff7aa8", "#ffffff", "#ffd23f", "#9ad1ff"];
        for (let k = 0; k < 50; k++) { const X = rx(), Y = ry(); g.fillStyle = FC[k % 4]; for (let p = 0; p < 5; p++) { const a = p * 1.2566; g.beginPath(); g.arc(X + Math.cos(a) * 3, Y + Math.sin(a) * 3, 2.2, 0, 7); g.fill(); } g.fillStyle = "#ffd23f"; g.beginPath(); g.arc(X, Y, 1.6, 0, 7); g.fill(); }
      } else if (i === 1) { // forêt : feuilles mortes et racines
        const LC = ["#6b4a1f", "#8a6a2a", "#2f8a4a", "#1c4a35"];
        for (let k = 0; k < 160; k++) { g.fillStyle = LC[k % 4] + "aa"; g.beginPath(); g.ellipse(rx(), ry(), 5, 2.6, r() * 3, 0, 7); g.fill(); }
        g.strokeStyle = "#0000003a"; g.lineWidth = 3; for (let k = 0; k < 16; k++) { let X = rx(), Y = ry(); g.beginPath(); g.moveTo(X, Y); for (let t = 0; t < 4; t++) { X += (r() - .5) * 40; Y += (r() - .5) * 30; g.lineTo(X, Y); } g.stroke(); }
      } else if (i === 2) { // cavernes : dalles, fissures, petits cristaux
        for (let k = 0; k < 40; k++) { g.fillStyle = k % 2 ? "#ffffff0a" : "#00000030"; rrg(g, rx(), ry(), 30 + r() * 40, 20 + r() * 30, 8); g.fill(); }
        g.strokeStyle = "#00000050"; g.lineWidth = 1.5; for (let k = 0; k < 26; k++) { let X = rx(), Y = ry(); g.beginPath(); g.moveTo(X, Y); for (let t = 0; t < 4; t++) { X += (r() - .5) * 30; Y += (r() - .5) * 30; g.lineTo(X, Y); } g.stroke(); }
        const CC = ["#5ad1ff", "#b57bff", "#7affd9"];
        for (let k = 0; k < 20; k++) { const X = rx(), Y = ry(), col = CC[k % 3], gr = g.createRadialGradient(X, Y, 0, X, Y, 26); gr.addColorStop(0, col + "44"); gr.addColorStop(1, col + "00"); g.fillStyle = gr; g.fillRect(X - 26, Y - 26, 52, 52);
          g.fillStyle = col; g.beginPath(); g.moveTo(X - 4, Y); g.lineTo(X - 2, Y - 11); g.lineTo(X + 1, Y - 14); g.lineTo(X + 4, Y - 8); g.lineTo(X + 5, Y); g.closePath(); g.fill(); g.strokeStyle = "#0008"; g.lineWidth = 1.2; g.stroke(); }
      } else { // volcan : roche sombre et coulées de lave
        for (let k = 0; k < 40; k++) { g.fillStyle = "#00000040"; g.beginPath(); g.ellipse(rx(), ry(), 18 + r() * 30, 10 + r() * 16, r() * 3, 0, 7); g.fill(); }
        g.lineCap = "round"; g.lineJoin = "round";
        for (let k = 0; k < 14; k++) { let X = rx(), Y = ry(); const pts = [[X, Y]]; for (let t = 0; t < 5; t++) { X += (r() - .5) * 70; Y += (r() - .3) * 50; pts.push([X, Y]); }
          [["#ff6a0030", 12], ["#ff8a1f", 3.5], ["#ffd23f", 1.2]].forEach(([col, lw]) => { g.strokeStyle = col; g.lineWidth = lw; g.beginPath(); pts.forEach((p, j) => j ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.stroke(); }); }
      }
      [[q.x, q.y, q.x, q.y + 34, q.x, q.y, q.w, 34], [q.x, q.y + q.h, q.x, q.y + q.h - 34, q.x, q.y + q.h - 34, q.w, 34], [q.x, q.y, q.x + 34, q.y, q.x, q.y, 34, q.h], [q.x + q.w, q.y, q.x + q.w - 34, q.y, q.x + q.w - 34, q.y, 34, q.h]]
        .forEach(([x0, y0, x1, y1, a, b, w, hh]) => { const gr = g.createLinearGradient(x0, y0, x1, y1); gr.addColorStop(0, "#00000080"); gr.addColorStop(1, "#0000"); g.fillStyle = gr; g.fillRect(a, b, w, hh); });
      g.restore();
      g.strokeStyle = "#00000060"; g.lineWidth = 7; rrg(g, q.x, q.y, q.w, q.h, 26); g.stroke(); g.strokeStyle = "#ffffff40"; g.lineWidth = 3; rrg(g, q.x, q.y, q.w, q.h, 26); g.stroke();
    });
    return worldC = c;
  }

  // ----- petits dessins -----
  function label(t, X, Y, col = "#fff", size = 13) { x.font = `700 ${size}px system-ui,sans-serif`; x.textAlign = "center"; x.lineJoin = "round"; x.lineWidth = 4; x.strokeStyle = "#000b"; x.strokeText(t, X, Y); x.fillStyle = col; x.fillText(t, X, Y); }
  function pill(t, X, Y, col = "#fff", size = 13) {
    x.font = `700 ${size}px system-ui,sans-serif`; const w = x.measureText(t).width + 16, hh = size + 9;
    x.fillStyle = "#0a0719b8"; rr(X - w / 2, Y - hh / 2, w, hh, hh / 2); x.fill(); x.strokeStyle = "#ffffff1f"; x.lineWidth = 1; x.stroke();
    x.textAlign = "center"; x.textBaseline = "middle"; x.fillStyle = col; x.fillText(t, X, Y + .5); x.textBaseline = "alphabetic";
  }
  function padlock(X, Y, k) {
    x.save(); x.translate(X, Y); x.scale(k, k);
    x.strokeStyle = "#cfcbe8"; x.lineWidth = 5; x.beginPath(); x.arc(0, -6, 9, Math.PI, 0); x.stroke();
    x.fillStyle = "#8a86b8"; rr(-13, -5, 26, 21, 5); x.fill(); x.strokeStyle = "#14102b"; x.lineWidth = 2; x.stroke();
    x.fillStyle = "#14102b"; x.beginPath(); x.arc(0, 4, 3.2, 0, 7); x.fill(); x.fillRect(-1.2, 5, 2.4, 6); x.restore();
  }
  function coin(X, Y, r) { x.fillStyle = "#b8860b"; x.beginPath(); x.arc(X, Y, r, 0, 7); x.fill(); x.fillStyle = "#ffd23f"; x.beginPath(); x.arc(X, Y, r * .82, 0, 7); x.fill(); x.strokeStyle = "#fff3a8"; x.lineWidth = Math.max(1, r * .14); x.beginPath(); x.arc(X, Y, r * .55, 0, 7); x.stroke(); }
  function pickaxe(X, Y, fc, swing, col) {
    x.save(); x.translate(X, Y); x.scale(fc, 1); x.rotate(-.25 + swing * 1.7); x.lineCap = "round";
    x.strokeStyle = "#4a2d14"; x.lineWidth = 5.5; x.beginPath(); x.moveTo(-1, 12); x.lineTo(2, -14); x.stroke();
    x.strokeStyle = "#8a5a2b"; x.lineWidth = 3; x.beginPath(); x.moveTo(-1, 12); x.lineTo(2, -14); x.stroke();
    x.strokeStyle = "#000a"; x.lineWidth = 7.5; x.beginPath(); x.arc(2, -3, 13, Math.PI * 1.17, Math.PI * 1.83); x.stroke();
    x.strokeStyle = col; x.lineWidth = 5; x.beginPath(); x.arc(2, -3, 13, Math.PI * 1.17, Math.PI * 1.83); x.stroke();
    x.restore();
  }
  function bubble(e, X, Y, a) {
    x.globalAlpha = a; x.fillStyle = "#fff"; rr(X - 22, Y - 22, 44, 38, 14); x.fill(); x.beginPath(); x.moveTo(X - 6, Y + 15); x.lineTo(X, Y + 24); x.lineTo(X + 6, Y + 15); x.fill();
    x.font = "26px sans-serif"; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText(e, X, Y - 2); x.textBaseline = "alphabetic"; x.globalAlpha = 1;
  }
  // Un joueur : bonhomme avec sac à dos et pioche (qui s'abat quand il mine)
  function avatar(X, Y, col, name, em, now, me0, fc, moving, swing, tcol, full) {
    const bob = moving ? Math.abs(Math.sin(now / 90)) * 3 : Math.sin(now / 400), by = Y - bob;
    x.fillStyle = "#0005"; x.beginPath(); x.ellipse(X, Y + 19, 15 - bob * .6, 6, 0, 0, 7); x.fill();
    x.fillStyle = full ? "#c0392b" : "#8a5a2b"; rr(X - fc * 17 - 6, by - 6, 12, 19, 5); x.fill(); x.strokeStyle = "#000a"; x.lineWidth = 2; x.stroke();
    x.fillStyle = "#00000040"; x.fillRect(X - fc * 17 - 4, by + 2, 8, 2);
    const st = moving ? Math.sin(now / 90) * 3 : 0; x.fillStyle = "#000b";
    x.beginPath(); x.ellipse(X - 6, Y + 15 + st * .5, 5, 3, 0, 0, 7); x.fill(); x.beginPath(); x.ellipse(X + 6, Y + 15 - st * .5, 5, 3, 0, 0, 7); x.fill();
    x.fillStyle = col; x.beginPath(); x.arc(X, by, 17, 0, 7); x.fill(); x.lineWidth = me0 ? 3 : 2.2; x.strokeStyle = me0 ? "#fff" : "#000b"; x.stroke();
    x.fillStyle = "#0000002e"; x.beginPath(); x.ellipse(X, by + 8, 13, 6, 0, 0, 7); x.fill();
    x.fillStyle = "#ffffff44"; x.beginPath(); x.ellipse(X - 5, by - 9, 9, 5, -.4, 0, 7); x.fill();
    [-6, 6].forEach(o => { const ex = X + o + fc * 2.5; x.fillStyle = "#fff"; x.beginPath(); x.arc(ex, by - 3, 4.4, 0, 7); x.fill(); x.fillStyle = "#14102b"; x.beginPath(); x.arc(ex + fc * 1.6, by - 3, 2.2, 0, 7); x.fill(); });
    x.fillStyle = "#14102b"; x.beginPath(); x.arc(X + fc * 3, by + 6, 3, .2, Math.PI - .2); x.fill();
    pickaxe(X + fc * 17, by + 3, fc, swing, tcol);
    pill(name, X, Y - 33, me0 ? "#ffd23f" : "#fff");
    if (em && now - em.at < 3000) bubble(em.e, X, Y - 70 - Math.min(8, (now - em.at) / 120), Math.min(1, (3000 - (now - em.at)) / 400));
  }

  // ----- filons : un dessin par zone -----
  const NODE = [
    (n, now) => { // champignons
      const m = (mx, my, k, cap) => {
        x.fillStyle = "#f3e6c8"; x.strokeStyle = "#000a"; x.lineWidth = 2; x.beginPath(); x.moveTo(mx - 4 * k, my); x.quadraticCurveTo(mx - 3 * k, my - 12 * k, mx - 2.5 * k, my - 16 * k); x.lineTo(mx + 2.5 * k, my - 16 * k); x.quadraticCurveTo(mx + 3 * k, my - 12 * k, mx + 4 * k, my); x.closePath(); x.fill(); x.stroke();
        x.fillStyle = cap; x.beginPath(); x.ellipse(mx, my - 16 * k, 13 * k, 10 * k, 0, Math.PI, 0); x.closePath(); x.fill(); x.stroke();
        x.fillStyle = "#fff"; [[-6, -20], [3, -23], [7, -18]].forEach(([a, b]) => { x.beginPath(); x.arc(mx + a * k, my + b * k * .9, 2.2 * k, 0, 7); x.fill(); });
        x.fillStyle = "#ffffff30"; x.beginPath(); x.ellipse(mx - 5 * k, my - 22 * k, 5 * k, 2.5 * k, -.5, 0, 7); x.fill();
      };
      m(-15, 3, .85, "#d9573f"); m(14, 4, .75, "#e8a23c"); m(0, 0, 1.45, "#e8504a");
    },
    (n, now) => { // souche de bois
      x.fillStyle = "#6b4423"; x.strokeStyle = "#000a"; x.lineWidth = 2;
      x.beginPath(); x.moveTo(-15, -26); x.lineTo(-17, -3); x.quadraticCurveTo(0, 7, 17, -3); x.lineTo(15, -26); x.closePath(); x.fill(); x.stroke();
      x.strokeStyle = "#4a2d14"; x.lineWidth = 2; [-8, 0, 8].forEach(o => { x.beginPath(); x.moveTo(o, -22); x.lineTo(o * 1.1, -2); x.stroke(); });
      x.fillStyle = "#d9a867"; x.strokeStyle = "#000a"; x.lineWidth = 2; x.beginPath(); x.ellipse(0, -26, 15, 7, 0, 0, 7); x.fill(); x.stroke();
      x.strokeStyle = "#9a6a35"; x.lineWidth = 1.5; [[10, 4.5], [5.5, 2.5], [2, 1]].forEach(([a, b]) => { x.beginPath(); x.ellipse(0, -26, a, b, 0, 0, 7); x.stroke(); });
      x.fillStyle = "#3fa35a"; x.beginPath(); x.ellipse(-13, -25, 6, 3, -.6, 0, 7); x.fill(); x.beginPath(); x.ellipse(-9, -29, 5, 2.5, -1, 0, 7); x.fill();
    },
    (n, now) => { // cristaux
      glow("#5ad1ff", 0, -20, 38, .55 + .2 * Math.sin(now / 300));
      const cr = (cx, hh, w, col, hi) => {
        x.fillStyle = col; x.strokeStyle = "#000a"; x.lineWidth = 2; x.beginPath(); x.moveTo(cx - w, 0); x.lineTo(cx - w * .8, -hh * .7); x.lineTo(cx, -hh); x.lineTo(cx + w * .8, -hh * .7); x.lineTo(cx + w, 0); x.closePath(); x.fill(); x.stroke();
        x.fillStyle = hi; x.beginPath(); x.moveTo(cx, -hh); x.lineTo(cx + w * .8, -hh * .7); x.lineTo(cx + w, 0); x.lineTo(cx + w * .1, 0); x.closePath(); x.fill();
        x.strokeStyle = "#ffffff88"; x.lineWidth = 1.5; x.beginPath(); x.moveTo(cx - w * .45, -hh * .6); x.lineTo(cx - w * .2, -hh * .88); x.stroke();
      };
      cr(-13, 26, 8, "#b57bff", "#7a44c8"); cr(13, 30, 8, "#5ad1ff", "#2d8fd0"); cr(0, 44, 11, "#7ae4ff", "#3aa6e0");
    },
    (n, now) => { // roche de lave
      glow("#ff6a00", 0, -18, 42, .5 + .2 * Math.sin(now / 260));
      x.fillStyle = "#2a1a1a"; x.strokeStyle = "#000"; x.lineWidth = 2; x.beginPath(); x.moveTo(-21, 0); x.lineTo(-23, -15); x.lineTo(-11, -30); x.lineTo(4, -37); x.lineTo(18, -27); x.lineTo(23, -9); x.lineTo(19, 0); x.closePath(); x.fill(); x.stroke();
      x.fillStyle = "#ffffff10"; x.beginPath(); x.moveTo(-11, -30); x.lineTo(4, -37); x.lineTo(2, -20); x.lineTo(-14, -14); x.closePath(); x.fill();
      x.lineCap = "round"; x.lineJoin = "round";
      [[["#ff6a00", 7], ["#ffb02e", 2.6]]].forEach(L => L.forEach(([col, lw]) => { x.strokeStyle = col; x.lineWidth = lw; x.globalAlpha = col === "#ff6a00" ? .45 : .9 + .1 * Math.sin(now / 200); x.beginPath(); x.moveTo(-6, -31); x.lineTo(-2, -19); x.lineTo(-9, -9); x.lineTo(-5, 0); x.moveTo(9, -26); x.lineTo(6, -15); x.lineTo(14, -6); x.stroke(); x.globalAlpha = 1; }));
    }
  ];
  function drawNode(n, now, isT) {
    const z = ZONES[n.z], sh = n.shake > 0 ? Math.sin(now / 20) * 3 : 0, X = n.x + sh, Y = n.y;
    x.fillStyle = "#0005"; x.beginPath(); x.ellipse(X, Y + 22, 21, 7, 0, 0, 7); x.fill();
    if (isT) glow("#ffd23f", X, Y, 46, .35);
    const sq = n.shake > 0 ? 1 + .09 * Math.sin(now / 25) : 1, k = (isT ? 1.1 : 1);
    x.save(); x.translate(X, Y + 21); x.scale(k * (2 - sq), k * sq); NODE[n.z](n, now); x.restore();
    if (n.hp < z.hp) { const w = 46, f = Math.max(0, n.hp / z.hp); x.fillStyle = "#000b"; rr(X - w / 2 - 1, Y + 29, w + 2, 9, 4); x.fill(); x.fillStyle = f > .5 ? "#6bff9a" : f > .25 ? "#ffd23f" : "#ff4d6d"; rr(X - w / 2, Y + 30, Math.max(5, w * f), 7, 3); x.fill(); }
  }
  function drawDead(n, now) {
    const X = n.x, Y = n.y + 20, k = Math.max(0, Math.min(1, 1 - (n.back - now) / RESPAWN));
    x.fillStyle = "#0004"; x.beginPath(); x.ellipse(X, Y, 15, 6, 0, 0, 7); x.fill(); x.fillStyle = "#0000003a"; x.beginPath(); x.ellipse(X, Y - 2, 9, 3.5, 0, 0, 7); x.fill();
    x.strokeStyle = "#ffffff22"; x.lineWidth = 4; x.beginPath(); x.arc(X, Y - 14, 9, 0, 7); x.stroke();
    x.strokeStyle = "#ffffffaa"; x.lineCap = "round"; x.beginPath(); x.arc(X, Y - 14, 9, -Math.PI / 2, -Math.PI / 2 + 6.283 * k); x.stroke();
  }
  function drawPad(key, p, now) {
    const sell = key === "sell", col = sell ? "#ffd23f" : "#3ee6c4", near = padIn[key];
    glow(col, p.x, p.y, 92, .5 + (near ? .3 : 0) + .1 * Math.sin(now / 300));
    const gr = x.createRadialGradient(p.x, p.y, 6, p.x, p.y, 58); gr.addColorStop(0, col + "44"); gr.addColorStop(1, col + "14");
    x.fillStyle = "#150f2e"; x.beginPath(); x.arc(p.x, p.y, 58, 0, 7); x.fill(); x.fillStyle = gr; x.beginPath(); x.arc(p.x, p.y, 58, 0, 7); x.fill();
    x.strokeStyle = col; x.lineWidth = 4; x.beginPath(); x.arc(p.x, p.y, 58, 0, 7); x.stroke();
    x.lineWidth = 3; x.setLineDash([10, 8]); x.lineDashOffset = -now / 40; x.beginPath(); x.arc(p.x, p.y, 47, 0, 7); x.stroke(); x.setLineDash([]); x.lineDashOffset = 0;
    x.font = "44px sans-serif"; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText(p.e, p.x, p.y + Math.sin(now / 350) * 3); x.textBaseline = "alphabetic";
    pill(p.n, p.x, p.y + 80, "#fff", 14);
    if (sell && s.bn > 0) pill(`+${fmt(Math.round(s.bv * C.mult(s)))} 💰`, p.x, p.y - 80, "#ffd23f", 14);
  }
  function drawHud(now) {
    const mx = C.capacity(s.bagL), zi = ZONES.findIndex(z => inRect(px, py, z.r)), zn = zi >= 0 ? ZONES[zi].e + " " + ZONES[zi].n : "🏠 Hub", full = s.bn >= mx;
    x.fillStyle = "#0a0719cc"; rr(8, 8, 230, 118, 14); x.fill(); x.strokeStyle = "#ffffff22"; x.lineWidth = 1.5; x.stroke();
    coin(28, 30, 11); x.textAlign = "left"; x.font = "800 23px system-ui,sans-serif"; x.fillStyle = "#ffd23f"; x.fillText(fmt(s.coins), 46, 38);
    x.font = "17px sans-serif"; x.fillStyle = "#fff"; x.fillText("🎒", 17, 66);
    x.fillStyle = "#ffffff1f"; rr(44, 52, 184, 18, 9); x.fill();
    const f = Math.min(1, s.bn / mx); if (f > 0) { x.fillStyle = full ? "#ff4d6d" : "#3ee6c4"; rr(44, 52, Math.max(18, 184 * f), 18, 9); x.fill(); x.fillStyle = "#ffffff30"; rr(48, 54, Math.max(10, 184 * f - 8), 5, 3); x.fill(); }
    x.font = "700 12px system-ui,sans-serif"; x.textAlign = "center"; x.fillStyle = "#fff"; x.fillText(full ? `PLEIN ${s.bn}/${mx}` : `${s.bn}/${mx}`, 136, 65.5);
    x.textAlign = "left"; x.font = "800 13px system-ui,sans-serif"; const mt = `×${C.mult(s).toFixed(1)} gains`, mw = x.measureText(mt).width + 14;
    x.fillStyle = "#3ee6c422"; rr(16, 78, mw, 20, 10); x.fill(); x.fillStyle = "#3ee6c4"; x.fillText(mt, 23, 92);
    if (s.rb) { const rt = `⭐ ${s.rb}`, rw = x.measureText(rt).width + 14; x.fillStyle = "#ffd23f22"; rr(16 + mw + 6, 78, rw, 20, 10); x.fill(); x.fillStyle = "#ffd23f"; x.fillText(rt, 23 + mw + 6, 92); }
    x.font = "700 14px system-ui,sans-serif"; x.fillStyle = "#ffffffcc"; x.fillText(zn, 16, 116);
    x.font = "17px sans-serif"; x.textAlign = "right"; x.fillText(C.equipped(s).map(p => PETS[p].e).join(" "), 230, 117);
    x.textAlign = "left";
  }
  function drawMap(now) { // minicarte du monde
    const k = 130 / WORLD.w, mw = WORLD.w * k, mh = WORLD.h * k, X0 = 792 - mw, Y0 = 8;
    x.fillStyle = "#0a0719cc"; rr(X0 - 5, Y0 - 5, mw + 10, mh + 10, 8); x.fill(); x.strokeStyle = "#ffffff22"; x.lineWidth = 1; x.stroke();
    x.fillStyle = "#14281b"; x.fillRect(X0, Y0, mw, mh);
    x.fillStyle = "#4b4380"; x.fillRect(X0 + 700 * k, Y0 + 480 * k, 600 * k, 460 * k);
    ZONES.forEach((z, i) => { x.globalAlpha = i < s.zones ? 1 : .35; x.fillStyle = z.col; x.fillRect(X0 + z.r.x * k, Y0 + z.r.y * k, z.r.w * k, z.r.h * k); }); x.globalAlpha = 1;
    const pl = (getLobby() && getLobby().players) || {};
    Object.entries(others).forEach(([u, o]) => { if (!pl[u]) return; x.fillStyle = colOf(u); x.beginPath(); x.arc(X0 + o.dx * k, Y0 + o.dy * k, 2.6, 0, 7); x.fill(); });
    x.fillStyle = "#ffd23f"; x.strokeStyle = "#000b"; x.lineWidth = 1.2; x.beginPath(); x.arc(X0 + px * k, Y0 + py * k, 3.4 + .8 * Math.sin(now / 250), 0, 7); x.fill(); x.stroke();
    x.strokeStyle = "#ffffff77"; x.lineWidth = 1; x.strokeRect(X0 + (camX - 400) * k, Y0 + (camY - 280) * k, 800 * k, 560 * k);
  }
  const nameOf = u => { const p = getLobby() && getLobby().players && getLobby().players[u]; return p ? p.name : "?"; };
  const colOf = u => { const p = getLobby() && getLobby().players && getLobby().players[u]; return p ? p.color : "#fff"; };
  function chips(n, c, big) {
    const col = ZCHIP[n.z];
    for (let i = 0; i < c && fx.length < 120; i++) { const a = Math.random() * 6.28, v = 60 + Math.random() * (big ? 170 : 90); fx.push({ x: n.x, y: n.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 60, l: 1, c: col, g: 420, s: 2 + Math.random() * 2 }); }
    if (big && fx.length < 120) fx.push({ ring: 1, x: n.x, y: n.y, l: 1, c: col });
  }
  function coinBurst(X, Y) { for (let i = 0; i < 12 && fx.length < 120; i++) { const a = -Math.PI / 2 + (Math.random() - .5) * 2.2, v = 110 + Math.random() * 130; fx.push({ x: X, y: Y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, l: 1, c: "#ffd23f", g: 380, s: 4, coin: 1 }); } }
  function pet(P, X, Y, gy, now) { x.fillStyle = "#0004"; x.beginPath(); x.ellipse(X, gy, 11, 4, 0, 0, 7); x.fill(); if (P.m >= 10) glow("#ffd23f", X, Y, 28, .5); x.font = "26px sans-serif"; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText(P.e, X, Y); x.textBaseline = "alphabetic"; }

  function draw(now) {
    const cx = camX, cy = camY, tx = Math.round(400 - cx), ty = Math.round(280 - cy);
    const vis = r => r.x < cx + 410 && r.x + r.w > cx - 410 && r.y < cy + 290 && r.y + r.h > cy - 290, inv = (X, Y, m = 60) => X > cx - 400 - m && X < cx + 400 + m && Y > cy - 280 - m && Y < cy + 280 + m;
    x.setTransform(1, 0, 0, 1, 0, 0); x.globalAlpha = 1; x.fillStyle = "#0f2016"; x.fillRect(0, 0, 800, 560);
    x.setTransform(1, 0, 0, 1, tx, ty);
    const L0 = Math.max(0, -tx), T0 = Math.max(0, -ty); x.drawImage(world(), L0, T0, Math.min(802, WORLD.w - L0), Math.min(562, WORLD.h - T0), L0, T0, Math.min(802, WORLD.w - L0), Math.min(562, WORLD.h - T0));
    // zones : titre quand elles sont ouvertes, cadenas et hachures quand elles sont verrouillées
    ZONES.forEach((z, i) => {
      const r = z.r; if (!vis(r)) return;
      if (i < s.zones) { pill(`${z.e} ${z.n}`, r.x + r.w / 2, r.y + 32, "#ffffffe6", 16); return; }
      x.save(); rr(r.x, r.y, r.w, r.h, 26); x.clip(); x.fillStyle = "#05030fc4"; x.fillRect(r.x, r.y, r.w, r.h);
      x.strokeStyle = "#ff4d6d1c"; x.lineWidth = 16; x.beginPath(); for (let k = -r.h; k < r.w; k += 64) { x.moveTo(r.x + k, r.y + r.h); x.lineTo(r.x + k + r.h, r.y); } x.stroke(); x.restore();
      const next = i === s.zones; x.strokeStyle = next ? "#ff4d6d" : "#ff4d6d88"; x.globalAlpha = next ? .6 + .3 * Math.sin(now / 300) : 1; x.lineWidth = 5; rr(r.x, r.y, r.w, r.h, 26); x.stroke(); x.globalAlpha = 1;
      padlock(r.x + r.w / 2, r.y + r.h / 2 - 20, 2.6); pill(`${z.n} · ${fmt(z.cost)} 💰`, r.x + r.w / 2, r.y + r.h / 2 + 50, "#fff", 20);
    });
    for (const k in PADS) if (inv(PADS[k].x, PADS[k].y, 120)) drawPad(k, PADS[k], now);
    // filons épuisés (au sol), puis ambiance des zones ouvertes
    nodes.forEach(n => { if (n.z < s.zones && n.back && now < n.back && inv(n.x, n.y)) drawDead(n, now); });
    if (!LOWFX) ZONES.forEach((z, i) => {
      if (i >= s.zones || !vis(z.r)) return; const t = now / 1000, col = ["#ffe66d", "#9dffb0", "#7ae4ff", "#ffb02e"][i];
      for (let k = 0; k < 9; k++) { const mx = z.r.x + ((k * 173 + t * (6 + k % 4 * 3) + Math.sin(t * .8 + k) * 18) % z.r.w + z.r.w) % z.r.w, my = z.r.y + ((k * 97 + (i === 3 ? -t * (14 + k) : t * (4 + k % 3 * 2)) + Math.cos(t * .6 + k) * 14) % z.r.h + z.r.h) % z.r.h;
        x.globalAlpha = .3 + .3 * Math.sin(t * 2 + k); x.fillStyle = col; x.beginPath(); x.arc(mx, my, 1.8, 0, 7); x.fill(); } x.globalAlpha = 1;
    });
    if (target) { x.strokeStyle = "#ffd23fa0"; x.lineWidth = 2; x.setLineDash([6, 8]); x.lineDashOffset = -now / 50; x.beginPath(); x.moveTo(px, py); x.lineTo(target.x, target.y); x.stroke(); x.setLineDash([]); x.lineDashOffset = 0; }
    // tout ce qui est debout est dessiné du plus haut au plus bas : les objets plus bas passent devant
    const items = [], pl = (getLobby() && getLobby().players) || {};
    nodes.forEach(n => { if (n.z >= s.zones || (n.back && now < n.back) || !inv(n.x, n.y)) return; items.push({ y: n.y + 20, f: () => drawNode(n, now, n === target) }); });
    Object.entries(others).forEach(([u, o]) => { if (!pl[u]) return;
      items.push({ y: o.dy + 18, f: () => avatar(o.dx, o.dy, colOf(u), nameOf(u) + (o.rb ? " ⭐" + o.rb : ""), o.em, now, false, o.fc || 1, o.mv, 0, "#e3e8f2", false) });
      Array.from(o.pets || "").forEach((e, i) => { const X = o.dx - (o.fc || 1) * (30 + i * 26), Y = o.dy + 8 + Math.sin(now / 200 + i) * 3, P = PETS.find(q => q.e === e) || { e, m: 0 }; items.push({ y: o.dy + 14, f: () => pet(P, X, Y, o.dy + 20, now) }); }); });
    C.equipped(s).forEach((p, i) => { const t = trail[i]; items.push({ y: t.y + 14, f: () => pet(PETS[p], t.x - face * 6, t.y + 6 + Math.sin(now / 200 + i) * 3, t.y + 22, now) }); });
    const moving = Math.abs(vx) + Math.abs(vy) > .05, swing = target && s.bn < C.capacity(s.bagL) ? Math.sin(Math.min(1, hitT / HIT) * Math.PI) : 0;
    items.push({ y: py + 18, f: () => avatar(px, py, (pl[me().uid] && pl[me().uid].color) || "#ffd23f", (me().name || "Moi") + (s.rb ? " ⭐" + s.rb : ""), myEmo && now - myEmo.at < 3000 ? { e: EMOS[myEmo.i], at: myEmo.at } : null, now, true, face, moving, swing, tierCol(s.tool), s.bn >= C.capacity(s.bagL)) });
    items.sort((a, b) => a.y - b.y).forEach(it => it.f());
    // éclats, ondes, pièces, textes flottants
    fx.forEach(p => {
      x.globalAlpha = Math.max(0, p.l);
      if (p.ring) { x.strokeStyle = p.c; x.lineWidth = 1 + 3 * p.l; x.beginPath(); x.arc(p.x, p.y, 8 + 44 * (1 - p.l), 0, 7); x.stroke(); }
      else if (p.coin) coin(p.x, p.y, p.s);
      else { x.fillStyle = p.c; x.fillRect(p.x - p.s / 2, p.y - p.s / 2, p.s, p.s); }
    }); x.globalAlpha = 1;
    floats.forEach(f => { x.globalAlpha = Math.max(0, Math.min(1, f.l)); label(f.t, f.x, f.y, f.col, 18); }); x.globalAlpha = 1;
    // écran : ambiance, interface, joystick
    x.setTransform(1, 0, 0, 1, 0, 0);
    if (!vigC) { vigC = mk(800, 560); const g = vigC.getContext("2d"), gr = g.createRadialGradient(400, 280, 230, 400, 280, 520); gr.addColorStop(0, "#0000"); gr.addColorStop(1, "#05030f66"); g.fillStyle = gr; g.fillRect(0, 0, 800, 560); }
    x.drawImage(vigC, 0, 0);
    drawHud(now); drawMap(now);
    if (stick) { x.strokeStyle = "#ffffff55"; x.lineWidth = 3; x.beginPath(); x.arc(stick.ox, stick.oy, 55, 0, 7); x.stroke(); x.fillStyle = "#ffffff12"; x.beginPath(); x.arc(stick.ox, stick.oy, 55, 0, 7); x.fill(); x.fillStyle = "#ffffff88"; x.beginPath(); x.arc(stick.ox + stick.dx * 55, stick.oy + stick.dy * 55, 22, 0, 7); x.fill(); }
  }
  function frame(now) {
    if (!active) { raf = 0; return; } raf = requestAnimationFrame(frame);
    const dt = Math.min(.05, (now - (last || now)) / 1000); last = now; if (!loaded) return;
    update(dt, now); draw(now);
  }
  addEventListener("pagehide", () => { if (active) save(true); });
  document.addEventListener("visibilitychange", () => { if (document.hidden && active) save(true); });

  return {
    enter(c) {
      active = true; loaded = false; camOK = false; fx.length = 0; s = C.fresh(); dirty = false; px = 1000 + (Math.random() - .5) * 120; py = 700; face = 1; Object.keys(others).forEach(k => delete others[k]);
      floats.length = 0; padIn = {}; keys.clear(); stick = null; myEmo = null; mod.hidden = true; $("semo").hidden = true; lastHatch = ""; trail.forEach(t => { t.x = px; t.y = py; }); send.last = null;
      $("ov").style.fontSize = "min(22px,4.5vw)"; $("ov").textContent = "Chargement de ta sauvegarde…"; $("ghelp").textContent = "ZQSD / WASD / flèches pour bouger · glisse sur mobile";
      const myUid = me().uid;
      get(path()).then(r => { if (!active) return; s = C.sanitize(r.val()); loaded = true; $("ov").textContent = ""; hud(true);
        toast(s.total > 0 ? `Bon retour ! 💰 ${fmt(s.coins)}` : "Bienvenue ! Marche vers un filon pour miner 🍄, puis vends au 💰");
        if (!raf) raf = requestAnimationFrame(frame); }).catch(() => { if (!active) return; loaded = true; $("ov").textContent = ""; toast("⚠️ Sauvegarde illisible : tu démarres à zéro (vérifie les règles Firebase)"); if (!raf) raf = requestAnimationFrame(frame); });
      const un = onValue(R(`games/${c}/inputs`), snap => { inputs = snap.val() || {}; Object.entries(inputs).forEach(([u, v]) => { if (u !== myUid) parse(u, v); }); Object.keys(others).forEach(u => { if (!inputs[u]) delete others[u]; }); });
      return () => { if (active && loaded) save(true); active = false; un(); raf = 0; mod.hidden = true; emo.hidden = true; $("ov").textContent = ""; $("score").replaceChildren(); x.setTransform(1, 0, 0, 1, 0, 0); x.globalAlpha = 1; x.setLineDash([]); x.textBaseline = "alphabetic"; };
    }
  };
}
