import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as Matter from "matter-js";
import { Settings, X } from "lucide-react";
import { useOscClient } from "./hooks/useOscClient";
import { useTiltControls } from "./hooks/useTiltControls";
import {
  CIRCULAR_DEAD_RADIUS,
  CIRCULAR_RINGS,
  CIRCULAR_SECTORS,
  createDefaultCircularGrid,
  getCircularCellAtPosition
} from "./shared/circular";
import {
  createDefaultGrid,
  getCellAtPosition,
  GRID_ROWS,
  headingToColumnOffset,
  VISIBLE_GRID_COLS,
  visibleColToGridCol
} from "./shared/grid";
import { clamp, midiNoteName, speedToVelocity } from "./shared/music";
import { normalizeSpeed, TriggerTracker, type TiltVector } from "./shared/physics";
import { DEFAULT_WS_PORT, type CellAddress, type GridCell, type HitPayload } from "./shared/protocol";

type RecentHit = HitPayload & { time: number };
type Dimensions = { width: number; height: number };
type SurfaceMode = "square" | "circular";
type CompassAnchor = {
  headingCol: number | null;
  offset: number;
};

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

function drawBall(context: CanvasRenderingContext2D, dimensions: Dimensions, ball: Matter.Body, noteOffActive: boolean) {
  const { width, height } = dimensions;
  const radius = (ball.circleRadius ?? Math.min(width, height) * 0.045) * 1.04;
  const gradient = context.createRadialGradient(
    ball.position.x - radius * 0.3,
    ball.position.y - radius * 0.35,
    radius * 0.1,
    ball.position.x,
    ball.position.y,
    radius
  );

  if (noteOffActive) {
    gradient.addColorStop(0, "rgba(255, 255, 255, 0.78)");
    gradient.addColorStop(0.46, "rgba(194, 201, 203, 0.46)");
    gradient.addColorStop(1, "rgba(83, 91, 95, 0.22)");
    context.shadowColor = "rgba(240, 245, 245, 0.28)";
    context.shadowBlur = radius * 1.1;
  } else {
    gradient.addColorStop(0, "#ffffff");
    gradient.addColorStop(0.35, "#9ff0df");
    gradient.addColorStop(1, "#137d72");
    context.shadowBlur = 0;
  }

  context.fillStyle = gradient;
  context.beginPath();
  context.arc(ball.position.x, ball.position.y, radius, 0, Math.PI * 2);
  context.fill();
  context.shadowBlur = 0;
  context.strokeStyle = noteOffActive ? "rgba(238, 242, 243, 0.48)" : "rgba(2, 8, 10, 0.35)";
  context.lineWidth = noteOffActive ? 1.5 : 2;
  context.stroke();
}

function drawSquareTable(
  context: CanvasRenderingContext2D,
  dimensions: Dimensions,
  grid: GridCell[][],
  ball: Matter.Body,
  currentCell: CellAddress | null,
  recentHit: RecentHit | null,
  noteOffActive: boolean,
  columnOffset: number
) {
  const { width, height } = dimensions;
  context.clearRect(0, 0, width, height);
  context.fillStyle = "#151b1f";
  context.fillRect(0, 0, width, height);

  const cellWidth = width / VISIBLE_GRID_COLS;
  const cellHeight = height / GRID_ROWS;

  for (let row = 0; row < GRID_ROWS; row += 1) {
    for (let visibleCol = 0; visibleCol < VISIBLE_GRID_COLS; visibleCol += 1) {
      const gridCol = visibleColToGridCol(visibleCol, columnOffset);
      const cell = grid[row][gridCol];
      const x = visibleCol * cellWidth;
      const y = row * cellHeight;
      const activeAlpha = cell.enabled ? 0.18 : 0.05;
      const isCurrent = currentCell?.row === row && currentCell.col === gridCol;
      const isRecent =
        !noteOffActive && recentHit?.row === row && recentHit.col === gridCol && performance.now() - recentHit.time < 140;

      context.fillStyle = isRecent
        ? "rgba(89, 214, 183, 0.36)"
        : isCurrent
          ? "rgba(244, 191, 79, 0.24)"
          : `rgba(106, 147, 170, ${activeAlpha})`;
      context.fillRect(x, y, cellWidth, cellHeight);

      context.strokeStyle = "rgba(232, 238, 240, 0.16)";
      context.lineWidth = 1;
      context.strokeRect(x + 0.5, y + 0.5, cellWidth - 1, cellHeight - 1);

      context.fillStyle = noteOffActive
        ? cell.enabled
          ? "rgba(232, 236, 237, 0.46)"
          : "rgba(232, 236, 237, 0.18)"
        : cell.enabled
          ? "rgba(244, 248, 247, 0.74)"
          : "rgba(244, 248, 247, 0.25)";
      context.font = `${Math.max(11, Math.min(15, cellWidth * 0.22))}px ui-sans-serif, system-ui`;
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText(cell.label, x + cellWidth / 2, y + cellHeight / 2);
    }
  }

  context.strokeStyle = "rgba(244, 248, 247, 0.45)";
  context.lineWidth = 4;
  context.strokeRect(2, 2, width - 4, height - 4);

  drawBall(context, dimensions, ball, noteOffActive);
}

