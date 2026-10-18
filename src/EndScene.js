// ============================================================
// EndScene.js — End of week summary screen
// ============================================================

import { GameState, NPCS, SHELF_DEFS, ITEM_DEFS } from './GameData.js';

const PAL = {
  bg:    0x0d0820,
  panel: 0x1a0d35,
  border:0x6b3fa0,
  gold:  '#ffd080',
  text:  '#f9e4b7',
  sub:   '#c9b8e8',
  dim:   '#7a6e9a',
};

export class EndScene extends Phaser.Scene {
  constructor() { super('EndScene'); }

  create() {
    const W = this.scale.width;
    const H = this.scale.height;

    // Background gradient
    const bg = this.add.graphics();
    bg.fillGradientStyle(0x0d0820, 0x0d0820, 0x1a1035, 0x0d0820, 1);
    bg.fillRect(0, 0, W, H);

    // Stars
    const sg = this.add.graphics();
    for (let i = 0; i < 60; i++) {
      sg.fillStyle(0xffffff, Math.random() * 0.6 + 0.1);
      sg.fillCircle(Phaser.Math.Between(0, W), Phaser.Math.Between(0, H * 0.4), Math.random() * 1.5 + 0.5);
    }

    // Title
    this.add.text(W / 2, 38, 'WEEK COMPLETE', {
      fontFamily: '"Press Start 2P", monospace',
      fontSize: '18px',
      color: PAL.gold,
      stroke: '#3d2060',
      strokeThickness: 4,
    }).setOrigin(0.5);

    this.add.text(W / 2, 68, 'Here\'s how your week shaped up:', {
      fontFamily: '"Nunito", sans-serif',
      fontSize: '14px',
      color: PAL.sub,
    }).setOrigin(0.5);

    // NPC Affinity Cards
    const npcs = Object.entries(GameState.npcs);
    const cardW = 140;
    const cardSpacing = 10;
    const totalW = npcs.length * cardW + (npcs.length - 1) * cardSpacing;
    let cx = (W - totalW) / 2;
    const cardY = 95;

    for (const [key, npc] of npcs) {
      this._drawAffinityCard(cx, cardY, cardW, npc);
      cx += cardW + cardSpacing;
    }

    // Divider
    const dg = this.add.graphics();
    dg.lineStyle(1, 0x3d2b5e, 0.6);
    dg.beginPath();
    dg.moveTo(40, 310);
    dg.lineTo(W - 40, 310);
    dg.strokePath();

    // Summary text
    this._drawSummary(W, H);

    // Play again button
    const btn = this.add.rectangle(W / 2, H - 55, 220, 44, 0x6b3fa0)
      .setInteractive({ useHandCursor: true })
      .on('pointerover', () => btn.setFillStyle(0x9b5fd0))
      .on('pointerout',  () => btn.setFillStyle(0x6b3fa0))
      .on('pointerdown', () => this._restart());

    this.add.text(W / 2, H - 55, '↺  PLAY AGAIN', {
      fontFamily: '"Press Start 2P", monospace',
      fontSize: '10px',
      color: PAL.text,
    }).setOrigin(0.5);

    // Entrance animation
    this.cameras.main.setAlpha(0);
    this.tweens.add({
      targets: this.cameras.main,
      alpha: 1,
      duration: 1200,
      ease: 'Sine.easeIn',
    });
  }

