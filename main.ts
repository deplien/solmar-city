// Entry point for the "Neon Tide: Solmar City" bounty submission.
//
// Run it with Node 22 (`node main.ts`); there is nothing to install.
// It assembles the deliverable in the output directory: the playable
// game and its screenshots are staged there first, then the vendored
// dossier builder describes the staged tree and the result is saved
// as dossier.json next to them. Staging happens before the dossier is
// built so the dossier always describes exactly what was shipped.
//
// Node's standard library is the only dependency.

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildDossier } from './vendor/makefun-game.ts';

// The folder this file lives in; the game/ and screenshots/ sources sit
// right beside it in the repository.
const here = dirname(fileURLToPath(import.meta.url));

// Where the finished entry goes. The harness may redirect it through the
// environment; /output is the conventional destination.
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// Copy one source folder into the output tree, making sure the target
// directory exists first. A missing source is only tolerated where the
// caller says so (screenshots are nice to have, the game is not).
function stageFolder(name: string, required: boolean): void {
  const from = join(here, name);
  if (!existsSync(from)) {
    if (required) {
      throw new Error(`cannot stage the entry: ${from} is missing`);
    }
    return;
  }
  const to = join(outDir, name);
  mkdirSync(to, { recursive: true });
  cpSync(from, to, { recursive: true });
}

mkdirSync(outDir, { recursive: true });

stageFolder('game', true);

// The screenshots folder must exist in the output even when the repo has
// none to copy, so create it before staging whatever is available.
mkdirSync(join(outDir, 'screenshots'), { recursive: true });
stageFolder('screenshots', false);

// The caps handed to the dossier builder, mirroring the bounty's
// published limits for entry size and screenshot count.
const DOSSIER_CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};

// Describe the staged tree and persist the dossier as the entry's
// dossier.json.
const dossier = buildDossier(outDir, DOSSIER_CAPS);
writeFileSync(join(outDir, 'dossier.json'), dossier);

console.log(`staged Neon Tide: Solmar City into ${outDir} (dossier: ${dossier.byteLength} bytes)`);
