# TypeScript Project

This project uses TypeScript with strict configuration.

## TypeScript Configuration
- Strict mode is currently **off** (`"strict": false` in `client/tsconfig.json` — relaxed during ongoing migration). New code should still be written as if strict were on: no implicit any, explicit null handling, no unchecked indexed access.
- ES modules (`"type": "module"` in `client/package.json`)
- `noFallthroughCasesInSwitch: true`

## Type Conventions
- Prefer interfaces for object shapes
- Use type aliases for unions/intersections
- Export types alongside implementations
- Avoid `any` - use `unknown` if type is truly unknown

## Patterns
- Use discriminated unions for state
- Prefer readonly arrays and objects where applicable
- Use generics for reusable type-safe functions
- Leverage utility types (Partial, Required, Pick, Omit)

## Code Style
- Use explicit return types for exported functions
- Use const assertions for literal types
- Prefer nullish coalescing (??) over OR (||)
- Use optional chaining (?.) for safe property access

## File Organization
- One export per file when possible
- Co-locate types with implementations
- Use barrel exports (index.ts) for public APIs

## Commands

Run from `client/`:
- `npm run dev` — Vite dev server on port 3000. The Rust backend is a Tauri sidecar,
  not a separate HTTP server; use `cargo tauri dev` from the repo root to run the
  full desktop app.
- `npm run build` — typecheck (`tsc -b`) then bundle to `client/build`
- `npm run typecheck` — full typecheck, no emit
- `npm run lint` — ESLint. `react-hooks/exhaustive-deps` and `rules-of-hooks` are
  **errors** and the tree is clean against them; the remaining `react-hooks/*`
  rules are warnings tracking a known backlog. Promote them to errors as each is
  cleared rather than relaxing them.
- `npm test` — Vitest (`npm run test:watch` for watch mode)

Run from `src-tauri/`:
- `cargo check` / `cargo test --lib` — backend typecheck and unit tests

## Design System

Colour lives in three modules under `client/src/design/`, and components must not
hardcode hex values:

- **`tokens.ts`** — type stacks, radii, the shared 48px header rhythm, and
  structural (colourless) component bases. Fonts are self-hosted via
  `@fontsource-variable/*`; do not reintroduce a remote font link, since the app
  routinely runs on isolated networks.
- **`status.ts`** — the semantic ramp (`ok`/`warn`/`error`/`info`/`idle`).
  Deliberately **theme-invariant**: an operator's read of machine state must not
  change meaning when the theme changes. Reach for this for anything that encodes
  a condition.
- **`dataColors.ts`** — plot series and widget defaults. Series store a palette
  *slot*, not a hex, so identity survives a theme switch while lightness adapts.

`appThemes.ts` owns the two themes — Kinetic Monolith (dark, default) and
Blueprint (light) — and controls brand/chrome accents only. They are the two
faces of one visual language, not two languages: Blueprint holds the same
cyan/lime/gold accent family at the lightness a light surface needs, rather
than a different palette. Ids retired across two roster cuts (four themes
before this interface rebuild, two more during it) are remapped by
`LEGACY_THEME_IDS` onto the survivor of their own mode, so removing a theme
never orphans a saved preference or moves someone from light to dark on
upgrade.

`src/design/__tests__/palette.test.ts` enforces WCAG contrast and hue separation
across every theme. Adding a theme or changing a palette value means running
`npm test` — the suite will reject combinations that are illegible or that let a
brand accent collide with the error colour.

## Workspace, Windows and Panes

A dockview-driven **Workspace** (`shell/Workspace.tsx`, `shell/AppShell.tsx`)
replaced the old sidebar and view router: a dockable arrangement of **Panes**
(`shell/panes/`), several of the same kind open at once, each with its own
filter and selection. `shell/paneRegistry.ts` is the one list a Pane kind has
to join to be restorable from a saved layout, offered by the reopen menu, and
part of the default arrangement. A Profile owns several named Workspaces, one
marked default.

There is no shared panel-header component — a Pane's own controls (filter,
refresh, live toggle) render inline in that Pane, never hoisted into the
global chrome. `AppChrome.tsx` carries app identity, Device connection/Control
state, Pane/Workspace/Profile management (its "Panes" menu is the only way to
open or reopen one), and Settings/About/Guide — never a Pane's own controls.
Focus Mode is not among them: it is entered only from a Dashboard Pane's own
button, and is per-Window presentation state rather than an application-wide
mode — see `shell/focusMode.ts` and below.

