export const OSC_HIT_PATH = "/table-synth/hit";
export const DEFAULT_WS_PORT = 8787;
export const DEFAULT_MIDI_CHANNEL = 1;
export const DEFAULT_NOTE_DURATION_MS = 160;
export const MIDI_PORT_NAME = "Table Synth MIDI";

export type GridCell = {
  enabled: boolean;
  note: number;
  label: string;
};

export type CellAddress = {
  row: number;
  col: number;
};

export type HitPayload = CellAddress & {
  note: number;
  velocity: number;
  x: number;
  y: number;
  speed: number;
};

export type OscMessage = {
  path: string;
  args: Array<number | string>;
};

export function hitToOscArgs(hit: HitPayload): number[] {
  return [hit.note, hit.velocity, hit.row, hit.col, hit.x, hit.y, hit.speed];
}

export function oscArgsToHit(args: Array<number | string>): HitPayload | null {
  if (args.length !== 7 || args.some((arg) => typeof arg !== "number")) {
    return null;
  }

  const [note, velocity, row, col, x, y, speed] = args as number[];
  return { note, velocity, row, col, x, y, speed };
}
