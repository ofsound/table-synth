import { describe, expect, it } from "vitest";
import { decodeOscMessage, encodeOscMessage } from "../src/shared/osc";
import { hitToOscArgs, OSC_HIT_PATH, oscArgsToHit, type HitPayload } from "../src/shared/protocol";

describe("OSC hit protocol", () => {
  it("round trips the hit message as OSC binary", () => {
    const hit: HitPayload = {
      note: 64,
      velocity: 93,
      row: 2,
      col: 5,
      x: 0.42,
      y: 0.73,
      speed: 0.61
    };

    const encoded = encodeOscMessage({ path: OSC_HIT_PATH, args: hitToOscArgs(hit) });
    const decoded = decodeOscMessage(encoded);

    expect(decoded.path).toBe(OSC_HIT_PATH);
    expect(decoded.args.slice(0, 4)).toEqual([64, 93, 2, 5]);
    expect(decoded.args[4]).toBeCloseTo(0.42);
    expect(decoded.args[5]).toBeCloseTo(0.73);
    expect(decoded.args[6]).toBeCloseTo(0.61);
    expect(oscArgsToHit(decoded.args)).toMatchObject({ note: 64, velocity: 93, row: 2, col: 5 });
  });

  it("rejects malformed hit argument lists", () => {
    expect(oscArgsToHit([60, 90])).toBeNull();
    expect(oscArgsToHit([60, "90", 1, 2, 0.1, 0.2, 0.3])).toBeNull();
  });
});
