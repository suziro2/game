// Core game data: heroes, enemies, bosses, chapters (10) and levels (5 per chapter = 50).
// Visual/animation metadata lives in each sheet.json (see tools/sprite-manifest.mjs).

export const CHAPTERS_COUNT = 10;
export const LEVELS_PER_CHAPTER = 5; // levels 1-4 regular encounters, level 5 boss

// Each hero has its own basic attack and three skills.
//   attack: { kind: 'melee' | 'bolt', mul, hits?, scale?, count? } — melee uses the reach hitbox; bolt fires a small projectile.
//   skills[i]: { name, kind: 'aoe' | 'bolt' | 'dash' | 'heal', cost (energy), mul (damage x ATK), ... }
//     aoe:  radius, shake?, heal? (fraction of max HP)
//     bolt: count (projectiles), spread (px between them)
//     dash: dist (px forward, hits everything on the way), heal?
//     heal: heal (fraction of max HP), radius? (optional damage around the hero)
export const HEROES_RAW = [
  { id: 'aiden', name: 'Aiden', title: 'Silver Knight', role: 'Balanced', hp: 120, atk: 14, def: 5, speed: 170, reach: 86, unlock: 0, accent: 0x7fd3ff,
    attack: { kind: 'melee', mul: 1, scale: 1.35 },
    skills: [
      { name: 'Radiant Cleave', kind: 'aoe', cost: 30, mul: 2.2, radius: 240, fx: 'burst' },
      { name: 'Sun Lance', kind: 'dash', cost: 35, mul: 2.0, dist: 320 },
      { name: 'Holy Guard', kind: 'heal', cost: 45, heal: 0.2, mul: 1.0, radius: 160 },
    ] },
  { id: 'luna', name: 'Luna', title: 'Moon Mage', role: 'Ranged magic', hp: 95, atk: 11, def: 3, speed: 165, reach: 60, unlock: 1, accent: 0xb79cff,
    attack: { kind: 'bolt', mul: 0.9, count: 1 },
    skills: [
      { name: 'Lunar Bolt', kind: 'bolt', cost: 30, mul: 2.0, count: 1, spread: 0 },
      { name: 'Moon Volley', kind: 'bolt', cost: 40, mul: 1.1, count: 3, spread: 40 },
      { name: 'Eclipse', kind: 'aoe', cost: 50, mul: 2.6, radius: 320, fx: 'burst' },
    ] },
  { id: 'ronan', name: 'Ronan', title: 'Crimson Greatsword', role: 'Heavy tank', hp: 150, atk: 17, def: 7, speed: 145, reach: 96, unlock: 2, accent: 0xff6a4e,
    attack: { kind: 'melee', mul: 1.35, scale: 1.6 },
    skills: [
      { name: 'Crimson Quake', kind: 'aoe', cost: 30, mul: 2.4, radius: 300, shake: true, fx: 'burst' },
      { name: 'Blood Charge', kind: 'dash', cost: 35, mul: 2.2, dist: 260 },
      { name: 'Iron Will', kind: 'heal', cost: 45, heal: 0.25, mul: 0.8, radius: 200 },
    ] },
  { id: 'mira', name: 'Mira', title: 'Shadow Dagger', role: 'Fast striker', hp: 100, atk: 13, def: 3, speed: 230, reach: 70, unlock: 3, accent: 0x6dffb0,
    attack: { kind: 'melee', mul: 0.7, hits: 2, scale: 1.15 },
    skills: [
      { name: 'Viper Flurry', kind: 'aoe', cost: 30, mul: 1.8, radius: 200, fx: 'slash' },
      { name: 'Shadow Step', kind: 'dash', cost: 35, mul: 2.2, dist: 420 },
      { name: 'Venom Cloud', kind: 'aoe', cost: 50, mul: 1.6, radius: 340, fx: 'burst' },
    ] },
  { id: 'kael', name: 'Kael', title: 'Golden Spear', role: 'Reach fighter', hp: 115, atk: 14, def: 5, speed: 175, reach: 104, unlock: 4, accent: 0xffd54f,
    attack: { kind: 'melee', mul: 1.1, scale: 1.25 },
    skills: [
      { name: 'Sunlance', kind: 'bolt', cost: 30, mul: 2.2, count: 1, spread: 0 },
      { name: 'Spear Rush', kind: 'dash', cost: 35, mul: 2.0, dist: 360 },
      { name: 'Golden Aura', kind: 'heal', cost: 45, heal: 0.1, mul: 1.5, radius: 220 },
    ] },
  { id: 'bruno', name: 'Bruno', title: 'Iron Hammer', role: 'Brawler', hp: 140, atk: 16, def: 6, speed: 150, reach: 82, unlock: 5, accent: 0xff9f43,
    attack: { kind: 'melee', mul: 1.2, scale: 1.5 },
    skills: [
      { name: 'Earthshatter', kind: 'aoe', cost: 30, mul: 2.4, radius: 260, shake: true, fx: 'burst' },
      { name: 'Stone Charge', kind: 'dash', cost: 35, mul: 2.4, dist: 240 },
      { name: 'Iron Skin', kind: 'heal', cost: 45, heal: 0.3, mul: 0.5, radius: 120 },
    ] },
  { id: 'sylvie', name: 'Sylvie', title: 'Forest Ranger', role: 'Archer', hp: 92, atk: 12, def: 3, speed: 200, reach: 58, unlock: 6, accent: 0xc77dff,
    attack: { kind: 'bolt', mul: 0.8, count: 1 },
    skills: [
      { name: 'Storm Volley', kind: 'bolt', cost: 30, mul: 1.2, count: 5, spread: 34 },
      { name: 'Piercing Shot', kind: 'bolt', cost: 40, mul: 3.2, count: 1, spread: 0 },
      { name: 'Wind Step', kind: 'dash', cost: 50, mul: 1.4, dist: 500 },
    ] },
  { id: 'darius', name: 'Darius', title: 'Dark Knight', role: 'Lifesteal tank', hp: 135, atk: 15, def: 6, speed: 160, reach: 90, unlock: 7, accent: 0x9aa0ff,
    attack: { kind: 'melee', mul: 1.0, scale: 1.4, lifesteal: 0.08 },
    skills: [
      { name: 'Abyss Rend', kind: 'aoe', cost: 30, mul: 2.3, radius: 280, fx: 'burst' },
      { name: 'Soul Drain', kind: 'heal', cost: 45, heal: 0.15, mul: 1.5, radius: 200 },
      { name: 'Dark Dash', kind: 'dash', cost: 35, mul: 2.0, dist: 300 },
    ] },
  { id: 'elian', name: 'Elian', title: 'Holy Cleric', role: 'Support healer', hp: 110, atk: 11, def: 4, speed: 165, reach: 72, unlock: 8, accent: 0xfff3a0,
    attack: { kind: 'melee', mul: 1.0, scale: 1.2, lifesteal: 0.05 },
    skills: [
      { name: 'Sanctified Light', kind: 'heal', cost: 30, heal: 0.15, mul: 1.8, radius: 240 },
      { name: 'Judgment', kind: 'bolt', cost: 40, mul: 2.8, count: 1, spread: 0 },
      { name: 'Blessing', kind: 'heal', cost: 50, heal: 0.3, mul: 0, radius: 0 },
    ] },
  { id: 'riven', name: 'Riven', title: 'Twin Blades', role: 'Combo specialist', hp: 105, atk: 15, def: 4, speed: 215, reach: 74, unlock: 9, accent: 0xff3b6b,
    attack: { kind: 'melee', mul: 0.8, hits: 2, scale: 1.2 },
    skills: [
      { name: 'Crimson Storm', kind: 'aoe', cost: 30, mul: 2.0, radius: 200, fx: 'slash' },
      { name: 'Blade Dance', kind: 'dash', cost: 35, mul: 2.1, dist: 340 },
      { name: 'Phantom Cut', kind: 'bolt', cost: 45, mul: 0.9, count: 3, spread: 30 },
    ] },
];

