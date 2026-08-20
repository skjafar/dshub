# 05 — "Move to Window" menu action relocates a Pane between any two open Windows

**What to build:** a Pane's tab gets a "Move to Window ▸ [target]" command listing every currently-open Window, and picking one relocates the Pane there with its filter and selection intact. This is the initial-implementation answer to cross-window Pane movement — menu-driven, not live drag, per the confirmed scope decision.

**Blocked by:** 04

**Status:** ready-for-agent

- [x] A Pane's tab context menu offers "Move to Window" with a submenu listing every open Window, using the same numbering already used for singleton location labelling
- [x] Picking a target relocates the Pane into that Window's dock, removing it from the source Window
- [x] The Pane's filter and selection state survive the move
- [x] Moving the last Pane out of a Daughter Window closes that Window, consistent with issue 02's close-on-empty behavior
- [x] Works in both directions — Main → Daughter and Daughter → Main — and between two Daughter Windows

## Comments

**Resolved.** Three new modules, layered the way `paneLocations.ts`/
`usePaneLocations` were for issue 04:

- `daughterWindows.ts`'s new `moveTargets(kind, singleton, sourceWindowId,
  paneLocations, openDaughterWindowLabels)` — pure data-in-data-out, reusing
  `knownWindowIds`/`windowLabel` so a move target's numbering is the exact
  same "Daughter Window N" the singleton-location labelling already uses.
  Excludes the Window the Pane is already in, and, for a singleton only,
  any Window that already has one open (reusing `paneLocations`, issue 04's
  own aggregated view) — landing a second Inspector in a Window that
  already has one would collide; a non-singleton kind never excludes a
  target this way, since several Panes of the same kind coexisting in one
  Window is the ordinary case.
- `paneHandoff.ts` (new) — `sendPaneHandoff`/`useIncomingPaneHandoffs`,
  reusing issue 04's own `@tauri-apps/api/event` broadcast mechanism rather
  than building a second one, per that issue's own Comments ("issue 05
  reuses this same broadcast for its own handoff"). No catch-up handshake
  needed here, unlike issue 04's own late-joiner problem: a Window only
  ever appears as a move target once it is already open and already
  listening (`moveTargets` only ever names an *already-open* Window).
- `useMoveToWindow.ts` (new) — shared by `AppShell.tsx` and
  `DaughterWindowShell.tsx`, the same way `useMoveToNewDaughterWindow.ts`
  already is. `targetsFor(panel)` resolves a tab's own move-target list
  fresh per context-menu open. `requestMove` reads the panel's current
  `paneState.ts` blob (`snapshotPaneStates`), sends the handoff, and only
  calls `removePanel` once that send is confirmed — mirroring "Move to new
  window"'s own only-remove-after-success reasoning
  (`useMoveToNewDaughterWindow.ts`), so a lost or refused `emit` cannot
  drop a Pane entirely. The receiving half calls back into each shell's own
  `openPane`, extended with an optional `paneState` argument that calls a
  new `paneState.ts` export, `restorePaneState(id, value)` — an exact-one-id
  write, unlike `loadPaneStates`'s whole-store replace for a Workspace
  load, since a Window receiving a move already has its own other open
  Panes' state in the store that a whole-store replace would destroy.
  Called *before* `addPanel`, so the moved Pane's own `usePaneState` reads
  it on its very first mount — `paneState.test.tsx`'s existing "seeds state
  a Pane reads on its very first mount" contract, just scoped to one id.

**No native dockview submenu exists to build "Move to Window ▸ target"
against** (`ContextMenuItemConfig` is flat — a label, an action, nothing
nested) — confirmed against the installed `dockview-core` version's own
`.d.ts`, not assumed. "Move to [Window]" is one flat context-menu entry per
open target instead, the same words and the same choice a real submenu
would offer, appended after "Move to new window" behind its own separator,
and simply omitted when no other Window is open to move into.

**A Pane's own tab title carries nothing across the handoff — an early
draft that did was wrong, caught by testing against a real dockview
instance rather than assumed correct.** Every Pane kind that shows a title
computes it itself, from its own state, in its own `useEffect(() =>
setTitle(...), ...)` — `AddressSpacePane.tsx`'s instance number and filter
query, `InspectorPane.tsx`'s currently-described entry, `MapEditorPane.tsx`'s
dirty flag, and so on. An initial title passed to `addPanel` is superseded
on the very first render regardless, so carrying one over the wire and
using it to override that initial title was dead weight, not a feature — a
first draft that did exactly this, and asserted a moved Register Pane's tab
kept its old custom name, failed against `DaughterWindowShell.test.tsx`'s
own real dockview instance: the tab read `"Registers 1 · MOTOR"` (the
*correct*, self-computed title, given the restored filter), never the
carried-over title at all. `PaneHandoffPayload`/`PaneSeed` shed the `title`
field entirely once this was found; `openPane`'s seed parameter narrowed
from a small object to a bare `unknown` (the `paneState` value alone), since
one field no longer needed a wrapper type.

**Reviewed via `/code-review` (Standards + Spec axes).** Spec: no findings.
Standards: no hard violations; three judgement-call smells fixed —
`moveTargets` took `kind`/`singleton` as two split-apart primitives even
though its only caller already held the whole `PaneDefinition` (and
`paneMenuEntries`, right above it in the same file, already takes whole
definitions), so it now takes `Pick<PaneDefinition, 'kind' | 'singleton'>`
instead; both shells' `handleTabContextMenuItems` called
`moveToWindow.targetsFor(panel)` twice per render (once to check the
length, once to map) instead of binding it once; and the seeded-state
parameter was named `seedState` in both shells' own `openPane` but
`paneState` everywhere else in the feature (`useMoveToWindow.ts`,
`paneHandoff.ts`), renamed to `paneState` throughout for one name per
concept. A fourth finding — `openPane`'s singleton/non-singleton branches
being near-verbatim duplicated between `AppShell.tsx` and
`DaughterWindowShell.tsx` — was left alone: that duplication predates this
diff (each shell already carried its own separate `openPane`, matching this
codebase's own architecture of two independent React realms with no shared
instance, `CLAUDE.md`'s "Daughter Windows" section), and this diff only
added one more already-duplicated branch to an already-duplicated function
rather than introducing the duplication itself; unifying the two `openPane`s
outright is a larger, differently-scoped change this ticket did not ask
for.

**Verification.** Typecheck, lint (0 new errors or warnings — same 31-warning
baseline as issue 04 left it) and the full Vitest suite (64 files, 786
tests, up from 62/760 after issue 04's own fix) all clean. New coverage:
`daughterWindows.test.ts`'s `moveTargets` suite; `paneHandoff.test.ts`
(`sendPaneHandoff`, `useIncomingPaneHandoffs`, mocking
`@tauri-apps/api/event` the same way `paneLocations.test.ts` does);
`useMoveToWindow.test.ts` (`targetsFor`, `requestMove` including the
failure-does-not-remove-the-panel path, and the receiving side, mocking
`paneHandoff.ts` wholesale the same way `useMoveToNewDaughterWindow.test.ts`
mocks `daughterWindowNative.ts`); `paneState.test.tsx`'s new
`restorePaneState` case; and `DaughterWindowShell.test.tsx`'s new
"receiving a 'Move to Window' handoff" suite, which drives the mocked
`listen` handler directly against a real, already-rendered `<Workspace>` —
the one test in this set exercising a real `addPanel` and a real
`usePaneState` mount cooperating with `restorePaneState` for real, which is
exactly what caught the dead `title` field above. **Not hand-verified
against a packaged binary**: a genuine two-Window round trip — the sending
half's own tab-context-menu action, actually clicked, actually relocating a
Pane into a second real `WebviewWindow` — has no test seam available here
(`DaughterWindowShell.test.tsx`'s own `getCurrentWindow` mock is a single
global return value with no way to represent two simultaneously-live
Windows; dockview's own context-menu rendering also has no established
jsdom-interaction precedent anywhere in this suite to build on), and is left
to the same by-hand pass this directory's other real-OS-window mechanics
already carry as a documented gap. What the hook-level tests *do* establish
by construction — `useMoveToWindow`'s own logic never special-cases which
`WindowId` is asking, tested interchangeably against `MAIN_WINDOW_ID` and
arbitrary Daughter labels alike — is that "works in both directions" is a
property of the shared mechanism itself, not something either shell wires
differently.
