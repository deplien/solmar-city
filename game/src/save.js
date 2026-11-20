// The save game: one JSON record in localStorage holding the things that make a run yours —
// cash, respect, where the story stands, which neon shards are already in your pocket, the
// pistol if you found one, and where Rocco was standing when you left. Storage can be off
// (private windows, blocked cookies), so every access is wrapped: a game that cannot save
// still plays, it just forgets between visits. saveGame writes, loadSaveData only reads,
// applySave folds a loaded record into a fresh state, and clearSave wipes it outright.
import { SAVE_KEY } from './config.js';

/** Write the player's progress. Returns true when it actually landed. */
export function saveGame(G) {
  const data = {
    cash: Math.round(G.cash),
    respect: Math.round(G.respect),
    missionIndex: G.mission.index,
    storyDone: G.mission.storyDone,
    shards: [...G.shardsCollected],
    hasPistol: G.player.hasPistol,
    hp: Math.round(G.player.hp),
    armor: Math.round(G.player.armor),
    x: Math.round(G.player.x),
    y: Math.round(G.player.y),
    minutes: Math.round(G.clock.minutes),
    day: G.clock.day,
  };
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

/** Read a previous save, or null when there is none worth trusting. */
export function loadSaveData() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data !== 'object' || data === null) return null;
    if (!Number.isFinite(data.cash) || !Number.isFinite(data.missionIndex)) return null;
    return data;
  } catch {
    return null;
  }
}

/** Fold a loaded save back into a fresh game state. */
export function applySave(G, data) {
  G.cash = data.cash | 0;
  G.respect = data.respect | 0;
  G.mission.index = Math.max(0, Math.min(5, data.missionIndex | 0));
  G.mission.storyDone = !!data.storyDone;
  G.shardsCollected = new Set(Array.isArray(data.shards) ? data.shards : []);
  G.player.hasPistol = !!data.hasPistol;
  if (G.player.hasPistol) G.player.weapon = 'pistol';
  if (Number.isFinite(data.hp)) G.player.hp = Math.max(20, Math.min(100, data.hp));
  if (Number.isFinite(data.armor)) G.player.armor = Math.max(0, Math.min(100, data.armor));
  if (Number.isFinite(data.x) && Number.isFinite(data.y)) {
    G.player.x = data.x;
    G.player.y = data.y;
  }
  if (Number.isFinite(data.minutes)) G.clock.minutes = data.minutes;
  if (Number.isFinite(data.day)) G.clock.day = Math.max(1, data.day | 0);
}

/** Forget the save entirely (the title screen's New Game does this). */
export function clearSave() {
  try {
    window.localStorage.removeItem(SAVE_KEY);
  } catch {
    // Nothing to forget when storage itself is unavailable.
  }
}
