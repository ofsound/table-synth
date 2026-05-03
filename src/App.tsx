import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as Matter from "matter-js";
import { Settings, X } from "lucide-react";
import { useOscClient } from "./hooks/useOscClient";
import { useTiltControls } from "./hooks/useTiltControls";
import { createDefaultGrid, getCellAtPosition, GRID_COLS, GRID_ROWS } from "./shared/grid";
import { clamp, midiNoteName, speedToVelocity } from "./shared/music";
import { normalizeSpeed, TriggerTracker, type TiltVector } from "./shared/physics";
import { DEFAULT_WS_PORT, type CellAddress, type GridCell, type HitPayload } from "./shared/protocol";

type RecentHit = HitPayload & { time: number };
type Dimensions = { width: number; height: number };

const DEFAULT_BRIDGE_URL = `wss://${window.location.hostname || "localhost"}:${DEFAULT_WS_PORT}`;

function bridgeHealthUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.protocol = parsed.protocol === "wss:" ? "https:" : "http:";
    parsed.pathname = "/";
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return "";
  }
}

function getCell(grid: GridCell[][], cell: CellAddress): GridCell {
  return grid[cell.row][cell.col];
}

function updateCell(grid: GridCell[][], address: CellAddress, patch: Partial<GridCell>): GridCell[][] {
  return grid.map((row, rowIndex) =>
    row.map((cell, colIndex) => (rowIndex === address.row && colIndex === address.col ? { ...cell, ...patch } : cell))
  );
}

function drawTable(
  context: CanvasRenderingContext2D,
  dimensions: Dimensions,
  grid: GridCell[][],
  ball: Matter.Body,
  currentCell: CellAddress | null,
  recentHit: RecentHit | null
) {
  const { width, height } = dimensions;
  context.clearRect(0, 0, width, height);
  context.fillStyle = "#151b1f";
  context.fillRect(0, 0, width, height);

  const cellWidth = width / GRID_COLS;
  const cellHeight = height / GRID_ROWS;

  for (let row = 0; row < GRID_ROWS; row += 1) {
    for (let col = 0; col < GRID_COLS; col += 1) {
      const cell = grid[row][col];
      const x = col * cellWidth;
      const y = row * cellHeight;
      const activeAlpha = cell.enabled ? 0.18 : 0.05;
      const isCurrent = currentCell?.row === row && currentCell.col === col;
      const isRecent = recentHit?.row === row && recentHit.col === col && performance.now() - recentHit.time < 140;

      context.fillStyle = isRecent
        ? "rgba(89, 214, 183, 0.36)"
        : isCurrent
          ? "rgba(244, 191, 79, 0.24)"
          : `rgba(106, 147, 170, ${activeAlpha})`;
      context.fillRect(x, y, cellWidth, cellHeight);

      context.strokeStyle = "rgba(232, 238, 240, 0.16)";
      context.lineWidth = 1;
      context.strokeRect(x + 0.5, y + 0.5, cellWidth - 1, cellHeight - 1);

      context.fillStyle = cell.enabled ? "rgba(244, 248, 247, 0.74)" : "rgba(244, 248, 247, 0.25)";
      context.font = `${Math.max(11, Math.min(15, cellWidth * 0.22))}px ui-sans-serif, system-ui`;
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText(cell.label, x + cellWidth / 2, y + cellHeight / 2);
    }
  }

  context.strokeStyle = "rgba(244, 248, 247, 0.45)";
  context.lineWidth = 4;
  context.strokeRect(2, 2, width - 4, height - 4);

  const radius = (ball.circleRadius ?? Math.min(width, height) * 0.045) * 1.04;
  const gradient = context.createRadialGradient(
    ball.position.x - radius * 0.3,
    ball.position.y - radius * 0.35,
    radius * 0.1,
    ball.position.x,
    ball.position.y,
    radius
  );
  gradient.addColorStop(0, "#ffffff");
  gradient.addColorStop(0.35, "#9ff0df");
  gradient.addColorStop(1, "#137d72");
  context.fillStyle = gradient;
  context.beginPath();
  context.arc(ball.position.x, ball.position.y, radius, 0, Math.PI * 2);
  context.fill();
  context.strokeStyle = "rgba(2, 8, 10, 0.35)";
  context.lineWidth = 2;
  context.stroke();
}