### Daughter Windows

A Workspace can span more than one operating-system **Window** (ADR 0004,
`CONTEXT.md`). The **Main Window** carries Connect, Control, and
Pane/Workspace/Profile/Settings management; any other is a **Daughter
Window** — read-only link/Control state plus one control to add a Pane, and
nothing else. A Pane is dragged out of a Window to create one, or sent out by
"Move to new window" on its tab; both funnel through `AppShell.tsx`'s
`openAsPopout`, the one place a popout is actually created so the
window-count warning and the destroy-on-close override (below) can never be
reached by one path and skipped by another.

The mechanism is dockview 7's popout windows (`DockviewApi.addPopoutGroup`),
not a second Tauri `WebviewWindow`: a popout is a separate OS window but the
*same* JavaScript realm, so there is exactly one `pollRegistry`, one
`DSHubProvider` and one `paneState` store across every Window — ADR 0003's
frozen data path is untouched, and a second Tauri webview would have been a
second realm with duplicate polls. `popout.html` (a second Vite build input)
is the scriptless document dockview opens a Daughter Window onto; dockview
adopts the popped-out group's DOM into it and copies the opener's
stylesheets, but nothing else about the application renders there except
`shell/DaughterWindowRoot.tsx`'s chrome, portalled in by hand since dockview
only adopts dock content, never surrounding chrome.

Two behaviours deliberately override dockview's defaults. A Daughter Window
losing its last Pane closes itself — wired in `AppShell.tsx`'s `handleReady`
(`onDidRemovePanel` watching `getPopouts()` for a now-empty member set).
Closing one destroys its Panes rather than relocating them to the main grid
— dockview's own default — via `onWillClose`, supplied by `reallyOpenPopout`
every time *this session* creates a popout: from `handleReady`'s drag-out
listener and from the "Move to new window" tab command alike, since both
funnel through the same `openAsPopout`. A restored Daughter Window closed by
its native OS control falls back to dockview's relocate-to-main-grid
default instead, since `skipPopoutReturn` is not reachable through the
public api and there is no reliable pre-disposal hook for dockview's own
restoration path — a known, narrow gap, not an oversight.

Restoring a Workspace at launch has no user gesture behind it, so a popout
can be blocked — dockview redocks the orphaned groups into the main grid,
and autosave would otherwise overwrite the stored Workspace with that
arrangement within `AUTOSAVE_DEBOUNCE_MS`. `workspaceStore.ts`'s
`RestoreGuard` (`createRestoreGuard`) is what freezes autosave until an
explicit "Reopen windows" retry succeeds — this is the one seam
`workspaceStore.test.ts` pins the data-loss path against, deliberately
without a real dockview instance (ADR-0001).

Per-Window state — which Window a Pane currently renders in, Focus Mode's
own per-Window tracking, the label a menu shows for a Daughter Window —
resolves from the live dock api rather than being cached, since a plain drag
can move a Pane between Windows without any of the surrounding React state
changing: see `shell/focusMode.ts`'s `windowIdForPane` and
`shell/daughterWindows.ts`. A Radix overlay opened inside a Daughter Window
portals into that Window's own document via `ui/ThemeScope.tsx`'s
`PortalContainerScope`, resolved the same way — `Workspace.tsx`'s Pane
wrapper re-reads it from `onDidLocationChange`, not from where the Pane
happened to open.

## Device Communication

- The **device port** (`services/backendPort.ts`) is the single seam between
  the interface and the Device: every device operation and host file write
  goes through the `BackendPort` interface it defines.
  `services/createBackendPort.ts` chooses the implementation — the real Tauri
  transport (`tauriBackendPort.ts`) inside the desktop app, or the fake
  (`fakeBackendPort.ts`) in a plain browser and in every test — so nothing
  above it has to know which one it is talking to.
- `services/pollRegistry.ts` coalesces all periodic reads, issued through the
  port. Widgets and Panes declare interest via `useAutoRefresh`; the registry
  issues one request per distinct address at the fastest requested interval.
  Never issue a periodic device read outside the registry — the link is
  strictly request/response, so duplicate polls directly cost latency. This
  and the point below are frozen: the interface rebuild's only permitted
  change to either was the mechanical substitution of port calls for direct
  transport calls, never a change in logic.
- The Rust communicator correlates each response to its request by address
  (`response_matches`). Do not remove this: without it, one timed-out request
  permanently shifts every later value onto the wrong register.

