// Loading screen controller. Progress values always come from real loading events
// (Phaser loader, fetch/Image loads). The 100% label is only shown once `setProgress(1)`
// is called by code that has actually finished loading.
import { TIPS } from '../data/game-data.js';

const $ = (id) => document.getElementById(id);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let watchdog = null;

export function randomTip() { return TIPS[Math.floor(Math.random() * TIPS.length)]; }

export const loader = {
  show({ subtitle = 'Loading…', tip = randomTip(), message = 'Preparing…' } = {}) {
    const el = $('loader');
    el.classList.remove('fade-out');
    el.hidden = false;
    el.setAttribute('aria-busy', 'true');
    $('loader-subtitle').textContent = subtitle;
    $('loader-tip').textContent = tip;
    $('loader-error').hidden = true;
    const hero = $('loader-hero-img');
    if (!hero.src) hero.src = '/assets/ui/loading-hero.png';
    this.setProgress(0, message);
  },
  /** p in [0,1] from real load events. */
  setProgress(p, message) {
    const v = Math.min(1, Math.max(0, p));
    const pct = Math.floor(v * 100);
    $('loader-fill').style.width = `${v * 100}%`;
    $('loader-percent').textContent = `${pct}%`;
    $('loader').querySelector('.progress').setAttribute('aria-valuenow', String(pct));
    if (message) $('loader-message').textContent = message;
    this.kick();
  },
  setTip(tip) { $('loader-tip').textContent = tip; },
  /** Stall detector: if no progress for 20s, offer retry rather than hanging forever. */
  kick() {
    clearTimeout(watchdog);
    watchdog = setTimeout(() => {
      this.showError('Loading is taking much longer than expected. Check your connection and retry.', this._retry);
    }, 20000);
  },
  showError(message, onRetry, onBack) {
    clearTimeout(watchdog);
    this._retry = onRetry;
    $('loader-error-text').textContent = message;
    $('loader-error').hidden = false;
    $('loader-message').textContent = 'Loading failed';
    const btn = $('loader-retry');
    btn.onclick = () => { $('loader-error').hidden = true; if (onRetry) onRetry(); };
    const back = $('loader-back');
    back.hidden = !onBack;
    back.onclick = () => { $('loader-error').hidden = true; onBack?.(); };
    btn.focus();
  },
  async hide() {
    clearTimeout(watchdog);
    const el = $('loader');
    el.classList.add('fade-out');
    await wait(650);
    el.hidden = true;
    el.setAttribute('aria-busy', 'false');
    el.classList.remove('fade-out');
  },
};

/** Loads a set of <img> files with real progress. Rejects if any essential image fails. */
export function preloadImages(urls, onProgress) {
  let done = 0;
  return Promise.all(urls.map((u) => new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => { done++; onProgress?.(done / urls.length); resolve(img); };
    img.onerror = () => reject(new Error(`Missing asset: ${u}`));
    img.src = u;
  })));
}
