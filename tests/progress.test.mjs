// Unit tests for progression rules (XP, upgrades, unlocks, equipment) — pure logic, no browser needed.
import assert from 'node:assert/strict';
import { newProgress, heroStats, addXp, buyUpgrade, refreshUnlocks, isLevelUnlocked, equipItem } from '../src/progress.js';
import { LEVELS, rollEquipment, XP_FOR_LEVEL } from '../src/data/game-data.js';

const p = newProgress();
// Level structure: boss every 5th level
assert.equal(LEVELS.length, 50);
assert.equal(LEVELS.filter((l) => l.isBoss).length, 10);
assert.ok(LEVELS.every((l) => l.isBoss === (l.index % 5 === 0)));
assert.ok(LEVELS.filter((l) => !l.isBoss).every((l) => l.enemyCount >= 3));

// Stats grow with level and upgrades; equipment adds bonuses
const base = heroStats(p, 'aiden');
assert.equal(base.maxHp, 120);
addXp(p, 'aiden', XP_FOR_LEVEL(1));
assert.equal(p.heroes.aiden.level, 2);
assert.ok(heroStats(p, 'aiden').maxHp > base.maxHp);

// Multi-level XP
const lv = addXp(p, 'aiden', 100000);
assert.ok(lv > 1 && p.heroes.aiden.level <= 30);

// Upgrades cost coins and cap
p.coins = 10;
assert.equal(buyUpgrade(p, 'aiden', 'atk').ok, false);
p.coins = 1000;
assert.equal(buyUpgrade(p, 'aiden', 'atk').ok, true);
assert.equal(p.heroes.aiden.upgrades.atk, 1);
assert.ok(p.coins < 1000);

// Unlocks: each hero unlocks after completing its chapter (5 levels per chapter)
refreshUnlocks(p);
assert.deepEqual(p.unlockedHeroes, ['aiden']);
p.highestLevelCleared = 5;
refreshUnlocks(p);
assert.ok(p.unlockedHeroes.includes('luna'));
assert.ok(!p.unlockedHeroes.includes('ronan'));

// Level gating
assert.equal(isLevelUnlocked(p, 6), true);
assert.equal(isLevelUnlocked(p, 7), false);

// Equipment equip/unequip toggles and boosts stats
const item = rollEquipment(12, () => 0.2); // weapon, common
assert.equal(item.slot, 'weapon');
p.equipment.push(item);
const before = heroStats(p, 'aiden').atk;
equipItem(p, item);
assert.equal(heroStats(p, 'aiden').atk, before + item.bonus);
equipItem(p, item);
assert.equal(p.equipped.weapon, null);

console.log('ok   progression rules (levels, XP, upgrades, unlocks, gating, equipment)');
console.log('Progress tests passed.');
