# AGENTS.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Project Overview

**StructMech Lab (结构力学交互实验室)** — An interactive structural mechanics visualization and analysis tool built with React + TypeScript + Vite. The app is deployed to GitHub Pages on the `gh-pages` branch at the `/structure_analysis/` base path.

The UI is entirely in Chinese (Simplified). All user-facing strings, labels, and AI tutor prompts must remain in Chinese.

## Build & Development Commands

All commands run from `structmech-lab/`:

- **Install**: `npm install`
- **Dev server**: `npm run dev` (runs on port 3000)
- **Build**: `npm run build` (outputs to `structmech-lab/dist/`)
- **Preview**: `npm run preview`

There is no test framework, linter, or type-check script configured. Use `npx tsc --noEmit` for manual type checking.

## Deployment

The `gh-pages` branch serves the static site. The root `index.html` references bundled assets from `/structure_analysis/assets/`. After `npm run build`, the built `dist/` contents must be copied to the repo root (`assets/` and `index.html`) and committed to `gh-pages`. The Vite base path is set to `/structure_analysis/` in `vite.config.ts`.

## Architecture

### Entry Point & Routing

`structmech-lab/App.tsx` is the root component and acts as the router. There is no client-side router library — navigation is managed via `useState<ModuleType | 'HOME'>` with three main modules:

- **HOME** → `HomePage` (animated landing page with particle canvas)
- **STATIC** → `StaticModule` (6 sub-modules selected via `activeStaticSub`)
- **INFLUENCE** → `InfluenceModule` (4 sub-modules selected via `activeInfluenceSub`)
- **SOLVER** → `SolverModule` (activation-gated, requires valid activation code)

### Module System (`types.ts` → `ModuleType` enum)

Each module is a self-contained React component. Sub-modules are rendered internally via conditional rendering, not separate routes.

### Structural Solver Pipeline

The solver is the most complex part of the app:

1. **Geometry Generation** (`utils/geometryGenerator.ts`): Generates nodes/elements for parametric structure types (Beam, PortalFrame, MultiStoryFrame, Truss, GableFrame, Cantilever, etc.). Also provides `autoConnectNodes()` for splitting elements at T-junctions.

2. **Stiffness Matrix Solver** (`utils/solver.ts`): Implements the **direct stiffness method (矩阵位移法)**. Assembles global stiffness matrix, applies boundary conditions via penalty method, solves via Gaussian elimination. Supports hinge releases (`releaseStart`/`releaseEnd`), three stiffness types (Elastic, AxiallyRigid, Rigid), and computes element-level results (M, V, N, deflection). Units: E in MPa (×10⁶), A in cm² (×10⁻⁴), I in cm⁴ (×10⁻⁶).

3. **Visualization** (`components/solver/StructureVisualizer.tsx`): SVG-based rendering with 5 view modes (Editor, M, V, N, D diagrams). Supports drag-and-drop load placement on the structure.

4. **Control Panel** (`components/solver/ControlPanel.tsx`): Structure type selection, parametric geometry sliders, load management (point, distributed, moment).

5. **Geometry Editor** (`components/solver/GeometryEditor.tsx`): Direct node/element editing for Custom structure type. Editing any parametric structure automatically switches to Custom mode.

### AI Tutor (`components/AITutor.tsx`)

A chat panel embedded alongside StaticModule and InfluenceModule sub-modules. Calls external LLM APIs (DeepSeek, Qwen, Zhipu, Moonshot, Doubao) using API keys stored in `localStorage`. The AI model selection and key configuration is in the settings modal within `App.tsx`.

### Activation System

The Solver module is gated behind activation codes validated by a checksum algorithm in `App.tsx` (`validateActivationCode`). Codes are stored in `localStorage`. The `activation-generator.html` file is git-ignored and private.

## Key Patterns

- **State management**: All state is React `useState` — no external state library. `SolverParams` is the central state object for the solver, passed down via props.
- **Styling**: Tailwind CSS v4 via `@tailwindcss/postcss` plugin. No component library — all UI is hand-built with utility classes.
- **SVG rendering**: All structural diagrams (internal forces, influence lines, structure visualization) are rendered with inline SVG elements, not a charting library.
- **Path alias**: `@/` maps to the `structmech-lab/` root (configured in `tsconfig.json` and `vite.config.ts`).
- **No external math library**: Linear algebra (matrix operations, Gaussian elimination) is implemented from scratch in `utils/solver.ts`.

## Environment Variables

Configured in `structmech-lab/.env.local`:
- `GEMINI_API_KEY` — exposed as `process.env.API_KEY` and `process.env.GEMINI_API_KEY` via Vite define
- `VITE_DEEPSEEK_API_KEY` — for AI Tutor (though the actual runtime key comes from `localStorage`)