function drawCircularTable(
  context: CanvasRenderingContext2D,
  dimensions: Dimensions,
  grid: GridCell[][],
  ball: Matter.Body,
  currentCell: CellAddress | null,
  recentHit: RecentHit | null,
  noteOffActive: boolean
) {
  const { width, height } = dimensions;
  const size = Math.min(width, height);
  const centerX = width / 2;
  const centerY = height / 2;
  const outerRadius = size * 0.5 - 3;
  const deadRadius = outerRadius * CIRCULAR_DEAD_RADIUS;
  const playableWidth = outerRadius - deadRadius;

  context.clearRect(0, 0, width, height);
  context.fillStyle = "#151b1f";
  context.fillRect(0, 0, width, height);

  for (let row = 0; row < CIRCULAR_RINGS; row += 1) {
    const innerRadius = deadRadius + (playableWidth * row) / CIRCULAR_RINGS;
    const ringOuterRadius = deadRadius + (playableWidth * (row + 1)) / CIRCULAR_RINGS;

    for (let col = 0; col < CIRCULAR_SECTORS; col += 1) {
      const cell = grid[row][col];
      const startAngle = -Math.PI / 2 + (col / CIRCULAR_SECTORS) * Math.PI * 2;
      const endAngle = -Math.PI / 2 + ((col + 1) / CIRCULAR_SECTORS) * Math.PI * 2;
      const activeAlpha = cell.enabled ? 0.18 : 0.05;
      const isCurrent = currentCell?.row === row && currentCell.col === col;
      const isRecent =
        !noteOffActive && recentHit?.row === row && recentHit.col === col && performance.now() - recentHit.time < 140;

      context.beginPath();
      context.arc(centerX, centerY, ringOuterRadius, startAngle, endAngle);
      context.arc(centerX, centerY, innerRadius, endAngle, startAngle, true);
      context.closePath();
      context.fillStyle = isRecent
        ? "rgba(89, 214, 183, 0.36)"
        : isCurrent
          ? "rgba(244, 191, 79, 0.24)"
          : `rgba(106, 147, 170, ${activeAlpha})`;
      context.fill();
      context.strokeStyle = "rgba(232, 238, 240, 0.16)";
      context.lineWidth = 1;
      context.stroke();

      const labelAngle = (startAngle + endAngle) / 2;
      const labelRadius = (innerRadius + ringOuterRadius) / 2;
      const labelX = centerX + Math.cos(labelAngle) * labelRadius;
      const labelY = centerY + Math.sin(labelAngle) * labelRadius;
      context.fillStyle = noteOffActive
        ? cell.enabled
          ? "rgba(232, 236, 237, 0.46)"
          : "rgba(232, 236, 237, 0.18)"
        : cell.enabled
          ? "rgba(244, 248, 247, 0.74)"
          : "rgba(244, 248, 247, 0.25)";
      context.font = `${Math.max(10, Math.min(14, playableWidth * 0.11))}px ui-sans-serif, system-ui`;
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText(cell.label, labelX, labelY);
    }
  }

  context.beginPath();
  context.arc(centerX, centerY, deadRadius, 0, Math.PI * 2);
  context.fillStyle = "rgba(2, 8, 10, 0.3)";
  context.fill();
  context.strokeStyle = "rgba(232, 238, 240, 0.22)";
  context.lineWidth = 1.2;
  context.stroke();

  context.beginPath();
  context.arc(centerX, centerY, outerRadius, 0, Math.PI * 2);
  context.strokeStyle = "rgba(244, 248, 247, 0.45)";
  context.lineWidth = 4;
  context.stroke();

  drawBall(context, dimensions, ball, noteOffActive);
}

