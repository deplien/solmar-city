// The story of Neon Tide, and the work around it. Marisol Vega, fixer of the Neon Mile,
// hires Rocco Vale for five jobs that climb from stealing a first car to a street race
// against Dario Kaine himself; between jobs the city pays for taxi fares, courier runs and
// the twenty neon shards hidden on its sidewalks. Missions are small state machines: each
// has phases, each phase an objective the HUD and minimap can point at, and finishing one
// pays cash and respect and saves the game.
import { dist, clamp } from './random.js';
import { addHeat, starsForHeat } from './police.js';
import { cruiseCar, makeCar, stepCarPhysics, MODELS } from './traffic.js';
import { confetti, floatText, glitter } from './effects.js';
import { saveGame } from './save.js';

export const MISSION_NAMES = ['First Wheels', 'Hot Package', 'Tail Trouble', 'Harbor Heat', 'Neon Tide'];

export function createMissionState() {
  return { index: 0, active: false, phase: 'idle', data: {}, storyDone: false };
}

export function showDialogue(G, speaker, lines, onDone) {
  G.dialogue = { speaker, lines, i: 0, onDone: onDone || null };
  G.audio.phone();
}

export function advanceDialogue(G) {
  const d = G.dialogue;
  if (!d) return;
  G.audio.click();
  d.i += 1;
  if (d.i >= d.lines.length) {
    G.dialogue = null;
    if (d.onDone) d.onDone(G);
  }
}

function setObjective(G, x, y, label, sub) {
  G.objective = { x, y, label, sub: sub || '' };
}

function completeMission(G, reward, respect) {
  const m = G.mission;
  const name = MISSION_NAMES[m.index];
  G.cash += reward;
  G.respect += respect;
  m.index += 1;
  m.active = false;
  m.phase = 'idle';
  m.data = {};
  G.objective = null;
  G.splash = { title: 'MISSION COMPLETE', sub: `${name}  ·  +$${reward}  ·  +${respect} respect`, t: 3.4 };
  G.notify(OUTRO_LINES[Math.min(OUTRO_LINES.length - 1, m.index - 1)] || OUTRO_LINES[0], '#ff4fa3');
  confetti(G, G.player.x, G.player.y - 10);
  G.audio.jingle();
  G.audio.cash();
  if (m.index >= MISSION_NAMES.length) {
    m.storyDone = true;
    G.pendingEnding = true;
  }
  saveGame(G);
}

export function failMission(G, why) {
  const m = G.mission;
  if (!m.active) return;
  if (m.data.targetCar) m.data.targetCar = null;
  if (m.data.darioCar) m.data.darioCar = null;
  m.active = false;
  m.phase = 'idle';
  m.data = {};
  G.objective = null;
  G.notify(`Mission failed — ${why}. Marisol will call again`, '#ff5147');
  G.audio.fail();
}

function startMission(G, idx) {
  const m = G.mission;
  const P = G.city.places;
  m.active = true;
  m.data = {};
  if (idx === 0) {
    m.phase = 'getcar';
    showDialogue(G, 'Marisol Vega', [
      'Rocco Vale. Word is you can drive anything with wheels and keep your mouth shut.',
      'Prove the first part. Take a car — any car — and bring it to my garage on the Neon Mile.',
      'Try not to collect the whole police force on the way. I pay for cars, not bail.',
    ]);
  } else if (idx === 1) {
    m.phase = 'pickup';
    showDialogue(G, 'Marisol Vega', [
      'A package is sitting in the harbor yard, and the Kaine Family would love it back.',
      'Pick it up and take it to my friend in Old Town. The clock starts when you touch it.',
    ]);
  } else if (idx === 2) {
    m.phase = 'tail';
    const car = makeCar(G.rng, 'sports', 3100, 1660, 0, 'mission');
    car.color = '#26262e';
    car.cruiseInit = false;
    G.cars.push(car);
    m.data.targetCar = car;
    m.data.tailTime = 0;
    m.data.spotted = 0;
    showDialogue(G, 'Marisol Vega', [
      'That black Vireo cruising the Mile belongs to a Kaine courier. Follow it.',
      'Stay close enough to watch, far enough not to be made — then put a scare into it.',
    ]);
  } else if (idx === 3) {
    m.phase = 'grab';
    showDialogue(G, 'Marisol Vega', [
      'One container in the harbor holds the Kaine Family\u2019s whole week of cash.',
      'Take it. The yard will light up like the Fourth of July — lose the police after.',
    ]);
  } else if (idx === 4) {
    m.phase = 'tostart';
    showDialogue(G, 'Marisol Vega', [
      'Dario Kaine says no wheelman in Solmar can touch him. Tonight he puts money on it.',
      'Meet him at the beach road start line. Beat him to the Old Town finish — then come home.',
    ]);
  }
}

