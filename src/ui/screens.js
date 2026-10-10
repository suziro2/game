// DOM screens: Create Account, main menu (heroes / map / upgrades / inventory), results, boss intro.
import { HEROES, CHAPTERS, LEVELS, BOSSES, SPRITE_SIZES, spritePath, UPGRADE_CAP, upgradeCost } from '../data/game-data.js';
import { heroStats, heroState, heroDef, isHeroUnlocked, isLevelUnlocked, buyUpgrade, equipItem, chaptersCompleted, newProgress } from '../progress.js';
import { XP_FOR_LEVEL, MAX_HERO_LEVEL } from '../data/game-data.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const screens = ['screen-auth', 'screen-menu', 'screen-result', 'screen-boss'];

/** Shows only one screen; fades the previous one out. */
export function showScreen(id) {
  for (const s of screens) {
    const el = $(s);
    if (s === id) { el.hidden = false; el.classList.remove('fade-out'); }
    else if (!el.hidden) { el.classList.add('fade-out'); setTimeout(() => { if (s !== id) { el.hidden = true; el.classList.remove('fade-out'); } }, 450); }
  }
}

/** Sets a div to show frame 0 (idle pose) of a hero/boss sprite sheet, scaled to `size` px. */
export function portrait(el, kind, id, size) {
  const { fw, fh, cols, rows } = SPRITE_SIZES[kind];
  const s = size / fw;
  el.style.width = `${size}px`;
  el.style.height = `${size}px`;
  el.style.backgroundImage = `url(${spritePath(kind, id)})`;
  el.style.backgroundSize = `${cols * fw * s}px ${rows * fh * s}px`;
  el.style.backgroundPosition = '0 0';
  el.classList.add('portrait');
}

/* ---------- Log in / Create Account (one screen, two modes) ---------- */
/** Shows the auth screen. `handlers` = { onCreate(u, p), onLogin(u, p) }. Mode is chosen with the toggle. */
export function showAuth(handlers) {
  showScreen('screen-auth');
  const form = $('auth-form');
  const btnLogin = $('mode-login');
  const btnCreate = $('mode-create');
  const submit = $('auth-submit');
  let mode = 'create';

  const setMode = (m) => {
    mode = m;
    const login = m === 'login';
    btnLogin.classList.toggle('primary', login); btnLogin.setAttribute('aria-selected', String(login));
    btnCreate.classList.toggle('primary', !login); btnCreate.setAttribute('aria-selected', String(!login));
    $('confirm-field').hidden = login;
    $('confirm-field').querySelector('input').required = !login;
    form.querySelector('input[name=password]').autocomplete = login ? 'current-password' : 'new-password';
    submit.textContent = login ? 'Log In & Continue' : 'Create Account & Begin';
    $('auth-intro').textContent = login
      ? 'Welcome back. Enter the username and password of your existing hero.'
      : "Create your hero's account to begin your journey. Your progress is saved on the server and restored automatically on this device.";
    $('auth-error').textContent = '';
  };
  btnLogin.onclick = () => setMode('login');
  btnCreate.onclick = () => setMode('create');
  setMode('create');

  form.onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(form);
    const u = String(f.get('username') || '').trim();
    const p = String(f.get('password') || '');
    const c = String(f.get('confirm') || '');
    const err = $('auth-error');
    err.textContent = '';
    if (!/^[A-Za-z0-9_]{3,16}$/.test(u)) return (err.textContent = 'Username must be 3-16 letters, numbers or underscores.');
    if (mode === 'login') {
      if (!p) return (err.textContent = 'Enter your password.');
    } else {
      if (p.length < 8) return (err.textContent = 'Password must be at least 8 characters.');
      if (p !== c) return (err.textContent = 'Passwords do not match.');
    }
    submit.disabled = true;
    try { await (mode === 'login' ? handlers.onLogin(u, p) : handlers.onCreate(u, p)); }
    catch (ex) { err.textContent = ex.message; }
    finally { submit.disabled = false; }
  };
}

/* ---------- Main menu ---------- */
let ctx = null; // { getState, onPlay, onChange, onLogout }

export function initMenu(c) { ctx = c; $('btn-logout').onclick = () => c.onLogout(); }

export function renderMenu() {
  const { progress: p } = ctx.getState();
  $('hud-coins').textContent = p.coins;
  $('hud-potions').textContent = p.potions;
  renderHeroes(p);
  renderMap(p);
  renderDetails(p);
}

function renderHeroes(p) {
  const list = $('hero-list');
  list.innerHTML = '';
  for (const h of HEROES) {
    const unlocked = isHeroUnlocked(p, h.id);
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `hero-card${p.selectedHero === h.id ? ' selected' : ''}`;
    b.disabled = !unlocked;
    const pd = document.createElement('div');
    portrait(pd, 'hero', h.id, 64);
    pd.classList.add('portrait');
    if (!unlocked) pd.style.filter = 'grayscale(1) brightness(0.5)';
    const info = document.createElement('div');
    info.innerHTML = `<div class="name">${esc(h.name)} <span class="muted">Lv ${heroState(p, h.id).level}</span></div>
      <div class="sub">${esc(h.title)}</div>
      <div class="sub">${unlocked ? esc(h.role) : `🔒 Clear Chapter ${h.unlock} to unlock`}</div>`;
    b.append(pd, info);
    b.onclick = () => { p.selectedHero = h.id; ctx.onChange(); };
    list.appendChild(b);
  }
}

