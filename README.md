# SOLARA BAY

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/casg7322-ui/gta6-01/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/casg7322-ui/gta6-01/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

An original open-world crime game for the [make.fun gta6-01 bounty](https://make.fun/bounty/gta6-01) — entered on make.fun/?ref=e0ar5hn0. Mara Voss owes the night market, and Sal Marin holds the tab: five jobs stand between her and running the sun-soaked coastal city of Solara Bay. Steal cars, outrun the SBPD, deliver — no excuses.

Everything here is original: the city, the characters, the story, the art and the synthesised sound. No Rockstar Games names, characters, maps, art or music.

## Play it

```sh
node serve.ts
# open http://localhost:8080
```

Static files only — no build step, no network requests, no libraries. Keyboard + mouse, desktop Chrome.

## Controls

| Input | Action |
| --- | --- |
| WASD / arrows | Walk / drive |
| Shift | Run |
| E | Steal / enter / exit car |
| Mouse | Aim the pistol |
| Click | Shoot |
| Space | Brake |
| Esc / P | Pause |
| M | Mute |

## Systems

- **Open city** — 10×8 blocks (3840×3072), five districts (Old Town, Downtown, Marina, Harbor, South Beach), a beach, parks, a marina, seeded RNG so each seed builds the same city.
- **Traffic & crowds** — 14 cars cruising the road grid, 26 pedestrians on the sidewalks who flee gunshots and speeding cars, 12 parked cars.
- **Steal & drive** — any car is yours: parked cars are free, occupied ones make the driver flee and raise the heat, a police car raises it twice as much.
- **Wanted 0–5 stars** — SBPD patrol cars chase and ram; foot cops join at 2 stars and can bust you on foot. Heat decays out of sight and burns off fast at the safehouse.
- **Combat** — pistol with mouse aim, car ramming, HP with slow recovery, busted/wasted respawns at the safehouse with a cash cut.
- **Five missions from Sal Marin** — First Wheels ($250), The Delivery ($450), Heat Wave ($450), The Getaway ($600), King of Solara ($1,000). $2,750 in all; finish them for the KING OF SOLARA screen and free roam.
- **HUD + live minimap** — cash, HP, wanted stars, mission objective with timer, speed, and a minimap showing roads, the player, the mission target and police.
- **Save** — progress autosaves to localStorage; the title screen offers Continue.
- **Sound** — 100% synthesised WebAudio: engine hum, two-tone sirens, gunshots, crashes, mission jingles. No audio files.

## Layout

```
game/
  index.html        page shell + canvas
  src/
    config.js       constants, palette, tuning, landmarks
    random.js       mulberry32 seeded RNG
    city.js         city generation + road-graph pathfinding
    world.js        pure game logic (no DOM — runs headless in Node)
    missions.js     the five missions + flow state machine
    autopilot.js    drives world.step with synthetic input
    input.js        keyboard + mouse
    audio.js        WebAudio synth
    render.js       canvas drawing: city, entities, HUD, minimap, screens
    shots.js        ?shot= staging for screenshots (real play, fast-forwarded)
    main.js         boot, game loop, screens, save/load
main.ts             hands the entry in (copies game/ + screenshots/, writes dossier.json)
serve.ts            tiny static server for local play
shots.json          documents the four screenshots
screenshots/        four real renders of the game (1280x720)
```

## Screenshots

Taken from the game's own code via `?shot=title|play|chase|complete&seed=42` — the autopilot plays the real game forward to stage each scene.

## License

MIT — see [LICENSE](LICENSE).
