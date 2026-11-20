// The Solmar PD: a wanted system of heat and stars, cruisers that hunt in packs sized by
// your stars, and — from three stars — officers on foot who will shoot. Heat only sticks
// when someone sees the crime: a witness (a nearby pedestrian, an officer, a cruiser with
// line of sight) makes it count in full, otherwise it is rumour and worth a fraction. Lose
// every pair of eyes for a few seconds and the heat drains away; get held nearly still by
// an officer while it lasts and you are BUSTED. Other systems report crime through
// addHeat(G, amount, x, y) and read the result back as stars via starsForHeat; clearHeat
// is reserved for the bust and wasted resets.
import { WANTED } from './config.js';
import { clamp, dist } from './random.js';
import { lineOfSight, roadPointNear, collideCircle } from './city.js';
import { makeCar, stepCarPhysics } from './traffic.js';
import { hurtPlayer } from './player.js';
import { burst, floatText } from './effects.js';

export function starsForHeat(heat) {
  if (heat <= 0) return 0;
  return Math.min(5, Math.ceil(heat / WANTED.perStar));
}

function witnessed(G, x, y) {
  for (const cop of G.officers) {
    if (dist(x, y, cop.x, cop.y) < 430 && lineOfSight(G.city, x, y, cop.x, cop.y)) return true;
  }
  for (const car of G.cars) {
    if (car.kind === 'police' && dist(x, y, car.x, car.y) < 470 && lineOfSight(G.city, x, y, car.x, car.y)) return true;
  }
  for (const ped of G.peds) {
    if (ped.state !== 'down' && dist(x, y, ped.x, ped.y) < 235 && lineOfSight(G.city, x, y, ped.x, ped.y)) return true;
  }
  return false;
}

/** Register a crime at (x, y): full heat when witnessed, a whisper of it otherwise. */
export function addHeat(G, amount, x, y) {
  const seen = witnessed(G, x, y);
  const before = starsForHeat(G.wanted.heat);
  G.wanted.heat = clamp(G.wanted.heat + (seen ? amount : amount * 0.3), 0, WANTED.maxHeat);
  const after = starsForHeat(G.wanted.heat);
  if (after > before) {
    G.notify(`WANTED — ${after} star${after > 1 ? 's' : ''}`, '#ff5147');
    G.audio.fail();
    floatText(G, G.player.x, G.player.y - 30, '★'.repeat(after), '#ff5147');
  }
}

export function clearHeat(G) {
  G.wanted.heat = 0;
  G.wanted.bustTimer = 0;
}

const CRUISERS_BY_STAR = [0, 2, 3, 4, 5, 6];

export function createOfficer(G, x, y) {
  return {
    x, y, angle: 0, hp: 60, state: 'chase', shootT: G.rng.range(0.5, 1.4),
    strafeDir: G.rng.sign(), strafeT: G.rng.range(1, 2.4), downT: 0, phase: G.rng.range(0, 6),
  };
}

export function damageOfficer(G, cop, dmg) {
  cop.hp -= dmg;
  if (cop.hp <= 0 && cop.state !== 'down') {
    cop.state = 'down';
    cop.downT = 0;
    addHeat(G, 20, cop.x, cop.y);
    if (G.rng.chance(0.45)) G.pickups.push({ x: cop.x, y: cop.y, kind: 'pistol', amount: 0, t: 0 });
  }
}

function spawnCruiser(G) {
  // At five stars the PD stops arriving politely from behind: half the pack rolls in
  // ahead of the player, where he is going, not where he has been.
  const ahead = G.wanted.stars >= 5 && G.rng.chance(0.5);
  const px = ahead && G.player.car ? G.player.x + G.player.car.vx * 2.4 : G.player.x;
  const py = ahead && G.player.car ? G.player.y + G.player.car.vy * 2.4 : G.player.y;
  const p = roadPointNear(G.city, G.rng, px, py, ahead ? 420 : 580, ahead ? 640 : 860);
  const car = makeCar(G.rng, 'police', p.x, p.y, Math.atan2(G.player.y - p.y, G.player.x - p.x), 'police');
  G.cars.push(car);
  return car;
}

