// Rocco Vale himself: walking the sidewalks, aiming with the mouse, throwing punches and —
// once he has picked one up — firing a pistol; climbing into any car in Solmar City and
// driving it with the same physics as everyone else. Getting hurt, getting held up by the
// law and getting wasted all start here or in the police module; this file owns the body.
// createPlayer(city) builds Rocco's state and updatePlayer(G, dt) steps it; hurtPlayer is
// how every other system — traffic, police, the world itself — deals him damage.
import { PLAYER } from './config.js';
import { clamp, dist } from './random.js';
import { collideCircle } from './city.js';
import { MODELS, stepCarPhysics } from './traffic.js';
import { knockPed, makePed } from './pedestrians.js';
import { addHeat, damageOfficer } from './police.js';
import { burst, muzzle, smoke, floatText, addShake } from './effects.js';

export function createPlayer(city) {
  const start = city.places.marisol;
  return {
    x: start.x, y: start.y + 46, angle: -Math.PI / 2,
    hp: PLAYER.maxHealth, armor: 0,
    weapon: 'fists', hasPistol: false, ammo: 0, reloading: 0,
    car: null, attackCd: 0, hurtT: 99, walkPhase: 0, speedNow: 0,
    dead: false,
  };
}

/** Damage with armour soaking its share first; reaching zero is WASTED. */
export function hurtPlayer(G, dmg) {
  const p = G.player;
  if (p.dead || G.pendingOver) return;
  p.hurtT = 0;
  const soaked = Math.min(p.armor, dmg * 0.65);
  p.armor -= soaked;
  p.hp -= dmg - soaked;
  G.fx.hurtFlash = 0.4;
  addShake(G, 2.2);
  if (p.hp <= 0) {
    p.hp = 0;
    p.dead = true;
    G.pendingOver = 'wasted';
  }
}

function nearestCar(G, maxD) {
  let best = null;
  let bestD = maxD;
  for (const car of G.cars) {
    if (car.wreck) continue;
    const d = dist(G.player.x, G.player.y, car.x, car.y);
    if (d < bestD) { bestD = d; best = car; }
  }
  return best;
}

function enterCar(G, car) {
  const p = G.player;
  G.audio.door();
  if (car.kind === 'traffic' && !car.parked) {
    // The driver bails out and runs: nobody gives up a moving car politely.
    const ped = makePed(G.rng, car.x + G.rng.spread(24), car.y + G.rng.spread(24));
    ped.state = 'flee';
    ped.timer = 2.6;
    ped.fleeFrom = { x: p.x, y: p.y };
    G.peds.push(ped);
  }
  const wasParked = car.parked;
  car.parked = false;
  car.ai = null;
  car.occupied = true;
  p.car = car;
  p.x = car.x;
  p.y = car.y;
  if (!car.stolen) {
    car.stolen = true;
    addHeat(G, wasParked ? 16 : 22, car.x, car.y);
    G.notify(`Stole a ${MODELS[car.model].label}`, '#ffb340');
    // One parked car in four still has its alarm armed: a short wail that draws eyes.
    if (wasParked && G.rng.chance(0.25)) {
      G.audio.alarm();
      addHeat(G, 6, car.x, car.y);
      floatText(G, car.x, car.y - 30, 'ALARM', '#ff5147');
    }
  }
  if (car.kind === 'police') addHeat(G, 26, car.x, car.y);
}

function exitCar(G) {
  const p = G.player;
  const car = p.car;
  if (!car) return;
  G.audio.door();
  G.audio.setEngine(null);
  car.occupied = false;
  // Step out on the left side, and out of the wall if the car is parked against one.
  const sideX = car.x + Math.cos(car.angle - Math.PI / 2) * (MODELS[car.model].wid / 2 + 16);
  const sideY = car.y + Math.sin(car.angle - Math.PI / 2) * (MODELS[car.model].wid / 2 + 16);
  const res = collideCircle(G.city, sideX, sideY, PLAYER.radius);
  p.x = res.x;
  p.y = res.y;
  p.car = null;
}

function punch(G) {
  const p = G.player;
  p.attackCd = PLAYER.punchCooldown;
  G.audio.punch();
  const reach = PLAYER.punchRange;
  const tx = p.x + Math.cos(p.angle) * reach * 0.7;
  const ty = p.y + Math.sin(p.angle) * reach * 0.7;
  let hit = false;
  for (const ped of G.peds) {
    if (ped.state === 'down' || ped.state === 'ride') continue;
    if (dist(tx, ty, ped.x, ped.y) < reach * 0.62) {
      knockPed(G, ped, 13);
      hit = true;
    }
  }
  for (const cop of G.officers) {
    if (cop.state !== 'down' && dist(tx, ty, cop.x, cop.y) < reach * 0.62) {
      damageOfficer(G, cop, PLAYER.punchDamage);
      burst(G, cop.x, cop.y, { count: 5, color: '#ffe9a3', speed: 90, life: 0.25, size: 2 });
      hit = true;
    }
  }
  for (const car of G.cars) {
    if (!car.wreck && dist(tx, ty, car.x, car.y) < reach * 0.8) {
      car.health -= 4;
      burst(G, tx, ty, { count: 4, color: '#ffd94d', speed: 80, life: 0.2, size: 2 });
      hit = true;
    }
  }
  if (hit) addShake(G, 1.2);
}

