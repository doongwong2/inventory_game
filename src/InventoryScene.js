// ============================================================
// InventoryScene.js — The core drag-and-drop sorting screen
// Left: pixel art room view     Right: grid panels (scrollable)
// ============================================================

import {
  GRID, ITEM_DEFS, SHELF_DEFS, DAYS, GameState, newInstanceId
} from './GameData.js';
import {
  canPlace, placeItem, removeItem, getOccupiedCells, pixelToCell
} from './GridEngine.js';

const CELL = GRID.CELL;          // 40px
const PAL = {
  bg: 0x1a0a2e,
  panel: 0x251640,
  panelBorder: 0x6b3fa0,
  gridBg: 0x12082a,
  gridLine: 0x3d2b5e,
  gridHover: 0x5a3a8a,
  gridBad: 0x8a2020,
  gridGood: 0x2a6a3a,
  text: '#f9e4b7',
  subtext: '#c9b8e8',
  labelBg: 0x3d2060,
  dayBg: 0x2d0b4e,
  roomWall: 0x2a1a40,
  roomFloor: 0x1e1030,
  shelfWood: 0x6b4226,
  shelfDark: 0x4a2d18,
  btnGo: 0x2d7a2d,
  btnGoHover: 0x3daa3d,
};

// Right panel layout
const RIGHT_X = 420;   // where right panel starts (px from left of canvas)
const RIGHT_W = 380;   // width of right panel
const SCROLL_Y = 80;    // top of scrollable area on the right

export class InventoryScene extends Phaser.Scene {
  constructor() { super('InventoryScene'); }

  // ── State ───────────────────────────────────────────────────
  _drag = null;       // { instanceId, itemKey, ghost, originGrid, originX, originY, pointerOffsetCol, pointerOffsetRow }
  _gridViews = [];    // array of { id, cols, rows, label, x, y, grid, items, gfx, isShelf }
  _allItems = {};    // instanceId → { itemKey, gridId | null, originX, originY, sprite }
  _hoverGfx = null;
  _scrollY = 0;     // current scroll offset for right panel
  _maxScrollY = 0;
  _scrollMask = null;
  _contentContainer = null;

  create() {
    const W = this.scale.width;
    const H = this.scale.height;
    this._drag = null;
    this._gridViews = [];
    this._allItems = {};
    this._scrollY = 0;

    // ── Backgrounds ──────────────────────────────────────────
    const bgG = this.add.graphics();
    bgG.fillStyle(PAL.bg);
    bgG.fillRect(0, 0, W, H);

    // Divider
    const divG = this.add.graphics();
    divG.lineStyle(2, PAL.panelBorder, 0.6);
    divG.beginPath();
    divG.moveTo(RIGHT_X - 10, 0);
    divG.lineTo(RIGHT_X - 10, H);
    divG.strokePath();

    // ── Day Header ───────────────────────────────────────────
    this._drawHeader();

    // ── Left: Room View ──────────────────────────────────────
    this._drawRoom();

    // ── Right: Scrollable Grid Panel ─────────────────────────
    this._buildScrollPanel();

    // ── Hover overlay gfx ────────────────────────────────────
    this._hoverGfx = this.add.graphics().setDepth(50);

    // ── Ghost item (on top of everything) ────────────────────
    this._ghostGfx = this.add.graphics().setDepth(100);

    // ── Populate grids from GameState ────────────────────────
    this._syncFromGameState();

    // ── Input ────────────────────────────────────────────────
    this.input.on('pointermove', this._onPointerMove, this);
    this.input.on('pointerup', this._onPointerUp, this);
    this.input.on('wheel', (ptr, gameObjs, dx, dy) => {
      this._scrollBy(dy * 0.6);
    });

    // ── "Head Out" button ────────────────────────────────────
    this._drawGoButton();

    // ── Tooltip ──────────────────────────────────────────────
    this._tooltipBg = this.add.rectangle(0, 0, 180, 56, 0x1a0a2e, 0.92).setDepth(200).setVisible(false).setOrigin(0);
    this._tooltipTxt = this.add.text(0, 0, '', {
      fontFamily: '"Nunito", sans-serif',
      fontSize: '11px',
      color: PAL.text,
      wordWrap: { width: 170 },
      padding: { x: 6, y: 4 },
    }).setDepth(201).setVisible(false).setOrigin(0);

    // Pending items notification
    if (GameState.pendingItems.length > 0) {
      this._showPendingNotice();
    }
  }