function updateCruiser(G, car, dt) {
  const player = G.player;
  const targetX = player.x + (player.car ? player.car.vx * 0.45 : 0);
  const targetY = player.y + (player.car ? player.car.vy * 0.45 : 0);
  const d = dist(car.x, car.y, targetX, targetY);
  const desired = Math.atan2(targetY - car.y, targetX - car.x);
  let diff = desired - car.angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  const steer = clamp(diff * 2.6, -1, 1);
  let throttle = 1;
  if (!player.car && d < 95) throttle = d < 55 ? -0.4 : 0.15; // Pull up beside a runner, don't mow him down.
  else if (player.car && d < 52) throttle = 0.55;
  const handbrake = Math.abs(diff) > 1.9 && Math.abs(car.speed) > 120;
  const impact = stepCarPhysics(G, car, dt, throttle, steer, handbrake);
  if (impact > 150) {
    car.health -= impact * 0.1;
    burst(G, car.x, car.y, { count: 7, color: '#ffd94d', speed: 110, life: 0.35, size: 2.5 });
    if (car.health <= 0) { car.wreck = true; car.health = 0; }
  }
  car.lightPhase += dt * 9;
}

function updateOfficer(G, cop, dt) {
  const player = G.player;
  cop.phase += dt * 9;
  if (cop.state === 'down') {
    cop.downT += dt;
    return;
  }
  const d = dist(cop.x, cop.y, player.x, player.y);
  const seen = d < 430 && lineOfSight(G.city, cop.x, cop.y, player.x, player.y);
  let mx = 0;
  let my = 0;
  if (d > 205 || !seen) {
    const a = Math.atan2(player.y - cop.y, player.x - cop.x);
    mx = Math.cos(a); my = Math.sin(a);
    cop.angle = a;
  } else {
    // In range: hold, strafe slowly, and shoot on a cadence that distance makes honest.
    cop.angle = Math.atan2(player.y - cop.y, player.x - cop.x);
    cop.strafeT -= dt;
    if (cop.strafeT <= 0) { cop.strafeDir = G.rng.sign(); cop.strafeT = G.rng.range(0.8, 2); }
    mx = -Math.sin(cop.angle) * cop.strafeDir * 0.4;
    my = Math.cos(cop.angle) * cop.strafeDir * 0.4;
    cop.shootT -= dt;
    if (cop.shootT <= 0 && seen) {
      cop.shootT = G.rng.range(0.85, 1.5);
      G.audio.shot();
      G.lastShot = { x: cop.x, y: cop.y, t: G.time };
      const hitChance = clamp(0.52 - d / 900, 0.14, 0.5) * (player.car ? 0.8 : 1);
      if (G.rng.chance(hitChance)) hurtPlayer(G, G.rng.range(5, 11));
      else burst(G, player.x + G.rng.spread(26), player.y + G.rng.spread(26), { count: 3, color: '#ffe9a3', speed: 60, life: 0.2, size: 2 });
    }
  }
  if (mx !== 0 || my !== 0) {
    const sp = d > 205 || !seen ? 208 : 60;
    // Officers go around buildings like everyone else: the shared circle collision.
    const res = collideCircle(G.city, cop.x + mx * sp * dt, cop.y + my * sp * dt, 11);
    cop.x = res.x;
    cop.y = res.y;
  }
}

