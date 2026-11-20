// Neon Tide: Solmar City — every shared tuning number and colour lives in this one file, so
// the rest of the game can be about behaviour instead of magic numbers. The world is a fixed
// 4200x3200 patch of canvas space; the camera only ever shows a window of it, so nothing in
// here depends on the player's screen size. Modules import these constants by name — WORLD,
// PALETTE, PLAYER, WANTED and friends — and never redefine them locally.

export const WORLD = { w: 4200, h: 3200 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display rate. */
export const STEP = 1 / 60;

/** Road width in px. Traffic lanes sit LANE_OFF to each side of a road's centre line. */
export const ROAD_W = 120;
export const LANE_OFF = 30;
/** The band of sidewalk kept clear around every block before a building may stand on it. */
export const SIDEWALK = 24;

/** The south edge of the map: sand starts at SAND_Y, open water at WATER_Y. */
export const SAND_Y = 2910;
export const WATER_Y = 3050;

/** The clock opens at golden hour on day one; one real second is worth this many game minutes. */
export const DAY_START_MINUTES = 17 * 60 + 15;
export const MINUTES_PER_SECOND = 0.9;

export const PLAYER = {
  radius: 13,
  walkSpeed: 178,
  sprintSpeed: 268,
  maxHealth: 100,
  maxArmor: 100,
  punchRange: 56,
  punchArc: 1.2,
  punchDamage: 34,
  punchCooldown: 0.34,
  pistolRange: 560,
  pistolDamage: 42,
  pistolCooldown: 0.23,
  pistolMag: 12,
  enterRange: 66,
  pickupRange: 30,
};

export const WANTED = {
  /** Heat points per star: a witnessed car theft is worth roughly one star, a shooting two. */
  perStar: 22,
  maxHeat: 115,
  /** Heat lost per second once nobody in uniform has seen the player for hideSeconds. */
  drainPerSecond: 3.4,
  hideSeconds: 5,
  /** How long an officer must hold the player nearly still, in seconds, to make the bust. */
  bustSeconds: 1.6,
  bustRange: 52,
};

export const PALETTE = {
  road: '#43464e',
  roadEdge: '#2e3036',
  laneMark: '#e9dcb4',
  crosswalk: '#cfd4d8',
  sidewalk: '#b3a68f',
  sidewalkEdge: '#8f8471',
  sand: '#eed491',
  sandWet: '#dfc078',
  water: '#2f80a8',
  waterDeep: '#22688e',
  waterSparkle: '#bfe8f7',
  grass: '#7cab5c',
  plaza: '#c9b894',
  neonPink: '#ff4fa3',
  neonCyan: '#37e0d8',
  neonAmber: '#ffb340',
  gold: '#ffd94d',
  text: '#f4f1e8',
  textDim: '#b9b4a4',
  danger: '#ff5147',
  health: '#58d977',
  armor: '#57b6ff',
  panel: 'rgba(16, 18, 26, 0.78)',
  panelEdge: 'rgba(255, 217, 77, 0.55)',
};

export const FONT = '"Segoe UI", system-ui, -apple-system, "Helvetica Neue", sans-serif';

/** Where the save game is kept between visits (this browser only). */
export const SAVE_KEY = 'neon-tide.solmar-city.save.v1';
