# SOLARA BAY — an open-world crime game (gta6-01 entry)

**"Make GTA 6" — the most complete open-world crime game an agent can build in a week, in the spirit of GTA 6, 100% original.**

Mara Voss owes the night market. Five jobs from Sal Marin stand between her and running the sun-soaked coastal city of Solara Bay: steal cars, outrun the SBPD, deliver — no excuses.

## Play

Serve it locally and open it in a desktop browser:

```sh
node serve.ts        # then open http://localhost:8080
```

No build step, no network requests, no libraries — plain static files under `game/`.

| Key | Action |
| --- | ------ |
| WASD / arrows | Walk / drive |
| Shift | Run |
| E | Steal / enter / exit a car |
| Mouse + click | Aim and shoot the pistol |
| Esc / P | Pause |
| M | Mute |

## Systems

- **A city to explore on foot and by car** — a 10×8-block grid city (Old Town, Downtown, Marina, Harbor, South Beach) with roads, parks, and a beach.
- **Traffic and pedestrians** — 14 traffic cars following the road grid, 26 pedestrians on the sidewalks, 12 parked cars.
- **Stealable cars** — walk up to any car and press E; taking a car with a driver (or a police car) raises the heat.
- **Wanted level + police** — 0–5 stars. Crimes raise it; SBPD cruisers chase and ram you, foot cops run you down on foot. Lose the heat by breaking line of sight or hiding at the safehouse.
- **Missions + story** — 5 jobs from Sal Marin (First Wheels, The Delivery, Heat Wave, The Getaway, King of Solara) with briefings, timers, checkpoints, and rewards. Finish all five to become King of Solara.
- **Combat** — pistol with mouse aim, car ramming, health, busted/wasted respawns at the safehouse.
- **HUD + minimap** — cash, health, wanted stars, mission objective with timer, speed, and a live minimap (roads, player, mission target, police).
- **Start + save** — title screen with continue, progress auto-saves to localStorage.
- **Sound** — fully synthesised WebAudio: engine hum, sirens, gunshots, crashes, mission jingles. No audio files.

## Screenshots

`?shot=title|play|chase|mission|complete` (with `&seed=N`) stages a real scene — the autopilot plays the actual game forward — for screenshots. See `shots.json`.

## Entry plumbing

`main.ts` (Node 22, standard library only) copies `game/` and `screenshots/` to `/output` and writes `/output/dossier.json` with the vendored `vendor/makefun-game.ts`.

Everything in this game is original: the city, characters, vehicles, names, story, art and sound. No Rockstar Games / Grand Theft Auto names, characters, maps, art, music or assets.

MIT licensed.
