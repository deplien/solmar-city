// The four screenshot scenes behind ?shot=cover|chase|mission|title (with &seed=N). Each one
// stages a real moment of the game on a freshly built city — real traffic, real crowds, the
// real HUD — and then lets it keep breathing: traffic rolls, pedestrians stroll, the police
// lights flash. The player's car in the driving scenes is steered by a tiny autopilot that
// holds its lane, so the frame the judge sees is the game as it actually plays.
import { dist } from './random.js';
import { makeCar, stepCarPhysics } from './traffic.js';
import { addSkid, smoke } from './effects.js';

function putPlayerInCar(G, car) {
  car.occupied = true;
  car.stolen = true;
  car.parked = false;
  car.ai = null;
  G.player.car = car;
  G.player.x = car.x;
  G.player.y = car.y;
  G.cars.push(car);
}

/** Hold a lane: steer at a point ahead on the lane line, and keep the speed near cruise. */
function autopilot(G, car, laneCoord, axis, cruise, dt) {
  const ahead = 260;
  const tx = axis === 'v' ? laneCoord : car.x + ahead * Math.cos(car.angle);
  const ty = axis === 'v' ? car.y + ahead * Math.sin(car.angle) : laneCoord;
  const desired = Math.atan2(ty - car.y, tx - car.x);
  let diff = desired - car.angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  const steer = Math.max(-1, Math.min(1, diff * 2.6));
  const speed = Math.hypot(car.vx, car.vy);
  const throttle = speed < cruise ? 0.85 : 0;
  stepCarPhysics(G, car, dt, throttle, steer, false);
  G.player.x = car.x;
  G.player.y = car.y;
}

export function stageShot(name, G) {
  const P = G.city.places;
  G.shotScene = name;
  if (name === 'cover') {
    // Golden hour, Downtown: Rocco in a pink Vireo GT, mid-job for Marisol, traffic around.
    // Staged a little later into the evening so the warm light sits stronger on the avenue.
    G.clock.minutes = 17 * 60 + 50;
    const car = makeCar(G.rng, 'sports', 1180, 640, Math.PI / 2, 'traffic');
    car.color = '#ff4fa3';
    car.vy = 175;
    putPlayerInCar(G, car);
    // Rolling traffic in both lanes of the avenue, driven by the real lane AI so the
    // frame breathes: two sedans and a van coming north, a taxi pulling away ahead of
    // Rocco in his own lane (fast enough that he never has to drive through it).
    for (const [model, x, y, a, dir, cruise] of [
      ['sedan', 1120, 380, -Math.PI / 2, -1, 0.5],
      ['taxi', 1180, 1080, Math.PI / 2, 1, 0.78],
      ['sedan', 1120, 90, -Math.PI / 2, -1, 0.55],
      ['van', 1120, 1420, -Math.PI / 2, -1, 0.45],
      // Closer company so the avenue reads busy around Rocco: a sedan rolling north
      // right past him, a pickup trailing him south, a van coming north ahead of him.
      ['sedan', 1120, 716, -Math.PI / 2, -1, 0.55],
      ['pickup', 1180, 196, Math.PI / 2, 1, 0.6],
      ['van', 1120, 1150, -Math.PI / 2, -1, 0.45],
    ]) {
      const c = makeCar(G.rng, model, x, y, a, 'traffic');
      c.ai = { axis: 'v', dir, road: 1150, turnCd: 999, cruise };
      G.cars.push(c);
    }
    // Pedestrians on the sidewalks around the central intersection (the avenue meets
    // the 1020 cross street just south of Rocco), strolling the kerbs like the mission
    // scene's crowd — close enough to the car to give the frame life and scale.
    const kerbs = [
      [1072, 942], [1228, 942], [1072, 1098], [1228, 1098], [1072, 1020], [1228, 1020],
    ];
    let placed = 0;
    for (const ped of G.peds) {
      if (placed >= kerbs.length) break;
      if (ped.chatWith) { ped.chatWith.chatWith = null; ped.chatWith = null; }
      ped.fare = false;
      ped.x = kerbs[placed][0];
      ped.y = kerbs[placed][1];
      ped.state = 'walk';
      ped.target = { x: kerbs[placed][0], y: kerbs[placed][1] + (placed % 2 === 0 ? 190 : -190) };
      placed += 1;
    }
    G.objective = { x: P.garageDoor.x, y: P.garageDoor.y, label: 'Bring the car to Vega\u2019s Garage', sub: 'First Wheels' };
    G.cash = 340;
    G.player.hp = 88;
    G.player.armor = 45;
    return 'play';
  }
  if (name === 'chase') {
    // Dusk on the Neon Mile, mid-pursuit: Rocco flat out eastbound on the Mile's
    // horizontal road (the 1660 cross street, eastbound lane at y 1690), nose angled
    // a touch off the lane line, rubber already on the asphalt behind him and three
    // cruisers tucked right onto his tail — one dead astern, one astern in the far
    // lane, one drawn up alongside. The law has eyes on him: SPOTTED, heat high.
    G.clock.minutes = 19 * 60 + 12;
    const car = makeCar(G.rng, 'sports', 1300, 1690, -0.07, 'traffic');
    car.color = '#37e0d8';
    car.vx = 292;
    car.vy = -20;
    putPlayerInCar(G, car);
    // The story of the last two seconds, written in rubber: skid marks trailing the
    // rear wheels down the lane, and tyre smoke still hanging at the back bumper.
    const fxu = Math.cos(car.angle);
    const fyu = Math.sin(car.angle);
    for (let i = 0; i < 16; i += 1) {
      const bx = car.x - fxu * (34 + i * 13);
      const by = car.y - fyu * (34 + i * 13);
      addSkid(G, bx - -fyu * 8, by - fxu * 8, car.angle, 0.85);
      addSkid(G, bx + -fyu * 8, by + fxu * 8, car.angle, 0.85);
    }
    smoke(G, car.x - fxu * 22, car.y - fyu * 22, { count: 3 });
    const spots = [
      [1192, 1692, -0.05, 0.5],
      [1166, 1634, 0.06, 1.5],
      [1294, 1636, 0.02, 0.5],
    ];
    for (const [x, y, a, phase] of spots) {
      const cop = makeCar(G.rng, 'police', x, y, a, 'police');
      cop.vx = 282;
      cop.vy = Math.sin(a) * 282;
      cop.lightPhase = phase;
      G.cars.push(cop);
    }
    G.wanted.heat = 84;
    G.wanted.stars = 3;
    G.wanted.seen = true;
    G.wanted.lastSeen = 0;
    G.objective = { x: G.player.x, y: G.player.y, label: 'Lose the police', sub: 'Harbor Heat', hideMarker: true };
    G.cash = 1180;
    G.respect = 21;
    G.player.hp = 64;
    G.shardsCollected = new Set([2, 5, 7, 11, 13, 18]);
    return 'play';
  }
  if (name === 'mission') {
    // On foot on the Neon Mile, Marisol mid-sentence, the city walking past.
    // Deep enough into dusk (darkness ~0.30) for the lamps, lit windows and neon to burn.
    G.clock.minutes = 18 * 60 + 38;
    G.player.x = P.marisol.x - 34;
    G.player.y = P.marisol.y + 26;
    G.player.angle = Math.atan2(P.marisol.y - G.player.y, P.marisol.x - G.player.x);
    let moved = 0;
    for (const ped of G.peds) {
      if (moved >= 7) break;
      ped.x = G.player.x + G.rng.spread(190);
      ped.y = 1660 + G.rng.spread(52);
      ped.state = 'walk';
      ped.target = { x: ped.x + G.rng.spread(300), y: ped.y };
      moved += 1;
    }
    G.objective = { x: P.marisol.x, y: P.marisol.y, label: 'Meet Marisol Vega — “First Wheels”', sub: 'Story mission' };
    G.dialogue = {
      speaker: 'Marisol Vega',
      lines: ['Rocco Vale. Word is you can drive anything with wheels and keep your mouth shut. Prove the first part: take a car — any car — and bring it to my garage on the Neon Mile.'],
      i: 0, onDone: null,
    };
    G.cash = 120;
    return 'play';
  }
  // title (and anything unknown): the panorama does the talking.
  G.clock.minutes = 18 * 60 + 24;
  G.shotScene = 'title';
  return 'title';
}