function createSquareWalls(dimensions: Dimensions, wall: number) {
  return [
    Matter.Bodies.rectangle(dimensions.width / 2, -wall / 2, dimensions.width + wall * 2, wall, { isStatic: true }),
    Matter.Bodies.rectangle(dimensions.width / 2, dimensions.height + wall / 2, dimensions.width + wall * 2, wall, {
      isStatic: true
    }),
    Matter.Bodies.rectangle(-wall / 2, dimensions.height / 2, wall, dimensions.height + wall * 2, { isStatic: true }),
    Matter.Bodies.rectangle(dimensions.width + wall / 2, dimensions.height / 2, wall, dimensions.height + wall * 2, {
      isStatic: true
    })
  ];
}

function createCircularWalls(dimensions: Dimensions, wall: number) {
  const segments = 64;
  const centerX = dimensions.width / 2;
  const centerY = dimensions.height / 2;
  const outerRadius = Math.min(dimensions.width, dimensions.height) * 0.5 - 3;
  const segmentLength = ((Math.PI * 2 * outerRadius) / segments) * 1.18;

  return Array.from({ length: segments }, (_, index) => {
    const angle = (index / segments) * Math.PI * 2;
    const x = centerX + Math.cos(angle) * (outerRadius + wall / 2);
    const y = centerY + Math.sin(angle) * (outerRadius + wall / 2);

    return Matter.Bodies.rectangle(x, y, segmentLength, wall, {
      angle: angle + Math.PI / 2,
      isStatic: true
    });
  });
}

