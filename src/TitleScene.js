// ============================================================
// TitleScene.js — Opening title screen
// ============================================================

import { GameState } from './GameData.js';
import { addText } from './uiText.js';

export class TitleScene extends Phaser.Scene {
  constructor() { super('TitleScene'); }

  create() {
    const W = this.scale.width;
    const H = this.scale.height;

    // Gradient background
    const bg = this.add.graphics();
    bg.fillGradientStyle(0x1a0a2e, 0x1a0a2e, 0x2d1b4e, 0x16213e, 1);
    bg.fillRect(0, 0, W, H);

    // Twinkling stars (simple circles)
    const starG = this.add.graphics();
    for (let i = 0; i < 80; i++) {
      const x = Phaser.Math.Between(0, W);
      const y = Phaser.Math.Between(0, H * 0.7);
      const r = Math.random() * 1.5 + 0.5;
      starG.fillStyle(0xffffff, Math.random() * 0.7 + 0.3);
      starG.fillCircle(x, y, r);
    }

    // Pixel dorm window illustration (left)
    this._drawDormWindow(W * 0.18, H * 0.45);

    // Title text
    addText(this, W * 0.5, H * 0.22, 'CARRY IT WITH YOU', {
      fontFamily: '"Press Start 2P", monospace',
      fontSize: '22px',
      color: '#f9e4b7',
      align: 'center',
      wordWrap: { width: W * 0.7 },
      stroke: '#6b3fa0',
      strokeThickness: 4,
    }).setOrigin(0.5);

    addText(this, W * 0.5, H * 0.34, 'a cozy university life game', {
      fontFamily: '"Nunito", sans-serif',
      fontSize: '15px',
      color: '#c9b8e8',
      align: 'center',
    }).setOrigin(0.5);

    // Day counter preview
    addText(this, W * 0.5, H * 0.43, '7 DAYS · SORT YOUR BAG · FIND YOUR PEOPLE', {
      fontFamily: '"Nunito", sans-serif',
      fontSize: '11px',
      color: '#8878aa',
      align: 'center',
      letterSpacing: 2,
    }).setOrigin(0.5);

    // Start button
    const btn = this.add.rectangle(W * 0.5, H * 0.58, 220, 52, 0x6b3fa0)
      .setInteractive({ useHandCursor: true })
      .on('pointerover', () => { btn.setFillStyle(0x9b5fd0); pulse.setColor('#fffbe8'); })
      .on('pointerout',  () => { btn.setFillStyle(0x6b3fa0); pulse.setColor('#f9e4b7'); })
      .on('pointerdown', () => this._startGame());

    const pulse = addText(this, W * 0.5, H * 0.58, '▶  START WEEK', {
      fontFamily: '"Press Start 2P", monospace',
      fontSize: '11px',
      color: '#f9e4b7',
    }).setOrigin(0.5);

    // Pulsing animation on the button text
    this.tweens.add({
      targets: pulse,
      alpha: 0.5,
      yoyo: true,
      repeat: -1,
      duration: 900,
    });

    // How to play hint
    addText(this, W * 0.5, H * 0.72,
      'Each morning, pack your bag.\nWhat you carry shapes your day.',
      {
        fontFamily: '"Nunito", sans-serif',
        fontSize: '13px',
        color: '#7a6e9a',
        align: 'center',
      }
    ).setOrigin(0.5);

    // Credits
    addText(this, W * 0.5, H * 0.93, 'made with Phaser 3  ·  prototype build', {
      fontFamily: '"Nunito", sans-serif',
      fontSize: '10px',
      color: '#4a3d6a',
    }).setOrigin(0.5);

    // Floating pixel art items (decorative)
    this._spawnFloatingItems();
  }

  _drawDormWindow(cx, cy) {
    const g = this.add.graphics();
    // window frame
    g.fillStyle(0x3d2b5e);
    g.fillRect(cx - 50, cy - 65, 100, 90);
    // window pane (2x2 grid)
    g.fillStyle(0x8ecae6, 0.35);
    g.fillRect(cx - 46, cy - 61, 44, 40);
    g.fillRect(cx + 2,  cy - 61, 44, 40);
    g.fillRect(cx - 46, cy - 18, 44, 33);
    g.fillRect(cx + 2,  cy - 18, 44, 33);
    // cross bar
    g.fillStyle(0x3d2b5e);
    g.fillRect(cx - 4, cy - 63, 8, 92);
    g.fillRect(cx - 48, cy - 21, 96, 6);
    // warm glow inside
    g.fillStyle(0xffd98a, 0.12);
    g.fillRect(cx - 46, cy - 61, 92, 74);
    // little plant on sill
    g.fillStyle(0x4a7c59);
    g.fillRect(cx - 10, cy + 18, 20, 6);
    g.fillRect(cx - 4, cy + 10, 8, 10);
    g.fillCircle(cx, cy + 6, 9);
    g.fillCircle(cx - 8, cy + 10, 7);
    g.fillCircle(cx + 8, cy + 10, 7);
    // windowsill
    g.fillStyle(0x5c4080);
    g.fillRect(cx - 54, cy + 24, 108, 8);
  }

  _spawnFloatingItems() {
    const W = this.scale.width;
    const H = this.scale.height;
    const colors = [0xf6d860, 0x7ec8e3, 0xe07b54, 0x80ff80, 0xd4a96a, 0xff9aaf];
    for (let i = 0; i < 8; i++) {
      const x = Phaser.Math.Between(W * 0.65, W * 0.95);
      const y = Phaser.Math.Between(H * 0.15, H * 0.85);
      const g = this.add.graphics();
      const c = colors[i % colors.length];
      g.fillStyle(c, 0.18);
      g.fillRect(-12, -12, 24, 24);
      g.setPosition(x, y);
      this.tweens.add({
        targets: g,
        y: y - 12,
        yoyo: true,
        repeat: -1,
        duration: 2000 + i * 300,
        ease: 'Sine.easeInOut',
      });
    }
  }

  _startGame() {
    GameState.phase = 'inventory';
    GameState.currentDay = 0;
    // Seed player with starting items on their shelf
    // (these get placed into floating items, player must pack the bag)
    GameState.floatingItems = [
      { instanceId: 'fi_1', itemKey: 'pencil' },
      { instanceId: 'fi_2', itemKey: 'notebook' },
      { instanceId: 'fi_3', itemKey: 'textbook' },
      { instanceId: 'fi_4', itemKey: 'bento' },
      { instanceId: 'fi_5', itemKey: 'water_bottle' },
      { instanceId: 'fi_6', itemKey: 'keys' },
      { instanceId: 'fi_7', itemKey: 'phone' },
      { instanceId: 'fi_8', itemKey: 'umbrella' },
    ];
    this.scene.start('InventoryScene');
  }
}