function renderMap(p) {
  const wrap = $('chapter-list');
  wrap.innerHTML = '';
  for (const ch of CHAPTERS) {
    const div = document.createElement('div');
    div.className = 'chapter';
    const done = Math.floor(p.highestLevelCleared / 5) >= ch.n;
    div.innerHTML = `<h3>Chapter ${ch.n}: ${esc(ch.name)} ${done ? '✅' : ''}</h3><p>${esc(ch.intro)}</p><div class="levels"></div>`;
    const levels = div.querySelector('.levels');
    for (const lv of LEVELS.filter((l) => l.chapter === ch.n)) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `btn small level-btn${lv.isBoss ? ' boss' : ''}${lv.index <= p.highestLevelCleared ? ' cleared' : ''}`;
      b.textContent = lv.isBoss ? '👑 Boss' : `Stage ${lv.levelInChapter}`;
      b.title = lv.title;
      b.disabled = !isLevelUnlocked(p, lv.index);
      b.onclick = () => ctx.onPlay(lv.index);
      levels.appendChild(b);
    }
    wrap.appendChild(div);
  }
  const next = LEVELS.find((l) => l.index === p.highestLevelCleared + 1);
  $('menu-status').textContent = next ? `Next: ${next.title}` : 'All 50 levels cleared — thank you for playing Ashen Vow!';
}

function renderDetails(p) {
  const h = heroDef(p.selectedHero);
  const st = heroStats(p, h.id);
  const s = heroState(p, h.id);
  $('detail-title').textContent = `${h.name} — ${h.title}`;
  const need = s.level >= MAX_HERO_LEVEL ? 1 : XP_FOR_LEVEL(s.level);
  $('hero-detail').innerHTML = `
    <div class="row"><span>Level</span><b>${st.level}</b></div>
    <div class="bar"><div style="width:${Math.min(100, (s.xp / need) * 100)}%"></div></div>
    <div class="row muted"><span>XP</span><span>${s.xp} / ${need}</span></div>
    <div class="row"><span>Max HP</span><b>${st.maxHp}</b></div>
    <div class="row"><span>Attack</span><b>${st.atk}</b></div>
    <div class="row"><span>Defense</span><b>${st.def}</b></div>
    <div class="row"><span>Skill</span><b>${esc(h.skillName)}</b></div>`;
  const up = $('upgrades');
  up.innerHTML = '';
  for (const stat of ['hp', 'atk', 'def']) {
    const cur = s.upgrades[stat];
    const row = document.createElement('div');
    row.className = 'row';
    const cost = upgradeCost(cur);
    row.innerHTML = `<span>${stat.toUpperCase()} +${cur}</span>`;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn small';
    b.disabled = cur >= UPGRADE_CAP;
    b.textContent = cur >= UPGRADE_CAP ? 'MAX' : `Upgrade (${cost} 🪙)`;
    b.onclick = () => {
      const r = buyUpgrade(p, h.id, stat);
      if (!r.ok) $('menu-status').textContent = r.reason;
      ctx.onChange();
    };
    row.appendChild(b);
    up.appendChild(row);
  }
  const inv = $('inventory');
  inv.innerHTML = `<div class="item"><span>🧪 Health potions</span><b>${p.potions}</b></div>`;
  if (!p.equipment.length) inv.insertAdjacentHTML('beforeend', '<p class="muted">No equipment yet. Defeat enemies and bosses to find gear.</p>');
  for (const it of p.equipment) {
    const eq = p.equipped[it.slot]?.id === it.id;
    const row = document.createElement('div');
    row.className = 'item';
    row.innerHTML = `<span class="rarity-${it.rarity}">${it.slot === 'weapon' ? '🗡️' : '🛡️'} ${esc(it.name)} +${it.bonus}</span>`;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn small';
    b.textContent = eq ? 'Unequip' : 'Equip';
    b.onclick = () => { equipItem(p, it); ctx.onChange(); };
    row.appendChild(b);
    inv.appendChild(row);
  }
}

/* ---------- Result overlay ---------- */
export function showResult({ title, text, nextLabel, onNext, onMap }) {
  $('result-title').textContent = title;
  $('result-text').textContent = text;
  const next = $('result-next');
  next.textContent = nextLabel;
  next.hidden = !onNext;
  next.onclick = () => { hideResult(); onNext?.(); };
  $('result-map').onclick = () => { hideResult(); onMap(); };
  $('screen-result').hidden = false;
  $('screen-result').classList.remove('fade-out');
}
export function hideResult() { $('screen-result').hidden = true; }

/* ---------- Boss introduction ---------- */
export function showBossIntro(bossId) {
  const b = BOSSES[bossId];
  portrait($('boss-portrait'), 'boss', bossId, 280);
  $('boss-name').textContent = b.name;
  $('boss-title').textContent = b.title;
  return new Promise((resolve) => {
    $('screen-boss').hidden = false;
    $('boss-start').onclick = () => { $('screen-boss').hidden = true; resolve(); };
    $('boss-start').focus();
  });
}

export { newProgress, chaptersCompleted };
