const AudioBus = (() => {
  let ctx, master, muted = false, started = false;
  const loops = {};

  function ensure() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.7;
    // 120 Hz high-pass per Bill's audio rules
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 120;
    hp.Q.value = 0.7;
    hp.connect(master);
    master.connect(ctx.destination);
    AudioBus._hp = hp;
    return ctx;
  }

  async function resume() {
    ensure();
    if (ctx.state === "suspended") await ctx.resume();
    started = true;
  }

  async function loadLoop(name, url) {
    if (loops[name]) return loops[name];
    ensure();
    const res = await fetch(url);
    const buf = await res.arrayBuffer();
    const audio = await ctx.decodeAudioData(buf.slice(0));
    const src = ctx.createBufferSource();
    src.buffer = audio;
    src.loop = true;
    const g = ctx.createGain();
    g.gain.value = name === "generator" ? 0.18 : 0.35;
    src.connect(g);
    g.connect(AudioBus._hp);
    src.start(0);
    loops[name] = { src, g };
  }

  function toggle() {
    muted = !muted;
    if (master) master.gain.value = muted ? 0 : 0.7;
    const btn = document.getElementById("mute");
    if (btn) btn.textContent = muted ? "SOUND OFF" : "SOUND ON";
    return muted;
  }

  function setMuted(v) {
    muted = !!v;
    if (master) master.gain.value = muted ? 0 : 0.7;
    const btn = document.getElementById("mute");
    if (btn) btn.textContent = muted ? "SOUND OFF" : "SOUND ON";
  }

  function blip(freq, dur, type, gain) {
    ensure();
    if (!ctx) return;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type || "square";
    o.frequency.value = freq;
    const t = ctx.currentTime;
    const amp = gain == null ? 0.14 : gain;
    g.gain.setValueAtTime(amp, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(AudioBus._hp);
    o.start(t); o.stop(t + dur + 0.02);
  }
  function click() { blip(880, 0.05, "square", 0.08); }
  function horn() {
    blip(420, 0.5, "sawtooth", 0.2);
    blip(280, 0.5, "square", 0.1);
  }
  let mot = null;
  function motor(gain, freq) {
    ensure();
    if (!ctx) return;
    if (gain <= 0.01) {
      if (mot) { mot.g.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.08); }
      return;
    }
    if (!mot) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sawtooth";
      o.frequency.value = freq || 160;
      g.gain.value = 0.0001;
      o.connect(g); g.connect(AudioBus._hp);
      o.start();
      mot = { o, g };
    }
    mot.o.frequency.setTargetAtTime(freq || 160, ctx.currentTime, 0.1);
    mot.g.gain.setTargetAtTime(gain, ctx.currentTime, 0.1);
  }

  return { resume, loadLoop, toggle, setMuted, blip, click, horn, motor, get muted() { return muted; }, get started() { return started; } };
})();