  // ─────────────────────────────────────────────────────────────
  // HEADER
  // ─────────────────────────────────────────────────────────────
  _drawHeader() {
    const day = DAYS[GameState.currentDay];
    const dayNum = day ? day.day : '?';
    const activity = day ? day.activity.toUpperCase() : '';
    const npcKey = day ? day.npc : '';
    const npc = npcKey ? GameState.npcs[npcKey] : null;

    // Header bar
    const hg = this.add.graphics();
    hg.fillStyle(PAL.dayBg);
    hg.fillRect(0, 0, this.scale.width, 55);
    hg.lineStyle(2, PAL.panelBorder, 0.8);
    hg.beginPath();
    hg.moveTo(0, 55);
    hg.lineTo(this.scale.width, 55);
    hg.strokePath();

    // Day label
    this.add.text(16, 12, `DAY ${dayNum}  /  7`, {
      fontFamily: '"Press Start 2P", monospace',
      fontSize: '10px',
      color: '#f9e4b7',
    });

    // Activity hint
    this.add.text(16, 34, `Today: ${activity}${npc ? ' · ' + npc.name : ''}`, {
      fontFamily: '"Nunito", sans-serif',
      fontSize: '12px',
      color: '#c9b8e8',
    });

    // Phase label
    this.add.text(RIGHT_X + 10, 12, 'PACK YOUR BAG', {
      fontFamily: '"Press Start 2P", monospace',
      fontSize: '9px',
      color: '#9b5fd0',
    });
    this.add.text(RIGHT_X + 10, 32, 'Drag items into your bag or shelves', {
      fontFamily: '"Nunito", sans-serif',
      fontSize: '11px',
      color: '#7a6e9a',
    });

    // NPC affinity strip (top-right corner)
    this._drawAffinityStrip();
  }

  _drawAffinityStrip() {
    const W = this.scale.width;
    let ox = W - 10;
    for (const [key, npc] of Object.entries(GameState.npcs)) {
      const maxAt = npc.thresholds[npc.thresholds.length - 1].at;
      const pct = npc.affinity / maxAt;
      const bw = 44;
      ox -= bw + 6;
      // bg
      const bg2 = this.add.rectangle(ox + bw / 2, 27, bw, 20, 0x2d1b4e);
      // fill
      const fillG = this.add.graphics();
      fillG.fillStyle(npc.color, 0.8);
      fillG.fillRect(ox, 17, Math.max(2, bw * pct), 20);
      // name
      this.add.text(ox + bw / 2, 27, npc.name.substring(0, 5), {
        fontFamily: '"Press Start 2P", monospace',
        fontSize: '6px',
        color: '#f9e4b7',
      }).setOrigin(0.5);
    }
  }

  // ─────────────────────────────────────────────────────────────
  // LEFT: ROOM VIEW
  // ─────────────────────────────────────────────────────────────
  _drawRoom() {
    const H = this.scale.height;
    const roomW = RIGHT_X - 20;
    const roomH = H - 60;
    const roomX = 0;
    const roomY = 60;

    const rg = this.add.graphics();

    // Wall
    rg.fillStyle(PAL.roomWall);
    rg.fillRect(roomX, roomY, roomW, roomH * 0.65);

    // Floor
    rg.fillStyle(PAL.roomFloor);
    rg.fillRect(roomX, roomY + roomH * 0.65, roomW, roomH * 0.35);

    // Wall–floor border (skirting)
    rg.fillStyle(0x3d2b5e);
    rg.fillRect(roomX, roomY + roomH * 0.65 - 4, roomW, 8);

    // Floor boards (horizontal lines)
    rg.lineStyle(1, 0x2a1840, 0.5);
    for (let fy = roomY + roomH * 0.65 + 18; fy < roomY + roomH; fy += 18) {
      rg.beginPath();
      rg.moveTo(roomX, fy);
      rg.lineTo(roomX + roomW, fy);
      rg.strokePath();
    }

    // Window on wall
    const wx = roomX + 20;
    const wy = roomY + 20;
    this._drawRoomWindow(rg, wx, wy, 80, 70);

    // Poster on wall
    this._drawPoster(rg, roomX + 160, roomY + 22, 55, 70);

    // Desk
    const deskX = roomX + 5;
    const deskY = roomY + roomH * 0.65 - 55;
    this._drawDesk(rg, deskX, deskY, roomW - 10, 50);

    // Shelves on wall (visual only — actual grids are on the right)
    this._drawShelfUnit(rg, roomX + 10, roomY + 105, 'shelf_a', 'Small Shelf A');
    this._drawShelfUnit(rg, roomX + 120, roomY + 105, 'shelf_b', 'Small Shelf B');
    this._drawShelfUnit(rg, roomX + 240, roomY + 70, 'shelf_c', 'Big Bookcase');

    // Rug
    rg.fillStyle(0x4a2060, 0.6);
    rg.fillEllipse(roomW / 2, roomY + roomH * 0.83, roomW * 0.55, 30);

    // Bag on floor (visual)
    this._drawBagIcon(rg, roomX + 25, roomY + roomH * 0.78);

    // Room label
    this.add.text(roomX + roomW / 2, roomY + roomH - 18, 'Your Room', {
      fontFamily: '"Press Start 2P", monospace',
      fontSize: '7px',
      color: '#4a3d6a',
    }).setOrigin(0.5);
  }

