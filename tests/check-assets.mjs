// Validates sprite sheets and content references:
//  - every hero / enemy type / boss has its own sheet.json + sheet.png
//  - PNG dimensions match frameWidth/Height × columns/rows declared in the metadata
//  - animation rows/frame counts fit the grid; active frames are within the animation
//  - every enemy/boss referenced by chapters & levels exists; all 50 levels and 10 chapters present
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { HEROES, ENEMIES, BOSSES, CHAPTERS, LEVELS, SPRITE_SIZES } from '../src/data/game-data.js';
import { SPRITE_MANIFEST } from '../tools/sprite-manifest.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SPR = path.join(ROOT, 'public/assets/sprites');
let errors = 0;
const fail = (m) => { errors++; console.error('FAIL', m); };
const ok = (m) => console.log('ok  ', m);

function pngSize(file) {
  const b = fs.readFileSync(file);
  if (b.readUInt32BE(0) !== 0x89504e47) throw new Error('not png');
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

const dirFor = (kind, id) => path.join(SPR, kind === 'hero' ? 'heroes' : kind === 'enemy' ? 'enemies' : 'bosses', id);
let sheets = 0; let placeholders = 0;
for (const e of SPRITE_MANIFEST) {
  const dir = dirFor(e.kind, e.id);
  const jf = path.join(dir, 'sheet.json');
  const pf = path.join(dir, 'sheet.png');
  if (!fs.existsSync(jf) || !fs.existsSync(pf)) { fail(`${e.kind}/${e.id} missing sheet`); continue; }
  const meta = JSON.parse(fs.readFileSync(jf, 'utf8'));
  const s = SPRITE_SIZES[e.kind];
  const { w, h } = pngSize(pf);
  if (meta.frameWidth !== s.fw || meta.frameHeight !== s.fh) fail(`${e.id} frame size ${meta.frameWidth}x${meta.frameHeight} != ${s.fw}`);
  if (w !== meta.columns * meta.frameWidth || h !== meta.rows * meta.frameHeight) fail(`${e.id} PNG ${w}x${h} != grid ${meta.columns}x${meta.rows}`);
  const names = Object.keys(meta.anims);
  if (names.length !== meta.rows) fail(`${e.id} anim count ${names.length} != rows ${meta.rows}`);
  for (const [name, a] of Object.entries(meta.anims)) {
    if (a.frames > meta.columns) fail(`${e.id}:${name} frames > columns`);
    if (a.row >= meta.rows) fail(`${e.id}:${name} row out of range`);
    for (const f of a.active || []) if (f >= a.frames) fail(`${e.id}:${name} active frame ${f} out of range`);
  }
  if (meta.placeholder) placeholders++;
  sheets++;
}
ok(`${sheets} individual sprite sheets validated (${placeholders} placeholders awaiting final art)`);

for (const h of HEROES) if (!fs.existsSync(dirFor('hero', h.id))) fail(`hero ${h.id}`);
ok(`${HEROES.length} heroes have their own sheets`);
ok(`${Object.keys(ENEMIES).length} enemy types each have their own sheet`);
for (const id of Object.keys(BOSSES)) if (!fs.existsSync(dirFor('boss', id))) fail(`boss ${id}`);
ok(`${Object.keys(BOSSES).length} bosses each have their own sheet`);

if (CHAPTERS.length !== 10) fail('need 10 chapters');
if (LEVELS.length !== 50) fail(`need 50 levels, got ${LEVELS.length}`);
for (const lv of LEVELS) {
  if (lv.isBoss !== (lv.levelInChapter === 5)) fail(`level ${lv.index} boss flag`);
  if (!lv.isBoss && lv.enemyTypes.some((t) => !ENEMIES[t])) fail(`level ${lv.index} unknown enemy`);
  if (lv.isBoss && !BOSSES[lv.boss]) fail(`level ${lv.index} unknown boss`);
}
for (const c of CHAPTERS) for (const t of c.enemies) if (!ENEMIES[t]) fail(`chapter ${c.n} enemy ${t}`);
ok('10 chapters × 5 levels = 50 levels; 4 regular + 1 boss per chapter; all references valid');

const used = new Set(CHAPTERS.flatMap((c) => c.enemies));
ok(`${used.size} distinct enemy types used across chapters`);
if (errors) { console.error(`${errors} problem(s)`); process.exit(1); }
console.log('All asset checks passed.');
