// Traffic: the cars that fill Solmar City, parked along its kerbs and rolling through its
// avenues, plus the arcade physics every car in the game shares — the player's stolen ride
// and the police cruisers run through the same stepCarPhysics, so a chase feels fair.
// Civilian drivers follow lanes, keep right, slow for whatever is ahead of them, turn at
// intersections, and honk when the player blocks the road for too long. Car bodies come
// from makeCar over the MODELS table, and collideCars is shared by traffic, the player
// and the police, so every bump in the city resolves the same way.
import { ROAD_W, LANE_OFF } from './config.js';
import { clamp } from './random.js';
import { collideCircle, roadPointNear } from './city.js';
import { addSkid, burst, smoke } from './effects.js';

export const MODELS = {
  sedan: { label: 'Solmar Sedan', len: 46, wid: 22, top: 262, accel: 155, grip: 4.2, colors: ['#c0c6ce', '#7a8899', '#a63d40', '#3f6d4e', '#44586e', '#d8d3c3'] },
  taxi: { label: 'Solmar Taxi', len: 46, wid: 22, top: 250, accel: 150, grip: 4.2, colors: ['#f7b731', '#f5a623'] },
  sports: { label: 'Vireo GT', len: 48, wid: 23, top: 388, accel: 265, grip: 5.2, colors: ['#ff4fa3', '#37e0d8', '#ffd94d', '#ff5a3c', '#8a5cff'] },
  pickup: { label: 'Bravo Pickup', len: 53, wid: 25, top: 232, accel: 140, grip: 3.8, colors: ['#b08968', '#5b7553', '#707880', '#7a4a3a'] },
  van: { label: 'Cargo Van', len: 57, wid: 26, top: 214, accel: 128, grip: 3.6, colors: ['#e8e6df', '#9fb4c7', '#c7b299'] },
  police: { label: 'SPD Interceptor', len: 49, wid: 23, top: 336, accel: 235, grip: 5.0, colors: ['#eef1f4'] },
};

const TRAFFIC_MIX = ['sedan', 'sedan', 'sedan', 'taxi', 'sedan', 'pickup', 'van', 'sports', 'sedan', 'pickup'];

export function makeCar(rng, modelName, x, y, angle, kind) {
  const model = MODELS[modelName];
  return {
    x, y, angle, vx: 0, vy: 0, speed: 0,
    model: modelName, color: rng.pick(model.colors),
    kind, // 'traffic' | 'parked' | 'police' | 'mission'
    parked: kind === 'parked',
    health: 100,
    wreck: false,
    ai: null,
    honkT: rng.range(0, 2),
    blockT: 0,
    smokeT: 0,
    lightPhase: rng.range(0, 6),
    occupied: false,
  };
}

/**
 * One physics step for any car. throttle is -1..1, steer -1..1, handbrake a boolean.
 * Velocity is split into forward and sideways parts; the sideways part is eaten by grip
 * (barely, with the handbrake down), which is what makes drifts drift. Returns the impact
 * speed of any crash this step, so callers can price the damage and the noise.
 */
export function stepCarPhysics(G, car, dt, throttle, steer, handbrake) {
  const m = MODELS[car.model];
  const fx = Math.cos(car.angle);
  const fy = Math.sin(car.angle);
  const rx = -fy;
  const ry = fx;
  let vf = car.vx * fx + car.vy * fy;
  let vr = car.vx * rx + car.vy * ry;

  if (throttle > 0) vf += m.accel * throttle * dt * (1 - Math.max(0, vf) / (m.top * 1.25));
  else if (throttle < 0) vf += (vf > 4 ? -m.accel * 2.1 : m.accel * throttle * 0.55) * dt;
  // Rolling resistance and air: a car with no input rolls to a stop.
  vf -= vf * 0.32 * dt;
  if (throttle === 0) vf -= Math.sign(vf) * Math.min(Math.abs(vf), 95 * dt);
  vf = clamp(vf, -95, m.top);
  const gripRate = handbrake ? 0.7 : m.grip;
  vr *= Math.exp(-gripRate * dt);

  const turnAuthority = clamp(vf / 130, -1, 1);
  car.angle += steer * turnAuthority * (handbrake ? 3.1 : 2.15) * dt;

  const nfx = Math.cos(car.angle);
  const nfy = Math.sin(car.angle);
  car.vx = nfx * vf + -nfy * vr;
  car.vy = nfy * vf + nfx * vr;
  car.speed = vf;

  const prevVx = car.vx;
  const prevVy = car.vy;
  car.x += car.vx * dt;
  car.y += car.vy * dt;

  // Tyre smoke and rubber while the car slides or spins its wheels.
  const rearX = car.x - nfx * m.len * 0.32;
  const rearY = car.y - nfy * m.len * 0.32;
  const sliding = Math.abs(vr) > 52 || (handbrake && Math.abs(vf) > 55);
  if (sliding) {
    addSkid(G, rearX - -nfy * 8, rearY - nfx * 8, car.angle, Math.min(1, Math.abs(vr) / 130));
    addSkid(G, rearX + -nfy * 8, rearY + nfx * 8, car.angle, Math.min(1, Math.abs(vr) / 130));
    if (G.rng.chance(0.35)) smoke(G, rearX, rearY, { count: 1 });
  } else if (throttle > 0.85 && Math.abs(vf) < 42 && !car.parked) {
    if (G.rng.chance(0.3)) smoke(G, rearX, rearY, { count: 1 });
  }

  // Buildings are unforgiving: stop dead against them and report how hard.
  const res = collideCircle(G.city, car.x, car.y, m.len * 0.42);
  let impact = 0;
  if (res.hit) {
    impact = Math.hypot(prevVx, prevVy);
    car.x = res.x;
    car.y = res.y;
    car.vx *= -0.18;
    car.vy *= -0.18;
    car.speed *= -0.18;
  }
  return impact;
}