  _drawRoomWindow(g, x, y, w, h) {
    g.fillStyle(0x3d2b5e);
    g.fillRect(x, y, w, h);
    g.fillStyle(0x8ecae6, 0.3);
    g.fillRect(x + 4, y + 4, (w - 14) / 2, (h - 14) / 2);
    g.fillRect(x + 4 + (w - 14) / 2 + 6, y + 4, (w - 14) / 2, (h - 14) / 2);
    g.fillRect(x + 4, y + 4 + (h - 14) / 2 + 6, (w - 14) / 2, (h - 14) / 2);
    g.fillRect(x + 4 + (w - 14) / 2 + 6, y + 4 + (h - 14) / 2 + 6, (w - 14) / 2, (h - 14) / 2);
    // crossbar
    g.fillStyle(0x3d2b5e);
    const mx = x + w / 2 - 2;
    g.fillRect(mx, y + 2, 4, h - 4);
    g.fillRect(x + 2, y + h / 2 - 2, w - 4, 4);
  }

  _drawPoster(g, x, y, w, h) {
    g.fillStyle(0x1a0a2e);
    g.fillRect(x, y, w, h);
    g.fillStyle(0xe07b54, 0.5);
    g.fillRect(x + 6, y + 6, w - 12, 20);
    g.fillStyle(0x7ec8e3, 0.4);
    g.fillRect(x + 10, y + 32, w - 20, 6);
    g.fillRect(x + 10, y + 42, w - 24, 6);
    g.fillRect(x + 10, y + 52, w - 18, 6);
  }

  _drawDesk(g, x, y, w, h) {
    // desk top
    g.fillStyle(PAL.shelfWood);
    g.fillRect(x, y, w, 10);
    // desk body
    g.fillStyle(PAL.shelfDark);
    g.fillRect(x, y + 10, w, h - 10);
    // drawers
    g.fillStyle(0x5c3820);
    g.fillRect(x + w - 80, y + 14, 70, h - 18);
    g.fillStyle(PAL.shelfWood);
    g.fillRect(x + w - 78, y + 16, 66, 14);
    g.fillRect(x + w - 78, y + 34, 66, 14);
    // desk items (decorative)
    // coffee cup
    g.fillStyle(0x7ec8e3);
    g.fillRect(x + 14, y - 18, 14, 16);
    g.fillStyle(0x5ab8d3);
    g.fillRect(x + 14, y - 20, 14, 4);
    // book stack
    g.fillStyle(0xe07b54);
    g.fillRect(x + 40, y - 28, 20, 8);
    g.fillStyle(0xf6d860);
    g.fillRect(x + 42, y - 36, 18, 8);
    g.fillStyle(0x7ec8e3);
    g.fillRect(x + 40, y - 44, 22, 8);
    // pencil holder
    g.fillStyle(0x4a2d18);
    g.fillRect(x + 78, y - 22, 14, 20);
    g.fillStyle(0xf6d860);
    g.fillRect(x + 81, y - 30, 4, 10);
    g.fillStyle(0x7ec8e3);
    g.fillRect(x + 86, y - 28, 3, 8);
  }

  _drawShelfUnit(g, x, y, shelfId, label) {
    const def = SHELF_DEFS.find(s => s.id === shelfId);
    if (!def) return;
    // Scale shelf drawing to fit room
    const scale = 0.38;
    const sw = def.cols * CELL * scale;
    const sh = def.rows * CELL * scale;

    // back panel
    g.fillStyle(0x2a1a3e);
    g.fillRect(x, y, sw + 8, sh + 16);

    // shelves (horizontal dividers)
    g.fillStyle(PAL.shelfWood);
    g.fillRect(x, y, sw + 8, 5);  // top
    g.fillRect(x, y + sh + 11, sw + 8, 5);  // bottom
    g.fillRect(x, y + (sh + 11) / 2, sw + 8, 4); // mid

    // side panels
    g.fillStyle(PAL.shelfDark);
    g.fillRect(x, y, 5, sh + 16);
    g.fillRect(x + sw + 3, y, 5, sh + 16);

    // shelf label (tiny)
    this.add.text(x + (sw + 8) / 2, y + sh + 22, label, {
      fontFamily: '"Press Start 2P", monospace',
      fontSize: '5px',
      color: '#7a6e9a',
    }).setOrigin(0.5);
  }