export default function App() {
  const [surfaceMode, setSurfaceModeState] = useState<SurfaceMode>("square");
  const [grid, setGrid] = useState(() => createDefaultGrid());
  const [circularGrid, setCircularGrid] = useState(() => createDefaultCircularGrid());
  const [selectedCell, setSelectedCell] = useState<CellAddress>({ row: GRID_ROWS - 1, col: 0 });
  const [selectedCircularCell, setSelectedCircularCell] = useState<CellAddress>({ row: 0, col: 0 });
  const [bridgeUrl, setBridgeUrl] = useState(DEFAULT_BRIDGE_URL);
  const [dimensions, setDimensions] = useState<Dimensions>({ width: 320, height: 320 });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [noteOffActive, setNoteOffActive] = useState(false);
  const [motionResponse, setMotionResponse] = useState(1);
  const [compassLocked, setCompassLocked] = useState(false);
  const [columnOffset, setColumnOffset] = useState(0);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const shellRef = useRef<HTMLDivElement | null>(null);
  const surfaceModeRef = useRef<SurfaceMode>("square");
  const gridRef = useRef(grid);
  const circularGridRef = useRef(circularGrid);
  const tiltRef = useRef<TiltVector>({ x: 0, y: 0 });
  const motionResponseRef = useRef(1);
  const columnOffsetRef = useRef(0);
  const compassAnchorRef = useRef<CompassAnchor>({ headingCol: null, offset: 0 });
  const noteOffRef = useRef(false);
  const triggerRef = useRef(new TriggerTracker(180));
  const recentHitRef = useRef<RecentHit | null>(null);
  const selectedAddress = surfaceMode === "square" ? selectedCell : selectedCircularCell;
  const selectedGrid = surfaceMode === "square" ? grid : circularGrid;
  const selected = getCell(selectedGrid, selectedAddress);
  const healthUrl = bridgeHealthUrl(bridgeUrl);

  const { connect, disconnect, sendHit, state: connectionState, lastError, lastBridgeMessage } = useOscClient(bridgeUrl);
  const { tilt, heading, mode, setMode, permission, enableSensors, calibrate, resetSimulation } = useTiltControls();

  const resetTriggers = useCallback(() => {
    triggerRef.current.reset();
    recentHitRef.current = null;
  }, []);

  const setSurfaceMode = useCallback(
    (nextMode: SurfaceMode) => {
      surfaceModeRef.current = nextMode;
      setSurfaceModeState(nextMode);
      setNoteOffActive(false);
      noteOffRef.current = false;
      resetTriggers();
      if (nextMode === "circular") {
        setCompassLocked(false);
      }
    },
    [resetTriggers]
  );

  useEffect(() => {
    surfaceModeRef.current = surfaceMode;
  }, [surfaceMode]);

  useEffect(() => {
    gridRef.current = grid;
  }, [grid]);

  useEffect(() => {
    circularGridRef.current = circularGrid;
  }, [circularGrid]);

  useEffect(() => {
    tiltRef.current = tilt;
  }, [tilt]);

  useEffect(() => {
    motionResponseRef.current = motionResponse;
  }, [motionResponse]);

  const setColumnOffsetAndReset = useCallback((offset: number) => {
    columnOffsetRef.current = offset;
    setColumnOffset(offset);
    resetTriggers();
  }, [resetTriggers]);

  useEffect(() => {
    if (surfaceMode !== "square" || compassLocked || heading === null) {
      return;
    }

    const headingCol = headingToColumnOffset(heading);
    const anchor = compassAnchorRef.current;
    if (anchor.headingCol === null) {
      compassAnchorRef.current = { headingCol, offset: columnOffsetRef.current };
      return;
    }

    setColumnOffsetAndReset(visibleColToGridCol(headingCol - anchor.headingCol, anchor.offset));
  }, [compassLocked, heading, setColumnOffsetAndReset, surfaceMode]);

  const toggleCompassLock = useCallback(() => {
    if (surfaceModeRef.current !== "square") {
      return;
    }

    setCompassLocked((locked) => {
      const nextLocked = !locked;

      if (!nextLocked) {
        compassAnchorRef.current = {
          headingCol: heading === null ? null : headingToColumnOffset(heading),
          offset: columnOffsetRef.current
        };
      }

      return nextLocked;
    });
  }, [heading]);

  const setMomentaryNoteOff = useCallback((active: boolean) => {
    noteOffRef.current = active;
    setNoteOffActive(active);
    if (active) {
      resetTriggers();
    }
  }, [resetTriggers]);

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
    const walls = surfaceMode === "square" ? createSquareWalls(dimensions, wall) : createCircularWalls(dimensions, wall);

    Matter.Composite.add(engine.world, [ball, ...walls]);

    let frame = 0;
    let lastTime = performance.now();
    const loop = (time: number) => {
      const delta = clamp(time - lastTime, 8, 32);
      lastTime = time;
      const control = tiltRef.current;
      engine.gravity.x = control.x * motionResponseRef.current;
      engine.gravity.y = control.y * motionResponseRef.current;
      Matter.Engine.update(engine, delta);

      const x = clamp(ball.position.x / dimensions.width, 0, 1);
      const y = clamp(ball.position.y / dimensions.height, 0, 1);
      const activeSurface = surfaceModeRef.current;
      const visibleCell =
        activeSurface === "square" ? getCellAtPosition(x, y) : getCircularCellAtPosition(x, y);
      const cell =
        activeSurface === "square" && visibleCell
          ? {
              row: visibleCell.row,
              col: visibleColToGridCol(visibleCell.col, columnOffsetRef.current)
            }
          : visibleCell;

      const activeGrid = activeSurface === "square" ? gridRef.current : circularGridRef.current;
      const gridCell = cell ? getCell(activeGrid, cell) : null;
      const triggerCell = noteOffRef.current ? null : triggerRef.current.next(gridCell?.enabled ? cell : null, time);
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

      if (activeSurface === "square") {
        drawSquareTable(
          context,
          dimensions,
          gridRef.current,
          ball,
          cell,
          recentHitRef.current,
          noteOffRef.current,
          columnOffsetRef.current
        );
      } else {
        drawCircularTable(context, dimensions, circularGridRef.current, ball, cell, recentHitRef.current, noteOffRef.current);
      }
      frame = window.requestAnimationFrame(loop);
    };

    frame = window.requestAnimationFrame(loop);
    return () => {
      window.cancelAnimationFrame(frame);
      Matter.Engine.clear(engine);
    };
  }, [dimensions, sendHit, surfaceMode]);

  const handleCanvasPointerDown = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width;
      const y = (event.clientY - rect.top) / rect.height;

      if (surfaceModeRef.current === "square") {
        const visibleCell = getCellAtPosition(x, y);
        if (!visibleCell) return;
        setSelectedCell({
          row: visibleCell.row,
          col: visibleColToGridCol(visibleCell.col, columnOffsetRef.current)
        });
        return;
      }

      const circularCell = getCircularCellAtPosition(x, y);
      if (circularCell) {
        setSelectedCircularCell(circularCell);
      }
    },
    []
  );

  const selectedLabel = useMemo(
    () =>
      surfaceMode === "square"
        ? `${selectedCell.row + 1}.${selectedCell.col + 1}`
        : `Ring ${selectedCircularCell.row + 1} / Sector ${selectedCircularCell.col + 1}`,
    [selectedCell, selectedCircularCell, surfaceMode]
  );

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

        <div className={`performance-buttons${surfaceMode === "circular" ? " is-single" : ""}`}>
          <button
            type="button"
            className={`performance-button${noteOffActive ? " is-active" : ""}`}
            aria-pressed={noteOffActive}
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId);
              setMomentaryNoteOff(true);
            }}
            onPointerUp={(event) => {
              event.currentTarget.releasePointerCapture(event.pointerId);
              setMomentaryNoteOff(false);
            }}
            onPointerCancel={() => setMomentaryNoteOff(false)}
            onPointerLeave={(event) => {
              if (event.buttons === 0) {
                setMomentaryNoteOff(false);
              }
            }}
            onBlur={() => setMomentaryNoteOff(false)}
            onKeyDown={(event) => {
              if (event.repeat) return;
              if (event.key === " " || event.key === "Enter") {
                setMomentaryNoteOff(true);
              }
            }}
            onKeyUp={(event) => {
              if (event.key === " " || event.key === "Enter") {
                setMomentaryNoteOff(false);
              }
            }}
          >
            Note Off
          </button>
          {surfaceMode === "square" ? (
            <button
              type="button"
              className={`performance-button${compassLocked ? " is-active" : ""}`}
              aria-pressed={compassLocked}
              onClick={toggleCompassLock}
            >
              Lock
            </button>
          ) : null}
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
              <label>Surface</label>
              <div className="segmented-control">
                <button
                  type="button"
                  className={surfaceMode === "square" ? "is-active" : ""}
                  aria-pressed={surfaceMode === "square"}
                  onClick={() => setSurfaceMode("square")}
                >
                  Square
                </button>
                <button
                  type="button"
                  className={surfaceMode === "circular" ? "is-active" : ""}
                  aria-pressed={surfaceMode === "circular"}
                  onClick={() => setSurfaceMode("circular")}
                >
                  Circular
                </button>
              </div>
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
              {surfaceMode === "square" ? (
                <p className="hint">
                  Compass {heading === null ? "waiting" : `${Math.round(heading)}°`} / Column {columnOffset + 1}
                  {compassLocked ? " / locked" : ""}
                </p>
              ) : null}
            </div>

            <div className="control-group">
              <label htmlFor="motion-response">Physics</label>
              <div className="slider-control">
                <input
                  id="motion-response"
                  type="range"
                  min="0.2"
                  max="2.4"
                  step="0.05"
                  value={motionResponse}
                  onChange={(event) => setMotionResponse(Number(event.target.value))}
                />
                <output htmlFor="motion-response">{motionResponse.toFixed(2)}x</output>
              </div>
              <p className="hint">Tilt response</p>
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
                    if (surfaceMode === "square") {
                      setGrid((current) => updateCell(current, selectedCell, { note, label: midiNoteName(note) }));
                    } else {
                      setCircularGrid((current) =>
                        updateCell(current, selectedCircularCell, { note, label: midiNoteName(note) })
                      );
                    }
                  }}
                />
                <span>{selected.label}</span>
              </div>
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={selected.enabled}
                  onChange={(event) => {
                    if (surfaceMode === "square") {
                      setGrid((current) => updateCell(current, selectedCell, { enabled: event.target.checked }));
                    } else {
                      setCircularGrid((current) =>
                        updateCell(current, selectedCircularCell, { enabled: event.target.checked })
                      );
                    }
                  }}
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