/** Bump two cars apart and split the damage; returns the closing speed for effects. */
export function collideCars(G, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const d = Math.hypot(dx, dy) || 1;
  const minD = (MODELS[a.model].len + MODELS[b.model].len) * 0.36;
  if (d >= minD) return 0;
  const push = (minD - d) / 2;
  const nx = dx / d;
  const ny = dy / d;
  if (!a.parked) { a.x -= nx * push; a.y -= ny * push; }
  if (!b.parked) { b.x += nx * push; b.y += ny * push; }
  const closing = Math.abs((a.vx - b.vx) * nx + (a.vy - b.vy) * ny);
  const swap = (a.vx * nx + a.vy * ny);
  a.vx -= nx * swap * 0.7;
  a.vy -= ny * swap * 0.7;
  b.vx += nx * swap * 0.7;
  b.vy += ny * swap * 0.7;
  return closing;
}

function laneAngle(ai) {
  // Headings: on a vertical road dir +1 drives south (down), -1 north; horizontal +1 east.
  if (ai.axis === 'v') return ai.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
  return ai.dir > 0 ? 0 : Math.PI;
}

function lanePos(city, ai) {
  // Right-hand traffic: the lane sits LANE_OFF to the driver's right of the centre line.
  if (ai.axis === 'v') return { x: ai.road + ai.dir * LANE_OFF, y: 0 };
  return { x: 0, y: ai.road + ai.dir * LANE_OFF };
}

function newAI(rng, city, x, y) {
  const vertical = rng.chance(0.5);
  const road = vertical ? city.roadsV.reduce((b, r) => (Math.abs(r - x) < Math.abs(b - x) ? r : b), city.roadsV[0])
    : city.roadsH.reduce((b, r) => (Math.abs(r - y) < Math.abs(b - y) ? r : b), city.roadsH[0]);
  return { axis: vertical ? 'v' : 'h', dir: rng.sign(), road, turnCd: rng.range(1, 4), cruise: rng.range(0.42, 0.62) };
}

export function initTraffic(G) {
  const { rng, city } = G;
  // Parked cars fill the parking plots first, then the kerbs.
  for (const lot of city.parkings) {
    const n = rng.int(2, 5);
    for (let i = 0; i < n; i += 1) {
      const px = lot.x + 20 + (i % 3) * ((lot.w - 30) / 3);
      const py = lot.y + 22 + Math.floor(i / 3) * 40;
      if (px < lot.x + lot.w - 16 && py < lot.y + lot.h - 10) {
        G.cars.push(makeCar(rng, rng.pick(TRAFFIC_MIX), px, py, rng.chance(0.5) ? Math.PI / 2 : 0, 'parked'));
      }
    }
  }
  for (let i = 0; i < 42; i += 1) {
    const vertical = rng.chance(0.5);
    const road = vertical ? rng.pick(city.roadsV) : rng.pick(city.roadsH);
    const along = rng.range(90, (vertical ? 2800 : 4000));
    const side = rng.sign();
    const x = vertical ? road + side * (ROAD_W / 2 - 17) : along;
    const y = vertical ? along : road + side * (ROAD_W / 2 - 17);
    if (city.obstacles.some((o) => x > o.x - 26 && x < o.x + o.w + 26 && y > o.y - 26 && y < o.y + o.h + 26)) continue;
    const angle = vertical ? (side > 0 ? Math.PI / 2 : -Math.PI / 2) : (side > 0 ? 0 : Math.PI);
    G.cars.push(makeCar(rng, rng.pick(TRAFFIC_MIX), x, y, angle, 'parked'));
  }
  // And the rolling traffic.
  for (let i = 0; i < 24; i += 1) {
    const p = roadPointNear(city, rng, 2100, 1600, 0, 2400);
    const car = makeCar(rng, rng.pick(TRAFFIC_MIX), p.x, p.y, 0, 'traffic');
    car.ai = newAI(rng, city, p.x, p.y);
    const lp = lanePos(city, car.ai);
    if (car.ai.axis === 'v') car.x = lp.x; else car.y = lp.y;
    car.angle = laneAngle(car.ai);
    G.cars.push(car);
  }
}

/**
 * Drive one car along the lane network at a cruise ratio of its top speed, without the
 * traffic bookkeeping (no respawning, no honking): the missions use it for the Kaine
 * courier Rocco has to tail and scare. Returns the impact speed of any crash this step.
 */
