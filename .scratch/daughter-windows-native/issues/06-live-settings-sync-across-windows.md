# 06 — A Settings/theme change in one Window applies live to every other open Window

**What to build:** changing the theme, or any other setting, in the Main Window's Settings dialog is reflected immediately in every already-open Daughter Window, with no reopen needed.

**Blocked by:** 02

**Status:** ready-for-agent

- [x] Changing the theme in the Main Window updates an already-open Daughter Window's appearance without a reopen or manual refresh
- [x] The same holds in reverse, for any setting changeable from context available in a Daughter Window
- [x] No Rust-relayed settings-broadcast channel is introduced for this — it rides the platform's own same-origin `storage` event, which is available for free now that every window shares one origin again

## Comments

**Resolved.** One `useEffect` added to `SettingsContext.tsx`, alongside the
existing debounced-persist effect: a `window.addEventListener('storage', ...)`
listener that, on an event naming `dshub_settings` with a non-null
`newValue`, feeds that string through the same `migrateStoredSettings` an
initial mount already trusts and calls `setSettings` with the result.
`justMigrated`/`profilesCarriedOver` are deliberately not touched by this
path — both are one-time, fixed-at-mount flags a consumer seeds dismissable
UI state from (`SettingsContext.tsx`'s own doc comments), and re-deriving
them from a live sync event would flip a notice back on mid-session.

**No ping-pong guard needed, and none added.** The obvious worry — Window A
writes, Window B adopts the value and later autosaves it right back out,
which could in principle re-trigger A — doesn't materialize, because the
`storage` event only fires on a genuine value change
([WHATWG](https://html.spec.whatwg.org/multipage/webstorage.html#dom-storage-setitem):
`setItem` is a no-op, no event, when the new value equals the old one). Since
every `settings` object in every Window is built the same way — `{
...DEFAULT_SETTINGS, ...parsed }` at load, `{ ...prev, ...updates }` on every
change — object-spread never reorders an existing key, so every Window's
`JSON.stringify(settings)` is byte-identical for equal content regardless of
which Window produced it. B's write-back is therefore a true no-op `setItem`
against what A already wrote, and the chain stops there rather than looping.

**Not hand-verified against two real `WebviewWindow`s.** Per spec.md's own
Testing Decisions, this class of behavior — genuine cross-process `storage`
propagation, not just the reducer logic that reacts to it — needs a packaged
binary and two actually-open Windows, and is left to the same by-hand pass
this directory's other real-OS-window mechanics already carry as a
documented gap (issues 02–05). What's covered here instead: the effect's own
branching (key match, null guard, applying a received value) driven directly
against a hand-dispatched `StorageEvent`, which exercises the same code path
a real cross-window `storage` event would invoke once it reaches this
listener — the part a genuine second Window would additionally confirm is
that the browser actually delivers that event across two independent
`WebviewWindow`s sharing one origin, which this repo has no test seam for
(same gap noted above).

**Verification.** Typecheck and lint clean (same pre-existing warning
baseline as issue 05 left it — none of it in the touched files). Full Vitest
suite: 64 files, 789 tests, up from 786 as of issue 05 — +3 new in
`SettingsContext.test.tsx`'s new "live cross-window sync" suite, driving the
real provider against a hand-dispatched `StorageEvent` rather than a second
real window (this repo's own precedent for what's unit-testable vs. what
needs a packaged binary): adopts a setting changed by another Window,
ignores an event for an unrelated key, ignores an event reporting the key
was cleared.