function shoot(G) {
  const p = G.player;
  if (p.ammo <= 0) {
    G.audio.dryFire();
    p.attackCd = 0.2;
    startReload(G);
    return;
  }
  p.ammo -= 1;
  p.attackCd = PLAYER.pistolCooldown;
  G.audio.shot();
  G.lastShot = { x: p.x, y: p.y, t: G.time };
  const gx = p.x + Math.cos(p.angle) * 20;
  const gy = p.y + Math.sin(p.angle) * 20;
  muzzle(G, gx, gy, p.angle);
  addHeat(G, 26, p.x, p.y);

  // Hitscan: the closest body or car within a narrow cone along the aim.
  let bestT = PLAYER.pistolRange;
  let victim = null;
  let victimKind = null;
  const consider = (obj, kind, radius) => {
    const dx = obj.x - p.x;
    const dy = obj.y - p.y;
    const d = Math.hypot(dx, dy);
    if (d > bestT || d < 8) return;
    let diff = Math.atan2(dy, dx) - p.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    if (Math.abs(diff) < Math.atan2(radius, d) + 0.02) {
      bestT = d;
      victim = obj;
      victimKind = kind;
    }
  };
  for (const ped of G.peds) if (ped.state !== 'down' && ped.state !== 'ride') consider(ped, 'ped', 13);
  for (const cop of G.officers) if (cop.state !== 'down') consider(cop, 'cop', 13);
  for (const car of G.cars) if (!car.wreck) consider(car, 'car', MODELS[car.model].len * 0.5);

  const hx = p.x + Math.cos(p.angle) * bestT;
  const hy = p.y + Math.sin(p.angle) * bestT;
  if (victimKind === 'ped') knockPed(G, victim, 10);
  else if (victimKind === 'cop') {
    damageOfficer(G, victim, PLAYER.pistolDamage);
    burst(G, hx, hy, { count: 5, color: '#ffe9a3', speed: 80, life: 0.22, size: 2 });
  } else if (victimKind === 'car') {
    victim.health -= 9;
    burst(G, hx, hy, { count: 5, color: '#ffd94d', speed: 90, life: 0.22, size: 2 });
    if (victim.health <= 0 && !victim.wreck) { victim.wreck = true; victim.health = 0; }
  } else {
    burst(G, hx, hy, { count: 2, color: '#cfd4d8', speed: 40, life: 0.18, size: 2 });
  }
  if (p.ammo === 0) startReload(G);
}

function startReload(G) {
  const p = G.player;
  if (p.reloading <= 0 && p.hasPistol) {
    p.reloading = 1.15;
    G.audio.reload();
  }
}

function collectPickups(G) {
  const p = G.player;
  for (let i = G.pickups.length - 1; i >= 0; i -= 1) {
    const pk = G.pickups[i];
    if (dist(p.x, p.y, pk.x, pk.y) > PLAYER.pickupRange + (p.car ? 14 : 0)) continue;
    if (pk.kind === 'cash') {
      G.cash += pk.amount;
      G.audio.cash();
      floatText(G, p.x, p.y - 24, `+$${pk.amount}`, '#58d977');
    } else if (pk.kind === 'pistol') {
      p.hasPistol = true;
      p.weapon = 'pistol';
      p.ammo = PLAYER.pistolMag;
      G.audio.pickup();
      G.notify('Picked up a pistol — click or F to fire, R to reload', '#37e0d8');
    } else if (pk.kind === 'armor') {
      p.armor = Math.min(PLAYER.maxArmor, p.armor + 50);
      G.audio.pickup();
      floatText(G, p.x, p.y - 24, '+ARMOR', '#57b6ff');
    } else if (pk.kind === 'health') {
      p.hp = Math.min(PLAYER.maxHealth, p.hp + 40);
      G.audio.pickup();
      floatText(G, p.x, p.y - 24, '+HEALTH', '#58d977');
    }
    G.pickups.splice(i, 1);
  }
}

