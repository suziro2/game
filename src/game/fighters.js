// Combat entities. Each is a Phaser sprite driven by a sheet's animation metadata.
// Positions use a simple 2D model: x (horizontal), z (height above ground). Hit detection
// uses explicit rectangles built from the fighter's hurtbox and the active attack frames.
import { SPRITE_SIZES } from '../data/game-data.js';
import { textureKey, metaCache } from './assets.js';

export const GROUND = 610;
export const ARENA_W = 1280;
const GRAVITY = 1500;
export const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

/** Base class: state machine over the sheet's animations. */
export class Fighter {
  constructor(scene, { kind, id, x, facing, hurtbox, hp, atk, def, speed }) {
    this.scene = scene;
    this.kind = kind;
    this.id = id;
    this.key = textureKey(kind, id);
    this.meta = metaCache[this.key];
    this.x = x;
    this.z = 0;
    this.vz = 0;
    this.vx = 0;
    this.facing = facing;
    this.hurtbox = hurtbox; // {w,h}
    this.hp = this.maxHp = hp;
    this.atk = atk;
    this.def = def;
    this.speed = speed;
    this.dead = false;
    this.locked = false;
    this.state = '';
    this.hitIds = new Set();
    this.invuln = 0;
    const s = SPRITE_SIZES[kind];
    this.sprite = scene.add.sprite(x, GROUND, this.key, 0).setOrigin(this.meta.pivot.x / s.fw, this.meta.pivot.y / s.fh);
    this.sprite.setFlipX(facing < 0);
    this.sprite.on('animationupdate', (anim, frame) => this._frame(anim, frame));
    this.sprite.on('animationcomplete', (anim) => this._complete(anim));
    this.play('idle', { force: true });
  }

  /** Hurtbox in world space (feet at GROUND - z). */
  get box() {
    return { x: this.x - this.hurtbox.w / 2, y: GROUND - this.z - this.hurtbox.h, w: this.hurtbox.w, h: this.hurtbox.h };
  }
  /** Rectangle in front of the fighter covering `reach` pixels. */
  frontBox(reach, height = 120, z0 = 0) {
    return { x: this.facing > 0 ? this.x : this.x - reach, y: GROUND - this.z - z0 - height, w: reach, h: height };
  }

  has(name) { return !!this.meta.anims[name]; }

  /** Plays an animation unless a locked (non-looping) one is running. Returns true if started. */
  play(name, { force = false } = {}) {
    if (this.dead && name !== 'death' && name !== 'defeat') return false;
    if (!this.has(name)) return false;
    if (this.locked && !force) return false;
    const a = this.meta.anims[name];
    this.state = name;
    this.locked = !a.loop;
    this.hitIds.clear();
    this.sprite.anims.play(`${this.key}:${name}`, true);
    return true;
  }

  _frame(anim, frame) {
    const name = anim.key.slice(this.key.length + 1);
    const a = this.meta.anims[name];
    if (!a) return;
    const local = frame.textureFrame - a.row * SPRITE_SIZES[this.kind].cols;
    if (a.active && a.active.includes(local)) this.onActive(name, local);
  }

  _complete(anim) {
    const name = anim.key.slice(this.key.length + 1);
    const a = this.meta.anims[name];
    if (!a || a.loop) return;
    this.locked = false;
    this.onAnimEnd(name);
  }

  faceToward(tx) {
    if (Math.abs(tx - this.x) > 6) this.facing = tx > this.x ? 1 : -1;
    this.sprite.setFlipX(this.facing < 0);
  }

  syncSprite() {
    this.sprite.setPosition(this.x, GROUND - this.z);
    this.sprite.setDepth(GROUND - this.z + 1);
  }

  /** Physics: horizontal integration, gravity, clamping to the arena. */
  integrate(dt) {
    if (this.z > 0 || this.vz !== 0) {
      this.vz -= GRAVITY * dt;
      this.z += this.vz * dt;
      if (this.z <= 0) { this.z = 0; this.vz = 0; this.onLand?.(); }
    }
    this.x = Math.max(40, Math.min(ARENA_W - 40, this.x + this.vx * dt));
    this.syncSprite();
  }

  /** Floor for hit reaction: returns actual damage applied. */
  applyDamage(dmg) {
    const d = Math.max(1, Math.round(dmg));
    this.hp = Math.max(0, this.hp - d);
    return d;
  }
  onActive() {}
  onAnimEnd() {}
}

/* ---------------- Hero (player-controlled) ---------------- */
export class Hero extends Fighter {
  constructor(scene, { id, stats, potions, x = 260 }) {
    super(scene, { kind: 'hero', id, x, facing: 1, hurtbox: { w: 46, h: 112 }, hp: stats.maxHp, atk: stats.atk, def: stats.def, speed: stats.speed });
    this.stats = stats;
    this.maxHp = stats.maxHp;
    this.energy = 100;
    this.dodgeCd = 0;
    this.dodgeTime = 0;
    this.dodgeVx = 0;
    this.comboTimer = 0;
    this.comboBuffered = false;
    this.armor = 0;     // super armor (skill windup): hits don't interrupt
  }