/** Heroes with the primary skill exposed as skill/skillName (used by the menu and progress code). */
export const HEROES = HEROES_RAW.map((h) => ({
  ...h,
  skill: h.skills[0].kind === 'bolt' ? 'bolt' : 'burst',
  skillName: h.skills[0].name,
}));

// Enemy definitions. spread = how far apart specials are used; proj = ranged projectile for special.
export const ENEMIES = {
  zombie: { name: 'Zombie', hp: 40, atk: 8, speed: 45, range: 70, cd: 1.6, aggro: 520, xp: 8, coins: 6 },
  skeleton: { name: 'Skeleton', hp: 45, atk: 10, speed: 70, range: 74, cd: 1.3, aggro: 560, xp: 10, coins: 7 },
  goblin: { name: 'Goblin', hp: 30, atk: 7, speed: 110, range: 60, cd: 0.9, aggro: 600, xp: 7, coins: 6 },
  wolf: { name: 'Wolf', hp: 38, atk: 9, speed: 150, range: 66, cd: 1.0, aggro: 680, xp: 9, coins: 6 },
  bandit: { name: 'Bandit', hp: 55, atk: 12, speed: 100, range: 78, cd: 1.2, aggro: 600, xp: 12, coins: 10 },
  'dark-mage': { name: 'Dark Mage', hp: 42, atk: 9, speed: 60, range: 280, cd: 2.0, aggro: 760, xp: 14, coins: 12, special: { range: 520, cd: 3.2, dmg: 1.2, proj: true, color: 0xb070ff } },
  'ice-warrior': { name: 'Ice Warrior', hp: 70, atk: 13, speed: 85, range: 84, cd: 1.3, aggro: 580, xp: 16, coins: 12 },
  'ice-golem': { name: 'Ice Golem', hp: 150, atk: 18, speed: 45, range: 100, cd: 2.0, aggro: 620, xp: 26, coins: 22, special: { range: 260, cd: 4.5, dmg: 1.4, proj: false, color: 0x9ee6ff } },
  demon: { name: 'Demon', hp: 110, atk: 16, speed: 95, range: 90, cd: 1.2, aggro: 700, xp: 22, coins: 18, special: { range: 480, cd: 3.8, dmg: 1.3, proj: true, color: 0xff5a3c } },
  'shadow-assassin': { name: 'Shadow Assassin', hp: 80, atk: 17, speed: 190, range: 70, cd: 0.9, aggro: 720, xp: 24, coins: 18, special: { range: 300, cd: 3.4, dmg: 1.6, proj: false, color: 0x6b5a9a } },
  'poison-creature': { name: 'Poisonous Creature', hp: 75, atk: 11, speed: 70, range: 80, cd: 1.4, aggro: 600, xp: 18, coins: 14, special: { range: 420, cd: 3.0, dmg: 1.0, proj: true, color: 0x8cff3c } },
  'elite-undead': { name: 'Elite Undead', hp: 180, atk: 22, speed: 80, range: 96, cd: 1.5, aggro: 640, xp: 36, coins: 30, special: { range: 240, cd: 4.2, dmg: 1.8, proj: false, color: 0x9fb0c8 } },
  'corrupted-warrior': { name: 'Corrupted Warrior', hp: 130, atk: 19, speed: 105, range: 92, cd: 1.1, aggro: 660, xp: 28, coins: 24 },
  'sea-serpent': { name: 'Sea Serpent', hp: 140, atk: 20, speed: 95, range: 100, cd: 1.4, aggro: 680, xp: 30, coins: 26, special: { range: 460, cd: 3.6, dmg: 1.3, proj: true, color: 0x3cc8ff } },
  'sand-scorpion': { name: 'Sand Scorpion', hp: 120, atk: 18, speed: 115, range: 92, cd: 1.2, aggro: 640, xp: 26, coins: 22, special: { range: 380, cd: 3.4, dmg: 1.4, proj: true, color: 0xffb040 } },
  'celestial-sentinel': { name: 'Celestial Sentinel', hp: 200, atk: 24, speed: 100, range: 100, cd: 1.3, aggro: 700, xp: 44, coins: 36, special: { range: 500, cd: 3.6, dmg: 1.5, proj: true, color: 0xfff0a0 } },
};

