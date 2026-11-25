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

  return { resume, loadLoop, toggle, setMuted, get muted() { return muted; }, get started() { return started; } };
})();
