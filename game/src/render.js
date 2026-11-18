// Canvas renderer for Solara Bay: the city, its traffic and people, the HUD
// with minimap, and every screen. All art is drawn in code — no image files.
import { CAR, COLORS, COLS, DISTRICTS, PITCH, ROAD_W, ROWS, WORLD_H, WORLD_W, districtAt } from './config.js';
import { PLACES } from './city.js';
import { MISSIONS } from './missions.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';
export const SCREEN_BUSTED = 'busted';
export const SCREEN_COMPLETE = 'complete';

const VIEW_W = 1280;
const VIEW_H = 720;
const MINI_W = 210;
const MINI_H = 168;

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const camera = { x: 0, y: 0, zoom: 1 };
  camera.toWorld = (sx, sy) => ({ x: camera.x + sx / camera.zoom, y: camera.y + sy / camera.zoom });

  function drawCity(state) {
    const { city } = state;
    // Ground.
    ctx.fillStyle = COLORS.grass;
    ctx.fillRect(0, 0, WORLD_W, WORLD_H);
    // Sea along the south edge.
    ctx.fillStyle = COLORS.sea;
    ctx.fillRect(0, WORLD_H - 40, WORLD_W, 40);
    ctx.fillStyle = COLORS.seaDeep;
    for (let x = 0; x < WORLD_W; x += 90) {
      ctx.fillRect(x + ((state.time * 12 + x) % 90), WORLD_H - 30, 46, 3);
    }
    // Beach strip (south block row).
    ctx.fillStyle = COLORS.sand;
    ctx.fillRect(0, (ROWS - 1) * PITCH + ROAD_W / 2, WORLD_W, PITCH - ROAD_W / 2);
    // Parks.
    for (const park of city.parks) {
      ctx.fillStyle = COLORS.park;
      ctx.fillRect(park.x0, park.y0, park.x1 - park.x0, park.y1 - park.y0);
      ctx.strokeStyle = '#d9c98f';
      ctx.lineWidth = 4;
      ctx.strokeRect(park.x0 + 8, park.y0 + 8, park.x1 - park.x0 - 16, park.y1 - park.y0 - 16);
    }
    // Sidewalks, then roads.
    ctx.fillStyle = COLORS.sidewalk;
    for (let i = 0; i <= COLS; i += 1) ctx.fillRect(i * PITCH - ROAD_W / 2 - 10, 0, ROAD_W + 20, WORLD_H);
    for (let j = 0; j <= ROWS; j += 1) ctx.fillRect(0, j * PITCH - ROAD_W / 2 - 10, WORLD_W, ROAD_W + 20);
    ctx.fillStyle = COLORS.road;
    for (let i = 0; i <= COLS; i += 1) ctx.fillRect(i * PITCH - ROAD_W / 2, 0, ROAD_W, WORLD_H);
    for (let j = 0; j <= ROWS; j += 1) ctx.fillRect(0, j * PITCH - ROAD_W / 2, WORLD_W, ROAD_W);
    // Lane dashes (skip the stretches inside intersections).
    ctx.fillStyle = COLORS.lane;
    for (let i = 0; i <= COLS; i += 1) {
      for (let y = 0; y < WORLD_H; y += 64) {
        if (Math.abs((y % PITCH) - PITCH / 2) < ROAD_W / 2 + 20) continue;
        ctx.fillRect(i * PITCH - 2, y, 4, 30);
      }
    }
    for (let j = 0; j <= ROWS; j += 1) {
      for (let x = 0; x < WORLD_W; x += 64) {
        if (Math.abs((x % PITCH) - PITCH / 2) < ROAD_W / 2 + 20) continue;
        ctx.fillRect(x, j * PITCH - 2, 30, 4);
      }
    }
    // Crosswalks at every intersection.
    ctx.fillStyle = 'rgba(245,239,224,0.85)';
    for (let i = 0; i <= COLS; i += 1) {
      for (let j = 0; j <= ROWS; j += 1) {
        for (let k = -2; k <= 2; k += 1) {
          ctx.fillRect(i * PITCH - 40 + k * 16, j * PITCH - ROAD_W / 2 - 8, 8, 14);
          ctx.fillRect(i * PITCH - 40 + k * 16, j * PITCH + ROAD_W / 2 - 6, 8, 14);
        }
      }
    }
    // Buildings.
    for (const b of city.buildings) {
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.fillRect(b.x + 6, b.y + 8, b.w, b.h);
      ctx.fillStyle = b.color;
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.lineWidth = 2;
      ctx.strokeRect(b.x, b.y, b.w, b.h);
      // Rooftop detail: inner slab + windows.
      ctx.fillStyle = 'rgba(255,255,255,0.14)';
      ctx.fillRect(b.x + 8, b.y + 8, b.w - 16, b.h - 16);
      ctx.fillStyle = 'rgba(20,30,45,0.55)';
      const cols = Math.max(1, Math.floor(b.w / 34));
      const rows = Math.max(1, Math.floor(b.h / 34));
      for (let cx = 0; cx < cols; cx += 1) {
        for (let cy = 0; cy < rows; cy += 1) {
          ctx.fillRect(b.x + 12 + cx * 34, b.y + 12 + cy * 34, 18, 14);
        }
      }
      if (b.tall) {
        ctx.fillStyle = 'rgba(255,255,255,0.25)';
        ctx.fillRect(b.x + b.w / 2 - 10, b.y + b.h / 2 - 10, 20, 20);
      }
    }
    // Trees and beach umbrellas.
    for (const t of city.trees) {
      ctx.fillStyle = COLORS.treeDark;
      ctx.beginPath();
      ctx.arc(t.x + 2, t.y + 3, t.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = COLORS.tree;
      ctx.beginPath();
      ctx.arc(t.x, t.y, t.r, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const u of city.beachUmbrellas) {
      ctx.strokeStyle = '#8a6b3f';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(u.x, u.y);
      ctx.lineTo(u.x, u.y - 16);
      ctx.stroke();
      ctx.fillStyle = u.color;
      ctx.beginPath();
      ctx.arc(u.x, u.y - 16, 14, Math.PI, 0);
      ctx.fill();
    }
    // District labels.
    ctx.fillStyle = 'rgba(20,30,45,0.5)';
    ctx.font = 'bold 26px system-ui, sans-serif';
    ctx.textAlign = 'center';
    for (const d of DISTRICTS) {
      ctx.fillText(d.name.toUpperCase(), (d.x0 + d.x1) / 2, (d.y0 + d.y1) / 2);
    }
    // Place signs.
    ctx.font = 'bold 15px system-ui, sans-serif';
    for (const key of Object.keys(PLACES)) {
      const pl = PLACES[key];
      ctx.fillStyle = 'rgba(12,16,24,0.75)';
      const w = ctx.measureText(pl.label).width + 18;
      rr(ctx, pl.x - w / 2, pl.y - 52, w, 24, 12);
      ctx.fill();
      ctx.fillStyle = '#ffd23f';
      ctx.fillText(pl.label, pl.x, pl.y - 35);
    }
  }

  function drawCar(car, isPlayer, time) {
    ctx.save();
    ctx.translate(car.x, car.y);
    ctx.rotate(car.angle);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    rr(ctx, -CAR.length / 2 + 3, -CAR.width / 2 + 4, CAR.length, CAR.width, 8);
    ctx.fill();
    ctx.fillStyle = car.color;
    rr(ctx, -CAR.length / 2, -CAR.width / 2, CAR.length, CAR.width, 8);
    ctx.fill();
    // Cabin + windshield.
    ctx.fillStyle = 'rgba(20,40,60,0.85)';
    rr(ctx, -8, -CAR.width / 2 + 4, 18, CAR.width - 8, 5);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(8, -CAR.width / 2 + 5, 4, CAR.width - 10);
    // Headlights.
    ctx.fillStyle = '#fff6c0';
    ctx.fillRect(CAR.length / 2 - 3, -CAR.width / 2 + 3, 3, 6);
    ctx.fillRect(CAR.length / 2 - 3, CAR.width / 2 - 9, 3, 6);
    // Police light bar.
    if (car.kind === 'police') {
      const flash = Math.floor(time * 4) % 2 === 0;
      ctx.fillStyle = flash ? '#ff3b30' : '#2b7fff';
      ctx.fillRect(-4, -CAR.width / 2 - 2, 8, 6);
      ctx.fillStyle = flash ? '#2b7fff' : '#ff3b30';
      ctx.fillRect(-4, CAR.width / 2 - 4, 8, 6);
      ctx.fillStyle = '#f5efe0';
      ctx.font = 'bold 9px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('S B P D', 0, 2);
    }
    if (car.hp < 55) {
      ctx.fillStyle = 'rgba(40,40,40,0.7)';
      ctx.beginPath();
      ctx.arc(-CAR.length / 2 + 10, 0, 4 + Math.sin(time * 9) * 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    if (isPlayer) {
      ctx.strokeStyle = '#ffd23f';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(car.x, car.y, CAR.length / 2 + 8, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  function drawPed(ped) {
    ctx.save();
    ctx.translate(ped.x, ped.y);
    if (ped.down) {
      ctx.rotate(ped.angle + Math.PI / 2);
      ctx.fillStyle = ped.shirt;
      rr(ctx, -12, -6, 24, 12, 6);
      ctx.fill();
      ctx.fillStyle = '#e8b98a';
      ctx.beginPath();
      ctx.arc(15, 0, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }
    const bob = Math.sin(ped.x * 0.1 + ped.y * 0.1 + (ped.id ?? 0)) * 1.5;
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath();
    ctx.ellipse(0, 4, 9, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = ped.shirt;
    ctx.beginPath();
    ctx.arc(0, bob * 0.3, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e8b98a';
    ctx.beginPath();
    ctx.arc(Math.cos(ped.angle) * 3, Math.sin(ped.angle) * 3 - 4, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawPlayer(state, showRing = true) {
    const p = state.player;
    if (p.inCar) return;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(0, 6, 12, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.rotate(p.angle);
    ctx.fillStyle = COLORS.player;
    rr(ctx, -11, -9, 22, 18, 7);
    ctx.fill();
    ctx.fillStyle = '#20242c';
    ctx.fillRect(8, -3, 12, 6); // pistol
    ctx.fillStyle = '#e8b98a';
    ctx.beginPath();
    ctx.arc(4, 0, 6.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#20242c';
    ctx.beginPath();
    ctx.arc(4, -2, 6.5, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    if (!showRing) return;
    ctx.strokeStyle = '#ffd23f';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 20, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Current mission target point (or null in free roam / between missions).
  function missionTarget(state) {
    const m = MISSIONS[state.missionIndex];
    if (!m || !state.missionActive) return null;
    const step = m.steps[state.missionStep];
    if (!step) return null;
    if (step.type === 'checkpoints') {
      const key = step.places[state.checkpointIndex];
      return key ? PLACES[key] : null;
    }
    if (step.place) return PLACES[step.place];
    if (step.type === 'steal-car') {
      let best = null;
      let bestD = Infinity;
      for (const c of state.cars) {
        if (c.kind === 'police' || c.hp <= 0) continue;
        const d = Math.hypot(c.x - state.player.x, c.y - state.player.y);
        if (d < bestD) { bestD = d; best = c; }
      }
      return best ? { x: best.x, y: best.y } : null;
    }
    return null;
  }

  function drawMarker(state) {
    const target = missionTarget(state);
    if (!target) return;
    const pulse = 1 + Math.sin(state.time * 5) * 0.12;
    const { x, y } = target;
    ctx.save();
    ctx.strokeStyle = '#ff9f1c';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(x, y, 26 * pulse, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#ff9f1c';
    ctx.beginPath();
    ctx.moveTo(x, y - 44);
    ctx.lineTo(x - 10, y - 26);
    ctx.lineTo(x + 10, y - 26);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#ff9f1c';
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    // Edge arrow when the target is off-screen.
    const pos = state.player.inCar
      ? state.cars.find((c) => c.id === state.player.inCar) ?? state.player
      : state.player;
    const sx = x - camera.x;
    const sy = y - camera.y;
    if (sx < 40 || sx > VIEW_W - 40 || sy < 40 || sy > VIEW_H - 40) {
      const cx = Math.max(60, Math.min(VIEW_W - 60, sx));
      const cy = Math.max(60, Math.min(VIEW_H - 60, sy));
      const a = Math.atan2(sy - (pos.y - camera.y), sx - (pos.x - camera.x));
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(a);
      ctx.fillStyle = '#ff9f1c';
      ctx.beginPath();
      ctx.moveTo(18, 0);
      ctx.lineTo(-8, -12);
      ctx.lineTo(-8, 12);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  function drawMinimap(state) {
    const mx = 16;
    const my = VIEW_H - MINI_H - 40;
    const sx = MINI_W / WORLD_W;
    const sy = MINI_H / WORLD_H;
    ctx.save();
    ctx.fillStyle = COLORS.hudBg;
    rr(ctx, mx - 6, my - 6, MINI_W + 12, MINI_H + 12, 12);
    ctx.fill();
    ctx.strokeStyle = 'rgba(245,239,224,0.35)';
    ctx.lineWidth = 1;
    ctx.strokeRect(mx - 6, my - 6, MINI_W + 12, MINI_H + 12);
    // Roads.
    ctx.fillStyle = '#565d68';
    for (let i = 0; i <= COLS; i += 1) ctx.fillRect(mx + i * PITCH * sx - 1.5, my, 3, MINI_H);
    for (let j = 0; j <= ROWS; j += 1) ctx.fillRect(mx, my + j * PITCH * sy - 1.5, MINI_W, 3);
    // Beach + sea.
    ctx.fillStyle = COLORS.sand;
    ctx.fillRect(mx, my + MINI_H - 8, MINI_W, 8);
    ctx.fillStyle = COLORS.sea;
    ctx.fillRect(mx, my + MINI_H - 3, MINI_W, 3);
    // Safehouse.
    ctx.fillStyle = '#2ec4b6';
    ctx.fillRect(mx + PLACES.safehouse.x * sx - 3, my + PLACES.safehouse.y * sy - 3, 6, 6);
    // Mission target.
    const target = missionTarget(state);
    if (target) {
      const pulse = 3 + Math.sin(state.time * 5) * 1.5;
      ctx.fillStyle = '#ff9f1c';
      ctx.beginPath();
      ctx.arc(mx + target.x * sx, my + target.y * sy, pulse + 3, 0, Math.PI * 2);
      ctx.fill();
    }
    // Police dots.
    ctx.fillStyle = '#4d7cff';
    for (const c of state.cars) {
      if (c.kind === 'police' && c.hp > 0) {
        ctx.beginPath();
        ctx.arc(mx + c.x * sx, my + c.y * sy, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // Player arrow.
    const p = state.player;
    ctx.save();
    ctx.translate(mx + p.x * sx, my + p.y * sy);
    ctx.rotate(p.angle);
    ctx.fillStyle = '#ffd23f';
    ctx.beginPath();
    ctx.moveTo(7, 0);
    ctx.lineTo(-5, -5);
    ctx.lineTo(-5, 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = '#f5efe0';
    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(districtAt(p.x, p.y).toUpperCase(), mx + 2, my + MINI_H + 18);
    ctx.restore();
  }

  function wrapText(text, x, y, maxW, lineH) {
    const words = text.split(' ');
    let line = '';
    let cy = y;
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > maxW && line) {
        ctx.fillText(line, x, cy);
        line = word;
        cy += lineH;
      } else {
        line = test;
      }
    }
    if (line) ctx.fillText(line, x, cy);
  }

  function drawHUD(state, screen) {
    const p = state.player;
    // Top-left: cash + health.
    ctx.fillStyle = COLORS.hudBg;
    rr(ctx, 16, 14, 250, 64, 12);
    ctx.fill();
    ctx.fillStyle = '#7dff8a';
    ctx.font = 'bold 26px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`$${p.money.toLocaleString('en-US')}`, 30, 42);
    ctx.fillStyle = '#f5efe0';
    ctx.font = '13px system-ui, sans-serif';
    ctx.fillText('MARA VOSS', 30, 64);
    // Health bar.
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    rr(ctx, 150, 52, 100, 10, 5);
    ctx.fill();
    ctx.fillStyle = p.hp > 40 ? '#2ecc71' : '#e74c3c';
    rr(ctx, 150, 52, Math.max(0, 100 * p.hp / 100), 10, 5);
    ctx.fill();
    ctx.fillStyle = '#f5efe0';
    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.fillText('HP', 128, 61);
    // Top-right: wanted stars.
    ctx.fillStyle = COLORS.hudBg;
    rr(ctx, VIEW_W - 226, 14, 210, 48, 12);
    ctx.fill();
    ctx.font = '24px system-ui, sans-serif';
    ctx.textAlign = 'left';
    for (let i = 0; i < 5; i += 1) {
      ctx.fillStyle = i < p.wanted ? '#ffd23f' : 'rgba(255,255,255,0.25)';
      ctx.fillText('★', VIEW_W - 210 + i * 36, 46);
    }
    // Top-centre: mission objective.
    const m = MISSIONS[state.missionIndex];
    if (m && screen === SCREEN_PLAY) {
      const step = m.steps[state.missionStep];
      ctx.fillStyle = COLORS.hudBg;
      const objText = state.missionActive ? step.text : 'New job from Sal — get ready…';
      ctx.font = 'bold 15px system-ui, sans-serif';
      const w = Math.min(560, ctx.measureText(objText).width + 90);
      rr(ctx, (VIEW_W - w) / 2, 14, w, 48, 12);
      ctx.fill();
      ctx.fillStyle = '#ff9f1c';
      ctx.textAlign = 'center';
      ctx.fillText(`${m.title.toUpperCase()}  ·  $${m.reward}`, VIEW_W / 2, 33);
      ctx.fillStyle = '#f5efe0';
      ctx.font = '14px system-ui, sans-serif';
      ctx.fillText(objText, VIEW_W / 2, 53);
      if (step.time && state.missionActive) {
        ctx.fillStyle = state.missionTimer < 20 ? '#ff6b6b' : '#ffd23f';
        ctx.font = 'bold 16px system-ui, sans-serif';
        ctx.fillText(`${Math.ceil(state.missionTimer)}s`, VIEW_W / 2 + w / 2 - 34, 33);
      }
    }
    // Bottom-right: speed when driving, controls when on foot.
    if (p.inCar) {
      const car = state.cars.find((c) => c.id === p.inCar);
      const speed = car ? Math.abs(Math.round(car.speed * 0.22)) : 0;
      ctx.fillStyle = COLORS.hudBg;
      rr(ctx, VIEW_W - 190, VIEW_H - 76, 174, 60, 12);
      ctx.fill();
      ctx.fillStyle = '#f5efe0';
      ctx.font = 'bold 28px system-ui, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(`${speed}`, VIEW_W - 66, VIEW_H - 36);
      ctx.font = '13px system-ui, sans-serif';
      ctx.fillText('km/h', VIEW_W - 30, VIEW_H - 36);
      ctx.textAlign = 'left';
      ctx.font = '12px system-ui, sans-serif';
      ctx.fillStyle = 'rgba(245,239,224,0.8)';
      ctx.fillText(car ? `${car.name} · E to exit` : '', VIEW_W - 178, VIEW_H - 56);
    } else {
      ctx.fillStyle = COLORS.hudBg;
      rr(ctx, VIEW_W - 330, VIEW_H - 76, 314, 60, 12);
      ctx.fill();
      ctx.fillStyle = 'rgba(245,239,224,0.9)';
      ctx.font = '12px system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('WASD move · Shift run · E enter car · Click shoot · M mute', VIEW_W - 318, VIEW_H - 52);
      ctx.fillText('Esc pause · progress saves automatically', VIEW_W - 318, VIEW_H - 32);
    }
    drawMinimap(state);
    // Banner.
    if (state.banner) {
      const b = state.banner;
      const alpha = Math.min(1, b.t);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = b.kind === 'bad' ? 'rgba(180,30,30,0.85)' : b.kind === 'win' ? 'rgba(255,159,28,0.92)' : 'rgba(20,120,80,0.9)';
      const bw = 520;
      rr(ctx, (VIEW_W - bw) / 2, 130, bw, 74, 14);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 30px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(b.title, VIEW_W / 2, 164);
      ctx.font = '15px system-ui, sans-serif';
      ctx.fillText(b.sub, VIEW_W / 2, 190);
      ctx.restore();
    }
    // Briefing card (before a mission starts).
    if (!state.missionActive && m && screen === SCREEN_PLAY) {
      ctx.fillStyle = 'rgba(12,16,24,0.85)';
      rr(ctx, (VIEW_W - 640) / 2, VIEW_H - 190, 640, 104, 14);
      ctx.fill();
      ctx.strokeStyle = '#ff9f1c';
      ctx.lineWidth = 2;
      ctx.strokeRect((VIEW_W - 640) / 2, VIEW_H - 190, 640, 104);
      ctx.fillStyle = '#ff9f1c';
      ctx.font = 'bold 15px system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(`JOB ${state.missionIndex + 1} OF ${MISSIONS.length} — ${m.title.toUpperCase()} · $${m.reward}`, (VIEW_W - 640) / 2 + 20, VIEW_H - 158);
      ctx.fillStyle = '#f5efe0';
      ctx.font = '14px system-ui, sans-serif';
      wrapText(m.briefing, (VIEW_W - 640) / 2 + 20, VIEW_H - 134, 600, 18);
    }
  }

  function drawTitle(state, extra) {
    // Sun-soaked title card over the living city.
    ctx.fillStyle = 'rgba(10,14,22,0.45)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    const grad = ctx.createLinearGradient(0, 0, 0, VIEW_H);
    grad.addColorStop(0, 'rgba(255,159,28,0.10)');
    grad.addColorStop(1, 'rgba(10,14,22,0.55)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffd23f';
    ctx.font = 'bold 22px system-ui, sans-serif';
    ctx.fillText('A N   O P E N - W O R L D   C R I M E   G A M E', VIEW_W / 2, 150);
    ctx.fillStyle = '#f5efe0';
    ctx.font = 'bold 96px system-ui, sans-serif';
    ctx.fillText('SOLARA BAY', VIEW_W / 2, 250);
    ctx.fillStyle = '#ff9f1c';
    ctx.font = 'italic 28px system-ui, sans-serif';
    ctx.fillText('Sun. Salt. Second chances.', VIEW_W / 2, 296);
    ctx.fillStyle = '#f5efe0';
    ctx.font = '16px system-ui, sans-serif';
    ctx.fillText('Mara Voss owes the night market. Five jobs from Sal Marin stand between her', VIEW_W / 2, 350);
    ctx.fillText('and running this town — steal cars, outrun the SBPD, and deliver. No excuses.', VIEW_W / 2, 374);
    // Menu.
    ctx.fillStyle = 'rgba(12,16,24,0.8)';
    rr(ctx, VIEW_W / 2 - 250, 420, 500, extra.saveExists ? 150 : 118, 16);
    ctx.fill();
    ctx.strokeStyle = '#ff9f1c';
    ctx.lineWidth = 2;
    ctx.strokeRect(VIEW_W / 2 - 250, 420, 500, extra.saveExists ? 150 : 118);
    ctx.fillStyle = '#ffd23f';
    ctx.font = 'bold 22px system-ui, sans-serif';
    ctx.fillText('▶  ENTER — START ENGINE', VIEW_W / 2, 462);
    if (extra.saveExists) {
      ctx.fillStyle = '#f5efe0';
      ctx.font = '18px system-ui, sans-serif';
      ctx.fillText(`CONTINUE — Job ${Math.min(extra.saveMission + 1, MISSIONS.length)} of ${MISSIONS.length} · $${extra.saveMoney}`, VIEW_W / 2, 498);
    }
    ctx.fillStyle = 'rgba(245,239,224,0.75)';
    ctx.font = '14px system-ui, sans-serif';
    ctx.fillText('WASD drive & walk · E steal / enter car · Mouse aim, click shoot · Esc pause', VIEW_W / 2, extra.saveExists ? 534 : 502);
    ctx.fillStyle = 'rgba(245,239,224,0.55)';
    ctx.font = '13px system-ui, sans-serif';
    ctx.fillText('An original game. No Rockstar, no GTA — just Solara Bay.', VIEW_W / 2, VIEW_H - 28);
    ctx.fillText('Progress saves automatically to this browser.', VIEW_W / 2, VIEW_H - 52);
  }

  function drawPaused(state) {
    ctx.fillStyle = 'rgba(10,14,22,0.6)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#f5efe0';
    ctx.font = 'bold 54px system-ui, sans-serif';
    ctx.fillText('PAUSED', VIEW_W / 2, VIEW_H / 2 - 20);
    ctx.font = '18px system-ui, sans-serif';
    ctx.fillText('Esc or P to resume · M to mute · progress is saved', VIEW_W / 2, VIEW_H / 2 + 20);
  }

  function drawEnd(state, screen) {
    ctx.fillStyle = 'rgba(10,14,22,0.65)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.textAlign = 'center';
    const complete = screen === SCREEN_COMPLETE;
    ctx.fillStyle = complete ? '#ffd23f' : '#ff6b6b';
    ctx.font = 'bold 64px system-ui, sans-serif';
    ctx.fillText(complete ? 'KING OF SOLARA' : 'BUSTED', VIEW_W / 2, VIEW_H / 2 - 60);
    ctx.fillStyle = '#f5efe0';
    ctx.font = '20px system-ui, sans-serif';
    if (complete) {
      ctx.fillText('Mara finished all five jobs. Solara Bay is hers now.', VIEW_W / 2, VIEW_H / 2 - 10);
      ctx.fillText(`Jobs done: ${state.stats.missionsDone} · Cars stolen: ${state.stats.carsStolen} · Earned: $${state.stats.moneyEarned}`, VIEW_W / 2, VIEW_H / 2 + 26);
    } else {
      ctx.fillText('The SBPD caught up with Mara. The safehouse is waiting.', VIEW_W / 2, VIEW_H / 2 - 10);
      ctx.fillText(`Jobs done: ${state.stats.missionsDone} · Cash: $${state.player.money}`, VIEW_W / 2, VIEW_H / 2 + 26);
    }
    ctx.fillStyle = '#ffd23f';
    ctx.font = 'bold 22px system-ui, sans-serif';
    ctx.fillText('ENTER — PLAY AGAIN', VIEW_W / 2, VIEW_H / 2 + 80);
  }

  function draw(state, screen, extra = {}) {
    // Camera follows the player.
    const p = state.player;
    camera.x = Math.max(0, Math.min(WORLD_W - VIEW_W, p.x - VIEW_W / 2));
    camera.y = Math.max(0, Math.min(WORLD_H - VIEW_H, p.y - VIEW_H / 2));
    ctx.save();
    ctx.clearRect(0, 0, VIEW_W, VIEW_H);
    ctx.translate(-camera.x, -camera.y);
    drawCity(state);
    for (const car of state.cars) {
      if (car.hp > 0) drawCar(car, car.id === p.inCar && screen !== SCREEN_TITLE, state.time);
    }
    for (const ped of state.peds) drawPed(ped);
    for (const cop of state.cops) {
      ctx.save();
      ctx.translate(cop.x, cop.y);
      ctx.fillStyle = '#2b4acb';
      ctx.beginPath();
      ctx.arc(0, 0, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#e8b98a';
      ctx.beginPath();
      ctx.arc(Math.cos(cop.angle) * 2, Math.sin(cop.angle) * 2 - 3, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = Math.floor(state.time * 4) % 2 === 0 ? '#ff3b30' : '#2b7fff';
      ctx.beginPath();
      ctx.arc(0, -8, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    for (const b of state.bullets) {
      ctx.fillStyle = '#ffe66d';
      ctx.beginPath();
      ctx.arc(b.x, b.y, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const pt of state.particles) {
      ctx.globalAlpha = Math.max(0, pt.t * 2);
      ctx.fillStyle = pt.kind === 'crash' ? '#888' : '#ff6b6b';
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 12 * (1 - pt.t), 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    drawPlayer(state, screen !== SCREEN_TITLE);
    if (screen !== SCREEN_TITLE) drawMarker(state);
    ctx.restore();
    if (screen === SCREEN_TITLE) drawTitle(state, extra);
    else if (screen === SCREEN_PAUSED) { drawHUD(state, screen); drawPaused(state); }
    else if (screen === SCREEN_COMPLETE || screen === SCREEN_OVER || screen === SCREEN_BUSTED) { drawHUD(state, screen); drawEnd(state, screen); }
    else drawHUD(state, screen);
    // Mute indicator.
    if (extra.muted) {
      ctx.fillStyle = 'rgba(245,239,224,0.8)';
      ctx.font = '13px system-ui, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText('MUTED (M)', VIEW_W - 16, VIEW_H - 96);
    }
  }

  return { draw, camera, missionTarget };
}
