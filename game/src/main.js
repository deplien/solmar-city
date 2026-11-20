// Neon Tide: Solmar City — boot and the one loop. A game state is assembled from the
// modules (city, traffic, crowds, police, missions), then the loop advances it in fixed
// 1/60 s steps and paints it: title, help, play, pause, the BUSTED / WASTED cards and the
// ending are screens over the same living city. ?seed=N fixes the city; ?shot=<scene>
// stages one of the deterministic screenshot scenes from shots.js instead of the menu.
// This is the only module that wires the others together — the systems themselves stay
// ignorant of each other and meet only in the shared state object G.
import { STEP, WORLD, DAY_START_MINUTES, MINUTES_PER_SECOND, PLAYER } from './config.js';
import { createRandom, clamp, dist } from './random.js';
import { createCity } from './city.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { createFx, updateFx, burst } from './effects.js';
import { initTraffic, updateTraffic, makeCar, collideCars, MODELS } from './traffic.js';
import { initPeds, updatePeds, knockPed } from './pedestrians.js';
import { createPlayer, updatePlayer, hurtPlayer } from './player.js';
import { updatePolice, clearHeat, addHeat } from './police.js';
import { createMissionState, updateMissions, initSideJobs, updateSideJobs, advanceDialogue, failMission } from './missions.js';
import { drawScene, drawTitleScreen, drawPauseScreen, drawHelpScreen, drawOverScreen, drawEndingScreen } from './render.js';
import { drawHUD } from './hud.js';
import { saveGame, loadSaveData, applySave, clearSave } from './save.js';
import { stageShot, updateShot } from './shots.js';

const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const bootSeed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const ctx = canvas.getContext('2d');
const input = createInput(canvas);
const audio = createAudio();
window.addEventListener('keydown', () => audio.ensure());
window.addEventListener('pointerdown', () => audio.ensure());

function createGame(seed) {
  const rng = createRandom(seed);
  const city = createCity(rng);
  const G = {
    rng, city, time: 0,
    clock: { minutes: DAY_START_MINUTES, day: 1 },
    camera: { x: 0, y: 0 },
    view: { w: window.innerWidth, h: window.innerHeight },
    cars: [], peds: [], officers: [], pickups: [],
    player: null,
    wanted: { heat: 0, stars: 0, lastSeen: 0, seen: false, bustTimer: 0, spawnT: 0, copT: 0 },
    mission: createMissionState(),
    shardsCollected: new Set(),
    cash: 120, respect: 0,
    fx: createFx(), audio, input,
    dialogue: null, objective: null, toasts: [], splash: null,
    screen: 'title', menu: { items: [], sel: 0 },
    pendingOver: null, overKind: null, overT: 0, pendingEnding: false,
    lastShot: null, prompt: null, shotScene: null,
    carHitCd: 0,
    notify(text, color = '#f4f1e8') {
      G.toasts.push({ text, color, t: 3.6 });
      if (G.toasts.length > 4) G.toasts.shift();
    },
  };
  G.player = createPlayer(city);
  initTraffic(G);
  initPeds(G);
  initSideJobs(G);
  // The world keeps its promises: a pistol waits in an Old Town alley, armour at the PD,
  // and Marisol's own pink Vireo sits outside her garage for the taking.
  G.pickups.push({ x: city.places.pistol.x, y: city.places.pistol.y, kind: 'pistol', amount: 0, t: 0 });
  G.pickups.push({ x: city.places.armor.x, y: city.places.armor.y, kind: 'armor', amount: 0, t: 0 });
  G.pickups.push({ x: city.places.health.x, y: city.places.health.y, kind: 'health', amount: 0, t: 0 });
  const garageCar = makeCar(rng, 'sports', 2168, 1572, Math.PI, 'parked');
  garageCar.color = '#ff4fa3';
  G.cars.push(garageCar);
  return G;
}

let G = createGame(bootSeed);
let saveData = loadSaveData();

function announce(message) {
  status.textContent = message;
}

// ---------------------------------------------------------------------------
// Screens and menus.

function titleMenu() {
  G.menu.items = [
    { id: 'new', label: 'New Game' },
    { id: 'continue', label: 'Continue', disabled: !saveData },
    { id: 'help', label: 'How to Play' },
  ];
  G.menu.sel = saveData ? 1 : 0;
}

function pauseMenu() {
  G.menu.items = [
    { id: 'resume', label: 'Resume' },
    { id: 'help', label: 'How to Play' },
    { id: 'music', label: `Music: ${audio.musicOn ? 'On' : 'Off'}` },
    { id: 'sound', label: `Sound: ${audio.soundOn ? 'On' : 'Off'}` },
    { id: 'title', label: 'Save & Title' },
  ];
  G.menu.sel = 0;
}

