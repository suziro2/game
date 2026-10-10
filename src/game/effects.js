// Procedural combat effects (no external image files). Textures are generated once per scene.
import Phaser from 'phaser';

export function ensureEffectTextures(scene) {
  if (scene.textures.exists('fx-glow')) return;
  const g = scene.make.graphics({ x: 0, y: 0, add: false });
  for (let r = 64; r > 0; r -= 2) {
    g.fillStyle(0xffffff, (1 - r / 64) * 0.9);
    g.fillCircle(64, 64, r);
  }
  g.generateTexture('fx-glow', 128, 128);
  g.destroy();
}

export function orbTexture(scene, color) {
  const key = `fx-orb-${color.toString(16)}`;
  if (scene.textures.exists(key)) return key;
  const g = scene.make.graphics({ add: false });
  for (let r = 22; r > 0; r -= 2) { g.fillStyle(color, 0.12 + (1 - r / 22) * 0.6); g.fillCircle(24, 24, r); }
  g.fillStyle(0xffffff, 0.9); g.fillCircle(24, 24, 5);
  g.generateTexture(key, 48, 48);
  g.destroy();
  return key;
}

export function burst(scene, x, y, color, radius = 60, dur = 380) {
  const s = scene.add.image(x, y, 'fx-glow').setTint(color).setDepth(9000).setScale(0.2).setAlpha(0.9);
  scene.tweens.add({ targets: s, scale: radius / 64, alpha: 0, duration: dur, ease: 'Cubic.easeOut', onComplete: () => s.destroy() });
}

/** Arc slash in front of a fighter. */
export function slash(scene, x, y, facing, color, big = false) {
  const g = scene.add.graphics().setDepth(9000);
  g.lineStyle(big ? 10 : 7, color, 0.95);
  g.beginPath();
  g.arc(x, y, big ? 110 : 80, Phaser.Math.DegToRad(facing > 0 ? -70 : 110), Phaser.Math.DegToRad(facing > 0 ? 70 : 250), false);
  g.strokePath();
  scene.tweens.add({ targets: g, alpha: 0, duration: 220, onComplete: () => g.destroy() });
}

export function shockwave(scene, x, groundY, radius, color) {
  const e = scene.add.ellipse(x, groundY, 20, 16, color, 0.35).setStrokeStyle(4, color, 0.9).setDepth(8000);
  scene.tweens.add({ targets: e, width: radius * 2, height: 60, alpha: 0, duration: 520, ease: 'Quad.easeOut', onComplete: () => e.destroy() });
}

export function floatText(scene, x, y, text, color = '#ffffff', size = 22) {
  const t = scene.add.text(x, y, text, { fontFamily: '"Trebuchet MS", Verdana, sans-serif', fontSize: `${size}px`, fontStyle: 'bold', color, stroke: '#000000', strokeThickness: 5 }).setOrigin(0.5).setDepth(9500);
  scene.tweens.add({ targets: t, y: y - 60, alpha: 0, duration: 900, ease: 'Sine.easeOut', onComplete: () => t.destroy() });
}

export function flash(scene, color = 0xffffff, alpha = 0.35, ms = 160) {
  const r = scene.add.rectangle(640, 360, 1280, 720, color, alpha).setScrollFactor(0).setDepth(9800);
  scene.tweens.add({ targets: r, alpha: 0, duration: ms, onComplete: () => r.destroy() });
}

export function shake(scene, ms = 200, intensity = 0.006) { scene.cameras.main.shake(ms, intensity); }

/** Plays a one-shot effect sprite sheet (fx-<name>) at a position and destroys it when finished. */
export function playFx(scene, name, x, y, { tint = 0xffffff, scale = 1, flip = false, depth = 9000, add = true } = {}) {
  const key = `fx-${name}:play`;
  if (!scene.anims.exists(key)) return null;
  const s = scene.add.sprite(x, y, `fx-${name}`, 0).setTint(tint).setScale(scale).setDepth(depth).setFlipX(flip);
  if (add) s.setBlendMode(Phaser.BlendModes.ADD);
  s.play(key);
  s.once('animationcomplete', () => s.destroy());
  return s;
}

/**
 * Motion trail for an attack: a tinted copy of the fighter's current frame that drifts forward and fades.
 * The attack sheets only shift slightly between frames, so this makes the swing/lunge clearly visible.
 */
export function afterimage(scene, sprite, { tint = 0xffffff, dx = 0, dur = 280, alpha = 0.6 } = {}) {
  if (!sprite || !sprite.texture || !sprite.frame) return null;
  const g = scene.add.sprite(sprite.x, sprite.y, sprite.texture.key, sprite.frame.name)
    .setOrigin(sprite.originX, sprite.originY)
    .setScale(sprite.scaleX, sprite.scaleY)
    .setFlipX(sprite.flipX)
    .setTint(tint)
    .setAlpha(alpha)
    .setDepth(sprite.depth - 1)
    .setBlendMode(Phaser.BlendModes.ADD);
  scene.tweens.add({
    targets: g, x: g.x + dx, alpha: 0, scaleX: g.scaleX * 1.08, scaleY: g.scaleY * 1.04,
    duration: dur, ease: 'Quad.easeOut', onComplete: () => g.destroy(),
  });
  return g;
}
