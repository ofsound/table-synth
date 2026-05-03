import https from "node:https";
import process from "node:process";
import { WebSocketServer, type WebSocket } from "ws";
import { decodeOscMessage } from "../shared/osc";
import {
  DEFAULT_MIDI_CHANNEL,
  DEFAULT_NOTE_DURATION_MS,
  DEFAULT_WS_PORT,
  MIDI_PORT_NAME,
  OSC_HIT_PATH,
  oscArgsToHit
} from "../shared/protocol";
import { loadTlsMaterial } from "./certs";
import { createVirtualMidiOutput } from "./midiOutput";
import { hitToMidiMessages } from "./midiMessages";

const port = Number(process.env.TABLE_SYNTH_WS_PORT || DEFAULT_WS_PORT);
const midiChannel = Number(process.env.TABLE_SYNTH_MIDI_CHANNEL || DEFAULT_MIDI_CHANNEL);
const noteDurationMs = Number(process.env.TABLE_SYNTH_NOTE_DURATION_MS || DEFAULT_NOTE_DURATION_MS);
const midiPortName = process.env.TABLE_SYNTH_MIDI_PORT_NAME || MIDI_PORT_NAME;

function sendJson(socket: WebSocket, message: unknown): void {
  if (socket.readyState === socket.OPEN) {
    socket.send(JSON.stringify(message));
  }
}

function emitHitFromOscBytes(bytes: Uint8Array): void {
  const osc = decodeOscMessage(bytes);
  if (osc.path !== OSC_HIT_PATH) {
    throw new Error(`unsupported OSC path: ${osc.path}`);
  }

  const hit = oscArgsToHit(osc.args);
  if (!hit) {
    throw new Error("invalid OSC hit arguments");
  }

  const midiMessages = hitToMidiMessages(hit, { midiChannel, noteDurationMs });
  midi.sendNoteOn(midiMessages.noteOn);
  setTimeout(() => midi.sendNoteOff(midiMessages.noteOff), midiMessages.noteDurationMs);

  console.log(
    `hit row=${hit.row} col=${hit.col} note=${hit.note} velocity=${hit.velocity} speed=${hit.speed.toFixed(2)}`
  );
}

const tls = loadTlsMaterial();
const midi = createVirtualMidiOutput(midiPortName);
const server = https.createServer({ cert: tls.cert, key: tls.key }, (request, response) => {
  response.setHeader("access-control-allow-origin", "*");
  response.setHeader("access-control-allow-methods", "GET, POST, OPTIONS");
  response.setHeader("access-control-allow-headers", "content-type");

  if (request.method === "OPTIONS") {
    response.writeHead(204);
    response.end();
    return;
  }

  if (request.method === "POST" && request.url === OSC_HIT_PATH) {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      try {
        const buffer = Buffer.concat(chunks);
        emitHitFromOscBytes(new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength));
        response.writeHead(204);
        response.end();
      } catch (error) {
        const message = error instanceof Error ? error.message : "unknown bridge error";
        console.error(message);
        response.writeHead(400, { "content-type": "application/json" });
        response.end(JSON.stringify({ type: "error", message }));
      }
    });
    return;
  }

  response.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
  response.end("Table Synth companion is running.\n");
});
const wss = new WebSocketServer({ server });

wss.on("connection", (socket, request) => {
  console.log(`phone connected from ${request.socket.remoteAddress ?? "unknown"}`);
  sendJson(socket, { type: "ready", midiPort: midi.name, oscPath: OSC_HIT_PATH });

  socket.on("message", (data) => {
    try {
      const bytes =
        data instanceof Buffer
          ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
          : data instanceof ArrayBuffer
            ? new Uint8Array(data)
            : Array.isArray(data)
              ? Buffer.concat(data)
              : null;

      if (!bytes) {
        throw new Error("expected binary OSC message");
      }

      emitHitFromOscBytes(bytes);
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown bridge error";
      console.error(message);
      sendJson(socket, { type: "error", message });
    }
  });

  socket.on("close", () => console.log("phone disconnected"));
});

server.listen(port, "0.0.0.0", () => {
  console.log(`Table Synth companion listening on wss://0.0.0.0:${port}`);
  console.log(`Virtual MIDI output: ${midi.name}`);
  console.log(`TLS cert: ${tls.certPath}`);
  console.log(`TLS key: ${tls.keyPath}`);
});

function shutdown() {
  console.log("shutting down companion");
  wss.close();
  server.close();
  midi.close();
}

process.on("SIGINT", () => {
  shutdown();
  process.exit(0);
});

process.on("SIGTERM", () => {
  shutdown();
  process.exit(0);
});
