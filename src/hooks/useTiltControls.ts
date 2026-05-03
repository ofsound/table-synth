import { useCallback, useEffect, useRef, useState } from "react";
import { applyCalibration, orientationToTilt, smoothTilt, type TiltVector } from "../shared/physics";
import { clamp } from "../shared/music";

type DeviceOrientationEventWithPermission = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<"granted" | "denied">;
};

type DeviceMotionEventWithPermission = typeof DeviceMotionEvent & {
  requestPermission?: () => Promise<"granted" | "denied">;
};

type DeviceOrientationEventWithCompass = DeviceOrientationEvent & {
  webkitCompassHeading?: number;
};

export type ControlMode = "sensor" | "simulation";
export type PermissionState = "idle" | "granted" | "denied" | "unsupported";

const ZERO: TiltVector = { x: 0, y: 0 };

export function useTiltControls() {
  const [tilt, setTilt] = useState<TiltVector>(ZERO);
  const [mode, setMode] = useState<ControlMode>("simulation");
  const [permission, setPermission] = useState<PermissionState>("idle");
  const [sensorActive, setSensorActive] = useState(false);
  const [heading, setHeading] = useState<number | null>(null);
  const neutralRef = useRef<TiltVector>(ZERO);
  const rawSensorRef = useRef<TiltVector>(ZERO);
  const smoothedRef = useRef<TiltVector>(ZERO);
  const keysRef = useRef(new Set<string>());

  const enableSensors = useCallback(async () => {
    if (!("DeviceOrientationEvent" in window)) {
      setPermission("unsupported");
      return;
    }

    const orientation = DeviceOrientationEvent as DeviceOrientationEventWithPermission;
    const motion = "DeviceMotionEvent" in window ? (DeviceMotionEvent as DeviceMotionEventWithPermission) : undefined;

    try {
      const orientationPermission = orientation.requestPermission ? await orientation.requestPermission() : "granted";
      const motionPermission = motion?.requestPermission ? await motion.requestPermission() : "granted";
      const granted = orientationPermission === "granted" && motionPermission === "granted";

      setPermission(granted ? "granted" : "denied");
      setSensorActive(granted);
      if (granted) {
        setMode("sensor");
      }
    } catch {
      setPermission("denied");
      setSensorActive(false);
    }
  }, []);

  const calibrate = useCallback(() => {
    neutralRef.current = rawSensorRef.current;
    smoothedRef.current = ZERO;
    setTilt(ZERO);
  }, []);

  const resetSimulation = useCallback(() => {
    keysRef.current.clear();
    smoothedRef.current = ZERO;
    setTilt(ZERO);
  }, []);

  useEffect(() => {
    if (!sensorActive) {
      return undefined;
    }

    const handleOrientation = (event: DeviceOrientationEventWithCompass) => {
      const raw = orientationToTilt({ beta: event.beta, gamma: event.gamma });
      rawSensorRef.current = raw;
      const calibrated = applyCalibration(raw, neutralRef.current);
      const next = smoothTilt(smoothedRef.current, calibrated);
      smoothedRef.current = next;
      setTilt(next);

      if (typeof event.webkitCompassHeading === "number") {
        setHeading(event.webkitCompassHeading);
      } else if (typeof event.alpha === "number") {
        setHeading(360 - event.alpha);
      }
    };

    window.addEventListener("deviceorientation", handleOrientation);
    return () => window.removeEventListener("deviceorientation", handleOrientation);
  }, [sensorActive]);

  useEffect(() => {
    if (mode !== "simulation") {
      return undefined;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "a", "d", "w", "s"].includes(event.key)) {
        keysRef.current.add(event.key);
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      keysRef.current.delete(event.key);
    };

    const handlePointerMove = (event: PointerEvent) => {
      const x = clamp((event.clientX / window.innerWidth - 0.5) * 2, -1, 1);
      const y = clamp((event.clientY / window.innerHeight - 0.5) * 2, -1, 1);
      smoothedRef.current = smoothTilt(smoothedRef.current, { x, y }, 0.1);
      setTilt(smoothedRef.current);
    };

    let frame = 0;
    const tick = () => {
      const keys = keysRef.current;
      let x = 0;
      let y = 0;
      if (keys.has("ArrowLeft") || keys.has("a")) x -= 1;
      if (keys.has("ArrowRight") || keys.has("d")) x += 1;
      if (keys.has("ArrowUp") || keys.has("w")) y -= 1;
      if (keys.has("ArrowDown") || keys.has("s")) y += 1;

      if (x !== 0 || y !== 0) {
        const next = smoothTilt(smoothedRef.current, { x, y }, 0.2);
        smoothedRef.current = next;
        setTilt(next);
      }

      frame = window.requestAnimationFrame(tick);
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("pointermove", handlePointerMove);
    frame = window.requestAnimationFrame(tick);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("pointermove", handlePointerMove);
      window.cancelAnimationFrame(frame);
    };
  }, [mode]);

  return {
    tilt,
    heading,
    mode,
    setMode,
    permission,
    enableSensors,
    calibrate,
    resetSimulation
  };
}
