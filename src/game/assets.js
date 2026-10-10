// Asset loading for a level, using Phaser's loader so progress is real (bytes/files actually loaded).
import Phaser from 'phaser';
import { SPRITE_SIZES, spritePath, metaPath, BOSSES } from '../data/game-data.js';
import { loader } from '../ui/loader.js';

export const metaCache = {}; // textureKey -> sheet.json contents
export const textureKey = (kind, id) => `${kind}-${id}`;

/** Every sprite a level needs: the selected hero, the chapter's enemy types or the chapter boss. */
export function requiredAssets(level, heroId) {
  const list = [{ kind: 'hero', id: heroId }];
  if (level.isBoss) list.push({ kind: 'boss', id: level.boss });
  else for (const e of new Set(level.enemyTypes)) list.push({ kind: 'enemy', id: e });
  return list;
}

/** Creates animations for a sheet from its metadata (idempotent). */
export function buildAnimations(scene, key, meta) {
  const { cols } = SPRITE_SIZES[meta.kind];
  for (const [name, a] of Object.entries(meta.anims)) {
    const animKey = `${key}:${name}`;
    if (scene.anims.exists(animKey)) continue;
    const frames = Array.from({ length: a.frames }, (_, i) => ({ key, frame: a.row * cols + i }));
    scene.anims.create({ key: animKey, frames, frameRate: a.fps, repeat: a.loop ? -1 : 0 });
  }
}

/** Drops textures (and their animations) for sprites a new level doesn't need. Frees GPU memory. */
export function unloadUnused(scene, keep) {
  for (const key of scene.textures.getTextureKeys()) {
    if (!/^(hero|enemy|boss)-/.test(key) || keep.has(key)) continue;
    const meta = metaCache[key];
    if (meta) for (const name of Object.keys(meta.anims)) scene.anims.remove(`${key}:${name}`);
    scene.textures.remove(key);
    delete metaCache[key];
  }
}

/**
 * Loads everything a level needs. Resolves with { failed } once Phaser's loader completes.
 * Progress is forwarded to the loading screen from the loader's own events.
 */
export function loadLevelAssets(scene, { level, heroId }) {
  return new Promise((resolve) => {
    const needed = requiredAssets(level, heroId);
    const keep = new Set(needed.map((a) => textureKey(a.kind, a.id)));
    unloadUnused(scene, keep);

    const failed = [];
    let queued = 0;
    for (const a of needed) {
      const key = textureKey(a.kind, a.id);
      if (!scene.textures.exists(key)) {
        const s = SPRITE_SIZES[a.kind];
        scene.load.spritesheet(key, spritePath(a.kind, a.id), { frameWidth: s.fw, frameHeight: s.fh });
        queued++;
      }
      if (!metaCache[key]) { scene.load.json(`${key}-meta`, metaPath(a.kind, a.id)); queued++; }
    }
    if (!scene.textures.exists('env-arena')) { scene.load.image('env-arena', '/assets/environment/arena-bg.png'); queued++; }

    if (queued === 0) {
      // Everything is already cached (e.g. retrying a level): just (re)build animations.
      for (const a of needed) buildAnimations(scene, textureKey(a.kind, a.id), metaCache[textureKey(a.kind, a.id)]);
      scene.time.delayedCall(0, () => resolve({ failed: [] }));
      return;
    }

    const onProgress = (v) => loader.setProgress(v, `Loading ${needed.length} sprite sheets and environment…`);
    const onError = (file) => failed.push(file.key || file.url);
    const cleanup = () => {
      scene.load.off('progress', onProgress);
      scene.load.off(Phaser.Loader.Events.FILE_LOAD_ERROR, onError);
    };
    scene.load.on('progress', onProgress);
    scene.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, onError);
    scene.load.once(Phaser.Loader.Events.COMPLETE, () => {
      cleanup();
      if (failed.length) return resolve({ failed });
      for (const a of needed) {
        const key = textureKey(a.kind, a.id);
        if (!metaCache[key]) {
          const json = scene.cache.json.get(`${key}-meta`);
          if (!json || !json.anims) return resolve({ failed: [`${key}-meta`] });
          metaCache[key] = { ...json, kind: a.kind };
        }
        buildAnimations(scene, key, metaCache[key]);
      }
      resolve({ failed: [] });
    });
    scene.load.start();
  });
}

export const bossName = (id) => BOSSES[id]?.name ?? id;