export function updatePlayer(G, dt) {
  const p = G.player;
  const input = G.input;
  p.attackCd = Math.max(0, p.attackCd - dt);
  p.hurtT += dt;
  if (p.reloading > 0) {
    p.reloading -= dt;
    if (p.reloading <= 0) p.ammo = PLAYER.pistolMag;
  }
  // Out of the worst of it, Rocco catches his breath — up to half health, never more.
  if (p.hurtT > 8 && p.hp > 0 && p.hp < 50) p.hp = Math.min(50, p.hp + 3.5 * dt);

  if (p.car) {
    const car = p.car;
    const throttle = (input.isDown('KeyW') || input.isDown('ArrowUp') ? 1 : 0) + (input.isDown('KeyS') || input.isDown('ArrowDown') ? -1 : 0);
    const steer = (input.isDown('KeyA') || input.isDown('ArrowLeft') ? -1 : 0) + (input.isDown('KeyD') || input.isDown('ArrowRight') ? 1 : 0);
    const handbrake = input.isDown('Space');
    const impact = stepCarPhysics(G, car, dt, throttle, steer, handbrake);
    p.x = car.x;
    p.y = car.y;
    p.angle = car.angle;
    p.speedNow = Math.abs(car.speed);
    G.audio.setEngine(Math.min(1, Math.abs(car.speed) / MODELS[car.model].top));
    if (car.health < 32 && G.rng.chance(dt * 2.4)) smoke(G, car.x, car.y, { count: 1, dark: car.health < 14 });
    if (impact > 120) {
      const dmg = impact * 0.16;
      car.health -= dmg;
      G.audio.crash(clamp(impact / 320, 0.3, 1));
      addShake(G, clamp(impact / 38, 2, 9));
      burst(G, car.x, car.y, { count: Math.floor(impact / 22), color: '#ffd94d', speed: 150, life: 0.4, size: 2.5 });
      if (impact > 265) hurtPlayer(G, (impact - 265) * 0.05);
      if (car.health <= 0 && !car.wreck) {
        car.wreck = true;
        car.health = 0;
        burst(G, car.x, car.y, { count: 26, color: '#ff7a4d', speed: 190, life: 0.6, size: 3.5 });
        smoke(G, car.x, car.y, { count: 8, dark: true });
        hurtPlayer(G, 12);
        exitCar(G);
        G.notify('The car is wrecked', '#ff5147');
      }
    }
    if (input.wasPressed('KeyE') && Math.abs(car.speed) < 45 && p.car) exitCar(G);
    if (input.wasPressed('KeyH')) {
      G.audio.honk(car.model === 'van' || car.model === 'pickup' ? 0.7 : 1);
      // A horn in the ear sends the nearest pedestrians scattering.
      for (const ped of G.peds) {
        if ((ped.state === 'walk' || ped.state === 'chat') && dist(p.x, p.y, ped.x, ped.y) < 90) {
          ped.state = 'flee';
          ped.timer = 1.1;
          ped.fleeFrom = { x: p.x, y: p.y };
          ped.chatWith = null;
        }
      }
    }
    collectPickups(G);
    return;
  }

  // On foot.
  G.audio.setEngine(null);
  const axis = input.axis();
  const sprint = input.isDown('ShiftLeft') || input.isDown('ShiftRight');
  const speed = sprint ? PLAYER.sprintSpeed : PLAYER.walkSpeed;
  let mx = axis.x;
  let my = axis.y;
  const len = Math.hypot(mx, my);
  if (len > 0 && !G.dialogue) {
    mx /= len;
    my /= len;
    const res = collideCircle(G.city, p.x + mx * speed * dt, p.y + my * speed * dt, PLAYER.radius);
    p.x = res.x;
    p.y = res.y;
    p.walkPhase += dt * (sprint ? 13 : 10);
    p.speedNow = speed;
  } else {
    p.speedNow = 0;
  }

  // Aim at the mouse, in world space through the camera.
  const aimX = G.camera.x + input.mouse.x;
  const aimY = G.camera.y + input.mouse.y;
  p.angle = Math.atan2(aimY - p.y, aimX - p.x);

  if (!G.dialogue) {
    const wantsAttack = input.mouse.clicked || input.wasPressed('KeyF');
    if (wantsAttack && p.attackCd <= 0) {
      if (p.weapon === 'pistol' && p.hasPistol) shoot(G);
      else punch(G);
    }
    if (input.wasPressed('KeyR')) startReload(G);
    if (input.wasPressed('Digit1')) p.weapon = 'fists';
    if (input.wasPressed('Digit2') && p.hasPistol) p.weapon = 'pistol';
    if (input.wheel !== 0 && p.hasPistol) {
      p.weapon = p.weapon === 'pistol' ? 'fists' : 'pistol';
      G.audio.click();
    }
    if (input.wasPressed('KeyE')) {
      const car = nearestCar(G, PLAYER.enterRange);
      if (car) enterCar(G, car);
    }
  }
  collectPickups(G);
}
