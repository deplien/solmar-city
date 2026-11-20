// A small seeded random number generator (mulberry32) with the handful of helpers the game
// keeps reaching for. The same seed always builds the same city and stages the same
// screenshot scene, which is what makes ?seed=N and the ?shot= scenes repeatable.

export function createRandom(seed) {
  let a = seed | 0;
  function random() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  /** A float in [min, max). */
  random.range = (min, max) => min + random() * (max - min);
  /** An integer in [min, max], both ends included. */
  random.int = (min, max) => min + Math.floor(random() * (max - min + 1));
  /** One element of a non-empty array. */
  random.pick = (list) => list[Math.floor(random() * list.length)];
  /** True with probability p. */
  random.chance = (p) => random() < p;
  /** -1 or 1, coin flip. */
  random.sign = () => (random() < 0.5 ? -1 : 1);
  /** A float in [-amount, amount], for jitter and scatter. */
  random.spread = (amount) => (random() * 2 - 1) * amount;
  /** A direction in radians, anywhere on the compass. */
  random.angle = () => random() * Math.PI * 2;
  /** A shuffled copy of a list (Fisher–Yates on this generator). */
  random.shuffle = (list) => {
    const out = [...list];
    for (let i = out.length - 1; i > 0; i -= 1) {
      const j = Math.floor(random() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  };
  return random;
}

/** Clamp a number into [min, max]. */
export function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

/** Linear interpolation between a and b by t in [0, 1]. */
export function lerp(a, b, t) {
  return a + (b - a) * t;
}

/** Shortest-arc interpolation between two angles, in radians. */
export function lerpAngle(a, b, t) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

/** Distance between two points. */
export function dist(x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return Math.sqrt(dx * dx + dy * dy);
}