  _drawBagIcon(g, x, y) {
    // Pixel backpack
    g.fillStyle(0x6b3fa0);
    g.fillRect(x, y, 36, 30);
    g.fillStyle(0x9b5fd0);
    g.fillRect(x + 6, y - 8, 24, 12);
    g.fillStyle(0x4a2d80);
    g.fillRect(x + 12, y - 10, 12, 6);
    // strap
    g.lineStyle(3, 0x9b5fd0, 1);
    g.beginPath();
    g.moveTo(x + 6, y + 4);
    g.lineTo(x - 6, y + 20);
    g.lineTo(x - 4, y + 30);
    g.strokePath();
    g.beginPath();
    g.moveTo(x + 30, y + 4);
    g.lineTo(x + 42, y + 20);
    g.lineTo(x + 40, y + 30);
    g.strokePath();
    // pocket
    g.fillStyle(0x5a3090);
    g.fillRect(x + 8, y + 16, 20, 12);
    // label
    this.add.text(x + 18, y + 44, 'BAG  5×7', {
      fontFamily: '"Press Start 2P", monospace',
      fontSize: '5px',
      color: '#6b3fa0',
    }).setOrigin(0.5);
  }

  // ─────────────────────────────────────────────────────────────
  // RIGHT: SCROLLABLE GRID PANEL
  // ─────────────────────────────────────────────────────────────
  _buildScrollPanel() {
    const H = this.scale.height;
    const panelW = this.scale.width - RIGHT_X;

    // Background
    const pg = this.add.graphics();
    pg.fillStyle(PAL.panel, 0.95);
    pg.fillRect(RIGHT_X - 10, 55, panelW + 10, H - 55);

    // Scrollable container
    this._contentContainer = this.add.container(RIGHT_X, SCROLL_Y);
    this._contentContainer.setDepth(10);

    // Mask for scroll region
    const maskShape = this.make.graphics();
    maskShape.fillStyle(0xffffff);
    maskShape.fillRect(RIGHT_X - 10, SCROLL_Y, panelW + 10, H - SCROLL_Y - 60);
    const mask = maskShape.createGeometryMask();
    this._contentContainer.setMask(mask);

    // Build grid views inside the container
    let yOffset = 10;

    // BAG grid first
    yOffset = this._addGridView({
      id: 'bag',
      cols: GRID.BAG_COLS,
      rows: GRID.BAG_ROWS,
      label: 'Your Bag (5×7)',
      color: 0x6b3fa0,
      xOff: 10,
      yOff: yOffset,
      isShelf: false,
    });

    // Divider
    const divLine = this.add.graphics();
    divLine.lineStyle(1, PAL.panelBorder, 0.3);
    divLine.beginPath();
    divLine.moveTo(RIGHT_X + 5, SCROLL_Y + yOffset);
    divLine.lineTo(this.scale.width - 5, SCROLL_Y + yOffset);
    divLine.strokePath();

    yOffset += 10;

    // Shelf grids
    for (const sdef of SHELF_DEFS) {
      yOffset = this._addGridView({
        id: sdef.id,
        cols: sdef.cols,
        rows: sdef.rows,
        label: sdef.label,
        color: PAL.shelfWood,
        xOff: 10,
        yOff: yOffset,
        isShelf: true,
      });
      yOffset += 8;
    }

    // Item tray (floating / unplaced items)
    this._addItemTray();

    this._maxScrollY = Math.max(0, yOffset - (H - SCROLL_Y - 60));
  }

  /**
   * Add a grid view to the right panel.
   * Returns the new yOffset after this grid.
   */
  _addGridView({ id, cols, rows, label, color, xOff, yOff, isShelf }) {
    const gw = cols * CELL;
    const gh = rows * CELL;

    // Label background
    const lbg = this.add.rectangle(
      RIGHT_X + xOff + gw / 2, SCROLL_Y + yOff + 14, gw + 12, 22, PAL.labelBg
    );

    this.add.text(RIGHT_X + xOff + 4, SCROLL_Y + yOff + 5, label, {
      fontFamily: '"Press Start 2P", monospace',
      fontSize: '7px',
      color: '#f9e4b7',
    });

    yOff += 24;

    // Grid background
    const gbg = this.add.graphics();
    gbg.fillStyle(PAL.gridBg);
    gbg.fillRect(RIGHT_X + xOff - 1, SCROLL_Y + yOff - 1, gw + 2, gh + 2);
    gbg.lineStyle(2, color, 0.7);
    gbg.strokeRect(RIGHT_X + xOff - 2, SCROLL_Y + yOff - 2, gw + 4, gh + 4);

    // Grid lines
    const gg = this.add.graphics();
    gg.lineStyle(1, PAL.gridLine, 0.7);
    for (let c = 0; c <= cols; c++) {
      gg.beginPath();
      gg.moveTo(RIGHT_X + xOff + c * CELL, SCROLL_Y + yOff);
      gg.lineTo(RIGHT_X + xOff + c * CELL, SCROLL_Y + yOff + gh);
      gg.strokePath();
    }
    for (let r = 0; r <= rows; r++) {
      gg.beginPath();
      gg.moveTo(RIGHT_X + xOff, SCROLL_Y + yOff + r * CELL);
      gg.lineTo(RIGHT_X + xOff + gw, SCROLL_Y + yOff + r * CELL);
      gg.strokePath();
    }

    // Invisible interactive zone for the grid
    const zone = this.add.zone(
      RIGHT_X + xOff, SCROLL_Y + yOff, gw, gh
    ).setOrigin(0).setInteractive();

    // Register grid view
    const view = {
      id, cols, rows, label, isShelf,
      x: RIGHT_X + xOff,
      y: SCROLL_Y + yOff,
      _baseY: SCROLL_Y + yOff,
      grid: isShelf ? GameState.shelves[id].grid : GameState.bagGrid,
      items: isShelf ? GameState.shelves[id].items : GameState.bagItems,
      gfx: this.add.graphics().setDepth(20),
      zone,
    };
    this._gridViews.push(view);

    // Zone events
    zone.on('pointermove', (ptr) => {
      if (this._drag) this._onGridHover(view, ptr);
    });
    zone.on('pointerdown', (ptr) => {
      this._onGridPointerDown(view, ptr);
    });

    return yOff + gh + 14;
  }

