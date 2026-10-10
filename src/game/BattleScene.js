// Battle scene — one stage, Undead Slayer style:
//  - side-scrolling stage; the camera follows the hero through the level
//  - enemies come in waves; the next wave wakes up as the hero advances
//  - the hero auto-attacks anything in reach, and auto-runs toward the next wave once a wave is cleared
//  - enemies drop HP / energy orbs and coins, collected automatically when the hero passes them
//  - double-tap a direction (or L) to dash-dodge with invulnerability frames
import Phaser from 'phaser';
import { Hero, Enemy, Boss, GROUND, overlap } from './fighters.js';
import { ENEMIES, BOSSES, CHAPTERS, rollEquipment } from '../data/game-data.js';
import { ensureEffectTextures, orbTexture, burst, shockwave, floatText, flash, shake, playFx, afterimage } from './effects.js';
import { touch, consumeTouch, resetTouch } from './input.js';

const { JustDown } = Phaser.Input.Keyboard;
const WAVE_SIZE = 3;
const WAVE_SPACING = 950;
const WAVE_START = 1050;
const DOUBLE_TAP_MS = 260;
const DROP_LIFE = 10;

export class BattleScene extends Phaser.Scene {
  constructor() { super('Battle'); }

  init(data) {
    this.cfg = data;
    this.level = data.level;
    this.chapter = CHAPTERS[data.level.chapter - 1];
    this.heroId = data.heroId;
    this.stats = data.stats;
    this.potions = data.potions;
    this.result = { kills: 0, coins: 0, xp: 0, dropped: null };
    this.enemies = [];
    this.waves = [];
    this.nextWave = 0;
    this.drops = [];
    this.projectiles = [];
    this.boss = null;
    this.ended = false;
    this.paused = false;
    this.victoryStarted = false;
    this.timeScale = 1;
    this.lastTap = { left: -999, right: -999 };
    this.prevTouch = { left: false, right: false };
    const { chapter: c, levelInChapter: l } = data.level;
    this.hpMul = 1 + 0.2 * (c - 1) + 0.06 * (l - 1);
    this.atkMul = 1 + 0.08 * (c - 1) + 0.02 * (l - 1);
    this.enemyDef = Math.floor(data.level.index / 9);
    const waveCount = Math.ceil(data.level.enemyCount / WAVE_SIZE);
    this.worldW = data.level.isBoss ? 2600 : WAVE_START + waveCount * WAVE_SPACING + 700;
  }