export function cruiseCar(G, car, dt, cruiseRatio) {
  if (!car.ai) car.ai = newAI(G.rng, G.city, car.x, car.y);
  const ai = car.ai;
  ai.turnCd -= dt;
  const crossRoads = ai.axis === 'v' ? G.city.roadsH : G.city.roadsV;
  const along = ai.axis === 'v' ? car.y : car.x;
  for (const cr of crossRoads) {
    if (Math.abs(along - cr) < 26 && ai.turnCd <= 0 && G.rng.chance(0.35)) {
      ai.axis = ai.axis === 'v' ? 'h' : 'v';
      ai.road = cr;
      ai.dir = G.rng.sign();
      ai.turnCd = G.rng.range(2.5, 6);
      break;
    }
  }
  const lp = lanePos(G.city, ai);
  const lateral = ai.axis === 'v' ? lp.x - car.x : lp.y - car.y;
  const targetAngle = laneAngle(ai) + clamp(lateral * 0.012, -0.5, 0.5);
  let diff = targetAngle - car.angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  const steer = clamp(diff * 2.4, -1, 1);
  const blocker = blockedAhead(G, car, 74);
  let throttle = cruiseRatio;
  if (blocker) throttle = car.speed > 30 ? -0.7 : 0;
  return stepCarPhysics(G, car, dt, throttle, steer, false);
}

function blockedAhead(G, car, lookDist) {
  const fx = Math.cos(car.angle);
  const fy = Math.sin(car.angle);
  const ax = car.x + fx * lookDist;
  const ay = car.y + fy * lookDist;
  for (const other of G.cars) {
    if (other === car || other.wreck) continue;
    const d = Math.hypot(other.x - ax, other.y - ay);
    if (d < 40) return other;
  }
  for (const ped of G.peds) {
    if (ped.state === 'down') continue;
    if (Math.hypot(ped.x - ax, ped.y - ay) < 30) return ped;
  }
  if (G.player.car !== car && Math.hypot(G.player.x - ax, G.player.y - ay) < 30) return G.player;
  return null;
}

export function updateTraffic(G, dt) {
  const { rng, city } = G;
  const px = G.player.x;
  const py = G.player.y;
  for (const car of G.cars) {
    if (car.kind !== 'traffic' || car.wreck || car.occupied) continue;
    const ai = car.ai;
    if (!ai) continue;
    const dPlayer = Math.hypot(car.x - px, car.y - py);
    if (dPlayer > 1650) {
      // Too far to matter: quietly re-enter the city nearer the player.
      const p = roadPointNear(city, rng, px, py, 760, 1080);
      car.x = p.x;
      car.y = p.y;
      car.ai = newAI(rng, city, p.x, p.y);
      const lp = lanePos(city, car.ai);
      if (car.ai.axis === 'v') car.x = lp.x; else car.y = lp.y;
      car.angle = laneAngle(car.ai);
      car.vx = 0; car.vy = 0;
      continue;
    }
    if (car.health < 30 && rng.chance(dt * 0.7)) smoke(G, car.x, car.y, { count: 1, dark: car.health < 12 });

    // Turning: near a crossing, sometimes take it.
    ai.turnCd -= dt;
    const crossRoads = ai.axis === 'v' ? city.roadsH : city.roadsV;
    const along = ai.axis === 'v' ? car.y : car.x;
    for (const cr of crossRoads) {
      if (Math.abs(along - cr) < 26 && ai.turnCd <= 0 && rng.chance(0.4)) {
        ai.axis = ai.axis === 'v' ? 'h' : 'v';
        ai.road = cr;
        ai.dir = rng.sign();
        ai.turnCd = rng.range(2.5, 6);
        break;
      }
    }

    // Steer back to the lane line and along it.
    const lp = lanePos(city, ai);
    const lateral = ai.axis === 'v' ? lp.x - car.x : lp.y - car.y;
    const targetAngle = laneAngle(ai) + clamp(lateral * 0.012, -0.5, 0.5);
    let diff = targetAngle - car.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const steer = clamp(diff * 2.4, -1, 1);

    const blocker = blockedAhead(G, car, 74);
    let throttle = ai.cruise;
    if (blocker) {
      throttle = car.speed > 30 ? -0.7 : 0;
      car.blockT += dt;
      if (car.blockT > 1.4 && car.honkT <= 0) {
        G.audio.honk(rng.range(0.85, 1.2));
        car.honkT = rng.range(2, 5);
        car.blockT = 0.6;
      }
    } else {
      car.blockT = 0;
    }
    car.honkT -= dt;
    const impact = stepCarPhysics(G, car, dt, throttle, steer, false);
    if (impact > 130) {
      car.health -= impact * 0.12;
      burst(G, car.x, car.y, { count: 8, color: '#ffd94d', speed: 120, life: 0.4, size: 2.5 });
      G.audio.crash(0.5);
      if (car.health <= 0) { car.wreck = true; car.health = 0; }
    }
  }
}