// Boss definitions (phases at 66% and 33% HP). Attacks: basic, heavy, special (projectile burst), aoe (shockwave).
export const BOSSES = {
  'undead-warlord': { name: 'Undead Warlord', title: 'Lord of the Ashen Dead', hp: 400, atk: 12, speed: 70, aggro: 2000 },
  'ancient-forest-guardian': { name: 'Ancient Forest Guardian', title: 'Keeper of Roots', hp: 480, atk: 14, speed: 60, aggro: 2000 },
  'frost-dragon': { name: 'Frost Dragon', title: 'Wyrm of Eternal Winter', hp: 560, atk: 16, speed: 85, aggro: 2000 },
  'demon-king': { name: 'Demon King', title: 'Tyrant of the Gate', hp: 640, atk: 18, speed: 90, aggro: 2000 },
  'shadow-overlord': { name: 'Shadow Overlord', title: 'Eater of Light', hp: 720, atk: 20, speed: 110, aggro: 2000 },
  'sand-tyrant': { name: 'Sand Tyrant', title: 'Sovereign of the Dunes', hp: 800, atk: 22, speed: 95, aggro: 2000 },
  'kraken-lord': { name: 'Kraken Lord', title: 'Horror of the Deep', hp: 880, atk: 24, speed: 80, aggro: 2000 },
  'elder-dragon': { name: 'Elder Dragon', title: 'The Last Flame', hp: 960, atk: 26, speed: 100, aggro: 2000 },
  'nightmare-emperor': { name: 'Nightmare Emperor', title: 'Sovereign of Dreams', hp: 1040, atk: 28, speed: 115, aggro: 2000 },
  'celestial-overlord': { name: 'Celestial Overlord', title: 'Fallen Star of Heaven', hp: 1120, atk: 30, speed: 120, aggro: 2000 },
};