  update(dt, inp) {
    this.invuln = Math.max(0, this.invuln - dt);
    this.dodgeCd = Math.max(0, this.dodgeCd - dt);
    this.comboTimer = Math.max(0, this.comboTimer - dt);
    this.armor = Math.max(0, this.armor - dt);
    this.energy = Math.min(100, this.energy + 5 * dt);

    if (this.dead) { this.vx = 0; this.integrate(dt); return; }

    if (this.dodgeTime > 0) {
      this.dodgeTime -= dt;
      this.vx = this.dodgeVx;
    } else if (!this.locked) {
      const moveSpeed = this.stats.speed * (inp.run ? 1.55 : 1);
      this.vx = inp.dir * moveSpeed;
      if (inp.dir) this.facing = inp.dir > 0 ? 1 : -1;
      this.sprite.setFlipX(this.facing < 0);
    } else {
      this.vx = 0;
    }
    this.integrate(dt);

    if (!this.locked) {
      if (this.z > 0) this.play('idle');
      else if (inp.dir) this.play(inp.run ? 'run' : 'walk');
      else this.play('idle');
    }
  }

  tryAttack() {
    if (this.dead) return;
    if (this.locked) {
      // Buffer a press during the basic attack so it chains into the combo finisher.
      if (this.state === 'attack') this.comboBuffered = true;
      return;
    }
    if (this.comboTimer > 0) { this.comboTimer = 0; this.play('combo', { force: true }); return; }
    this.play('attack', { force: true });
  }

  trySkill() {
    if (this.dead || this.locked || this.energy < 30) return false;
    this.energy -= 30;
    this.armor = 0.9;
    return this.play('skill');
  }

  tryDodge() {
    if (this.dead || this.dodgeCd > 0 || this.z > 0) return false;
    this.dodgeCd = 0.75;
    this.invuln = 0.36;
    this.dodgeTime = 0.3;
    this.dodgeVx = -this.facing * 430;
    this.comboBuffered = false;
    return this.play('dodge', { force: true });
  }

  onActive(name) {
    if (name === 'attack' || name === 'combo') this.scene.heroMelee(this, name === 'combo' ? 1.35 : 1);
    else if (name === 'skill') this.scene.heroSkill(this);
  }

  onAnimEnd(name) {
    if (name === 'attack') {
      if (this.comboBuffered) { this.comboBuffered = false; this.play('combo', { force: true }); }
      else this.comboTimer = 0.55;
    } else if (name === 'defeat') {
      this.scene.onHeroDefeatAnimDone();
    }
  }

  /** Returns 'dodged' | 'blocked' | number (damage taken). */
  takeHit(dmg, fromX) {
    if (this.dead) return 'dead';
    if (this.invuln > 0) return 'dodged';
    const taken = this.applyDamage(Math.max(1, dmg - this.def * 0.6));
    if (this.hp <= 0) { this.die(); return taken; }
    if (this.armor <= 0) {
      this.vx = (this.x > fromX ? 1 : -1) * 90;
      this.play('hit', { force: true });
      this.dodgeTime = 0;
    }
    return taken;
  }

  die() {
    this.dead = true;
    this.vx = 0;
    this.dodgeTime = 0;
    this.play('defeat', { force: true });
  }
}

/* ---------------- Regular enemy AI ---------------- */
export class Enemy extends Fighter {
  constructor(scene, { id, def, x, hpMul, atkMul, defense, spawnDelay = 0 }) {
    const hp = Math.round(def.hp * hpMul);
    super(scene, { kind: 'enemy', id, x, facing: -1, hurtbox: { w: 50, h: 100 }, hp, atk: Math.round(def.atk * atkMul), def: defense, speed: def.speed });
    this.maxHp = hp;
    this.cfg = def;
    this.aggro = def.aggro;
    this.cd = 0.4;
    this.specialCd = 1.2;
    this.aware = false;
    this.spawnDelay = spawnDelay;
    this.sprite.setAlpha(spawnDelay > 0 ? 0 : 1);
    this.lastHitTime = 0;
  }

  update(dt, hero) {
    if (this.dead) { this.integrate(dt); return; }
    this.cd = Math.max(0, this.cd - dt);
    this.specialCd = Math.max(0, this.specialCd - dt);
    if (this.spawnDelay > 0) {
      this.spawnDelay -= dt;
      if (this.spawnDelay <= 0) this.sprite.setAlpha(1);
      return;
    }
    this.faceToward(hero.x);
    this.vx = 0;
    if (this.locked || hero.dead) { this.integrate(dt); return; }
    const dx = hero.x - this.x;
    const dist = Math.abs(dx);
    if (!this.aware) {
      if (dist < this.aggro) this.aware = true;
      else { this.play('idle'); this.integrate(dt); return; }
    }
    const sp = this.cfg.special;
    if (sp && this.specialCd <= 0 && dist > this.cfg.range && dist <= sp.range && Math.random() < 0.025) {
      this.specialCd = sp.cd;
      this.play('special', { force: true });
    } else if (dist > this.cfg.range) {
      this.vx = Math.sign(dx) * this.speed;
      this.play('walk');
    } else {
      this.play('idle');
      if (this.cd <= 0) { this.cd = this.cfg.cd; this.play('attack', { force: true }); }
    }
    this.integrate(dt);
  }

