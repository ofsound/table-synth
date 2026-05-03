import type { CellAddress } from "./protocol";
import { cellKey, getCellAtPosition } from "./grid";
import { clamp } from "./music";

export type TiltVector = {
  x: number;
  y: number;
};

export type OrientationSample = {
  beta: number | null;
  gamma: number | null;
};

export function orientationToTilt(sample: OrientationSample, maxDegrees = 28): TiltVector {
  const x = (sample.gamma ?? 0) / maxDegrees;
  const y = (sample.beta ?? 0) / maxDegrees;
  return {
    x: clamp(x, -1, 1),
    y: clamp(y, -1, 1)
  };
}

export function applyCalibration(sample: TiltVector, neutral: TiltVector): TiltVector {
  return {
    x: clamp(sample.x - neutral.x, -1, 1),
    y: clamp(sample.y - neutral.y, -1, 1)
  };
}

export function smoothTilt(previous: TiltVector, next: TiltVector, amount = 0.18): TiltVector {
  return {
    x: previous.x + (next.x - previous.x) * amount,
    y: previous.y + (next.y - previous.y) * amount
  };
}

export function normalizeSpeed(speedPxPerFrame: number, maxSpeedPxPerFrame = 30): number {
  return clamp(speedPxPerFrame / maxSpeedPxPerFrame, 0, 1);
}

export class TriggerTracker {
  private lastCellKey: string | null = null;
  private lastTriggeredByCell = new Map<string, number>();

  constructor(private readonly cooldownMs = 180) {}

  next(cell: CellAddress | null, nowMs: number): CellAddress | null {
    if (!cell) {
      this.lastCellKey = null;
      return null;
    }

    const key = cellKey(cell);
    const isEntry = key !== this.lastCellKey;
    this.lastCellKey = key;

    if (!isEntry) {
      return null;
    }

    const lastTriggered = this.lastTriggeredByCell.get(key) ?? Number.NEGATIVE_INFINITY;
    if (nowMs - lastTriggered < this.cooldownMs) {
      return null;
    }

    this.lastTriggeredByCell.set(key, nowMs);
    return cell;
  }

  reset(): void {
    this.lastCellKey = null;
    this.lastTriggeredByCell.clear();
  }
}

export function lookupTriggerCell(x: number, y: number, nowMs: number, tracker: TriggerTracker): CellAddress | null {
  return tracker.next(getCellAtPosition(x, y), nowMs);
}