const DROP_OLDTOWN = { x: 2900, y: 1096 };
/** The race route, exported so the renderer can paint the checkpoint rings in the world. */
export const RACE_CHECKPOINTS = [
  { x: 1880, y: 2760 }, { x: 1880, y: 1660 }, { x: 3340, y: 1660 }, { x: 3340, y: 1020 },
];

const OUTRO_LINES = [
  'Marisol: "Clean work, Rocco. Come by the garage."',
  'Marisol: "Paid in full. You are making a name out there."',
  'Marisol: "The Kaine Family sends its regards. I send cash."',
  'Marisol: "Half the harbor saw that and nobody will say a word."',
  'Marisol: "Solmar is yours tonight, wheelman."',
];
const DARIO_WAYPOINTS = [
  { x: 1880, y: 2790 }, { x: 1850, y: 1660 }, { x: 3340, y: 1690 }, { x: 3310, y: 1020 },
];

function driveToPoint(G, car, tx, ty, dt, speedCap) {
  const desired = Math.atan2(ty - car.y, tx - car.x);
  let diff = desired - car.angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  const steer = clamp(diff * 2.6, -1, 1);
  let throttle = 1;
  if (Math.abs(car.speed) > speedCap) throttle = 0;
  if (Math.abs(diff) > 2.4 && Math.abs(car.speed) > 150) throttle = -0.5;
  stepCarPhysics(G, car, dt, throttle, steer, Math.abs(diff) > 1.8 && Math.abs(car.speed) > 130);
}

