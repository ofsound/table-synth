declare module "easymidi" {
  export type NoteMessage = {
    note: number;
    velocity: number;
    channel: number;
  };

  export class Output {
    constructor(name: string, virtual?: boolean);
    send(type: "noteon" | "noteoff", message: NoteMessage): void;
    close(): void;
  }
}
