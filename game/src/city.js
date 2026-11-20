// Solmar City, generated once from the seed: a grid of avenues over ~4200x3200 px, six named
// districts with their own building colours and business names, a working harbor of
// containers and cranes on the east edge, and a beach running along the south. Everything
// solid is an AABB in `obstacles`, so collision for the player, cars and pedestrians is one
// shared routine. Places the story needs — Vega's Garage, the hospital, the police station,
// the harbor yard — are hand-placed after generation so they are always exactly there.
import { WORLD, ROAD_W, SIDEWALK, SAND_Y } from './config.js';

export const ROADS_V = [420, 1150, 1880, 2610, 3340, 3990];
export const ROADS_H = [380, 1020, 1660, 2300, 2760];

const DISTRICTS = [
  { name: 'Downtown Solmar', x: 1090, y: 0, w: 1520, h: 1020, tint: '#8d99ae', walls: ['#c7cfda', '#aeb9c9', '#d8c9a8', '#9fb4c7'], floors: [6, 13], names: ['Solmar Trust Bank', 'Azure Tower', 'Meridian Offices', 'Halcyon Hotel', 'The Ledger Building', 'Coral Crown Plaza', 'Vista Finance', 'Sunspire Tower'] },
  { name: 'Old Town', x: 2610, y: 0, w: 1590, h: 1020, tint: '#b08968', walls: ['#d9b48f', '#c9a37e', '#e0c39c', '#bfa07a'], floors: [2, 5], names: ['Casa Antigua', 'Old Town Bakery', 'Ferreteria Lopez', 'Hotel Colonial', 'Plaza Antiques', 'Capilla Market', 'Taller Hermanos Ruiz', 'Casa del Sol'] },
  { name: 'Palm Heights', x: 0, y: 1020, w: 1090, h: 1280, tint: '#7cab5c', walls: ['#efe3c8', '#e6d3ae', '#dfe8d0', '#f2e2c4'], floors: [1, 3], names: ['Villa Palmera', 'Casa Brisa', 'The Palms Condos', 'Villa Serena', 'Casa Azul', 'Mirador Apartments', 'Villa Coral', 'Casa Verde'] },
  { name: 'Neon Mile', x: 1090, y: 1020, w: 1520, h: 740, tint: '#c86b98', walls: ['#e8a2c0', '#a2d8e8', '#f2d38a', '#c0a2e8', '#8ae8c8'], floors: [3, 7], names: ['Club Maré', 'Neon Palms Casino', 'Hotel Lumière', 'Bar El Faro', 'Vinyl & Vice Records', 'Pink Flamingo Lounge', 'Solmar Arcade', 'Café Neon'] },
  { name: 'Solmar Central', x: 1090, y: 1760, w: 2250, h: 1140, tint: '#94a187', walls: ['#d8d2c0', '#c4cdb4', '#e2d8bc', '#bcc7ae'], floors: [2, 6], names: ['Solmar Supermart', 'Taco Ola', 'FitLife Gym', 'Lavanderia Sol', 'Farmacia Central', 'Taller Vega Bros', 'Panaderia Dulce', 'Solmar Cinema'] },
  { name: 'Harbor District', x: 3340, y: 1020, w: 860, h: 1890, tint: '#7d8a96', walls: ['#b9c0c4', '#a8b2b5', '#c7b299', '#9fb0ad'], floors: [1, 3], names: ['Harbor Freight Co.', 'Dockside Warehouse', 'Solmar Shipping', 'Cold Storage 9', 'Port Authority Office', 'Marina Chandlery'] },
  { name: 'Solmar Beach', x: 0, y: 2760, w: 3340, h: 440, tint: '#eed491', walls: ['#f4e3b2', '#eed9a0', '#f7ecc8'], floors: [1, 2], names: ['Beach Hut', 'Chiringuito Sol', 'Surf Rentals', 'Beach Hut', 'Heladeria Ola'] },
];

function segments(roads, limit) {
  const out = [];
  let prev = 0;
  for (const r of roads) {
    out.push([prev, r - ROAD_W / 2]);
    prev = r + ROAD_W / 2;
  }
  out.push([prev, limit]);
  return out;
}

export function districtAt(city, x, y) {
  for (const d of city.districts) {
    if (x >= d.x && x < d.x + d.w && y >= d.y && y < d.y + d.h) return d;
  }
  return null;
}

/** True when the point is on asphalt (a road band or an intersection), with optional slack. */
export function isRoad(city, x, y, pad = 0) {
  for (const rx of city.roadsV) if (Math.abs(x - rx) <= ROAD_W / 2 + pad) return true;
  for (const ry of city.roadsH) if (Math.abs(y - ry) <= ROAD_W / 2 + pad) return true;
  return false;
}