  _addItemTray() {
    const trayX = 10;
    const trayY = this.scale.height - 90;
    const trayW = RIGHT_X - 30;
    const trayH = 60;

    // Label
    this.add.text(trayX, trayY, 'ITEMS (drag to place)', {
      fontFamily: '"Press Start 2P", monospace',
      fontSize: '7px',
      color: '#9b5fd0',
    });

    // Tray bg
    const tg = this.add.graphics();
    tg.fillStyle(0x12082a);
    tg.fillRect(trayX, trayY + 16, trayW, trayH);
    tg.lineStyle(1, PAL.panelBorder, 0.4);
    tg.strokeRect(trayX, trayY + 16, trayW, trayH);

    this._trayX = trayX;
    this._trayY = trayY + 16;
    this._trayW = trayW;
    this._trayH = trayH;

    // Interactive zone for tray
    const tz = this.add.zone(trayX, trayY + 16, trayW, trayH).setOrigin(0).setInteractive();
    tz.on('pointerdown', (ptr) => this._onTrayPointerDown(ptr));
  }

  // ─────────────────────────────────────────────────────────────
  // SYNC GAME STATE → VISUALS
  // ─────────────────────────────────────────────────────────────
  _syncFromGameState() {
    // Place existing bag items
    for (const item of GameState.bagItems) {
      this._renderItem(item.instanceId, item.itemKey, 'bag', item.originX, item.originY);
    }
    // Place shelf items
    for (const sdef of SHELF_DEFS) {
      for (const item of GameState.shelves[sdef.id].items) {
        this._renderItem(item.instanceId, item.itemKey, sdef.id, item.originX, item.originY);
      }
    }
    // Floating items → render in tray
    this._layoutTray();
  }

  _layoutTray() {
    const perRow = Math.floor(this._trayW / (CELL + 4));
    let tx = 0, ty = 0;
    for (const fi of GameState.floatingItems) {
      if (!this._allItems[fi.instanceId]) {
        this._renderFloatingItem(fi.instanceId, fi.itemKey, tx, ty);
        tx++;
        if (tx >= perRow) { tx = 0; ty++; }
      }
    }
    // Pending items from events
    for (const pi of GameState.pendingItems) {
      if (!this._allItems[pi.instanceId]) {
        GameState.floatingItems.push(pi);
        this._renderFloatingItem(pi.instanceId, pi.itemKey, tx, ty);
        tx++;
        if (tx >= perRow) { tx = 0; ty++; }
      }
    }
    GameState.pendingItems = [];
  }

  _renderItem(instanceId, itemKey, gridId, originX, originY) {
    const view = this._getView(gridId);
    if (!view) return;
    const gfx = this.add.graphics().setDepth(25);
    this._drawItemOnGrid(gfx, itemKey, view.x + originX * CELL, view.y + originY * CELL);
    gfx.setInteractive(
      new Phaser.Geom.Rectangle(
        view.x + originX * CELL,
        view.y + originY * CELL,
        ITEM_DEFS[itemKey].shape.reduce((m, [c]) => Math.max(m, c + 1), 1) * CELL,
        ITEM_DEFS[itemKey].shape.reduce((m, [, r]) => Math.max(m, r + 1), 1) * CELL,
      ),
      Phaser.Geom.Rectangle.Contains
    );
    gfx.on('pointerdown', (ptr) => this._pickUpItem(instanceId, itemKey, gridId, originX, originY, ptr));
    gfx.on('pointerover', () => this._showTooltip(itemKey, gfx));
    gfx.on('pointerout', () => this._hideTooltip());
    this._allItems[instanceId] = { itemKey, gridId, originX, originY, gfx };
  }

