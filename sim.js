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
  function drawHud() {
    const mx = C.capacity(s.bagL), zi = ZONES.findIndex(z => inRect(px, py, z.r)), zn = zi >= 0 ? ZONES[zi].e + " " + ZONES[zi].n : "🏠 Hub";
    x.fillStyle = "#0a0719cc"; rr(8, 8, 222, 112, 12); x.fill(); x.textAlign = "left";
    x.font = "800 22px sans-serif"; x.fillStyle = "#ffd23f"; x.fillText("💰 " + fmt(s.coins), 18, 36);
    x.font = "700 15px sans-serif"; x.fillStyle = "#fff"; x.fillText(`🎒 ${s.bn}/${mx}`, 18, 60);
    x.fillStyle = "#ffffff22"; x.fillRect(104, 49, 116, 11); x.fillStyle = s.bn >= mx ? "#ff4d6d" : "#3ee6c4"; x.fillRect(104, 49, 116 * Math.min(1, s.bn / mx), 11);
    x.fillStyle = "#3ee6c4"; x.fillText(`×${C.mult(s).toFixed(1)}${s.rb ? "   ⭐" + s.rb : ""}`, 18, 84);
    x.fillStyle = "#ffffffbb"; x.fillText(zn, 18, 106);
    x.font = "18px sans-serif"; x.fillText(C.equipped(s).map(p => PETS[p].e).join(" "), 120, 106);
  }
  const nameOf = u => { const p = getLobby() && getLobby().players && getLobby().players[u]; return p ? p.name : "?"; };
  const colOf = u => { const p = getLobby() && getLobby().players && getLobby().players[u]; return p ? p.color : "#fff"; };

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
          hitT = 0; const z = ZONES[target.z]; target.hp -= C.power(s.tool); target.shake = .15; beep(260 + Math.random() * 60, .04, "square", .02);
          if (target.hp <= 0) {
            target.back = now + RESPAWN; const n = Math.min(z.yld, cap - s.bn); s.bn += n; s.bv += n * z.val; touch();
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
        if (k === "sell") { const g = C.sell(s); if (g > 0) { float(p.x, p.y - 30, `+${fmt(g)} 💰`, "#ffd23f"); beep(780, .12, "sine", .06, 1560); touch(); save(true); } }
        else openShop(p.tab);
      }
      if (near && k === "sell" && s.bn > 0) { const g = C.sell(s); float(p.x, p.y - 30, `+${fmt(g)} 💰`, "#ffd23f"); beep(780, .12, "sine", .06, 1560); touch(); }
      padIn[k] = near;
    }
    floats.forEach(f => { f.y -= 38 * dt; f.l -= dt * .9; }); for (let i = floats.length - 1; i >= 0; i--) if (floats[i].l <= 0) floats.splice(i, 1);
    Object.values(others).forEach(o => { o.dx += (o.x - o.dx) * Math.min(1, dt * 10); o.dy += (o.y - o.dy) * Math.min(1, dt * 10); });
    if (now - sendT > SEND_EVERY) { sendT = now; send(now); }
    if (now - hudT > 250) { hudT = now; hud(); if (!mod.hidden && !holding && shopKey !== tab + s.coins + "|" + s.pets.length) renderShop(); }
    if (dirty && now - saveT > SAVE_EVERY) save();
  }

  // ---------- dessin ----------
  const rr = (a, b, w, hh, r) => { x.beginPath(); x.moveTo(a + r, b); x.arcTo(a + w, b, a + w, b + hh, r); x.arcTo(a + w, b + hh, a, b + hh, r); x.arcTo(a, b + hh, a, b, r); x.arcTo(a, b, a + w, b, r); x.closePath(); };
  function label(t, X, Y, col = "#fff", size = 13) { x.font = `700 ${size}px sans-serif`; x.textAlign = "center"; x.lineWidth = 3; x.strokeStyle = "#000a"; x.strokeText(t, X, Y); x.fillStyle = col; x.fillText(t, X, Y); }
  function avatar(X, Y, col, name, em, pets, now, me0) {
    x.fillStyle = "#0004"; x.beginPath(); x.ellipse(X, Y + 18, 15, 6, 0, 0, 7); x.fill();
    x.fillStyle = col; x.beginPath(); x.arc(X, Y, 17, 0, 7); x.fill(); x.lineWidth = me0 ? 3 : 2; x.strokeStyle = me0 ? "#fff" : "#0008"; x.stroke();
    x.fillStyle = "#fff"; [-6, 6].forEach(o => { x.beginPath(); x.arc(X + o + face * 0, Y - 3, 4, 0, 7); x.fill(); }); x.fillStyle = "#14102b"; [-6, 6].forEach(o => { x.beginPath(); x.arc(X + o + (me0 ? face : 0) * 1.5, Y - 3, 2, 0, 7); x.fill(); });
    label(name, X, Y - 28, me0 ? "#ffd23f" : "#fff");
    if (em && now - em.at < 3000) { x.font = "30px sans-serif"; x.textAlign = "center"; x.fillText(em.e, X, Y - 46 - Math.min(10, (now - em.at) / 100)); }
  }
  function draw(now) {
    const cx = Math.max(400, Math.min(WORLD.w - 400, px)), cy = Math.max(280, Math.min(WORLD.h - 280, py));
    x.setTransform(1, 0, 0, 1, 0, 0); x.fillStyle = "#16281e"; x.fillRect(0, 0, 800, 560);
    x.setTransform(1, 0, 0, 1, 400 - cx, 280 - cy);
    // quadrillage léger
    x.strokeStyle = "#ffffff0d"; x.lineWidth = 1; x.beginPath();
    for (let gx = Math.floor((cx - 400) / 100) * 100; gx < cx + 500; gx += 100) { x.moveTo(gx, cy - 300); x.lineTo(gx, cy + 300); }
    for (let gy = Math.floor((cy - 280) / 100) * 100; gy < cy + 400; gy += 100) { x.moveTo(cx - 420, gy); x.lineTo(cx + 420, gy); } x.stroke();
    // hub
    x.fillStyle = "#2b2150"; rr(700, 480, 600, 460, 30); x.fill(); x.strokeStyle = "#4b4380"; x.lineWidth = 4; x.stroke();
    // zones
    ZONES.forEach((z, i) => {
      const r = z.r, open = i < s.zones; x.fillStyle = z.col + (open ? "" : "88"); rr(r.x, r.y, r.w, r.h, 26); x.fill(); x.strokeStyle = open ? "#ffffff44" : "#ff4d6d99"; x.lineWidth = 4; x.stroke();
      if (!open) { x.fillStyle = "#000a"; rr(r.x, r.y, r.w, r.h, 26); x.fill(); x.font = "80px sans-serif"; x.textAlign = "center"; x.fillText("🔒", r.x + r.w / 2, r.y + r.h / 2 - 10); label(`${z.n} · ${fmt(z.cost)} 💰`, r.x + r.w / 2, r.y + r.h / 2 + 40, "#fff", 22); }
      else label(z.n, r.x + r.w / 2, r.y + 30, "#ffffffcc", 20);
    });
    // pads
    for (const k in PADS) { const p = PADS[k]; x.fillStyle = k === "sell" ? "#ffd23f33" : "#3ee6c422"; x.beginPath(); x.arc(p.x, p.y, 58, 0, 7); x.fill(); x.strokeStyle = k === "sell" ? "#ffd23f" : "#3ee6c4"; x.lineWidth = 3; x.setLineDash([10, 8]); x.stroke(); x.setLineDash([]); x.font = "46px sans-serif"; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText(p.e, p.x, p.y); x.textBaseline = "alphabetic"; label(p.n, p.x, p.y + 82, "#fff", 14); }
    // filons
    nodes.forEach(n => {
      if (n.z >= s.zones) return; const z = ZONES[n.z], dead = n.back && now < n.back; if (dead) { x.globalAlpha = .18; }
      const sh = n.shake > 0 ? Math.sin(now / 20) * 3 : 0, big = n === target ? 1.15 : 1;
      x.font = `${40 * big}px sans-serif`; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText(z.e, n.x + sh, n.y); x.textBaseline = "alphabetic"; x.globalAlpha = 1;
      if (!dead && n.hp < z.hp) { x.fillStyle = "#000a"; x.fillRect(n.x - 22, n.y + 26, 44, 6); x.fillStyle = "#ff9f1c"; x.fillRect(n.x - 22, n.y + 26, 44 * Math.max(0, n.hp / z.hp), 6); }
    });
    // autres joueurs
    const pl = (getLobby() && getLobby().players) || {};
    Object.entries(others).forEach(([u, o]) => { if (!pl[u]) return; avatar(o.dx, o.dy, colOf(u), nameOf(u) + (o.rb ? " ⭐" + o.rb : ""), o.em, o.pets, now, false); if (o.pets) { x.font = "22px sans-serif"; x.textAlign = "center"; x.fillText(o.pets, o.dx - 4, o.dy + 46); } });
    // pets + moi
    C.equipped(s).forEach((p, i) => { const t = trail[i]; x.font = "26px sans-serif"; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText(PETS[p].e, t.x - face * 6, t.y + 6 + Math.sin(now / 200 + i) * 3); x.textBaseline = "alphabetic"; });
    avatar(px, py, (pl[me().uid] && pl[me().uid].color) || "#ffd23f", (me().name || "Moi") + (s.rb ? " ⭐" + s.rb : ""), myEmo && now - myEmo.at < 3000 ? { e: EMOS[myEmo.i], at: myEmo.at } : null, "", now, true);
    if (target) { x.strokeStyle = "#ffd23f99"; x.lineWidth = 2; x.setLineDash([6, 6]); x.beginPath(); x.moveTo(px, py); x.lineTo(target.x, target.y); x.stroke(); x.setLineDash([]); }
    floats.forEach(f => { x.globalAlpha = Math.max(0, Math.min(1, f.l)); label(f.t, f.x, f.y, f.col, 18); }); x.globalAlpha = 1;
    // joystick (écran)
    x.setTransform(1, 0, 0, 1, 0, 0);
    drawHud();
    if (stick) { x.strokeStyle = "#ffffff55"; x.lineWidth = 3; x.beginPath(); x.arc(stick.ox, stick.oy, 55, 0, 7); x.stroke(); x.fillStyle = "#ffffff88"; x.beginPath(); x.arc(stick.ox + stick.dx * 55, stick.oy + stick.dy * 55, 22, 0, 7); x.fill(); }
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
      active = true; loaded = false; s = C.fresh(); dirty = false; px = 1000 + (Math.random() - .5) * 120; py = 700; face = 1; Object.keys(others).forEach(k => delete others[k]);
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
