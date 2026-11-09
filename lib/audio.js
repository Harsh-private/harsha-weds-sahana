/* Tiny procedural music engine (Web Audio). Every note is synthesised in the browser:
   no audio files, nothing to license. Snd.start(song) must be called from a tap. */
window.Snd = (() => {
  let ac, master, rev, timer = null, song = null, step = 0, next = 0, on = false;
  const mtof = m => 440 * Math.pow(2, (m - 69) / 12);

  function ctx() {
    if (ac) return ac;
    ac = new (window.AudioContext || window.webkitAudioContext)();
    master = ac.createGain(); master.gain.value = 0;
    const comp = ac.createDynamicsCompressor(); comp.threshold.value = -18; comp.ratio.value = 3;
    master.connect(comp).connect(ac.destination);
    rev = ac.createConvolver(); rev.buffer = impulse(3.4, 2.6);
    const rg = ac.createGain(); rg.gain.value = .5; rev.connect(rg).connect(master);
    return ac;
  }
  function impulse(sec, decay) {
    const r = ac.sampleRate, n = Math.floor(r * sec), b = ac.createBuffer(2, n, r);
    for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, decay); }
    return b;
  }
  function out(node, wet = .35, pan = 0) {
    let n = node;
    if (pan && ac.createStereoPanner) { const p = ac.createStereoPanner(); p.pan.value = pan; node.connect(p); n = p; }
    n.connect(master); const s = ac.createGain(); s.gain.value = wet; n.connect(s).connect(rev);
  }
  function env(g, t, a, peak, d, sus = .0001) {
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(Math.max(sus, .0001), t + a + d);
  }

  // ---- instruments ----
  // plucked string (Karplus–Strong): santoor / veena-like
  function pluck(t, m, v = .3, bright = .5, len = 2.4, pan = 0) {
    const r = ac.sampleRate, N = Math.max(2, Math.round(r / mtof(m))), L = Math.floor(r * len), b = ac.createBuffer(1, L, r), d = b.getChannelData(0);
    for (let i = 0; i < N; i++) d[i] = Math.random() * 2 - 1;
    const k = .4965 + bright * .003;
    for (let i = N; i < L; i++) d[i] = (d[i - N] + d[i - N + 1 < i ? i - N + 1 : i - N]) * k;
    const s = ac.createBufferSource(); s.buffer = b;
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1500 + bright * 6000;
    const g = ac.createGain(); g.gain.value = v; s.connect(lp).connect(g); out(g, .4, pan); s.start(t);
  }
  // music box / celesta
  function bell(t, m, v = .18, dur = 2.6, pan = 0) {
    [[1, 1], [2, .28], [3, .1], [4.17, .05]].forEach(([k, a]) => {
      const o = ac.createOscillator(), g = ac.createGain(); o.type = 'sine'; o.frequency.value = mtof(m) * k;
      env(g, t, .004, v * a, dur / Math.sqrt(k)); o.connect(g); out(g, .45, pan); o.start(t); o.stop(t + dur + .1);
    });
  }
  // soft piano
  function piano(t, m, v = .2, dur = 3.2, pan = 0) {
    const f = mtof(m), lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(3200, t); lp.frequency.exponentialRampToValueAtTime(900, t + dur);
    const g = ac.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + .006); g.gain.exponentialRampToValueAtTime(v * .35, t + .35); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    lp.connect(g); out(g, .38, pan);
    [['triangle', 1, 1, 0], ['sine', 2, .4, 3], ['sine', 3, .15, -4], ['sine', 1, .5, 7]].forEach(([ty, k, a, dt]) => {
      const o = ac.createOscillator(), og = ac.createGain(); o.type = ty; o.frequency.value = f * k; o.detune.value = dt; og.gain.value = a;
      o.connect(og).connect(lp); o.start(t); o.stop(t + dur + .1);
    });
  }
  // electric piano (FM) for lo-fi chords
  function rhodes(t, m, v = .12, dur = 2.2, pan = 0) {
    const c = ac.createOscillator(), mo = ac.createOscillator(), mg = ac.createGain(), g = ac.createGain();
    c.frequency.value = mtof(m); mo.frequency.value = mtof(m) * 1; mg.gain.setValueAtTime(mtof(m) * 1.4, t); mg.gain.exponentialRampToValueAtTime(mtof(m) * .05, t + .8);
    mo.connect(mg).connect(c.frequency); env(g, t, .01, v, dur);
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1800;
    c.connect(lp).connect(g); out(g, .3, pan); c.start(t); mo.start(t); c.stop(t + dur + .1); mo.stop(t + dur + .1);
  }
  // string pad
  function pad(t, ms, dur, v = .035, cut = 1100) {
    ms.forEach((m, i) => [-7, 7].forEach(dt => {
      const o = ac.createOscillator(), g = ac.createGain(), lp = ac.createBiquadFilter(); o.type = 'sawtooth'; o.frequency.value = mtof(m); o.detune.value = dt;
      lp.type = 'lowpass'; lp.frequency.value = cut; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + dur * .4); g.gain.linearRampToValueAtTime(0, t + dur);
      o.connect(lp).connect(g); out(g, .6, (i % 2 ? .3 : -.3)); o.start(t); o.stop(t + dur + .1);
    }));
  }
  function kick(t, v = .5) {
    const o = ac.createOscillator(), g = ac.createGain(); o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(42, t + .18);
    env(g, t, .002, v, .3); o.connect(g).connect(master); o.start(t); o.stop(t + .4);
  }
  let nbuf = null;
  function noise() { if (!nbuf) { const r = ac.sampleRate, b = ac.createBuffer(1, r, r), d = b.getChannelData(0); for (let i = 0; i < r; i++) d[i] = Math.random() * 2 - 1; nbuf = b; } return nbuf; }
  function hat(t, v = .05, dur = .05) {
    const s = ac.createBufferSource(); s.buffer = noise(); const hp = ac.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 7000;
    const g = ac.createGain(); env(g, t, .001, v, dur); s.connect(hp).connect(g).connect(master); s.start(t, Math.random() * .5); s.stop(t + dur + .05);
  }
  function snap(t, v = .12) {
    const s = ac.createBufferSource(); s.buffer = noise(); const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1800; bp.Q.value = .8;
    const g = ac.createGain(); env(g, t, .002, v, .16); s.connect(bp).connect(g); out(g, .25); s.start(t, Math.random() * .5); s.stop(t + .25);
  }
  function crackle(t, dur) {
    for (let i = 0; i < dur * 9; i++) { const tt = t + Math.random() * dur, s = ac.createBufferSource(); s.buffer = noise();
      const g = ac.createGain(); env(g, tt, .0005, .02 + Math.random() * .03, .01); const hp = ac.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2500;
      s.connect(hp).connect(g).connect(master); s.start(tt, Math.random() * .9); s.stop(tt + .03); }
  }

  // chiptune voice (square / triangle / pulse)
  function chip(t, m, v = .08, dur = .18, type = 'square', pan = 0) {
    const o = ac.createOscillator(), g = ac.createGain(); o.type = type; o.frequency.value = mtof(m);
    g.gain.setValueAtTime(v, t); g.gain.setValueAtTime(v * .7, t + dur * .6); g.gain.linearRampToValueAtTime(0, t + dur);
    o.connect(g); out(g, .12, pan); o.start(t); o.stop(t + dur + .02);
  }
  // round sine bass (upright / walking)
  function bass(t, m, v = .3, dur = .5) {
    const o = ac.createOscillator(), o2 = ac.createOscillator(), g = ac.createGain(), lp = ac.createBiquadFilter();
    o.type = 'triangle'; o2.type = 'sine'; o.frequency.value = o2.frequency.value = mtof(m); lp.type = 'lowpass'; lp.frequency.value = 700;
    env(g, t, .01, v, dur); o.connect(lp); o2.connect(lp); lp.connect(g); out(g, .1); o.start(t); o2.start(t); o.stop(t + dur + .05); o2.stop(t + dur + .05);
  }
  // synth bass / lead with filter sweep
  function saw(t, m, v = .1, dur = .25, cut = 1200, pan = 0) {
    const o = ac.createOscillator(), g = ac.createGain(), lp = ac.createBiquadFilter(); o.type = 'sawtooth'; o.frequency.value = mtof(m);
    lp.type = 'lowpass'; lp.Q.value = 6; lp.frequency.setValueAtTime(cut * 2.5, t); lp.frequency.exponentialRampToValueAtTime(cut * .4, t + dur);
    env(g, t, .005, v, dur); o.connect(lp).connect(g); out(g, .25, pan); o.start(t); o.stop(t + dur + .05);
  }

  // ---- melody helper: a gentle random walk inside a scale ----
  function walker(scale, root, lo = -3, hi = 9) {
    let idx = 2;
    return {
      next(end = false) {
        if (end) { idx = Math.random() < .6 ? 0 : (Math.random() < .5 ? 3 : 5); }
        else { const r = Math.random(); idx += r < .38 ? 1 : r < .76 ? -1 : r < .88 ? 2 : -2; if (idx < lo) idx = lo + 1; if (idx > hi) idx = hi - 1; if (idx > 6 && Math.random() < .3) idx--; }
        const o = Math.floor(idx / scale.length), s = ((idx % scale.length) + scale.length) % scale.length;
        return root + o * 12 + scale[s];
      }
    };
  }

  // ---- scheduler ----
  function tick() {
    while (next < ac.currentTime + .25) { song.play(step, next, api); next += song.stepDur; step++; }
  }
  const api = { pluck, bell, piano, rhodes, pad, kick, hat, snap, crackle, walker, chip, bass, saw, get ac() { return ac; } };
  return {
    api,
    start(s) {
      ctx(); if (ac.state === 'suspended') ac.resume();
      if (on) return; song = s; on = true; step = 0; next = ac.currentTime + .1;
      master.gain.cancelScheduledValues(ac.currentTime); master.gain.setValueAtTime(master.gain.value, ac.currentTime); master.gain.linearRampToValueAtTime(s.volume || .8, ac.currentTime + 3);
      timer = setInterval(tick, 80); tick();
    },
    stop() { if (!on) return; on = false; clearInterval(timer); master.gain.cancelScheduledValues(ac.currentTime); master.gain.setValueAtTime(master.gain.value, ac.currentTime); master.gain.linearRampToValueAtTime(0, ac.currentTime + .6); },
    toggle(s) { if (on) { this.stop(); return false; } this.start(s || song); return true; },
    get playing() { return on; },
    chime(m = 84) { ctx(); if (ac.state === 'suspended') ac.resume(); const t = ac.currentTime + .02; bell(t, m, .25, 2); bell(t + .09, m + 7, .18, 2); }
  };
})();

