// ============================================================
// EventScene.js — Daily event: NPC dialogue + trigger check
// ============================================================

import {
  GRID, DAYS, ITEM_DEFS, GameState, addAffinity, bagHasItem, newInstanceId
} from './GameData.js';

const PAL = {
  bg:         0x0d0820,
  textBg:     0x160d30,
  textBorder: 0x6b3fa0,
  nameTag:    0x3d2060,
  npcBg:      0x1a1035,
  highlight:  0xffd080,
  affinityBar:0x9b5fd0,
};

export class EventScene extends Phaser.Scene {
  constructor() { super('EventScene'); }

  _lines     = [];
  _lineIdx   = 0;
  _typing    = false;
  _charTimer = null;
  _displayedChars = 0;
  _currentText    = '';
  _canAdvance     = false;
  _phase     = 'intro';   // 'intro' | 'trigger' | 'outro' | 'done'
  _triggerResult = null;

  create() {
    const W = this.scale.width;
    const H = this.scale.height;

    const dayData = DAYS[GameState.currentDay];
    if (!dayData) { this._goToNextDay(); return; }

    this._dayData = dayData;
    this._npc     = GameState.npcs[dayData.npc];
    this._phase   = 'intro';
    this._lineIdx = 0;
    this._lines   = [...dayData.intro];

    // ── Background ───────────────────────────────────────────
    const bg = this.add.graphics();
    bg.fillStyle(PAL.bg);
    bg.fillRect(0, 0, W, H);

    // Scene illustration (top 65%)
    this._drawScene(dayData.activity, W, H);

    // Day badge
    this._drawDayBadge(dayData.day, W);

    // NPC portrait area
    this._drawNPCArea(dayData.npc, W, H);

    // ── Dialogue box (bottom 30%) ────────────────────────────
    const dbY = Math.floor(H * 0.68);
    const dbH = H - dbY;

    const dbg = this.add.graphics();
    dbg.fillStyle(PAL.textBg, 0.97);
    dbg.fillRect(0, dbY, W, dbH);
    dbg.lineStyle(2, PAL.textBorder, 0.8);
    dbg.beginPath();
    dbg.moveTo(0, dbY);
    dbg.lineTo(W, dbY);
    dbg.strokePath();

    // Speaker name tag
    this._nameTag = this.add.text(16, dbY + 8, '', {
      fontFamily: '"Press Start 2P", monospace',
      fontSize: '9px',
      color: '#f9e4b7',
      backgroundColor: '#3d2060',
      padding: { x: 8, y: 4 },
    }).setDepth(10);

    // Main dialogue text
    this._dialogueTxt = this.add.text(16, dbY + 36, '', {
      fontFamily: '"Nunito", sans-serif',
      fontSize: '15px',
      color: '#f9e4b7',
      wordWrap: { width: W - 32 },
      lineSpacing: 4,
    }).setDepth(10);

    // Advance indicator
    this._advanceTxt = this.add.text(W - 22, H - 16, '▶', {
      fontFamily: '"Press Start 2P", monospace',
      fontSize: '8px',
      color: '#9b5fd0',
    }).setOrigin(0.5).setDepth(10).setVisible(false);

    this.tweens.add({
      targets: this._advanceTxt,
      alpha: 0.2,
      yoyo: true,
      repeat: -1,
      duration: 600,
    });

    // Input to advance
    this.input.on('pointerdown', this._onAdvance, this);
    this.input.keyboard?.on('keydown-SPACE', this._onAdvance, this);
    this.input.keyboard?.on('keydown-ENTER', this._onAdvance, this);

    // Affinity change popup container
    this._affinityPopup = this.add.container(W / 2, H * 0.62).setDepth(200).setVisible(false);
    const apBg = this.add.rectangle(0, 0, 260, 48, PAL.nameTag, 0.95);
    this._affinityTxt = this.add.text(0, 0, '', {
      fontFamily: '"Press Start 2P", monospace',
      fontSize: '8px',
      color: '#ffd080',
      align: 'center',
    }).setOrigin(0.5);
    this._affinityPopup.add([apBg, this._affinityTxt]);

    // Received item popup
    this._receivedPopup = this.add.container(W / 2, H * 0.5).setDepth(200).setVisible(false);
    const rpBg = this.add.rectangle(0, 0, 280, 60, 0x1a3d1a, 0.97);
    this._receivedTxt = this.add.text(0, 0, '', {
      fontFamily: '"Nunito", sans-serif',
      fontSize: '14px',
      color: '#80ff80',
      align: 'center',
    }).setOrigin(0.5);
    this._receivedPopup.add([rpBg, this._receivedTxt]);

    // Start typing
    this._typeLine(this._lines[0], '');
  }

