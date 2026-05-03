import type { OscMessage } from "./protocol";

type OscArg = number | string;

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function pad4(length: number): number {
  return (4 - (length % 4)) % 4;
}

function encodeString(value: string): Uint8Array {
  const encoded = textEncoder.encode(value);
  const bytes = new Uint8Array(encoded.length + 1 + pad4(encoded.length + 1));
  bytes.set(encoded, 0);
  return bytes;
}

function readOscString(view: DataView, offset: number): { value: string; offset: number } {
  let end = offset;
  while (end < view.byteLength && view.getUint8(end) !== 0) {
    end += 1;
  }

  if (end >= view.byteLength) {
    throw new Error("OSC string is missing a null terminator");
  }

  const raw = new Uint8Array(view.buffer, view.byteOffset + offset, end - offset);
  const nextOffset = end + 1 + pad4(end - offset + 1);
  return { value: textDecoder.decode(raw), offset: nextOffset };
}

export function encodeOscMessage(message: OscMessage): ArrayBuffer {
  const typeTags = `,${message.args.map((arg) => (Number.isInteger(arg) ? "i" : typeof arg === "number" ? "f" : "s")).join("")}`;
  const head = [encodeString(message.path), encodeString(typeTags)];
  const argSize = message.args.reduce<number>(
    (size, arg) => size + (typeof arg === "string" ? encodeString(arg).byteLength : 4),
    0
  );
  const totalSize = head.reduce<number>((size, bytes) => size + bytes.byteLength, 0) + argSize;
  const buffer = new ArrayBuffer(totalSize);
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);

  let offset = 0;
  for (const part of head) {
    bytes.set(part, offset);
    offset += part.byteLength;
  }

  for (const arg of message.args) {
    if (typeof arg === "string") {
      const encoded = encodeString(arg);
      bytes.set(encoded, offset);
      offset += encoded.byteLength;
    } else if (Number.isInteger(arg)) {
      view.setInt32(offset, arg, false);
      offset += 4;
    } else {
      view.setFloat32(offset, arg, false);
      offset += 4;
    }
  }

  return buffer;
}

export function decodeOscMessage(data: ArrayBuffer | Uint8Array): OscMessage {
  const buffer = data instanceof Uint8Array ? data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) : data;
  const view = new DataView(buffer);
  const path = readOscString(view, 0);
  const typeTags = readOscString(view, path.offset);

  if (!typeTags.value.startsWith(",")) {
    throw new Error("OSC type tag string must start with a comma");
  }

  let offset = typeTags.offset;
  const args: OscArg[] = [];
  for (const tag of typeTags.value.slice(1)) {
    if (tag === "i") {
      args.push(view.getInt32(offset, false));
      offset += 4;
    } else if (tag === "f") {
      args.push(view.getFloat32(offset, false));
      offset += 4;
    } else if (tag === "s") {
      const value = readOscString(view, offset);
      args.push(value.value);
      offset = value.offset;
    } else {
      throw new Error(`Unsupported OSC type tag: ${tag}`);
    }
  }

  return { path: path.value, args };
}