  onActive(name) {
    if (name === 'attack') this.scene.enemyMelee(this, this.cfg.range + 14, this.atk);
    else if (name === 'special') {
      const sp = this.cfg.special;
      if (sp.proj) this.scene.enemyProjectile(this, sp);
      else this.scene.enemyAoe(this, sp.range * 0.7, this.atk * sp.dmg);
    }
  }

  onAnimEnd(name) {
    if (name === 'hit' && !this.dead) this.play('idle');
    if (name === 'death') this.scene.onEnemyDeathDone(this);
  }

  takeHit(dmg, fromX) {
    if (this.dead) return 0;
    const taken = this.applyDamage(Math.max(1, dmg - this.def));
    this.aware = true;
    if (this.hp <= 0) { this.die(); return taken; }
    if (this.state !== 'attack' && this.state !== 'special') this.play('hit', { force: true });
    this.vx = (this.x > fromX ? 1 : -1) * 60;
    return taken;
  }

  die() {
    this.dead = true;
    this.vx = 0;
    this.play('death', { force: true });
  }
}

/* ---------------- Boss AI with phases ---------------- */
export class Boss extends Fighter {
  constructor(scene, { id, def, x, hpMul, atkMul }) {
    const hp = Math.round(def.hp * hpMul);
    super(scene, { kind: 'boss', id, x, facing: -1, hurtbox: { w: 130, h: 200 }, hp, atk: Math.round(def.atk * atkMul), def: 2, speed: def.speed });
    this.maxHp = hp;
    this.cfg = def;
    this.phase = 0;
    this.phaseLock = false;
    this.cd = 1.2;
    this.aware = false;
    this.name = def.name;
  }

  get phaseMul() { return [1, 0.85, 0.7][this.phase]; }

  update(dt, hero) {
    if (this.dead) { this.integrate(dt); return; }
    this.cd = Math.max(0, this.cd - dt);
    this.faceToward(hero.x);
    this.vx = 0;
    if (this.locked || hero.dead) { this.integrate(dt); return; }
    const dx = hero.x - this.x;
    const dist = Math.abs(dx);
    if (!this.aware && dist < this.cfg.aggro) this.aware = true;
    if (!this.aware) { this.play('idle'); this.integrate(dt); return; }

    if (this.cd <= 0) {
      const r = Math.random();
      if (dist < 175) {
        this.cd = 1.3 * this.phaseMul;
        if (r < 0.55) this.play('basic', { force: true });
        else { this.play('heavy', { force: true }); this.cd = 2.4 * this.phaseMul; }
      } else if (r < 0.35) {
        this.cd = 2.6 * this.phaseMul; this.play('special', { force: true });
      } else if (r < 0.6 || dist < 300) {
        this.cd = 3.1 * this.phaseMul; this.play('aoe', { force: true });
      } else {
        this.play('move');
        this.vx = Math.sign(dx) * this.speed * this.phaseMul;
      }
    } else if (dist > 170) {
      this.vx = Math.sign(dx) * this.speed * this.phaseMul;
      this.play('move');
    } else {
      this.play('idle');
    }
    this.integrate(dt);
  }

  onActive(name) {
    if (name === 'basic') this.scene.bossMelee(this, 150, this.atk, 'basic');
    else if (name === 'heavy') this.scene.bossMelee(this, 210, this.atk * 1.9, 'heavy');
    else if (name === 'special') this.scene.bossVolley(this);
    else if (name === 'aoe') this.scene.bossShockwave(this);
  }

  onAnimEnd(name) {
    if (name === 'phase') this.phaseLock = false;
    if ((name === 'hit' || name === 'phase') && !this.dead) this.play('idle', { force: true });
    if (name === 'defeat') this.scene.onBossDefeatAnimDone(this);
  }

  takeHit(dmg, fromX) {
    if (this.dead || this.phaseLock) return 0;
    const taken = this.applyDamage(Math.max(1, dmg - this.def));
    const pct = this.hp / this.maxHp;
    const newPhase = pct <= 0.33 ? 2 : pct <= 0.66 ? 1 : 0;
    if (this.hp <= 0) { this.die(); return taken; }
    if (newPhase > this.phase) {
      this.phase = newPhase;
      this.phaseLock = true;
      this.play('phase', { force: true });
      this.scene.onBossPhase(this);
    } else if (this.state === 'idle' || this.state === 'move') {
      // Hit reactions do not make the boss immune; only phase transitions do.
      this.play('hit', { force: true });
    }
    return taken;
  }

  die() {
    this.dead = true;
    this.vx = 0;
    this.play('defeat', { force: true });
    this.scene.onBossDying(this);
  }
}