  _renderFloatingItem(instanceId, itemKey, trayCol, trayRow) {
    const px = this._trayX + trayCol * (CELL + 4) + 4;
    const py = this._trayY + trayRow * (CELL + 4) + 4;
    const gfx = this.add.graphics().setDepth(25);
    this._drawItemOnGrid(gfx, itemKey, px, py, 0.85);
    gfx.setInteractive(
      new Phaser.Geom.Rectangle(px, py, CELL, CELL),
      Phaser.Geom.Rectangle.Contains
    );
    gfx.on('pointerdown', (ptr) => this._pickUpFloating(instanceId, itemKey, ptr));
    gfx.on('pointerover', () => this._showTooltip(itemKey, gfx));
    gfx.on('pointerout', () => this._hideTooltip());
    this._allItems[instanceId] = { itemKey, gridId: null, originX: trayCol, originY: trayRow, gfx };
  }

  // ─────────────────────────────────────────────────────────────
  // DRAWING HELPERS
  // ─────────────────────────────────────────────────────────────
  _drawItemOnGrid(gfx, itemKey, baseX, baseY, scale = 1) {
    const def = ITEM_DEFS[itemKey];
    if (!def) return;
    gfx.clear();
    for (const [dc, dr] of def.shape) {
      const cx = baseX + dc * CELL * scale;
      const cy = baseY + dr * CELL * scale;
      const cs = CELL * scale - 2;
      // Main fill
      gfx.fillStyle(def.color, 1);
      gfx.fillRect(cx + 1, cy + 1, cs, cs);
      // Highlight (top-left)
      gfx.fillStyle(0xffffff, 0.25);
      gfx.fillRect(cx + 1, cy + 1, cs, 4);
      gfx.fillRect(cx + 1, cy + 1, 4, cs);
      // Shadow (bottom-right)
      gfx.fillStyle(0x000000, 0.2);
      gfx.fillRect(cx + 1, cy + cs - 2, cs, 3);
      gfx.fillRect(cx + cs - 2, cy + 1, 3, cs);
    }
    // Item name label (abbreviate)
    const label = def.name.length > 6 ? def.name.substring(0, 5) + '…' : def.name;
    // Small text on item — just a dot or initial for tiny items
    if (def.shape.length === 1) {
      gfx.fillStyle(0x000000, 0.35);
      gfx.fillRect(baseX + 6 * scale, baseY + 6 * scale, (CELL - 12) * scale, (CELL - 12) * scale);
    }
  }

  _drawItemGhost(gfx, itemKey, baseX, baseY, valid) {
    const def = ITEM_DEFS[itemKey];
    if (!def) return;
    gfx.clear();
    const col = valid ? PAL.gridGood : PAL.gridBad;
    for (const [dc, dr] of def.shape) {
      const cx = baseX + dc * CELL;
      const cy = baseY + dr * CELL;
      gfx.fillStyle(col, 0.45);
      gfx.fillRect(cx + 1, cy + 1, CELL - 2, CELL - 2);
      gfx.lineStyle(2, col, 0.8);
      gfx.strokeRect(cx + 1, cy + 1, CELL - 2, CELL - 2);
    }
  }

  _highlightCells(view, cells, color) {
    if (!view) return;
    const hg = this._hoverGfx;
    for (const { col, row } of cells) {
      if (col >= 0 && col < view.cols && row >= 0 && row < view.rows) {
        hg.fillStyle(color, 0.35);
        hg.fillRect(view.x + col * CELL + 1, view.y + row * CELL + 1, CELL - 2, CELL - 2);
      }
    }
  }

  // ─────────────────────────────────────────────────────────────
  // DRAG LOGIC
  // ─────────────────────────────────────────────────────────────
  _pickUpItem(instanceId, itemKey, gridId, originX, originY, ptr) {
    // Remove from grid
    const view = this._getView(gridId);
    if (view) {
      removeItem(view.grid, view.cols, instanceId);
      const list = view.items;
      const idx = list.findIndex(i => i.instanceId === instanceId);
      if (idx !== -1) list.splice(idx, 1);
    }
    // Destroy old gfx
    this._allItems[instanceId]?.gfx?.destroy();
    delete this._allItems[instanceId];

    // Pointer offset: which cell of item are we holding?
    const localX = ptr.x - (view ? view.x + originX * CELL : ptr.x);
    const localY = ptr.y - (view ? view.y + originY * CELL : ptr.y);
    const pointerOffsetCol = Math.floor(localX / CELL);
    const pointerOffsetRow = Math.floor(localY / CELL);

    this._drag = {
      instanceId, itemKey,
      originGrid: gridId,
      originX, originY,
      pointerOffsetCol: Math.max(0, pointerOffsetCol),
      pointerOffsetRow: Math.max(0, pointerOffsetRow),
    };
  }

  _pickUpFloating(instanceId, itemKey, ptr) {
    // Remove from floatingItems list
    const idx = GameState.floatingItems.findIndex(i => i.instanceId === instanceId);
    if (idx !== -1) GameState.floatingItems.splice(idx, 1);
    this._allItems[instanceId]?.gfx?.destroy();
    delete this._allItems[instanceId];

    this._drag = {
      instanceId, itemKey,
      originGrid: null,
      originX: 0, originY: 0,
      pointerOffsetCol: 0,
      pointerOffsetRow: 0,
    };
  }

