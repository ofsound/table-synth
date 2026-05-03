import * as easymidi from "easymidi";
import { MIDI_PORT_NAME } from "../shared/protocol";
import type { EasyMidiNoteMessage } from "./midiMessages";

export type MidiOutputPort = {
  name: string;
  sendNoteOn(message: EasyMidiNoteMessage): void;
  sendNoteOff(message: EasyMidiNoteMessage): void;
  close(): void;
};

export function createVirtualMidiOutput(name = MIDI_PORT_NAME): MidiOutputPort {
  if (process.env.TABLE_SYNTH_NO_MIDI === "1") {
    return {
      name: `${name} (disabled)`,
      sendNoteOn: (message) => console.log("[midi disabled] noteon", message),
      sendNoteOff: (message) => console.log("[midi disabled] noteoff", message),
      close: () => undefined
    };
  }

  const output = new easymidi.Output(name, true) as {
    send(type: "noteon" | "noteoff", message: EasyMidiNoteMessage): void;
    close(): void;
  };
  return {
    name,
    sendNoteOn: (message) => output.send("noteon", message),
    sendNoteOff: (message) => output.send("noteoff", message),
    close: () => output.close()
  };
}
