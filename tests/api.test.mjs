// Starts the real server on a temporary port and exercises account creation, session restore,
// cookie attributes, save/load, CSRF header enforcement, and logout.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = 18000 + Math.floor(Math.random() * 1000);
const data = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ashen-test-')), 'store.json');
const base = `http://127.0.0.1:${port}`;
const H = { 'X-Requested-With': 'ashen-vow', 'Content-Type': 'application/json' };

const srv = spawn('node', ['server/server.mjs'], { cwd: ROOT, env: { ...process.env, PORT: String(port), ASHEN_DATA: data }, stdio: ['ignore', 'pipe', 'pipe'] });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function ready() { for (let i = 0; i < 50; i++) { try { await fetch(base + '/api/session'); return; } catch { await wait(100); } } throw new Error('server did not start'); }
const cookieOf = (res) => (res.headers.get('set-cookie') || '').split(';')[0];

try {
  await ready();
  // 1. no session yet
  let r = await fetch(base + '/api/session');
  assert.equal((await r.json()).authenticated, false);

  // 2. CSRF header required for state changes
  r = await fetch(base + '/api/account', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'hero_one', password: 'correct horse' }) });
  assert.equal(r.status, 403, 'missing header must be rejected');

  // 3. validation
  r = await fetch(base + '/api/account', { method: 'POST', headers: H, body: JSON.stringify({ username: 'x', password: 'short' }) });
  assert.equal(r.status, 400);

  // 4. create account
  r = await fetch(base + '/api/account', { method: 'POST', headers: H, body: JSON.stringify({ username: 'hero_one', password: 'correct horse' }) });
  assert.equal(r.status, 201);
  const created = await r.json();
  assert.equal(created.user.username, 'hero_one');
  assert.equal(created.progress.selectedHero, 'aiden');
  const setCookie = r.headers.get('set-cookie');
  assert.match(setCookie, /HttpOnly/);
  assert.match(setCookie, /SameSite=Lax/);
  const sid = cookieOf(r);

  // 5. duplicate name rejected (case-insensitive)
  r = await fetch(base + '/api/account', { method: 'POST', headers: H, body: JSON.stringify({ username: 'HERO_ONE', password: 'another pass' }) });
  assert.equal(r.status, 409);

  // 6. session restore via cookie
  r = await fetch(base + '/api/session', { headers: { Cookie: sid } });
  const restored = await r.json();
  assert.equal(restored.authenticated, true);
  assert.equal(restored.user.username, 'hero_one');
  const rotated = cookieOf(r);
  assert.notEqual(rotated, sid, 'session token must rotate on restore');

  // 7. old token is no longer valid after rotation
  r = await fetch(base + '/api/session', { headers: { Cookie: sid } });
  assert.equal((await r.json()).authenticated, false);

  // 8. save progress (sanitized server-side)
  const progress = { ...restored.progress, coins: 500, highestLevelCleared: 5, potions: 7, coinsHack: 1, selectedHero: 'luna', unlockedHeroes: ['aiden', 'luna', 'bogus'] };
  r = await fetch(base + '/api/save', { method: 'PUT', headers: { ...H, Cookie: rotated }, body: JSON.stringify({ progress }) });
  assert.equal(r.status, 200);
  const afterSave = cookieOf(r); // save also rotates the session token
  const saved = (await r.json()).progress;
  assert.equal(saved.coins, 500);
  assert.equal(saved.selectedHero, 'luna');
  assert.deepEqual(saved.unlockedHeroes, ['aiden', 'luna']);
  assert.equal(saved.coinsHack, undefined, 'unknown fields are dropped');

  // 9. save without a session is refused
  r = await fetch(base + '/api/save', { method: 'PUT', headers: H, body: JSON.stringify({ progress }) });
  assert.equal(r.status, 401);

  // 10. progress survives a restart (persisted to disk)
  await wait(400);
  srv.kill();
  await wait(300);
  const srv2 = spawn('node', ['server/server.mjs'], { cwd: ROOT, env: { ...process.env, PORT: String(port), ASHEN_DATA: data }, stdio: 'ignore' });
  await ready();
  r = await fetch(base + '/api/session', { headers: { Cookie: afterSave } });
  const again = await r.json();
  assert.equal(again.authenticated, true);
  assert.equal(again.progress.coins, 500);
  assert.equal(again.progress.selectedHero, 'luna');
  // 11. logout ends the session
  r = await fetch(base + '/api/logout', { method: 'POST', headers: H });
  assert.equal(r.status, 200);
  srv2.kill();
  console.log('ok   account creation, validation, CSRF, session rotation, save/load, persistence, logout');
  console.log('API tests passed.');
  process.exit(0);
} catch (e) {
  console.error('API test failed:', e);
  srv.kill();
  process.exit(1);
}
