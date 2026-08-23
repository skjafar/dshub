# 08 — Daughter Windows can be named, so a Pane's "Move to Window" menu tells them apart

**What to build:** a way to tell Daughter Windows apart by more than "Daughter Window 2" — the label a Pane's "Move to Window" menu, the Panes menu's singleton-location text, and the Main Window's own "Daughter Windows" list all show. Reverses `.scratch/daughter-windows/spec.md`'s own "Out of Scope" line ("Daughter Windows are not individually nameable"), which held as long as there was no menu depending on telling two open Windows apart at a glance — issue 05's own "Move to Window" is exactly that dependency.

**Blocked by:** 05 (the menu this labels), 07 (`windowLabel` — the function this extends)

**Status:** ready-for-agent

- [x] Every Daughter Window shows a label derived from what it currently has open (e.g. "Registers, Plot"), with no naming action required, the moment it has anything open
- [x] From the Main Window's own "Daughter Windows" list, a Window can be given a custom name that overrides the derived label everywhere it is shown
- [x] Clearing a custom name (an empty rename) reverts that Window back to its derived label
- [x] A rename made in the Main Window reaches every other already-open Window's own menus live, with no reopen needed
- [x] A custom name persists with the Workspace, across an app restart, the same way a Daughter Window's bounds and layout already do
- [x] A Daughter Window's own chrome gains no new control — renaming stays exclusive to the Main Window's own list, per spec.md's "Daughter Window chrome stays minimal" line

## Comments

**Resolved**, and built almost entirely by extending mechanisms this
directory's own earlier issues already shipped rather than adding new ones:

- **The label itself** (`daughterWindows.ts`'s `windowLabel`) now has three
  tiers, checked in order: a custom name (`customNames`, new) → a label
  derived from what the Window currently has open
  (`deriveDaughterWindowLabel`, new — dedupes by Pane *kind* via
  `kindOfPaneId`/`paneDefinition`, joining titles with `", "`) → the
  original bare positional fallback ("Daughter Window N"), now reached only
  by a Window with neither a name nor anything open yet. `paneMenuEntries`
  and `moveTargets` (both already threading `paneLocations` through since
  issues 04/05) gained one more parameter, `customNames`, rather than a
  second lookup mechanism.
- **Storage.** `StoredDaughterWindow` gained an *optional* `name?: string |
  null` (`workspaceStore.ts`) — optional, not required, so a Workspace saved
  before this field existed degrades to "no custom name anywhere" rather
  than failing `isValidStoredWorkspace` outright over one purely additive
  field (unlike the `dockLayout` → `mainDockLayout` shape break issue 03
  deliberately did not migrate). New pure `renameDaughterWindow(daughterWindows,
  label, name)` sets or clears one entry's own name, mirroring
  `withoutDaughterWindow`'s own shape.
- **Live propagation needed no new plumbing at all.** A rename is just
  another write into the active Workspace's own `daughterWindows` array —
  already inside `UserSettings.workspacesByProfile`, already synced live
  across every open Window by issue 06's own same-origin `storage` event
  listener. `customWindowNames(daughterWindows)` (new, `daughterWindows.ts`)
  reshapes that array into the `ReadonlyMap<WindowId, string>` `windowLabel`
  needs; each shell recomputes it with a `useMemo` keyed on the reactive
  `settings` value (not a ref), so a rename landing from another Window's
  `storage` event re-derives it exactly the same way this Window's own
  autosave changing something else already does.
- **The one real hazard: a Daughter Window's own debounced autosave has no
  opinion on its own name, and would otherwise silently erase one.**
  `DaughterWindowShell.tsx`'s `flushAutosave` used to build a whole fresh
  `StoredDaughterWindow` unconditionally on every tick; it now reads the
  *existing* entry (by label, or by `restoreIndexRef` right after a
  restore) from inside the same `updateOwnEntry` updater that is about to
  replace it, and carries its `name` forward — so a rename set by the Main
  Window moments before this Window's own next 400ms autosave tick survives
  it, rather than being overwritten by an entry that never knew the name
  existed. Covered by `DaughterWindowShell.test.tsx`'s new "preserving its
  own custom name across autosave" suite.
- **Rename UI** lives only in the Main Window's own "Daughter Windows"
  popover (`AppChrome.tsx`'s new `DaughterWindowRow`), mirroring
  `WorkspacesDialog.tsx`'s own `WorkspaceRow` pattern (a `view`/`editing`
  tagged-union row state, `TextField` + save/cancel on Enter/Escape) rather
  than inventing a second one. The rename field starts pre-filled with the
  current custom name if there is one, or blank — with the currently-shown
  derived label only as a `placeholder` hint — if there is not, so
  committing an untouched derived label never accidentally freezes it in
  place. A Daughter Window's own chrome (`DaughterWindowChrome.tsx`) is
  untouched — no second rename control was added there, per the confirmed
  scope decision and spec.md's own "nothing but Panes" line for that
  chrome.
- **Out of scope, confirmed with the user before implementing:** the native
  OS title bar (still the hardcoded `"DSHub"` `WebviewWindowBuilder::title`
  every Daughter Window already opens with) is untouched — this ticket only
  changes what DSHub's own menus and lists call a Window, not what the
  operating system's own window chrome shows for it.

**Verification.** Typecheck, lint (0 errors, same 31-warning baseline) and
the full Vitest suite (64 files, 825 tests, up from 799 after issue 07) all
clean; `cargo check` confirmed unaffected (this ticket is frontend-only, no
Rust command needed — naming rides entirely on the existing Settings/
`storage`-event channel). New/extended coverage: `daughterWindows.test.ts`'s
`deriveDaughterWindowLabel`/`customWindowNames` suites and `windowLabel`'s
new precedence tests; `paneMenuEntries`/`moveTargets`/`useMoveToWindow.test.ts`
each gained a custom-name-specific case alongside updating every existing
call site for the new parameter; `workspaceStore.test.ts`'s validation
suite (missing/null/string/wrong-typed `name`) and a new `renameDaughterWindow`
suite; `DaughterWindowShell.test.tsx`'s autosave-preserves-an-existing-name
suite; `AppChrome.test.tsx`'s new "Daughter Windows list" suite (rename,
pre-fill from a custom name vs. a blank-with-placeholder, clearing reverts
to auto, Escape cancels without saving, and that clicking a Window's own
name still just focuses it rather than opening the rename field). **Not
hand-verified against a packaged binary**: the live cross-window propagation
end-to-end (rename in the Main Window, watch it change in a second real
`WebviewWindow`'s own "Move to Window" menu) has no test seam here for the
same structural reason issue 05's own two-Window round trip did not — this
directory's own `getCurrentWindow` mock is one global value, unable to
represent two simultaneously-live Windows — and is left to the same
by-hand pass this directory's other real-OS-window mechanics already carry
as a documented gap. What the hook/pure-function-level tests *do* establish
by construction is that `customWindowNames` reshapes whatever the active
Workspace's `daughterWindows` array currently holds with no Window-specific
branching, which is the same property issue 06's own `storage`-event
propagation already guarantees reaches every open Window identically.