  _onPointerMove(ptr) {
    if (!this._drag) {
      this._hoverGfx.clear();
      return;
    }
    this._hoverGfx.clear();
    this._ghostGfx.clear();

    // Draw ghost at pointer
    const gx = ptr.x - this._drag.pointerOffsetCol * CELL;
    const gy = ptr.y - this._drag.pointerOffsetRow * CELL;

    // Determine if over a valid grid
    const view = this._getViewAtPoint(ptr.x, ptr.y);
    let valid = false;
    if (view) {
      const col = Math.floor((ptr.x - view.x) / CELL) - this._drag.pointerOffsetCol;
      const row = Math.floor((ptr.y - view.y) / CELL) - this._drag.pointerOffsetRow;
      valid = canPlace(view.grid, view.cols, view.rows, this._drag.itemKey, col, row, this._drag.instanceId);
      const cells = getOccupiedCells(this._drag.itemKey, col, row);
      this._highlightCells(view, cells, valid ? PAL.gridGood : PAL.gridBad);
    }

    this._drawItemGhost(this._ghostGfx, this._drag.itemKey, gx, gy, valid || !view);
  }

  _onGridHover(view, ptr) {
    // handled in _onPointerMove
  }

  _onGridPointerDown(view, ptr) {
    // If dragging, try to place
    if (this._drag) {
      const col = Math.floor((ptr.x - view.x) / CELL) - this._drag.pointerOffsetCol;
      const row = Math.floor((ptr.y - view.y) / CELL) - this._drag.pointerOffsetRow;
      this._tryPlace(view, col, row);
    }
  }

  _onTrayPointerDown(ptr) {
    if (this._drag) {
      // Drop back to tray (floating)
      const drag = this._drag;
      this._drag = null;
      this._ghostGfx.clear();
      this._hoverGfx.clear();
      GameState.floatingItems.push({ instanceId: drag.instanceId, itemKey: drag.itemKey });
      this._layoutTray();
    }
  }

  _onPointerUp(ptr) {
    if (!this._drag) return;

    // Try to place on whatever grid is under pointer
    const view = this._getViewAtPoint(ptr.x, ptr.y);
    if (view) {
      const col = Math.floor((ptr.x - view.x) / CELL) - this._drag.pointerOffsetCol;
      const row = Math.floor((ptr.y - view.y) / CELL) - this._drag.pointerOffsetRow;
      if (this._tryPlace(view, col, row)) return;
    }

    // Check if over tray
    if (
      ptr.x >= this._trayX && ptr.x <= this._trayX + this._trayW &&
      ptr.y >= this._trayY && ptr.y <= this._trayY + this._trayH
    ) {
      // Return to floating tray
      const drag = this._drag;
      this._drag = null;
      this._ghostGfx.clear();
      this._hoverGfx.clear();
      GameState.floatingItems.push({ instanceId: drag.instanceId, itemKey: drag.itemKey });
      this._layoutTray();
      return;
    }

    // Otherwise snap back to origin
    this._snapBack();
  }

  _tryPlace(view, col, row) {
    const drag = this._drag;
    if (!drag) return false;
    if (!canPlace(view.grid, view.cols, view.rows, drag.itemKey, col, row)) return false;

    placeItem(view.grid, view.cols, drag.itemKey, col, row, drag.instanceId);
    view.items.push({ instanceId: drag.instanceId, itemKey: drag.itemKey, originX: col, originY: row });

    this._drag = null;
    this._ghostGfx.clear();
    this._hoverGfx.clear();
    this._renderItem(drag.instanceId, drag.itemKey, view.id, col, row);
    return true;
  }

  _snapBack() {
    const drag = this._drag;
    if (!drag) return;
    this._drag = null;
    this._ghostGfx.clear();
    this._hoverGfx.clear();

    if (drag.originGrid) {
      const view = this._getView(drag.originGrid);
      if (view && canPlace(view.grid, view.cols, view.rows, drag.itemKey, drag.originX, drag.originY)) {
        placeItem(view.grid, view.cols, drag.itemKey, drag.originX, drag.originY, drag.instanceId);
        view.items.push({ instanceId: drag.instanceId, itemKey: drag.itemKey, originX: drag.originX, originY: drag.originY });
        this._renderItem(drag.instanceId, drag.itemKey, view.id, drag.originX, drag.originY);
        return;
      }
    }
    // Fall back: put in floating tray
    GameState.floatingItems.push({ instanceId: drag.instanceId, itemKey: drag.itemKey });
    this._layoutTray();
  }

  _scrollBy(dy) {
    this._scrollY = Phaser.Math.Clamp(this._scrollY + dy, 0, this._maxScrollY);
    // Move all grid view positions
    for (const view of this._gridViews) {
      view.y = view._baseY - this._scrollY;
      if (view.zone) {
        view.zone.y = view.y;
      }
    }
    // Redraw all items
    this._redrawAllItems();
  }

