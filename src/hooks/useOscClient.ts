import { useCallback, useEffect, useRef, useState } from "react";
import { encodeOscMessage } from "../shared/osc";
import { hitToOscArgs, OSC_HIT_PATH, type HitPayload } from "../shared/protocol";

type ConnectionState = "idle" | "connecting" | "connected" | "error" | "closed";
type TransportMode = "websocket" | "http";
type BridgeMessage = {
  type?: string;
  midiPort?: string;
  oscPath?: string;
  message?: string;
};

function bridgeHealthUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    parsed.protocol = parsed.protocol === "wss:" ? "https:" : "http:";
    parsed.pathname = "/";
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return null;
  }
}

function bridgePostUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    parsed.protocol = parsed.protocol === "wss:" ? "https:" : "http:";
    parsed.pathname = "/table-synth/hit";
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return null;
  }
}

export function useOscClient(url: string) {
  const socketRef = useRef<WebSocket | null>(null);
  const connectionIdRef = useRef(0);
  const intentionalCloseRef = useRef(new WeakSet<WebSocket>());
  const connectTimerRef = useRef<number | null>(null);
  const transportModeRef = useRef<TransportMode>("websocket");
  const [state, setState] = useState<ConnectionState>("idle");
  const [lastError, setLastError] = useState<string | null>(null);
  const [lastBridgeMessage, setLastBridgeMessage] = useState<string | null>(null);

  const clearConnectTimer = useCallback(() => {
    if (connectTimerRef.current !== null) {
      window.clearTimeout(connectTimerRef.current);
      connectTimerRef.current = null;
    }
  }, []);

  const markConnected = useCallback(
    (connectionId: number) => {
      if (connectionIdRef.current !== connectionId) return;
      clearConnectTimer();
      setState("connected");
      setLastError(null);
    },
    [clearConnectTimer]
  );

  const disconnect = useCallback(() => {
    const socket = socketRef.current;
    if (socket) {
      intentionalCloseRef.current.add(socket);
      socket.close();
    }
    socketRef.current = null;
    clearConnectTimer();
    setState("closed");
  }, [clearConnectTimer]);

  const connect = useCallback(() => {
    const connectionId = connectionIdRef.current + 1;
    connectionIdRef.current = connectionId;
    const previousSocket = socketRef.current;
    if (previousSocket) {
      intentionalCloseRef.current.add(previousSocket);
      previousSocket.close();
    }

    setState("connecting");
    setLastError(null);
    setLastBridgeMessage(null);
    clearConnectTimer();
    transportModeRef.current = "websocket";

    try {
      const socket = new WebSocket(url);
      socket.binaryType = "arraybuffer";
      socketRef.current = socket;

      connectTimerRef.current = window.setTimeout(() => {
        if (connectionIdRef.current !== connectionId || socket.readyState === WebSocket.OPEN) return;

        intentionalCloseRef.current.add(socket);
        socket.close();
        transportModeRef.current = "http";
        setState("connected");
        setLastError(null);
        setLastBridgeMessage(`Using HTTPS fallback. Bridge: ${bridgePostUrl(url) ?? bridgeHealthUrl(url) ?? url}`);
      }, 8000);

      socket.addEventListener("open", () => markConnected(connectionId));
      socket.addEventListener("message", (event) => {
        if (connectionIdRef.current !== connectionId) return;
        markConnected(connectionId);

        if (typeof event.data !== "string") return;
        try {
          const message = JSON.parse(event.data) as BridgeMessage;
          if (message.type === "ready") {
            setLastBridgeMessage(`Bridge ready: ${message.midiPort ?? "MIDI output"} / ${message.oscPath ?? "OSC"}`);
          } else if (message.type === "error") {
            setLastBridgeMessage(message.message ?? "Bridge reported an error");
          }
        } catch {
          setLastBridgeMessage(event.data);
        }
      });
      socket.addEventListener("close", (event) => {
        if (connectionIdRef.current !== connectionId || intentionalCloseRef.current.has(socket)) return;
        clearConnectTimer();

        if (event.wasClean) {
          setState("closed");
          return;
        }

        setState("error");
        setLastError(`WebSocket closed before connecting (${event.code || "no code"}).`);
      });
      socket.addEventListener("error", () => {
        if (connectionIdRef.current !== connectionId || intentionalCloseRef.current.has(socket)) return;
        clearConnectTimer();

        transportModeRef.current = "http";
        setState("connected");
        setLastError(null);
        setLastBridgeMessage(`Using HTTPS fallback. Bridge: ${bridgePostUrl(url) ?? bridgeHealthUrl(url) ?? url}`);
      });
    } catch (error) {
      clearConnectTimer();
      setState("error");
      setLastError(error instanceof Error ? error.message : "Unable to connect");
    }
  }, [clearConnectTimer, markConnected, url]);

  const sendHit = useCallback((hit: HitPayload) => {
    const encoded = encodeOscMessage({ path: OSC_HIT_PATH, args: hitToOscArgs(hit) });
    const socket = socketRef.current;
    if (transportModeRef.current === "websocket" && socket?.readyState === WebSocket.OPEN) {
      socket.send(encoded);
      return true;
    }

    const postUrl = bridgePostUrl(url);
    if (!postUrl) {
      return false;
    }

    fetch(postUrl, {
      method: "POST",
      headers: { "content-type": "application/osc" },
      body: encoded,
      keepalive: false
    }).catch((error) => {
      setState("error");
      setLastError(error instanceof Error ? error.message : "HTTPS fallback failed");
    });

    return true;
  }, [url]);

  useEffect(
    () => () => {
      const socket = socketRef.current;
      if (socket) {
        intentionalCloseRef.current.add(socket);
        socket.close();
      }
      clearConnectTimer();
    },
    [clearConnectTimer]
  );

  return { connect, disconnect, sendHit, state, lastError, lastBridgeMessage };
}
