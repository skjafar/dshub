# egui migration and acceptance

Developed on `claude/egui-rebuild` and merged into `master`. The former Tauri/React application was removed afterwards; its sources are kept at the `tauri-reference` tag.

## Active application

The root Cargo package is the application. Run `cargo run --locked` or the optimized `target/release/dshub` executable. Rust 1.95+ is required by the locked dependency set. No Node.js, Tauri, WebKit or WebView2 participates in the native build.

The existing backend was ported into `src/backend/` with mechanical integration changes: ordinary Rust state references, Tokio task handles/spawning and an in-process event handle. Native window ownership moved to the egui shell. Its transport, packet, reconnect, heartbeat, rate-limit and polling behavior is retained for the separately requested backend review.

## Implemented application surfaces

| Surface | Native implementation |
|---|---|
| Link and discovery | UDP scan, discovered-device selection, TCP/UDP connect/disconnect, Take Control, connection/control status, startup scan/connect and retry preferences |
| Data panes | Searchable Registers, Parameters and read-only System Registers as tables; manual/live reads of the rows in view; DEFAULT (declared type), decimal, hex and binary views; engineering units and write limits from metadata; in-place editing with unsent values outlined; validated writes and device outcomes; CSV export |
| Inspector | Shared selection, raw address reads, signed/unsigned/float/hex/binary decoding, entry metadata and plot/write actions |
| Commands | Profile and built-in commands, integer arguments, confirmation (press-and-hold for critical commands), acknowledgements/refusals, custom code entry, Ctrl+K command palette |
| Plot | Independent trace selections per Plot pane, typed decoding, retained samples, pause, live following, zoom/pan, crosshair read-out, legend, PNG and CSV export, CSV recording with offline replay |
| Dashboards | Named dashboards, duplicate/delete/rename, canvas positions on a snapping grid, selection, keyboard nudge, layout undo/redo, bindings, formats, thresholds, controls, nested containers and all sixteen widget kinds |
| Profiles | Default and CNC bundled maps, CNC commands/metadata, create/duplicate/rename/delete, one file per Profile, version-one import/export and native dashboard preservation |
| Map Editor | Separate drafts, add/edit/import/export maps, firmware C headers, command-map import/export and command header export, board type definitions and entry metadata; unsaved fields outlined; save/revert without overwriting dashboard changes |
| Binding review | Name/type/array-extent/address identity; stopped polling/writes on drift; explicit follow-entry or keep-address rebinding; profile-wide review including hidden/nested widgets |
| Shell | Docking/splits, pane reopening, singleton panes, duplication, focus mode, genuine native windows titled with device and Profile, moving panes between windows, return-to-main on daughter close and automatic closing of empty daughters |
| Persistence | Themes/preferences, per-Profile current layouts, named Workspaces, dashboards, plot definitions and native window geometry; versioned settings schema with migrations; unreadable files are backed up, never discarded |

The application stores its own native settings. It does not automatically read WebView localStorage or convert dockview layouts. Use `.dshub-profile` export/import to bring existing Profiles and dashboards across. Live device state and plot samples are intentionally not persisted.

## Automated evidence

- 93 Rust tests pass, including packet/polling tests retained from the backend and native domain/UI regression tests.
- The Map Editor regression drives actual egui button input through Add entry and Save Profile, then verifies the Profile changed only on Save.
- All pane and widget kinds render in both connected and offline headless tests. Additional tests cover dashboard wrapping, native storage roundtrips, hidden/nested binding review, preserved concurrent dashboard edits, write refusal/acknowledgement/timeout and connection-change cancellation and independent per-pane trace selection.
- The real Python emulator integration passes over TCP and UDP: Control, register and float parameter reads/writes, command code zero, refused read-only writes and subscription polling.
- Native exports containing all sixteen widget kinds passed the former application's TypeScript Profile validator (at the `tauri-reference` tag) with no errors and import back into Rust with all kinds retained. `examples/export_profile.rs` generates a portable fixture or imports/re-exports a file passed as its argument.
- `tests/conformance.rs` replays `tests/protocol-vectors.json` against the emulator.
- Formatting, Clippy with warnings denied, and the optimized Linux build pass. The dependency graph contains no Tauri or WebKit packages.

