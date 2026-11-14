/* MoDa : chat vocal de proximité 🎙️
   - Audio en pair-à-pair (WebRTC, un lien par joueur) : la voix ne passe jamais par un serveur.
   - Firebase ne sert qu'à échanger les messages de connexion (voice/<lobby>/…), supprimés après lecture.
   - Le volume de chaque joueur dépend de sa distance avec toi (les jeux envoient les positions via setPos).
   - Sans positions (jeu qui n'en envoie pas) : tout le monde s'entend à plein volume. */
const ICE = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }, { urls: "stun:stun1.l.google.com:19302" }] };

export function createVoice(env) {
  const { R, set, remove, onValue, onDisconnect, getMe, toast, onState } = env;
  let code = null, on = false, mic = null, micWanted = true, ctx = null, peers = {}, unP = null, unS = null, timer = 0, seq = 0;
  let pos = { me: null, o: {}, range: 450 }, handled = new Set(), gen = 0;
  const myUid = () => getMe().uid;
  const emit = () => { try { onState && onState({ on, mic: !!mic && micWanted, has: !!mic, n: Object.keys(peers).length }); } catch { } };
  const path = (...a) => R(`voice/${code}/${a.join("/")}`);

  const send = (to, m) => { if (!code) return; set(path("sig", to, myUid(), String(Date.now()).padStart(14, "0") + String(++seq % 1000).padStart(3, "0")), JSON.stringify(m)).catch(() => { }); };

  function connect(u, init) {
    if (peers[u]) return peers[u];
    const pc = new RTCPeerConnection(ICE), P = peers[u] = { pc, init, q: [], rd: false, chain: Promise.resolve(), g: null, pan: null, el: null, src: null };
    const tr = pc.addTransceiver("audio", { direction: "sendrecv" }); P.tr = tr;
    if (mic) tr.sender.replaceTrack(mic.getAudioTracks()[0]).catch(() => { });
    pc.onicecandidate = e => { if (e.candidate) send(u, { c: e.candidate.toJSON() }); };
    pc.ontrack = e => attach(u, e.streams[0] || new MediaStream([e.track]));
    pc.onconnectionstatechange = () => { if (pc.connectionState === "failed" || pc.connectionState === "closed") drop(u); emit(); };
    if (init) pc.onnegotiationneeded = async () => { try { await pc.setLocalDescription(await pc.createOffer()); send(u, { o: { type: pc.localDescription.type, sdp: pc.localDescription.sdp } }); } catch { } };
    emit(); return P;
  }
  function attach(u, stream) {
    const P = peers[u]; if (!P || !ctx) return;
    try {
      P.el = new Audio(); P.el.srcObject = stream; P.el.muted = true; P.el.play().catch(() => { }); // requis pour que WebAudio reçoive le flux
      P.src = ctx.createMediaStreamSource(stream); P.g = ctx.createGain(); P.g.gain.value = pos.me ? 0 : 1;
      let last = P.g; if (ctx.createStereoPanner) { P.pan = ctx.createStereoPanner(); P.g.connect(P.pan); last = P.pan; }
      P.src.connect(P.g); last.connect(ctx.destination);
    } catch { }
  }
  function drop(u) {
    const P = peers[u]; if (!P) return; delete peers[u];
    try { P.pc.close(); } catch { } try { P.src && P.src.disconnect(); P.g && P.g.disconnect(); P.pan && P.pan.disconnect(); } catch { }
    if (P.el) { P.el.srcObject = null; P.el = null; }
    emit();
  }
  function handle(from, m) {
    const P = peers[from] || connect(from, false), pc = P.pc;
    P.chain = P.chain.then(async () => {
      try {
        if (m.o) {
          await pc.setRemoteDescription(m.o); P.rd = true;
          for (const c of P.q.splice(0)) await pc.addIceCandidate(c).catch(() => { });
          await pc.setLocalDescription(await pc.createAnswer());
          send(from, { a: { type: pc.localDescription.type, sdp: pc.localDescription.sdp } });
        } else if (m.a) {
          await pc.setRemoteDescription(m.a); P.rd = true;
          for (const c of P.q.splice(0)) await pc.addIceCandidate(c).catch(() => { });
        } else if (m.c) {
          if (P.rd) await pc.addIceCandidate(m.c).catch(() => { }); else P.q.push(m.c);
        }
      } catch { }
    });
  }

  // Volume et balance selon la distance : plein volume tout près, puis décroissance jusqu'à 0 à la portée maximale
  function apply() {
    if (!ctx) return;
    const { me, o, range } = pos, T = ctx.currentTime;
    for (const [u, P] of Object.entries(peers)) {
      if (!P.g) continue;
      let v = 1, pn = 0;
      if (me) {
        const q = o[u];
        if (!q) v = 0;
        else {
          const d = Math.hypot(q.x - me.x, q.y - me.y), near = range * .22;
          v = d <= near ? 1 : d >= range ? 0 : Math.pow(1 - (d - near) / (range - near), 1.6);
          pn = Math.max(-.8, Math.min(.8, (q.x - me.x) / (range * .6)));
        }
      }
      P.g.gain.setTargetAtTime(v, T, .08); if (P.pan) P.pan.pan.setTargetAtTime(pn, T, .1);
    }
  }

  async function start(c) {
    if (on) return; on = true; code = c; const my = ++gen;
    if (!window.RTCPeerConnection) { toast("Chat vocal non supporté par ce navigateur"); on = false; return; }
    try { ctx = new (window.AudioContext || window.webkitAudioContext)(); if (ctx.state !== "running") ctx.resume(); } catch { }
    try { mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } }); }
    catch { mic = null; toast("🎙️ Micro refusé ou introuvable : tu entends les autres, mais ils ne t'entendent pas"); }
    if (my !== gen || !on) { if (mic) mic.getTracks().forEach(t => t.stop()); mic = null; return; } // quitté pendant la demande d'autorisation
    if (mic) mic.getAudioTracks()[0].enabled = micWanted;
    const me = myUid();
    remove(path("sig", me)).catch(() => { });
    unS = onValue(path("sig", me), s => {
      const v = s.val() || {};
      Object.entries(v).forEach(([from, msgs]) => Object.keys(msgs || {}).sort().forEach(k => {
        const id = from + "/" + k; if (handled.has(id)) return; handled.add(id);
        try { handle(from, JSON.parse(msgs[k])); } catch { }
        remove(path("sig", me, from, k)).catch(() => { });
      }));
    });
    unP = onValue(path("peers"), s => {
      const v = s.val() || {};
      Object.keys(v).forEach(u => { if (u !== me && !peers[u]) connect(u, me < u); }); // le plus petit identifiant lance l'appel
      Object.keys(peers).forEach(u => { if (!v[u]) drop(u); });
    });
    set(path("peers", me), 1).catch(() => { }); onDisconnect(path("peers", me)).remove();
    timer = setInterval(apply, 150); emit();
  }
  function stop() {
    if (!on) return; on = false; gen++;
    clearInterval(timer); timer = 0; unP && unP(); unS && unS(); unP = unS = null;
    Object.keys(peers).forEach(drop);
    if (mic) mic.getTracks().forEach(t => t.stop()); mic = null;
    try { ctx && ctx.close(); } catch { } ctx = null;
    if (code) { try { const me = myUid(); onDisconnect(path("peers", me)).cancel(); remove(path("peers", me)).catch(() => { }); remove(path("sig", me)).catch(() => { }); } catch { } }
    handled.clear(); pos = { me: null, o: {}, range: 450 }; code = null; emit();
  }
  return {
    start, stop,
    isOn: () => on,
    setPos(me, o, range) { pos = { me, o: o || {}, range: range || 450 }; },
    // Bouton micro : premier appui = demande du micro si refusé auparavant ; ensuite coupe / réactive
    async toggleMic() {
      if (!on) return;
      if (!mic) {
        try { mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } }); micWanted = true; const t = mic.getAudioTracks()[0]; Object.values(peers).forEach(P => P.tr.sender.replaceTrack(t).catch(() => { })); }
        catch { toast("Micro indisponible : autorise-le dans les réglages du navigateur"); }
      } else { micWanted = !micWanted; mic.getAudioTracks()[0].enabled = micWanted; }
      emit();
    }
  };
}
