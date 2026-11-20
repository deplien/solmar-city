// Juice, kept in one place: particles for sparks, dust, smoke and confetti; skid marks that
// stay on the asphalt; floating text for cash and callouts; and the screen shake that sells a
// crash. Everything is pooled in plain arrays with hard caps, so a long chase cannot grow
// memory without bound — the oldest marks simply fade first.

const MAX_PARTICLES = 420;
const MAX_SKIDS = 1100;
const MAX_TEXTS = 24;

export function createFx() {
  return {
    particles: [],
    skids: [],
    texts: [],
    shake: 0,
    /** Seconds of red vignette left after the player takes a hit. */
    hurtFlash: 0,
  };
}

function spawn(G, p) {
  if (G.fx.particles.length >= MAX_PARTICLES) G.fx.particles.shift();
  G.fx.particles.push(p);
}

/** A burst of short-lived specks: sparks from a crash, dust from a drift, glass from a hit. */
export function burst(G, x, y, { count = 10, color = '#ffd94d', speed = 130, life = 0.5, size = 3, gravity = 0, spread = 0 } = {}) {
  for (let i = 0; i < count; i += 1) {
    const a = G.rng() * Math.PI * 2;
    const v = speed * (0.3 + G.rng() * 0.9);
    spawn(G, {
      x: x + G.rng.spread(spread), y: y + G.rng.spread(spread),
      vx: Math.cos(a) * v, vy: Math.sin(a) * v,
      life: life * (0.5 + G.rng() * 0.8), maxLife: life,
      size: size * (0.6 + G.rng() * 0.8), color, gravity, drag: 2.2, shrink: true,
    });
  }
}

/** Slow grey puffs that climb and swell: engine smoke, burnout clouds, a wreck giving up. */
export function smoke(G, x, y, { count = 1, dark = false } = {}) {
  for (let i = 0; i < count; i += 1) {
    spawn(G, {
      x: x + G.rng.spread(5), y: y + G.rng.spread(5),
      vx: G.rng.spread(14), vy: -18 - G.rng() * 22,
      life: 0.9 + G.rng() * 0.7, maxLife: 1.4,
      size: 6 + G.rng() * 7, color: dark ? '70,68,66' : '196,192,186',
      gravity: -30, drag: 0.6, shrink: false, smoke: true,
    });
  }
}

/** The bright snap at a gun's muzzle, gone in a blink. */
export function muzzle(G, x, y, angle) {
  spawn(G, {
    x, y, vx: Math.cos(angle) * 40, vy: Math.sin(angle) * 40,
    life: 0.06, maxLife: 0.06, size: 9, color: '#ffe9a3', gravity: 0, drag: 0, shrink: true,
  });
  burst(G, x, y, { count: 3, color: '#ffb340', speed: 90, life: 0.16, size: 2 });
}

/** Mission-complete confetti, in the game's three neon colours. */
export function confetti(G, x, y) {
  const colors = ['#ff4fa3', '#37e0d8', '#ffd94d', '#ff7a4d'];
  for (let i = 0; i < 46; i += 1) {
    const a = -Math.PI / 2 + G.rng.spread(0.9);
    const v = 190 + G.rng() * 240;
    spawn(G, {
      x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
      life: 0.9 + G.rng() * 0.7, maxLife: 1.4,
      size: 3 + G.rng() * 3, color: colors[i % colors.length],
      gravity: 340, drag: 1.4, shrink: false,
    });
  }
}

/** Rising sparkles for magical pickups: neon shards, checkpoint flashes, small miracles. */
export function glitter(G, x, y, color = '#37e0d8') {
  for (let i = 0; i < 14; i += 1) {
    spawn(G, {
      x: x + G.rng.spread(13), y: y + G.rng.spread(10),
      vx: G.rng.spread(24), vy: -34 - G.rng() * 46,
      life: 0.55 + G.rng() * 0.4, maxLife: 0.9,
      size: 2 + G.rng() * 2.4, color, gravity: -60, drag: 0.8, shrink: true,
    });
  }
}

/** One frame of tyre rubber on the road; called per rear wheel while a car slides. */
export function addSkid(G, x, y, angle, strength) {
  if (G.fx.skids.length >= MAX_SKIDS) G.fx.skids.shift();
  G.fx.skids.push({ x, y, angle, strength: Math.min(1, strength), life: 14 });
}

/** A word that rises and fades: +$250, BUSTED warnings, fare tips. */
export function floatText(G, x, y, text, color = '#ffd94d') {
  if (G.fx.texts.length >= MAX_TEXTS) G.fx.texts.shift();
  G.fx.texts.push({ x, y, text, color, life: 1.5, maxLife: 1.5 });
}

export function addShake(G, amount) {
  G.fx.shake = Math.min(15, G.fx.shake + amount);
}

export function updateFx(G, dt) {
  const fx = G.fx;
  for (let i = fx.particles.length - 1; i >= 0; i -= 1) {
    const p = fx.particles[i];
    p.life -= dt;
    if (p.life <= 0) {
      fx.particles.splice(i, 1);
      continue;
    }
    const dragK = Math.max(0, 1 - p.drag * dt);
    p.vx *= dragK;
    p.vy = p.vy * dragK + p.gravity * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
  }
  for (let i = fx.skids.length - 1; i >= 0; i -= 1) {
    fx.skids[i].life -= dt;
    if (fx.skids[i].life <= 0) fx.skids.splice(i, 1);
  }
  for (let i = fx.texts.length - 1; i >= 0; i -= 1) {
    const t = fx.texts[i];
    t.life -= dt;
    t.y -= 34 * dt;
    if (t.life <= 0) fx.texts.splice(i, 1);
  }
  fx.shake = Math.max(0, fx.shake - dt * 26);
  fx.hurtFlash = Math.max(0, fx.hurtFlash - dt);
}

/** Rubber first: render calls this before the cars so the marks sit under the tyres. */
export function drawSkids(ctx, G) {
  const fx = G.fx;
  ctx.fillStyle = '#1d1d20';
  for (const s of fx.skids) {
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(s.angle);
    ctx.globalAlpha = Math.min(0.5, s.life / 6) * (0.35 + s.strength * 0.65);
    ctx.fillRect(-7, -2.4, 14, 4.8);
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

export function drawParticles(ctx, G) {
  for (const p of G.fx.particles) {
    const t = p.life / p.maxLife;
    if (p.smoke) {
      ctx.fillStyle = `rgba(${p.color},${(0.3 * t).toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (1.6 - t * 0.6), 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.globalAlpha = Math.min(1, t * 1.6);
      ctx.fillStyle = p.color;
      const s = p.shrink ? p.size * t + 0.6 : p.size;
      ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
    }
  }
  ctx.globalAlpha = 1;
}

export function drawTexts(ctx, G) {
  ctx.textAlign = 'center';
  ctx.font = '700 17px "Segoe UI", system-ui, sans-serif';
  for (const t of G.fx.texts) {
    const a = Math.min(1, t.life / (t.maxLife * 0.5));
    ctx.globalAlpha = a;
    ctx.fillStyle = 'rgba(10,10,14,0.65)';
    ctx.fillText(t.text, t.x + 1.5, t.y + 1.5);
    ctx.fillStyle = t.color;
    ctx.fillText(t.text, t.x, t.y);
  }
  ctx.globalAlpha = 1;
  ctx.textAlign = 'left';
}