## Reproduce native rendering checks

On a Linux desktop with Python 3 and free TCP 2009 / UDP 2011:

```sh
bash tests/native-smoke.sh                       # all scenes, screenshots in target/native-smoke/
bash tests/native-smoke.sh registers editor      # only the named scenes
bash tests/native-smoke.sh /tmp/smoke plot log   # another output directory
```

The harness uses a separate Cargo target directory and isolated application storage. It starts the emulator, opens eighteen native scenes, asserts a live controlled connection, captures screenshots and exits each scene. It verifies that the requested fixture was actually loaded. Scenes cover Registers, Parameters, System, Commands, Inspector, Log, Plot, Map Editor, Dashboards (widgets, CNC panels and edit mode), Binding review, a genuine daughter viewport, the full default workspace in dark and light themes, and the Profiles, Preferences and Guide windows.

The `native-smoke` feature is opt-in and is not part of the release build. The normal application does not seed demonstration widgets or automatically take Control.

## Acceptance still required

Linux compilation, automated UI/device checks and rendered layout inspection do not establish complete workflow parity on every platform. Before the first native release, exercise the engineer/operator workflows on Windows and macOS, native dialogs, multi-monitor window movement/restoration, prolonged reconnect/polling load and physical hardware. The CI matrix is configured for those platforms but has not run from this local checkout.

Native release packaging supplies archives, a macOS app bundle (signed and notarized when certificates are configured) and a Debian package. Windows installers and RPM packaging are not built. The `dshub-bin` AUR package installs the 0.3.0 Linux release.

The user's backend-only review has not been performed. Keep that review separate from native interface acceptance.

### Dashboard canvas editing

Widgets retain their canvas coordinates and dimensions in both viewing and editing
modes. In **Edit dashboard**, drag the top of a widget to move it, drag any edge
or the bottom-right corner to resize it, and hover to reveal **Configure**.
Configuration opens in a separate floating window and applies immediately; Width,
Height, X, and Y are also editable numerically there. Container children use their
own coordinates relative to their container. Overflow remains accessible through
scrolling. Device-action buttons are disabled while editing. Positions are stored
in native profiles and session persistence; version-one exports from the former
application still use their legacy grid arrangement.

Positions and sizes snap to an 8-pixel grid, drawn as dots while editing. Click
selects a widget, Ctrl/Shift-click adds to the selection, arrow keys nudge the
selection, Delete removes it, and Undo/Redo step through layout changes.

While editing, hover a widget to reveal its top-left remove button. Dragging into
a container highlights its content area; releasing transfers the widget into
that container. Dragging out onto the dashboard removes that containment.
Containers cannot be dropped into themselves or their descendants. Sibling widgets and containers stay fixed during dragging. A horizontal or
vertical insertion line previews the destination; red means there is no room.
Only releasing above an item shifts items in the affected column downward. Side insertions may shift one neighbor sideways on release when that neighbor
has space without hitting other items or the canvas edge; otherwise blocked
drops return to their starting position. The moving widget is drawn above container clipping during preview.

Binding selection supports search by name, address, type, and address space.
Drag the results panel's bottom resize handle to expand it vertically; large
result sets scroll without rendering every row at once.

Dashboard sessions always start in normal mode. The edit hint appears beside the
edit toggle only while editing is disabled. Edge resizing softly snaps within
eight pixels of content-fit dimensions and sibling sizes; dragging farther
overrides the snap. Neighbors stay fixed until resize release, then move only
as far as needed horizontally or vertically.

Map Editor rows can be reordered by dragging their address handles. Reordering
stays within the same read/write access section; system registers remain fixed.
