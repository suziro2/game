#!/usr/bin/env node
/**
 * Sprite pipeline for Ashen Vow.
 *
 * For every character in SPRITE_MANIFEST this script:
 *   1. Loads the raw AI artwork from art/raw/<kind>/<id>.png (green #00FF00 background).
 *      If the raw artwork does not exist yet, a clearly flagged PLACEHOLDER silhouette
 *      is drawn instead (metadata.placeholder = true, shown in the README/status).
 *   2. Removes the green background, trims, and fits the artwork into the frame box.
 *   3. Renders every animation frame from a fixed pose table (bob, lean, lunge, hit
 *      recoil, dodge, fall, ...), so every frame has identical dimensions and pivot.
 *   4. Writes public/assets/sprites/<kind>/<id>/sheet.png (grid: one row per animation,
 *      fixed frame size, unused cells transparent) and sheet.json (frame definitions,
 *      playback fps, loop flag, and the frame indices where attacks/skills are active).
 *
 * Requires ImageMagick (`convert`). Run with: node tools/build-sprites.mjs [--only id]
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SPRITE_MANIFEST } from './sprite-manifest.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RAW = path.join(ROOT, 'art/raw');
const OUT = path.join(ROOT, 'public/assets/sprites');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'sprites-'));
const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : null;

const magick = (args) => execFileSync('convert', args, { stdio: 'pipe' });
const dims = (file) => {
  const [w, h] = execFileSync('identify', ['-format', '%w %h', file], { stdio: 'pipe' }).toString().trim().split(' ').map(Number);
  return { w, h };
};
const geo = (x, y) => `${x >= 0 ? '+' : '-'}${Math.abs(x)}${y >= 0 ? '+' : '-'}${Math.abs(y)}`;
const sin = (x) => Math.sin(x * Math.PI * 2);
const ZERO = { dx: 0, dy: 0, rot: 0, sx: 1, sy: 1, tint: 0, alpha: 1 };
const seq = (n, fn) => Array.from({ length: n }, (_, i) => ({ ...ZERO, ...fn(i / n, i) }));
const keyed = (arr, n, pick) => Array.from({ length: n }, (_, i) => ({ ...ZERO, dx: arr.dx?.[i] ?? 0, dy: arr.dy?.[i] ?? 0, rot: arr.rot?.[i] ?? 0, sx: arr.sx?.[i] ?? 1, sy: arr.sy?.[i] ?? 1, tint: arr.tint?.[i] ?? 0, alpha: arr.alpha?.[i] ?? 1 }));

/* ---------------- Pose tables (values in 160px-frame units; scaled per sheet) ---------------- */
const HERO_POSES = {
  idle: (n) => seq(n, (t) => ({ dy: -2 * sin(t), sy: 1 + 0.012 * sin(t) })),
  walk: (n) => seq(n, (t) => ({ dx: 2 * sin(t), dy: -4 * Math.abs(Math.sin(Math.PI * t)), rot: 2 * sin(t) })),
  run: (n) => seq(n, (t) => ({ dx: 3 * sin(t), dy: -7 * Math.abs(Math.sin(Math.PI * t)), rot: 7 + 2 * sin(t), sx: 1.03, sy: 0.98 })),
  // Small offsets only: the real attack-pose art carries the lunge, and larger shifts clip the 160px cell.
  attack: () => keyed({ dx: [0, -2, 3, 8, 2, 0], rot: [0, -2, 2, 5, 1, 0] }, 6),
  combo: () => keyed({ dx: [0, -3, 4, 8, 3, -2, 6, 3], rot: [0, -3, 3, 6, 1, -2, 5, 2] }, 8),
  skill: () => keyed({ dy: [0, -2, -6, -10, -10, -6, -2, 0], sx: [1, 1.03, 1.08, 1.12, 1.12, 1.08, 1.03, 1], sy: [1, 1.03, 1.08, 1.12, 1.12, 1.08, 1.03, 1] }, 8),
  hit: () => keyed({ dx: [-8, -14, -6, 0], rot: [-6, -12, -5, 0], tint: [0.35, 0.3, 0.12, 0] }, 4),
  dodge: () => keyed({ dx: [-4, -20, -30, -18, 0], sx: [1, 0.92, 0.9, 0.95, 1], alpha: [1, 0.55, 0.35, 0.7, 1] }, 5),
  defeat: () => keyed({ rot: [0, -12, -30, -55, -75, -88, -90, -90], dy: [0, 2, 8, 18, 30, 40, 46, 48], tint: [0, 0, 0, 0, 0.2, 0.4, 0.5, 0.5], alpha: [1, 1, 1, 1, 1, 0.95, 0.85, 0.7] }, 8),
  victory: () => keyed({ dy: [0, -4, -12, -16, -12, -4, 0, 0], rot: [0, 2, 4, 0, -2, 0, 0, 0], sx: [1, 1, 1.02, 1.03, 1.02, 1, 1, 1] }, 8),
};

