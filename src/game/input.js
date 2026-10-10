// Shared input state. Touch buttons (DOM) feed this module; keyboard is read by BattleScene.
export const touch = { left: false, right: false, run: false, jump: false, attack: false, skill: false, dodge: false, potion: false };
const pending = { jump: false, attack: false, skill: false, dodge: false, potion: false };

export function touchPress(key) {
  touch[key] = true;
  if (key in pending) pending[key] = true;
}
export function touchRelease(key) { touch[key] = false; }
/** Returns true once per press for edge-triggered actions. */
export function consumeTouch(key) {
  const v = pending[key];
  pending[key] = false;
  return v;
}
export function resetTouch() {
  for (const k of Object.keys(touch)) touch[k] = false;
  for (const k of Object.keys(pending)) pending[k] = false;
}
