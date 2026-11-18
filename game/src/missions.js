// Missions: Mara Voss owes the night market, and Sal Marin holds the tab.
// Five jobs, each with a briefing, steps, a timer and a cash reward.
// The state machine lives here; world.js calls updateMission every step.

import { LANDMARKS, TUNING } from './config.js';

export const MISSIONS = [
  {
    id: 'first-wheels',
    title: 'First Wheels',
    reward: 250,
    time: 240,
    brief:
      'Sal Marin: "You owe the market, Mara. First job is simple — take a car, any car, and bring it to my garage. Don\u2019t scratch the paint. Much."',
    steps: [
      { kind: 'car', text: 'Steal a car — walk up and press E' },
      { kind: 'reach', at: 'dropoff', text: 'Bring the car to Sal\u2019s garage' },
    ],
  },
  {
    id: 'the-delivery',
    title: 'The Delivery',
    reward: 450,
    time: 180,
    brief:
      'Sal Marin: "A package needs to reach Downtown East. Fast. The buyer does not wait, and neither do I. Drive like the tide is coming in."',
    steps: [
      { kind: 'car', text: 'Get a car for the run' },
      { kind: 'reach', at: 'checkpoint', text: 'Deliver the package to the checkpoint' },
    ],
  },
  {
    id: 'heat-wave',
    title: 'Heat Wave',
    reward: 450,
    time: 240,
    startHeat: 58,
    brief:
      'Sal Marin: "The SBPD is all over you after that last run. Get home, lay low, and let the heat burn off. The safehouse is the only quiet roof in Solara."',
    steps: [
      { kind: 'reach', at: 'safehouse', text: 'Reach the safehouse' },
      { kind: 'loseHeat', text: 'Lay low until the heat is gone' },
    ],
  },
  {
    id: 'the-getaway',
    title: 'The Getaway',
    reward: 600,
    time: 240,
    startHeat: 78,
    brief:
      'Sal Marin: "They want you in cuffs, Mara. Prove them wrong. Lose the tail the only way that counts — outrun them to the Harbor Overlook."',
    steps: [
      { kind: 'car', text: 'Get wheels — you are being hunted' },
      { kind: 'reach', at: 'getaway', text: 'Escape to the Harbor Overlook' },
    ],
  },
  {
    id: 'king-of-solara',
    title: 'King of Solara',
    reward: 1000,
    time: 300,
    brief:
      'Sal Marin: "Last job. A crate is waiting at the Docks — the market\u2019s whole season in one box. Carry it to the Penthouse and the debt is done. Solara is yours."',
    steps: [
      { kind: 'car', text: 'Get a car for the last run' },
      { kind: 'dwell', at: 'docks', text: 'Pick up the crate at the Docks' },
      { kind: 'reach', at: 'penthouse', text: 'Deliver the crate to the Penthouse' },
    ],
  },
];

export const TOTAL_REWARD = MISSIONS.reduce((sum, m) => sum + m.reward, 0);

export function createMissionState() {
  return {
    index: 0, // which mission is active (== MISSIONS.length means finished)
    phase: 'briefing', // briefing | active | complete
    stepIdx: 0,
    timer: 0,
    briefingT: 0,
    dwellT: 0,
    failed: 0, // times the current mission failed (timer or busted/wasted)
  };
}

export function currentMission(state) {
  return state.index < MISSIONS.length ? MISSIONS[state.index] : null;
}

export function currentStep(state) {
  const m = currentMission(state);
  return m ? m.steps[state.stepIdx] : null;
}

// Start (or restart) the current mission: briefing first, then the clock.
export function startMission(world) {
  const m = currentMission(world.mission);
  if (!m) {
    world.mission.phase = 'complete';
    return;
  }
  world.mission.phase = 'briefing';
  world.mission.stepIdx = 0;
  world.mission.timer = m.time;
  world.mission.briefingT = 3.5;
  world.mission.dwellT = 0;
  // Note: startHeat is applied when the briefing ends (updateMission),
  // not here — otherwise the heat burns off while the player still reads.
  world.events.push({ type: 'briefing', mission: m });
}

// Where the current step wants the player, for the HUD, the minimap and the autopilot.
export function missionTarget(world) {
  const step = currentStep(world.mission);
  if (!step || world.mission.phase !== 'active') return null;
  if (step.kind === 'car') return null;
  if (step.kind === 'loseHeat') {
    const s = LANDMARKS.safehouse;
    return { x: s.x, y: s.y, label: s.label };
  }
  const lm = LANDMARKS[step.at];
  return lm ? { x: lm.x, y: lm.y, label: lm.label } : null;
}

function stepDone(world, step, dt) {
  const p = world.player;
  if (step.kind === 'car') return p.inCar;
  if (step.kind === 'loseHeat') return world.wanted.stars <= 0;
  const lm = LANDMARKS[step.at];
  if (!lm) return false;
  const dx = p.x - lm.x;
  const dy = p.y - lm.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (step.kind === 'reach') return dist < TUNING.carArrive;
  if (step.kind === 'dwell') {
    // A nudge from a police ram pauses the pickup instead of voiding it.
    if (dist < TUNING.carArrive + 26) {
      world.mission.dwellT += dt;
      return world.mission.dwellT >= 2;
    }
    world.mission.dwellT = Math.max(0, world.mission.dwellT - dt * 2);
    return false;
  }
  return false;
}

export function updateMission(world, dt) {
  const ms = world.mission;
  if (ms.phase === 'complete') return;
  if (ms.phase === 'briefing') {
    ms.briefingT -= dt;
    if (ms.briefingT <= 0) {
      ms.phase = 'active';
      const started = currentMission(ms);
      if (started && started.startHeat) {
        world.wanted.heat = Math.max(world.wanted.heat, started.startHeat);
      }
      world.events.push({ type: 'missionStart', mission: started });
    }
    return;
  }
  const m = currentMission(ms);
  if (!m) return;
  ms.timer -= dt;
  if (ms.timer <= 0) {
    ms.failed += 1;
    world.events.push({ type: 'missionFailed', reason: 'time' });
    startMission(world);
    return;
  }
  const step = currentStep(ms);
  if (!step) return;
  if (stepDone(world, step, dt)) {
    ms.stepIdx += 1;
    ms.dwellT = 0;
    if (ms.stepIdx >= m.steps.length) {
      world.cash += m.reward;
      // The heat cools between jobs: a breather before the next briefing.
      world.wanted.heat *= 0.35;
      world.events.push({ type: 'missionComplete', mission: m });
      ms.index += 1;
      if (ms.index >= MISSIONS.length) {
        ms.phase = 'complete';
        world.events.push({ type: 'gameComplete' });
      } else {
        startMission(world);
      }
    } else {
      world.events.push({ type: 'stepComplete', mission: m, step: currentStep(ms) });
    }
  }
}