const ENEMY_POSES = {
  idle: (n) => seq(n, (t) => ({ dy: -2 * sin(t), sy: 1 + 0.02 * sin(t) })),
  walk: (n) => seq(n, (t) => ({ dx: 2 * sin(t), dy: -6 * Math.abs(Math.sin(Math.PI * t)), rot: 3 * sin(t) })),
  attack: () => keyed({ dx: [0, -2, 3, 8, 2, 0], rot: [0, -2, 2, 5, 1, 0] }, 6), // small offsets: the attack-pose art carries the lunge
  special: () => keyed({ dy: [0, -4, -10, -14, -10, -4, 0, 0], sx: [1, 1.04, 1.1, 1.12, 1.1, 1.04, 1, 1], sy: [1, 0.96, 1.05, 1.08, 1.05, 0.98, 1, 1] }, 8),
  hit: () => keyed({ dx: [-10, -16, -8, 0], rot: [-10, -14, -6, 0], tint: [0.35, 0.3, 0.12, 0] }, 4),
  death: () => keyed({ rot: [0, -14, -35, -60, -80, -90, -90, -90], dy: [0, 4, 12, 24, 36, 44, 48, 48], tint: [0, 0, 0.1, 0.3, 0.45, 0.55, 0.55, 0.55], alpha: [1, 1, 1, 1, 0.95, 0.8, 0.6, 0.4] }, 8),
};

const BOSS_POSES = {
  idle: (n) => seq(n, (t) => ({ dy: -4 * sin(t), sy: 1 + 0.015 * sin(t) })),
  move: (n) => seq(n, (t) => ({ dx: 4 * sin(t), dy: -8 * Math.abs(Math.sin(Math.PI * t)), rot: 3 * sin(t) })),
  basic: () => keyed({ dx: [0, -8, 10, 30, 14, 0], rot: [0, -6, 6, 12, 4, 0] }, 6),
  heavy: () => keyed({ dy: [0, -10, -18, 6, 10, 4, 0, 0], sx: [1, 1.04, 1.08, 0.96, 1.06, 1.02, 1, 1], rot: [0, -4, -8, 6, 8, 3, 0, 0] }, 8),
  special: () => keyed({ dy: [0, -6, -14, -18, -14, -6, 0, 0], sx: [1, 1.05, 1.1, 1.14, 1.1, 1.04, 1, 1], sy: [1, 1.02, 1.06, 1.1, 1.06, 1.02, 1, 1] }, 8),
  aoe: () => keyed({ dy: [0, -4, -22, -28, -16, 4, 0, 0], sy: [1, 0.96, 1.08, 1.12, 1.04, 0.92, 1, 1], sx: [1, 1.02, 0.96, 0.94, 1.02, 1.1, 1, 1] }, 8),
  hit: () => keyed({ dx: [-12, -20, -10, 0], rot: [-8, -14, -6, 0], tint: [0.35, 0.28, 0.12, 0] }, 4),
  phase: () => keyed({ dy: [0, -10, -20, -10, 0, 0], sx: [1, 1.08, 1.14, 1.1, 1.02, 1], sy: [1, 1.08, 1.14, 1.1, 1.02, 1], tint: [0, 0.6, 0.8, 0.4, 0, 0] }, 6),
  defeat: () => keyed({ rot: [0, -8, -20, -40, -62, -78, -88, -90], dy: [0, 4, 14, 30, 48, 62, 70, 74], tint: [0, 0, 0.15, 0.3, 0.45, 0.55, 0.6, 0.6], alpha: [1, 1, 1, 1, 0.95, 0.85, 0.7, 0.5] }, 8),
};

const POSES = { hero: HERO_POSES, enemy: ENEMY_POSES, boss: BOSS_POSES };

