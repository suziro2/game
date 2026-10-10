# Ashen Vow

A 2D anime action RPG (Phaser 3 + a small Node server) with 10 playable heroes, 10 chapters,
50 levels (4 stages + 1 boss per chapter), bot-driven enemy AI, boss phases, equipment, upgrades,
persistent accounts, and a full loading flow.

## Run it

```bash
npm install
npm run build      # bundles the client into dist/
npm start          # serves dist/ and the API on http://0.0.0.0:8080 (PORT env overrides)
npm run dev        # Vite dev server on :5173 (proxies /api to :8080 — run `npm start` alongside)
npm test           # asset validation, progression unit tests, real API tests
```

Accounts and saves are stored in `server/data/store.json` (git-ignored).

## Controls

| Action | Keyboard | Touch |
| --- | --- | --- |
| Move | A / D or ← / → | ◀ ▶ |
| Run | Hold Shift | RUN (toggle) |
| Jump | W / ↑ / Space | JUMP |
| Basic attack (press again to chain the combo finisher) | J | ATK |
| Special skill (30 energy) | K | SKILL |
| Dodge (i-frames) | L | DODGE |
| Health potion (45% HP) | H | 🧪 |
| Pause / quit from pause | Esc / Q | — |

## Architecture

- `index.html`, `src/style.css`, `src/ui/*` — DOM screens: loading overlay, Create Account, main menu
  (heroes, adventure map, upgrades, inventory), results, boss introduction.
- `src/main.js` — flow: boot → session restore or Create Account → menu → level load → battle → rewards → save.
- `src/game/` — Phaser: `LoadScene` (per-level asset loading with real progress), `BattleScene`
  (spawning, combat resolution, HUD), `fighters.js` (Hero / Enemy AI / Boss phases on a shared
  animation state machine), `effects.js` (procedural VFX), `assets.js` (loading, animation creation, memory unloading).
- `server/server.mjs` — static hosting, account registration (scrypt), cookie sessions, progress save/load.
- `src/data/game-data.js` — heroes, enemies, bosses, chapters, the 50-level table, tuning constants.

## Sprites and animation

- Every hero, enemy type and boss has its **own** `sheet.png` + `sheet.json` under
  `public/assets/sprites/{heroes,enemies,bosses}/<id>/`. Sheets are never combined.
- `sheet.json` defines each animation's row, frame count, fps, loop flag, and `active` frames
  (the frames where an attack, skill or AoE is live). Damage is resolved on those frames.
- Hero sheets: idle, walk, run, attack, combo, skill, hit, dodge, defeat, victory (160 px frames).
- Enemy sheets: idle, walk, attack, special (ranged/AoE types only), hit, death (144 px frames).
- Boss sheets: idle, move, basic, heavy, special, aoe, hit, phase, defeat (256 px frames).
- Pipeline: `node tools/build-sprites.mjs` reads raw art from `art/raw/{heroes,enemies,bosses}/<id>.png`
  (green `#00FF00` background), removes the background, and renders each animation frame from a fixed
  pose table so every frame has identical size and pivot. If raw art is missing, the script draws a
  clearly flagged **placeholder** silhouette and sets `"placeholder": true` in that sheet's JSON.

### Current art status

- **Heroes (10):** real AI-generated artwork, processed into sheets.
- **Enemies (16 types) and bosses (10):** placeholders until their raw art is generated. Drop the
  files into `art/raw/enemies/` and `art/raw/bosses/` and run `npm run sprites`.
- Animation frames are produced by transforms of the single master artwork (bob, lean, lunge,
  squash, hit recoil, dodge fade, fall). They are not hand-drawn in-betweens.

## Known limits

- No audio is bundled yet (the loader and pipeline are ready for it).
- Session recovery relies on a 30-day HttpOnly cookie; there is no separate login page by design.
  Clearing site data starts a new account.
- Progression rules are validated for shape on the server, not simulated for gameplay.