export function updateMissions(G, dt) {
  const m = G.mission;
  const P = G.city.places;
  const p = G.player;
  if (G.dialogue) return;

  if (!m.active) {
    if (m.index < MISSION_NAMES.length && !m.storyDone) {
      setObjective(G, P.marisol.x, P.marisol.y, `Meet Marisol Vega — “${MISSION_NAMES[m.index]}”`, 'Story mission');
      if (dist(p.x, p.y, P.marisol.x, P.marisol.y) < 58 && !p.car) startMission(G, m.index);
    }
    return;
  }

  if (m.index === 0) {
    if (m.phase === 'getcar') {
      setObjective(G, P.garageDoor.x, P.garageDoor.y, 'Steal any car', 'First Wheels');
      if (p.car) m.phase = 'drive';
    } else if (m.phase === 'drive') {
      setObjective(G, P.garageDoor.x, P.garageDoor.y, 'Bring the car to Vega\u2019s Garage', 'First Wheels');
      if (p.car && dist(p.x, p.y, P.garageDoor.x, P.garageDoor.y) < 95) completeMission(G, 250, 5);
      else if (!p.car) m.phase = 'getcar';
    }
  } else if (m.index === 1) {
    if (m.phase === 'pickup') {
      setObjective(G, P.harborPickup.x, P.harborPickup.y, 'Pick up the package at the harbor', 'Hot Package');
      if (dist(p.x, p.y, P.harborPickup.x, P.harborPickup.y) < 74) {
        m.phase = 'deliver';
        m.data.timer = 150;
        G.audio.pickup();
        G.notify('Package on board — the clock is running', '#ffd94d');
      }
    } else if (m.phase === 'deliver') {
      m.data.timer -= dt;
      setObjective(G, DROP_OLDTOWN.x, DROP_OLDTOWN.y, `Deliver the package — ${Math.max(0, Math.ceil(m.data.timer))}s`, 'Hot Package');
      if (m.data.timer <= 0) {
        m.phase = 'pickup';
        G.notify('Too slow — the buyer walked. Fetch another package', '#ff5147');
        G.audio.fail();
      } else if (dist(p.x, p.y, DROP_OLDTOWN.x, DROP_OLDTOWN.y) < 74) {
        completeMission(G, 400, 6);
      }
    }
  } else if (m.index === 2) {
    const target = m.data.targetCar;
    if (!target || target.wreck || !G.cars.includes(target)) {
      if (m.phase === 'tail' || m.phase === 'scare') failMission(G, 'the courier got away');
    } else if (m.phase === 'tail') {
      cruiseCar(G, target, dt, 0.5);
      const d = dist(p.x, p.y, target.x, target.y);
      setObjective(G, target.x, target.y, `Tail the Kaine courier — ${Math.floor(m.data.tailTime)} / 40s`, d < 95 ? 'TOO CLOSE' : d > 430 ? 'LOSING HIM' : 'Tail Trouble');
      if (d < 95) {
        m.data.spotted += dt;
        if (m.data.spotted > 1.2) {
          cruiseCar(G, target, dt, 1);
          failMission(G, 'you were made');
          return;
        }
      } else {
        m.data.spotted = Math.max(0, m.data.spotted - dt * 0.7);
        if (d < 430) m.data.tailTime += dt;
      }
      if (m.data.tailTime >= 40) {
        m.phase = 'scare';
        m.data.hits = 0;
        m.data.hitCd = 0;
        G.notify('Now scare him off — ram his car 3 times', '#ffd94d');
      }
    } else if (m.phase === 'scare') {
      cruiseCar(G, target, dt, 0.62);
      m.data.hitCd -= dt;
      setObjective(G, target.x, target.y, `Ram the courier — ${m.data.hits} / 3`, 'Tail Trouble');
      if (p.car && dist(p.x, p.y, target.x, target.y) < 52 && Math.abs(p.car.speed) > 55 && m.data.hitCd <= 0) {
        m.data.hits += 1;
        m.data.hitCd = 0.9;
        target.health -= 16;
        G.audio.crash(0.6);
        floatText(G, target.x, target.y - 26, 'RAMMED', '#ffb340');
      }
      if (m.data.hits >= 3) {
        m.phase = 'flee';
        m.data.fleeT = 5;
        G.notify('He\u2019s running scared — job done', '#58d977');
      }
    } else if (m.phase === 'flee') {
      cruiseCar(G, target, dt, 0.98);
      m.data.fleeT -= dt;
      if (m.data.fleeT <= 0) {
        const i = G.cars.indexOf(target);
        if (i >= 0) G.cars.splice(i, 1);
        completeMission(G, 500, 8);
      }
    }
  } else if (m.index === 3) {
    if (m.phase === 'grab') {
      setObjective(G, P.containerCash.x, P.containerCash.y, 'Grab the container cash at the harbor', 'Harbor Heat');
      if (dist(p.x, p.y, P.containerCash.x, P.containerCash.y) < 74) {
        m.phase = 'escape';
        G.wanted.heat = Math.max(G.wanted.heat, 3 * 22 + 2);
        G.audio.pickup();
        G.notify('Cash grabbed — every cop in Solmar is awake', '#ff5147');
      }
    } else if (m.phase === 'escape') {
      setObjective(G, p.x, p.y, 'Lose the police', 'Harbor Heat');
      G.objective.hideMarker = true;
      if (starsForHeat(G.wanted.heat) === 0) completeMission(G, 750, 10);
    }
  } else if (m.index === 4) {
    if (m.phase === 'tostart') {
      setObjective(G, P.raceStart.x, P.raceStart.y, 'Reach the start line on the beach road', 'Neon Tide');
      if (p.car && dist(p.x, p.y, P.raceStart.x, P.raceStart.y) < 90) {
        m.phase = 'race';
        m.data.cp = 0;
        m.data.darioCp = 0;
        const dario = makeCar(G.rng, 'sports', P.raceStart.x + 6, P.raceStart.y + 44, 0, 'mission');
        dario.color = '#c22f4d';
        G.cars.push(dario);
        m.data.darioCar = dario;
        G.notify('GO — beat Dario Kaine to Old Town', '#58d977');
        G.audio.jingle();
      }
    } else if (m.phase === 'race') {
      const dario = m.data.darioCar;
      if (dario && G.cars.includes(dario)) {
        const wp = DARIO_WAYPOINTS[Math.min(m.data.darioCp, DARIO_WAYPOINTS.length - 1)];
        driveToPoint(G, dario, wp.x, wp.y, dt, MODELS.sports.top * 0.8);
        if (dist(dario.x, dario.y, wp.x, wp.y) < 95 && m.data.darioCp < DARIO_WAYPOINTS.length) m.data.darioCp += 1;
      }
      const cp = RACE_CHECKPOINTS[m.data.cp];
      if (!cp) {
        // Player finished the checkpoints.
        if (dario && m.data.darioCp >= DARIO_WAYPOINTS.length) {
          failMission(G, 'Dario reached the finish first');
          return;
        }
        m.phase = 'getaway';
        G.wanted.heat = Math.max(G.wanted.heat, 2 * 22 + 2);
        G.notify('You beat Dario — now get home to the garage', '#ffd94d');
      } else {
        setObjective(G, cp.x, cp.y, `Checkpoint ${m.data.cp + 1} of 4 — ${dario && m.data.darioCp > m.data.cp ? 'Dario is ahead!' : 'you lead'}`, 'Neon Tide — the race');
        if (!p.car) G.objective.sub = 'Get back in a car!';
        if (dist(p.x, p.y, cp.x, cp.y) < 115) {
          m.data.cp += 1;
          G.audio.pickup();
          floatText(G, p.x, p.y - 30, `CHECKPOINT ${m.data.cp}/4`, '#37e0d8');
        }
        if (dario && m.data.darioCp >= DARIO_WAYPOINTS.length && m.data.cp < RACE_CHECKPOINTS.length) {
          failMission(G, 'Dario reached the finish first');
          return;
        }
      }
    } else if (m.phase === 'getaway') {
      setObjective(G, P.garageDoor.x, P.garageDoor.y, 'Get back to Vega\u2019s Garage', 'Neon Tide');
      if (dist(p.x, p.y, P.garageDoor.x, P.garageDoor.y) < 95) completeMission(G, 1500, 20);
    }
  }
}