/* ---------------- Rendering helpers ---------------- */
function renderFrame(base, pose, size, k, out) {
  const tmp = path.join(TMP, `c-${process.pid}-${Math.random().toString(36).slice(2)}.png`);
  const args = [base, '-alpha', 'set'];
  if (pose.sx !== 1 || pose.sy !== 1) {
    const { w, h } = dims(base);
    args.push('-resize', `${Math.round(pose.sx * 100)}%x${Math.round(pose.sy * 100)}%!`);
    void w; void h;
  }
  if (pose.rot) args.push('-background', 'none', '-rotate', String(pose.rot));
  if (pose.tint) args.push('-fill', 'rgb(255,40,40)', '-colorize', `${Math.round(pose.tint * 100)}%`);
  if (pose.alpha < 1) args.push('-channel', 'A', '-evaluate', 'multiply', String(pose.alpha), '+channel');
  args.push(tmp);
  magick(args);
  const { w, h } = dims(tmp);
  const x = Math.round((size - w) / 2 + pose.dx * k);
  const y = Math.round(size - 4 * k - h + pose.dy * k);
  magick(['-size', `${size}x${size}`, 'xc:none', tmp, '-geometry', geo(x, y), '-composite', out]);
  fs.unlinkSync(tmp);
}

/** Creates a clearly flagged stand-in silhouette (used only until the real artwork is generated). */
function makePlaceholderBase(file, kind, color) {
  const big = kind === 'boss';
  const draw = [
    '-fill', color, '-stroke', 'rgba(0,0,0,0.45)', '-strokewidth', '4',
    '-draw', big ? 'ellipse 200,250 110,120 0,360' : 'ellipse 100,132 52,58 0,360',
    '-draw', big ? 'circle 200,110 200,70' : 'circle 100,56 100,30',
    '-draw', big ? 'roundrectangle 130,330 175,470 12,12' : 'roundrectangle 78,170 98,205 8,8',
    '-draw', big ? 'roundrectangle 225,330 270,470 12,12' : 'roundrectangle 102,170 122,205 8,8',
    '-fill', '#fff7d6', '-stroke', 'none',
    '-draw', big ? 'circle 180,100 186,100' : 'circle 92,54 95,54',
    '-draw', big ? 'circle 220,100 226,100' : 'circle 108,54 111,54',
  ];
  magick(['-size', big ? '400x500' : '200x200', 'xc:none', ...draw, '-trim', '+repage', '-resize', big ? '232x232' : '150x150', file]);
}

/** Converts raw AI artwork into a keyed, trimmed, fitted base image. */
function makeBase(entry, file) {
  const raw = path.join(RAW, entry.kind === 'hero' ? 'heroes' : entry.kind === 'enemy' ? 'enemies' : 'bosses', `${entry.id}.png`);
  if (fs.existsSync(raw)) {
    const fit = entry.kind === 'boss' ? '232x232' : entry.kind === 'enemy' ? '128x128' : '150x150'; // enemies fit inside the 144px cell
    magick([raw, '-fuzz', '30%', '-transparent', '#00FF00', '-trim', '+repage', '-resize', fit, file]);
    return false;
  }
  makePlaceholderBase(file, entry.kind, entry.color);
  return true;
}

/** Optional real pose art for a hero (art/raw/heroes/<id>-<pose>.png), scaled to the master's height. */
function makePoseBase(entry, masterBase, pose) {
  if (entry.kind === 'boss') return null;
  const raw = path.join(RAW, entry.kind === 'hero' ? 'heroes' : 'enemies', `${entry.id}-${pose}.png`);
  if (!fs.existsSync(raw)) return null;
  const file = path.join(TMP, `${entry.id}-${pose}-base.png`);
  const h = execFileSync('identify', ['-format', '%h', masterBase], { stdio: 'pipe' }).toString().trim();
  // Width is capped so wide swings and stride poses are never cropped by the 160px cell.
  magick([raw, '-fuzz', '30%', '-transparent', '#00FF00', '-trim', '+repage', '-resize', `${entry.kind === 'enemy' ? 104 : 130}x${h}`, file]);
  return file;
}