  _redrawAllItems() {
    for (const [instanceId, info] of Object.entries(this._allItems)) {
      if (info.gridId) {
        const view = this._getView(info.gridId);
        if (view) {
          info.gfx.clear();
          this._drawItemOnGrid(info.gfx, info.itemKey, view.x + info.originX * CELL, view.y + info.originY * CELL);
        }
      }
    }
  }

  // ─────────────────────────────────────────────────────────────
  // GO BUTTON
  // ─────────────────────────────────────────────────────────────
  _drawGoButton() {
    const H = this.scale.height;
    const btnW = RIGHT_W - 20;
    const btnX = RIGHT_X + 10;
    const btnY = H - 50;

    const btn = this.add.rectangle(btnX + btnW / 2, btnY + 18, btnW, 36, PAL.btnGo)
      .setDepth(150)
      .setInteractive({ useHandCursor: true })
      .on('pointerover', () => btn.setFillStyle(PAL.btnGoHover))
      .on('pointerout', () => btn.setFillStyle(PAL.btnGo))
      .on('pointerdown', () => this._headOut());

    this.add.text(btnX + btnW / 2, btnY + 18, '▶  HEAD OUT', {
      fontFamily: '"Press Start 2P", monospace',
      fontSize: '9px',
      color: '#f9e4b7',
    }).setOrigin(0.5).setDepth(151);

    // Bag fullness indicator
    const used = GameState.bagItems.reduce((acc, i) => acc + ITEM_DEFS[i.itemKey].shape.length, 0);
    const total = GRID.BAG_COLS * GRID.BAG_ROWS;
    this._bagStatusTxt = this.add.text(btnX, btnY - 20,
      `Bag: ${used}/${total} cells used`,
      {
        fontFamily: '"Nunito", sans-serif',
        fontSize: '12px',
        color: used >= total ? '#ff6060' : '#c9b8e8',
      }
    ).setDepth(151);
  }

  _headOut() {
    // Check bag has at least the keys
    const hasKeys = GameState.bagItems.some(i => i.itemKey === 'keys');
    if (!hasKeys) {
      // Flash warning
      const W = this.scale.width;
      const warn = this.add.text(W / 2, this.scale.height - 80,
        "Don't forget your keys!", {
        fontFamily: '"Press Start 2P", monospace',
        fontSize: '10px',
        color: '#ff6060',
        backgroundColor: '#1a0a2e',
        padding: { x: 10, y: 6 },
      }
      ).setOrigin(0.5).setDepth(200);
      this.tweens.add({ targets: warn, alpha: 0, delay: 1800, duration: 400, onComplete: () => warn.destroy() });
      return;
    }
    GameState.phase = 'event';
    this.scene.start('EventScene');
  }

  // ─────────────────────────────────────────────────────────────
  // TOOLTIP
  // ─────────────────────────────────────────────────────────────
  _showTooltip(itemKey, gfx) {
    if (this._drag) return;
    const def = ITEM_DEFS[itemKey];
    if (!def) return;
    this._tooltipTxt.setText(`${def.name}\n${def.description}`);
    const bounds = gfx.getBounds();
    let tx = bounds.right + 6;
    let ty = bounds.top;
    if (tx + 184 > this.scale.width) tx = bounds.left - 190;
    this._tooltipBg.setPosition(tx, ty).setVisible(true);
    this._tooltipTxt.setPosition(tx + 4, ty + 4).setVisible(true);
  }
  _hideTooltip() {
    this._tooltipBg.setVisible(false);
    this._tooltipTxt.setVisible(false);
  }

  // ─────────────────────────────────────────────────────────────
  // PENDING NOTICE
  // ─────────────────────────────────────────────────────────────
  _showPendingNotice() {
    const W = this.scale.width;
    const items = GameState.pendingItems.map(i => ITEM_DEFS[i.itemKey]?.name || i.itemKey).join(', ');
    const notice = this.add.text(W / 2, 66,
      `📦  You received: ${items}  — added to your tray!`,
      {
        fontFamily: '"Nunito", sans-serif',
        fontSize: '13px',
        color: '#f9e4b7',
        backgroundColor: '#3d2060',
        padding: { x: 12, y: 6 },
      }
    ).setOrigin(0.5).setDepth(200);
    this.tweens.add({ targets: notice, alpha: 0, delay: 3000, duration: 600, onComplete: () => notice.destroy() });
  }

  // ─────────────────────────────────────────────────────────────
  // UTILITIES
  // ─────────────────────────────────────────────────────────────
  _getView(id) {
    return this._gridViews.find(v => v.id === id) || null;
  }

  _getViewAtPoint(px, py) {
    for (const v of this._gridViews) {
      if (px >= v.x && px < v.x + v.cols * CELL &&
        py >= v.y && py < v.y + v.rows * CELL) {
        return v;
      }
    }
    return null;
  }
}
