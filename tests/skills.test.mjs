// Skill rules: every hero has a unique basic attack and exactly 3 unique skills, all usable from the start.
import assert from 'node:assert/strict';
import { HEROES_RAW } from '../src/data/game-data.js';

assert.equal(HEROES_RAW.length, 10, 'expected 10 heroes');
const skillNames = new Set();
const attackSigs = new Set();
for (const h of HEROES_RAW) {
  assert.ok(h.attack && (h.attack.kind === 'melee' || h.attack.kind === 'bolt'), `${h.id}: attack defined`);
  assert.equal(h.skills.length, 3, `${h.id}: exactly 3 skills`);
  for (const s of h.skills) {
    assert.ok(s.name && s.kind && s.cost > 0 && s.mul >= 0, `${h.id}: skill "${s.name}" has name, kind, cost, mul`);
    assert.ok(!skillNames.has(s.name), `skill name "${s.name}" is duplicated`);
    skillNames.add(s.name);
  }
  const sig = JSON.stringify([h.attack.kind, h.attack.mul, h.attack.hits ?? 1, h.attack.scale ?? null, h.attack.lifesteal ?? 0, h.attack.count ?? 1]);
  assert.ok(!attackSigs.has(sig), `${h.id}: basic attack duplicates another hero's`);
  attackSigs.add(sig);
}
assert.equal(skillNames.size, 30, '30 distinct skills');
console.log('ok   10 heroes, 3 unique skills each, unique basic attacks');
console.log('Skill tests passed.');
