// Everything the eye gets: the city from above — roads, rooftops with lit windows, palms,
// the harbor, the animated sea — then the cars, the crowds, Rocco, and the light itself,
// which turns from golden hour to neon night as the clock runs. The full-screen menus and
// the BUSTED / WASTED / ending cards live here too. The camera is a plain offset in G, so
// the world is drawn in world space under one translate and the screens in screen space.
import { WORLD, ROAD_W, SAND_Y, WATER_Y, PALETTE, FONT } from './config.js';
import { clamp, lerp } from './random.js';
import { MODELS } from './traffic.js';
import { RACE_CHECKPOINTS } from './missions.js';
import { drawSkids, drawParticles, drawTexts } from './effects.js';

/** How dark the world is at a given minute of the day, 0 at noon to 1 at deep night. */
export function darknessAt(minutes) {
  const h = minutes / 60;
  const stops = [[0, 0.66], [5, 0.66], [6.5, 0.34], [8.5, 0.06], [16.5, 0.04], [18, 0.16], [19, 0.4], [20.5, 0.6], [24, 0.66]];
  for (let i = 1; i < stops.length; i += 1) {
    if (h <= stops[i][0]) {
      const [h0, d0] = stops[i - 1];
      const [h1, d1] = stops[i];
      return lerp(d0, d1, (h - h0) / (h1 - h0));
    }
  }
  return 0.66;
}

/** Golden warmth around sunrise and sunset, 0..1. */
export function warmthAt(minutes) {
  const h = minutes / 60;
  const morning = Math.max(0, 1 - Math.abs(h - 7.2) / 1.1);
  const evening = Math.max(0, 1 - Math.abs(h - 18.6) / 1.3);
  return Math.max(morning, evening);
}

/** A tiny deterministic hash, so window lights and sparkles never flicker between frames. */
function hash(n) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const r = clamp(((n >> 16) & 255) + amt, 0, 255);
  const g = clamp(((n >> 8) & 255) + amt, 0, 255);
  const b = clamp((n & 255) + amt, 0, 255);
  return `rgb(${r},${g},${b})`;
}

function inView(G, x, y, pad) {
  return x > G.camera.x - pad && x < G.camera.x + G.view.w + pad && y > G.camera.y - pad && y < G.camera.y + G.view.h + pad;
}

/** Window positions along a building's edges; the same layout day and night. */
function windowSpots(b) {
  const spots = [];
  for (let x = b.x + 9; x < b.x + b.w - 6; x += 17) {
    spots.push({ x, y: b.y + 5 });
    spots.push({ x, y: b.y + b.h - 9 });
  }
  for (let y = b.y + 9; y < b.y + b.h - 6; y += 15) {
    spots.push({ x: b.x + 5, y });
    spots.push({ x: b.x + b.w - 9, y });
  }
  return spots;
}

