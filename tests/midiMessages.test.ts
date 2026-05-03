import { describe, expect, it } from "vitest";
import { hitToMidiMessages, toEasyMidiChannel, validateHit } from "../src/companion/midiMessages";
import type { HitPayload } from "../src/shared/protocol";

const hit: HitPayload = {
  note: 60,
  velocity: 100,
  row: 3,
  col: 4,
  x: 0.5,
  y: 0.25,
  speed: 0.8
};

describe("MIDI message conversion", () => {
  it("converts display MIDI channel 1 to easymidi channel 0", () => {
    expect(toEasyMidiChannel(1)).toBe(0);
    expect(toEasyMidiChannel(16)).toBe(15);
  });

  it("creates note on and fixed-delay note off messages", () => {
    const messages = hitToMidiMessages({ ...hit, col: 63 }, { midiChannel: 1, noteDurationMs: 160 });
    expect(messages.noteOn).toEqual({ note: 60, velocity: 100, channel: 0 });
    expect(messages.noteOff).toEqual({ note: 60, velocity: 0, channel: 0 });
    expect(messages.noteDurationMs).toBe(160);
  });

  it("rejects invalid hit values", () => {
    expect(validateHit({ ...hit, note: 128 })).toContain("note");
    expect(validateHit({ ...hit, velocity: 0 })).toContain("velocity");
    expect(validateHit({ ...hit, row: 8 })).toContain("row");
    expect(validateHit({ ...hit, col: 64 })).toContain("col");
    expect(validateHit({ ...hit, speed: 1.2 })).toContain("speed");
  });
});