export const CHAPTERS = [
  { n: 1, name: 'Ashen Graveyard', intro: 'The dead rise beneath a dying moon.', enemies: ['zombie', 'skeleton', 'goblin'], boss: 'undead-warlord', tint: 0x9aa58a },
  { n: 2, name: 'Whispering Ancient Forest', intro: 'Roots remember every trespasser.', enemies: ['wolf', 'goblin', 'poison-creature'], boss: 'ancient-forest-guardian', tint: 0x6fb070 },
  { n: 3, name: 'Frozen Kingdom', intro: 'Entering the Frozen Kingdom.', enemies: ['ice-warrior', 'ice-golem', 'wolf'], boss: 'frost-dragon', tint: 0x8fd0ff },
  { n: 4, name: 'Gate of Demons', intro: 'Brimstone rains from a cracked sky.', enemies: ['demon', 'dark-mage', 'bandit'], boss: 'demon-king', tint: 0xff7a5a },
  { n: 5, name: 'Shadow Keep', intro: 'Here, even your own shadow is hunting.', enemies: ['shadow-assassin', 'dark-mage', 'skeleton'], boss: 'shadow-overlord', tint: 0x8a7ab0 },
  { n: 6, name: 'Scorched Sand Wastes', intro: 'Bones bleach under a merciless sun.', enemies: ['sand-scorpion', 'bandit', 'zombie'], boss: 'sand-tyrant', tint: 0xe8b060 },
  { n: 7, name: 'Sunken Sea', intro: 'The tide hides something vast.', enemies: ['sea-serpent', 'poison-creature', 'goblin'], boss: 'kraken-lord', tint: 0x5ab0d8 },
  { n: 8, name: "Dragon's Peak", intro: 'Where the last flame still burns.', enemies: ['corrupted-warrior', 'demon', 'elite-undead'], boss: 'elder-dragon', tint: 0xff9060 },
  { n: 9, name: 'Nightmare Realm', intro: 'Sleep is a door you should not open.', enemies: ['elite-undead', 'shadow-assassin', 'corrupted-warrior'], boss: 'nightmare-emperor', tint: 0xb070c0 },
  { n: 10, name: 'Celestial Spire', intro: 'Ascend, and face the fallen light.', enemies: ['celestial-sentinel', 'elite-undead', 'corrupted-warrior'], boss: 'celestial-overlord', tint: 0xf0e0a0 },
];

