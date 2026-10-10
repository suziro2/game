// Application entry: loading screen → session restore or Create Account → menu → levels.
import './style.css';
import Phaser from 'phaser';
import { api } from './api.js';
import { loader, preloadImages, randomTip } from './ui/loader.js';
import * as ui from './ui/screens.js';
import { newProgress, heroStats, addXp, refreshUnlocks, isLevelUnlocked } from './progress.js';
import { LEVELS, CHAPTERS } from './data/game-data.js';
import { createGame } from './game/create-game.js';
import { touch, touchPress, touchRelease, resetTouch } from './game/input.js';

const $ = (id) => document.getElementById(id);
let state = { user: null, progress: null };
let game = null;
let saveTimer = null;

/* ---------- Saving ---------- */
function setStatus(msg) { $('menu-status').textContent = msg; }
function queueSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 300);
}
let saveInFlight = false;
let saveAgain = false;
/** Saves run one at a time; a save requested meanwhile runs right after the current one finishes. */
async function saveNow() {
  if (saveInFlight) { saveAgain = true; return; }
  saveInFlight = true;
  try {
    const r = await api.save(state.progress);
    state.progress = r.progress;
    setStatus('Progress saved.');
  } catch (e) {
    if (e.status === 401) { setStatus('Your session expired. Please create a new account.'); ui.showAuth(authHandlers); return; }
    setStatus(`Save failed (${e.message}). Retrying…`);
    saveTimer = setTimeout(saveNow, 5000);
  } finally {
    saveInFlight = false;
    if (saveAgain) { saveAgain = false; saveNow(); }
  }
}

/** Menu changes → re-render + save. */
function onMenuChange() {
  refreshUnlocks(state.progress);
  ui.renderMenu();
  queueSave();
}
function showMenu() {
  ui.initMenu({ getState: () => state, onPlay: (i) => playLevel(i), onChange: onMenuChange, onLogout });
  ui.renderMenu();
  ui.showScreen('screen-menu');
}

async function onLogout() {
  try { await api.logout(); } catch { /* ignore: cookie is cleared locally anyway */ }
  location.reload();
}

/* ---------- Boot ---------- */
async function boot() {
  loader.show({ subtitle: 'Awakening the realm…', message: 'Loading essential artwork…' });
  try {
    if (!game) game = createGame();
    await preloadImages(['/assets/ui/loading-hero.png', '/assets/environment/arena-bg.png'], (v) => loader.setProgress(v * 0.8, 'Loading essential artwork…'));
    loader.setProgress(0.85, 'Checking for a saved session…');
    const s = await api.session();
    if (s.authenticated) {
      state = { user: s.user, progress: s.progress };
      loader.setProgress(0.95, 'Restoring your adventure…');
      loader.setProgress(1, `Welcome back, ${s.user.username}`);
      await loader.hide();
      showMenu();
    } else {
      loader.setProgress(1, 'Ready');
      await loader.hide();
      ui.showAuth(authHandlers);
    }
  } catch (e) {
    loader.showError(e.message, boot);
  }
}

const authHandlers = { onCreate: onCreateAccount, onLogin: onLogin };

async function onLogin(username, password) {
  loader.show({ subtitle: 'Welcome back', message: 'Opening your adventure…', tip: randomTip() });
  try {
    const r = await api.login(username, password);
    loader.setProgress(0.6, 'Restoring your profile…');
    state = { user: r.user, progress: r.progress || newProgress() };
    loader.setProgress(1, `Welcome back, ${r.user.username}`);
    await loader.hide();
    showMenu();
  } catch (e) {
    await loader.hide();
    throw e;
  }
}

async function onCreateAccount(username, password) {
  loader.show({ subtitle: 'Creating your account', message: 'Creating your hero…', tip: randomTip() });
  try {
    const r = await api.createAccount(username, password);
    loader.setProgress(0.6, 'Initializing your profile…');
    state = { user: r.user, progress: r.progress || newProgress() };
    loader.setProgress(1, 'Your adventure begins');
    await loader.hide();
    showMenu();
  } catch (e) {
    await loader.hide();
    throw e;
  }
}

/* ---------- Levels ---------- */
/** Loads the level's assets through Phaser. Resolves true on success, false if the player backs out. */
function loadLevel(level, heroId) {
  return new Promise((resolve) => {
    const attempt = () => {
      game.scene.start('Load', {
        level,
        heroId,
        onDone: (failed) => {
          if (!failed.length) return resolve(true);
          loader.showError(`Some assets could not be loaded (${failed.slice(0, 3).join(', ')}). Check your connection and retry.`, attempt, () => resolve(false));
        },
      });
    };
    attempt();
  });
}

