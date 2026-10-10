#!/usr/bin/env node
// Builds frame-by-frame combat effect sprite sheets (white, tinted at runtime per hero/element):
//   slash  — arc sweep for melee attacks (8 frames, 192px)
//   burst  — expanding energy ring for skills (8 frames, 256px)
//   impact — spark burst on hit (6 frames, 128px)
//   dust   — dodge/landing puff (6 frames, 128px)
// Output: public/assets/effects/<name>/sheet.png + sheet.json (1 row, `columns` = frames).
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'public/assets/effects');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'fx-'));
const magick = (args) => execFileSync('convert', args, { stdio: 'pipe' });

function frameFiles(name, n, size, draw) {
  const files = [];
  for (let i = 0; i < n; i++) {
    const f = path.join(TMP, `${name}-${i}.png`);
    magick(['-size', `${size}x${size}`, 'xc:none', ...draw(i, n, size), '+repage', '-type', 'TrueColorAlpha', '-define', 'png:color-type=6', f]);
    files.push(f);
  }
  return files;
}

function writeSheet(name, files, size, fps, loop, extra = {}) {
  const dir = path.join(OUT, name);
  fs.mkdirSync(dir, { recursive: true });
  magick([...files, '+repage', '+append', '-type', 'TrueColorAlpha', '-define', 'png:color-type=6', path.join(dir, 'sheet.png')]);
  fs.writeFileSync(path.join(dir, 'sheet.json'), JSON.stringify({ id: name, frameWidth: size, frameHeight: size, columns: files.length, rows: 1, anims: { play: { row: 0, frames: files.length, fps, loop } }, ...extra }, null, 2) + '\n');
}

const pt = (cx, cy, r, deg) => [cx + r * Math.cos((deg * Math.PI) / 180), cy + r * Math.sin((deg * Math.PI) / 180)].map((v) => v.toFixed(1)).join(',');

// Slash: a crescent sweeping across the front of the hero, from upper-back to forward.
const slashFiles = frameFiles('slash', 8, 192, (i, n, s) => {
  const c = s / 2, r = 78;
  const t = (i + 1) / n;
  const start = -110 + 150 * (i / n);       // rotating start
  const end = start + 120 * t + 40;
  const alpha = (1 - i / n * 0.55).toFixed(2);
  const pts = [];
  for (let d = start; d <= end; d += 6) pts.push(pt(c, c, r, d));
  const trail = [];
  for (let d = start - 30; d <= end - 25; d += 6) trail.push(pt(c, c, r - 12, d));
  return [
    '-fill', 'none', '-stroke', `rgba(255,255,255,${(alpha * 0.45).toFixed(2)})`, '-strokewidth', '22',
    '-draw', `polyline ${trail.join(' ')}`,
    '-stroke', `rgba(255,255,255,${alpha})`, '-strokewidth', '9',
    '-draw', `polyline ${pts.join(' ')}`,
    '-stroke', 'rgba(255,255,255,1)', '-strokewidth', '3',
    '-draw', `polyline ${pts.slice(Math.floor(pts.length * 0.4)).join(' ')}`,
  ];
});
writeSheet('slash', slashFiles, 192, 22, false);

// Burst: expanding ring with a soft core, for skills.
const burstFiles = frameFiles('burst', 8, 256, (i, n, s) => {
  const c = s / 2;
  const t = i / (n - 1);
  const r = 24 + t * 104;
  const a = (1 - t * 0.85).toFixed(2);
  return [
    '-fill', `rgba(255,255,255,${(0.35 * (1 - t)).toFixed(2)})`, '-draw', `circle ${c},${c} ${c},${c - (c * (0.3 + 0.7 * t))}`,
    '-fill', 'none', '-stroke', `rgba(255,255,255,${a})`, '-strokewidth', String(Math.max(3, 16 * (1 - t))),
    '-draw', `circle ${c},${c} ${c + r},${c}`,
    '-stroke', `rgba(255,255,255,${(a * 0.6).toFixed(2)})`, '-strokewidth', String(Math.max(2, 8 * (1 - t))),
    '-draw', `circle ${c},${c} ${c + r * 0.6},${c}`,
  ];
});
writeSheet('burst', burstFiles, 256, 16, false);

// Impact: star sparks that grow and fade.
const impactFiles = frameFiles('impact', 6, 128, (i, n, s) => {
  const c = s / 2;
  const t = i / (n - 1);
  const len = 14 + 44 * Math.sin(Math.min(1, t * 1.2) * Math.PI / 2);
  const a = (1 - t).toFixed(2);
  const args = ['-fill', 'none', '-stroke', `rgba(255,255,255,${a})`, '-strokewidth', String(Math.max(2, 7 * (1 - t)))];
  for (let d = 0; d < 360; d += 45) {
    const jitter = (d * 13) % 17 - 8;
    args.push('-draw', `line ${pt(c, c, 10, d)} ${pt(c, c, len + jitter * 0.4, d)}`);
  }
  args.push('-fill', `rgba(255,255,255,${a})`, '-stroke', 'none', '-draw', `circle ${c},${c} ${c},${c - 10 * (1 - t) - 4}`);
  return args;
});
writeSheet('impact', impactFiles, 128, 18, false);

// Dust: soft puff that spreads and fades (dodge / landing).
const dustFiles = frameFiles('dust', 6, 128, (i, n, s) => {
  const c = s / 2;
  const t = i / (n - 1);
  const rx = 20 + 36 * t, ry = 8 + 12 * t;
  const a = (0.55 * (1 - t)).toFixed(2);
  return ['-fill', `rgba(255,255,255,${a})`, '-draw', `ellipse ${c},${c * 1.5} ${rx},${ry} 0,360`, '-fill', `rgba(255,255,255,${(0.6 * (1 - t)).toFixed(2)})`, '-draw', `ellipse ${c},${c * 1.5} ${rx * 0.5},${ry * 0.5} 0,360`];
});
writeSheet('dust', dustFiles, 128, 16, false);

fs.rmSync(TMP, { recursive: true, force: true });
console.log('Built effect sheets: slash, burst, impact, dust');