/** Which pose image (if any) a frame uses. Attack active frames, walk cycle contacts, and idle breath peak. */
function poseFor(entry, a, i) {
  if (entry.kind === 'enemy') return a.name === 'attack' && (a.active ?? []).includes(i) ? 'attack' : null;
  if (entry.kind !== 'hero') return null;
  if ((a.name === 'attack' || a.name === 'combo') && (a.active ?? []).includes(i)) return 'attack';
  if (a.name === 'walk') return { 0: 'walk-a', 2: 'walk-b', 4: 'walk-a', 6: 'walk-b' }[i] ?? null;
  if (a.name === 'idle') return (i === 2 || i === 3) ? 'idle' : null;
  return null;
}

function buildSheet(entry) {
  const size = entry.frameSize;
  const k = size / 160;
  const cols = entry.kind === 'hero' ? 8 : 8;
  const dir = path.join(OUT, entry.kind === 'hero' ? 'heroes' : entry.kind === 'enemy' ? 'enemies' : 'bosses', entry.id);
  fs.mkdirSync(dir, { recursive: true });
  const base = path.join(TMP, `${entry.id}-base.png`);
  const placeholder = makeBase(entry, base);
  // Optional real pose art per hero (idle / walk / attack). Matched to the master's height.
  const poseBases = Object.fromEntries(['attack', 'idle', 'walk-a', 'walk-b'].map((n) => [n, makePoseBase(entry, base, n)]));

  const rowFiles = [];
  const meta = {};
  entry.anims.forEach((a, row) => {
    const poses = POSES[entry.kind][a.name](a.frames);
    const frameFiles = poses.map((p, i) => {
      const f = path.join(TMP, `${entry.id}-${a.name}-${i}.png`);
      const pose = poseFor(entry, a, i);
      renderFrame(pose && poseBases[pose] ? poseBases[pose] : base, p, size, k, f);
      return f;
    });
    while (frameFiles.length < cols) {
      const blank = path.join(TMP, `${entry.id}-blank.png`);
      if (!fs.existsSync(blank)) magick(['-size', `${size}x${size}`, 'xc:none', blank]);
      frameFiles.push(blank);
    }
    const rowFile = path.join(TMP, `${entry.id}-row-${row}.png`);
    magick([...frameFiles, '+repage', '+append', rowFile]);
    rowFiles.push(rowFile);
    meta[a.name] = { row, frames: a.frames, fps: a.fps, loop: !!a.loop, active: a.active ?? [] };
  });
  magick([...rowFiles, '+repage', '-append', '-define', 'png:compression-level=9', path.join(dir, 'sheet.png')]);

  const json = {
    id: entry.id,
    name: entry.name,
    kind: entry.kind,
    accent: entry.accent,
    placeholder,
    sheet: 'sheet.png',
    frameWidth: size,
    frameHeight: size,
    columns: cols,
    rows: entry.anims.length,
    // Feet (pivot) sit at this y inside each frame; the physics body is aligned to it.
    pivot: { x: size / 2, y: size - 4 * k },
    anims: meta,
  };
  fs.writeFileSync(path.join(dir, 'sheet.json'), JSON.stringify(json, null, 2) + '\n');
  return { id: entry.id, placeholder, dir: path.relative(ROOT, dir) };
}

const todo = SPRITE_MANIFEST.filter((e) => !only || e.id === only);
const results = todo.map(buildSheet);

// UI artwork: loading-screen hero illustration from the first hero's raw art (if present)
const heroRaw = path.join(RAW, 'heroes/aiden.png');
const uiDir = path.join(ROOT, 'public/assets/ui');
fs.mkdirSync(uiDir, { recursive: true });
if (fs.existsSync(heroRaw)) {
  magick([heroRaw, '-fuzz', '30%', '-transparent', '#00FF00', '-trim', '+repage', '-resize', 'x720', '-define', 'png:compression-level=9', path.join(uiDir, 'loading-hero.png')]);
}
// Environment backdrop (placeholder gradient — tinted per chapter in-game)
const envDir = path.join(ROOT, 'public/assets/environment');
fs.mkdirSync(envDir, { recursive: true });
magick(['-size', '1280x720', 'gradient:#1b2238-#07080f', '-fill', 'rgba(255,255,255,0.03)', '-draw', 'circle 640,300 640,80', path.join(envDir, 'arena-bg.png')]);

fs.rmSync(TMP, { recursive: true, force: true });
for (const r of results) console.log(`${r.placeholder ? '[PLACEHOLDER]' : '[ART]        '} ${r.id.padEnd(20)} -> ${r.dir}`);
console.log(`Built ${results.length} sprite sheets.`);
