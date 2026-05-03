import type { CellAddress, GridCell } from "./protocol";
import { clamp, midiNoteName } from "./music";

export const GRID_ROWS = 8;
export const GRID_COLS = 8;

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

export function getCellAtPosition(x: number, y: number, rows = GRID_ROWS, cols = GRID_COLS): CellAddress | null {
  if (x < 0 || x > 1 || y < 0 || y > 1) {
    return null;
  }

  return {
    row: clamp(Math.floor(y * rows), 0, rows - 1),
    col: clamp(Math.floor(x * cols), 0, cols - 1)
  };
}

export function cellKey(cell: CellAddress): string {
  return `${cell.row}:${cell.col}`;
}