/** True when the point is on a sidewalk band: just off a road, not yet on a block. */
export function isSidewalk(city, x, y) {
  for (const rx of city.roadsV) {
    const d = Math.abs(x - rx);
    if (d > ROAD_W / 2 && d <= ROAD_W / 2 + SIDEWALK + 6 && y < SAND_Y + 30) return true;
  }
  for (const ry of city.roadsH) {
    const d = Math.abs(y - ry);
    if (d > ROAD_W / 2 && d <= ROAD_W / 2 + SIDEWALK + 6) return true;
  }
  return false;
}

function insideAny(obstacles, x, y, pad) {
  for (const o of obstacles) {
    if (x > o.x - pad && x < o.x + o.w + pad && y > o.y - pad && y < o.y + o.h + pad) return true;
  }
  return false;
}

/**
 * Push a circle out of every obstacle it overlaps and keep it inside the world. Returns the
 * corrected position and whether anything was hit, which callers turn into crash damage,
 * a stopped pedestrian, or a car that has found a wall.
 */
export function collideCircle(city, x, y, r) {
  let hit = false;
  for (const o of city.obstacles) {
    const nx = Math.max(o.x, Math.min(x, o.x + o.w));
    const ny = Math.max(o.y, Math.min(y, o.y + o.h));
    const dx = x - nx;
    const dy = y - ny;
    const d2 = dx * dx + dy * dy;
    if (d2 >= r * r) continue;
    hit = true;
    if (d2 > 0.0001) {
      const d = Math.sqrt(d2);
      x = nx + (dx / d) * r;
      y = ny + (dy / d) * r;
    } else {
      // Centre inside the box: leave by the shallowest side.
      const left = x - o.x;
      const right = o.x + o.w - x;
      const top = y - o.y;
      const bottom = o.y + o.h - y;
      const m = Math.min(left, right, top, bottom);
      if (m === left) x = o.x - r;
      else if (m === right) x = o.x + o.w + r;
      else if (m === top) y = o.y - r;
      else y = o.y + o.h + r;
    }
  }
  const cx = Math.max(r, Math.min(WORLD.w - r, x));
  const cy = Math.max(r, Math.min(WORLD.h - r, y));
  if (cx !== x || cy !== y) hit = true;
  return { x: cx, y: cy, hit };
}

/** A straight-line view check, sampled against the obstacle boxes: used for witnesses and police eyes. */
export function lineOfSight(city, x1, y1, x2, y2) {
  const d = Math.hypot(x2 - x1, y2 - y1);
  const steps = Math.max(1, Math.floor(d / 26));
  for (let i = 1; i < steps; i += 1) {
    const t = i / steps;
    if (insideAny(city.obstacles, x1 + (x2 - x1) * t, y1 + (y2 - y1) * t, -4)) return false;
  }
  return true;
}

/** A point on a road ring around (x, y): where reinforcements and fresh traffic roll in. */
export function roadPointNear(city, rng, x, y, minD, maxD) {
  for (let tries = 0; tries < 14; tries += 1) {
    let px;
    let py;
    if (rng.chance(0.5)) {
      px = rng.pick(city.roadsV) + rng.spread(ROAD_W / 4);
      py = rng.range(80, WORLD.h - 200);
    } else {
      px = rng.range(80, WORLD.w - 80);
      py = rng.pick(city.roadsH) + rng.spread(ROAD_W / 4);
    }
    const d = Math.hypot(px - x, py - y);
    if (d >= minD && d <= maxD) return { x: px, y: py };
  }
  return { x: city.roadsV[1], y: city.roadsH[1] };
}

/** A random stretch of sidewalk anywhere in the city: where pedestrians set off for. */
export function sidewalkPoint(city, rng) {
  if (rng.chance(0.5)) {
    const rx = rng.pick(city.roadsV);
    return { x: rx + rng.sign() * (ROAD_W / 2 + 15), y: rng.range(60, SAND_Y - 40) };
  }
  const ry = rng.pick(city.roadsH);
  return { x: rng.range(60, WORLD.w - 60), y: ry + rng.sign() * (ROAD_W / 2 + 15) };
}

