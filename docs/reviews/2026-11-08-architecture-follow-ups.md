# Architecture follow-ups from the native analysis

The analysis of 2026-11-07 left five items that change architecture, need device firmware, or need a tagged commit. None of them was implemented in the overnight pass. This note records why, and a plan for each.

## 1. `WidgetSpec` (report M4)

**Today:** one `Widget` struct with 35 fields serves all sixteen kinds.

**Why it was not changed overnight:**

- The struct is the stored form in three places: saved settings, Profile files and the `nativeDashboards` export.
- An enum changes all three, and needs a serde migration.
- It also touches every widget renderer and config section, about 1,500 lines.
- A regression would show up as lost dashboards. That should be reviewed, not discovered.

**Plan:**

1. Add `enum WidgetSpec { Gauge { min, max, thresholds, .. }, Button { command, value, confirm }, .. }`, plus `Widget { id, label, geometry, children, spec }`.
2. Serialize through a `#[serde(from = "WidgetRecord", into = "WidgetRecord")]` shim. `WidgetRecord` is today's flat struct, so stored data and the portable format do not change.
3. Move each `render_widget` arm and each `config` section to match on the spec, one kind per commit, with the existing tests guarding each step.
4. Remove the shim only if the stored format is ever versioned forward. `Saved::schema` now exists for exactly that.

## 2. Deferred viewports (report §5.1)

**Today:** daughter windows use `show_viewport_immediate` and share `&mut Desktop`. Every window repaints with the root.

**Why it was not changed:** deferred viewports need `Send + Sync` state behind `Arc<Mutex<…>>`. That covers the session, Profiles, docks and series, and changes the borrowing model of every pane. The cost only shows with three or more busy windows. Event-driven repaint already removed idle redraws.

**Plan:**

- Measure first. Turn on `puffin` frame timing with three windows of plots open.
- If daughters dominate the timings, move them to `show_viewport_deferred` with a `SharedState(Arc<Mutex<Desktop>>)`.
- Each viewport callback locks the state for its frame. The lock is uncontended in practice, because egui runs viewports on one thread.

## 3. Multiple devices (report §8.4)

**Today:** one connection per application is an invariant, and CLAUDE.md requires that every viewport shares one live session.

**Plan (design only):**

- Key `AppState.communicator_tx`, `connection`, `poll_*`, `readings`, `histories` and `writes` by a `DeviceId`. Use the transport endpoint until devices report a stable identity; the MAC from discovery is a candidate.
- Make `Binding` carry an optional device, defaulting to "the session's device", so existing Profiles keep working.
- The device chip becomes a device list. Panes and widgets pick a device the way they pick a Profile entry.
- Start only when there is a real need to supervise several boards. Changing the invariant is a product decision.

## 4. Protocol v0.3 (report §3.2)

**Today:** stop-and-wait, one 8-byte frame per request, with correlation by echoed op code and address.

**Why it was not implemented:** the firmware does not speak it. Implementing it in the application and emulator alone would break physical devices.

**Draft for the firmware review:**

- **16-byte frame:** `magic u16 | version u8 | flags u8 | tag u16 | type u16 | address u16 | count u16 | value i32`.
  - `tag` is echoed verbatim, which allows pipelining: up to N requests in flight, matched by tag, not by order.
  - `count > 1` on a read is a block read of `count` consecutive addresses. The response carries `count` values after the header, up to an MTU-safe limit.
- **Negotiation:** a v0.2 `SYS_COMMAND` (for example 65010 `PROTOCOL_INFO`) returns the highest supported version. Hosts fall back to v0.2.2 frames when the command is refused. Old firmware keeps working.
- **Conformance:** `tests/protocol-vectors.json` gains a v0.3 section, and the emulator implements both versions.

## 5. Removing `client/` and `src-tauri/` (report §8.12)

**Done.** Both folders were removed after the commit tagged `tauri-reference`, which keeps them in history. CLAUDE.md, CONTEXT.md, README.md, BUILDING.md, and PROTOCOL.md now point at the native code or the tag.
