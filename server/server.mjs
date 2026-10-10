#!/usr/bin/env node
/**
 * Ashen Vow server (no external dependencies).
 *  - Serves the built game from dist/ (or the dev-friendly public/ folder when dist is absent).
 *  - Account registration (scrypt password hashing) and cookie sessions.
 *  - Secure session recovery: an HttpOnly, SameSite=Lax session cookie (30-day sliding
 *    expiry, server stores only a SHA-256 hash of the token). Returning players are restored
 *    silently via GET /api/session — there is intentionally no separate Login page.
 *  - Per-account progress save/load with server-side validation.
 */
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist'); // produced by `npm run build`
const DATA_FILE = process.env.ASHEN_DATA || path.join(__dirname, 'data', 'store.json');
const PORT = Number(process.env.PORT || 8080);
const HOST = '0.0.0.0';
const SESSION_MS = 30 * 24 * 60 * 60 * 1000;
const SESSION_COOKIE = 'ashen_sid';
const HERO_IDS = ['aiden', 'luna', 'ronan', 'mira', 'kael', 'bruno', 'sylvie', 'darius', 'elian', 'riven'];
const TOTAL_LEVELS = 50;

/* ---------- persistence ---------- */
fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
let store = { users: {}, sessions: {} };
if (fs.existsSync(DATA_FILE)) {
  try { store = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); } catch { /* corrupt -> start fresh, keep backup */ fs.copyFileSync(DATA_FILE, DATA_FILE + '.bak'); }
}
let saveTimer = null;
function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const tmp = DATA_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(store));
    fs.renameSync(tmp, DATA_FILE); // atomic replace
  }, 150);
}

/* ---------- helpers ---------- */
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const hashPassword = (pw) => new Promise((res, rej) => {
  const salt = crypto.randomBytes(16);
  crypto.scrypt(pw, salt, 64, { N: 16384, r: 8, p: 1 }, (e, key) => (e ? rej(e) : res(`scrypt$${salt.toString('base64')}$${key.toString('base64')}`)));
});
/** Checks a password against a stored "scrypt$salt$key" hash in constant time. */
const verifyPassword = (pw, stored) => new Promise((res) => {
  const [scheme, saltB64, keyB64] = String(stored || '').split('$');
  if (scheme !== 'scrypt' || !saltB64 || !keyB64) return res(false);
  const expected = Buffer.from(keyB64, 'base64');
  crypto.scrypt(pw, Buffer.from(saltB64, 'base64'), expected.length, { N: 16384, r: 8, p: 1 }, (e, key) =>
    res(!e && key.length === expected.length && crypto.timingSafeEqual(key, expected)));
});
function json(res, status, body, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(JSON.stringify(body));
}
function readBody(req, limit = 64 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > limit) { reject(Object.assign(new Error('too large'), { status: 413 })); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); } catch { reject(Object.assign(new Error('bad json'), { status: 400 })); } });
    req.on('error', reject);
  });
}
function parseCookies(req) {
  const out = {};
  (req.headers.cookie || '').split(';').forEach((p) => { const i = p.indexOf('='); if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim()); });
  return out;
}
function setSessionCookie(req, res, token) {
  const secure = req.headers['x-forwarded-proto'] === 'https' || (req.socket.encrypted === true);
  const parts = [`${SESSION_COOKIE}=${encodeURIComponent(token)}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${SESSION_MS / 1000}`];
  if (secure) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}
