# solmar-city

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/deplien/solmar-city/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/deplien/solmar-city/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

**Neon Tide: Solmar City** is a top-down 2D open-world crime game that runs entirely in the
browser — pure Canvas JavaScript in ES modules, no libraries, no assets, no network requests.
Every building, car, wave and gunshot is drawn with canvas paths or synthesized with WebAudio
at runtime.

You are **Rocco Vale**, a small-time wheelman in the sun-soaked coastal city of Solmar. Fixer
**Marisol Vega** has work for you; the rival **Kaine Family** has other ideas. Steal cars, run
her five-mission story chain, and stay ahead of the Solmar PD.

## The city

- ~4200×3200 px of city in six named districts — Downtown Solmar, Old Town, Palm Heights,
  the Neon Mile, Solmar Central and the Harbor District — plus Solmar Beach and an animated
  sea along the south edge.
- Named buildings with lit windows, palm trees, street lamps, a container harbor with
  cranes, traffic that follows lanes and honks, and pedestrians who stroll, chat, flee
  gunfire and drop cash when knocked down (bloodlessly — they get up across town).
- A full day cycle: golden hour by default, dusk, and neon nights with lit windows, lamp
  pools and headlights.

## What you can do

- **Drive anything**: sedans, taxis, a Vireo GT sports car, pickups, vans — steal any of
  them with E. Arcade physics with handbrake drifts, skid marks, crash damage and wrecks.
- **Fight**: fists from the start, a pistol to find in an Old Town alley (officers drop
  them too), armour at the police station, health at the hospital.
- **Get wanted**: 0–5 stars. Witnessed crimes raise your heat; police cruisers hunt in
  packs sized by your stars and foot officers shoot from three stars. Break line of sight
  to cool off — or get held and BUSTED, or dropped and WASTED.
- **Work**: a 5-mission story chain from Marisol Vega — *First Wheels*, *Hot Package*,
  *Tail Trouble*, *Harbor Heat* and the *Neon Tide* street race against Dario Kaine —
  plus taxi fares, courier runs, and 20 hidden neon shards.
- **Keep it**: cash, respect, story progress, shards and your position save to
  localStorage; Continue picks up where you left off.

## Under the hood

The source is split one job per file under `game/src/`: `city.js` generates the city and
its collision data, `traffic.js` owns the cars and their shared physics, `police.js` the
wanted system, `missions.js` the story and side jobs, `render.js` the world and its day /
night lighting, `hud.js` and `minimap.js` the interface, `audio.js` the synthesized sound,
and `main.js` the loop that conducts them. The four screenshots this entry is judged by are
deterministic scenes of the real game — open `game/index.html?shot=cover&seed=1` (or
`chase`, `mission`, `title`) to see them staged live.

## Controls

| Keys | Action |
| --- | --- |
| WASD / arrows | Walk and drive |
| Shift | Sprint |
| Mouse | Aim |
| Click / F | Punch or shoot |
| R / 1 / 2 / wheel | Reload / fists / pistol / switch weapon |
| E | Enter or leave a car |
| Space | Handbrake |
| H | Horn |
| Esc / P | Pause |
| M / N | Music / sound on-off |
| Enter | Confirm, advance dialogue |

## Run it

```sh
node serve.ts
```
(then open http://localhost:8080 — serve.ts serves the repo; the game is game/index.html)

---

<sub>Entered on [make.fun](https://make.fun/?ref=MAKEFUN&utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>
