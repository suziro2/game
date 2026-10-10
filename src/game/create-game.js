// Phaser game bootstrap. Scenes: Idle (no-op autostart), Load (per-level asset loading), Battle.
import Phaser from 'phaser';
import { LoadScene } from './LoadScene.js';
import { BattleScene } from './BattleScene.js';

class IdleScene extends Phaser.Scene {
  constructor() { super('Idle'); }
}

export function createGame() {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game-root',
    width: 1280,
    height: 720,
    backgroundColor: '#05060d',
    banner: false,
    audio: { noAudio: true },
    render: { antialias: true, roundPixels: false },
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    scene: [IdleScene, LoadScene, BattleScene],
  });
}
