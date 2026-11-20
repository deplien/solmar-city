// The people of Solmar City: they stroll the sidewalks in twos and threes, stop to chat on
// corners, run when a gun goes off or a car mounts the kerb, and — when knocked down, which
// the game keeps bloodless: they fall, fade, and turn up fine across town — drop a little of
// the cash they were carrying. One flagged pedestrian at a time is a taxi fare waiting.
// The crowd is built once by initPeds(G) and advanced by updatePeds(G, dt); knockPed is
// the single entry point for cars and fists alike.
import { clamp, dist } from './random.js';
import { collideCircle, sidewalkPoint } from './city.js';
import { addHeat } from './police.js';
import { floatText } from './effects.js';

const SHIRTS = ['#e86a92', '#37b8e0', '#ffd94d', '#7ac74f', '#f2f0e6', '#ff7a4d', '#8a5cff', '#4dd0c4'];
const PANTS = ['#33404f', '#5b4a3a', '#704214', '#2e4a5b', '#e6e0d0', '#3a3a44'];
const SKIN = ['#f2c79b', '#d9a066', '#a0663a', '#7a4a26', '#ffe0bd'];

export function makePed(rng, x, y) {
  return {
    x, y, angle: rng.range(0, Math.PI * 2),
    speed: 0, walkSpeed: rng.range(52, 86),
    state: 'walk', // 'walk' | 'chat' | 'flee' | 'down' | 'fare-wait' | 'ride'
    timer: rng.range(0, 3),
    target: null,
    shirt: rng.pick(SHIRTS), pants: rng.pick(PANTS), skin: rng.pick(SKIN),
    hair: rng.pick(['#2b2118', '#57432a', '#c9a86a', '#8a8a8a', '#1c1c22']),
    downT: 0, chatWith: null, fare: false, phase: rng.range(0, 6),
  };
}

export function initPeds(G) {
  const { rng, city } = G;
  for (let i = 0; i < 46; i += 1) {
    const p = sidewalkPoint(city, rng);
    const ped = makePed(rng, p.x, p.y);
    ped.target = sidewalkPoint(city, rng);
    G.peds.push(ped);
  }
  // A few pairs mid-conversation, for life.
  for (let i = 0; i + 1 < G.peds.length; i += 9) {
    const a = G.peds[i];
    const b = G.peds[i + 1];
    b.x = a.x + 26;
    b.y = a.y + 6;
    a.state = 'chat'; b.state = 'chat';
    a.timer = b.timer = G.rng.range(4, 9);
    a.chatWith = b; b.chatWith = a;
  }
}

/** Danger check: gunfire nearby, a fast car bearing down, or the police hunting close by. */
function feelsDanger(G, ped) {
  const shot = G.lastShot;
  if (shot && G.time - shot.t < 1.4 && dist(ped.x, ped.y, shot.x, shot.y) < 330) return shot;
  for (const car of G.cars) {
    if (car.wreck) continue;
    const s = Math.hypot(car.vx, car.vy);
    if (s > 150 && dist(ped.x, ped.y, car.x, car.y) < 110) return car;
  }
  return null;
}

/**
 * Knock a pedestrian down (non-graphically: a fall, a fade, a respawn across town) and spill
 * what they carried. Witnessed knocks are crimes, and the caller says how hot they are.
 */
export function knockPed(G, ped, heat) {
  if (ped.state === 'down' || ped.state === 'ride') return;
  ped.state = 'down';
  ped.downT = 0;
  ped.fare = false;
  const amount = G.rng.int(4, 22);
  G.pickups.push({ x: ped.x + G.rng.spread(10), y: ped.y + G.rng.spread(10), kind: 'cash', amount, t: 0 });
  if (heat > 0) addHeat(G, heat, ped.x, ped.y);
}

export function updatePeds(G, dt) {
  const { rng, city } = G;
  for (const ped of G.peds) {
    ped.phase += dt * (ped.state === 'walk' || ped.state === 'flee' ? 9 : 2);
    if (ped.state === 'down') {
      ped.downT += dt;
      if (ped.downT > 5) {
        // Up again, across town, no worse for it.
        const p = sidewalkPoint(city, rng);
        ped.x = p.x; ped.y = p.y;
        ped.state = 'walk';
        ped.downT = 0;
        ped.target = sidewalkPoint(city, rng);
      }
      continue;
    }
    if (ped.state === 'ride') continue; // In a taxi; the taxi job moves and removes them.

    const danger = feelsDanger(G, ped);
    if (danger && ped.state !== 'flee') {
      ped.state = 'flee';
      ped.timer = rng.range(1.6, 3.2);
      ped.fleeFrom = { x: danger.x, y: danger.y };
      if (rng.chance(0.4)) floatText(G, ped.x, ped.y - 20, '!', '#ff5147');
      if (ped.chatWith) { ped.chatWith.chatWith = null; ped.chatWith = null; }
    }

    let moveX = 0;
    let moveY = 0;
    let speed = 0;
    if (ped.state === 'flee') {
      ped.timer -= dt;
      const dx = ped.x - ped.fleeFrom.x;
      const dy = ped.y - ped.fleeFrom.y;
      const d = Math.hypot(dx, dy) || 1;
      moveX = dx / d; moveY = dy / d;
      speed = 238;
      if (ped.timer <= 0) { ped.state = 'walk'; ped.target = sidewalkPoint(city, rng); }
    } else if (ped.state === 'chat') {
      ped.timer -= dt;
      if (ped.chatWith) ped.angle = Math.atan2(ped.chatWith.y - ped.y, ped.chatWith.x - ped.x);
      if (ped.timer <= 0) {
        ped.state = 'walk';
        ped.target = sidewalkPoint(city, rng);
        if (ped.chatWith) { ped.chatWith.chatWith = null; ped.chatWith.state = 'walk'; ped.chatWith.target = sidewalkPoint(city, rng); ped.chatWith = null; }
      }
    } else if (ped.state === 'fare-wait') {
      // Stand at the kerb and wave at passing taxis.
      ped.angle += Math.sin(G.time * 2 + ped.phase) * dt * 0.4;
    } else {
      if (!ped.target || dist(ped.x, ped.y, ped.target.x, ped.target.y) < 18) {
        if (rng.chance(0.24)) {
          ped.state = 'chat';
          ped.timer = rng.range(2.5, 6);
          ped.chatWith = null;
          continue;
        }
        ped.target = sidewalkPoint(city, rng);
      }
      const dx = ped.target.x - ped.x;
      const dy = ped.target.y - ped.y;
      const d = Math.hypot(dx, dy) || 1;
      moveX = dx / d; moveY = dy / d;
      speed = ped.walkSpeed;
    }

    if (speed > 0) {
      ped.angle = Math.atan2(moveY, moveX);
      const res = collideCircle(city, ped.x + moveX * speed * dt, ped.y + moveY * speed * dt, 11);
      ped.x = res.x;
      ped.y = res.y;
      if (res.hit && ped.state === 'walk') ped.target = sidewalkPoint(city, rng);
      ped.speed = speed;
    } else {
      ped.speed = 0;
    }
  }
}