  create() {
    const { width, height } = this.scale;
    const W = this.worldW;
    this.add.tileSprite(0, 0, W, 720, 'env-arena').setOrigin(0, 0).setTint(this.chapter.tint).setScrollFactor(0.35).setDepth(-100);
    this.add.rectangle(W / 2, GROUND + (720 - GROUND) / 2, W, 720 - GROUND, 0x1a1d2e).setDepth(-50);
    this.add.rectangle(W / 2, GROUND, W, 3, 0x7fd3ff, 0.35).setDepth(-49);
    ensureEffectTextures(this);

    this.keys = this.input.keyboard.addKeys({ A: 'A', D: 'D', LEFT: 'LEFT', RIGHT: 'RIGHT', W: 'W', UP: 'UP', SPACE: 'SPACE', J: 'J', K: 'K', L: 'L', H: 'H', SHIFT: 'SHIFT', ESC: 'ESC', Q: 'Q' });
    resetTouch();

    this.hero = new Hero(this, { id: this.heroId, stats: this.stats, potions: this.potions, x: 260 });
    this.cameras.main.setBounds(0, 0, W, 720);
    this.cameras.main.startFollow(this.hero.sprite, true, 0.12, 0.12);
    this.cameras.main.setFollowOffset(-120, 0);

    this.hud = this.add.graphics().setScrollFactor(0).setDepth(9900);
    const txt = (x, y, size, color, align = 'left') => this.add.text(x, y, '', { fontFamily: '"Trebuchet MS", Verdana, sans-serif', fontSize: `${size}px`, fontStyle: 'bold', color, stroke: '#000', strokeThickness: 4 }).setScrollFactor(0).setDepth(9901).setOrigin(align === 'center' ? 0.5 : 0, 0);
    this.txtHero = txt(24, 16, 18, '#ffffff');
    this.txtPotions = txt(24, 84, 16, '#f6d365');
    this.txtTitle = txt(width / 2, 10, 20, '#f6d365', 'center');
    this.txtCount = txt(width / 2, 40, 16, '#9fe3ff', 'center');
    this.txtBoss = txt(width / 2, 60, 18, '#ffb4a8', 'center');
    this.txtBanner = txt(width / 2, height / 2 - 120, 34, '#ffffff', 'center');
    this.txtBanner.setAlpha(0);
    this.txtTitle.setText(this.level.title);
    this.txtPaused = this.add.text(width / 2, height / 2, 'PAUSED\nEsc to resume · Q to quit', { fontFamily: '"Trebuchet MS", sans-serif', fontSize: '34px', fontStyle: 'bold', align: 'center', color: '#fff', stroke: '#000', strokeThickness: 6 }).setOrigin(0.5).setScrollFactor(0).setDepth(9950).setVisible(false);
    this.hint = txt(width / 2, height - 36, 14, '#c9d2f5', 'center');
    this.hint.setText('A/D move · double-tap dash · J/auto attack · K skill · H potion · Esc pause');
    this.time.delayedCall(9000, () => this.tweens.add({ targets: this.hint, alpha: 0, duration: 1200 }));

    this.buildStage();
    this.cameras.main.fadeIn(350, 0, 0, 0);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.cleanup());
  }

  /** Creates every enemy (dormant) grouped into waves along the stage, or the boss at the far end. */
  buildStage() {
    if (this.level.isBoss) {
      const id = this.level.boss;
      this.boss = new Boss(this, { id, def: BOSSES[id], x: this.worldW - 520, hpMul: 1, atkMul: 1 });
      this.bossActivated = false;
      return;
    }
    const types = this.level.enemyTypes;
    let made = 0;
    const count = this.level.enemyCount;
    while (made < count) {
      const w = this.waves.length;
      const anchor = WAVE_START + w * WAVE_SPACING;
      const wave = { anchor, enemies: [], activated: false };
      for (let j = 0; j < WAVE_SIZE && made < count; j++, made++) {
        const type = types[made % types.length];
        const x = anchor + (j - (WAVE_SIZE - 1) / 2) * 70;
        const e = new Enemy(this, { id: type, def: ENEMIES[type], x, hpMul: this.hpMul, atkMul: this.atkMul, defense: this.enemyDef });
        wave.enemies.push(e);
        this.enemies.push(e);
      }
      this.waves.push(wave);
    }
  }

  cleanup() {
    this.anims.globalTimeScale = 1;
    this.tweens.timeScale = 1;
    this.tweens.killAll();
    this.time.removeAllEvents();
    for (const p of this.projectiles) p.img.destroy();
    for (const d of this.drops) d.img.destroy();
    this.projectiles = [];
    this.drops = [];
    resetTouch();
  }

  banner(text, color = '#ffffff') {
    this.txtBanner.setText(text).setColor(color).setAlpha(1);
    this.tweens.killTweensOf(this.txtBanner);
    this.tweens.add({ targets: this.txtBanner, alpha: 0, delay: 1400, duration: 600 });
  }

  /* ---------------- Waves / boss activation ---------------- */
  updateWaves() {
    const hx = this.hero.x;
    if (this.level.isBoss) {
      if (!this.bossActivated && hx > this.boss.x - 1000) {
        this.bossActivated = true;
        this.boss.activate();
        this.boss.sprite.setAlpha(0);
        this.tweens.add({ targets: this.boss.sprite, alpha: 1, duration: 600 });
        flash(this, this.chapter.tint, 0.35, 500);
        shake(this, 300, 0.008);
        this.banner(`⚔ ${this.boss.name}`, '#ff8a7a');
      }
      return;
    }
    const wave = this.waves[this.nextWave];
    if (!wave) return;
    const prevCleared = this.nextWave === 0 || this.waves[this.nextWave - 1].enemies.every((e) => e.dead || e.gone);
    if (prevCleared && hx > wave.anchor - 1000) {
      wave.activated = true;
      wave.enemies.forEach((e, i) => e.activate(0.35 + i * 0.15));
      this.nextWave++;
      this.banner(`Wave ${this.nextWave} / ${this.waves.length}`);
      shake(this, 120, 0.003);
    }
  }

  /** Enemies still alive (activated and not dead). */
  aliveEnemies() { return this.enemies.filter((e) => !e.dead && !e.gone && !e.dormant); }
  targets() {
    const list = this.aliveEnemies();
    if (this.boss && !this.boss.dead && !this.boss.dormant) list.push(this.boss);
    return list;
  }

  /* ---------------- Input ---------------- */
  readInput() {
    const k = this.keys;
    const now = this.time.now;
    const leftPressed = JustDown(k.A) || JustDown(k.LEFT) || consumeTouch('left');
    const rightPressed = JustDown(k.D) || JustDown(k.RIGHT) || consumeTouch('right');
    let dash = 0;
    if (leftPressed) { if (now - this.lastTap.left < DOUBLE_TAP_MS) dash = -1; this.lastTap.left = now; }
    if (rightPressed) { if (now - this.lastTap.right < DOUBLE_TAP_MS) dash = 1; this.lastTap.right = now; }
    const left = k.A.isDown || k.LEFT.isDown || touch.left;
    const right = k.D.isDown || k.RIGHT.isDown || touch.right;
    return {
      dir: (right ? 1 : 0) - (left ? 1 : 0),
      run: k.SHIFT.isDown || touch.run,
      dash,
      jump: JustDown(k.W) || JustDown(k.UP) || JustDown(k.SPACE) || consumeTouch('jump'),
      attack: JustDown(k.J) || consumeTouch('attack'),
      skill: JustDown(k.K) || consumeTouch('skill'),
      dodge: JustDown(k.L) || consumeTouch('dodge'),
      potion: JustDown(k.H) || consumeTouch('potion'),
      pause: JustDown(k.ESC) || consumeTouch('pause'),
      quit: JustDown(k.Q),
    };
  }

  /* ---------------- Main loop ---------------- */
  update(_time, delta) {
    if (this.ended) return;
    const inp = this.readInput();
    if (inp.pause) this.setPaused(!this.paused);
    if (this.paused) {
      if (inp.quit) this.endLevel(false, true);
      return;
    }
    const dt = Math.min(delta, 50) / 1000 * this.timeScale;
    const hero = this.hero;

    this.updateWaves();
    // Auto-run toward the next wave when the field is clear (Undead Slayer-style progression).
    const field = this.aliveEnemies().length === 0 && this.nextWave < this.waves.length;
    const autoDir = field && !this.level.isBoss && !hero.dead && !hero.locked && inp.dir === 0 ? 1 : 0;
    const dir = inp.dir || autoDir;

    if (inp.dash && !hero.dead) hero.tryDodge(inp.dash);
    hero.update(dt, { dir, run: inp.run || (autoDir && false) });
    if (!hero.dead) {
      if (inp.dodge) hero.tryDodge();
      if (inp.attack) hero.tryAttack();
      else this.autoAttack();
      if (inp.skill) hero.trySkill();
      if (inp.jump && hero.z === 0 && !hero.locked) hero.vz = 540;
      if (inp.potion) this.usePotion();
    }

    for (const e of this.enemies) e.update(dt, hero);
    if (this.boss) this.boss.update(dt, hero);
    this.enemies = this.enemies.filter((e) => !e.gone);
    this.updateProjectiles(dt);
    this.updateDrops(dt);
    this.checkEnd();
    this.drawHud();
  }

  /** Auto-attack: strike the nearest enemy inside reach, turning to face it. */
  autoAttack() {
    const hero = this.hero;
    if (hero.locked || hero.dead) return;
    const reach = hero.stats.reach + 26;
    let best = null; let bestD = Infinity;
    for (const t of this.targets()) {
      const d = Math.abs(t.x - hero.x);
      if (d <= reach && d < bestD) { best = t; bestD = d; }
    }
    if (!best) return;
    hero.faceToward(best.x);
    hero.tryAttack();
  }

  setPaused(v) {
    this.paused = v;
    this.txtPaused.setVisible(v);
    this.anims.globalTimeScale = v ? 0 : 1;
    this.tweens.timeScale = v ? 0 : 1;
  }

  /* ---------------- Combat resolution ---------------- */
  hitTarget(target, dmg, { crit = false, fromX = this.hero.x, color } = {}) {
    if (target.dead || target.gone || target.dormant) return;
    const wasDead = target.dead;
    const dealt = target.takeHit(dmg, fromX);
    if (dealt > 0) {
      floatText(this, target.x, GROUND - target.z - (target.kind === 'boss' ? 240 : 120), `${dealt}${crit ? '!' : ''}`, crit ? '#ffd54f' : color ?? '#ffffff', crit ? 30 : 22);
      playFx(this, 'impact', target.x, GROUND - target.z - (target.kind === 'boss' ? 150 : 80), { tint: crit ? 0xffd54f : 0xffffff, scale: crit ? 1.5 : 1.1 });
    }
    if (crit) shake(this, 120, 0.004);
    this.hero.energy = Math.min(100, this.hero.energy + 4);
    if (!wasDead && target.dead && target.kind === 'enemy') this.onKill(target);
  }

  heroMelee(hero, mul) {
    const box = hero.frontBox(hero.stats.reach, 130, 0);
    const combo = mul > 1;
    // Visible attack sprite: a motion trail of the hero plus a large accent-colored weapon arc.
    afterimage(this, hero.sprite, { tint: hero.stats.accent, dx: hero.facing * (combo ? 70 : 48) });
    playFx(this, 'slash', hero.x + hero.facing * (combo ? 95 : 75), GROUND - hero.z - (combo ? 118 : 102), {
      tint: hero.stats.accent, scale: combo ? 1.7 : 1.35, flip: hero.facing < 0,
    });
    if (combo) {
      // The finisher lands a second, white arc a moment later.
      this.time.delayedCall(120, () => playFx(this, 'slash', hero.x + hero.facing * 80, GROUND - hero.z - 84, {
        tint: 0xffffff, scale: 1.5, flip: hero.facing < 0,
      }));
    }
    for (const t of this.targets()) {
      if (hero.hitIds.has(t) || !overlap(box, t.box)) continue;
      hero.hitIds.add(t);
      const crit = Math.random() < 0.12;
      const dmg = hero.atk * mul * (0.9 + Math.random() * 0.2) * (crit ? 1.6 : 1);
      this.hitTarget(t, dmg, { crit, fromX: hero.x, color: '#ffffff' });
    }
  }

  heroSkill(hero) {
    const color = hero.stats.accent;
    flash(this, color, 0.18, 220);
    shake(this, 160, 0.003);
    if (hero.stats.skill === 'burst') {
      const radius = ['ronan', 'bruno', 'darius'].includes(hero.id) ? 300 : 240;
      playFx(this, 'burst', hero.x, GROUND - 90, { tint: color, scale: radius / 110 });
      for (const t of this.targets()) {
        if (Math.abs(t.x - hero.x) > radius) continue;
        this.hitTarget(t, hero.atk * 2.2 * (0.95 + Math.random() * 0.1), { fromX: hero.x, color: '#ffd9a0' });
      }
      if (hero.id === 'elian') { hero.hp = Math.min(hero.maxHp, hero.hp + Math.round(hero.maxHp * 0.15)); floatText(this, hero.x, GROUND - 200, '+HEAL', '#fff3a0'); }
    } else {
      const img = this.add.image(hero.x + hero.facing * 40, GROUND - hero.z - 70, orbTexture(this, color)).setDepth(9000).setScale(1.2);
      this.projectiles.push({ kind: 'hero', img, x: hero.x + hero.facing * 40, z: 70, vx: hero.facing * 640, dmg: hero.atk * 2, color, life: 1.6 });
    }
  }

  enemyMelee(enemy, reach, dmg) {
    const box = enemy.frontBox(reach, 110, 0);
    const hero = this.hero;
    // Enemy attack sprite: red motion trail and a red strike arc (shown even when the attack misses).
    afterimage(this, enemy.sprite, { tint: 0xff4040, dx: enemy.facing * 46, alpha: 0.55 });
    playFx(this, 'slash', enemy.x + enemy.facing * 70, GROUND - enemy.z - 100, {
      tint: 0xff4a4a, scale: 1.15, flip: enemy.facing < 0,
    });
    if (hero.dead || !overlap(box, hero.box)) return;
    this.hitHero(dmg * (0.9 + Math.random() * 0.2), enemy.x);
  }

  hitHero(dmg, fromX) {
    const hero = this.hero;
    const res = hero.takeHit(dmg, fromX);
    if (res === 'dodged') { floatText(this, hero.x, GROUND - 150, 'DODGE', '#9fe3ff', 24); return; }
    if (typeof res === 'number') {
      floatText(this, hero.x, GROUND - 150, `-${res}`, '#ff8a8a', 24);
      playFx(this, 'impact', hero.x, GROUND - 80, { tint: 0xff5050, scale: 1.1 });
      flash(this, 0xff3030, 0.2, 140);
      shake(this, 90, 0.002);
    }
  }

  enemyProjectile(enemy, sp) {
    const img = this.add.image(enemy.x + enemy.facing * 30, GROUND - 70, orbTexture(this, sp.color)).setDepth(9000);
    this.projectiles.push({ kind: 'enemy', img, x: enemy.x + enemy.facing * 30, z: 70, vx: enemy.facing * 340, dmg: enemy.atk * sp.dmg, color: sp.color, life: 3 });
  }

  enemyAoe(enemy, radius, dmg) {
    shockwave(this, enemy.x, GROUND, radius, 0xc48cff);
    if (!this.hero.dead && Math.abs(this.hero.x - enemy.x) <= radius && this.hero.z < 30) this.hitHero(dmg, enemy.x);
  }

  bossMelee(boss, reach, dmg, kind) {
    const box = boss.frontBox(reach, 200, 0);
    afterimage(this, boss.sprite, { tint: 0xff6a4a, dx: boss.facing * 70, dur: 340, alpha: 0.5 });
    playFx(this, 'slash', boss.x + boss.facing * 90, GROUND - 130, { tint: 0xff8a6a, scale: 1.9, flip: boss.facing < 0 });
    if (kind === 'heavy') shake(this, 260, 0.008);
    if (!this.hero.dead && overlap(box, this.hero.box)) this.hitHero(dmg * (0.9 + Math.random() * 0.2), boss.x);
  }

  bossVolley(boss) {
    flash(this, 0xff7a4a, 0.12, 200);
    burst(this, boss.x + boss.facing * 90, GROUND - 170, 0xff7a4a, 80, 400);
    for (const z of [30, 90, 150]) {
      const img = this.add.image(boss.x + boss.facing * 90, GROUND - z, orbTexture(this, 0xff7a4a)).setDepth(9000).setScale(1.3);
      this.projectiles.push({ kind: 'enemy', img, x: boss.x + boss.facing * 90, z, vx: boss.facing * 480, dmg: boss.atk * 0.9, color: 0xff7a4a, life: 3 });
    }
  }

  bossShockwave(boss) {
    shockwave(this, boss.x, GROUND, 320, 0xff5a3c);
    playFx(this, 'dust', boss.x, GROUND - 10, { scale: 3, add: false });
    shake(this, 280, 0.01);
    if (!this.hero.dead && this.hero.z < 1 && Math.abs(this.hero.x - boss.x) <= 320) this.hitHero(boss.atk * 1.25, boss.x);
  }

  updateProjectiles(dt) {
    this.projectiles = this.projectiles.filter((p) => {
      p.life -= dt;
      p.x += p.vx * dt;
      p.img.setPosition(p.x, GROUND - p.z);
      if (p.life <= 0 || p.x < -60 || p.x > this.worldW + 60) { p.img.destroy(); return false; }
      if (p.kind === 'enemy') {
        const hb = { x: p.x - 18, y: GROUND - p.z - 18, w: 36, h: 36 };
        if (!this.hero.dead && overlap(hb, this.hero.box)) { this.hitHero(p.dmg, p.x); burst(this, p.x, GROUND - p.z, p.color, 40, 240); p.img.destroy(); return false; }
      } else {
        const hb = { x: p.x - 20, y: GROUND - p.z - 20, w: 40, h: 40 };
        for (const t of this.targets()) {
          if (overlap(hb, t.box)) {
            this.hitTarget(t, p.dmg, { fromX: p.x, color: '#ffffff' });
            burst(this, p.x, GROUND - p.z, p.color, 50, 260);
            p.img.destroy();
            return false;
          }
        }
      }
      return true;
    });
  }

  /* ---------------- Drops (Undead Slayer-style orbs, auto-collected) ---------------- */
  spawnDrops(enemy) {
    const boss = enemy.kind === 'boss';
    const table = [];
    if (boss || Math.random() < 0.5) table.push('hp');
    if (boss || Math.random() < 0.6) table.push('energy');
    table.push('coin');
    if (boss) table.push('coin', 'coin');
    table.forEach((kind, i) => {
      const x = enemy.x + (i - table.length / 2) * 26;
      const color = kind === 'hp' ? 0x5dff8a : kind === 'energy' ? 0x7fd3ff : 0xf6d365;
      const img = this.add.image(x, GROUND - 60, 'fx-glow').setTint(color).setScale(kind === 'coin' ? 0.22 : 0.3).setDepth(8500);
      this.drops.push({ kind, img, x, z: 60 + Math.random() * 30, vz: 220, life: DROP_LIFE, value: kind === 'coin' ? Math.round(enemy.cfg.coins * this.hpMul * 0.5) + 2 : 0 });
    });
  }
  updateDrops(dt) {
    const hero = this.hero;
    this.drops = this.drops.filter((d) => {
      d.life -= dt;
      d.vz -= 900 * dt;
      d.z = Math.max(0, d.z + d.vz * dt);
      if (d.z === 0) d.vz = 0;
      // magnet: drifts toward the hero once close enough
      if (Math.abs(d.x - hero.x) < 130 && !hero.dead) d.x += Math.sign(hero.x - d.x) * Math.min(Math.abs(hero.x - d.x), 620 * dt);
      d.img.setPosition(d.x, GROUND - d.z - 14);
      if (d.life < 2) d.img.setAlpha(Math.sin(d.life * 14) > 0 ? 1 : 0.2);
      const picked = !hero.dead && Math.abs(d.x - hero.x) < 34 && hero.z < 90;
      if (picked || d.life <= 0) {
        if (picked) this.collect(d);
        d.img.destroy();
        return false;
      }
      return true;
    });
  }
  collect(d) {
    const hero = this.hero;
    if (d.kind === 'hp') {
      const heal = Math.round(hero.maxHp * 0.14);
      hero.hp = Math.min(hero.maxHp, hero.hp + heal);
      floatText(this, hero.x, GROUND - 150, `+${heal}`, '#7dff9e', 20);
    } else if (d.kind === 'energy') {
      hero.energy = Math.min(100, hero.energy + 30);
      floatText(this, hero.x, GROUND - 150, '+ENERGY', '#7fd3ff', 18);
    } else {
      this.result.coins += d.value;
      floatText(this, hero.x, GROUND - 150, `+${d.value}🪙`, '#f6d365', 18);
    }
  }

  usePotion() {
    const hero = this.hero;
    if (hero.dead) return;
    if (this.potions <= 0) { floatText(this, hero.x, GROUND - 150, 'No potions', '#cccccc', 20); return; }
    if (hero.hp >= hero.maxHp) { floatText(this, hero.x, GROUND - 150, 'Full HP', '#cccccc', 20); return; }
    const heal = Math.round(hero.maxHp * 0.45);
    hero.hp = Math.min(hero.maxHp, hero.hp + heal);
    this.potions -= 1;
    burst(this, hero.x, GROUND - 70, 0x7dff9e, 90, 500);
    floatText(this, hero.x, GROUND - 150, `+${heal}`, '#7dff9e', 26);
  }

  /* ---------------- Events from fighters ---------------- */
  onKill(enemy) {
    const cfg = enemy.cfg;
    this.result.kills += 1;
    this.result.xp += Math.round(cfg.xp * this.hpMul);
    this.spawnDrops(enemy);
  }
  onEnemyDeathDone(enemy) {
    enemy.gone = true;
    this.tweens.add({ targets: enemy.sprite, alpha: 0, duration: 420, onComplete: () => enemy.sprite.destroy() });
  }
  onBossPhase(boss) {
    flash(this, 0xffffff, 0.55, 420);
    shake(this, 400, 0.012);
    this.banner(`PHASE ${boss.phase + 1}`, '#ff6a6a');
    playFx(this, 'burst', boss.x, GROUND - 120, { tint: 0xff6a6a, scale: 2.4 });
  }
  onBossDying(boss) {
    this.timeScale = 0.35;
    flash(this, 0xffffff, 0.6, 700);
    this.time.delayedCall(1400, () => { this.timeScale = 1; });
    this.result.kills += 1;
    this.result.xp += 400 * this.level.chapter;
    this.result.coins += 200 + 60 * this.level.chapter;
    this.spawnDrops(boss);
  }
  onBossDefeatAnimDone(boss) {
    this.tweens.add({ targets: boss.sprite, alpha: 0, duration: 800 });
    if (!this.victoryStarted) { this.victoryStarted = true; this.beginVictory(); }
  }
  onHeroDefeatAnimDone() {
    if (this.ended) return;
    this.time.delayedCall(900, () => this.endLevel(false, false));
  }

  checkEnd() {
    if (this.ended || this.hero.dead) return;
    if (this.level.isBoss) return; // boss victory is triggered by onBossDefeatAnimDone
    if (!this.victoryStarted && this.nextWave >= this.waves.length && this.enemies.every((e) => e.dead || e.gone)) {
      this.victoryStarted = true;
      this.beginVictory();
    }
  }
  beginVictory() {
    this.banner('STAGE CLEAR', '#7dff9e');
    this.hero.play('victory', { force: true });
    this.time.delayedCall(1500, () => this.endLevel(true, false));
  }

  endLevel(won, quit) {
    if (this.ended) return;
    this.ended = true;
    this.paused = false;
    if (won) {
      const pool = this.level.isBoss ? 1 : 0.35;
      if (Math.random() < pool) this.result.dropped = rollEquipment(this.level.index);
    }
    const payload = { ...this.result, won, quit: !!quit, potionsLeft: this.potions, heroHp: this.hero.hp };
    this.time.delayedCall(120, () => this.cfg.onEnd(payload));
  }

  /* ---------------- HUD ---------------- */
  drawHud() {
    const g = this.hud;
    g.clear();
    const h = this.hero;
    g.fillStyle(0x000000, 0.55).fillRect(20, 40, 300, 18);
    const hpPct = Math.max(0, h.hp / h.maxHp);
    g.fillStyle(hpPct > 0.35 ? 0x5dff8a : 0xff5a5a, 1).fillRect(22, 42, 296 * hpPct, 14);
    g.fillStyle(0x000000, 0.55).fillRect(20, 62, 200, 10);
    g.fillStyle(h.stats.accent, 1).fillRect(22, 64, 196 * (h.energy / 100), 6);
    // stage progress along the map
    g.fillStyle(0x000000, 0.5).fillRect(this.scale.width - 230, 18, 210, 8);
    g.fillStyle(0xf6d365, 1).fillRect(this.scale.width - 229, 19, 208 * Math.min(1, h.x / this.worldW), 6);
    this.txtHero.setText(`${this.heroDisplay()} · Lv ${this.stats.level}`);
    this.txtPotions.setText(`🧪 ${this.potions}  (H)`);
    const alive = this.aliveEnemies().length + this.waves.slice(this.nextWave).reduce((n, w) => n + w.enemies.length, 0);
    this.txtCount.setText(this.level.isBoss ? '' : `Enemies left: ${alive}`);
    const b = this.boss;
    if (b && !b.gone && !b.dormant) {
      const w = 620; const x0 = this.scale.width / 2 - w / 2;
      g.fillStyle(0x000000, 0.6).fillRect(x0 - 2, 84, w + 4, 18);
      const pct = Math.max(0, b.hp / b.maxHp);
      g.fillStyle(pct > 0.66 ? 0xff5a5a : pct > 0.33 ? 0xff9a3c : 0xff2a6a, 1).fillRect(x0, 86, w * pct, 14);
      g.fillStyle(0xffffff, 0.6); g.fillRect(x0 + w * 0.66 - 1, 84, 2, 18); g.fillRect(x0 + w * 0.33 - 1, 84, 2, 18);
      this.txtBoss.setText(`${b.name} · ${Math.ceil(pct * 100)}%`);
    } else this.txtBoss.setText('');
  }
  heroDisplay() { return this.heroId.charAt(0).toUpperCase() + this.heroId.slice(1); }
}
