// Per-level loading scene. Reports completion (and failed files) back to the caller.
import Phaser from 'phaser';
import { loadLevelAssets } from './assets.js';

export class LoadScene extends Phaser.Scene {
  constructor() { super('Load'); }
  init(data) { this.req = data; }
  create() {
    const { level, heroId, onDone } = this.req;
    loadLevelAssets(this, { level, heroId }).then(({ failed }) => onDone(failed));
  }
}
