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

A Workspace can span more than one operating-system **Window** (ADR 0005,
`CONTEXT.md`). The **Main Window** carries Connect, Control, and
Pane/Workspace/Profile/Settings management; any other is a **Daughter
Window** — read-only link/Control state plus one control to add a Pane, and
nothing else. "Move to new window" on a Pane's tab, from either kind of
Window, is currently the only way to create one — dragging a tab past a
Window's edge (the original gesture) is not yet rebuilt against this
mechanism.

The mechanism is a genuine, independent Tauri `WebviewWindow`, not dockview's
`addPopoutGroup` adopting DOM into a same-realm popout (ADR 0004, superseded
by ADR 0005): each Daughter Window runs its own React tree
(`shell/DaughterWindowShell.tsx`, mounted instead of `AppShell.tsx` — see
`App.tsx`'s branch on `shell/windowRole.ts`'s `isMainWindow()`) and its own
dockview instance, with no shared `DockviewApi` between Windows at all. Only
`AutoScanManager`/`AutoConnectManager` and `AppShell.tsx` itself stay
Main-Window-exclusive; a Daughter Window still gets its own
`BackendPortProvider`/`SettingsProvider`/`DSHubProvider`, since every Pane
reads `useDSHub()` and needs live values. `src-tauri/src/daughter_windows.rs`'s
`open_daughter_window` is the one place a Daughter Window is actually
created: it mints a never-reused label (`daughter-{n}`), builds the window
against Tauri's own local protocol carrying the one Pane to open as a query
string (`?pane=<kind>` — the frontend reads `window.location.search` once on
mount), and registers a `WindowEvent::Destroyed` handler that updates an
`AppState`-held registry and broadcasts the change — the one mechanism that
handles every closure path uniformly (native OS close, the Main Window's own
"close a Daughter Window" list, or a Daughter Window closing itself on
losing its last Pane), rather than needing separate bookkeeping per path.
`async fn` on that command is load-bearing: a *sync* Tauri command runs
inline on whatever thread dispatched it, which for a `WebviewWindowBuilder`
call is the main/event-loop thread itself, and `.build()` needs that same
thread's message loop to cycle again to finish — calling it from a sync
command deadlocks the app against itself (`.scratch/daughter-windows-native`
issue 01's finding).

`capabilities/default.json`'s `windows` list is `["main", "daughter-*"]` — a
plain static glob, confirmed (not assumed) to grant `invoke` and broadcast
`listen` access to a window whose exact label was never declared anywhere,
for a second *and* third window, not only the first. No `dynamic-acl`/
`add_capability` call is needed for these: unlike the deleted localhost
origin, a Daughter Window loads over the *local* protocol, which a static
capability already covers.

A Daughter Window that loses its last Pane closes itself — a purely local
check now (`DaughterWindowShell.tsx`'s own `onDidLayoutChange`,
`api.panels.length === 0`), unlike the old cross-window
`api.getPopouts()`-based sweep, since nothing has popouts of its own to
sweep anymore. Closing one destroys its Panes rather than relocating them
anywhere: that used to be an explicit override of dockview's own default;
now it needs no code at all; a real OS window closing inherently tears down
its own separate React tree and dockview instance, and there is no shared
instance left for anything to relocate *into*.

The Main Window's own "close a Daughter Window"/"focus a Daughter Window"
list entries go through `daughterWindowNative.ts` rather than a raw DOM
`Window.close()`/`Window.focus()` — a Daughter Window's native title bar,
close button and z-order are a separate `WebviewWindow` Tauri manages,
unreachable from either raw call; `close()` raw only unloads webview
content, leaving the native frame open and blank, and `focus()` raw fails
silently rather than visibly if it only focuses content. `daughterWindowNative.ts`
calls `@tauri-apps/api/window`'s `Window.getByLabel(label).close()`/
`.setFocus()` directly, by label — no DOM `Window` object to resolve a label
from anymore, since Rust hands the Main Window a live label list directly
(`list_daughter_windows` for the initial read, a `daughter-windows-changed`
broadcast for every change after — the listener is registered *before* the
initial read, so a late-resolving initial fetch can never clobber a fresher
broadcast). The Tauri calls need `core:window:allow-close`/
`core:window:allow-set-focus`, both already in `capabilities/default.json`'s
static grant — no per-origin capability story to keep in step anymore, since
every Window loads over the same local protocol the Main Window always has.

A Pane's own filter/selection state does not survive "Move to new window" —
`paneState.ts`'s in-memory `Map` is per-realm, so a moved Pane opens fresh
in the new Window rather than carrying its prior state across; preserving it
is `.scratch/daughter-windows-native` issue 05's own job, for its own
mechanism (relocating into an *already-open* Window).

A Daughter Window's own arrangement *does* survive an app restart (issue
03). `StoredWorkspace` (`workspaceStore.ts`) carries `mainDockLayout` (the
Main Window's own layout, renamed from the pre-native `dockLayout`) plus a
`daughterWindows: StoredDaughterWindow[]` list — each entry its own
`dockLayout`, its own open Panes' own state, and its saved `bounds`,
necessary because there are now N independent dockview instances rather
than one composite blob. At launch, once `AppShell.tsx`'s `handleReady`
settles on the active Workspace, it calls the new `restore_daughter_window`
Rust command once per saved entry, in array order, each carrying its saved
position and size straight into `WebviewWindowBuilder::position`/
`inner_size` (logical pixels — `daughterWindowNative.ts`'s
`readOwnWindowBounds` is what converts a live window's own physical
`outerPosition`/`innerSize` down to that unit before ever saving them) — no
user gesture required, unlike the old dockview-popout mechanism's
`window.open`. Each restored window reads its own saved content back out of
the shared Settings blob itself, by array position (`?restore=<index>` on
its own URL, since a relaunch remints every label from `daughter-1`
regardless of what a previous session's windows were labelled) rather than
carrying the payload in the URL. From that point on a Daughter Window's own
debounced autosave (mirroring `AppShell.tsx`'s own) keeps its entry current,
matched by its own live label (`upsertDaughterWindow`); closing it from the
Main Window's own Daughter Windows list, or by losing its last Pane, prunes
that entry back out (`withoutDaughterWindow`) so it does not reappear on the
next restore — a native title-bar close does not, a known, narrow gap, since
nothing else observes that path unambiguously (see the Main Window's own
`beforeunload`/quit-vs-single-close ambiguity this would otherwise race).
A Daughter Window belongs to the Workspace, not the Profile: switching
Workspace or deleting the active one close every currently-open Daughter
Window before opening the incoming target's own saved list (`AppShell.tsx`'s
`switchDaughterWindows`); changing Profile does the same close through
`handleBeforeProfileChange`, then opens the new Profile's own saved list
through the remounted `<Workspace key={profileId}>`'s own `handleReady` —
the same restore-at-launch step a fresh launch runs, since a Profile switch
is a fresh restore in every sense but the process being new. A Workspace saved
under the pre-native shape (`dockLayout` instead of `mainDockLayout`, no
`daughterWindows` at all) fails `isValidStoredWorkspace` outright and resets
through the same drop-and-fall-back path any other corrupted Workspace
already takes, rather than erroring or partially restoring.

`workspaceStore.ts`'s `RestoreGuard`/"Reopen windows" banner is gone
outright, not merely inert — it existed only because the pre-native
mechanism's `window.open` needed a user gesture at launch, which
`WebviewWindowBuilder` never did.

Per-Window state that used to resolve from a live shared dock api —
`windowIdForPane` (`shell/focusMode.ts`), the label a menu shows for a
Daughter Window — has no live cross-realm query to fall back on (ADR 0005),
so `.scratch/daughter-windows-native` issue 04 replaced it with an explicit
broadcast instead: `shell/paneLocations.ts`'s `usePaneLocations` has every
Window emit its own open panel ids (`@tauri-apps/api/event`, already covered
by `capabilities/default.json`'s `core:default` grant — no new Rust command)
whenever they change, and every Window, including the one emitting,
aggregates every Window's most recent announcement into one local
`paneId → WindowId` map. Eventually consistent, not always-live — the
accepted cost of the realm split — and pruned against `daughterWindowNative.ts`'s
`useDaughterWindows` (via `daughterWindows.ts`'s own `knownWindowIds`), so a
Window's last-known panel set does not linger once it closes.
`daughterWindows.ts`'s `paneMenuEntries` reads this map to tell a singleton
open in the asking Window (clickable — focuses it) from one open in another
(disabled, labelled with that Window's name via `windowLabel`), the same
rule and the same words in the Main Window's own Panes menu and every
Daughter Window's own add-Pane menu. Focus Mode isolation needed none of
this: each Window already composes its own, independent
`FocusModeProvider`/`FocusModeView` — a Daughter Window only ever has itself
as a `WindowId`, so there is no per-Window `Record` to keep in step, just a
plain boolean/dashboard-id local to that Window's own shell, and a Dashboard
Pane entering Focus Mode is, by construction, always acting on the Window it
already renders in.

## Device Communication

- The **device port** (`services/backendPort.ts`) is the single seam between
  the interface and the Device: every device operation and host file write
  goes through the `BackendPort` interface it defines.
  `services/createBackendPort.ts` chooses the implementation — the real Tauri
  transport (`tauriBackendPort.ts`) inside the desktop app, or the fake
  (`fakeBackendPort.ts`) in a plain browser and in every test — so nothing
  above it has to know which one it is talking to.
- Periodic reads are coalesced by the backend's own per-address subscription
  mechanism (`src-tauri/src/poll.rs`), reached through the port's
  `subscribeAddress`/`unsubscribeAddress`; `fakeBackendPort.ts` mirrors it for
  browser development and tests. Widgets and Panes declare interest via
  `useAutoRefresh`'s `usePolledTargets` (`hooks/useAutoRefresh.ts`) — the one
  place a surface subscribes — which issues one request per distinct address
  at the fastest requested interval. Never issue a periodic device read
  outside this mechanism — the link is strictly request/response, so
  duplicate polls directly cost latency. This used to be a browser-side
  module, `services/pollRegistry.ts`; `.scratch/rust-owned-polling` moved the
  coalescing itself to Rust and the module is gone (ADR 0003's amendment).
- The Rust communicator correlates each response to its request by address
  (`response_matches`). Do not remove this: without it, one timed-out request
  permanently shifts every later value onto the wrong register. Response
  correlation, request serialization and the rate limiter are frozen and were
  untouched by the poll-coalescing migration above.

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
