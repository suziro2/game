// Battle scene: one level. Owns spawning, player/enemy/boss actions, damage resolution, HUD and results.
import Phaser from 'phaser';
import { Hero, Enemy, Boss, GROUND, overlap } from './fighters.js';
import { ENEMIES, BOSSES, CHAPTERS, rollEquipment } from '../data/game-data.js';
import { ensureEffectTextures, orbTexture, burst, slash, shockwave, floatText, flash, shake } from './effects.js';
import { touch, consumeTouch, resetTouch } from './input.js';

const { JustDown } = Phaser.Input.Keyboard;
const MAX_ALIVE = 3;

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
    this.queue = [];
    this.projectiles = [];
    this.boss = null;
    this.ended = false;
    this.paused = false;
    this.victoryStarted = false;
    this.timeScale = 1;
    this.spawnTimer = 0.8;
    // Difficulty grows with chapter and stage (enemy HP mainly, attack mildly).
    const { chapter: c, levelInChapter: l } = data.level;
    this.hpMul = 1 + 0.2 * (c - 1) + 0.06 * (l - 1);
    this.atkMul = 1 + 0.08 * (c - 1) + 0.02 * (l - 1);
    this.enemyDef = Math.floor(data.level.index / 9);
  }

  create() {
    const { width, height } = this.scale;
    const bg = this.add.image(640, 360, 'env-arena').setDisplaySize(1280, 720).setTint(this.chapter.tint);
    bg.setDepth(-100);
    this.add.rectangle(640, (GROUND + 720) / 2, 1280, 720 - GROUND, 0x1a1d2e).setDepth(-50);
    this.add.rectangle(640, GROUND, 1280, 3, 0x7fd3ff, 0.35).setDepth(-49);
    ensureEffectTextures(this);

    this.keys = this.input.keyboard.addKeys({ A: 'A', D: 'D', LEFT: 'LEFT', RIGHT: 'RIGHT', W: 'W', UP: 'UP', SPACE: 'SPACE', J: 'J', K: 'K', L: 'L', H: 'H', SHIFT: 'SHIFT', ESC: 'ESC', Q: 'Q' });
    resetTouch();

    this.hero = new Hero(this, { id: this.heroId, stats: this.stats, potions: this.potions, x: 260 });
    this.hud = this.add.graphics().setScrollFactor(0).setDepth(9900);
    const txt = (x, y, size, color, align = 'left') => this.add.text(x, y, '', { fontFamily: '"Trebuchet MS", Verdana, sans-serif', fontSize: `${size}px`, fontStyle: 'bold', color, stroke: '#000', strokeThickness: 4 }).setScrollFactor(0).setDepth(9901).setOrigin(align === 'center' ? 0.5 : 0, 0);
    this.txtHero = txt(24, 16, 18, '#ffffff');
    this.txtPotions = txt(24, 66, 16, '#f6d365');
    this.txtTitle = txt(width / 2, 10, 20, '#f6d365', 'center');
    this.txtCount = txt(width / 2, 40, 16, '#9fe3ff', 'center');
    this.txtBoss = txt(width / 2, 60, 18, '#ffb4a8', 'center');
    this.txtTitle.setText(this.level.title);
    this.txtPaused = this.add.text(width / 2, height / 2, 'PAUSED\nEsc to resume · Q to quit', { fontFamily: '"Trebuchet MS", sans-serif', fontSize: '34px', fontStyle: 'bold', align: 'center', color: '#fff', stroke: '#000', strokeThickness: 6 }).setOrigin(0.5).setScrollFactor(0).setDepth(9950).setVisible(false);
    this.hint = txt(width / 2, height - 36, 14, '#c9d2f5', 'center');
    this.hint.setText('A/D move · Shift run · Space jump · J attack (chain) · K skill · L dodge · H potion · Esc pause');
    this.time.delayedCall(8000, () => this.tweens.add({ targets: this.hint, alpha: 0, duration: 1200 }));

    if (this.level.isBoss) {
      this.time.delayedCall(700, () => this.spawnBoss());
    } else {
      const types = this.level.enemyTypes;
      for (let i = 0; i < this.level.enemyCount; i++) this.queue.push(types[i % types.length]);
    }
    this.cameras.main.setBackgroundColor('#000');
    this.cameras.main.fadeIn(350, 0, 0, 0);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.cleanup());
  }

  cleanup() {
    this.anims.globalTimeScale = 1;
    this.tweens.timeScale = 1;
    this.tweens.killAll();
    this.time.removeAllEvents();
    for (const p of this.projectiles) p.img.destroy();
    this.projectiles = [];
    resetTouch();
  }

  /* ---------------- Spawning ---------------- */
  spawnEnemy(type) {
    const x = 820 + Math.random() * 320;
    const e = new Enemy(this, { id: type, def: ENEMIES[type], x, hpMul: this.hpMul, atkMul: this.atkMul, defense: this.enemyDef, spawnDelay: 0.5 });
    this.enemies.push(e);
    return e;
  }
  spawnBoss() {
    const id = this.level.boss;
    this.boss = new Boss(this, { id, def: BOSSES[id], x: 940, hpMul: 1, atkMul: 1 });
    this.boss.spawnFx = true;
    this.boss.sprite.setAlpha(0);
    this.tweens.add({ targets: this.boss.sprite, alpha: 1, duration: 500 });
    flash(this, this.chapter.tint, 0.35, 500);
  }
  updateSpawns(dt) {
    if (this.level.isBoss) return;
    this.spawnTimer -= dt;
    const alive = this.enemies.filter((e) => !e.dead && !e.gone).length;
    if (this.queue.length && alive < MAX_ALIVE && this.spawnTimer <= 0) {
      this.spawnEnemy(this.queue.shift());
      this.spawnTimer = 1.3;
    }
  }
  targets() {
    const list = this.enemies.filter((e) => !e.dead && !e.gone);
    if (this.boss && !this.boss.dead) list.push(this.boss);
    return list;
  }

  /* ---------------- Input ---------------- */
  readInput() {
    const k = this.keys;
    const left = k.A.isDown || k.LEFT.isDown || touch.left;
    const right = k.D.isDown || k.RIGHT.isDown || touch.right;
    return {
      dir: (right ? 1 : 0) - (left ? 1 : 0),
      run: k.SHIFT.isDown || touch.run,
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

    this.hero.update(dt, inp);
    if (!this.hero.dead) {
      if (inp.attack) this.hero.tryAttack();
      if (inp.skill) this.hero.trySkill();
      if (inp.dodge) this.hero.tryDodge();
      if (inp.jump && this.hero.z === 0 && !this.hero.locked) this.hero.vz = 540;
      if (inp.potion) this.usePotion();
    }
    this.updateSpawns(dt);
    for (const e of this.enemies) e.update(dt, this.hero);
    if (this.boss) this.boss.update(dt, this.hero);
    this.updateProjectiles(dt);
    this.enemies = this.enemies.filter((e) => !e.gone);
    this.checkEnd();
    this.drawHud();
  }

  setPaused(v) {
    this.paused = v;
    this.txtPaused.setVisible(v);
    this.anims.globalTimeScale = v ? 0 : 1;
    this.tweens.timeScale = v ? 0 : 1;
  }

  /* ---------------- Combat resolution ---------------- */
  /** Applies player damage to a target and reports results. */
  hitTarget(target, dmg, { crit = false, fromX = this.hero.x, color } = {}) {
    if (target.dead || target.gone) return;
    const wasDead = target.dead;
    const dealt = target.takeHit(dmg, fromX);
    if (dealt > 0) {
      const label = `${dealt}${crit ? '!' : ''}`;
      floatText(this, target.x, GROUND - target.z - (target.kind === 'boss' ? 240 : 120), label, crit ? '#ffd54f' : color ?? '#ffffff', crit ? 30 : 22);
    }
    if (crit) shake(this, 120, 0.004);
    this.hero.energy = Math.min(100, this.hero.energy + 4);
    if (!wasDead && target.dead && target.kind === 'enemy') this.onKill(target);
  }

  heroMelee(hero, mul) {
    const box = hero.frontBox(hero.stats.reach, 130, 0);
    slash(this, hero.x + hero.facing * 40, GROUND - hero.z - 80, hero.facing, hero.stats.accent, mul > 1);
    for (const t of this.targets()) {
      if (hero.hitIds.has(t) || !overlap(box, t.box)) continue;
      hero.hitIds.add(t);
      const crit = Math.random() < 0.12;
      const dmg = hero.atk * mul * (0.9 + Math.random() * 0.2) * (crit ? 1.6 : 1);
      this.hitTarget(t, dmg, { crit, fromX: hero.x, color: '#ffffff' });
      burst(this, t.x, GROUND - t.z - 70, hero.stats.accent, 46, 260);
    }
  }

  heroSkill(hero) {
    const color = hero.stats.accent;
    flash(this, color, 0.18, 220);
    shake(this, 160, 0.003);
    if (hero.stats.skill === 'burst') {
      const radius = hero.id === 'ronan' || hero.id === 'bruno' || hero.id === 'darius' ? 280 : 230;
      burst(this, hero.x, GROUND - 60, color, radius, 520);
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
    if (hero.dead || !overlap(box, hero.box)) return;
    this.hitHero(dmg * (0.9 + Math.random() * 0.2), enemy.x);
  }

  hitHero(dmg, fromX) {
    const hero = this.hero;
    const res = hero.takeHit(dmg, fromX);
    if (res === 'dodged') { floatText(this, hero.x, GROUND - 150, 'DODGE', '#9fe3ff', 24); return; }
    if (typeof res === 'number') {
      floatText(this, hero.x, GROUND - 150, `-${res}`, '#ff8a8a', 24);
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
    slash(this, boss.x + boss.facing * 60, GROUND - 120, boss.facing, 0xff8a6a, true);
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
    shake(this, 280, 0.01);
    if (!this.hero.dead && this.hero.z < 1 && Math.abs(this.hero.x - boss.x) <= 320) this.hitHero(boss.atk * 1.25, boss.x);
  }

  updateProjectiles(dt) {
    this.projectiles = this.projectiles.filter((p) => {
      p.life -= dt;
      p.x += p.vx * dt;
      p.img.setPosition(p.x, GROUND - p.z);
      if (p.life <= 0 || p.x < -60 || p.x > 1340) { p.img.destroy(); return false; }
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
    const coins = Math.round(cfg.coins * this.hpMul);
    this.result.coins += coins;
    this.result.xp += Math.round(cfg.xp * this.hpMul);
    floatText(this, enemy.x, GROUND - 200, `+${coins}🪙`, '#f6d365', 18);
  }
  onEnemyDeathDone(enemy) {
    enemy.gone = true;
    this.tweens.add({ targets: enemy.sprite, alpha: 0, duration: 420, onComplete: () => enemy.sprite.destroy() });
  }
  onBossPhase(boss) {
    flash(this, 0xffffff, 0.55, 420);
    shake(this, 400, 0.012);
    floatText(this, boss.x, GROUND - 280, `PHASE ${boss.phase + 1}`, '#ff6a6a', 40);
  }
  onBossDying(boss) {
    this.timeScale = 0.35;
    flash(this, 0xffffff, 0.6, 700);
    this.time.delayedCall(1400, () => { this.timeScale = 1; });
    this.result.kills += 1;
    this.result.xp += 400 * this.level.chapter;
    this.result.coins += 200 + 60 * this.level.chapter;
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
    if (!this.victoryStarted && this.queue.length === 0 && this.enemies.every((e) => e.dead || e.gone)) {
      this.victoryStarted = true;
      this.beginVictory();
    }
  }
  beginVictory() {
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
    // HP
    g.fillStyle(0x000000, 0.55).fillRect(20, 40, 300, 18);
    const hpPct = Math.max(0, h.hp / h.maxHp);
    g.fillStyle(hpPct > 0.35 ? 0x5dff8a : 0xff5a5a, 1).fillRect(22, 42, 296 * hpPct, 14);
    // Energy
    g.fillStyle(0x000000, 0.55).fillRect(20, 62, 200, 10);
    g.fillStyle(h.stats.accent, 1).fillRect(22, 64, 196 * (h.energy / 100), 6);
    this.txtHero.setText(`${this.heroDisplay()} · Lv ${this.stats.level}`);
    this.txtPotions.setText(`🧪 ${this.potions}  (H)`);
    const alive = this.enemies.filter((e) => !e.dead && !e.gone).length + this.queue.length;
    this.txtCount.setText(this.level.isBoss ? '' : `Enemies left: ${alive}`);
    // Boss bar
    const b = this.boss;
    if (b && !b.gone) {
      const w = 620; const x0 = this.scale.width / 2 - w / 2;
      g.fillStyle(0x000000, 0.6).fillRect(x0 - 2, 84, w + 4, 18);
      const pct = Math.max(0, b.hp / b.maxHp);
      g.fillStyle(pct > 0.66 ? 0xff5a5a : pct > 0.33 ? 0xff9a3c : 0xff2a6a, 1).fillRect(x0, 86, w * pct, 14);
      g.fillStyle(0xffffff, 0.6); g.fillRect(x0 + w * 0.66 - 1, 84, 2, 18); g.fillRect(x0 + w * 0.33 - 1, 84, 2, 18);
      this.txtBoss.setText(`${b.name} · ${b.hp > 0 ? `${Math.ceil(pct * 100)}%` : ''}`);
      this.txtBoss.setY(60);
    } else this.txtBoss.setText('');
  }
  heroDisplay() { return this.heroId.charAt(0).toUpperCase() + this.heroId.slice(1); }

}