function drawBuilding(ctx, G, b) {
  ctx.fillStyle = 'rgba(20, 18, 14, 0.25)';
  ctx.fillRect(b.x + 7, b.y + 9, b.w, b.h);
  ctx.fillStyle = b.color;
  ctx.fillRect(b.x, b.y, b.w, b.h);
  ctx.fillStyle = shade(b.color, -26);
  ctx.fillRect(b.x + 5, b.y + 5, b.w - 10, b.h - 10);
  ctx.fillStyle = shade(b.color, 10);
  ctx.fillRect(b.x + 10, b.y + 10, b.w - 20, b.h - 20);
  // Windows: dark glass by day; at night the lit ones are drawn again in the light pass.
  ctx.fillStyle = 'rgba(38, 48, 58, 0.85)';
  for (const s of windowSpots(b)) ctx.fillRect(s.x, s.y, 6, 4);
  // Rooftop clutter on the bigger blocks — a tank or plant box, placed by the seed so
  // no two roofs read quite the same and none of them flicker between frames.
  if (b.w > 92 && b.h > 72) {
    const rx = b.x + 14 + hash(b.seed * 7) * Math.max(1, b.w - 54);
    const ry = b.y + 12 + hash(b.seed * 13) * Math.max(1, b.h - 48);
    ctx.fillStyle = shade(b.color, -38);
    ctx.fillRect(rx, ry, 22, 16);
    ctx.fillStyle = shade(b.color, -16);
    ctx.fillRect(rx + 3, ry + 3, 16, 10);
  }
  if (b.special === 'hospital') {
    ctx.fillStyle = '#e8f2f4';
    ctx.fillRect(b.x + b.w / 2 - 16, b.y + b.h / 2 - 16, 32, 32);
    ctx.fillStyle = '#d43a31';
    ctx.fillRect(b.x + b.w / 2 - 3.5, b.y + b.h / 2 - 11, 7, 22);
    ctx.fillRect(b.x + b.w / 2 - 11, b.y + b.h / 2 - 3.5, 22, 7);
  } else if (b.special === 'garage') {
    ctx.fillStyle = '#2b2b33';
    ctx.fillRect(b.x + 12, b.y + b.h - 34, b.w - 24, 26);
    ctx.fillStyle = PALETTE.neonPink;
    ctx.font = `700 13px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText("VEGA'S GARAGE", b.x + b.w / 2, b.y + 20);
    ctx.textAlign = 'left';
  } else if (b.special === 'police') {
    ctx.fillStyle = '#274b73';
    ctx.fillRect(b.x + 8, b.y + 8, b.w - 16, 16);
    ctx.fillStyle = '#eef1f4';
    ctx.font = `700 11px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText('SOLMAR PD', b.x + b.w / 2, b.y + 20);
    ctx.textAlign = 'left';
  }
  // Rooftop name, when the camera is close enough for it to read.
  const cx = G.camera.x + G.view.w / 2;
  const cy = G.camera.y + G.view.h / 2;
  const d = Math.hypot(b.x + b.w / 2 - cx, b.y + b.h / 2 - cy);
  if (d < 430 && b.w > 74 && !b.special) {
    ctx.globalAlpha = clamp(1.15 - d / 430, 0, 0.85);
    ctx.fillStyle = '#2e2a24';
    ctx.font = `600 11px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText(b.name.toUpperCase(), b.x + b.w / 2, b.y + b.h / 2 + 4);
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
  }
}

function drawCar(ctx, G, car, dark) {
  const m = MODELS[car.model];
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.angle);
  ctx.fillStyle = 'rgba(15, 14, 12, 0.3)';
  ctx.fillRect(-m.len / 2 + 3, -m.wid / 2 + 4, m.len, m.wid);
  // Wheels.
  ctx.fillStyle = '#17181a';
  const ww = m.len * 0.16;
  for (const [wx, wy] of [[-m.len * 0.31, -m.wid / 2 - 1.5], [m.len * 0.31, -m.wid / 2 - 1.5], [-m.len * 0.31, m.wid / 2 - 2.5], [m.len * 0.31, m.wid / 2 - 2.5]]) {
    ctx.fillRect(wx - ww / 2, wy, ww, 4);
  }
  // Body.
  ctx.fillStyle = car.wreck ? '#3c3a38' : car.color;
  ctx.beginPath();
  ctx.roundRect(-m.len / 2, -m.wid / 2, m.len, m.wid, 6);
  ctx.fill();
  if (car.model === 'police') {
    ctx.fillStyle = '#23272e';
    ctx.beginPath();
    ctx.roundRect(-m.len / 2, -m.wid / 2, m.len * 0.24, m.wid, 6);
    ctx.roundRect(m.len * 0.26, -m.wid / 2, m.len * 0.24, m.wid, 6);
    ctx.fill();
    // Lightbar: red and blue trading places twice a second.
    const phase = Math.floor(car.lightPhase) % 2;
    ctx.fillStyle = phase ? '#ff3b30' : '#3a7bff';
    ctx.fillRect(-7, -m.wid / 2 + 2, 6, m.wid - 4);
    ctx.fillStyle = phase ? '#3a7bff' : '#ff3b30';
    ctx.fillRect(1, -m.wid / 2 + 2, 6, m.wid - 4);
  }
  if (car.model === 'taxi') {
    ctx.fillStyle = '#23272e';
    ctx.fillRect(-4, -m.wid / 2 + 3, 9, m.wid - 6);
    ctx.fillStyle = '#fff7d6';
    ctx.font = `700 7px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText('TAXI', 0.5, 2.5);
    ctx.textAlign = 'left';
  }
  if (car.model === 'pickup') {
    ctx.fillStyle = shade(car.color, -30);
    ctx.fillRect(-m.len / 2 + 3, -m.wid / 2 + 3, m.len * 0.42, m.wid - 6);
  }
  // Cabin and glass.
  ctx.fillStyle = car.wreck ? '#2c2c2c' : '#222b36';
  ctx.beginPath();
  ctx.roundRect(-m.len * 0.08, -m.wid / 2 + 3, m.len * 0.4, m.wid - 6, 4);
  ctx.fill();
  ctx.fillStyle = 'rgba(160, 210, 235, 0.5)';
  ctx.fillRect(m.len * 0.3, -m.wid / 2 + 4, 3.5, m.wid - 8);
  if (car.model === 'sports' && !car.wreck) {
    ctx.fillStyle = '#1d1d22';
    ctx.fillRect(-m.len / 2 - 2, -m.wid / 2 + 1, 4, m.wid - 2);
  }
  if (car.health < 55 && !car.wreck) {
    ctx.fillStyle = 'rgba(30,30,30,0.35)';
    ctx.fillRect(m.len * 0.2, -m.wid / 2, m.len * 0.3, m.wid);
  }
  ctx.restore();

  // Headlight glow pools at night.
  if (dark > 0.25 && !car.wreck) {
    const hx = car.x + Math.cos(car.angle) * m.len * 0.62;
    const hy = car.y + Math.sin(car.angle) * m.len * 0.62;
    const grad = ctx.createRadialGradient(hx, hy, 2, hx, hy, 30);
    grad.addColorStop(0, `rgba(255, 240, 190, ${0.35 * dark})`);
    grad.addColorStop(1, 'rgba(255, 240, 190, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(hx, hy, 30, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawPerson(ctx, x, y, angle, colors, phase, opts = {}) {
  ctx.save();
  ctx.translate(x, y);
  if (opts.down) {
    ctx.rotate(angle + Math.PI / 2);
    ctx.globalAlpha = opts.alpha !== undefined ? opts.alpha : 1;
    ctx.fillStyle = colors.pants;
    ctx.fillRect(-4, -3, 15, 6);
    ctx.fillStyle = colors.shirt;
    ctx.fillRect(-13, -5, 10, 10);
    ctx.fillStyle = colors.skin;
    ctx.beginPath();
    ctx.arc(-17, 0, 4.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.globalAlpha = 1;
    return;
  }
  ctx.rotate(angle);
  const step = Math.sin(phase) * (opts.moving ? 4.4 : 0.6);
  ctx.fillStyle = colors.pants;
  ctx.fillRect(-2, -5.4 + step * 0.4, 8, 3.6);
  ctx.fillRect(-2, 1.8 - step * 0.4, 8, 3.6);
  ctx.fillStyle = colors.shirt;
  ctx.beginPath();
  ctx.roundRect(-6, -6.4, 12, 12.8, 5);
  ctx.fill();
  if (opts.gun) {
    ctx.fillStyle = '#1d1d22';
    ctx.fillRect(6, -1.4, 11, 2.8);
  }
  if (opts.arm) {
    ctx.strokeStyle = colors.shirt;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(3, 3);
    ctx.lineTo(11, 5);
    ctx.stroke();
  }
  ctx.fillStyle = colors.skin;
  ctx.beginPath();
  ctx.arc(1.5, 0, 4.8, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = colors.hair || '#2b2118';
  ctx.beginPath();
  ctx.arc(0.2, 0, 4.8, Math.PI * 0.7, Math.PI * 1.85);
  ctx.fill();
  ctx.restore();
}

function drawMarker(ctx, G, x, y, color, label) {
  const bob = Math.sin(G.time * 3.2) * 5;
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.globalAlpha = 0.9;
  ctx.beginPath();
  ctx.arc(x, y, 20 + Math.sin(G.time * 3.2) * 3, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y - 34 + bob);
  ctx.lineTo(x - 9, y - 52 + bob);
  ctx.lineTo(x + 9, y - 52 + bob);
  ctx.closePath();
  ctx.fill();
  if (label) {
    ctx.font = `700 12px ${FONT}`;
    ctx.textAlign = 'center';
    const w = ctx.measureText(label).width + 14;
    ctx.fillStyle = 'rgba(12,12,16,0.7)';
    ctx.fillRect(x - w / 2, y - 82 + bob, w, 19);
    ctx.fillStyle = color;
    ctx.fillText(label, x, y - 68 + bob);
    ctx.textAlign = 'left';
  }
}

export function drawScene(ctx, G) {
  const { w: W, h: H } = G.view;
  const dark = darknessAt(G.clock.minutes);
  const warm = warmthAt(G.clock.minutes);
  const shakeX = G.fx.shake ? G.rng.spread(G.fx.shake) : 0;
  const shakeY = G.fx.shake ? G.rng.spread(G.fx.shake) : 0;
  const camX = G.camera.x + shakeX;
  const camY = G.camera.y + shakeY;

  ctx.fillStyle = '#5d7350';
  ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.translate(-camX, -camY);

  // District tints and the beach.
  for (const d of G.city.districts) {
    if (!inView(G, d.x + d.w / 2, d.y + d.h / 2, Math.max(d.w, d.h))) continue;
    ctx.fillStyle = d.tint;
    ctx.globalAlpha = 0.35;
    ctx.fillRect(d.x, d.y, d.w, d.h);
    ctx.globalAlpha = 1;
  }
  ctx.fillStyle = PALETTE.sand;
  ctx.fillRect(0, SAND_Y, WORLD.w, WATER_Y - SAND_Y);
  ctx.fillStyle = PALETTE.sandWet;
  ctx.fillRect(0, WATER_Y - 16, WORLD.w, 16);
  // The sea, with a slow sparkle that shifts as the seconds pass.
  ctx.fillStyle = PALETTE.water;
  ctx.fillRect(0, WATER_Y, WORLD.w, WORLD.h - WATER_Y);
  ctx.fillStyle = PALETTE.waterDeep;
  for (let y = WATER_Y + 34; y < WORLD.h; y += 42) ctx.fillRect(0, y, WORLD.w, 13);
  // A breathing foam line where the sea meets the sand.
  ctx.strokeStyle = 'rgba(240, 250, 252, 0.65)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  for (let x = Math.max(0, camX - 20); x <= Math.min(WORLD.w, camX + W + 20); x += 46) {
    const fy = WATER_Y + 3 + Math.sin(G.time * 1.3 + x * 0.02) * 3.4;
    if (x === Math.max(0, camX - 20)) ctx.moveTo(x, fy);
    else ctx.lineTo(x, fy);
  }
  ctx.stroke();
  ctx.strokeStyle = PALETTE.waterSparkle;
  ctx.lineWidth = 2;
  ctx.globalAlpha = 0.5;
  const sparkleT = Math.floor(G.time * 1.6);
  for (let i = 0; i < 90; i += 1) {
    const sx = hash(i * 3 + sparkleT * 0.13) * WORLD.w;
    const sy = WATER_Y + 8 + hash(i * 7 + sparkleT * 0.29) * (WORLD.h - WATER_Y - 16);
    if (sx < camX - 30 || sx > camX + W + 30 || sy < camY - 20 || sy > camY + H + 20) continue;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx + 12 + hash(i) * 16, sy);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // Sidewalks first (a pale halo around every road), then the asphalt itself.
  ctx.fillStyle = PALETTE.sidewalk;
  for (const rx of G.city.roadsV) ctx.fillRect(rx - ROAD_W / 2 - 15, 0, ROAD_W + 30, SAND_Y + 70);
  for (const ry of G.city.roadsH) ctx.fillRect(0, ry - ROAD_W / 2 - 15, WORLD.w, ROAD_W + 30);
  ctx.fillStyle = PALETTE.road;
  for (const rx of G.city.roadsV) ctx.fillRect(rx - ROAD_W / 2, 0, ROAD_W, SAND_Y + 70);
  for (const ry of G.city.roadsH) ctx.fillRect(0, ry - ROAD_W / 2, WORLD.w, ROAD_W);
  ctx.strokeStyle = PALETTE.roadEdge;
  ctx.lineWidth = 3;
  for (const rx of G.city.roadsV) {
    ctx.beginPath(); ctx.moveTo(rx - ROAD_W / 2, 0); ctx.lineTo(rx - ROAD_W / 2, SAND_Y + 70); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(rx + ROAD_W / 2, 0); ctx.lineTo(rx + ROAD_W / 2, SAND_Y + 70); ctx.stroke();
  }
  // Lane dashes.
  ctx.strokeStyle = PALETTE.laneMark;
  ctx.lineWidth = 3;
  ctx.setLineDash([24, 30]);
  ctx.globalAlpha = 0.75;
  for (const rx of G.city.roadsV) { ctx.beginPath(); ctx.moveTo(rx, 0); ctx.lineTo(rx, SAND_Y + 70); ctx.stroke(); }
  for (const ry of G.city.roadsH) { ctx.beginPath(); ctx.moveTo(0, ry); ctx.lineTo(WORLD.w, ry); ctx.stroke(); }
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;
  // Crosswalks at every intersection.
  ctx.fillStyle = PALETTE.crosswalk;
  ctx.globalAlpha = 0.5;
  for (const ix of G.city.intersections) {
    if (!inView(G, ix.x, ix.y, 130)) continue;
    for (let s = -48; s <= 48; s += 16) {
      ctx.fillRect(ix.x + s - 5, ix.y - ROAD_W / 2 + 4, 10, 15);
      ctx.fillRect(ix.x + s - 5, ix.y + ROAD_W / 2 - 19, 10, 15);
      ctx.fillRect(ix.x - ROAD_W / 2 + 4, ix.y + s - 5, 15, 10);
      ctx.fillRect(ix.x + ROAD_W / 2 - 19, ix.y + s - 5, 15, 10);
    }
  }
  ctx.globalAlpha = 1;

  // Parking plots.
  ctx.fillStyle = '#6d6a63';
  for (const lot of G.city.parkings) {
    if (!inView(G, lot.x + lot.w / 2, lot.y + lot.h / 2, 300)) continue;
    ctx.fillRect(lot.x, lot.y, lot.w, lot.h);
    ctx.strokeStyle = 'rgba(240,238,230,0.4)';
    ctx.lineWidth = 2;
    for (let x = lot.x + 14; x < lot.x + lot.w - 8; x += 30) {
      ctx.beginPath(); ctx.moveTo(x, lot.y + 6); ctx.lineTo(x, lot.y + 30); ctx.stroke();
    }
  }

  drawSkids(ctx, G);

  // Harbor dressing: containers and cranes.
  for (const c of G.city.containers) {
    if (!inView(G, c.x + c.w / 2, c.y + c.h / 2, 140)) continue;
    ctx.fillStyle = 'rgba(20,18,14,0.25)';
    ctx.fillRect(c.x + 4, c.y + 5, c.w, c.h);
    ctx.fillStyle = c.color;
    ctx.fillRect(c.x, c.y, c.w, c.h);
    ctx.strokeStyle = 'rgba(0,0,0,0.28)';
    ctx.lineWidth = 2;
    for (let x = c.x + 10; x < c.x + c.w - 4; x += 13) {
      ctx.beginPath(); ctx.moveTo(x, c.y + 3); ctx.lineTo(x, c.y + c.h - 3); ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.strokeRect(c.x + 1, c.y + 1, c.w - 2, c.h - 2);
  }
  for (const crane of G.city.cranes) {
    if (!inView(G, crane.x, crane.y, 240)) continue;
    ctx.strokeStyle = '#d8a03c';
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(crane.x, crane.y);
    ctx.lineTo(crane.x + Math.cos(crane.angle) * 120, crane.y + Math.sin(crane.angle) * 120);
    ctx.stroke();
    ctx.lineWidth = 2;
    const tipX = crane.x + Math.cos(crane.angle) * 96;
    const tipY = crane.y + Math.sin(crane.angle) * 96;
    ctx.beginPath(); ctx.moveTo(tipX, tipY); ctx.lineTo(tipX, tipY + 34); ctx.stroke();
    ctx.fillStyle = '#8a8f96';
    ctx.fillRect(tipX - 9, tipY + 34, 18, 12);
    ctx.fillStyle = '#3c4046';
    ctx.fillRect(crane.x - 11, crane.y - 11, 22, 22);
  }

  for (const b of G.city.buildings) {
    if (!inView(G, b.x + b.w / 2, b.y + b.h / 2, Math.max(b.w, b.h))) continue;
    drawBuilding(ctx, G, b);
  }

  // Palms and lamps.
  for (const palm of G.city.palms) {
    if (!inView(G, palm.x, palm.y, 60)) continue;
    // A soft shadow pool grounds the fronds, so the palms read as silhouettes, not stickers.
    ctx.fillStyle = 'rgba(24, 30, 18, 0.28)';
    ctx.beginPath();
    ctx.ellipse(palm.x + 5, palm.y + 3, 15 * palm.s, 10 * palm.s, 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#7a5c38';
    ctx.lineWidth = 3.4 * palm.s;
    ctx.beginPath(); ctx.moveTo(palm.x, palm.y); ctx.lineTo(palm.x + 3, palm.y - 3); ctx.stroke();
    ctx.strokeStyle = '#3f8f4f';
    ctx.lineWidth = 2.6 * palm.s;
    for (let i = 0; i < 6; i += 1) {
      const a = (i / 6) * Math.PI * 2 + palm.x * 0.01;
      ctx.beginPath();
      ctx.moveTo(palm.x + 3, palm.y - 3);
      ctx.quadraticCurveTo(palm.x + 3 + Math.cos(a) * 11 * palm.s, palm.y - 3 + Math.sin(a) * 11 * palm.s - 4,
        palm.x + 3 + Math.cos(a) * 19 * palm.s, palm.y - 3 + Math.sin(a) * 19 * palm.s + 3);
      ctx.stroke();
    }
  }
  ctx.fillStyle = '#4a4d52';
  for (const lamp of G.city.lamps) {
    if (!inView(G, lamp.x, lamp.y, 30)) continue;
    ctx.beginPath();
    ctx.arc(lamp.x, lamp.y, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  // Story and side-job dressing in the world.
  const P = G.city.places;
  if (!G.mission.active && G.mission.index < 5 && !G.mission.storyDone) {
    drawPerson(ctx, P.marisol.x, P.marisol.y, Math.PI / 2, { shirt: '#ff4fa3', pants: '#2e2a33', skin: '#d9a066', hair: '#1c1c22' }, G.time * 2, {});
    drawMarker(ctx, G, P.marisol.x, P.marisol.y - 6, PALETTE.neonPink, 'MARISOL');
  }
  if (G.mission.active && G.mission.index === 1 && G.mission.phase === 'pickup') drawMarker(ctx, G, P.harborPickup.x, P.harborPickup.y, PALETTE.neonAmber, 'PACKAGE');
  if (G.mission.active && G.mission.index === 3 && G.mission.phase === 'grab') drawMarker(ctx, G, P.containerCash.x, P.containerCash.y, PALETTE.neonAmber, 'THE CASH');
  if (G.courier) drawMarker(ctx, G, G.courier.x, G.courier.y, PALETTE.neonCyan, G.courier.phase === 'pickup' ? 'PARCEL' : '');
  // The Neon Tide race: every checkpoint a ring across the road, the next one lit gold.
  if (G.mission.active && G.mission.index === 4 && G.mission.phase === 'race') {
    RACE_CHECKPOINTS.forEach((cp, i) => {
      if (!inView(G, cp.x, cp.y, 150)) return;
      const current = i === G.mission.data.cp;
      const done = i < G.mission.data.cp;
      ctx.strokeStyle = done ? 'rgba(88, 217, 119, 0.5)' : current ? PALETTE.gold : 'rgba(244, 241, 232, 0.4)';
      ctx.lineWidth = current ? 6 : 3.5;
      ctx.beginPath();
      ctx.arc(cp.x, cp.y, 56 + (current ? Math.sin(G.time * 4) * 4 : 0), 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = current ? PALETTE.gold : 'rgba(244, 241, 232, 0.75)';
      ctx.font = `800 17px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText(String(i + 1), cp.x, cp.y + 6);
      ctx.textAlign = 'left';
    });
  }
  // Neon shards still unclaimed.
  for (const spot of G.city.shardSpots) {
    if (G.shardsCollected.has(spot.id) || !inView(G, spot.x, spot.y, 40)) continue;
    const pulse = 1 + Math.sin(G.time * 4 + spot.id) * 0.18;
    ctx.save();
    ctx.translate(spot.x, spot.y - 4 + Math.sin(G.time * 2.4 + spot.id) * 2.5);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = PALETTE.neonCyan;
    ctx.globalAlpha = 0.9;
    const s = 7 * pulse;
    ctx.fillRect(-s / 2, -s / 2, s, s);
    ctx.restore();
    ctx.globalAlpha = 1;
  }
  // Pickups lying in the street.
  for (const pk of G.pickups) {
    if (!inView(G, pk.x, pk.y, 40)) continue;
    const bob = Math.sin(G.time * 3 + pk.x * 0.05) * 2;
    ctx.save();
    ctx.translate(pk.x, pk.y + bob);
    if (pk.kind === 'cash') {
      ctx.fillStyle = '#3f9e4d';
      ctx.fillRect(-9, -5.5, 18, 11);
      ctx.fillStyle = '#cdeecd';
      ctx.font = `700 9px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText('$', 0, 3.4);
      ctx.textAlign = 'left';
    } else if (pk.kind === 'pistol') {
      ctx.fillStyle = '#23242a';
      ctx.fillRect(-10, -2.6, 17, 5);
      ctx.fillRect(4, 0, 4.6, 8);
    } else if (pk.kind === 'armor') {
      ctx.fillStyle = '#2b5f9e';
      ctx.beginPath(); ctx.roundRect(-8, -9, 16, 18, 4); ctx.fill();
      ctx.fillStyle = '#cfe6ff';
      ctx.fillRect(-5, -3, 10, 3);
    } else if (pk.kind === 'health') {
      ctx.fillStyle = '#eef2f4';
      ctx.beginPath(); ctx.roundRect(-9, -9, 18, 18, 3); ctx.fill();
      ctx.fillStyle = '#d43a31';
      ctx.fillRect(-2.4, -6, 4.8, 12);
      ctx.fillRect(-6, -2.4, 12, 4.8);
    }
    ctx.restore();
  }

  // People, then officers, then cars, then Rocco.
  for (const ped of G.peds) {
    if (!inView(G, ped.x, ped.y, 40)) continue;
    if (ped.state === 'ride') continue;
    const alpha = ped.state === 'down' ? clamp(1.4 - ped.downT / 4, 0.25, 1) : 1;
    drawPerson(ctx, ped.x, ped.y, ped.angle, ped, ped.phase, { down: ped.state === 'down', moving: ped.speed > 4, alpha });
    if (ped.fare && ped.state === 'fare-wait') {
      ctx.fillStyle = PALETTE.neonAmber;
      ctx.font = `800 15px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText('!', ped.x, ped.y - 16 + Math.sin(G.time * 5) * 2);
      ctx.textAlign = 'left';
    }
  }
  for (const cop of G.officers) {
    if (!inView(G, cop.x, cop.y, 40)) continue;
    const alpha = cop.state === 'down' ? clamp(1.2 - cop.downT / 3.4, 0.2, 1) : 1;
    drawPerson(ctx, cop.x, cop.y, cop.angle, { shirt: '#274b73', pants: '#1f2c3d', skin: '#e8b98d', hair: '#14202e' }, cop.phase, { down: cop.state === 'down', moving: true, gun: cop.state !== 'down', alpha });
  }
  for (const car of G.cars) {
    if (!inView(G, car.x, car.y, 90)) continue;
    drawCar(ctx, G, car, dark);
  }
  if (!G.player.car) {
    const p = G.player;
    drawPerson(ctx, p.x, p.y, p.angle, { shirt: '#1f7a8c', pants: '#2b2b33', skin: '#d9a066', hair: '#241a12' }, p.walkPhase, { moving: p.speedNow > 4, gun: p.weapon === 'pistol' && p.hasPistol, arm: true });
  }

  drawParticles(ctx, G);
  drawTexts(ctx, G);

  // The objective's world marker (the HUD draws the banner and the edge arrow).
  if (G.objective && !G.objective.hideMarker && inView(G, G.objective.x, G.objective.y, 60)) {
    drawMarker(ctx, G, G.objective.x, G.objective.y, PALETTE.gold, '');
  }

  ctx.restore();

  // ---- Lighting, in screen space over the world just drawn. ----
  if (dark > 0.02) {
    ctx.fillStyle = `rgba(12, 16, 44, ${(dark * 0.52).toFixed(3)})`;
    ctx.fillRect(0, 0, W, H);
  }
  if (warm > 0.03) {
    ctx.fillStyle = `rgba(255, 138, 61, ${(warm * 0.13).toFixed(3)})`;
    ctx.fillRect(0, 0, W, H);
  }
  if (dark > 0.2) {
    ctx.save();
    ctx.translate(-camX, -camY);
    ctx.globalCompositeOperation = 'lighter';
    // Lamp pools.
    for (const lamp of G.city.lamps) {
      if (!inView(G, lamp.x, lamp.y, 70)) continue;
      const grad = ctx.createRadialGradient(lamp.x, lamp.y, 2, lamp.x, lamp.y, 52);
      grad.addColorStop(0, `rgba(255, 214, 130, ${(0.16 * dark).toFixed(3)})`);
      grad.addColorStop(1, 'rgba(255, 214, 130, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(lamp.x, lamp.y, 52, 0, Math.PI * 2);
      ctx.fill();
    }
    // Lit windows, glowing through the dark.
    ctx.fillStyle = `rgba(255, 205, 110, ${(0.35 + dark * 0.5).toFixed(3)})`;
    for (const b of G.city.buildings) {
      if (!inView(G, b.x + b.w / 2, b.y + b.h / 2, Math.max(b.w, b.h))) continue;
      const spots = windowSpots(b);
      for (let i = 0; i < spots.length; i += 1) {
        if (hash(b.seed * 31 + i * 7) < dark * 1.15) ctx.fillRect(spots[i].x, spots[i].y, 6, 4);
      }
    }
    // Neon signs on the Mile: the clubs and casinos burn their names through the dusk.
    if (dark > 0.12) {
      const neonColors = [PALETTE.neonPink, PALETTE.neonCyan, PALETTE.neonAmber];
      ctx.textAlign = 'center';
      for (const b of G.city.buildings) {
        if (b.district !== 'Neon Mile') continue;
        // Vega's Garage already wears its own pink sign on the facade; drawing its
        // name again here, across the door band, garbles the two into double text.
        if (b.special === 'garage') continue;
        if (!inView(G, b.x + b.w / 2, b.y + b.h / 2, Math.max(b.w, b.h))) continue;
        const color = neonColors[Math.abs(b.seed) % neonColors.length];
        ctx.save();
        ctx.shadowColor = color;
        ctx.shadowBlur = 16;
        ctx.globalAlpha = 0.5 + dark * 0.5;
        ctx.fillStyle = color;
        ctx.font = `800 13px ${FONT}`;
        ctx.fillText(b.name.toUpperCase(), b.x + b.w / 2, b.y + b.h - 10);
        ctx.restore();
      }
      ctx.textAlign = 'left';
    }
    // Police lightbar wash.
    for (const car of G.cars) {
      if (car.model !== 'police' || car.wreck || !inView(G, car.x, car.y, 130)) continue;
      const phase = Math.floor(car.lightPhase) % 2;
      const grad = ctx.createRadialGradient(car.x, car.y, 4, car.x, car.y, 95);
      grad.addColorStop(0, phase ? `rgba(255, 60, 50, ${0.2 * dark + 0.08})` : `rgba(70, 120, 255, ${0.2 * dark + 0.08})`);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(car.x, car.y, 95, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    ctx.globalCompositeOperation = 'source-over';
  }

  // Vignette and the hurt flash.
  const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.42, W / 2, H / 2, Math.max(W, H) * 0.78);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(8,6,10,0.34)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);
  if (G.fx.hurtFlash > 0) {
    ctx.fillStyle = `rgba(215, 40, 32, ${(G.fx.hurtFlash * 0.4).toFixed(3)})`;
    ctx.fillRect(0, 0, W, H);
  }
}

// ---------------------------------------------------------------------------
// Full-screen cards and menus, drawn over the world.

function panel(ctx, W, H, title, lines, accent) {
  ctx.fillStyle = 'rgba(8, 9, 14, 0.62)';
  ctx.fillRect(0, 0, W, H);
  const pw = Math.min(560, W - 60);
  const ph = 120 + lines.length * 30;
  const x = (W - pw) / 2;
  const y = (H - ph) / 2;
  ctx.fillStyle = PALETTE.panel;
  ctx.beginPath();
  ctx.roundRect(x, y, pw, ph, 14);
  ctx.fill();
  ctx.strokeStyle = accent || PALETTE.panelEdge;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.textAlign = 'center';
  ctx.fillStyle = PALETTE.text;
  ctx.font = `800 30px ${FONT}`;
  ctx.fillText(title, W / 2, y + 52);
  ctx.font = `16px ${FONT}`;
  ctx.fillStyle = PALETTE.textDim;
  lines.forEach((line, i) => ctx.fillText(line, W / 2, y + 92 + i * 30));
  ctx.textAlign = 'left';
}

export function drawTitleScreen(ctx, G) {
  const { w: W, h: H } = G.view;
  const grad = ctx.createLinearGradient(0, H * 0.45, 0, H);
  grad.addColorStop(0, 'rgba(10, 8, 18, 0)');
  grad.addColorStop(1, 'rgba(10, 8, 18, 0.82)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.save();
  ctx.shadowColor = PALETTE.neonPink;
  ctx.shadowBlur = 34;
  ctx.fillStyle = '#ffffff';
  ctx.font = `900 ${Math.min(96, W * 0.11)}px ${FONT}`;
  ctx.fillText('NEON TIDE', W / 2, H * 0.34);
  ctx.restore();
  ctx.fillStyle = PALETTE.neonCyan;
  ctx.font = `700 ${Math.min(30, W * 0.035)}px ${FONT}`;
  ctx.fillText('S O L M A R   C I T Y', W / 2, H * 0.34 + 44);
  ctx.fillStyle = PALETTE.textDim;
  ctx.font = `16px ${FONT}`;
  ctx.fillText('An open-world crime story: steal cars, run jobs, outrun the Solmar PD.', W / 2, H * 0.34 + 76);
  ctx.font = `700 22px ${FONT}`;
  G.menu.items.forEach((item, i) => {
    const y = H * 0.58 + i * 42;
    if (i === G.menu.sel) {
      ctx.fillStyle = 'rgba(255, 79, 163, 0.22)';
      const tw = ctx.measureText(item.label).width + 56;
      ctx.beginPath();
      ctx.roundRect(W / 2 - tw / 2, y - 27, tw, 38, 9);
      ctx.fill();
      ctx.fillStyle = PALETTE.gold;
      ctx.fillText('▸', W / 2 - tw / 2 + 22, y);
    }
    ctx.fillStyle = item.disabled ? 'rgba(185,180,164,0.4)' : PALETTE.text;
    ctx.fillText(item.label, W / 2, y);
  });
  ctx.fillStyle = 'rgba(244, 241, 232, 0.55)';
  ctx.font = `13px ${FONT}`;
  ctx.fillText('WASD drive & walk · mouse aim · E enter car · M music · N sound', W / 2, H - 26);
  ctx.textAlign = 'left';
}

export function drawPauseScreen(ctx, G) {
  const { w: W, h: H } = G.view;
  panel(ctx, W, H, 'PAUSED', G.menu.items.map((it, i) => `${i === G.menu.sel ? '▸ ' : '  '}${it.label}`), PALETTE.neonCyan);
}

export function drawHelpScreen(ctx, G) {
  const { w: W, h: H } = G.view;
  panel(ctx, W, H, 'HOW TO PLAY', [
    'WASD / arrows — walk and drive · Shift — sprint',
    'Mouse — aim · Click or F — punch / shoot · R — reload',
    'E — steal or leave a car · Space — handbrake',
    'Esc — pause · M — music on/off · N — sound on/off',
    'Follow the gold marker: Marisol\u2019s missions pay best.',
    'Crimes witnessed raise your stars. Break line of sight to cool off.',
    'Enter — back',
  ], PALETTE.neonPink);
}

export function drawOverScreen(ctx, G) {
  const { w: W, h: H } = G.view;
  const busted = G.overKind === 'busted';
  ctx.fillStyle = busted ? 'rgba(16, 26, 54, 0.55)' : 'rgba(54, 10, 10, 0.55)';
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.save();
  ctx.shadowColor = busted ? '#3a7bff' : '#ff3b30';
  ctx.shadowBlur = 30;
  ctx.fillStyle = '#ffffff';
  ctx.font = `900 ${Math.min(92, W * 0.1)}px ${FONT}`;
  ctx.fillText(busted ? 'BUSTED' : 'WASTED', W / 2, H * 0.44);
  ctx.restore();
  ctx.fillStyle = PALETTE.text;
  ctx.font = `18px ${FONT}`;
  ctx.fillText(busted ? 'The Solmar PD impound your ride and fine you $150.' : 'Solmar General patches you up — for 10% of your cash.', W / 2, H * 0.44 + 42);
  ctx.textAlign = 'left';
}

export function drawEndingScreen(ctx, G) {
  const { w: W, h: H } = G.view;
  panel(ctx, W, H, 'NEON TIDE', [
    'Dario Kaine is beaten, Marisol is paid, and Solmar City is yours.',
    `Cash earned: $${Math.round(G.cash)}  ·  Respect: ${Math.round(G.respect)}`,
    `Neon shards: ${G.shardsCollected.size} / 20  ·  Day ${G.clock.day}`,
    'The city stays open — fares, couriers and trouble included.',
    'Enter — keep roaming',
  ], PALETTE.gold);
}
