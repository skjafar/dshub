# 01 — Spike: explicit WebviewWindow creation + capability scoping

**What to build:** proof, against a packaged binary, that a window created explicitly from Rust — not via the reactive popup handler the current mechanism relies on — can both call commands and receive broadcast events under a real permission grant. Nothing else in this directory is built until this returns a verdict.

**Blocked by:** None — orthogonal to polling, can run in parallel with all of `.scratch/rust-owned-polling/`

**Status:** ready-for-agent

- [x] A debug-only command creates a second (and a third) window explicitly, with a runtime-minted label, against a packaged (`cargo tauri build`/`custom-protocol`) binary — not `cargo tauri dev`, whose origin trivially passes checks that matter here and would prove nothing
- [x] That window's own `invoke` calls succeed
- [x] That window's own `listen` calls actually receive a broadcast event — proven explicitly and not assumed, since a missing permission here fails silently rather than with an error (this already happened once in this project, on the Main Window's own capability: scanning worked, results never reached the frontend)
- [x] The same holds for a second and third window created this way, not only the first
- [x] A verdict is recorded on which capability mechanism actually works on this Tauri version — a static glob pattern, a per-label dynamic grant, or a blanket wildcard — and written back into this issue

If none of the candidate mechanisms hold, that's a complete and useful result — record what was tried and what failed before the rest of this directory is built against an assumption that doesn't hold.

## Verdict (2026-08-19)

**Pass, with one blocking implementation caveat issue 02 must inherit.** Two
of the three candidate capability mechanisms — a static glob pattern, and a
per-window dynamic grant — each independently grant IPC access (both `invoke`
and a broadcast `listen`) to a genuinely separate `WebviewWindow` with a
runtime-minted label, confirmed for a second *and* third window (plus a
fourth exercising the dynamic mechanism specifically), against a real
packaged binary. Issue 02 is unblocked.

**What was built.** `src-tauri/src/daughter_window_spike.rs`'s
`spike_open_daughter_windows` (debug-only) opens three `WebviewWindow`s via
`WebviewUrl::App` — Tauri's own local protocol, deliberately not the phase-2
localhost server the Main Window still loads through today, since that
mechanism is exactly what this whole effort exists to delete and proving
anything through it would prove nothing about what issue 02 actually needs.
Two are labelled `daughter-spike-1`/`daughter-spike-2`, covered only by
`capabilities/daughter-window-spike.json`'s static glob `"daughter-spike-*"`
— no exact label, no per-window Rust code, no `dynamic-acl`. The third,
`dyn-spike-3`, is deliberately labelled *outside* that glob and instead
granted access via a per-window `app.add_capability(...)` call made in Rust
at creation time (mirroring `lib.rs`'s existing "localhost" capability code,
minus `.remote(...)`, since this window loads over the local protocol rather
than an out-of-band origin) — so any success on that window can only be
attributed to the dynamic grant, not the glob. `client/src/spike/DaughterWindowSpike.tsx`
(reached via `VITE_DSHUB_SPIKE=daughter-window`, mirroring `PopoutSpike.tsx`/
`PollLoadSpike.tsx`) is the probe every window runs on mount: report via
`invoke('spike_report', …)` that it mounted (proving invoke), `listen` for a
broadcast the host emits 1.5s later, and report what arrived (or a timeout).

**Method.** Built with `cargo build --features custom-protocol` (debug
profile — keeps `debug_assertions` on for the spike commands while still
flipping `lib.rs`'s `dev`/`not(dev)` cfg the same way `cargo tauri build`
does), frontend built with `VITE_DSHUB_SPIKE=daughter-window npm run build`
first. Run by hand on Windows, matching the precedent
`.scratch/daughter-windows/issues/01-popout-mechanism-spike.md` set for the
mechanism this replaces. One tooling wrinkle worth recording: PowerShell's
`Start-Process -RedirectStandardOutput` (what `popout-spike.yml`'s CI job
uses successfully for the *other* spike) captured nothing at all here, from
this binary specifically — the process ran, was responsive, and visibly
created windows, but its redirected log stayed empty indefinitely. Wrapping
the launch in `cmd.exe /c "dshub.exe > log 2>&1"` instead captured everything
correctly, including output several seconds after launch, so this was a
capture-mechanism quirk rather than a real absence of output. Unresolved why
the two differ; noted for whoever next needs to script this rather than
re-diagnosed here.