export default function App() {
  const [grid, setGrid] = useState(() => createDefaultGrid());
  const [selectedCell, setSelectedCell] = useState<CellAddress>({ row: GRID_ROWS - 1, col: 0 });
  const [bridgeUrl, setBridgeUrl] = useState(DEFAULT_BRIDGE_URL);
  const [dimensions, setDimensions] = useState<Dimensions>({ width: 320, height: 320 });
  const [settingsOpen, setSettingsOpen] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const shellRef = useRef<HTMLDivElement | null>(null);
  const gridRef = useRef(grid);
  const tiltRef = useRef<TiltVector>({ x: 0, y: 0 });
  const triggerRef = useRef(new TriggerTracker(180));
  const recentHitRef = useRef<RecentHit | null>(null);
  const selected = getCell(grid, selectedCell);
  const healthUrl = bridgeHealthUrl(bridgeUrl);

  const { connect, disconnect, sendHit, state: connectionState, lastError, lastBridgeMessage } = useOscClient(bridgeUrl);
  const { tilt, mode, setMode, permission, enableSensors, calibrate, resetSimulation } = useTiltControls();

  useEffect(() => {
    gridRef.current = grid;
  }, [grid]);

  useEffect(() => {
    tiltRef.current = tilt;
  }, [tilt]);

  useEffect(() => {
    const shell = shellRef.current;
    const canvas = canvasRef.current;
    if (!shell || !canvas) {
      return undefined;
    }

    const resize = () => {
      const rect = shell.getBoundingClientRect();
      const size = Math.max(260, Math.min(rect.width, window.innerHeight * 0.68));
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(size * dpr);
      canvas.height = Math.round(size * dpr);
      canvas.style.width = `${size}px`;
      canvas.style.height = `${size}px`;
      setDimensions({ width: size, height: size });
    };

    const observer = new ResizeObserver(resize);
    observer.observe(shell);
    resize();

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return undefined;
    }

    const context = canvas.getContext("2d");
    if (!context) {
      return undefined;
    }

    const dpr = window.devicePixelRatio || 1;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);

    const engine = Matter.Engine.create({ gravity: { x: 0, y: 0, scale: 0.0024 } });
    const radius = Math.max(13, Math.min(dimensions.width, dimensions.height) * 0.045);
    const wall = 80;
    const ball = Matter.Bodies.circle(dimensions.width * 0.5, dimensions.height * 0.5, radius, {
      restitution: 0.9,
      friction: 0,
      frictionAir: 0.014,
      label: "ball"
    });
    const walls = [
      Matter.Bodies.rectangle(dimensions.width / 2, -wall / 2, dimensions.width + wall * 2, wall, { isStatic: true }),
      Matter.Bodies.rectangle(dimensions.width / 2, dimensions.height + wall / 2, dimensions.width + wall * 2, wall, {
        isStatic: true
      }),
      Matter.Bodies.rectangle(-wall / 2, dimensions.height / 2, wall, dimensions.height + wall * 2, { isStatic: true }),
      Matter.Bodies.rectangle(dimensions.width + wall / 2, dimensions.height / 2, wall, dimensions.height + wall * 2, {
        isStatic: true
      })
    ];

    Matter.Composite.add(engine.world, [ball, ...walls]);

    let frame = 0;
    let lastTime = performance.now();
    const loop = (time: number) => {
      const delta = clamp(time - lastTime, 8, 32);
      lastTime = time;
      const control = tiltRef.current;
      engine.gravity.x = control.x;
      engine.gravity.y = control.y;
      Matter.Engine.update(engine, delta);

      const x = clamp(ball.position.x / dimensions.width, 0, 1);
      const y = clamp(ball.position.y / dimensions.height, 0, 1);
      const cell = getCellAtPosition(x, y);

      const gridCell = cell ? getCell(gridRef.current, cell) : null;
      const triggerCell = triggerRef.current.next(gridCell?.enabled ? cell : null, time);
      const speed = normalizeSpeed(Math.hypot(ball.velocity.x, ball.velocity.y));

      if (triggerCell && gridCell) {
        const hit: HitPayload = {
          ...triggerCell,
          note: gridCell.note,
          velocity: speedToVelocity(speed),
          x,
          y,
          speed
        };
        sendHit(hit);
        recentHitRef.current = { ...hit, time };
      }

      drawTable(context, dimensions, gridRef.current, ball, cell, recentHitRef.current);
      frame = window.requestAnimationFrame(loop);
    };

    frame = window.requestAnimationFrame(loop);
    return () => {
      window.cancelAnimationFrame(frame);
      Matter.Engine.clear(engine);
    };
  }, [dimensions, sendHit]);

  const handleCanvasPointerDown = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const cell = getCellAtPosition((event.clientX - rect.left) / rect.width, (event.clientY - rect.top) / rect.height);
      if (cell) {
        setSelectedCell(cell);
      }
    },
    []
  );

  const selectedLabel = useMemo(() => `${selectedCell.row + 1}.${selectedCell.col + 1}`, [selectedCell]);

  return (
    <main className="app-shell">
      <section className="instrument">
        <div className="topbar">
          <h1>Table Synth</h1>
          <div className="topbar-actions">
            <div className={`status status-${connectionState}`}>
              <span />
              {connectionState}
            </div>
            <button type="button" className="icon-button" aria-label="Open settings" onClick={() => setSettingsOpen(true)}>
              <Settings aria-hidden="true" size={22} strokeWidth={2.2} />
            </button>
          </div>
        </div>

        <div className="table-wrap" ref={shellRef}>
          <canvas ref={canvasRef} className="table-canvas" onPointerDown={handleCanvasPointerDown} />
        </div>
      </section>

      {settingsOpen ? (
        <aside className="settings-page" aria-label="Settings">
          <div className="settings-header">
            <h2>Settings</h2>
            <button type="button" className="icon-button ghost" aria-label="Close settings" onClick={() => setSettingsOpen(false)}>
              <X aria-hidden="true" size={22} strokeWidth={2.2} />
            </button>
          </div>

          <div className="controls">
            <div className="control-group">
              <label htmlFor="bridge-url">Bridge</label>
              <input id="bridge-url" value={bridgeUrl} onChange={(event) => setBridgeUrl(event.target.value)} />
              <div className="button-row">
                <button type="button" onClick={connect}>
                  Connect
                </button>
                <button type="button" className="ghost" onClick={disconnect}>
                  Close
                </button>
              </div>
              {healthUrl ? (
                <a className="bridge-link" href={healthUrl} target="_blank" rel="noreferrer">
                  Check bridge TLS
                </a>
              ) : null}
              {lastBridgeMessage ? <p className="hint">{lastBridgeMessage}</p> : null}
              {lastError ? <p className="error">{lastError}</p> : null}
            </div>

            <div className="control-group">
              <label>Motion</label>
              <div className="button-row">
                <button type="button" onClick={enableSensors}>
                  Arm Sensors
                </button>
                <button type="button" className="ghost" onClick={calibrate}>
                  Calibrate
                </button>
              </div>
              <div className="button-row">
                <button type="button" className={mode === "simulation" ? "" : "ghost"} onClick={() => setMode("simulation")}>
                  Sim
                </button>
                <button type="button" className="ghost" onClick={resetSimulation}>
                  Reset
                </button>
              </div>
              <p className="hint">{mode} / {permission}</p>
            </div>

            <div className="control-group">
              <label>Cell {selectedLabel}</label>
              <div className="cell-editor">
                <input
                  type="number"
                  min="0"
                  max="127"
                  value={selected.note}
                  onChange={(event) => {
                    const note = clamp(Number(event.target.value), 0, 127);
                    setGrid((current) => updateCell(current, selectedCell, { note, label: midiNoteName(note) }));
                  }}
                />
                <span>{selected.label}</span>
              </div>
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={selected.enabled}
                  onChange={(event) => setGrid((current) => updateCell(current, selectedCell, { enabled: event.target.checked }))}
                />
                Enabled
              </label>
            </div>
          </div>
        </aside>
      ) : null}
    </main>
  );
}
