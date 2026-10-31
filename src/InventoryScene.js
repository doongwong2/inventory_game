// ============================================================
// InventoryScene.js — The core drag-and-drop sorting screen
// Left: pixel art room view     Right: grid panels (scrollable)
// ============================================================

import {
  GRID, ITEM_DEFS, SHELF_DEFS, DAYS, GameState, newInstanceId
} from './GameData.js';
import {
  canPlace, placeItem, removeItem, getOccupiedCells, getItemShape
} from './GridEngine.js';
import { addText } from './uiText.js';

const CELL = GRID.CELL;          // 40px
const PAL = {
  bg: 0x1a0a2e,
  panel: 0x251640,
  panelBorder: 0x6b3fa0,
  gridBg: 0x12082a,
  gridLine: 0x624c80,
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
  shelfTop: 0x9a6739,
  shelfSide: 0x4b2d1d,
  shelfOpening: 0x392319,
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
  _gridLayer = null;
  _itemLayer = null;
  _gridOverlayLayer = null;
  _itemLabelLayer = null;

  create() {
    const W = this.scale.width;
    const H = this.scale.height;
    this._drag = null;
    this._gridViews = [];
    this._allItems = {};
    this._hoveredItemId = null;
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
    this._roomShelfItemsGfx = this.add.graphics().setDepth(5);

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
    this.input.on('pointerdown', this._onScenePointerDown, this);
    this.input.on('pointerup', this._onPointerUp, this);
    this.input.mouse.disableContextMenu();
    this.input.on('wheel', (ptr, gameObjs, dx, dy) => {
      if (ptr.x >= RIGHT_X && ptr.y >= SCROLL_Y && ptr.y < this.scale.height - 50) {
        this._scrollBy(dy * 0.6);
      }
    });

    // ── "Head Out" button ────────────────────────────────────
    this._drawGoButton();

    // ── Tooltip ──────────────────────────────────────────────
    this._tooltipBg = this.add.rectangle(0, 0, 180, 56, 0x1a0a2e, 0.92).setDepth(200).setVisible(false).setOrigin(0);
    this._tooltipTxt = addText(this, 0, 0, '', {
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
    addText(this, 16, 12, `DAY ${dayNum}  /  7`, {
      fontFamily: '"Press Start 2P", monospace',
      fontSize: '10px',
      color: '#f9e4b7',
    });

    // Activity hint
    addText(this, 16, 34, `Today: ${activity}${npc ? ' · ' + npc.name : ''}`, {
      fontFamily: '"Nunito", sans-serif',
      fontSize: '12px',
      color: '#c9b8e8',
    });

    // Phase label. Shift it left to leave a clear gap before the affinity strip.
    const phaseTextX = RIGHT_X - 90;
    addText(this, phaseTextX, 12, 'PACK YOUR BAG', {
      fontFamily: '"Press Start 2P", monospace',
      fontSize: '9px',
      color: '#9b5fd0',
    });
    addText(this, phaseTextX, 32, 'Drag to place · Right-click to rotate', {
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
      addText(this, ox + bw / 2, 27, npc.name.substring(0, 5), {
        fontFamily: '"Press Start 2P", monospace',
        fontSize: '8px',
        color: '#f9e4b7',
      }).setOrigin(0.5);
    }
  }

  // ─────────────────────────────────────────────────────────────
  // LEFT: ROOM VIEW
  // ─────────────────────────────────────────────────────────────
  _drawRoom() {
    const rg = this.add.graphics();
    // Two angled walls and a receding floor establish a compact isometric room.
    this._fillPoly(rg, [[0, 60], [345, 60], [345, 316], [0, 316]], 0x30204a);
    this._fillPoly(rg, [[345, 60], [410, 104], [410, 360], [345, 316]], 0x241638);
    this._fillPoly(rg, [[0, 316], [345, 316], [410, 360], [92, 510], [0, 452]], 0x26143a);

    // Wall/floor trim follows the room's perspective; keep the floor clear.
    rg.lineStyle(5, 0x503765, 0.9);
    rg.beginPath(); rg.moveTo(0, 316); rg.lineTo(345, 316); rg.lineTo(410, 360); rg.strokePath();

    this._drawRoomWindow(rg, 18, 92, 76, 68);
    this._drawPoster(rg, 114, 94, 48, 62);

    // Three matching wall-mounted 3×3 cubbies correspond to shelves A, B, and C.
    this._drawSmallShelfRow(rg, 24, 165);

    // The desk runs along the back wall. The tall bookcase projects out from it
    // at a right angle and reaches down onto the floor.
    this._drawDesk(rg, 12, 319, 180, 48);
    // Keep the cabinet openings beside the desk, with its solid side wall
    // receding left and up behind them.
    this._drawFloorBookcase(rg, 184, 155, 66, 207);

    rg.fillStyle(0x4a2060, 0.52);
    rg.fillEllipse(167, 415, 118, 34);
    this._drawBagIcon(rg, 30, 405);
  }

  _fillPoly(g, points, color, alpha = 1) {
    g.fillStyle(color, alpha);
    g.fillPoints(points.map(([x, y]) => new Phaser.Geom.Point(x, y)), true);
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
    // Build the desktop as a plane whose front edge shifts down and right.
    const depth = 10;
    this._fillPoly(g, [[x, y], [x + w, y], [x + w + depth, y + depth], [x + depth, y + depth]], PAL.shelfWood);
    g.lineStyle(3, PAL.shelfDark, 1);
    g.beginPath();
    g.moveTo(x, y); g.lineTo(x + w, y);
    g.lineTo(x + w + depth, y + depth); g.lineTo(x + depth, y + depth);
    g.lineTo(x, y); g.strokePath();

    // Apron and legs follow the shifted front edge of the desktop.
    g.fillStyle(0x49301f);
    g.fillRect(x + 10, y + 18, 8, h + 5);
    g.fillRect(x + w - 18, y + 18, 8, h + 5);
    g.fillStyle(0x4a2d18);
    g.fillRect(x + depth, y + depth, w, 9);
    g.fillStyle(0x3b2417);
    g.fillRect(x + depth + 10, y + depth + 18, 8, h + 12);
    g.fillRect(x + depth + w - 18, y + depth + 18, 8, h + 12);
    g.fillStyle(0x6b4226);
    g.fillRect(x + depth + 25, y + depth + 2, 48, 13);
    g.fillStyle(0xc08a52);
    g.fillRect(x + depth + 45, y + depth + 6, 9, 2);

    // Open notebook and writing lines sit on the desktop.
    const deskOffset = offset => depth * offset / w;
    const bookOffset = deskOffset(82);
    this._fillPoly(g, [[x + 82 + bookOffset, y + 3 + bookOffset], [x + 111 + bookOffset, y + 3 + bookOffset], [x + 116 + bookOffset, y - 3 + bookOffset], [x + 87 + bookOffset, y - 3 + bookOffset]], 0xe8d8b8);
    g.lineStyle(1, 0x8d7a63, 0.9);
    for (let i = 0; i < 3; i++) {
      g.beginPath(); g.moveTo(x + 88 + bookOffset, y - 1 + bookOffset + i * 2); g.lineTo(x + 108 + bookOffset, y - 1 + bookOffset + i * 2); g.strokePath();
    }
    // Small desk lamp and pencil cup make the furniture read as a study desk.
    const lampOffset = deskOffset(146);
    g.fillStyle(0x46301e);
    g.fillRect(x + 146 + lampOffset, y - 12 + lampOffset, 3, 13);
    g.fillRect(x + 141 + lampOffset, y + lampOffset, 14, 3);
    this._fillPoly(g, [[x + 140 + lampOffset, y - 12 + lampOffset], [x + 151 + lampOffset, y - 12 + lampOffset], [x + 155 + lampOffset, y - 6 + lampOffset], [x + 137 + lampOffset, y - 6 + lampOffset]], 0xf0c86a);
    g.fillStyle(0x50301f);
    const cupOffset = deskOffset(w - 28);
    g.fillRect(x + w - 28 + cupOffset, y - 9 + cupOffset, 12, 10);
    g.fillStyle(0xf6d860);
    g.fillRect(x + w - 25 + cupOffset, y - 16 + cupOffset, 3, 9);
    g.fillRect(x + w - 19 + cupOffset, y - 14 + cupOffset, 3, 7);
  }

  _drawSmallShelfRow(g, x, y) {
    const sw = 48;
    const sh = 48;
    const depth = 10;
    const rowW = sw * 3;
    // Draw the side faces and top of a cuboid. Its front face shifts down/right
    // by `depth`; the three shelf openings on that face remain square.
    this._fillPoly(g, [
      [x, y], [x + depth, y + depth],
      [x + depth, y + depth + sh], [x, y + sh],
    ], PAL.shelfSide);
    this._fillPoly(g, [
      [x + rowW, y], [x + rowW + depth, y + depth],
      [x + rowW + depth, y + depth + sh], [x + rowW, y + sh],
    ], PAL.shelfSide);
    this._fillPoly(g, [
      [x, y], [x + rowW, y],
      [x + rowW + depth, y + depth], [x + depth, y + depth],
    ], PAL.shelfTop);
    // Crisp wooden edges make the top plane and cube silhouette read clearly.
    g.lineStyle(3, PAL.shelfWood, 1);
    g.beginPath();
    g.moveTo(x, y); g.lineTo(x + rowW, y);
    g.lineTo(x + rowW + depth, y + depth); g.lineTo(x + depth, y + depth);
    g.lineTo(x, y); g.strokePath();
    g.beginPath();
    g.moveTo(x, y); g.lineTo(x, y + sh);
    g.lineTo(x + depth, y + depth + sh); g.strokePath();
    g.beginPath();
    g.moveTo(x + rowW, y); g.lineTo(x + rowW, y + sh);
    g.lineTo(x + rowW + depth, y + depth + sh); g.lineTo(x + rowW + depth, y + depth);
    g.strokePath();
    g.fillStyle(PAL.shelfOpening);
    g.fillRect(x + depth, y + depth, rowW, sh);
    g.lineStyle(3, PAL.shelfWood, 1);
    g.strokeRect(x + depth, y + depth, rowW, sh);
    // Shared divider walls keep the three openings joined as [][][]
    for (let divider = 1; divider < 3; divider++) {
      const dx = x + depth + divider * sw;
      g.lineStyle(4, PAL.shelfWood, 1);
      g.beginPath(); g.moveTo(dx, y + depth); g.lineTo(dx, y + depth + sh); g.strokePath();
    }
    ['A', 'B', 'C'].forEach((label, index) => {
      addText(this, x + depth + index * sw + sw / 2, y + depth + sh + 13, label, {
        fontFamily: '"Press Start 2P", monospace', fontSize: '8px', color: '#c9b8e8',
      }).setOrigin(0.5);
    });
  }

  _drawFloorBookcase(g, x, y, frontW, height) {
    // Side A is the open shelf face; side B is the solid back wall.
    const depthX = 36;
    const depthY = 36;
    const openX = x + depthX;
    const openY = y + depthY;
    const levels = 5;
    const levelH = height / levels;

    // The diagonal left plane contains the actual empty openings (A).
    this._fillPoly(g, [
      [x, y], [openX, openY], [openX, openY + height], [x, y + height],
    ], PAL.shelfSide);
    for (let level = 0; level < levels; level++) {
      const sideTop = y + level * levelH;
      const sideBottom = y + (level + 1) * levelH;
      const frontTop = openY + level * levelH;
      const frontBottom = openY + (level + 1) * levelH;
      this._fillPoly(g, [
        [x + 2, sideTop + 2], [openX - 2, frontTop + 2],
        [openX - 2, frontBottom - 2], [x + 2, sideBottom - 2],
      ], PAL.shelfOpening);
    }

    // The rectangular right plane is a solid wall (B), not another opening.
    this._fillPoly(g, [
      [openX, openY], [openX + frontW, openY],
      [openX + frontW, openY + height], [openX, openY + height],
    ], PAL.shelfSide);

    // A single flat-color plank bridges the back edge to the front edge.
    this._fillPoly(g, [
      [x, y], [x + frontW, y],
      [openX + frontW, openY], [openX, openY],
    ], PAL.shelfTop);

    // Wood rails separate the five open bays on side A; B stays a plain wall.
    g.lineStyle(4, 0x8a5a31, 1);
    g.beginPath(); g.moveTo(x, y); g.lineTo(openX, openY); g.strokePath();
    g.beginPath(); g.moveTo(x, y + height); g.lineTo(openX, openY + height); g.strokePath();
    for (let level = 1; level < levels; level++) {
      const sideY = y + level * levelH;
      const frontY = openY + level * levelH;
      g.beginPath(); g.moveTo(x, sideY); g.lineTo(openX, frontY); g.strokePath();
    }
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
    addText(this, x + 18, y + 44, 'BAG  5×7', {
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
    // Keep the right panel under one scroll transform and mask. Fixed child
    // container order guarantees sprites cannot cover grid lines or names.
    this._contentContainer = this.add.container(0, 0);
    this._contentContainer.setDepth(10);
    this._gridLayer = this.add.container(0, 0);
    this._itemLayer = this.add.container(0, 0);
    this._gridOverlayLayer = this.add.container(0, 0);
    this._itemLabelLayer = this.add.container(0, 0);
    this._contentContainer.add(this._gridLayer);
    this._contentContainer.add(this._itemLayer);
    this._contentContainer.add(this._gridOverlayLayer);
    this._contentContainer.add(this._itemLabelLayer);

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
    this._gridLayer.add(divLine);

    yOffset += 10;

    // Keep all three small shelves visible together in a single row.
    const shelfRowY = yOffset;
    SHELF_DEFS.forEach((sdef, index) => {
      if (sdef.id === 'big_shelf') return;
      this._addGridView({
        id: sdef.id,
        cols: sdef.cols,
        rows: sdef.rows,
        label: sdef.label,
        color: PAL.shelfWood,
        xOff: 10 + index * 122,
        yOff: shelfRowY,
        isShelf: true,
      });
    });
    yOffset = shelfRowY + 24 + GRID.CELL * 3 + 22;

    // The floor-standing shelf has its own taller grid beneath the small row.
    const bigShelf = SHELF_DEFS.find(sdef => sdef.id === 'big_shelf');
    if (bigShelf) {
      yOffset = this._addGridView({
        id: bigShelf.id,
        cols: bigShelf.cols,
        rows: bigShelf.rows,
        label: bigShelf.label,
        color: PAL.shelfWood,
        xOff: 10,
        yOff: yOffset,
        isShelf: true,
      });
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
    this._gridLayer.add(lbg);

    const labelText = addText(this, RIGHT_X + xOff + 4, SCROLL_Y + yOff + 5, label, {
      fontFamily: '"Press Start 2P", monospace',
      fontSize: '7px',
      color: '#f9e4b7',
    });
    this._gridLayer.add(labelText);

    yOff += 24;

    // Grid background
    const gbg = this.add.graphics();
    gbg.fillStyle(PAL.gridBg);
    gbg.fillRect(RIGHT_X + xOff - 1, SCROLL_Y + yOff - 1, gw + 2, gh + 2);
    gbg.lineStyle(2, color, 0.7);
    gbg.strokeRect(RIGHT_X + xOff - 2, SCROLL_Y + yOff - 2, gw + 4, gh + 4);
    this._gridLayer.add(gbg);

    // Draw normal grid lines in a dedicated layer above every item sprite.
    const gg = this.add.graphics();
    // Use a solid, high-contrast stroke so it remains legible over sprites and
    // after the game canvas is scaled to fit the browser window.
    gg.lineStyle(2, PAL.gridLine, 1);
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
    this._gridOverlayLayer.add(gg);

    // The big shelf has physical dividers after each pair of rows.
    if (id === 'big_shelf') {
      const dividers = this.add.graphics();
      dividers.lineStyle(4, PAL.shelfWood, 1);
      for (let row = 2; row < rows; row += 2) {
        const dividerY = SCROLL_Y + yOff + row * CELL;
        dividers.beginPath();
        dividers.moveTo(RIGHT_X + xOff, dividerY);
        dividers.lineTo(RIGHT_X + xOff + gw, dividerY);
        dividers.strokePath();
      }
      this._gridOverlayLayer.add(dividers);
    }

    // Invisible interactive zone for the grid
    const zone = this.add.zone(
      RIGHT_X + xOff, SCROLL_Y + yOff, gw, gh
    ).setOrigin(0).setInteractive();
    this._gridLayer.add(zone);

    // Register grid view
    const view = {
      id, cols, rows, label, isShelf,
      x: RIGHT_X + xOff,
      y: SCROLL_Y + yOff,
      _baseY: SCROLL_Y + yOff,
      grid: isShelf ? GameState.shelves[id].grid : GameState.bagGrid,
      items: isShelf ? GameState.shelves[id].items : GameState.bagItems,
      gfx: this._gridLayer.add(this.add.graphics()),
      zone,
    };
    this._gridViews.push(view);

    // Zone events
    zone.on('pointermove', (ptr) => {
      if (this._drag) this._onGridHover(view, ptr);
    });

    return yOff + gh + 14;
  }

  _addItemTray() {
    const trayX = 10;
    // Taller tray overlays the lower edge of the room, as requested.
    const trayY = this.scale.height - 142;
    const trayW = RIGHT_X - 30;
    const trayH = 110;

    // Label
    addText(this, trayX, trayY, 'ITEMS (drag to place)', {
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
      this._renderItem(item.instanceId, item.itemKey, 'bag', item.originX, item.originY, item.rotation || 0);
    }
    // Place shelf items
    for (const sdef of SHELF_DEFS) {
      for (const item of GameState.shelves[sdef.id].items) {
        this._renderItem(item.instanceId, item.itemKey, sdef.id, item.originX, item.originY, item.rotation || 0);
      }
    }
    // Floating items → render in tray
    this._layoutTray();
    this._drawRoomShelfItems();
  }

  _drawRoomShelfItems() {
    const gfx = this._roomShelfItemsGfx;
    if (!gfx) return;
    gfx.clear();

    // Each wall cubby is 48px square and represents a 3x3 shelf grid.
    const cellSize = 16;
    const faceX = 24 + 10;
    const faceY = 165 + 10;
    for (let shelfIndex = 0; shelfIndex < 3; shelfIndex++) {
      const shelfId = `shelf_${String.fromCharCode(97 + shelfIndex)}`;
      const shelf = GameState.shelves[shelfId];
      if (!shelf) continue;
      const shelfX = faceX + shelfIndex * 48;

      for (const item of shelf.items) {
        const def = ITEM_DEFS[item.itemKey];
        if (!def) continue;
        for (const [dc, dr] of getItemShape(item.itemKey, item.rotation || 0)) {
          const cellX = shelfX + (item.originX + dc) * cellSize;
          const cellY = faceY + (item.originY + dr) * cellSize;
          const inset = 1;
          const size = cellSize - inset * 2;
          gfx.fillStyle(def.color, 1);
          gfx.fillRect(cellX + inset, cellY + inset, size, size);
          gfx.fillStyle(0xffffff, 0.25);
          gfx.fillRect(cellX + inset, cellY + inset, size, 2);
          gfx.fillStyle(0x000000, 0.2);
          gfx.fillRect(cellX + inset, cellY + cellSize - 3, size, 2);
        }
      }
    }

    // The big shelf's A face is the diagonal plane from (184,155) to (220,191).
    // Project its 8x10 cells onto that plane so occupied cells keep the same
    // orientation as the right-side grid while following the shelf depth.
    const bigShelf = GameState.shelves.big_shelf;
    if (!bigShelf) return;
    const cols = 8;
    const rows = 10;
    const backX = 184;
    const backY = 155;
    const depthX = 36;
    const depthY = 36;
    const shelfHeight = 207;
    const colStepX = depthX / cols;
    const colStepY = depthY / cols;
    const rowStepY = shelfHeight / rows;

    for (const item of bigShelf.items) {
      const def = ITEM_DEFS[item.itemKey];
      if (!def) continue;
      for (const [dc, dr] of getItemShape(item.itemKey, item.rotation || 0)) {
        const col = item.originX + dc;
        const row = item.originY + dr;
        const points = [
          [backX + col * colStepX + 0.25, backY + col * colStepY + row * rowStepY + 0.5],
          [backX + (col + 1) * colStepX - 0.25, backY + (col + 1) * colStepY + row * rowStepY + 0.5],
          [backX + (col + 1) * colStepX - 0.25, backY + (col + 1) * colStepY + (row + 1) * rowStepY - 0.5],
          [backX + col * colStepX + 0.25, backY + col * colStepY + (row + 1) * rowStepY - 0.5],
        ];
        this._fillPoly(gfx, points, def.color);
      }
    }
  }

  _layoutTray() {
    this._hoveredItemId = null;
    if (this._tooltipBg) this._hideTooltip();
    // Pending items from events
    for (const pi of GameState.pendingItems) {
      if (!GameState.floatingItems.some(i => i.instanceId === pi.instanceId)) {
        GameState.floatingItems.push(pi);
      }
    }
    GameState.pendingItems = [];
    const gap = 4;
    const rowGap = 3;
    // A dragged item stays in game state as a floating item until placement
    // succeeds. Keep it out of the tray drawing while its drag ghost is active.
    const entries = GameState.floatingItems
      .filter(item => item.instanceId !== this._drag?.instanceId)
      .map(item => {
        const def = ITEM_DEFS[item.itemKey];
        if (!def) return null;
        const shape = getItemShape(item.itemKey, item.rotation || 0);
        return {
          item,
          cols: Math.max(...shape.map(([col]) => col + 1)),
          rows: Math.max(...shape.map(([, row]) => row + 1)),
          labelWidth: Math.min(Math.max(28, def.name.length * 4.2), this._trayW * 0.46),
        };
      }).filter(Boolean);

    // Wrap tray items onto additional rows instead of shrinking them past
    // readability or letting items run outside the tray when the designer
    // adds more starting items.
    const layoutRows = cellScale => {
      const rows = [];
      for (const entry of entries) {
        const width = entry.cols * CELL * cellScale + 3 + entry.labelWidth;
        let row = rows[rows.length - 1];
        if (!row || (row.items.length && row.width + gap + width > this._trayW - 8)) {
          row = { items: [], width: 0, height: 0 };
          rows.push(row);
        }
        if (row.items.length) row.width += gap;
        row.items.push({ entry, width });
        row.width += width;
        row.height = Math.max(row.height, entry.rows * CELL * cellScale);
      }
      return rows;
    };
    let cellScale = 0.3;
    let rows = layoutRows(cellScale);
    while (cellScale > 0.05 && rows.reduce((height, row) => height + row.height, 0) + rowGap * Math.max(0, rows.length - 1) > this._trayH - 8) {
      cellScale = Math.max(0.05, cellScale - 0.01);
      rows = layoutRows(cellScale);
    }

    const totalHeight = rows.reduce((height, row) => height + row.height, 0) + rowGap * Math.max(0, rows.length - 1);
    let y = this._trayY + Math.max(4, (this._trayH - totalHeight) / 2);
    for (const row of rows) {
      let x = this._trayX + 4;
      for (const { entry } of row.items) {
      const fi = entry.item;
      const existing = this._allItems[fi.instanceId];
      existing?.gfx?.destroy();
      existing?.sprite?.destroy();
      existing?.label?.destroy();
      delete this._allItems[fi.instanceId];
      const width = entry.cols * CELL * cellScale;
      const height = entry.rows * CELL * cellScale;
      const itemY = y + (row.height - height) / 2;
      this._renderFloatingItem(fi.instanceId, fi.itemKey, x, itemY, cellScale, width, height, entry.labelWidth, fi.rotation || 0);
      x += width + 3 + entry.labelWidth + gap;
      }
      y += row.height + rowGap;
    }
  }

  _renderItem(instanceId, itemKey, gridId, originX, originY, rotation = 0) {
    const view = this._getView(gridId);
    if (!view) return;
    const gfx = this.add.graphics();
    this._itemLayer.add(gfx);
    const bounds = this._getItemLocalBounds({ itemKey, gridId, originX, originY, rotation });
    this._drawItemOnGrid(gfx, itemKey, bounds.x, bounds.y, 1, rotation);
    const sprite = this._createItemSprite(itemKey, bounds.x, bounds.y, 1, rotation);
    if (sprite) this._itemLayer.add(sprite);
    const label = this._addItemNameLabel(itemKey, bounds, this._itemLabelLayer);
    this._allItems[instanceId] = { itemKey, gridId, originX, originY, rotation, gfx, sprite, label };
  }

  _renderFloatingItem(instanceId, itemKey, px, py, cellScale, width, height, labelWidth, rotation = 0) {
    const gfx = this.add.graphics().setDepth(25);
    this._drawItemOnGrid(gfx, itemKey, px, py, cellScale, rotation);
    const sprite = this._createItemSprite(itemKey, px, py, cellScale, rotation);
    const label = addText(this, px + width + 3, py + height / 2, ITEM_DEFS[itemKey].name, {
      fontFamily: '"Nunito", sans-serif',
      fontSize: '8px',
      color: '#ffffff',
      align: 'left',
      backgroundColor: '#1a0a2e',
      padding: { x: 1, y: 1 },
      wordWrap: { width: labelWidth },
    }).setOrigin(0, 0.5).setDepth(26);
    this._allItems[instanceId] = {
      itemKey, gridId: null, pileX: px, pileY: py, trayScale: cellScale, rotation, sprite,
      pileWidth: width, pileHeight: height, gfx, label,
    };
  }

  _createItemSprite(itemKey, baseX, baseY, scale = 1, rotation = 0) {
    const definition = ITEM_DEFS[itemKey];
    const sourceKey = `item-sprite-${itemKey}`;
    if (!definition?.sprite || !this.textures.exists(sourceKey)) return null;

    const turns = ((rotation % 4) + 4) % 4;
    const textureKey = `item-footprint-${encodeURIComponent(itemKey)}-${turns}`;
    if (!this.textures.exists(textureKey)) {
      const source = this.textures.get(sourceKey).getSourceImage();
      const originalShape = getItemShape(itemKey, 0);
      const originalWidth = Math.max(...originalShape.map(([col]) => col + 1)) * CELL;
      const originalHeight = Math.max(...originalShape.map(([, row]) => row + 1)) * CELL;
      let canvas = document.createElement('canvas');
      canvas.width = originalWidth;
      canvas.height = originalHeight;
      let context = canvas.getContext('2d');
      context.save();
      context.beginPath();
      for (const [col, row] of originalShape) context.rect(col * CELL, row * CELL, CELL, CELL);
      context.clip();
      const fit = Math.min(originalWidth / source.width, originalHeight / source.height);
      const drawWidth = source.width * fit;
      const drawHeight = source.height * fit;
      context.imageSmoothingEnabled = false;
      context.drawImage(source, (originalWidth - drawWidth) / 2, (originalHeight - drawHeight) / 2, drawWidth, drawHeight);
      context.restore();

      for (let turn = 0; turn < turns; turn++) {
        const rotated = document.createElement('canvas');
        rotated.width = canvas.height;
        rotated.height = canvas.width;
        const rotatedContext = rotated.getContext('2d');
        rotatedContext.translate(rotated.width, 0);
        rotatedContext.rotate(Math.PI / 2);
        rotatedContext.drawImage(canvas, 0, 0);
        canvas = rotated;
      }
      this.textures.addCanvas(textureKey, canvas).refresh();
    }

    const shape = getItemShape(itemKey, rotation);
    const width = Math.max(...shape.map(([col]) => col + 1)) * CELL * scale;
    const height = Math.max(...shape.map(([, row]) => row + 1)) * CELL * scale;
    return this.add.image(baseX + width / 2, baseY + height / 2, textureKey)
      .setDisplaySize(width, height)
      .setDepth(26);
  }

  _getItemBounds(info) {
    if (!info.gridId) {
      return {
        x: info.pileX,
        y: info.pileY,
        width: info.pileWidth,
        height: info.pileHeight,
      };
    }
    const view = this._getView(info.gridId);
    const shape = getItemShape(info.itemKey, info.rotation || 0);
    return {
      x: view.x + info.originX * CELL,
      y: view._baseY + info.originY * CELL - this._scrollY,
      width: Math.max(...shape.map(([col]) => col + 1)) * CELL,
      height: Math.max(...shape.map(([, row]) => row + 1)) * CELL,
    };
  }

  _addItemNameLabel(itemKey, bounds, container = null) {
    const label = addText(this, bounds.x + bounds.width / 2, bounds.y + bounds.height / 2, ITEM_DEFS[itemKey].name, {
      fontFamily: '"Nunito", sans-serif',
      fontSize: '9px',
      color: '#ffffff',
      align: 'center',
      padding: { x: 2, y: 1 },
      stroke: '#1a0a2e',
      strokeThickness: 3,
      wordWrap: { width: Math.max(36, bounds.width - 4) },
    }).setOrigin(0.5);
    if (container) container.add(label);
    return label;
  }

  _getItemLocalBounds(info) {
    const view = this._getView(info.gridId);
    const shape = getItemShape(info.itemKey, info.rotation || 0);
    return {
      x: view.x + info.originX * CELL,
      y: view._baseY + info.originY * CELL,
      width: Math.max(...shape.map(([col]) => col + 1)) * CELL,
      height: Math.max(...shape.map(([, row]) => row + 1)) * CELL,
    };
  }

  // ─────────────────────────────────────────────────────────────
  // DRAWING HELPERS
  // ─────────────────────────────────────────────────────────────
  _drawItemOnGrid(gfx, itemKey, baseX, baseY, scale = 1, rotation = 0) {
    const def = ITEM_DEFS[itemKey];
    if (!def) return;
    gfx.clear();
    for (const [dc, dr] of getItemShape(itemKey, rotation)) {
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

  _drawItemGhost(gfx, itemKey, baseX, baseY, valid, rotation = 0) {
    const def = ITEM_DEFS[itemKey];
    if (!def) return;
    gfx.clear();
    const col = valid ? PAL.gridGood : PAL.gridBad;
    for (const [dc, dr] of getItemShape(itemKey, rotation)) {
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
  _pickUpItem(instanceId, itemKey, gridId, originX, originY, ptr, rotation = 0) {
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
    this._allItems[instanceId]?.sprite?.destroy();
    this._allItems[instanceId]?.label?.destroy();
    delete this._allItems[instanceId];
    this._drawRoomShelfItems();

    // Pointer offset: which cell of item are we holding?
    const localX = ptr.x - (view ? view.x + originX * CELL : ptr.x);
    const localY = ptr.y - (view ? view.y + originY * CELL : ptr.y);
    const pointerOffsetCol = Math.floor(localX / CELL);
    const pointerOffsetRow = Math.floor(localY / CELL);

    this._drag = {
      instanceId, itemKey,
      originGrid: gridId,
      originX, originY,
      rotation,
      pointerOffsetCol: Math.max(0, pointerOffsetCol),
      pointerOffsetRow: Math.max(0, pointerOffsetRow),
    };
    // Preserve a recoverable copy in state throughout the drag. If pointer-up
    // is missed or this scene shuts down, the next inventory screen can put
    // the item back in the tray instead of losing it.
    if (!GameState.floatingItems.some(item => item.instanceId === instanceId)) {
      GameState.floatingItems.push({ instanceId, itemKey, rotation });
    }
  }

  _pickUpFloating(instanceId, itemKey, ptr, rotation = 0) {
    const info = this._allItems[instanceId];
    this._allItems[instanceId]?.gfx?.destroy();
    this._allItems[instanceId]?.sprite?.destroy();
    this._allItems[instanceId]?.label?.destroy();
    delete this._allItems[instanceId];

    const cellScale = info?.trayScale || 1;
    this._drag = {
      instanceId, itemKey,
      originGrid: null,
      rotation,
      originX: 0, originY: 0,
      pointerOffsetCol: info ? Math.floor((ptr.x - info.pileX) / (CELL * cellScale)) : 0,
      pointerOffsetRow: info ? Math.floor((ptr.y - info.pileY) / (CELL * cellScale)) : 0,
    };
    // Keep the item in floatingItems as a recovery copy; _layoutTray skips
    // the active drag while closing the gap and rebuilding hit targets.
    this._layoutTray();
  }

  _onScenePointerDown(ptr) {
    if (ptr.button === 2 || ptr.event?.button === 2) {
      if (this._drag) this._rotateDraggedItem(ptr);
      return;
    }
    if (this._drag) return;
    const entries = Object.entries(this._allItems);
    for (let i = entries.length - 1; i >= 0; i--) {
      const [instanceId, info] = entries[i];
      const bounds = this._getItemBounds(info);
      if (ptr.x < bounds.x || ptr.x >= bounds.x + bounds.width ||
        ptr.y < bounds.y || ptr.y >= bounds.y + bounds.height) continue;
      if (info.gridId) {
        this._pickUpItem(instanceId, info.itemKey, info.gridId, info.originX, info.originY, ptr, info.rotation || 0);
      } else {
        this._pickUpFloating(instanceId, info.itemKey, ptr, info.rotation || 0);
      }
      return;
    }
  }

  _rotateDraggedItem(ptr) {
    const drag = this._drag;
    if (!drag) return;
    const shape = getItemShape(drag.itemKey, drag.rotation || 0);
    const cols = Math.max(...shape.map(([col]) => col + 1));
    const oldCol = drag.pointerOffsetCol;
    const oldRow = drag.pointerOffsetRow;
    drag.pointerOffsetCol = oldRow;
    drag.pointerOffsetRow = cols - 1 - oldCol;
    drag.rotation = ((drag.rotation || 0) + 1) % 4;
    this._onPointerMove(ptr);
  }

  _canPlaceInView(view, itemKey, col, row, excludeInstanceId = null, rotation = 0) {
    if (!canPlace(view.grid, view.cols, view.rows, itemKey, col, row, excludeInstanceId, rotation)) {
      return false;
    }
    if (view.id !== 'big_shelf') return true;

    // Treat each pair of big-shelf rows as a separate compartment.
    const rowBands = new Set(
      getOccupiedCells(itemKey, col, row, rotation).map(cell => Math.floor(cell.row / 2))
    );
    return rowBands.size === 1;
  }

  _onPointerMove(ptr) {
    if (!this._drag) {
      this._hoverGfx.clear();
      this._updateItemTooltip(ptr);
      return;
    }
    this._hideTooltip();
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
      valid = this._canPlaceInView(view, this._drag.itemKey, col, row, this._drag.instanceId, this._drag.rotation);
      const cells = getOccupiedCells(this._drag.itemKey, col, row, this._drag.rotation);
      this._highlightCells(view, cells, valid ? PAL.gridGood : PAL.gridBad);
    }

    this._drawItemGhost(this._ghostGfx, this._drag.itemKey, gx, gy, valid || !view, this._drag.rotation);
  }

  _updateItemTooltip(ptr) {
    let hovered = null;
    const entries = Object.entries(this._allItems);
    for (let i = entries.length - 1; i >= 0; i--) {
      const [instanceId, info] = entries[i];
      const bounds = this._getItemBounds(info);
      if (ptr.x >= bounds.x && ptr.x < bounds.x + bounds.width &&
        ptr.y >= bounds.y && ptr.y < bounds.y + bounds.height) {
        hovered = { instanceId, info };
        break;
      }
    }

    if (!hovered) {
      this._hoveredItemId = null;
      this._hideTooltip();
    } else if (this._hoveredItemId !== hovered.instanceId) {
      this._hoveredItemId = hovered.instanceId;
      this._showTooltip(hovered.info.itemKey, hovered.info.gfx);
    }
  }

  _onGridHover(view, ptr) {
    // handled in _onPointerMove
  }

  _onTrayPointerDown(ptr) {
    if (ptr.button === 2 || ptr.event?.button === 2) return;
    if (this._drag) {
      // Drop back to tray (floating)
      const drag = this._drag;
      this._drag = null;
      this._ghostGfx.clear();
      this._hoverGfx.clear();
      this._removeInstanceFromLocations(drag.instanceId);
      GameState.floatingItems.push({ instanceId: drag.instanceId, itemKey: drag.itemKey, rotation: drag.rotation || 0 });
      this._layoutTray();
    }
  }

  _onPointerUp(ptr) {
    if (ptr.button === 2 || ptr.event?.button === 2) return;
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
      this._removeInstanceFromLocations(drag.instanceId);
      GameState.floatingItems.push({ instanceId: drag.instanceId, itemKey: drag.itemKey, rotation: drag.rotation || 0 });
      this._layoutTray();
      return;
    }

    // Otherwise snap back to origin
    this._snapBack();
  }

  _tryPlace(view, col, row) {
    const drag = this._drag;
    if (!drag) return false;
    if (!this._canPlaceInView(view, drag.itemKey, col, row, drag.instanceId, drag.rotation)) return false;

    this._removeInstanceFromLocations(drag.instanceId);
    placeItem(view.grid, view.cols, drag.itemKey, col, row, drag.instanceId, drag.rotation);
    view.items.push({ instanceId: drag.instanceId, itemKey: drag.itemKey, originX: col, originY: row, rotation: drag.rotation || 0 });

    this._drag = null;
    this._ghostGfx.clear();
    this._hoverGfx.clear();
    this._renderItem(drag.instanceId, drag.itemKey, view.id, col, row, drag.rotation || 0);
    this._drawRoomShelfItems();
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
      if (view && this._canPlaceInView(view, drag.itemKey, drag.originX, drag.originY, drag.instanceId, drag.rotation)) {
        this._removeInstanceFromLocations(drag.instanceId);
        placeItem(view.grid, view.cols, drag.itemKey, drag.originX, drag.originY, drag.instanceId, drag.rotation);
        view.items.push({ instanceId: drag.instanceId, itemKey: drag.itemKey, originX: drag.originX, originY: drag.originY, rotation: drag.rotation || 0 });
        this._renderItem(drag.instanceId, drag.itemKey, view.id, drag.originX, drag.originY, drag.rotation || 0);
        this._drawRoomShelfItems();
        return;
      }
    }
    // Fall back: put in floating tray
    this._removeInstanceFromLocations(drag.instanceId);
    GameState.floatingItems.push({ instanceId: drag.instanceId, itemKey: drag.itemKey, rotation: drag.rotation || 0 });
    this._layoutTray();
  }

  _removeInstanceFromLocations(instanceId) {
    for (const view of this._gridViews) {
      removeItem(view.grid, view.cols, instanceId);
      const index = view.items.findIndex(item => item.instanceId === instanceId);
      if (index !== -1) view.items.splice(index, 1);
    }
    GameState.floatingItems = GameState.floatingItems.filter(item => item.instanceId !== instanceId);
    GameState.pendingItems = GameState.pendingItems.filter(item => item.instanceId !== instanceId);
  }

  _scrollBy(dy) {
    this._scrollY = Phaser.Math.Clamp(this._scrollY + dy, 0, this._maxScrollY);
    this._contentContainer.y = -this._scrollY;
    for (const view of this._gridViews) {
      view.y = view._baseY - this._scrollY;
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

    addText(this, btnX + btnW / 2, btnY + 18, '▶  HEAD OUT', {
      fontFamily: '"Press Start 2P", monospace',
      fontSize: '9px',
      color: '#f9e4b7',
    }).setOrigin(0.5).setDepth(151);

  }

  _headOut() {
    if (this._drag) {
      this._showHeadOutWarning('Finish placing or return the item first!');
      return;
    }
    if (GameState.floatingItems.length > 0 || GameState.pendingItems.length > 0) {
      this._showHeadOutWarning('Place all items before heading out!');
      return;
    }

    // Check bag has at least the keys
    const hasKeys = GameState.bagItems.some(i => i.itemKey === 'keys');
    if (!hasKeys) {
      this._showHeadOutWarning("Don't forget your keys!");
      return;
    }
    GameState.phase = 'event';
    this.scene.start('EventScene');
  }

  _showHeadOutWarning(message) {
    const warn = addText(this, this.scale.width / 2, this.scale.height - 80, message, {
      fontFamily: '"Press Start 2P", monospace',
      fontSize: '9px',
      color: '#ff6060',
      backgroundColor: '#1a0a2e',
      padding: { x: 10, y: 6 },
      align: 'center',
    }).setOrigin(0.5).setDepth(200);
    this.tweens.add({ targets: warn, alpha: 0, delay: 1800, duration: 400, onComplete: () => warn.destroy() });
  }

  // ─────────────────────────────────────────────────────────────
  // TOOLTIP
  // ─────────────────────────────────────────────────────────────
  _showTooltip(itemKey, gfx) {
    if (this._drag) return;
    const def = ITEM_DEFS[itemKey];
    if (!def) return;
    this._tooltipTxt.setText(`${def.name}\n${def.description}`);
    const tooltipWidth = Math.min(220, Math.max(150, this._tooltipTxt.width + 12));
    this._tooltipTxt.setWordWrapWidth(tooltipWidth - 12);
    this._tooltipBg.setSize(tooltipWidth, this._tooltipTxt.height + 8);
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
    const notice = addText(this, W / 2, 66,
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