// ---------------------------------------------------------------------------
// Side income: taxi fares, courier runs, and the twenty neon shards.

export function initSideJobs(G) {
  G.taxi = { farePed: null, dest: null, phase: 'idle', startDist: 0 };
  G.courier = null;
  G.courierT = 25;
}

export function updateSideJobs(G, dt) {
  const p = G.player;

  // Neon shards: a whisper of light on a sidewalk, $25 and a point of respect each.
  for (const spot of G.city.shardSpots) {
    if (G.shardsCollected.has(spot.id)) continue;
    if (dist(p.x, p.y, spot.x, spot.y) < 36) {
      G.shardsCollected.add(spot.id);
      G.cash += 25;
      G.respect += 1;
      G.audio.shard();
      glitter(G, spot.x, spot.y);
      floatText(G, spot.x, spot.y - 22, `NEON SHARD ${G.shardsCollected.size}/20  +$25`, '#37e0d8');
      saveGame(G);
    }
  }

  // Taxi fares.
  const taxi = G.taxi;
  if (taxi.phase === 'idle') {
    if (p.car && p.car.model === 'taxi' && !taxi.farePed) {
      let best = null;
      let bestD = 640;
      for (const ped of G.peds) {
        if (ped.state !== 'walk' && ped.state !== 'chat') continue;
        const d = dist(p.x, p.y, ped.x, ped.y);
        if (d < bestD) { bestD = d; best = ped; }
      }
      if (best) {
        best.state = 'fare-wait';
        best.fare = true;
        taxi.farePed = best;
        taxi.phase = 'wait';
        G.notify('A fare is hailing you — stop beside them', '#ffd94d');
      }
    }
  } else if (taxi.phase === 'wait' || taxi.farePed) {
    const ped = taxi.farePed;
    if (ped && taxi.phase === 'wait' && !G.mission.active) {
      setObjective(G, ped.x, ped.y, 'Taxi fare — stop beside your passenger', 'Side job');
    }
    if (!ped) { taxi.phase = 'idle'; }
    else if (ped.state === 'down') {
      // Knocked down while hailing: the fare is off.
      ped.fare = false;
      taxi.farePed = null;
      taxi.phase = 'idle';
    }
    else if (!p.car || p.car.model !== 'taxi') {
      // Out of the cab: the fare gives up and walks off.
      ped.state = 'walk';
      ped.fare = false;
      taxi.farePed = null;
      taxi.dest = null;
      taxi.phase = 'idle';
    } else if (taxi.phase !== 'ride' && dist(p.x, p.y, ped.x, ped.y) < 52 && Math.abs(p.car.speed) < 22) {
      ped.state = 'ride';
      taxi.phase = 'ride';
      const dests = G.city.parkings;
      const dest = dests.length ? dests[G.rng.int(0, dests.length - 1)] : { x: 2100, y: 1600 };
      taxi.dest = { x: dest.x + dest.w / 2, y: dest.y + dest.h / 2 };
      taxi.startDist = dist(p.x, p.y, taxi.dest.x, taxi.dest.y);
      G.audio.pickup();
      G.notify('Fare aboard — follow the orange marker', '#ffb340');
    }
  }
  if (taxi.phase === 'ride' && taxi.dest) {
    if (!G.mission.active) setObjective(G, taxi.dest.x, taxi.dest.y, 'Taxi fare — drop your passenger', 'Side job');
    if (p.car && dist(p.x, p.y, taxi.dest.x, taxi.dest.y) < 72 && Math.abs(p.car.speed) < 26) {
      const fare = Math.round(26 + taxi.startDist / 16);
      G.cash += fare;
      G.audio.cash();
      floatText(G, p.x, p.y - 26, `FARE +$${fare}`, '#ffd94d');
      const ped = taxi.farePed;
      if (ped) {
        ped.state = 'walk';
        ped.fare = false;
        ped.x = taxi.dest.x + 18;
        ped.y = taxi.dest.y + 10;
        ped.target = null;
      }
      taxi.farePed = null;
      taxi.dest = null;
      taxi.phase = 'idle';
    }
  }

  // Courier runs appear on their own clock.
  if (!G.courier) {
    G.courierT -= dt;
    if (G.courierT <= 0 && G.city.parkings.length > 1) {
      const from = G.city.parkings[G.rng.int(0, G.city.parkings.length - 1)];
      G.courier = { x: from.x + from.w / 2, y: from.y + from.h / 2, phase: 'pickup', timer: 0, dest: null };
      G.courierT = G.rng.range(50, 80);
      G.notify('Courier job posted — follow the cyan marker', '#37e0d8');
    }
  } else {
    const c = G.courier;
    if (c.phase === 'pickup') {
      if (!G.mission.active && !taxi.dest) setObjective(G, c.x, c.y, 'Courier — pick up the parcel', 'Side job');
      if (dist(p.x, p.y, c.x, c.y) < 62) {
        const to = G.city.parkings[G.rng.int(0, G.city.parkings.length - 1)];
        c.dest = { x: to.x + to.w / 2, y: to.y + to.h / 2 };
        c.phase = 'dropoff';
        c.timer = 120;
        G.audio.pickup();
        G.notify('Parcel aboard — 120 seconds', '#37e0d8');
      }
    } else {
      c.timer -= dt;
      if (!G.mission.active && !taxi.dest) setObjective(G, c.dest.x, c.dest.y, `Courier — deliver it — ${Math.max(0, Math.ceil(c.timer))}s`, 'Side job');
      if (c.timer <= 0) {
        G.courier = null;
        G.notify('Courier job expired', '#ff5147');
      } else if (dist(p.x, p.y, c.dest.x, c.dest.y) < 62) {
        const pay = G.rng.int(90, 160);
        G.cash += pay;
        G.audio.cash();
        floatText(G, p.x, p.y - 26, `COURIER +$${pay}`, '#37e0d8');
        G.courier = null;
      }
    }
  }
}