function runBattle(cfg) {
  return new Promise((resolve) => {
    game.scene.start('Battle', { ...cfg, onEnd: (res) => { game.scene.stop('Battle'); resolve(res); } });
  });
}

const coarse = () => window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;

async function playLevel(index) {
  const p = state.progress;
  if (!isLevelUnlocked(p, index)) return;
  const level = LEVELS[index - 1];
  const ch = CHAPTERS[level.chapter - 1];
  const heroId = p.selectedHero;
  const stats = heroStats(p, heroId);

  ui.showScreen(null);
  loader.show({
    subtitle: level.isBoss ? `Boss Encounter · ${ch.name}` : `Chapter ${ch.n} · ${ch.name}`,
    tip: level.levelInChapter === 1 ? `${ch.intro}` : randomTip(),
    message: 'Preparing your hero and level…',
  });
  const ok = await loadLevel(level, heroId);
  if (!ok) { await loader.hide(); showMenu(); return; }

  $('game-root').classList.remove('off');
  game.scale.refresh();
  if (level.isBoss) {
    await loader.hide();
    await ui.showBossIntro(level.boss);
  } else {
    await loader.hide();
  }
  $('touch-controls').hidden = !coarse();
  resetTouch();
  const res = await runBattle({ level, heroId, stats, potions: p.potions });
  $('game-root').classList.add('off');
  $('touch-controls').hidden = true;
  resetTouch();
  applyResult(index, level, heroId, res);
}

function applyResult(index, level, heroId, res) {
  const p = state.progress;
  if (res.quit) { showMenu(); return; }
  p.potions = res.potionsLeft;
  const firstClear = index > p.highestLevelCleared;
  if (res.won) {
    const share = firstClear ? 1 : 0.3; // replays pay less to keep progression meaningful
    p.coins += Math.round((res.coins + level.reward.coins) * share);
    const gained = addXp(p, heroId, Math.round((res.xp + level.reward.xp) * share));
    if (res.dropped) p.equipment.push(res.dropped);
    if (firstClear) p.highestLevelCleared = index;
    const before = new Set(p.unlockedHeroes);
    refreshUnlocks(p);
    const newHeroes = p.unlockedHeroes.filter((h) => !before.has(h));
    const parts = [`+${Math.round((res.coins + level.reward.coins) * share)} coins`, `+${Math.round((res.xp + level.reward.xp) * share)} XP`];
    if (gained) parts.push(`Level up! (+${gained})`);
    if (res.dropped) parts.push(`Found ${res.dropped.name} (+${res.dropped.bonus} ${res.dropped.slot === 'weapon' ? 'ATK' : 'DEF'})`);
    if (newHeroes.length) parts.push(`Unlocked: ${newHeroes.map((h) => h.charAt(0).toUpperCase() + h.slice(1)).join(', ')}!`);
    if (level.isBoss) parts.unshift(`${ch(level)} cleared.`);
    queueSave();
    ui.showResult({
      title: level.isBoss ? 'Boss Defeated!' : 'Victory!',
      text: parts.join(' · '),
      nextLabel: index < LEVELS.length ? 'Next Stage' : null,
      onNext: () => playLevel(index + 1),
      onMap: () => showMenu(),
    });
  } else {
    queueSave();
    ui.showResult({
      title: 'Defeated',
      text: 'Your hero has fallen. Heal up, upgrade, and try the stage again.',
      nextLabel: 'Retry Stage',
      onNext: () => playLevel(index),
      onMap: () => showMenu(),
    });
  }
  ui.renderMenu();
}
const ch = (level) => CHAPTERS[level.chapter - 1].name;

/* ---------- Touch controls & keyboard ---------- */
document.querySelectorAll('#touch-controls [data-key]').forEach((btn) => {
  const key = btn.dataset.key;
  if (key === 'run') {
    btn.addEventListener('click', () => { touch.run = !touch.run; btn.classList.toggle('on', touch.run); });
    return;
  }
  btn.addEventListener('pointerdown', (e) => { e.preventDefault(); touchPress(key); });
  for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) btn.addEventListener(ev, () => touchRelease(key));
});
// Stop arrow keys/space from scrolling the page while playing.
window.addEventListener('keydown', (e) => {
  if (!$('game-root').classList.contains('off') && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
});

// Debug hook for automated browser tests (read-only access to the running Phaser game).
window.__ashen = { get game() { return game; }, get state() { return state; } };

boot();