function startPlay(continuing) {
  G = createGame(Math.floor(Math.random() * 4294967296));
  if (continuing && saveData) applySave(G, saveData);
  G.screen = 'play';
  announce(continuing ? 'Welcome back to Solmar City.' : 'Neon Tide. Find Marisol Vega on the Neon Mile.');
}

function menuConfirm() {
  const item = G.menu.items[G.menu.sel];
  if (!item || item.disabled) return;
  audio.ensure();
  audio.click();
  if (G.screen === 'title') {
    if (item.id === 'new') {
      clearSave();
      saveData = null;
      startPlay(false);
    } else if (item.id === 'continue') startPlay(true);
    else if (item.id === 'help') { G.helpReturn = 'title'; G.screen = 'help'; }
  } else if (G.screen === 'pause') {
    if (item.id === 'resume') G.screen = 'play';
    else if (item.id === 'help') { G.helpReturn = 'pause'; G.screen = 'help'; }
    else if (item.id === 'music') { audio.toggleMusic(); pauseMenu(); }
    else if (item.id === 'sound') { audio.toggleSound(); pauseMenu(); }
    else if (item.id === 'title') {
      saveGame(G);
      saveData = loadSaveData();
      G.screen = 'title';
      titleMenu();
    }
  }
}

function menuNav() {
  const items = G.menu.items;
  if (!items.length) return;
  if (input.wasPressed('ArrowDown') || input.wasPressed('KeyS')) {
    G.menu.sel = (G.menu.sel + 1) % items.length;
    audio.click();
  }
  if (input.wasPressed('ArrowUp') || input.wasPressed('KeyW')) {
    G.menu.sel = (G.menu.sel - 1 + items.length) % items.length;
    audio.click();
  }
  if (input.wasPressed('Enter') || input.mouse.clicked) menuConfirm();
}

// ---------------------------------------------------------------------------
// Consequences: collisions between cars, cars meeting people, and the law's endings.

function collisionPass() {
  const p = G.player;
  // The player's car against the world of other cars.
  if (p.car) {
    for (const other of G.cars) {
      if (other === p.car) continue;
      if (Math.abs(other.x - p.car.x) > 90 || Math.abs(other.y - p.car.y) > 90) continue;
      const closing = collideCars(G, p.car, other);
      if (closing > 85) {
        other.health -= closing * 0.12;
        if (other.health <= 0 && !other.wreck) { other.wreck = true; other.health = 0; }
        burst(G, (p.car.x + other.x) / 2, (p.car.y + other.y) / 2, { count: 8, color: '#ffd94d', speed: 130, life: 0.35, size: 2.5 });
        if (other.kind === 'police') addHeat(G, 17, p.x, p.y);
        else if (other.kind === 'traffic' || other.kind === 'parked') addHeat(G, 6, p.x, p.y);
      }
    }
  }
  // Cruisers shove traffic aside like everyone else.
  for (const cop of G.cars) {
    if (cop.kind !== 'police' || cop.wreck) continue;
    for (const other of G.cars) {
      if (other === cop || other === p.car) continue;
      if (Math.abs(other.x - cop.x) > 84 || Math.abs(other.y - cop.y) > 84) continue;
      collideCars(G, cop, other);
    }
  }
  // Cars meeting pedestrians, and meeting Rocco.
  for (const car of G.cars) {
    const speed = Math.hypot(car.vx, car.vy);
    if (speed < 62 || car.wreck) continue;
    for (const ped of G.peds) {
      if (ped.state === 'down' || ped.state === 'ride') continue;
      if (Math.abs(ped.x - car.x) > 40 || Math.abs(ped.y - car.y) > 40) continue;
      if (dist(ped.x, ped.y, car.x, car.y) < 27) knockPed(G, ped, car === p.car ? 26 : 0);
    }
    if (!p.car && G.carHitCd <= 0 && Math.abs(p.x - car.x) < 42 && Math.abs(p.y - car.y) < 42
      && dist(p.x, p.y, car.x, car.y) < 28) {
      hurtPlayer(G, 7 + speed * 0.03);
      const push = Math.atan2(p.y - car.y, p.x - car.x);
      p.x += Math.cos(push) * 22;
      p.y += Math.sin(push) * 22;
      G.carHitCd = 0.8;
      audio.crash(0.5);
      if (car.kind === 'police') addHeat(G, 8, p.x, p.y);
    }
  }
}

