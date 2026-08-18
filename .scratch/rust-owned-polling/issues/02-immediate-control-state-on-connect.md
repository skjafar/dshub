# 02 — Control state appears immediately on connect

**What to build:** from the user's perspective, connecting to a device shows the correct Control-held state the moment the connection completes, with no visible delay or flash, and no timer-based workaround left in the code to produce that.

**Blocked by:** None — can start immediately

**Status:** ready-for-agent

- [x] Connecting to a device (real hardware or the emulator) shows Control state correctly within one heartbeat tick of the connection completing, not after a fixed extra delay on top of that
- [x] No `setTimeout`-based one-shot read remains anywhere in the connection-status handling path
- [x] Existing heartbeat/disconnect-detection behavior is unchanged — a device going silent is still detected on the same schedule as today

## Comments

Root cause, not a port: the heartbeat that already reads Control state every second currently skips its own first tick, which is the entire reason the 500ms workaround exists. Removing the skip makes the workaround unnecessary rather than giving it a Rust-side twin.

**Resolved.** `spawn_heartbeat`'s skipped first tick removed (`src-tauri/src/commands.rs`); the `DSHubContext.tsx` `setTimeout` deleted with nothing replacing it. TDD'd: a new `heartbeat_sends_its_first_request_without_waiting_for_an_interval` test (`commands::tests`) failed against the unfixed code (timed out waiting 200ms for a request that only arrived after ~1s) and passes after the fix. Full Rust suite (11/11) and full frontend suite pass; typecheck and lint clean.
