// Rendering: everything the player sees, drawn on one 2D canvas — the
// sun-soaked city, cars and crowds, glass HUD cards, the live minimap,
// and the title, briefing, pause and ending screens.

import { DISTRICTS, LANDMARKS, PALETTE, TUNING, WORLD } from './config.js';
import { currentMission, currentStep, missionTarget } from './missions.js';

const VIEW_W = 1280;
const VIEW_H = 720;

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function glassCard(ctx, x, y, w, h) {
  ctx.save();
  ctx.fillStyle = PALETTE.hudGlass;
  roundRect(ctx, x, y, w, h, 14);
  ctx.fill();
  ctx.strokeStyle = PALETTE.hudEdge;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();
}

function wrapText(ctx, text, maxWidth) {
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function drawCity(ctx, world, view, hideLabels = false) {
  const { city } = world;
  const { x0, y0, x1, y1 } = view;
  // District ground tints.
  for (const d of DISTRICTS) {
    ctx.fillStyle = d.tint;
    ctx.fillRect(d.x0, d.y0, d.x1 - d.x0, d.y1 - d.y0);
  }
  // South Beach sand + the water line along the bottom edge.
  ctx.fillStyle = PALETTE.sand;
  ctx.fillRect(0, 7 * WORLD.block, 7 * WORLD.block, WORLD.block);
  ctx.fillStyle = PALETTE.water;
  ctx.fillRect(0, WORLD.height - 52, WORLD.width, 52);
  ctx.fillStyle = PALETTE.waterDeep;
  ctx.fillRect(0, WORLD.height - 18, WORLD.width, 18);
  // Marina water.
  for (const w of city.waters) {
    ctx.fillStyle = PALETTE.water;
    ctx.fillRect(w.x, w.y, w.w, w.h);
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 4; i++) {
      const wy = w.y + 40 + i * 70;
      ctx.beginPath();
      ctx.moveTo(w.x + 30, wy);
      ctx.lineTo(w.x + 110, wy);
      ctx.stroke();
    }
  }
  // Parks.
  for (const p of city.parks) {
    if (p.x > x1 || p.x + p.w < x0 || p.y > y1 || p.y + p.h < y0) continue;
    ctx.fillStyle = PALETTE.park;
    ctx.fillRect(p.x, p.y, p.w, p.h);
    ctx.fillStyle = PALETTE.parkDark;
    ctx.fillRect(p.x + 10, p.y + 10, p.w - 20, p.h - 20);
  }
  // Sidewalks then roads.
  const half = WORLD.roadHalf;
  const sw = WORLD.sidewalk;
  ctx.fillStyle = PALETTE.sidewalk;
  for (const x of city.verticalRoads) ctx.fillRect(x - half - sw, 0, (half + sw) * 2, WORLD.height);
  for (const y of city.horizontalRoads) ctx.fillRect(0, y - half - sw, WORLD.width, (half + sw) * 2);
  ctx.fillStyle = PALETTE.road;
  for (const x of city.verticalRoads) ctx.fillRect(x - half, 0, half * 2, WORLD.height);
  for (const y of city.horizontalRoads) ctx.fillRect(0, y - half, WORLD.width, half * 2);
  // Dashed centre lines.
  ctx.strokeStyle = PALETTE.roadLine;
  ctx.lineWidth = 3;
  ctx.setLineDash([26, 30]);
  for (const x of city.verticalRoads) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, WORLD.height);
    ctx.stroke();
  }
  for (const y of city.horizontalRoads) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(WORLD.width, y);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  // Buildings with a soft drop shadow and a roof inset.
  for (const b of city.buildings) {
    if (b.x > x1 || b.x + b.w < x0 || b.y > y1 || b.y + b.h < y0) continue;
    ctx.fillStyle = 'rgba(60, 45, 25, 0.25)';
    ctx.fillRect(b.x + 8, b.y + 10, b.w, b.h);
    ctx.fillStyle = b.color;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = b.roof;
    ctx.fillRect(b.x + 10, b.y + 10, b.w - 20, b.h - 20);
    if (b.tall) {
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      for (let f = 0; f < b.floors; f++) {
        ctx.fillRect(b.x + 16, b.y + 18 + f * 16, b.w - 32, 4);
      }
    }
    ctx.strokeStyle = 'rgba(60,45,25,0.35)';
    ctx.lineWidth = 2;
    ctx.strokeRect(b.x, b.y, b.w, b.h);
  }
  // Trees and palms.
  for (const t of city.trees) {
    if (t.x < x0 - 20 || t.x > x1 + 20 || t.y < y0 - 20 || t.y > y1 + 20) continue;
    if (t.palm) {
      ctx.strokeStyle = '#7a5a3a';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(t.x, t.y + 8);
      ctx.lineTo(t.x, t.y - 8);
      ctx.stroke();
      ctx.strokeStyle = '#4d8a3d';
      ctx.lineWidth = 3;
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
        ctx.beginPath();
        ctx.moveTo(t.x, t.y - 8);
        ctx.lineTo(t.x + Math.cos(a) * 13, t.y - 8 + Math.sin(a) * 10 + 4);
        ctx.stroke();
      }
    } else {
      ctx.fillStyle = '#5d9c4a';
      ctx.beginPath();
      ctx.arc(t.x, t.y, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#79b95e';
      ctx.beginPath();
      ctx.arc(t.x - 3, t.y - 3, 6, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // Landmark labels — skipped where they would collide with the HUD
  // (the top band holds the mission card; the bottom-right holds the map),
  // and hidden entirely behind the title and ending screens.
  if (hideLabels) return;
  ctx.textAlign = 'center';
  ctx.font = '600 13px Trebuchet MS, Verdana, sans-serif';
  for (const lm of Object.values(LANDMARKS)) {
    if (lm.x < x0 - 80 || lm.x > x1 + 80 || lm.y < y0 - 80 || lm.y > y1 + 80) continue;
    const screenX = lm.x - (x0 + 60);
    const screenY = lm.y - 88 - (y0 + 60);
    if (screenY < 140) continue;
    if (screenY > VIEW_H - 210 && screenX > VIEW_W - 290) continue;
    ctx.fillStyle = 'rgba(36,31,24,0.75)';
    const w = ctx.measureText(lm.label).width + 16;
    roundRect(ctx, lm.x - w / 2, lm.y - 88, w, 22, 11);
    ctx.fill();
    ctx.fillStyle = PALETTE.paper;
    ctx.fillText(lm.label, lm.x, lm.y - 73);
  }
}

function drawCarShape(ctx, car, isPlayer, time) {
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.angle);
  // Shadow.
  ctx.fillStyle = 'rgba(40,30,15,0.3)';
  roundRect(ctx, -22, -10 + 4, 46, 24, 8);
  ctx.fill();
  // Wheels.
  ctx.fillStyle = '#1c1a17';
  for (const [wx, wy] of [[-15, -13], [15, -13], [-15, 11], [15, 11]]) {
    ctx.fillRect(wx - 4, wy, 9, 5);
  }
  // Body.
  ctx.fillStyle = car.disabled ? '#6b6560' : car.color;
  roundRect(ctx, -23, -11, 46, 22, 7);
  ctx.fill();
  if (car.kind === 'police') {
    ctx.fillStyle = PALETTE.police;
    ctx.fillRect(-23, -4, 46, 8);
    ctx.fillStyle = '#1c1a17';
    ctx.font = 'bold 8px Verdana, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('SBPD', 0, 8);
    // Flashing light bar.
    const phase = Math.floor(time * 6 + car.sirenPhase) % 2 === 0;
    ctx.fillStyle = phase ? '#ff3b30' : '#2b4fd8';
    ctx.fillRect(-6, -14, 12, 5);
    ctx.fillStyle = phase ? '#2b4fd8' : '#ff3b30';
    ctx.fillRect(-6, 9, 12, 5);
  } else {
    // Cabin + windshield.
    ctx.fillStyle = 'rgba(30,40,55,0.85)';
    roundRect(ctx, -8, -9, 17, 18, 4);
    ctx.fill();
    ctx.fillStyle = 'rgba(180,220,240,0.7)';
    ctx.fillRect(7, -8, 4, 16);
  }
  if (car.disabled) {
    ctx.strokeStyle = 'rgba(30,30,30,0.6)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-20, -8);
    ctx.lineTo(-8, 8);
    ctx.moveTo(-8, -8);
    ctx.lineTo(-20, 8);
    ctx.stroke();
  }
  ctx.restore();
  if (isPlayer) {
    ctx.strokeStyle = PALETTE.gold;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(car.x, car.y, 34, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function drawPerson(ctx, x, y, angle, shirt, isPlayer, dead) {
  ctx.save();
  ctx.translate(x, y);
  if (dead) {
    ctx.rotate(angle + Math.PI / 2);
    ctx.fillStyle = '#8a857e';
    roundRect(ctx, -12, -5, 24, 10, 5);
    ctx.fill();
    ctx.restore();
    return;
  }
  if (isPlayer) {
    ctx.strokeStyle = PALETTE.gold;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(0, 0, 18, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.rotate(angle);
  ctx.fillStyle = '#2b2620';
  ctx.beginPath();
  ctx.arc(2, 0, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = shirt;
  ctx.beginPath();
  ctx.arc(0, 0, 7.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#f2d5b8';
  ctx.beginPath();
  ctx.arc(3, 0, 4.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function drawWorld(ctx, world, opts = {}) {
  const cam = world.camera;
  const shakeX = world.shake ? (Math.random() - 0.5) * world.shake : 0;
  const shakeY = world.shake ? (Math.random() - 0.5) * world.shake : 0;
  const ox = cam.x - VIEW_W / 2 + shakeX;
  const oy = cam.y - VIEW_H / 2 + shakeY;
  const view = { x0: ox - 60, y0: oy - 60, x1: ox + VIEW_W + 60, y1: oy + VIEW_H + 60 };
  ctx.save();
  ctx.translate(-ox, -oy);
  drawCity(ctx, world, view, opts.hideMarkers);

  // Safehouse zone: a soft gold ring so the refuge reads at a glance.
  const s = LANDMARKS.safehouse;
  ctx.fillStyle = 'rgba(242, 183, 5, 0.08)';
  ctx.beginPath();
  ctx.arc(s.x, s.y, TUNING.safehouseRadius, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(242, 183, 5, 0.4)';
  ctx.setLineDash([10, 8]);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(s.x, s.y, TUNING.safehouseRadius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);

  // Mission target beacon (never on the title screen).
  const target = opts.hideMarkers ? null : missionTarget(world);
  if (target) {
    const pulse = 1 + Math.sin(world.time * 4) * 0.15;
    ctx.save();
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = PALETTE.gold;
    ctx.beginPath();
    ctx.arc(target.x, target.y, 60 * pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.translate(target.x, target.y);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = PALETTE.gold;
    ctx.fillRect(-11, -11, 22, 22);
    ctx.fillStyle = PALETTE.ink;
    ctx.fillRect(-5, -5, 10, 10);
    ctx.restore();
  }

  for (const car of world.cars) {
    if (car.x < view.x0 || car.x > view.x1 || car.y < view.y0 || car.y > view.y1) continue;
    const isPlayer = world.player.inCar && world.player.carId === car.id;
    drawCarShape(ctx, car, isPlayer && !opts.hideMarkers, world.time);
  }
  for (const ped of world.peds) {
    if (ped.x < view.x0 || ped.x > view.x1 || ped.y < view.y0 || ped.y > view.y1) continue;
    drawPerson(ctx, ped.x, ped.y, ped.angle, ped.shirt, false, ped.dead);
  }
  for (const cop of world.cops) {
    drawPerson(ctx, cop.x, cop.y, cop.angle, '#2b4fd8', false, false);
  }
  const p = world.player;
  if (!p.inCar) drawPerson(ctx, p.x, p.y, p.angle, '#f2b705', !opts.hideMarkers, false);
  // Bullets.
  ctx.fillStyle = '#ffd94d';
  for (const b of world.bullets) {
    ctx.beginPath();
    ctx.arc(b.x, b.y, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  // Particles.
  for (const part of world.particles) {
    ctx.globalAlpha = Math.max(0, part.life / part.maxLife);
    ctx.fillStyle = part.color;
    ctx.beginPath();
    ctx.arc(part.x, part.y, part.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  // Off-screen target arrow along the viewport edge.
  if (target) {
    const sx = target.x - ox;
    const sy = target.y - oy;
    if (sx < 0 || sx > VIEW_W || sy < 0 || sy > VIEW_H) {
      const cx = VIEW_W / 2;
      const cy = VIEW_H / 2;
      const a = Math.atan2(sy - cy, sx - cx);
      const ex = cx + Math.cos(a) * (VIEW_W / 2 - 60);
      const ey = cy + Math.sin(a) * (VIEW_H / 2 - 60);
      ctx.save();
      ctx.translate(ex, ey);
      ctx.rotate(a);
      ctx.fillStyle = PALETTE.gold;
      ctx.beginPath();
      ctx.moveTo(14, 0);
      ctx.lineTo(-8, -10);
      ctx.lineTo(-8, 10);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }
}

function drawMinimap(ctx, world) {
  const mw = 216;
  const mh = 172;
  const mx = VIEW_W - mw - 18;
  const my = VIEW_H - mh - 18;
  const sx = mw / WORLD.width;
  const sy = mh / WORLD.height;
  glassCard(ctx, mx - 6, my - 6, mw + 12, mh + 12);
  ctx.save();
  roundRect(ctx, mx, my, mw, mh, 8);
  ctx.clip();
  ctx.fillStyle = '#d9cba6';
  ctx.fillRect(mx, my, mw, mh);
  ctx.fillStyle = PALETTE.water;
  ctx.fillRect(mx, my + mh - 8, mw, 8);
  ctx.fillRect(mx + mw - 66, my, 66, 44);
  ctx.strokeStyle = '#4a4238';
  ctx.lineWidth = 2;
  for (const x of world.city.verticalRoads) {
    ctx.beginPath();
    ctx.moveTo(mx + x * sx, my);
    ctx.lineTo(mx + x * sx, my + mh);
    ctx.stroke();
  }
  for (const y of world.city.horizontalRoads) {
    ctx.beginPath();
    ctx.moveTo(mx, my + y * sy);
    ctx.lineTo(mx + mw, my + y * sy);
    ctx.stroke();
  }
  const s = LANDMARKS.safehouse;
  ctx.fillStyle = '#3f9c4d';
  ctx.beginPath();
  ctx.arc(mx + s.x * sx, my + s.y * sy, 4, 0, Math.PI * 2);
  ctx.fill();
  const target = missionTarget(world);
  if (target) {
    const pulse = 4 + Math.sin(world.time * 5) * 1.5;
    ctx.fillStyle = PALETTE.gold;
    ctx.beginPath();
    ctx.arc(mx + target.x * sx, my + target.y * sy, pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
  for (const car of world.cars) {
    if (car.kind !== 'police' || car.driver !== 'police') continue;
    ctx.fillStyle = '#2b4fd8';
    ctx.beginPath();
    ctx.arc(mx + car.x * sx, my + car.y * sy, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  const p = world.player;
  ctx.fillStyle = '#fff';
  ctx.strokeStyle = '#241f18';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(mx + p.x * sx, my + p.y * sy, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function formatTime(t) {
  const m = Math.floor(Math.max(0, t) / 60);
  const s = Math.floor(Math.max(0, t) % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function drawHud(ctx, world, opts = {}) {
  const p = world.player;
  // Cash + health, top-left.
  glassCard(ctx, 18, 18, 230, 76);
  ctx.textAlign = 'left';
  ctx.fillStyle = PALETTE.gold;
  ctx.font = '700 26px Trebuchet MS, Verdana, sans-serif';
  ctx.fillText(`$${world.cash.toLocaleString('en-US')}`, 36, 50);
  ctx.fillStyle = PALETTE.paper;
  ctx.font = '600 11px Trebuchet MS, Verdana, sans-serif';
  ctx.fillText('MARA VOSS', 132, 34);
  ctx.fillStyle = 'rgba(251,246,233,0.25)';
  roundRect(ctx, 36, 62, 194, 12, 6);
  ctx.fill();
  ctx.fillStyle = p.hp > 30 ? '#6bc46b' : '#e86a5a';
  roundRect(ctx, 36, 62, 194 * Math.max(0, p.hp / 100), 12, 6);
  ctx.fill();
  // Wanted stars, top-right.
  glassCard(ctx, VIEW_W - 218, 18, 200, 52);
  ctx.textAlign = 'center';
  ctx.font = '26px Trebuchet MS, Verdana, sans-serif';
  for (let i = 0; i < 5; i++) {
    ctx.fillStyle = i < world.wanted.stars ? '#ffcf3f' : 'rgba(251,246,233,0.22)';
    ctx.fillText('\u2605', VIEW_W - 188 + i * 36, 54);
  }
  // Mission card, top-centre.
  const mission = currentMission(world.mission);
  const step = currentStep(world.mission);
  if (mission && step && world.mission.phase === 'active') {
    const label = `${mission.title}  ·  ${formatTime(world.mission.timer)}`;
    ctx.font = '700 15px Trebuchet MS, Verdana, sans-serif';
    const w1 = ctx.measureText(label).width;
    ctx.font = '13px Trebuchet MS, Verdana, sans-serif';
    const w2 = ctx.measureText(step.text).width;
    const w = Math.max(w1, w2) + 44;
    glassCard(ctx, (VIEW_W - w) / 2, 18, w, 66);
    ctx.textAlign = 'center';
    ctx.fillStyle = world.mission.timer < 30 ? '#ff7a6b' : PALETTE.gold;
    ctx.font = '700 15px Trebuchet MS, Verdana, sans-serif';
    ctx.fillText(label, VIEW_W / 2, 44);
    ctx.fillStyle = PALETTE.paper;
    ctx.font = '13px Trebuchet MS, Verdana, sans-serif';
    ctx.fillText(step.text, VIEW_W / 2, 66);
  } else if (world.mission.phase === 'complete') {
    glassCard(ctx, (VIEW_W - 300) / 2, 18, 300, 46);
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.gold;
    ctx.font = '700 15px Trebuchet MS, Verdana, sans-serif';
    ctx.fillText('\u2605  KING OF SOLARA  ·  FREE ROAM  \u2605', VIEW_W / 2, 47);
  }
  // Speed, bottom-left (in a car).
  if (p.inCar) {
    glassCard(ctx, 18, VIEW_H - 76, 150, 58);
    ctx.textAlign = 'left';
    ctx.fillStyle = PALETTE.paper;
    ctx.font = '700 30px Trebuchet MS, Verdana, sans-serif';
    ctx.fillText(`${Math.round(Math.abs(p.speed) * 0.36)}`, 36, VIEW_H - 38);
    ctx.font = '600 12px Trebuchet MS, Verdana, sans-serif';
    ctx.fillStyle = 'rgba(251,246,233,0.7)';
    ctx.fillText('km/h', 92, VIEW_H - 38);
  }
  // Context prompt.
  if (opts.prompt) {
    ctx.textAlign = 'center';
    ctx.font = '700 16px Trebuchet MS, Verdana, sans-serif';
    const w = ctx.measureText(opts.prompt).width + 36;
    glassCard(ctx, (VIEW_W - w) / 2, VIEW_H - 118, w, 40);
    ctx.fillStyle = PALETTE.paper;
    ctx.fillText(opts.prompt, VIEW_W / 2, VIEW_H - 92);
  }
  // Controls hint, fading — on a glass pill so it reads over any ground.
  if (opts.showHint) {
    const hint = 'WASD drive / walk  ·  E steal & enter car  ·  Mouse aim, click shoot  ·  Shift run  ·  Esc pause  ·  M mute';
    ctx.font = '13px Trebuchet MS, Verdana, sans-serif';
    const w = ctx.measureText(hint).width + 36;
    glassCard(ctx, (VIEW_W - w) / 2, VIEW_H - 218, w, 34);
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(251,246,233,0.9)';
    ctx.fillText(hint, VIEW_W / 2, VIEW_H - 196);
  }
  drawMinimap(ctx, world);
}

function dimScreen(ctx, alpha) {
  ctx.fillStyle = `rgba(18, 14, 8, ${alpha})`;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
}

export function drawTitle(ctx, world, opts = {}) {
  // The real city pans slowly behind the title.
  drawWorld(ctx, world, { hideMarkers: true });
  const grad = ctx.createLinearGradient(0, 0, 0, VIEW_H);
  grad.addColorStop(0, 'rgba(20,14,6,0.55)');
  grad.addColorStop(0.55, 'rgba(20,14,6,0.35)');
  grad.addColorStop(1, 'rgba(20,14,6,0.78)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.textAlign = 'center';
  ctx.fillStyle = PALETTE.gold;
  ctx.font = '700 20px Trebuchet MS, Verdana, sans-serif';
  ctx.fillText('S A L  M A R I N  P R E S E N T S', VIEW_W / 2, 128);
  ctx.fillStyle = PALETTE.paper;
  ctx.font = '900 96px Georgia, serif';
  ctx.fillText('SOLARA BAY', VIEW_W / 2, 232);
  ctx.fillStyle = PALETTE.gold;
  ctx.fillRect(VIEW_W / 2 - 140, 258, 280, 4);
  ctx.fillStyle = PALETTE.paper;
  ctx.font = 'italic 21px Georgia, serif';
  ctx.fillText('Mara Voss owes the night market. Five jobs stand between her', VIEW_W / 2, 306);
  ctx.fillText('and running this sun-soaked city. Steal cars. Outrun the SBPD. Deliver.', VIEW_W / 2, 334);
  const blink = Math.floor(world.time * 1.6) % 2 === 0;
  if (blink || opts.hasSave) {
    ctx.font = '700 26px Trebuchet MS, Verdana, sans-serif';
    ctx.fillStyle = PALETTE.gold;
    ctx.fillText(opts.hasSave ? 'ENTER — CONTINUE YOUR STORY' : 'ENTER — START THE STORY', VIEW_W / 2, 420);
  }
  if (opts.hasSave) {
    ctx.fillStyle = 'rgba(251,246,233,0.75)';
    ctx.font = '15px Trebuchet MS, Verdana, sans-serif';
    ctx.fillText('or press N for a new game', VIEW_W / 2, 450);
  }
  ctx.fillStyle = 'rgba(251,246,233,0.85)';
  ctx.font = '15px Trebuchet MS, Verdana, sans-serif';
  ctx.fillText('WASD walk & drive   ·   E steal / enter / exit car   ·   Mouse aim + click shoot', VIEW_W / 2, 560);
  ctx.fillText('Shift run   ·   Space brake   ·   Esc pause   ·   M mute', VIEW_W / 2, 586);
  ctx.fillStyle = 'rgba(251,246,233,0.55)';
  ctx.font = '13px Trebuchet MS, Verdana, sans-serif';
  ctx.fillText('An original open-world crime game — its city, characters and story are all its own.', VIEW_W / 2, 664);
  ctx.fillText('Progress autosaves. Five missions. $2,750 on the table.', VIEW_W / 2, 686);
}

export function drawBriefing(ctx, world) {
  dimScreen(ctx, 0.45);
  const mission = currentMission(world.mission);
  if (!mission) return;
  const w = 640;
  const h = 330;
  const x = (VIEW_W - w) / 2;
  const y = (VIEW_H - h) / 2;
  glassCard(ctx, x, y, w, h);
  // Sal Marin's monogram.
  ctx.fillStyle = PALETTE.gold;
  ctx.beginPath();
  ctx.arc(x + 62, y + 62, 30, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = PALETTE.ink;
  ctx.font = '700 22px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.fillText('SM', x + 62, y + 70);
  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(251,246,233,0.7)';
  ctx.font = '600 13px Trebuchet MS, Verdana, sans-serif';
  ctx.fillText(`SAL MARIN  ·  JOB ${world.mission.index + 1} OF 5`, x + 106, y + 48);
  ctx.fillStyle = PALETTE.paper;
  ctx.font = '700 30px Georgia, serif';
  ctx.fillText(mission.title, x + 106, y + 82);
  ctx.font = '16px Georgia, serif';
  ctx.fillStyle = 'rgba(251,246,233,0.92)';
  const lines = wrapText(ctx, mission.brief, w - 72);
  lines.forEach((line, i) => ctx.fillText(line, x + 36, y + 132 + i * 24));
  ctx.fillStyle = PALETTE.gold;
  ctx.font = '700 18px Trebuchet MS, Verdana, sans-serif';
  ctx.fillText(`Reward  $${mission.reward}    ·    Time limit  ${formatTime(mission.time)}`, x + 36, y + h - 58);
  ctx.fillStyle = 'rgba(251,246,233,0.7)';
  ctx.font = '14px Trebuchet MS, Verdana, sans-serif';
  ctx.fillText('Press ENTER to start the job', x + 36, y + h - 30);
}

export function drawCenterMessage(ctx, title, lines, accent = PALETTE.gold) {
  dimScreen(ctx, 0.6);
  ctx.textAlign = 'center';
  ctx.fillStyle = accent;
  ctx.font = '900 64px Georgia, serif';
  ctx.fillText(title, VIEW_W / 2, VIEW_H / 2 - 40);
  ctx.fillStyle = PALETTE.paper;
  ctx.font = '18px Georgia, serif';
  lines.forEach((line, i) => ctx.fillText(line, VIEW_W / 2, VIEW_H / 2 + 8 + i * 28));
  ctx.fillStyle = 'rgba(251,246,233,0.7)';
  ctx.font = '15px Trebuchet MS, Verdana, sans-serif';
  ctx.fillText('Press ENTER to continue', VIEW_W / 2, VIEW_H / 2 + 120);
}

export function drawComplete(ctx, world) {
  drawWorld(ctx, world, { hideMarkers: true });
  dimScreen(ctx, 0.55);
  ctx.textAlign = 'center';
  ctx.fillStyle = PALETTE.gold;
  ctx.font = '700 22px Trebuchet MS, Verdana, sans-serif';
  ctx.fillText('T H E  D E B T  I S  P A I D', VIEW_W / 2, 190);
  ctx.fillStyle = PALETTE.paper;
  ctx.font = '900 84px Georgia, serif';
  ctx.fillText('KING OF SOLARA', VIEW_W / 2, 286);
  ctx.fillStyle = PALETTE.gold;
  ctx.fillRect(VIEW_W / 2 - 140, 312, 280, 4);
  ctx.fillStyle = PALETTE.paper;
  ctx.font = 'italic 20px Georgia, serif';
  ctx.fillText('Five jobs. One city. Mara Voss runs Solara Bay now.', VIEW_W / 2, 360);
  ctx.font = '700 24px Trebuchet MS, Verdana, sans-serif';
  ctx.fillStyle = PALETTE.gold;
  ctx.fillText(`Final cash  $${world.cash.toLocaleString('en-US')}`, VIEW_W / 2, 430);
  ctx.fillStyle = 'rgba(251,246,233,0.85)';
  ctx.font = '16px Trebuchet MS, Verdana, sans-serif';
  ctx.fillText('Free roam unlocked — the whole city is yours. Press ENTER to keep playing.', VIEW_W / 2, 480);
}

export { VIEW_W, VIEW_H };