function respawn() {
  const p = G.player;
  const busted = G.overKind === 'busted';
  if (p.car) {
    p.car.occupied = false;
    p.car = null;
  }
  audio.setEngine(null);
  audio.setSiren(null);
  clearHeat(G);
  G.officers.length = 0;
  for (let i = G.cars.length - 1; i >= 0; i -= 1) {
    if (G.cars[i].kind === 'police') G.cars.splice(i, 1);
  }
  if (G.mission.active) failMission(G, busted ? 'the bust' : 'the hospital stay');
  if (busted) {
    G.cash = Math.max(0, G.cash - 150);
    p.x = G.city.places.policeDoor.x;
    p.y = G.city.places.policeDoor.y + 26;
  } else {
    G.cash -= Math.floor(G.cash * 0.1);
    p.x = G.city.places.hospitalDoor.x;
    p.y = G.city.places.hospitalDoor.y + 26;
  }
  p.hp = PLAYER.maxHealth;
  p.armor = 0;
  p.dead = false;
  G.pendingOver = null;
  G.screen = 'play';
  saveGame(G);
  saveData = loadSaveData();
  announce(busted ? 'Released from Solmar PD custody.' : 'Discharged from Solmar General.');
}

// ---------------------------------------------------------------------------
// One simulation step.

let lastDialogue = null;
let dialogueGuard = 0;
let lastDistrict = null;
let autosaveT = 20;

function stepPlay(dt) {
  G.time += dt;
  G.clock.minutes += MINUTES_PER_SECOND * dt;
  if (G.clock.minutes >= 1440) {
    G.clock.minutes -= 1440;
    G.clock.day += 1;
  }
  if (G.dialogue !== lastDialogue) {
    lastDialogue = G.dialogue;
    dialogueGuard = 0.35;
  }
  dialogueGuard -= dt;
  if (G.dialogue && dialogueGuard <= 0
    && (input.wasPressed('Enter') || input.wasPressed('Space') || input.mouse.clicked)) {
    advanceDialogue(G);
  }

  updatePlayer(G, dt);
  updateTraffic(G, dt);
  updatePeds(G, dt);
  updatePolice(G, dt);
  collisionPass();
  updateMissions(G, dt);
  updateSideJobs(G, dt);
  updateFx(G, dt);
  G.carHitCd = Math.max(0, G.carHitCd - dt);
  for (let i = G.toasts.length - 1; i >= 0; i -= 1) {
    G.toasts[i].t -= dt;
    if (G.toasts[i].t <= 0) G.toasts.splice(i, 1);
  }
  if (G.splash) {
    G.splash.t -= dt;
    if (G.splash.t <= 0) G.splash = null;
  }
  // The interaction prompt, refreshed from the world each step.
  if (!G.player.car && !G.dialogue) {
    let nearest = null;
    let nd = PLAYER.enterRange;
    for (const car of G.cars) {
      if (car.wreck) continue;
      const d = dist(G.player.x, G.player.y, car.x, car.y);
      if (d < nd) { nd = d; nearest = car; }
    }
    G.prompt = nearest ? `E — ${nearest.stolen ? 'Get in' : 'Steal'} the ${MODELS[nearest.model].label}` : null;
  } else if (G.player.car && Math.abs(G.player.car.speed) < 45) {
    G.prompt = 'E — Get out';
  } else {
    G.prompt = null;
  }
  // Camera: a soft follow on Rocco or his car.
  const tx = clamp(G.player.x - G.view.w / 2, 0, Math.max(0, WORLD.w - G.view.w));
  const ty = clamp(G.player.y - G.view.h / 2, 0, Math.max(0, WORLD.h - G.view.h));
  const k = 1 - Math.exp(-6.5 * dt);
  G.camera.x += (tx - G.camera.x) * k;
  G.camera.y += (ty - G.camera.y) * k;

  // Crossing into a new district is worth a quiet word, and the run autosaves as it goes.
  const district = G.city.districts.find((d) => G.player.x >= d.x && G.player.x < d.x + d.w && G.player.y >= d.y && G.player.y < d.y + d.h);
  const districtName = district ? district.name : null;
  if (districtName && lastDistrict && districtName !== lastDistrict) G.notify(districtName, '#37e0d8');
  if (districtName) lastDistrict = districtName;
  autosaveT -= dt;
  if (autosaveT <= 0) {
    autosaveT = 20;
    saveGame(G);
    saveData = loadSaveData();
  }

  if (G.pendingOver && G.screen === 'play') {
    G.overKind = G.pendingOver;
    G.overT = 2.8;
    G.screen = 'over';
    audio.setEngine(null);
    audio.setSiren(null);
    audio.fail();
    announce(G.overKind === 'busted' ? 'Busted.' : 'Wasted.');
  }
  if (G.pendingEnding) {
    G.pendingEnding = false;
    G.screen = 'ending';
    announce('Story complete. Solmar City is yours.');
  }
}

