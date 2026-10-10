// Visual/animation manifest used by tools/build-sprites.mjs.
// Each entry produces ONE individual sprite sheet (never combined with other characters).
// `anims` order == row order in the sheet. `frames` <= 8 (columns). `active` = frame indices
// where the hit/skill/AoE is live (drives damage timing in the game).

const HERO_ANIMS = [
  { name: 'idle', frames: 6, fps: 6, loop: true },
  { name: 'walk', frames: 8, fps: 10, loop: true },
  { name: 'run', frames: 8, fps: 14, loop: true },
  { name: 'attack', frames: 6, fps: 14, active: [2, 3] },
  { name: 'combo', frames: 8, fps: 14, active: [2, 3, 6] },
  { name: 'skill', frames: 8, fps: 12, active: [3, 4] },
  { name: 'hit', frames: 4, fps: 12 },
  { name: 'dodge', frames: 5, fps: 16 },
  { name: 'defeat', frames: 8, fps: 8 },
  { name: 'victory', frames: 8, fps: 8 },
];

const ENEMY_ANIMS = (special) => [
  { name: 'idle', frames: 6, fps: 6, loop: true },
  { name: 'walk', frames: 8, fps: 10, loop: true },
  { name: 'attack', frames: 6, fps: 10, active: [2, 3] },
  ...(special ? [{ name: 'special', frames: 8, fps: 10, active: [3, 4] }] : []),
  { name: 'hit', frames: 4, fps: 12 },
  { name: 'death', frames: 8, fps: 8 },
];

const BOSS_ANIMS = [
  { name: 'idle', frames: 6, fps: 6, loop: true },
  { name: 'move', frames: 8, fps: 8, loop: true },
  { name: 'basic', frames: 6, fps: 10, active: [2, 3] },
  { name: 'heavy', frames: 8, fps: 8, active: [4, 5] },
  { name: 'special', frames: 8, fps: 9, active: [3, 4, 5] },
  { name: 'aoe', frames: 8, fps: 9, active: [4, 5] },
  { name: 'hit', frames: 4, fps: 12 },
  { name: 'phase', frames: 6, fps: 8 },
  { name: 'defeat', frames: 8, fps: 7 },
];

export const HEROES = [
  { id: 'aiden', name: 'Aiden', accent: '#7fd3ff', color: '#7fd3ff' },
  { id: 'luna', name: 'Luna', accent: '#b79cff', color: '#b79cff' },
  { id: 'ronan', name: 'Ronan', accent: '#ff6a4e', color: '#ff6a4e' },
  { id: 'mira', name: 'Mira', accent: '#6dffb0', color: '#6dffb0' },
  { id: 'kael', name: 'Kael', accent: '#ffd54f', color: '#ffd54f' },
  { id: 'bruno', name: 'Bruno', accent: '#ff9f43', color: '#ff9f43' },
  { id: 'sylvie', name: 'Sylvie', accent: '#c77dff', color: '#c77dff' },
  { id: 'darius', name: 'Darius', accent: '#9aa0ff', color: '#9aa0ff' },
  { id: 'elian', name: 'Elian', accent: '#fff3a0', color: '#fff3a0' },
  { id: 'riven', name: 'Riven', accent: '#ff3b6b', color: '#ff3b6b' },
];

export const ENEMIES = [
  { id: 'zombie', name: 'Zombie', color: '#6b8e4e', special: false },
  { id: 'skeleton', name: 'Skeleton', color: '#d9d4c0', special: false },
  { id: 'goblin', name: 'Goblin', color: '#5ea84a', special: false },
  { id: 'wolf', name: 'Wolf', color: '#6d6f7a', special: false },
  { id: 'bandit', name: 'Bandit', color: '#8a6a4a', special: false },
  { id: 'dark-mage', name: 'Dark Mage', color: '#7a4cc2', special: true },
  { id: 'ice-warrior', name: 'Ice Warrior', color: '#7fd6ff', special: false },
  { id: 'ice-golem', name: 'Ice Golem', color: '#9ee6ff', special: true },
  { id: 'demon', name: 'Demon', color: '#b3262b', special: true },
  { id: 'shadow-assassin', name: 'Shadow Assassin', color: '#2b2140', special: true },
  { id: 'poison-creature', name: 'Poisonous Creature', color: '#7ac943', special: true },
  { id: 'elite-undead', name: 'Elite Undead', color: '#5b6470', special: true },
  { id: 'corrupted-warrior', name: 'Corrupted Warrior', color: '#6b2f5a', special: false },
  { id: 'sea-serpent', name: 'Sea Serpent', color: '#2a7fa3', special: true },
  { id: 'sand-scorpion', name: 'Sand Scorpion', color: '#c8962e', special: true },
  { id: 'celestial-sentinel', name: 'Celestial Sentinel', color: '#fff0b0', special: true },
];

export const BOSSES = [
  { id: 'undead-warlord', name: 'Undead Warlord', color: '#4d6b3a' },
  { id: 'ancient-forest-guardian', name: 'Ancient Forest Guardian', color: '#3f7a3a' },
  { id: 'frost-dragon', name: 'Frost Dragon', color: '#6ec6ff' },
  { id: 'demon-king', name: 'Demon King', color: '#9c1f2a' },
  { id: 'shadow-overlord', name: 'Shadow Overlord', color: '#261a3d' },
  { id: 'sand-tyrant', name: 'Sand Tyrant', color: '#d19a3c' },
  { id: 'kraken-lord', name: 'Kraken Lord', color: '#1f5c7a' },
  { id: 'elder-dragon', name: 'Elder Dragon', color: '#b8502a' },
  { id: 'nightmare-emperor', name: 'Nightmare Emperor', color: '#55205f' },
  { id: 'celestial-overlord', name: 'Celestial Overlord', color: '#e8d78a' },
];

export const SPRITE_MANIFEST = [
  ...HEROES.map((h) => ({ kind: 'hero', frameSize: 160, anims: HERO_ANIMS, ...h })),
  ...ENEMIES.map((e) => ({ kind: 'enemy', frameSize: 144, anims: ENEMY_ANIMS(e.special), accent: e.color, ...e })),
  ...BOSSES.map((b) => ({ kind: 'boss', frameSize: 256, anims: BOSS_ANIMS, accent: b.color, ...b })),
];
