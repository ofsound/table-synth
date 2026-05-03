import { describe, expect, it } from "vitest";
import { getCellAtPosition, headingToColumnOffset, visibleColToGridCol } from "../src/shared/grid";
import { applyCalibration, normalizeSpeed, orientationToTilt, smoothTilt, TriggerTracker } from "../src/shared/physics";
import { speedToVelocity } from "../src/shared/music";

describe("physics helpers", () => {
  it("maps device orientation into a clamped table tilt", () => {
    expect(orientationToTilt({ beta: 14, gamma: -28 })).toEqual({ x: -1, y: 0.5 });
    expect(orientationToTilt({ beta: 100, gamma: -100 })).toEqual({ x: -1, y: 1 });
  });

  it("applies neutral calibration offsets", () => {
    expect(applyCalibration({ x: 0.5, y: -0.25 }, { x: 0.25, y: -0.5 })).toEqual({ x: 0.25, y: 0.25 });
  });

  it("smooths tilt values without overshooting", () => {
    expect(smoothTilt({ x: 0, y: 0 }, { x: 1, y: -1 }, 0.25)).toEqual({ x: 0.25, y: -0.25 });
  });

  it("maps normalized position to an 8x8 cell", () => {
    expect(getCellAtPosition(0.01, 0.01)).toEqual({ row: 0, col: 0 });
    expect(getCellAtPosition(0.999, 0.999)).toEqual({ row: 7, col: 7 });
    expect(getCellAtPosition(-0.1, 0.5)).toBeNull();
  });

  it("maps compass heading to the 64-column wrapped viewport", () => {
    expect(headingToColumnOffset(null)).toBe(0);
    expect(headingToColumnOffset(0)).toBe(0);
    expect(headingToColumnOffset(359.9)).toBe(63);
    expect(headingToColumnOffset(360)).toBe(0);
    expect(visibleColToGridCol(7, 60)).toBe(3);
  });

  it("turns speed into MIDI velocity", () => {
    expect(speedToVelocity(0)).toBe(18);
    expect(speedToVelocity(1)).toBe(127);
    expect(speedToVelocity(10)).toBe(127);
  });

  it("normalizes Matter.js ball speed", () => {
    expect(normalizeSpeed(15, 30)).toBe(0.5);
    expect(normalizeSpeed(45, 30)).toBe(1);
  });
});

describe("TriggerTracker", () => {
  it("fires only on cell entry and respects cooldown", () => {
    const tracker = new TriggerTracker(200);
    expect(tracker.next({ row: 1, col: 1 }, 0)).toEqual({ row: 1, col: 1 });
    expect(tracker.next({ row: 1, col: 1 }, 16)).toBeNull();
    expect(tracker.next({ row: 1, col: 2 }, 32)).toEqual({ row: 1, col: 2 });
    expect(tracker.next({ row: 1, col: 1 }, 100)).toBeNull();
    expect(tracker.next({ row: 1, col: 2 }, 250)).toEqual({ row: 1, col: 2 });
  });
});
