import type { CellAddress, GridCell } from "./protocol";
import { clamp, midiNoteName } from "./music";

export const GRID_ROWS = 8;
export const GRID_COLS = 64;
export const VISIBLE_GRID_COLS = 8;
export const DEGREES_PER_GRID_COL = 360 / GRID_COLS;

const C_MINOR_SCALE = [0, 2, 3, 5, 7, 8, 10, 12];

export function createDefaultGrid(rows = GRID_ROWS, cols = GRID_COLS): GridCell[][] {
  return Array.from({ length: rows }, (_, row) =>
    Array.from({ length: cols }, (_, col) => {
      const note = clamp(48 + (rows - 1 - row) * 5 + C_MINOR_SCALE[col % C_MINOR_SCALE.length], 0, 127);

      return {
        enabled: true,
        note,
        label: midiNoteName(note)
      };
    })
  );
}

export function getCellAtPosition(x: number, y: number, rows = GRID_ROWS, cols = VISIBLE_GRID_COLS): CellAddress | null {
  if (x < 0 || x > 1 || y < 0 || y > 1) {
    return null;
  }

  return {
    row: clamp(Math.floor(y * rows), 0, rows - 1),
    col: clamp(Math.floor(x * cols), 0, cols - 1)
  };
}

export function headingToColumnOffset(headingDegrees: number | null, cols = GRID_COLS): number {
  if (headingDegrees === null || !Number.isFinite(headingDegrees)) {
    return 0;
  }

  const normalized = ((headingDegrees % 360) + 360) % 360;
  return Math.floor(normalized / (360 / cols)) % cols;
}

export function visibleColToGridCol(visibleCol: number, offset: number, cols = GRID_COLS): number {
  return (((offset + visibleCol) % cols) + cols) % cols;
}

export function cellKey(cell: CellAddress): string {
  return `${cell.row}:${cell.col}`;
}
