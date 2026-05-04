import type { CellAddress, GridCell } from "./protocol";
import { clamp, midiNoteName } from "./music";

export const CIRCULAR_RINGS = 4;
export const CIRCULAR_SECTORS = 8;
export const CIRCULAR_DEAD_RADIUS = 0.25;

const C_MINOR_SCALE = [0, 2, 3, 5, 7, 8, 10, 12];

export function createDefaultCircularGrid(rows = CIRCULAR_RINGS, cols = CIRCULAR_SECTORS): GridCell[][] {
  return Array.from({ length: rows }, (_, row) =>
    Array.from({ length: cols }, (_, col) => {
      const note = clamp(48 + row * 5 + C_MINOR_SCALE[col % C_MINOR_SCALE.length], 0, 127);

      return {
        enabled: true,
        note,
        label: midiNoteName(note)
      };
    })
  );
}

export function getCircularCellAtPosition(
  x: number,
  y: number,
  rows = CIRCULAR_RINGS,
  cols = CIRCULAR_SECTORS,
  deadRadius = CIRCULAR_DEAD_RADIUS
): CellAddress | null {
  if (x < 0 || x > 1 || y < 0 || y > 1) {
    return null;
  }

  const dx = (x - 0.5) * 2;
  const dy = (y - 0.5) * 2;
  const radius = Math.hypot(dx, dy);

  if (radius <= deadRadius || radius > 1) {
    return null;
  }

  const angle = (Math.atan2(dx, -dy) + Math.PI * 2) % (Math.PI * 2);
  const ringProgress = (radius - deadRadius) / (1 - deadRadius);

  return {
    row: clamp(Math.floor(ringProgress * rows), 0, rows - 1),
    col: clamp(Math.floor((angle / (Math.PI * 2)) * cols), 0, cols - 1)
  };
}
