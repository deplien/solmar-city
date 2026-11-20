// Every sound in Solmar City is synthesized with WebAudio — no audio files, no samples. A
// small synth engine hums under the car and rises with its speed, police sirens wail in two
// tones, and a slow synthwave arpeggio loops under everything. Browsers only let audio start
// after a gesture, so the context is created lazily on the first key or click; until then
// every call here is a quiet no-op.

const ARP = [0, 3, 7, 10, 12, 10, 7, 3]; // A minor-ish climb and fall, in semitones.
const ROOT = 110; // A2.

export function createAudio() {
  let ctx = null;
  let master = null;
  let musicBus = null;
  let engine = null; // { osc, gain, filter }
  let siren = null; // { osc, gain, lfo }
  let musicTimer = 0;
  let musicStep = 0;

  const audio = {
    soundOn: true,
    musicOn: true,

    /** Create the context and the buses. Safe to call on every gesture; only the first acts. */
    ensure() {
      if (ctx) {
        if (ctx.state === 'suspended') ctx.resume();
        return;
      }
      try {
        ctx = new (window.AudioContext || window.webkitAudioContext)();
      } catch {
        return;
      }
      master = ctx.createGain();
      master.gain.value = audio.soundOn ? 0.5 : 0;
      master.connect(ctx.destination);
      musicBus = ctx.createGain();
      musicBus.gain.value = audio.musicOn ? 0.34 : 0;
      musicBus.connect(master);
    },

    /** One oscillator blip with an envelope; the atom every effect below is built from. */
    tone(freq, dur, { type = 'sine', vol = 0.2, at = 0, slide = 0, bus = null } = {}) {
      if (!ctx || !audio.soundOn) return;
      const t0 = ctx.currentTime + at;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t0);
      if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t0 + dur);
      gain.gain.setValueAtTime(vol, t0);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
      osc.connect(gain);
      gain.connect(bus || master);
      osc.start(t0);
      osc.stop(t0 + dur + 0.02);
    },

    /** A burst of filtered noise: gunshots, crashes, punches and surf. */
    noise(dur, { vol = 0.25, freq = 1200, at = 0, q = 0.8 } = {}) {
      if (!ctx || !audio.soundOn) return;
      const t0 = ctx.currentTime + at;
      const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
      const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = freq;
      filter.Q.value = q;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(vol, t0);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
      src.connect(filter);
      filter.connect(gain);
      gain.connect(master);
      src.start(t0);
    },

    click() { audio.tone(660, 0.06, { type: 'square', vol: 0.08 }); },
    pickup() { audio.tone(880, 0.09, { type: 'sine', vol: 0.16 }); audio.tone(1320, 0.12, { type: 'sine', vol: 0.14, at: 0.06 }); },
    shard() { audio.tone(1560, 0.16, { type: 'triangle', vol: 0.18 }); audio.tone(2093, 0.2, { type: 'triangle', vol: 0.12, at: 0.07 }); },
    cash() {
      audio.tone(988, 0.08, { type: 'square', vol: 0.1 });
      audio.tone(1319, 0.14, { type: 'square', vol: 0.1, at: 0.07 });
    },
    jingle() {
      const notes = [523, 659, 784, 1047];
      notes.forEach((f, i) => audio.tone(f, 0.22, { type: 'triangle', vol: 0.16, at: i * 0.11 }));
    },
    fail() {
      audio.tone(392, 0.2, { type: 'triangle', vol: 0.14 });
      audio.tone(311, 0.32, { type: 'triangle', vol: 0.14, at: 0.16 });
    },
    punch() { audio.noise(0.09, { vol: 0.3, freq: 500 }); },
    shot() {
      audio.noise(0.14, { vol: 0.4, freq: 2600, q: 0.4 });
      audio.tone(160, 0.1, { type: 'square', vol: 0.12, slide: -90 });
    },
    dryFire() { audio.tone(1200, 0.04, { type: 'square', vol: 0.07 }); },
    reload() {
      audio.tone(500, 0.05, { type: 'square', vol: 0.09 });
      audio.tone(760, 0.05, { type: 'square', vol: 0.09, at: 0.16 });
    },
    honk(pitch = 1) {
      audio.tone(370 * pitch, 0.22, { type: 'square', vol: 0.07 });
      audio.tone(466 * pitch, 0.22, { type: 'square', vol: 0.06 });
    },
    crash(strength = 1) {
      audio.noise(0.22, { vol: 0.22 * strength, freq: 700, q: 0.5 });
      audio.tone(90, 0.2, { type: 'sine', vol: 0.2 * strength, slide: -40 });
    },
    door() { audio.tone(220, 0.07, { type: 'square', vol: 0.1 }); audio.noise(0.05, { vol: 0.08, freq: 900 }); },
    alarm() {
      for (let i = 0; i < 3; i += 1) {
        audio.tone(1175, 0.13, { type: 'square', vol: 0.09, at: i * 0.3 });
        audio.tone(880, 0.13, { type: 'square', vol: 0.09, at: i * 0.3 + 0.15 });
      }
    },
    phone() {
      audio.tone(1047, 0.1, { type: 'sine', vol: 0.1 });
      audio.tone(1047, 0.1, { type: 'sine', vol: 0.1, at: 0.16 });
    },

    /** Start or steer the engine hum; ratio is 0..1 of the car's top speed. Null parks it. */
    setEngine(ratio) {
      if (!ctx) return;
      if (ratio === null) {
        if (engine) {
          engine.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.08);
          const dead = engine;
          engine = null;
          setTimeout(() => { try { dead.osc.stop(); } catch { /* already gone */ } }, 300);
        }
        return;
      }
      if (!engine) {
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 420;
        const gain = ctx.createGain();
        gain.gain.value = 0;
        osc.connect(filter);
        filter.connect(gain);
        gain.connect(master);
        osc.start();
        engine = { osc, gain, filter };
      }
      const target = audio.soundOn ? 0.05 + ratio * 0.075 : 0;
      engine.gain.gain.setTargetAtTime(target, ctx.currentTime, 0.06);
      engine.osc.frequency.setTargetAtTime(52 + ratio * 118, ctx.currentTime, 0.05);
      engine.filter.frequency.setTargetAtTime(320 + ratio * 700, ctx.currentTime, 0.08);
    },

    /** The two-tone wail, its loudness set by the nearest cruiser. Off with null. */
    setSiren(level) {
      if (!ctx) return;
      if (level === null || level <= 0.01) {
        if (siren) {
          siren.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.1);
          const dead = siren;
          siren = null;
          setTimeout(() => { try { dead.osc.stop(); dead.lfo.stop(); } catch { /* already gone */ } }, 350);
        }
        return;
      }
      if (!siren) {
        const osc = ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.value = 800;
        const lfo = ctx.createOscillator();
        lfo.type = 'square';
        lfo.frequency.value = 0.65;
        const lfoGain = ctx.createGain();
        lfoGain.gain.value = 130;
        lfo.connect(lfoGain);
        lfoGain.connect(osc.frequency);
        const gain = ctx.createGain();
        gain.gain.value = 0;
        osc.connect(gain);
        gain.connect(master);
        osc.start();
        lfo.start();
        siren = { osc, gain, lfo };
      }
      siren.gain.gain.setTargetAtTime(audio.soundOn ? Math.min(0.11, level) : 0, ctx.currentTime, 0.1);
    },

    /** Advance the music sequencer; called every frame from the main loop. */
    updateMusic(dt) {
      if (!ctx || !audio.musicOn || !audio.soundOn) return;
      musicTimer -= dt;
      if (musicTimer > 0) return;
      musicTimer = 0.205;
      const step = musicStep;
      musicStep = (musicStep + 1) % 64;
      const semis = ARP[step % ARP.length] + (step % 16 >= 8 ? 12 : 0);
      const freq = ROOT * 2 * Math.pow(2, semis / 12);
      audio.tone(freq, 0.19, { type: 'triangle', vol: 0.11, bus: musicBus });
      if (step % 4 === 0) audio.tone(ROOT / 2, 0.5, { type: 'sine', vol: 0.16, bus: musicBus });
      if (step % 16 === 0) {
        audio.tone(ROOT * 1.5, 1.4, { type: 'sine', vol: 0.05, bus: musicBus });
        audio.tone(ROOT * 2.25, 1.4, { type: 'sine', vol: 0.04, bus: musicBus });
      }
    },

    toggleMusic() {
      audio.musicOn = !audio.musicOn;
      if (musicBus) musicBus.gain.setTargetAtTime(audio.musicOn ? 0.34 : 0, ctx.currentTime, 0.05);
      return audio.musicOn;
    },
    toggleSound() {
      audio.soundOn = !audio.soundOn;
      if (master) master.gain.setTargetAtTime(audio.soundOn ? 0.5 : 0, ctx.currentTime, 0.03);
      if (!audio.soundOn) {
        audio.setEngine(null);
        audio.setSiren(null);
      }
      return audio.soundOn;
    },
  };
  return audio;
}
