// The HUD: everything the player needs without leaving the world — cash and respect,
// the clock, wanted stars that blink while the heat cools, health and armour, the weapon
// in hand, a speedometer in a car, the objective banner with its distance, the arrow that
// points off-screen toward it, toasts, the bust meter, Marisol's dialogue box, and the
// mission-complete splash. The minimap has its own module; this is everything else.
import { PALETTE, FONT, PLAYER } from './config.js';
import { clamp, dist } from './random.js';
import { drawMinimap } from './minimap.js';

function bar(ctx, x, y, w, h, frac, color, label) {
  ctx.fillStyle = 'rgba(10, 11, 16, 0.72)';
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 4);
  ctx.fill();
  if (frac > 0) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(x + 1.5, y + 1.5, (w - 3) * clamp(frac, 0, 1), h - 3, 3);
    ctx.fill();
  }
  ctx.fillStyle = 'rgba(244, 241, 232, 0.9)';
  ctx.font = `700 10px ${FONT}`;
  ctx.fillText(label, x + 6, y + h - 3.5);
}

function wrapText(ctx, text, maxW) {
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > maxW && line) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

export function drawHUD(ctx, G) {
  const { w: W, h: H } = G.view;
  drawMinimap(ctx, G);

  // Cash, respect and shards, top-left.
  ctx.fillStyle = PALETTE.panel;
  ctx.beginPath();
  ctx.roundRect(14, 14, 196, 74, 10);
  ctx.fill();
  ctx.fillStyle = PALETTE.gold;
  ctx.font = `800 25px ${FONT}`;
  ctx.fillText(`$${Math.round(G.cash)}`, 26, 46);
  ctx.fillStyle = PALETTE.textDim;
  ctx.font = `600 13px ${FONT}`;
  ctx.fillText(`RESPECT ${Math.round(G.respect)}`, 26, 68);
  ctx.fillStyle = PALETTE.neonCyan;
  ctx.fillText(`◆ ${G.shardsCollected.size}/20`, 128, 68);

  // Clock and wanted stars, top-right.
  const hh = Math.floor(G.clock.minutes / 60) % 24;
  const mm = Math.floor(G.clock.minutes % 60);
  ctx.textAlign = 'right';
  ctx.fillStyle = PALETTE.panel;
  ctx.beginPath();
  ctx.roundRect(W - 178, 14, 164, 40, 10);
  ctx.fill();
  ctx.fillStyle = PALETTE.text;
  ctx.font = `700 19px ${FONT}`;
  ctx.fillText(`Day ${G.clock.day} · ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`, W - 28, 41);
  const stars = G.wanted.stars;
  if (stars > 0) {
    const blink = !G.wanted.seen && G.wanted.lastSeen > 1.2 ? (Math.floor(G.time * 3) % 2 === 0 ? 0.35 : 1) : 1;
    ctx.font = `26px ${FONT}`;
    for (let i = 0; i < 5; i += 1) {
      ctx.globalAlpha = i < stars ? blink : 0.25;
      ctx.fillStyle = i < stars ? PALETTE.gold : '#8b93a3';
      ctx.fillText('★', W - 30 - (4 - i) * 30, 82);
    }
    ctx.globalAlpha = 1;
    // Whether the law currently has eyes on you decides if the stars are cooling.
    ctx.font = `700 11px ${FONT}`;
    ctx.fillStyle = G.wanted.seen ? PALETTE.danger : PALETTE.health;
    ctx.fillText(G.wanted.seen ? 'SPOTTED' : 'HIDDEN — HEAT FALLING', W - 28, 100);
  }
  ctx.textAlign = 'left';

  // Objective banner, top-centre, with the distance in metres.
  if (G.objective) {
    const o = G.objective;
    const d = Math.round(dist(G.player.x, G.player.y, o.x, o.y) / 10);
    ctx.font = `700 16px ${FONT}`;
    const labelW = ctx.measureText(o.label).width;
    ctx.font = `12px ${FONT}`;
    const subW = o.sub ? ctx.measureText(`${o.sub} · ${d}m`).width : 0;
    const bw = Math.max(labelW, subW) + 44;
    const bx = (W - bw) / 2;
    ctx.fillStyle = PALETTE.panel;
    ctx.beginPath();
    ctx.roundRect(bx, 14, bw, o.sub ? 52 : 38, 10);
    ctx.fill();
    ctx.strokeStyle = PALETTE.panelEdge;
    ctx.lineWidth = 1.6;
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.gold;
    ctx.font = `700 16px ${FONT}`;
    ctx.fillText(o.label, W / 2, 37);
    if (o.sub) {
      ctx.fillStyle = PALETTE.textDim;
      ctx.font = `12px ${FONT}`;
      ctx.fillText(`${o.sub} · ${d}m`, W / 2, 56);
    }
    ctx.textAlign = 'left';

    // Edge arrow when the objective is off-screen.
    const sx = o.x - G.camera.x;
    const sy = o.y - G.camera.y;
    if (!o.hideMarker && (sx < 30 || sx > W - 30 || sy < 30 || sy > H - 30)) {
      const ang = Math.atan2(sy - H / 2, sx - W / 2);
      const ax = clamp(sx, 44, W - 44);
      const ay = clamp(sy, 84, H - 44);
      ctx.save();
      ctx.translate(ax, ay);
      ctx.rotate(ang);
      ctx.fillStyle = PALETTE.gold;
      ctx.beginPath();
      ctx.moveTo(15, 0);
      ctx.lineTo(-9, -9);
      ctx.lineTo(-9, 9);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  // Toasts under the stars.
  ctx.font = `600 14px ${FONT}`;
  G.toasts.forEach((toast, i) => {
    const a = clamp(toast.t / 0.6, 0, 1);
    ctx.globalAlpha = a;
    const tw = ctx.measureText(toast.text).width + 24;
    ctx.fillStyle = PALETTE.panel;
    ctx.beginPath();
    ctx.roundRect(W - tw - 14, 96 + i * 34, tw, 27, 8);
    ctx.fill();
    ctx.fillStyle = toast.color;
    ctx.fillText(toast.text, W - tw - 2, 114 + i * 34);
  });
  ctx.globalAlpha = 1;

  // Health, armour, weapon and speed, bottom-right.
  const bx = W - 224;
  bar(ctx, bx, H - 66, 210, 15, G.player.hp / PLAYER.maxHealth, G.player.hp < 30 ? PALETTE.danger : PALETTE.health, 'HEALTH');
  bar(ctx, bx, H - 46, 210, 15, G.player.armor / PLAYER.maxArmor, PALETTE.armor, 'ARMOUR');
  ctx.fillStyle = PALETTE.text;
  ctx.font = `700 14px ${FONT}`;
  ctx.textAlign = 'right';
  if (G.player.car) {
    const kmh = Math.round(Math.abs(G.player.car.speed) * 0.36);
    ctx.fillStyle = PALETTE.panel;
    ctx.beginPath();
    ctx.roundRect(W - 150, H - 128, 136, 52, 10);
    ctx.fill();
    ctx.fillStyle = PALETTE.text;
    ctx.font = `800 27px ${FONT}`;
    ctx.fillText(`${kmh}`, W - 62, H - 94);
    ctx.font = `600 11px ${FONT}`;
    ctx.fillStyle = PALETTE.textDim;
    ctx.fillText('km/h', W - 26, H - 94);
  }
  ctx.fillStyle = PALETTE.textDim;
  ctx.font = `700 13px ${FONT}`;
  const weaponText = G.player.weapon === 'pistol' && G.player.hasPistol
    ? (G.player.reloading > 0 ? 'PISTOL · RELOADING' : `PISTOL · ${G.player.ammo}/${PLAYER.pistolMag}`)
    : 'FISTS';
  ctx.fillText(weaponText, W - 14, H - 84);
  ctx.textAlign = 'left';

  // The bust meter, centre screen, while an officer has hold of you.
  if (G.wanted.bustTimer > 0.1) {
    const frac = clamp(G.wanted.bustTimer / 1.6, 0, 1);
    ctx.fillStyle = PALETTE.panel;
    ctx.beginPath();
    ctx.roundRect(W / 2 - 130, H * 0.62, 260, 34, 9);
    ctx.fill();
    ctx.fillStyle = '#3a7bff';
    ctx.beginPath();
    ctx.roundRect(W / 2 - 124, H * 0.62 + 16, 248 * frac, 12, 6);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = `800 13px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText('GET FREE — KEEP MOVING', W / 2, H * 0.62 + 13);
    ctx.textAlign = 'left';
  }

  // Interaction prompt.
  if (G.prompt) {
    ctx.font = `700 15px ${FONT}`;
    const tw = ctx.measureText(G.prompt).width + 26;
    ctx.fillStyle = PALETTE.panel;
    ctx.beginPath();
    ctx.roundRect(W / 2 - tw / 2, H - 118, tw, 30, 9);
    ctx.fill();
    ctx.fillStyle = PALETTE.gold;
    ctx.textAlign = 'center';
    ctx.fillText(G.prompt, W / 2, H - 98);
    ctx.textAlign = 'left';
  }

  // Mission-complete splash.
  if (G.splash && G.splash.t > 0) {
    const t = G.splash.t;
    const a = clamp(t / 0.7, 0, 1) * clamp((3.4 - t) / 0.4 + 0.6, 0, 1);
    ctx.globalAlpha = Math.min(1, a + 0.35);
    ctx.textAlign = 'center';
    ctx.save();
    ctx.shadowColor = PALETTE.gold;
    ctx.shadowBlur = 22;
    ctx.fillStyle = '#ffffff';
    ctx.font = `900 44px ${FONT}`;
    ctx.fillText(G.splash.title, W / 2, H * 0.3);
    ctx.restore();
    ctx.fillStyle = PALETTE.gold;
    ctx.font = `700 18px ${FONT}`;
    ctx.fillText(G.splash.sub, W / 2, H * 0.3 + 34);
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
  }

  // Dialogue box: Marisol (or the moment) speaks.
  if (G.dialogue) {
    const d = G.dialogue;
    const bw = Math.min(780, W - 70);
    const bx = (W - bw) / 2;
    const by = H - 168;
    ctx.fillStyle = PALETTE.panel;
    ctx.beginPath();
    ctx.roundRect(bx, by, bw, 104, 12);
    ctx.fill();
    ctx.strokeStyle = PALETTE.neonPink;
    ctx.lineWidth = 1.6;
    ctx.stroke();
    ctx.fillStyle = PALETTE.neonPink;
    ctx.font = `800 14px ${FONT}`;
    ctx.fillText(d.speaker.toUpperCase(), bx + 20, by + 26);
    ctx.fillStyle = PALETTE.text;
    ctx.font = `16.5px ${FONT}`;
    const lines = wrapText(ctx, d.lines[d.i], bw - 40);
    lines.slice(0, 3).forEach((line, i) => ctx.fillText(line, bx + 20, by + 52 + i * 21));
    if (Math.floor(G.time * 1.6) % 2 === 0) {
      ctx.fillStyle = PALETTE.gold;
      ctx.font = `700 13px ${FONT}`;
      ctx.textAlign = 'right';
      ctx.fillText('Enter ▸', bx + bw - 18, by + 92);
      ctx.textAlign = 'left';
    }
  }
}
