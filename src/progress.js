// Player progress model (client side). The server stores this object and validates its shape.
import { HEROES, XP_FOR_LEVEL, MAX_HERO_LEVEL, UPGRADE_CAP, upgradeCost, CHAPTERS, LEVELS_PER_CHAPTER } from './data/game-data.js';

export function newProgress() {
  return { version: 1, selectedHero: 'aiden', unlockedHeroes: ['aiden'], highestLevelCleared: 0, coins: 0, potions: 3, heroes: {}, equipment: [], equipped: { weapon: null, armor: null }, settings: { sound: true } };
}

export const heroDef = (id) => HEROES.find((h) => h.id === id);

export function heroState(p, id) {
  return p.heroes[id] || { level: 1, xp: 0, upgrades: { hp: 0, atk: 0, def: 0 } };
}

/** Final combat stats for a hero, including level growth, upgrades and equipment. */
export function heroStats(p, id) {
  const d = heroDef(id);
  const s = heroState(p, id);
  const lv = s.level - 1;
  const weapon = p.equipped?.weapon?.bonus || 0;
  const armor = p.equipped?.armor?.bonus || 0;
  const maxHp = Math.round(d.hp + lv * 12 + s.upgrades.hp * 8);
  return {
    maxHp,
    atk: Math.round(d.atk + lv * 1.2 + s.upgrades.atk * 1 + weapon),
    def: Math.round(d.def + lv * 0.5 + s.upgrades.def * 1 + armor),
    speed: d.speed,
    reach: d.reach,
    skill: d.skill,
    skillName: d.skillName,
    accent: d.accent,
    level: s.level,
  };
}

/** Adds XP and levels up. Returns number of levels gained. */
export function addXp(p, id, amount) {
  const s = (p.heroes[id] = heroState(p, id));
  s.xp += amount;
  let gained = 0;
  while (s.level < MAX_HERO_LEVEL && s.xp >= XP_FOR_LEVEL(s.level)) {
    s.xp -= XP_FOR_LEVEL(s.level);
    s.level += 1;
    gained += 1;
  }
  if (s.level >= MAX_HERO_LEVEL) s.xp = 0;
  return gained;
}

export const chaptersCompleted = (p) => Math.floor(p.highestLevelCleared / LEVELS_PER_CHAPTER);
export const isHeroUnlocked = (p, id) => heroDef(id).unlock === 0 || chaptersCompleted(p) >= heroDef(id).unlock;
export const isLevelUnlocked = (p, index) => index <= p.highestLevelCleared + 1;

export function refreshUnlocks(p) {
  p.unlockedHeroes = HEROES.filter((h) => isHeroUnlocked(p, h.id)).map((h) => h.id);
}

export function buyUpgrade(p, id, stat) {
  const s = (p.heroes[id] = heroState(p, id));
  const cur = s.upgrades[stat];
  if (cur >= UPGRADE_CAP) return { ok: false, reason: 'Maximum upgrades reached.' };
  const cost = upgradeCost(cur);
  if (p.coins < cost) return { ok: false, reason: `Need ${cost} coins.` };
  p.coins -= cost;
  s.upgrades[stat] = cur + 1;
  return { ok: true };
}

export function equipItem(p, item) {
  const slot = item.slot;
  p.equipped[slot] = p.equipped[slot]?.id === item.id ? null : item;
}

export const CHAPTER_OF_LEVEL = (index) => CHAPTERS[Math.floor((index - 1) / LEVELS_PER_CHAPTER)];