export function updatePolice(G, dt) {
  const w = G.wanted;
  const stars = starsForHeat(w.heat);
  w.stars = stars;

  // Who can see the player right now?
  let seen = false;
  for (const car of G.cars) {
    if (car.kind === 'police' && !car.wreck && dist(car.x, car.y, G.player.x, G.player.y) < 540
      && lineOfSight(G.city, car.x, car.y, G.player.x, G.player.y)) { seen = true; break; }
  }
  if (!seen) {
    for (const cop of G.officers) {
      if (cop.state !== 'down' && dist(cop.x, cop.y, G.player.x, G.player.y) < 400
        && lineOfSight(G.city, cop.x, cop.y, G.player.x, G.player.y)) { seen = true; break; }
    }
  }
  w.seen = seen;
  if (seen) w.lastSeen = 0;
  else {
    w.lastSeen += dt;
    if (stars > 0 && w.lastSeen > WANTED.hideSeconds) {
      w.heat = Math.max(0, w.heat - WANTED.drainPerSecond * dt);
      if (w.heat === 0) G.notify('You lost the heat', '#58d977');
    }
  }

  // Cruisers: keep the pack at the size the stars demand.
  const cruisers = G.cars.filter((c) => c.kind === 'police');
  const wantedCount = CRUISERS_BY_STAR[stars];
  if (cruisers.length < wantedCount) {
    w.spawnT -= dt;
    if (w.spawnT <= 0) { spawnCruiser(G); w.spawnT = stars >= 4 ? 0.85 : 1.6; }
  }
  for (let i = G.cars.length - 1; i >= 0; i -= 1) {
    const car = G.cars[i];
    if (car.kind !== 'police') continue;
    const d = dist(car.x, car.y, G.player.x, G.player.y);
    if ((stars === 0 && d > 620) || d > 1750) {
      G.cars.splice(i, 1);
      continue;
    }
    if (!car.wreck && !car.occupied) updateCruiser(G, car, dt);
  }

  // Foot officers from three stars.
  const wantedCops = stars >= 3 ? Math.min(3, stars - 1) : 0;
  const activeCops = G.officers.filter((c) => c.state !== 'down');
  if (activeCops.length < wantedCops) {
    w.copT -= dt;
    if (w.copT <= 0) {
      const near = cruisers.find((c) => dist(c.x, c.y, G.player.x, G.player.y) < 560);
      const p = near ? { x: near.x + G.rng.spread(30), y: near.y + G.rng.spread(30) }
        : roadPointNear(G.city, G.rng, G.player.x, G.player.y, 360, 520);
      G.officers.push(createOfficer(G, p.x, p.y));
      w.copT = 2.2;
    }
  }
  for (let i = G.officers.length - 1; i >= 0; i -= 1) {
    const cop = G.officers[i];
    updateOfficer(G, cop, dt);
    const d = dist(cop.x, cop.y, G.player.x, G.player.y);
    if ((cop.state === 'down' && cop.downT > 4) || d > 1500 || (stars === 0 && d > 500)) G.officers.splice(i, 1);
  }

  // The bust: held nearly still, close to an officer or a cruiser's door, for too long.
  const playerSpeed = G.player.car ? Math.abs(G.player.car.speed) : G.player.speedNow;
  let held = false;
  if (stars > 0 && playerSpeed < 30) {
    for (const cop of G.officers) {
      if (cop.state !== 'down' && dist(cop.x, cop.y, G.player.x, G.player.y) < WANTED.bustRange) { held = true; break; }
    }
    if (!held) {
      for (const car of G.cars) {
        if (car.kind === 'police' && dist(car.x, car.y, G.player.x, G.player.y) < 64) { held = true; break; }
      }
    }
  }
  w.bustTimer = held ? w.bustTimer + dt : Math.max(0, w.bustTimer - dt * 2);
  if (w.bustTimer >= WANTED.bustSeconds && !G.pendingOver) {
    G.pendingOver = 'busted';
  }

  // Siren loudness follows the nearest cruiser.
  let nearest = Infinity;
  for (const car of G.cars) {
    if (car.kind === 'police' && !car.wreck) nearest = Math.min(nearest, dist(car.x, car.y, G.player.x, G.player.y));
  }
  G.audio.setSiren(nearest === Infinity ? null : clamp(0.13 - nearest / 9000, 0, 0.13));
}