export function createCity(rng) {
  const city = {
    roadsV: ROADS_V,
    roadsH: ROADS_H,
    districts: DISTRICTS,
    buildings: [],
    containers: [],
    obstacles: [],
    palms: [],
    lamps: [],
    parkings: [],
    cranes: [],
    places: {},
    shardSpots: [],
    intersections: [],
  };
  for (const vx of ROADS_V) for (const hy of ROADS_H) city.intersections.push({ x: vx, y: hy });

  const usedNames = new Map();
  const nameFor = (pool) => {
    let name = rng.pick(pool);
    const n = (usedNames.get(name) || 0) + 1;
    usedNames.set(name, n);
    if (n > 1) name = `${name} ${['II', 'III', 'IV', 'V'][Math.min(3, n - 2)]}`;
    return name;
  };

  const xSegs = segments(ROADS_V, WORLD.w);
  const ySegs = segments(ROADS_H, WORLD.h);

  for (const [bx0, bx1] of xSegs) {
    for (const [by0, by1] of ySegs) {
      const x0 = bx0 + SIDEWALK;
      const y0 = by0 + SIDEWALK;
      const x1 = bx1 - SIDEWALK;
      const y1 = by1 - SIDEWALK;
      const w = x1 - x0;
      const h = y1 - y0;
      if (w < 90 || h < 70) continue;
      const cx = (x0 + x1) / 2;
      const cy = (y0 + y1) / 2;
      const district = districtAt(city, cx, cy) || DISTRICTS[4];
      const isHarbor = district.name === 'Harbor District' && cy > 1500;
      const isBeach = by0 >= 2820;

      if (isBeach) {
        // Sand, palms and the odd hut; the water does the rest.
        for (let px = x0 + 30; px < x1 - 10; px += rng.range(70, 120)) {
          city.palms.push({ x: px, y: y0 + rng.range(6, Math.max(10, h - 30)), s: rng.range(0.8, 1.3) });
        }
        if (rng.chance(0.5)) {
          const bw = rng.range(60, 90);
          const bh = rng.range(40, 56);
          const b = { x: cx - bw / 2, y: y0 + 8, w: bw, h: bh, name: nameFor(district.names), color: rng.pick(district.walls), floors: 1, seed: rng.int(1, 99999), district: district.name };
          city.buildings.push(b);
          city.obstacles.push(b);
        }
        continue;
      }

      if (isHarbor) {
        // Container rows with driving gaps, plus a warehouse along the back.
        const wh = { x: x0, y: y0, w: Math.min(w, 300), h: 64, name: nameFor(district.names), color: rng.pick(district.walls), floors: 2, seed: rng.int(1, 99999), district: district.name };
        city.buildings.push(wh);
        city.obstacles.push(wh);
        const colors = ['#c65a3a', '#3a7ca6', '#4d9e6b', '#b98a2f', '#7a6fb0'];
        for (let ry = y0 + 92; ry + 38 <= y1; ry += 62) {
          for (let rx = x0 + rng.range(0, 30); rx + 96 <= x1; rx += rng.range(112, 150)) {
            if (rng.chance(0.18)) continue;
            const c = { x: rx, y: ry, w: 96, h: 38, color: rng.pick(colors), seed: rng.int(1, 99999), container: true };
            city.containers.push(c);
            city.obstacles.push(c);
          }
        }
        continue;
      }

      // Ordinary block: cut it into plots with alleys between.
      const cols = w > 430 ? 3 : w > 240 ? 2 : 1;
      const rows = h > 330 ? 2 : 1;
      const pw = (w - (cols - 1) * 16) / cols;
      const ph = (h - (rows - 1) * 16) / rows;
      for (let i = 0; i < cols; i += 1) {
        for (let j = 0; j < rows; j += 1) {
          const px = x0 + i * (pw + 16);
          const py = y0 + j * (ph + 16);
          const roll = rng();
          if (roll < 0.64) {
            const inset = rng.range(2, 12);
            const b = {
              x: px + inset, y: py + inset, w: pw - inset * 2, h: ph - inset * 2,
              name: nameFor(district.names), color: rng.pick(district.walls),
              floors: rng.int(district.floors[0], district.floors[1]),
              seed: rng.int(1, 99999), district: district.name,
            };
            city.buildings.push(b);
            city.obstacles.push(b);
          } else if (roll < 0.8) {
            city.parkings.push({ x: px, y: py, w: pw, h: ph });
          } else {
            city.palms.push({ x: px + pw / 2 + rng.spread(20), y: py + ph / 2 + rng.spread(14), s: rng.range(0.85, 1.25) });
            if (rng.chance(0.6)) city.palms.push({ x: px + rng.range(14, pw - 14), y: py + rng.range(14, ph - 14), s: rng.range(0.7, 1) });
          }
        }
      }
    }
  }

  // Hand-placed places the story leans on; anything generated underneath them is removed.
  const place = (b, key, door) => {
    for (let i = city.obstacles.length - 1; i >= 0; i -= 1) {
      const o = city.obstacles[i];
      if (o.container) continue;
      if (o.x < b.x + b.w + 30 && o.x + o.w > b.x - 30 && o.y < b.y + b.h + 30 && o.y + o.h > b.y - 30) {
        city.obstacles.splice(i, 1);
        const bi = city.buildings.indexOf(o);
        if (bi >= 0) city.buildings.splice(bi, 1);
      }
    }
    city.buildings.push(b);
    city.obstacles.push(b);
    city.places[key] = door;
  };
  place({ x: 1995, y: 1395, w: 180, h: 105, name: "Vega's Garage", color: '#e86a92', floors: 2, seed: 777, district: 'Neon Mile', special: 'garage' }, 'garageDoor', { x: 2085, y: 1525 });
  place({ x: 1235, y: 450, w: 190, h: 120, name: 'Solmar General Hospital', color: '#eef2f4', floors: 5, seed: 555, district: 'Downtown Solmar', special: 'hospital' }, 'hospitalDoor', { x: 1330, y: 600 });
  place({ x: 2435, y: 450, w: 190, h: 120, name: 'Solmar PD — Central', color: '#9fb4c7', floors: 4, seed: 444, district: 'Old Town', special: 'police' }, 'policeDoor', { x: 2530, y: 600 });
  city.places.marisol = { x: 2085, y: 1565 };
  city.places.health = { x: 1330, y: 648 };
  city.places.harborPickup = { x: 3760, y: 2560 };
  city.places.containerCash = { x: 4035, y: 2210 };
  city.places.raceStart = { x: 520, y: 2760 };
  city.places.pistol = { x: 2930, y: 690 };
  city.places.armor = { x: 2530, y: 650 };

  // A forecourt east of Vega's Garage where customers (and Rocco) leave their cars;
  // whatever generation put there is cleared, as for the hand-placed buildings.
  const forecourt = { x: 2210, y: 1506, w: 150, h: 82 };
  for (let i = city.obstacles.length - 1; i >= 0; i -= 1) {
    const o = city.obstacles[i];
    if (o.container || o.special) continue;
    if (o.x < forecourt.x + forecourt.w && o.x + o.w > forecourt.x && o.y < forecourt.y + forecourt.h && o.y + o.h > forecourt.y) {
      city.obstacles.splice(i, 1);
      const bi = city.buildings.indexOf(o);
      if (bi >= 0) city.buildings.splice(bi, 1);
    }
  }
  city.parkings.push(forecourt);

  // Cranes over the harbor yard.
  city.cranes = [
    { x: 3560, y: 2140, angle: 0.6 },
    { x: 3880, y: 2440, angle: 2.4 },
    { x: 3620, y: 2720, angle: 5.6 },
  ];
  for (const c of city.cranes) {
    const post = { x: c.x - 14, y: c.y - 14, w: 28, h: 28, cranePost: true };
    city.obstacles.push(post);
  }

  // Palms along the beach promenade and the Palm Heights avenues.
  for (let x = 90; x < WORLD.w - 120; x += rng.range(85, 150)) {
    city.palms.push({ x, y: 2952 + rng.spread(16), s: rng.range(0.9, 1.45) });
  }
  for (const rx of ROADS_V) {
    for (let y = 1100; y < 2240; y += rng.range(120, 200)) {
      if (rx < 1150) city.palms.push({ x: rx - ROAD_W / 2 - 16, y, s: rng.range(0.8, 1.2) });
    }
  }

  // Street lamps down both sides of every road.
  for (const rx of ROADS_V) {
    for (let y = 120; y < SAND_Y; y += 210) {
      city.lamps.push({ x: rx - ROAD_W / 2 - 11, y });
      city.lamps.push({ x: rx + ROAD_W / 2 + 11, y: y + 105 });
    }
  }
  for (const ry of ROADS_H) {
    for (let x = 150; x < WORLD.w - 80; x += 210) {
      city.lamps.push({ x, y: ry - ROAD_W / 2 - 11 });
      city.lamps.push({ x: x + 105, y: ry + ROAD_W / 2 + 11 });
    }
  }

  // Twenty neon shards, hidden on sidewalks all over the city.
  for (let i = 0; i < 20; i += 1) {
    const p = sidewalkPoint(city, rng);
    city.shardSpots.push({ id: i, x: p.x, y: p.y });
  }

  return city;
}