  // ─────────────────────────────────────────────────────────────
  // SCENE ILLUSTRATION
  // ─────────────────────────────────────────────────────────────
  _drawScene(activity, W, H) {
    const sceneH = Math.floor(H * 0.67);
    const sg = this.add.graphics();

    if (activity === 'lecture') {
      // Lecture hall
      sg.fillGradientStyle(0x0d1a2e, 0x0d1a2e, 0x1a2a40, 0x0d1535, 1);
      sg.fillRect(0, 0, W, sceneH);
      // Chalkboard
      sg.fillStyle(0x1a3d2a);
      sg.fillRect(80, 30, W - 160, sceneH * 0.45);
      sg.lineStyle(3, 0x3d6b4a);
      sg.strokeRect(78, 28, W - 156, sceneH * 0.45 + 4);
      // Chalk lines
      sg.lineStyle(1, 0xffffff, 0.15);
      for (let i = 0; i < 5; i++) {
        sg.beginPath();
        sg.moveTo(110, 60 + i * 18);
        sg.lineTo(W - 110, 60 + i * 18);
        sg.strokePath();
      }
      // Desk rows
      sg.fillStyle(0x2a1a10);
      for (let row = 0; row < 3; row++) {
        sg.fillRect(40, sceneH * 0.55 + row * 30, W - 80, 8);
      }
      // Window (left)
      sg.fillStyle(0x8ecae6, 0.15);
      sg.fillRect(10, 20, 50, 80);
    } else if (activity === 'work') {
      // Café
      sg.fillGradientStyle(0x1a100a, 0x1a100a, 0x2d1a0d, 0x12080a, 1);
      sg.fillRect(0, 0, W, sceneH);
      // Counter
      sg.fillStyle(0x4a2d18);
      sg.fillRect(0, sceneH * 0.5, W, sceneH * 0.5);
      sg.fillStyle(0x6b4226);
      sg.fillRect(0, sceneH * 0.5, W, 10);
      // Coffee machine
      sg.fillStyle(0x303030);
      sg.fillRect(W - 120, sceneH * 0.35, 80, sceneH * 0.2);
      sg.fillStyle(0x808080);
      sg.fillRect(W - 115, sceneH * 0.38, 70, sceneH * 0.12);
      sg.fillStyle(0xd4a96a);
      sg.fillCircle(W - 80, sceneH * 0.44, 12);
      // Menu board
      sg.fillStyle(0x2a1a10);
      sg.fillRect(60, 20, 120, 90);
      sg.fillStyle(0xd4a96a, 0.3);
      for (let i = 0; i < 4; i++) {
        sg.fillRect(70, 35 + i * 18, 100, 8);
      }
      // Warm glow
      sg.fillStyle(0xffd98a, 0.06);
      sg.fillRect(0, 0, W, sceneH);
    } else if (activity === 'club') {
      // Rooftop
      sg.fillGradientStyle(0x0d1535, 0x0d1535, 0xff6b35, 0xff8c42, 1);
      sg.fillRect(0, 0, W, sceneH);
      // Clouds
      sg.fillStyle(0xff9a60, 0.4);
      sg.fillEllipse(80,  40, 100, 30);
      sg.fillEllipse(220, 25, 140, 35);
      sg.fillEllipse(W - 100, 50, 120, 30);
      // Railing
      sg.fillStyle(0x3d3d3d);
      sg.fillRect(0, sceneH * 0.72, W, 8);
      for (let rx = 20; rx < W; rx += 30) {
        sg.fillRect(rx, sceneH * 0.55, 4, sceneH * 0.17 + 8);
      }
      // Plant pots
      sg.fillStyle(0x4a7c59);
      sg.fillCircle(30,  sceneH * 0.62, 16);
      sg.fillCircle(W - 30, sceneH * 0.62, 16);
      sg.fillStyle(0x8b4513);
      sg.fillRect(18,  sceneH * 0.65, 24, 16);
      sg.fillRect(W - 42, sceneH * 0.65, 24, 16);
    } else if (activity === 'study') {
      // Library
      sg.fillGradientStyle(0x0a1020, 0x0a1020, 0x12182e, 0x080c18, 1);
      sg.fillRect(0, 0, W, sceneH);
      // Bookshelves (back)
      sg.fillStyle(0x2a1a10);
      sg.fillRect(0, 0, 60, sceneH);
      sg.fillRect(W - 60, 0, 60, sceneH);
      const bookColors = [0xe07b54, 0x7ec8e3, 0xf6d860, 0x9b5fd0, 0x80ff80, 0xff9aaf];
      for (let bx = 0; bx < 2; bx++) {
        const bBase = bx === 0 ? 5 : W - 55;
        for (let r = 0; r < 6; r++) {
          for (let b = 0; b < 6; b++) {
            sg.fillStyle(bookColors[(b + r) % bookColors.length], 0.8);
            sg.fillRect(bBase + b * 8, r * 30 + 10, 6, 22);
          }
        }
      }
      // Lamps (warm)
      sg.fillStyle(0xffd98a, 0.08);
      sg.fillEllipse(W / 2, sceneH * 0.4, W * 0.5, sceneH * 0.5);
      // Study table
      sg.fillStyle(0x2a1a10);
      sg.fillRect(W * 0.15, sceneH * 0.55, W * 0.7, 10);
      sg.fillRect(W * 0.15, sceneH * 0.55, 8, sceneH * 0.45);
      sg.fillRect(W * 0.85 - 8, sceneH * 0.55, 8, sceneH * 0.45);
    } else {
      // Hallway / random
      sg.fillGradientStyle(0x181030, 0x181030, 0x201840, 0x100820, 1);
      sg.fillRect(0, 0, W, sceneH);
      // Corridor
      sg.fillStyle(0x2a1a40, 0.6);
      sg.fillRect(W * 0.3, 0, W * 0.4, sceneH);
      // Doors
      for (let di = 0; di < 3; di++) {
        sg.fillStyle(0x2d1a3e);
        sg.fillRect(W * 0.05 + di * (W * 0.35), sceneH * 0.2, 50, sceneH * 0.6);
        sg.fillStyle(0x6b4226, 0.5);
        sg.fillRect(W * 0.05 + di * (W * 0.35) + 2, sceneH * 0.22, 46, sceneH * 0.57);
        sg.fillStyle(0xd4af37);
        sg.fillCircle(W * 0.05 + di * (W * 0.35) + 40, sceneH * 0.5, 4);
      }
      // Noticeboard
      sg.fillStyle(0x4a2d18);
      sg.fillRect(W * 0.65, sceneH * 0.1, W * 0.28, sceneH * 0.35);
      sg.fillStyle(0xffd98a, 0.2);
      sg.fillRect(W * 0.67, sceneH * 0.12, 60, 30);
      sg.fillRect(W * 0.67, sceneH * 0.12 + 38, 80, 20);
    }

    // Vignette overlay
    const vg = this.add.graphics();
    vg.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0, 0, 0.7, 0);
    vg.fillRect(0, sceneH * 0.4, W, sceneH * 0.6);
  }

  // ─────────────────────────────────────────────────────────────
  // DAY BADGE
  // ─────────────────────────────────────────────────────────────
  _drawDayBadge(dayNum, W) {
    const bg = this.add.rectangle(W - 80, 20, 120, 34, PAL.nameTag, 0.9).setDepth(5);
    this.add.text(W - 80, 20, `DAY ${dayNum} / 7`, {
      fontFamily: '"Press Start 2P", monospace',
      fontSize: '8px',
      color: '#f9e4b7',
    }).setOrigin(0.5).setDepth(6);
  }

  // ─────────────────────────────────────────────────────────────
  // NPC PORTRAIT
  // ─────────────────────────────────────────────────────────────
  _drawNPCArea(npcKey, W, H) {
    const npc = GameState.npcs[npcKey];
    if (!npc) return;

    const px = 30;
    const py = Math.floor(H * 0.3);
    const pr = 45;

    // Glow
    const gg = this.add.graphics().setDepth(4);
    gg.fillStyle(npc.color, 0.18);
    gg.fillCircle(px + pr, py + pr, pr + 16);

    // Portrait circle
    const pg2 = this.add.graphics().setDepth(5);
    pg2.fillStyle(npc.color, 0.85);
    pg2.fillCircle(px + pr, py + pr, pr);

    // Pixel face (very simple)
    pg2.fillStyle(0x000000, 0.3);
    pg2.fillCircle(px + pr - 14, py + pr - 8, 6); // L eye
    pg2.fillCircle(px + pr + 14, py + pr - 8, 6); // R eye
    pg2.fillStyle(0xffffff, 0.5);
    pg2.fillCircle(px + pr - 14, py + pr - 10, 3);
    pg2.fillCircle(px + pr + 14, py + pr - 10, 3);
    // smile
    pg2.lineStyle(3, 0x000000, 0.4);
    pg2.beginPath();
    pg2.arc(px + pr, py + pr + 2, 18, 0.2, Math.PI - 0.2, false);
    pg2.strokePath();

    // Name + role
    this.add.text(px + pr * 2 + 10, py + pr - 12, npc.name, {
      fontFamily: '"Press Start 2P", monospace',
      fontSize: '10px',
      color: '#f9e4b7',
    }).setDepth(5);
    this.add.text(px + pr * 2 + 10, py + pr + 6, npc.role, {
      fontFamily: '"Nunito", sans-serif',
      fontSize: '12px',
      color: '#c9b8e8',
    }).setDepth(5);

    // Affinity bar
    const barX = px + pr * 2 + 10;
    const barY = py + pr + 24;
    const barW = 120;
    const barH = 8;
    const pct  = npc.affinity / 100;

    const abg = this.add.graphics().setDepth(5);
    abg.fillStyle(0x2d1b4e);
    abg.fillRect(barX, barY, barW, barH);
    abg.fillStyle(npc.color, 0.9);
    abg.fillRect(barX, barY, barW * pct, barH);

    this.add.text(barX, barY + 11, `Affinity: ${npc.affinity}`, {
      fontFamily: '"Nunito", sans-serif',
      fontSize: '10px',
      color: '#7a6e9a',
    }).setDepth(5);
  }

  // ─────────────────────────────────────────────────────────────
  // TYPEWRITER DIALOGUE
  // ─────────────────────────────────────────────────────────────
  _typeLine(text, speaker = '') {
    this._currentText    = text;
    this._displayedChars = 0;
    this._typing         = true;
    this._canAdvance     = false;
    this._advanceTxt?.setVisible(false);

    if (speaker) {
      this._nameTag.setText(speaker);
    } else {
      this._nameTag.setText('');
    }
    this._dialogueTxt.setText('');

    if (this._charTimer) this._charTimer.remove();
    this._charTimer = this.time.addEvent({
      delay: 28,
      callback: () => {
        this._displayedChars++;
        this._dialogueTxt.setText(text.substring(0, this._displayedChars));
        if (this._displayedChars >= text.length) {
          this._typing = false;
          this._canAdvance = true;
          this._advanceTxt?.setVisible(true);
          if (this._charTimer) { this._charTimer.remove(); this._charTimer = null; }
        }
      },
      repeat: text.length - 1,
    });
  }

  _onAdvance() {
    // If still typing, skip to end
    if (this._typing) {
      if (this._charTimer) { this._charTimer.remove(); this._charTimer = null; }
      this._dialogueTxt.setText(this._currentText);
      this._typing = false;
      this._canAdvance = true;
      this._advanceTxt?.setVisible(true);
      return;
    }
    if (!this._canAdvance) return;

    this._lineIdx++;

    if (this._phase === 'intro') {
      if (this._lineIdx < this._lines.length) {
        this._typeLine(this._lines[this._lineIdx], '');
      } else {
        // Resolve trigger
        this._resolveTrigger();
      }

    } else if (this._phase === 'trigger') {
      if (this._lineIdx < this._lines.length) {
        this._typeLine(this._lines[this._lineIdx], this._npc?.name || '');
      } else {
        // Show outro
        this._phase = 'outro';
        this._lineIdx = 0;
        this._lines = [...(this._dayData.outro || [])];
        this._typeLine(this._lines[0], '');
      }

    } else if (this._phase === 'outro') {
      if (this._lineIdx < this._lines.length) {
        this._typeLine(this._lines[this._lineIdx], '');
      } else {
        this._goToNextDay();
      }
    }
  }

  _resolveTrigger() {
    const dayData = this._dayData;
    const npcKey  = dayData.npc;

    // Find the best matching trigger
    let bestTrigger = dayData.triggers[dayData.triggers.length - 1]; // fallback
    for (const trigger of dayData.triggers) {
      if (trigger.wantItems.length === 0) continue;
      const allPresent = trigger.wantItems.every(k => bagHasItem(k));
      if (allPresent) {
        bestTrigger = trigger;
        break;
      }
    }

    // Apply affinity
    const unlock = addAffinity(npcKey, bestTrigger.affinityGain);

    // Receive item if applicable
    if (bestTrigger.receiveItem) {
      const bagFull = GameState.bagItems.reduce((acc, i) => acc + ITEM_DEFS[i.itemKey].shape.length, 0)
        >= GRID.BAG_COLS * GRID.BAG_ROWS;
      if (!bagFull) {
        GameState.pendingItems.push({
          instanceId: newInstanceId(),
          itemKey: bestTrigger.receiveItem,
        });
        // Show received notice
        const idef = ITEM_DEFS[bestTrigger.receiveItem];
        this._receivedTxt.setText(`+  Received: ${idef?.name || bestTrigger.receiveItem}`);
        this._receivedPopup.setVisible(true);
        this.tweens.add({
          targets: this._receivedPopup,
          y: this.scale.height * 0.45,
          alpha: 0,
          delay: 2200,
          duration: 500,
          onComplete: () => {
            this._receivedPopup.setVisible(false);
            this._receivedPopup.setAlpha(1);
            this._receivedPopup.y = this.scale.height * 0.5;
          },
        });
      }
    }

    // Affinity gain notice
    const gainTxt = `♥  +${bestTrigger.affinityGain}  Affinity with ${this._npc?.name}` +
      (unlock ? `\n🔓  ${unlock.unlock}` : '');
    this._affinityTxt.setText(gainTxt);
    this._affinityPopup.setVisible(true);
    this.tweens.add({
      targets: this._affinityPopup,
      y: this.scale.height * 0.57,
      alpha: 0,
      delay: 2200,
      duration: 500,
      onComplete: () => {
        this._affinityPopup.setVisible(false);
        this._affinityPopup.setAlpha(1);
        this._affinityPopup.y = this.scale.height * 0.62;
      },
    });

    // Transition to trigger dialogue
    this._phase = 'trigger';
    this._lineIdx = 0;
    this._lines = [bestTrigger.dialogue];
    setTimeout(() => {
      this._typeLine(bestTrigger.dialogue, this._npc?.name || '');
    }, 400);
    this._canAdvance = false;
  }

  _goToNextDay() {
    GameState.currentDay++;
    if (GameState.currentDay >= DAYS.length) {
      GameState.phase = 'end';
      this.scene.start('EndScene');
    } else {
      GameState.phase = 'inventory';
      this.scene.start('InventoryScene');
    }
  }
}