function clearSessionCookie(res) { res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`); }

/** Issues a new session token and stores only its hash. */
function createSession(userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  store.sessions[sha256(token)] = { userId, expires: Date.now() + SESSION_MS };
  persist();
  return token;
}
/** Returns the user for a valid session, sliding its expiry and rotating the token. */
function resolveSession(req, res) {
  const token = parseCookies(req)[SESSION_COOKIE];
  if (!token) return null;
  const key = sha256(token);
  const s = store.sessions[key];
  if (!s || s.expires < Date.now() || !store.users[s.userId]) {
    delete store.sessions[key]; persist(); clearSessionCookie(res); return null;
  }
  delete store.sessions[key]; // rotate on every restore to limit replay of stolen tokens
  const fresh = createSession(s.userId);
  setSessionCookie(req, res, fresh);
  return store.users[s.userId];
}

/** Server-authoritative default profile. */
function newProgress() {
  return {
    version: 1,
    selectedHero: 'aiden',
    unlockedHeroes: ['aiden'],
    highestLevelCleared: 0, // 0..50; level index = clearedCount (next playable level is clearedCount+1)
    coins: 0,
    potions: 3,
    heroes: {},  // id -> { level, xp, upgrades: { hp, atk, def } }
    equipment: [], // inventory items
    equipped: { weapon: null, armor: null },
    settings: { sound: true },
  };
}
function sanitizeProgress(p) {
  const base = newProgress();
  if (!p || typeof p !== 'object') return base;
  const num = (v, max, d = 0) => (Number.isFinite(v) ? Math.max(0, Math.min(max, Math.floor(v))) : d);
  base.selectedHero = HERO_IDS.includes(p.selectedHero) ? p.selectedHero : 'aiden';
  base.unlockedHeroes = Array.isArray(p.unlockedHeroes) ? p.unlockedHeroes.filter((h) => HERO_IDS.includes(h)) : ['aiden'];
  if (!base.unlockedHeroes.includes('aiden')) base.unlockedHeroes.unshift('aiden');
  base.highestLevelCleared = num(p.highestLevelCleared, TOTAL_LEVELS);
  base.coins = num(p.coins, 10_000_000);
  base.potions = num(p.potions, 99, 3);
  base.heroes = {};
  if (p.heroes && typeof p.heroes === 'object') {
    for (const id of HERO_IDS) {
      const h = p.heroes[id];
      if (!h) continue;
      base.heroes[id] = {
        level: num(h.level, 99, 1) || 1,
        xp: num(h.xp, 10_000_000),
        upgrades: { hp: num(h.upgrades?.hp, 50), atk: num(h.upgrades?.atk, 50), def: num(h.upgrades?.def, 50) },
      };
    }
  }
  base.equipment = Array.isArray(p.equipment) ? p.equipment.slice(0, 200).map((it) => ({
    id: String(it.id || '').slice(0, 40), name: String(it.name || '').slice(0, 40), slot: it.slot === 'armor' ? 'armor' : 'weapon',
    bonus: num(it.bonus, 500, 1), rarity: ['common', 'rare', 'epic'].includes(it.rarity) ? it.rarity : 'common',
  })) : [];
  const eq = (slot) => base.equipment.find((it) => it.id === p.equipped?.[slot]?.id) || null;
  base.equipped = { weapon: eq('weapon'), armor: eq('armor') };
  return base;
}

/* ---------- rate limit for registrations ---------- */
const regHits = new Map();
function rateLimited(ip) {
  const now = Date.now(); const arr = (regHits.get(ip) || []).filter((t) => now - t < 3600_000);
  arr.push(now); regHits.set(ip, arr); return arr.length > 10;
}

/* ---------- rate limit for failed logins ---------- */
const loginFails = new Map();
function loginBlocked(ip) {
  const now = Date.now(); const arr = (loginFails.get(ip) || []).filter((t) => now - t < 900_000);
  loginFails.set(ip, arr); return arr.length >= 10;
}
function recordLoginFail(ip) { loginFails.set(ip, [...(loginFails.get(ip) || []), Date.now()]); }

/* ---------- API ---------- */
async function api(req, res, url) {
  // Same-origin check for state-changing requests (defence in depth on top of SameSite=Lax).
  if (req.method !== 'GET') {
    const origin = req.headers.origin;
    if (origin && new URL(origin).host !== req.headers.host) return json(res, 403, { error: 'Cross-origin request blocked.' });
    if (req.headers['x-requested-with'] !== 'ashen-vow') return json(res, 403, { error: 'Missing request header.' });
  }

  if (url.pathname === '/api/session' && req.method === 'GET') {
    const user = resolveSession(req, res);
    if (!user) return json(res, 200, { authenticated: false });
    return json(res, 200, { authenticated: true, user: { id: user.id, username: user.username }, progress: sanitizeProgress(user.progress) });
  }

  if (url.pathname === '/api/account' && req.method === 'POST') {
    const ip = req.socket.remoteAddress;
    if (rateLimited(ip)) return json(res, 429, { error: 'Too many accounts created recently. Please wait and try again.' });
    const body = await readBody(req).catch((e) => ({ __err: e }));
    if (body.__err) return json(res, body.__err.status || 400, { error: 'Invalid request.' });
    const username = String(body.username || '').trim();
    const password = String(body.password || '');
    if (!/^[A-Za-z0-9_]{3,16}$/.test(username)) return json(res, 400, { error: 'Username must be 3-16 letters, numbers or underscores.' });
    if (password.length < 8 || password.length > 200) return json(res, 400, { error: 'Password must be 8 to 200 characters.' });
    if (Object.values(store.users).some((u) => u.username.toLowerCase() === username.toLowerCase())) return json(res, 409, { error: 'That username is already taken.' });
    const id = crypto.randomUUID();
    store.users[id] = { id, username, passwordHash: await hashPassword(password), created: Date.now(), progress: newProgress() };
    const token = createSession(id);
    setSessionCookie(req, res, token);
    persist();
    return json(res, 201, { user: { id, username }, progress: sanitizeProgress(store.users[id].progress) });
  }

  if (url.pathname === '/api/login' && req.method === 'POST') {
    const ip = req.socket.remoteAddress;
    if (loginBlocked(ip)) return json(res, 429, { error: 'Too many failed attempts. Please wait 15 minutes and try again.' });
    const body = await readBody(req).catch((e) => ({ __err: e }));
    if (body.__err) return json(res, body.__err.status || 400, { error: 'Invalid request.' });
    const username = String(body.username || '').trim();
    const password = String(body.password || '');
    const user = Object.values(store.users).find((u) => u.username.toLowerCase() === username.toLowerCase());
    // Always run one hash check so timing does not reveal whether the username exists.
    const ok = await verifyPassword(password.slice(0, 200), user ? user.passwordHash : 'scrypt$AAAAAAAAAAAAAAAAAAAAAA==$AAAA');
    if (!user || !ok || password.length < 1) { recordLoginFail(ip); return json(res, 401, { error: 'Wrong username or password.' }); }
    loginFails.delete(ip);
    const token = createSession(user.id);
    setSessionCookie(req, res, token);
    return json(res, 200, { user: { id: user.id, username: user.username }, progress: sanitizeProgress(user.progress) });
  }

  if (url.pathname === '/api/save' && req.method === 'PUT') {
    const user = resolveSession(req, res);
    if (!user) return json(res, 401, { error: 'Your session has expired. Please create a new account or reload.' });
    const body = await readBody(req, 256 * 1024).catch((e) => ({ __err: e }));
    if (body.__err) return json(res, body.__err.status || 400, { error: 'Save data rejected.' });
    user.progress = sanitizeProgress(body.progress ?? body);
    persist();
    return json(res, 200, { saved: true, progress: user.progress });
  }

  if (url.pathname === '/api/logout' && req.method === 'POST') {
    const token = parseCookies(req)[SESSION_COOKIE];
    if (token) { delete store.sessions[sha256(token)]; persist(); }
    clearSessionCookie(res);
    return json(res, 200, { ok: true });
  }

  return json(res, 404, { error: 'Not found' });
}

/* ---------- static ---------- */
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json', '.svg': 'image/svg+xml', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.woff2': 'font/woff2', '.ico': 'image/x-icon' };
function serveStatic(req, res, url) {
  let rel = decodeURIComponent(url.pathname);
  if (rel === '/') rel = '/index.html';
  const file = path.normalize(path.join(DIST, rel));
  if (!file.startsWith(DIST)) { res.writeHead(403); return res.end(); }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404); return res.end('Not found'); }
    const cache = rel.startsWith('/assets/') ? 'public, max-age=86400' : 'no-cache';
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Content-Length': st.size, 'Cache-Control': cache, 'X-Content-Type-Options': 'nosniff' });
    fs.createReadStream(file).pipe(res);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname.startsWith('/api/')) return await api(req, res, url);
    return serveStatic(req, res, url);
  } catch (e) {
    console.error(e);
    if (!res.headersSent) json(res, 500, { error: 'Server error. Please try again.' });
  }
});
server.listen(PORT, HOST, () => console.log(`Ashen Vow listening on http://${HOST}:${PORT} (serving ${path.relative(ROOT, DIST)}/)`));