## Playwright / Browser Screenshots

No system Chrome install is assumed — resolve the Chromium binary Playwright
installs and drive it directly. Run from the Bash tool (Git Bash); the paths
are resolved through PowerShell since that is where npm and Playwright cache
their downloads on Windows. Requires the app already running (`npm run dev`,
port 3000).

```bash
npx -y playwright install chromium

export CHROMIUM=$(powershell -NoProfile -Command "(Get-ChildItem \"\$env:LOCALAPPDATA\ms-playwright\chromium-*\chrome-win64\chrome.exe\" | Select-Object -First 1).FullName")
export PLAYWRIGHT_CORE=$(powershell -NoProfile -Command "(Get-ChildItem \"\$env:LOCALAPPDATA\npm-cache\_npx\*\node_modules\playwright-core\" -Directory | Select-Object -First 1).FullName")

# Simple single-page screenshot:
"$CHROMIUM" --headless --no-sandbox --screenshot=/tmp/screenshot.png --window-size=1440,900 http://localhost:3000

# Multi-view screenshots with navigation (Playwright API). Written to a real
# script file rather than an inline `node -e` string — the resolved paths
# carry backslashes that break once quoted through one.
cat > /tmp/shot.js <<'JS'
const { chromium } = require(process.env.PLAYWRIGHT_CORE);
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM, args: ['--no-sandbox'] });
  // Use colorScheme: 'dark' for dark mode
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark' });
  const page = await ctx.newPage();
  await page.goto('http://localhost:3000');
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: process.env.OUT_PATH });
  await browser.close();
})();
JS
OUT_PATH=/tmp/dshub-settings.png node /tmp/shot.js
```

For protocol-level verification against a real backend rather than the fake
adapter, run the Python Device emulator from the repo root —
`python3 emulator/dshub_emulator.py` — then run the actual desktop app
(`cargo tauri dev` from `src-tauri/`, or `build.bat dev`), not `npm run dev`:
`createBackendPort.ts` serves the fake port to any browser session regardless
of whether an emulator happens to be running, real Tauri transport only when
Tauri is actually present. Click **Connect**, which scans and lists it. See
`emulator/README.md`.

## Design Context

### Users
DSHub serves two overlapping personas with equal weight:

1. **The Engineer** — Embedded or firmware developer at a workstation. Uses DSHub during active hardware development to read/write registers, inspect parameters, and debug live device behavior. Wants precise control, raw data access, and zero friction.

2. **The Operator** — Industrial technician or engineer monitoring live equipment. Uses DSHub as a primary interface to watch system health, react to states, and execute commands. Needs clarity at a glance and trustworthy status feedback.

Both need the UI to get out of the way and surface what matters.

### Brand Personality
**Three words:** Calm. Precise. Capable.

DSHub is an expert co-pilot — smart, composed, always showing you what matters. Emotional goals: **confidence, clarity, focus**.

### Aesthetic Direction
Dark-first. Industrial precision with editorial restraint. Minimal surface, maximum information density.

**Existing system:** 5-level surface hierarchy (tonal, not shadow-based), cyan/lime/gold accents, ghost borders at 12–45% opacity, 2–8px radius, Inter + Space Grotesk, tabular numerics. Two themes ship — one dark (Kinetic Monolith, default), one light (Blueprint) — not four; `src/design/__tests__/palette.test.ts` enforces 4.5:1 text contrast and hue separation between ok/warn/error/info on every surface of both, and would fail on a third.

**Avoid:** Generic enterprise SaaS, consumer/app-store roundness, retro terminal pastiche, gamer RGB neon excess.

### Design Principles
1. **Information first** — Every element must carry information or guide attention. Remove decoration that doesn't communicate.
2. **Hierarchy through tone, not noise** — Surface levels and ghost borders create depth. Avoid heavy shadows and competing visual weights.
3. **Precision at every scale** — Exact spacing, consistent geometry, tabular alignment on numeric data.
4. **Calm confidence** — No excessive animations, no status ambiguity, no cluttered panels. Communicate changes clearly and once.
5. **Serve both modes** — Detail-rich for debugging, scannable at a glance for monitoring.

## Agent skills

### Issue tracker

Issues and specs live as markdown files under `.scratch/<feature-slug>/` in this repo. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical triage roles, used verbatim (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context — one `CONTEXT.md` plus `docs/adr/` at the repo root. See `docs/agents/domain.md`.