  _drawAffinityCard(x, y, w, npc) {
    const h = 200;
    const bg = this.add.graphics();
    bg.fillStyle(PAL.panel);
    bg.fillRoundedRect(x, y, w, h, 8);
    bg.lineStyle(2, npc.color, 0.7);
    bg.strokeRoundedRect(x, y, w, h, 8);

    // Portrait circle
    const pg = this.add.graphics();
    pg.fillStyle(npc.color, 0.8);
    pg.fillCircle(x + w / 2, y + 38, 28);
    // face
    pg.fillStyle(0x000000, 0.3);
    pg.fillCircle(x + w / 2 - 9, y + 32, 5);
    pg.fillCircle(x + w / 2 + 9, y + 32, 5);
    pg.lineStyle(2, 0x000000, 0.3);
    pg.beginPath();
    pg.arc(x + w / 2, y + 40, 12, 0.3, Math.PI - 0.3, false);
    pg.strokePath();

    // Name
    this.add.text(x + w / 2, y + 72, npc.name, {
      fontFamily: '"Press Start 2P", monospace',
      fontSize: '7px',
      color: PAL.text,
    }).setOrigin(0.5);

    this.add.text(x + w / 2, y + 86, npc.role, {
      fontFamily: '"Nunito", sans-serif',
      fontSize: '11px',
      color: PAL.sub,
    }).setOrigin(0.5);

    // Affinity bar
    const barX = x + 10;
    const barY = y + 104;
    const barW = w - 20;
    const pct  = Math.min(npc.affinity / 100, 1);

    const abg = this.add.graphics();
    abg.fillStyle(0x12082a);
    abg.fillRect(barX, barY, barW, 10);
    abg.fillStyle(npc.color, 0.9);
    abg.fillRect(barX, barY, barW * pct, 10);

    this.add.text(x + w / 2, barY + 16, `${npc.affinity} / 100`, {
      fontFamily: '"Nunito", sans-serif',
      fontSize: '10px',
      color: PAL.dim,
    }).setOrigin(0.5);

    // Unlocked threshold
    const unlocked = [...npc.thresholds].reverse().find(t => npc.affinity >= t.at);
    if (unlocked) {
      this.add.text(x + w / 2, barY + 34, `✓ Lv.${unlocked.level}`, {
        fontFamily: '"Press Start 2P", monospace',
        fontSize: '7px',
        color: '#80ff80',
      }).setOrigin(0.5);
      this.add.text(x + w / 2, barY + 50, unlocked.unlock, {
        fontFamily: '"Nunito", sans-serif',
        fontSize: '10px',
        color: '#c0ffc0',
        wordWrap: { width: w - 14 },
        align: 'center',
      }).setOrigin(0.5);
    } else {
      this.add.text(x + w / 2, barY + 34, 'No bond yet', {
        fontFamily: '"Nunito", sans-serif',
        fontSize: '10px',
        color: PAL.dim,
      }).setOrigin(0.5);
    }
  }

  _drawSummary(W, H) {
    const lines = [
      'You carried things with you.',
      'Some were useful. Some were gifts.',
      'Some just made someone\'s day a little better.',
      '',
      'Next week: try different things.',
    ];

    let ty = 322;
    for (const line of lines) {
      this.add.text(W / 2, ty, line, {
        fontFamily: '"Nunito", sans-serif',
        fontSize: line === '' ? 6 : 14,
        color: line.startsWith('You') || line.startsWith('Next') ? PAL.text : PAL.sub,
        fontStyle: line.startsWith('You') || line.startsWith('Next') ? 'bold' : 'normal',
      }).setOrigin(0.5);
      ty += line === '' ? 6 : 22;
    }

    // Item count
    const totalItems = GameState.bagItems.length +
      Object.values(GameState.shelves).reduce((acc, s) => acc + s.items.length, 0);

    this.add.text(W / 2, ty + 10,
      `Items placed this session: ${totalItems}`, {
        fontFamily: '"Nunito", sans-serif',
        fontSize: '12px',
        color: PAL.dim,
      }
    ).setOrigin(0.5);
  }

  _restart() {
    // Reset game state
    GameState.currentDay   = 0;
    GameState.phase        = 'title';
    GameState.npcs         = JSON.parse(JSON.stringify(NPCS));
    GameState.bagGrid      = Array(5 * 7).fill(null);
    GameState.bagItems     = [];
    GameState.shelves      = Object.fromEntries(
      SHELF_DEFS.map(s => [s.id, { items: [], grid: Array(s.cols * s.rows).fill(null) }])
    );
    GameState.pendingItems  = [];
    GameState.floatingItems = [];
    GameState.log           = [];
    this.scene.start('TitleScene');
  }
}