/* ---- songs ---- */
window.Songs = {
  // Hamsadhwani (S R2 G3 P N3) on D: tanpura drone + santoor-like plucks. 76 bpm, 8th-note steps.
  hamsadhwani: (() => {
    const sc = [0, 2, 4, 7, 11], root = 62; let w = null, rest = 0;
    const rhythm = [[1, 0, 1, 0, 1, 1, 0, 0], [1, 0, 0, 1, 1, 0, 1, 0], [1, 1, 1, 0, 1, 0, 0, 0], [1, 0, 1, 1, 0, 1, 1, 0]];
    let pat = rhythm[0];
    return { stepDur: 60 / 76 / 2, volume: .85, play(i, t, A) {
      w = w || A.walker(sc, root);
      const beat = i % 16;
      // tanpura: Pa – Sa – Sa – low Sa, one cycle every 2 bars
      if (i % 32 === 0) A.pluck(t, root - 5, .16, .15, 5, -.3);
      if (i % 32 === 8) A.pluck(t, root, .14, .15, 5, .3);
      if (i % 32 === 16) A.pluck(t, root, .14, .15, 5, .2);
      if (i % 32 === 24) A.pluck(t, root - 12, .2, .1, 6, -.2);
      if (beat === 0) { pat = rhythm[(Math.random() * rhythm.length) | 0]; rest = Math.random() < .2 ? 1 : 0; }
      if (rest) return;
      if (pat[i % 8]) { const end = beat === 14; const m = w.next(end) + 12; A.pluck(t, m, .2, .75, 2.2, (Math.random() - .5) * .5);
        if (Math.random() < .12) A.pluck(t + .06, m, .08, .8, 1.2); }
    } };
  })(),
  // lo-fi: Fmaj7 Em7 Dm7 Cmaj7, 78 bpm, 16th steps
  lofi: (() => {
    const ch = [[53, 57, 60, 64], [52, 55, 59, 62], [50, 53, 57, 60], [48, 52, 55, 59]], pent = [0, 2, 4, 7, 9]; let w = null;
    return { stepDur: 60 / 78 / 4, volume: .75, play(i, t, A) {
      w = w || A.walker(pent, 72, 0, 7);
      const s = i % 16, bar = Math.floor(i / 16) % 4, sw = (s % 2) ? .028 : 0; t += sw;
      if (s === 0) { ch[bar].forEach((m, k) => A.rhodes(t + k * .012, m, .085, 2.6, (k - 1.5) * .2)); A.rhodes(t, ch[bar][0] - 12, .1, 2.6); A.crackle(t, 60 / 78 * 4); }
      if (s === 10 && Math.random() < .6) ch[bar].slice(1).forEach((m, k) => A.rhodes(t + k * .01, m, .05, 1.2));
      if (s === 0 || s === 10) A.kick(t, .32);
      if (s === 4 || s === 12) A.snap(t, .07);
      if (s % 2 === 0) A.hat(t, s % 4 ? .018 : .03);
      if ((s === 2 || s === 6 || s === 7 || s === 14) && Math.random() < .5) A.bell(t, w.next(s === 14), .07, 1.8, .2);
    } };
  })(),
  // music box lullaby in Mohanam (S R2 G3 P D2) on C, waltz 3/4 at 84 bpm, 8th steps (6 per bar)
  musicbox: (() => {
    const sc = [0, 2, 4, 7, 9], root = 72, bass = [48, 45, 41, 43]; let w = null;
    const rh = [[1, 0, 1, 0, 1, 0], [1, 0, 0, 1, 1, 0], [1, 1, 1, 0, 1, 0], [1, 0, 1, 1, 1, 0]]; let p = rh[0];
    return { stepDur: 60 / 84 / 2, volume: .85, play(i, t, A) {
      w = w || A.walker(sc, root, 0, 8);
      const s = i % 6, bar = Math.floor(i / 6) % 4;
      if (s === 0) { p = rh[(Math.random() * rh.length) | 0]; A.bell(t, bass[bar], .12, 2.6, -.2); }
      if (s === 2 || s === 4) A.bell(t, bass[bar] + 12 + (s === 2 ? 4 : 7) - (bar === 1 ? 1 : 0), .05, 1.4, .2);
      if (p[s]) A.bell(t, w.next(bar === 3 && s === 4), .14, 2.2, (Math.random() - .5) * .4);
    } };
  })(),
  // veena + mridangam groove in Kalyani (raised 4th) on D, 92 bpm, 16th steps
  kalyani: (() => {
    const sc = [0, 2, 4, 6, 7, 9, 11], root = 62; let w = null;
    const thom = [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0], ta = [0, 0, 1, 0, 1, 0, 0, 0, 1, 0, 0, 1, 1, 0, 1, 0];
    return { stepDur: 60 / 92 / 4, volume: .78, play(i, t, A) {
      w = w || A.walker(sc, root, 0, 10);
      const s = i % 16, bar = Math.floor(i / 16) % 8;
      if (i % 64 === 0) { A.pluck(t, root - 12, .18, .1, 6, -.3); A.pluck(t + .3, root - 5, .12, .1, 6, .3); }
      if (thom[s]) A.pluck(t, 38, .3, .02, .5);
      if (ta[s]) A.pluck(t, 74 + (s % 3), .07, .95, .18, .15);
      if (s % 4 === 0 || (s % 2 === 0 && Math.random() < .4)) { const m = w.next(bar % 2 === 1 && s === 12); A.pluck(t, m, .2, .7, 1.8, (Math.random() - .5) * .4);
        if (Math.random() < .15) A.pluck(t + 60 / 92 / 8, m + (Math.random() < .5 ? 2 : -1), .1, .7, 1); }
    } };
  })(),
  // chiptune: C G Am F, 132 bpm, 16th steps
  chiptune: (() => {
    const ch = [[48, 52, 55], [43, 47, 50], [45, 48, 52], [41, 45, 48]], pent = [0, 2, 4, 7, 9]; let w = null, ph = [];
    return { stepDur: 60 / 132 / 4, volume: .55, play(i, t, A) {
      w = w || A.walker(pent, 72, 0, 8);
      const s = i % 16, bar = Math.floor(i / 16) % 4, c = ch[bar];
      if (s % 4 === 0) A.chip(t, c[0] - 12 + (s === 8 ? 7 : 0), .14, .2, 'triangle');
      if (s % 2 === 0) A.chip(t, c[(s / 2) % 3] + 12, .025, .1, 'square', .3);
      if (s === 0 || s === 8) A.kick(t, .25); if (s === 4 || s === 12) A.snap(t, .06); if (s % 2) A.hat(t, .015, .03);
      if (s === 0) { ph = []; for (let k = 0; k < 16; k++) ph.push(Math.random() < (k % 4 === 0 ? .9 : k % 2 ? .25 : .5) ? w.next(k === 14) : null); }
      if (ph[s]) A.chip(t, ph[s], .05, s % 4 === 0 ? .26 : .13, 'square', -.1);
    } };
  })(),
  // fingerpicked guitar: G D Em C, 84 bpm, 8th steps
  guitar: (() => {
    const ch = [[43, 50, 55, 59, 62], [38, 50, 54, 57, 62], [40, 52, 55, 59, 64], [36, 48, 52, 55, 60]], pick = [0, 2, 3, 4, 1, 3, 2, 4];
    return { stepDur: 60 / 84 / 2, volume: .9, play(i, t, A) {
      const s = i % 8, bar = Math.floor(i / 8) % 4, c = ch[bar];
      A.pluck(t + Math.random() * .01, c[pick[s]], s === 0 ? .32 : .22, .62, 2.6, (pick[s] - 2) * .15);
      if (s === 4 && Math.random() < .4) A.pluck(t + .02, c[4] + 2, .12, .7, 1.6, .3);
    } };
  })(),
  // synthwave: Am F C G, 100 bpm, 16th steps
  synthwave: (() => {
    const ch = [[45, 57, 60, 64], [41, 53, 57, 60], [48, 55, 60, 64], [43, 55, 59, 62]];
    return { stepDur: 60 / 100 / 4, volume: .6, play(i, t, A) {
      const s = i % 16, bar = Math.floor(i / 16) % 4, c = ch[bar];
      if (s === 0) A.pad(t, c.slice(1).map(m => m + 12), 60 / 100 * 4 + .2, .028, 1600);
      if (s % 2 === 0) A.saw(t, c[0] - 12 + (s % 4 === 2 ? 12 : 0), .11, .2, 500);
      A.chip(t, c[1 + (s % 3)] + 24, .018, .1, 'square', (s % 2 ? .4 : -.4));
      if (s % 4 === 0) A.kick(t, .4); if (s === 4 || s === 12) A.snap(t, .14); if (s % 2 === 0) A.hat(t, .02, .04);
    } };
  })(),
  // jazz: Dm9 G13 Cmaj9 A7, 92 bpm swing, 8th steps
  jazz: (() => {
    const ch = [[50, 53, 57, 60, 64], [43, 53, 57, 59, 64], [48, 52, 55, 59, 62], [45, 49, 55, 58, 61]], walk = [[38, 41, 45, 44], [43, 47, 50, 49], [36, 40, 43, 44], [45, 44, 43, 40]];
    const sc = [0, 2, 3, 5, 7, 9, 10]; let w = null;
    return { stepDur: 60 / 92 / 2, volume: .8, play(i, t, A) {
      w = w || A.walker(sc, 74, 0, 9);
      const s = i % 8, bar = Math.floor(i / 8) % 4, sw = s % 2 ? .07 : 0; t += sw;
      if (s % 2 === 0) A.bass(t, walk[bar][s / 2], .32, .55);
      if (s === 0 || (s === 5 && Math.random() < .6)) ch[bar].slice(1).forEach((m, k) => A.rhodes(t + k * .015, m, .06, 1.8, (k - 2) * .15));
      A.hat(t, s % 2 ? .012 : .022, .09);
      if (s % 2 === 1 && Math.random() < .3) A.rhodes(t, w.next(false), .07, 1.2, .25);
    } };
  })(),
  // harp: Fmaj7 Am7 Dm7 Bbmaj7, 70 bpm, 16th-note arpeggios up and down
  harp: (() => {
    const ch = [[53, 57, 60, 64, 65, 69, 72, 76], [45, 52, 55, 60, 64, 67, 72, 76], [50, 53, 57, 60, 62, 65, 69, 72], [46, 53, 57, 62, 65, 69, 74, 77]], ord = [0, 1, 2, 3, 4, 5, 6, 7, 6, 5, 4, 3, 2, 3, 4, 5];
    return { stepDur: 60 / 70 / 4, volume: .9, play(i, t, A) {
      const s = i % 16, bar = Math.floor(i / 16) % 4, c = ch[bar];
      A.pluck(t, c[ord[s]] + 12, s === 0 ? .2 : .12, .85, 2.4, (ord[s] / 7 - .5) * .6);
      if (s === 0) A.pluck(t, c[0], .22, .5, 3.5, -.3);
      if (s === 8 && Math.random() < .5) A.bell(t, c[6] + 12, .05, 2.4, .3);
    } };
  })(),
  // cinematic piano: C – G/B – Am – F, arpeggios + strings, 66 bpm, 8th steps
  piano: (() => {
    const ch = [[48, 55, 60, 64, 67], [47, 55, 59, 62, 67], [45, 52, 57, 60, 64], [41, 53, 57, 60, 65]], maj = [0, 2, 4, 5, 7, 9, 11]; let w = null;
    const arp = [0, 2, 3, 4, 3, 2, 1, 2];
    return { stepDur: 60 / 66 / 2, volume: .8, play(i, t, A) {
      w = w || A.walker(maj, 72, 0, 9);
      const s = i % 8, bar = Math.floor(i / 8) % 4, c = ch[bar];
      if (s === 0) { A.piano(t, c[0] - 12, .16, 4); A.pad(t, [c[1], c[2], c[3]], 60 / 66 * 4 + .3, .022, 900); }
      A.piano(t, c[arp[s]], s === 0 ? .1 : .075, 2.6, (s / 8 - .5) * .5);
      if ((s === 0 || s === 3 || s === 6) && Math.random() < .55) A.piano(t, w.next(s === 6 && bar === 3) + (Math.random() < .3 ? 12 : 0), .11, 3.2, .1);
    } };
  })()
};
