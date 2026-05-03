# Agent Execution Protocol

## 1. Boot Sequence

- **Scan:** Read all `.cursor/rules/*.mdc` before first output.
- **Stack:** React 19, Vite 6, TypeScript, **Matter.js** (2D physics), **Canvas 2D** (table visualization), **lucide-react**, **WebSocket** client + **OSC** encoding in the browser (`src/shared/osc.ts`, `src/shared/protocol.ts`). Optional **Node companion** (`tsx`): **ws**, **easymidi**, same protocol — see `.cursor/rules/companion-server.mdc`. There is no Tailwind, ESLint, TanStack Router, Biome, Knip, Three.js, React Three Fiber, astronomy-engine, Luxon, Cloudflare Workers deploy, or Svelte in this repo unless explicitly added later.
- **Validation:** After substantive edits, run **`npm run verify`** (`vitest run`, then `tsc -b` and `vite build` via `npm run build`). Fix failures before finishing.

---

## 2. Reasoning & Constraints

### A. Think Before Coding

- **Surface tradeoffs:** State assumptions explicitly. If two or more interpretations exist, **ask**; do not guess.
- **Halt on ambiguity:** If a request is unclear, name the confusion and stop.
- **Senior dev filter:** If a solution is 200 lines and could be 50, **rewrite it.** No speculative abstractions.

### B. Surgical implementation

- **Strict scope:** Change only what is requested.
- **No side effects:** Do not "improve" or refactor adjacent code, comments, or formatting.
- **Style match:** Mirror existing patterns, even if suboptimal.
- **No eyebrows:** Never add eyebrow/kicker text (tiny uppercase labels above titles) unless the user explicitly asks.
- **Orphan policy:** Remove imports/variables/functions rendered unused by *your* changes. Leave pre-existing dead code alone.

### C. Goal-driven loop

1. **Reproduce:** Define a specific failure state or observable bug when fixing behavior.
2. **Execute:** Implement the minimum code to solve the problem.
3. **Verify:** Confirm success (e.g. `npm run verify`, UI matches the request).

---

## 3. Tech stack specifics

- **Package manager:** **npm** ([package.json](package.json)).
- **Layout:** Main UI and simulation loop live in [src/App.tsx](src/App.tsx). Shared logic: [src/shared/](src/shared/) (`grid.ts`, `music.ts`, `physics.ts`, `protocol.ts`, `osc.ts`). Hooks: [src/hooks/](src/hooks/). Companion: [src/companion/](src/companion/). When you touch a large area, prefer **extracting** hooks or components under `src/` rather than growing `App.tsx` further.
- **Imports:** Use **relative** paths (`./shared/...`, `./hooks/...`). There is no `@/` path alias in [tsconfig.app.json](tsconfig.app.json) today; if one is added, document it here and in [vite.config.ts](vite.config.ts).
- **Physics & table:** Matter `Engine` / `World` / bodies aligned with the grid in [src/shared/grid.ts](src/shared/grid.ts). See `.cursor/rules/app-state-and-physics.mdc`.
- **React & loop:** Canvas drawing + `requestAnimationFrame` / Matter stepping patterns — see `.cursor/rules/react-and-simulation.mdc`.
- **Styling:** Global rules and CSS variables in [src/styles.css](src/styles.css). See `.cursor/rules/css-and-ui.mdc`.
- **Device sensors:** `DeviceOrientation` / iOS permission flows need a **secure context**. Local HTTPS: Vite uses [vite.config.ts](vite.config.ts) — `@vitejs/plugin-basic-ssl` when local PEM files are absent, or certs under `.cert/` after **`npm run certs`** (see [scripts/generate-certs.mjs](scripts/generate-certs.mjs)). Companion WebSocket server uses its own TLS from [src/companion/certs.ts](src/companion/certs.ts).
- **Scripts:** `npm run dev` — Vite app; `npm run dev:companion` — MIDI bridge server; `npm run build` — `tsc -b` + `vite build`; `npm run preview` — Vite preview; `npm run test` / `npm run test:watch` — Vitest; `npm run certs` — generate local dev certs; `npm run verify` — test + build.

---

**Status:** Protocol active. Awaiting task.