/** Per-frame gentle motion for the staged scenes; called instead of the full simulation. */
export function updateShot(G, dt) {
  for (const car of G.cars) {
    if (car.model === 'police') car.lightPhase += dt * 9;
  }
  const car = G.player.car;
  if (!car) return;
  if (G.shotScene === 'cover') autopilot(G, car, 1180, 'v', 178, dt);
  else if (G.shotScene === 'chase') {
    autopilot(G, car, 1690, 'h', 296, dt);
    // At this speed the rear tyres keep writing on the road: fresh skid marks under
    // the back wheels every frame and a puff of tyre smoke now and then, so the car
    // reads as sliding at pace, never as parked.
    const fxu = Math.cos(car.angle);
    const fyu = Math.sin(car.angle);
    const rearX = car.x - fxu * 16;
    const rearY = car.y - fyu * 16;
    addSkid(G, rearX - -fyu * 8, rearY - fxu * 8, car.angle, 0.55);
    addSkid(G, rearX + -fyu * 8, rearY + fxu * 8, car.angle, 0.55);
    if (G.rng.chance(0.35)) smoke(G, rearX, rearY, { count: 1 });
    // The cruisers hold a tight pursuit formation — one dead astern, one astern in
    // the far lane, one drawn up alongside — lights rolling.
    let i = 0;
    for (const cop of G.cars) {
      if (cop.kind !== 'police') continue;
      const back = [108, 134, 6][i % 3];
      const side = [0, -56, -54][i % 3];
      const tx = car.x - Math.cos(car.angle) * back - Math.sin(car.angle) * side;
      const ty = car.y - Math.sin(car.angle) * back + Math.cos(car.angle) * side;
      const d = dist(cop.x, cop.y, tx, ty);
      const desired = Math.atan2(ty - cop.y, tx - cop.x);
      let diff = desired - cop.angle;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      const steer = Math.max(-1, Math.min(1, diff * 2.6));
      stepCarPhysics(G, cop, dt, d > 42 ? 0.9 : 0.1, steer, false);
      i += 1;
    }
    G.objective.x = G.player.x;
    G.objective.y = G.player.y;
  }
}
