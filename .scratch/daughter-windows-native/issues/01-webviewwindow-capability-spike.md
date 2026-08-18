# 01 — Spike: explicit WebviewWindow creation + capability scoping

**What to build:** proof, against a packaged binary, that a window created explicitly from Rust — not via the reactive popup handler the current mechanism relies on — can both call commands and receive broadcast events under a real permission grant. Nothing else in this directory is built until this returns a verdict.

**Blocked by:** None — orthogonal to polling, can run in parallel with all of `.scratch/rust-owned-polling/`

**Status:** ready-for-agent

- [ ] A debug-only command creates a second (and a third) window explicitly, with a runtime-minted label, against a packaged (`cargo tauri build`/`custom-protocol`) binary — not `cargo tauri dev`, whose origin trivially passes checks that matter here and would prove nothing
- [ ] That window's own `invoke` calls succeed
- [ ] That window's own `listen` calls actually receive a broadcast event — proven explicitly and not assumed, since a missing permission here fails silently rather than with an error (this already happened once in this project, on the Main Window's own capability: scanning worked, results never reached the frontend)
- [ ] The same holds for a second and third window created this way, not only the first
- [ ] A verdict is recorded on which capability mechanism actually works on this Tauri version — a static glob pattern, a per-label dynamic grant, or a blanket wildcard — and written back into this issue

If none of the candidate mechanisms hold, that's a complete and useful result — record what was tried and what failed before the rest of this directory is built against an assumption that doesn't hold.