**Finding 1 — a sync command that builds a window deadlocks itself.** The
first attempt used a plain (non-`async`) `#[tauri::command] fn`. It hung
completely: the first window's OS handle appeared (title visible, window
manager shows it) but `spike_open_daughter_windows` never returned — not even
its own first diagnostic line printed, despite a background `tokio::spawn`
task's delayed `println!` in the same process printing correctly moments
later, ruling out a general stdout-capture problem. A `ThreadId(1)` trace
placed the command running on the main/event-loop thread. Reading
`tauri-macros-2.5.5`'s codegen confirmed why: a sync command's `body_blocking`
calls the function inline, on whatever thread dispatched the IPC message,
with no thread hop — and `window/mod.rs`'s `build_internal` needs the main
thread's message loop to cycle again to finish constructing the window, so
calling it *from* the main thread deadlocks against itself. Marking the
command `async fn` (routing it through `body_async`/
`respond_async_serialized`, onto the async runtime's own pool instead) fixed
it outright — confirmed by the full sequence below. **Issue 02's
`open_daughter_window` command must be `async fn` for this reason, not by
convention.**

**Finding 2 — the actual question, once unblocked.** With the fix in place,
a single run's full stdout, in order:

```
[daughter-window-spike] opened daughter-spike-1, daughter-spike-2, dyn-spike-3
daughter-spike-1: mounted — invoke reachable (this call itself succeeded)
daughter-spike-2: mounted — invoke reachable (this call itself succeeded)
dyn-spike-3: mounted — invoke reachable (this call itself succeeded)
[daughter-window-spike] broadcast emitted
daughter-spike-1: broadcast RECEIVED
daughter-spike-2: broadcast RECEIVED
dyn-spike-3: broadcast RECEIVED
```

All three windows' `invoke` and `listen` succeeded, in the order expected,
with no retry and no missing line — `daughter-spike-1`/`-2` via the static
glob, `dyn-spike-3` via the dynamic grant alone (it matches no pattern in any
static capability file). Re-run to confirm — not a one-off.

**Verdict on the three candidate mechanisms.** Static glob pattern and
per-label dynamic grant: both empirically confirmed working, exactly as
above — an initial pass at this verdict argued the dynamic grant was
unnecessary from reading Tauri's ACL source alone rather than running it, but
that reasoning-without-running was the wrong standard of proof for a ticket
whose own checklist demands verdicts "proven explicitly and not assumed"
(item 3, echoing this project's own prior incident where reasoning said a
permission should work and it silently didn't) — so it was run for real
instead, and holds. Either mechanism can be issue 02's own choice; the static
glob remains the lighter-weight default recommendation (no per-window Rust
bookkeeping, and window labels only need to match a known prefix rather than
being tracked individually), but the dynamic grant is now a confirmed, not
merely argued, fallback if a future need doesn't fit a static prefix.
Blanket wildcard (`"windows": ["*"]`): still not run — it is the identical
`glob::Pattern` code path the confirmed static-glob case already exercises
(`tauri-utils-2.9.3/src/acl/capability.rs:85`,
`tauri-2.10.3/src/ipc/authority.rs:352,459-460`), merely with a maximally
permissive pattern instead of a chosen prefix, so there is no distinct
mechanism left to validate — only a security-scope tradeoff (any window,
not just ones matching a chosen prefix) that argues against choosing it, not
a behavior that needs its own run.

**Left in the tree.** `daughter_window_spike.rs`,
`capabilities/daughter-window-spike.json`, `DaughterWindowSpike.tsx`, and
their wiring in `lib.rs`/`index.tsx` are throwaway by intent but kept per the
convention `spike.rs`/`PopoutSpike.tsx` and `poll_spike.rs`/`PollLoadSpike.tsx`
established — historical record until issue 02 lands its own real mechanism,
then deleted alongside it.

Full verification: frontend typecheck, lint (0 errors, same pre-existing
warning baseline), and the full Vitest suite (712 tests, 58 files) all clean;
`cargo check` and `cargo test --lib` (19 tests) both clean, no new warnings
beyond the same pre-existing `lib.rs` set noted in prior tickets.