/** The city idles behind the title: traffic rolls, crowds stroll, the light changes. */
function stepAmbient(dt) {
  G.time += dt;
  G.clock.minutes += MINUTES_PER_SECOND * dt * 0.4;
  if (G.clock.minutes >= 1440) G.clock.minutes -= 1440;
  updateTraffic(G, dt);
  updatePeds(G, dt);
  updateFx(G, dt);
  const cx = 2050 + Math.sin(G.time * 0.06) * 460;
  const cy = 1380 + Math.cos(G.time * 0.045) * 300;
  G.camera.x = clamp(cx - G.view.w / 2, 0, Math.max(0, WORLD.w - G.view.w));
  G.camera.y = clamp(cy - G.view.h / 2, 0, Math.max(0, WORLD.h - G.view.h));
}

function draw() {
  drawScene(ctx, G);
  if (G.screen === 'play' || G.screen === 'pause') drawHUD(ctx, G);
  if (G.screen === 'title') drawTitleScreen(ctx, G);
  else if (G.screen === 'pause') drawPauseScreen(ctx, G);
  else if (G.screen === 'help') drawHelpScreen(ctx, G);
  else if (G.screen === 'over') drawOverScreen(ctx, G);
  else if (G.screen === 'ending') drawEndingScreen(ctx, G);
}

// ---------------------------------------------------------------------------
// The loop.

function resize() {
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.round(window.innerWidth * ratio);
  canvas.height = Math.round(window.innerHeight * ratio);
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  G.view.w = window.innerWidth;
  G.view.h = window.innerHeight;
}
window.addEventListener('resize', resize);

function runGame() {
  titleMenu();
  resize();
  let accumulator = 0;
  let last = performance.now();

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && G.screen === 'play') {
      G.screen = 'pause';
      pauseMenu();
    }
  });

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;

    if (input.wasPressed('KeyM')) {
      const on = audio.toggleMusic();
      if (G.screen === 'play') G.notify(`Music ${on ? 'on' : 'off'}`, '#37e0d8');
    }
    if (input.wasPressed('KeyN')) {
      const on = audio.toggleSound();
      if (G.screen === 'play') G.notify(`Sound ${on ? 'on' : 'off'}`, '#37e0d8');
    }

    if (G.screen === 'title' || G.screen === 'pause') menuNav();
    else if (G.screen === 'help') {
      if (input.wasPressed('Enter') || input.wasPressed('Escape') || input.mouse.clicked) {
        G.screen = G.helpReturn || 'title';
        if (G.screen === 'pause') pauseMenu();
        audio.click();
      }
    } else if (G.screen === 'ending') {
      if (input.wasPressed('Enter') || input.mouse.clicked) G.screen = 'play';
    } else if (G.screen === 'play') {
      if (input.wasPressed('Escape') || input.wasPressed('KeyP')) {
        G.screen = 'pause';
        pauseMenu();
        saveGame(G);
        saveData = loadSaveData();
      }
    }

    if (G.screen === 'play') {
      while (accumulator >= STEP) {
        stepPlay(STEP);
        accumulator -= STEP;
        if (G.screen !== 'play') { accumulator = 0; break; }
      }
    } else if (G.screen === 'title') {
      while (accumulator >= STEP) {
        stepAmbient(STEP);
        accumulator -= STEP;
      }
    } else if (G.screen === 'over') {
      G.overT -= 1 / 60;
      updateFx(G, STEP);
      if (G.overT <= 0) respawn();
      accumulator = 0;
    } else {
      accumulator = 0;
    }
    audio.updateMusic(1 / 60);
    draw();
    input.endFrame();
  }
  announce('Neon Tide: Solmar City. Choose New Game to begin.');
  requestAnimationFrame(frame);
}

function runShot(name) {
  resize();
  G.screen = stageShot(name, G);
  if (G.screen === 'title') titleMenu();
  let last = performance.now();
  let painted = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    G.time += dt;
    if (G.screen === 'title') {
      stepAmbient(dt);
    } else {
      updateShot(G, dt);
      updateTraffic(G, dt);
      updatePeds(G, dt);
      updateFx(G, dt);
      const tx = clamp(G.player.x - G.view.w / 2, 0, Math.max(0, WORLD.w - G.view.w));
      const ty = clamp(G.player.y - G.view.h / 2, 0, Math.max(0, WORLD.h - G.view.h));
      G.camera.x = tx;
      G.camera.y = ty;
    }
    draw();
    painted += 1;
    if (painted === 3) window.__shotReady = true;
    input.endFrame();
  }
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
