const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function midiNoteName(note: number): string {
  const normalized = Math.round(note);
  const octave = Math.floor(normalized / 12) - 1;
  return `${NOTE_NAMES[((normalized % 12) + 12) % 12]}${octave}`;
}

export function speedToVelocity(speed: number, minVelocity = 18, maxVelocity = 127): number {
  const shaped = Math.sqrt(clamp(speed, 0, 1));
  return Math.round(minVelocity + shaped * (maxVelocity - minVelocity));
}

export function isValidMidiNote(note: number): boolean {
  return Number.isInteger(note) && note >= 0 && note <= 127;
}

export function isValidMidiVelocity(velocity: number): boolean {
  return Number.isInteger(velocity) && velocity >= 1 && velocity <= 127;
}
