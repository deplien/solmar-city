// The round minimap, bottom-left: a player-centred slice of Solmar City with district
// tints, the road grid, the sea, and blips for everything that matters — the gold objective,
// Marisol's pink M, police flashing blue and red, taxi fares in orange, courier work in
// cyan, and the shards as faint sparks. North is up; the player's arrow turns, the map
// does not, so the city stays learnable.
import { WORLD, ROAD_W, SAND_Y, WATER_Y, PALETTE, FONT } from './config.js';
import { clamp } from './random.js';

const RADIUS = 88;
/** How much world the map spans, edge to edge, in px. */
const SPAN = 1560;

export function drawMinimap(ctx, G) {
  const { h: H } = G.view;
  const cx = RADIUS + 18;
  const cy = H - RADIUS - 18;
  const scale = (RADIUS * 2) / SPAN;
  const px = G.player.x;
  const py = G.player.y;
  const toMapX = (wx) => cx + (wx - px) * scale;
  const toMapY = (wy) => cy + (wy - py) * scale;

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, RADIUS, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = '#66795a';
  ctx.fillRect(cx - RADIUS, cy - RADIUS, RADIUS * 2, RADIUS * 2);
  // District tints.
  for (const d of G.city.districts) {
    ctx.fillStyle = d.tint;
    ctx.globalAlpha = 0.5;
    ctx.fillRect(toMapX(d.x), toMapY(d.y), d.w * scale, d.h * scale);
  }
  ctx.globalAlpha = 1;
  // Beach and sea.
  ctx.fillStyle = PALETTE.sand;
  ctx.fillRect(cx - RADIUS, toMapY(SAND_Y), RADIUS * 2, (WATER_Y - SAND_Y) * scale);
  ctx.fillStyle = PALETTE.water;
  ctx.fillRect(cx - RADIUS, toMapY(WATER_Y), RADIUS * 2, (WORLD.h - WATER_Y) * scale + 4);
  // Roads.
  ctx.strokeStyle = 'rgba(240, 238, 228, 0.85)';
  ctx.lineWidth = Math.max(2, ROAD_W * scale);
  for (const rx of G.city.roadsV) {
    ctx.beginPath();
    ctx.moveTo(toMapX(rx), toMapY(0));
    ctx.lineTo(toMapX(rx), toMapY(SAND_Y + 60));
    ctx.stroke();
  }
  for (const ry of G.city.roadsH) {
    ctx.beginPath();
    ctx.moveTo(toMapX(0), toMapY(ry));
    ctx.lineTo(toMapX(WORLD.w), toMapY(ry));
    ctx.stroke();
  }

  const blip = (wx, wy, color, size, square = false) => {
    let bx = toMapX(wx);
    let by = toMapY(wy);
    const d = Math.hypot(bx - cx, by - cy);
    if (d > RADIUS - 9) {
      // Off the map's edge: pin the blip to the rim, pointing the way.
      bx = cx + ((bx - cx) / d) * (RADIUS - 9);
      by = cy + ((by - cy) / d) * (RADIUS - 9);
    }
    ctx.fillStyle = color;
    if (square) ctx.fillRect(bx - size / 2, by - size / 2, size, size);
    else {
      ctx.beginPath();
      ctx.arc(bx, by, size / 2, 0, Math.PI * 2);
      ctx.fill();
    }
  };

  // Shards sparkle faintly, fares hail in orange, the courier waits in cyan.
  for (const spot of G.city.shardSpots) {
    if (G.shardsCollected.has(spot.id)) continue;
    blip(spot.x, spot.y, 'rgba(55, 224, 216, 0.55)', 4);
  }
  if (G.taxi && G.taxi.farePed) blip(G.taxi.farePed.x, G.taxi.farePed.y, PALETTE.neonAmber, 7);
  if (G.taxi && G.taxi.dest) blip(G.taxi.dest.x, G.taxi.dest.y, PALETTE.neonAmber, 8, true);
  if (G.courier) blip(G.courier.x, G.courier.y, PALETTE.neonCyan, 8, true);
  if (G.courier && G.courier.dest) blip(G.courier.dest.x, G.courier.dest.y, PALETTE.neonCyan, 8, true);
  // Marisol, when a story mission is waiting.
  if (!G.mission.active && G.mission.index < 5 && !G.mission.storyDone) {
    blip(G.city.places.marisol.x, G.city.places.marisol.y, PALETTE.neonPink, 9);
  }
  // Fixed landmarks worth knowing when you are hurt or homesick for the garage.
  blip(G.city.places.garageDoor.x, G.city.places.garageDoor.y, PALETTE.neonPink, 5, true);
  blip(G.city.places.hospitalDoor.x, G.city.places.hospitalDoor.y, '#eef2f4', 5, true);
  blip(G.city.places.policeDoor.x, G.city.places.policeDoor.y, '#7aa7d9', 5, true);
  // The law.
  const flash = Math.floor(G.time * 2.4) % 2 === 0;
  for (const car of G.cars) {
    if (car.kind !== 'police' || car.wreck) continue;
    blip(car.x, car.y, flash ? '#3a7bff' : '#ff3b30', 6, true);
  }
  for (const cop of G.officers) {
    if (cop.state !== 'down') blip(cop.x, cop.y, '#3a7bff', 5);
  }
  // The objective, gold and pulsing.
  if (G.objective && !G.objective.hideMarker) {
    blip(G.objective.x, G.objective.y, PALETTE.gold, 9 + Math.sin(G.time * 5) * 1.6);
  }
  ctx.restore();

  // The player's arrow, dead centre, turned to his heading.
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(G.player.angle);
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = 'rgba(10,10,14,0.7)';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(9, 0);
  ctx.lineTo(-6, -5.6);
  ctx.lineTo(-3, 0);
  ctx.lineTo(-6, 5.6);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  // Rim and north.
  ctx.strokeStyle = 'rgba(244, 241, 232, 0.8)';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(cx, cy, RADIUS, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = PALETTE.text;
  ctx.font = `800 12px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.fillText('N', cx, cy - RADIUS - 6);
  ctx.textAlign = 'left';
  // The district you are standing in, named under the map.
  const district = G.city.districts.find((d) => px >= d.x && px < d.x + d.w && py >= d.y && py < d.y + d.h);
  if (district) {
    ctx.font = `600 12px ${FONT}`;
    ctx.fillStyle = 'rgba(244, 241, 232, 0.85)';
    ctx.fillText(district.name.toUpperCase(), cx - RADIUS, cy + RADIUS + 16);
  }
}