export const TIPS = [
  'Dodge with L just before an enemy strikes to avoid all damage.',
  'Chain attacks with J for a three-hit combo finisher.',
  'Hold Shift to run. Running is faster but leaves you exposed.',
  'Skills (K) cost energy. Basic attacks restore a little of it.',
  'Potions (H) restore a large chunk of HP. Use them wisely.',
  'Bosses change phase at 66% and 33% health. Watch for the warning flash.',
  'Spend coins on upgrades between levels to grow your hero.',
  'Shockwaves from bosses cannot hit you while you are airborne.',
];

/** Flat list of all 50 levels. */
export function buildLevels() {
  const levels = [];
  for (const ch of CHAPTERS) {
    for (let l = 1; l <= LEVELS_PER_CHAPTER; l++) {
      const index = (ch.n - 1) * LEVELS_PER_CHAPTER + l; // 1..50
      const isBoss = l === LEVELS_PER_CHAPTER;
      const diff = 1 + 0.22 * (ch.n - 1) + 0.07 * (l - 1);
      levels.push({
        index,
        chapter: ch.n,
        levelInChapter: l,
        isBoss,
        title: isBoss ? `${ch.name} — ${BOSSES[ch.boss].name}` : `${ch.name} — Stage ${l}`,
        enemyCount: isBoss ? 0 : 3 + Math.floor((l + ch.n) / 3),
        enemyTypes: ch.enemies,
        boss: isBoss ? ch.boss : null,
        diff,
        reward: { coins: 40 + 12 * ch.n + 8 * l, xp: 60 + 15 * ch.n + 10 * l },
      });
    }
  }
  return levels;
}
export const LEVELS = buildLevels();

export const XP_FOR_LEVEL = (lvl) => Math.floor(50 * Math.pow(lvl, 1.6));
export const MAX_HERO_LEVEL = 30;
export const UPGRADE_CAP = 25;
export const upgradeCost = (current) => 60 + current * 45;

const RARITY_MULT = { common: 1, rare: 1.6, epic: 2.4 };
/** Random equipment drop scaled by level. */
export function rollEquipment(levelIndex, rng = Math.random) {
  const slot = rng() < 0.5 ? 'weapon' : 'armor';
  const roll = rng();
  const rarity = roll > 0.93 ? 'epic' : roll > 0.7 ? 'rare' : 'common';
  const base = 2 + Math.floor(levelIndex / 6);
  const bonus = Math.round(base * RARITY_MULT[rarity]);
  const names = slot === 'weapon'
    ? { common: 'Iron Blade', rare: 'Runed Blade', epic: 'Dawnbreaker' }
    : { common: 'Chain Vest', rare: 'Runed Mail', epic: 'Aegis of Dawn' };
  return { id: `${slot}-${Date.now().toString(36)}-${Math.floor(rng() * 1e6).toString(36)}`, slot, rarity, bonus, name: names[rarity] };
}

// Frame geometry for each sprite kind — must match tools/sprite-manifest.mjs.
export const SPRITE_SIZES = {
  hero: { fw: 160, fh: 160, cols: 8, rows: 10 },
  enemy: { fw: 144, fh: 144, cols: 8, rows: 6 },
  boss: { fw: 256, fh: 256, cols: 8, rows: 9 },
};
export const spritePath = (kind, id) => `/assets/sprites/${kind === 'hero' ? 'heroes' : kind === 'enemy' ? 'enemies' : 'bosses'}/${id}/sheet.png`;
export const metaPath = (kind, id) => `/assets/sprites/${kind === 'hero' ? 'heroes' : kind === 'enemy' ? 'enemies' : 'bosses'}/${id}/sheet.json`;
