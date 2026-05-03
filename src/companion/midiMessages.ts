import type { HitPayload } from "../shared/protocol";
import { isValidMidiNote, isValidMidiVelocity } from "../shared/music";
import { GRID_COLS, GRID_ROWS } from "../shared/grid";

export type EasyMidiNoteMessage = {
  note: number;
  velocity: number;
  channel: number;
};

export type MidiHitConfig = {
  midiChannel: number;
  noteDurationMs: number;
};

export function validateHit(hit: HitPayload): string | null {
  if (!isValidMidiNote(hit.note)) return "note must be an integer from 0 to 127";
  if (!isValidMidiVelocity(hit.velocity)) return "velocity must be an integer from 1 to 127";
  if (!Number.isInteger(hit.row) || hit.row < 0 || hit.row >= GRID_ROWS) return `row must be an integer from 0 to ${GRID_ROWS - 1}`;
  if (!Number.isInteger(hit.col) || hit.col < 0 || hit.col >= GRID_COLS) return `col must be an integer from 0 to ${GRID_COLS - 1}`;
  if (!Number.isFinite(hit.x) || hit.x < 0 || hit.x > 1) return "x must be a normalized number";
  if (!Number.isFinite(hit.y) || hit.y < 0 || hit.y > 1) return "y must be a normalized number";
  if (!Number.isFinite(hit.speed) || hit.speed < 0 || hit.speed > 1) return "speed must be a normalized number";
  return null;
}

export function toEasyMidiChannel(displayChannel: number): number {
  if (!Number.isInteger(displayChannel) || displayChannel < 1 || displayChannel > 16) {
    throw new Error("MIDI channel must be an integer from 1 to 16");
  }

  return displayChannel - 1;
}

export function hitToMidiMessages(hit: HitPayload, config: MidiHitConfig) {
  const validationError = validateHit(hit);
  if (validationError) {
    throw new Error(validationError);
  }

  const channel = toEasyMidiChannel(config.midiChannel);
  const noteOn: EasyMidiNoteMessage = {
    note: hit.note,
    velocity: hit.velocity,
    channel
  };
  const noteOff: EasyMidiNoteMessage = {
    note: hit.note,
    velocity: 0,
    channel
  };

  return {
    noteOn,
    noteOff,
    noteDurationMs: config.noteDurationMs
  };
}
