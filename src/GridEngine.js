// ============================================================
// GridEngine.js — Pure logic for grid placement / removal
// ============================================================

import { ITEM_DEFS } from './GameData.js';

/**
 * Returns all cells an item occupies given its top-left position.
 * @param {string} itemKey
 * @param {number} originX  column index (0-based)
 * @param {number} originY  row index (0-based)
 * @returns {Array<{col, row}>}
 */
export function getOccupiedCells(itemKey, originX, originY, rotation = 0) {
  return getItemShape(itemKey, rotation).map(([dc, dr]) => ({ col: originX + dc, row: originY + dr }));
}

/** Return an item's normalized cell shape after clockwise quarter turns. */
export function getItemShape(itemKey, rotation = 0) {
  const def = ITEM_DEFS[itemKey];
  if (!def) return [];
  let shape = def.shape.map(([col, row]) => [col, row]);
  const turns = ((rotation % 4) + 4) % 4;
  for (let turn = 0; turn < turns; turn++) {
    const maxCol = Math.max(...shape.map(([col]) => col));
    shape = shape.map(([col, row]) => [row, maxCol - col]);
    const minCol = Math.min(...shape.map(([col]) => col));
    const minRow = Math.min(...shape.map(([, row]) => row));
    shape = shape.map(([col, row]) => [col - minCol, row - minRow]);
  }
  return shape;
}

/**
 * Check whether an item can be placed at (originX, originY) on a grid.
 * @param {Array} grid     flat array of length cols*rows, null or instanceId
 * @param {number} cols
 * @param {number} rows
 * @param {string} itemKey
 * @param {number} originX
 * @param {number} originY
 * @param {string|null} excludeInstanceId  ignore cells occupied by this id (for moving)
 * @returns {boolean}
 */
export function canPlace(grid, cols, rows, itemKey, originX, originY, excludeInstanceId = null, rotation = 0) {
  const cells = getOccupiedCells(itemKey, originX, originY, rotation);
  for (const { col, row } of cells) {
    if (col < 0 || col >= cols || row < 0 || row >= rows) return false;
    const existing = grid[row * cols + col];
    if (existing !== null && existing !== excludeInstanceId) return false;
  }
  return true;
}

/**
 * Place an item on a grid (mutates the grid array).
 * @param {Array} grid
 * @param {number} cols
 * @param {string} itemKey
 * @param {number} originX
 * @param {number} originY
 * @param {string} instanceId
 */
export function placeItem(grid, cols, itemKey, originX, originY, instanceId, rotation = 0) {
  const cells = getOccupiedCells(itemKey, originX, originY, rotation);
  for (const { col, row } of cells) {
    grid[row * cols + col] = instanceId;
  }
}

/**
 * Remove an item from a grid (mutates the grid array).
 * @param {Array} grid
 * @param {number} cols
 * @param {string} instanceId
 */
export function removeItem(grid, cols, instanceId) {
  for (let i = 0; i < grid.length; i++) {
    if (grid[i] === instanceId) grid[i] = null;
  }
}

/**
 * Given a pixel position relative to a grid container, return the cell (col, row).
 * Returns null if outside.
 */
export function pixelToCell(px, py, cellSize, cols, rows) {
  const col = Math.floor(px / cellSize);
  const row = Math.floor(py / cellSize);
  if (col < 0 || col >= cols || row < 0 || row >= rows) return null;
  return { col, row };
}

/**
 * Snap a pixel position so that a dragged item's origin (top-left cell) lands on a cell.
 * pointerOffsetCol/Row: which cell of the item the pointer is holding.
 */
export function snapOrigin(px, py, cellSize, pointerOffsetCol, pointerOffsetRow) {
  const col = Math.floor(px / cellSize) - pointerOffsetCol;
  const row = Math.floor(py / cellSize) - pointerOffsetRow;
  return { col, row };
}
