# Panes pop out through dockview's popout windows, or not at all

A Workspace is currently one arrangement in one window. Both personas want more: an Operator parks a Plot and a status Pane on a second monitor for a shift, and an Engineer breaks a Pane out to see it large and re-docks it. The requirement that decides the design is that a Pane must be draggable from one window into another, and that whatever windows exist are part of the Workspace — saved with it, restored with it, and gone when a different Workspace is loaded.

This introduces three terms. A **Window** is one operating-system window displaying some of a Workspace's Panes. The **Main Window** is the one carrying app identity, Device connection and Control, and Pane/Workspace/Profile management. A **Daughter Window** is any other: it shows the Device's link and Control state read-only, offers a control to add Panes, and otherwise contains nothing but Panes. A Daughter Window belongs to the Workspace, not to the Profile and not to the session, so switching Workspace closes the outgoing Workspace's Daughter Windows and opens the incoming one's. These terms are deliberately not yet in `CONTEXT.md`; that file describes what DSHub is, and this decision is gated on a spike that may end with none of it existing.

Two mechanisms were available. Tauri can build a second `WebviewWindow`, which is a first-class OS window but a separate JavaScript realm. That is disqualifying rather than merely expensive. A second realm loads its own copy of the bundle and therefore its own `pollRegistry`, and two registries polling the same address issue two requests for it — the exact duplication ADR 0003 freezes the data path to prevent, on a link that is strictly request/response and pays for every duplicate in latency. Avoiding that would mean a proxy port and a remote-registry client, which is a redesign of the frozen half by another name. Separately, two webviews share no drag session, so the mandatory cross-window drag has no mechanism at all.

dockview 7.0.4 already ships the alternative. `addPopoutGroup` opens a same-origin `window.open` document and adopts the group's DOM into it, so the popout is a separate `Window` but the *same* JavaScript realm: one React tree, one `DSHubProvider`, one `pollRegistry`, one `paneState` store, one Workspace selection. Every cross-window state problem the Tauri path would have created simply does not arise, and the frozen data path is untouched. Cross-window drag is native. Each popout hosts its own nested gridview, so a Daughter Window arranges Panes as the Main Window does rather than holding a single tab strip. `SerializedDockview` already carries a `popoutGroups` field with each window's grid and screen position, and `StoredWorkspace.dockLayout` is already that type filled by `api.toJSON()` — so "the Daughter Window is stored with the Workspace" costs nothing.

The mechanism is nonetheless unproven here, and the decision is gated on establishing two things in that order. First, whether `window.open` returns a usable same-origin `Window` inside Tauri's webviews on all three platforms the build matrix targets — WebView2 on Windows, WKWebView on macOS, WebKitGTK on Linux. A host webview that refuses to create a window cannot be worked around from JavaScript, so this question is asked alone and first. Second, and only if the first passes, the origin problem: `assertSameOriginPopoutUrl` requires the document's protocol to be `http:` or `https:`, and Tauri serves from `http://tauri.localhost` on Windows but `tauri://localhost` on macOS and Linux, where that assertion throws unconditionally. Serving the frontend over `http://localhost` from the Rust side on every platform would satisfy it without touching anyone else's package, at the cost of changing how the whole application is served rather than only how it pops out.

If the mechanism cannot be made to work on all three platforms, the feature is dropped rather than shipped Windows-only, and rather than obtained by patching or forking dockview. Parity is treated as non-negotiable because a Workspace is saved user data: a layout containing Daughter Windows that silently collapses into the Main Window on another platform is a worse failure than not offering the capability. Nothing is implemented ahead of the spike, including the changes below that look independent of it.

## Consequences

Focus Mode stops being an application state and becomes a property of a Window. It is entered only from a Dashboard, it affects only the Window whose Dashboard it was entered from, and the Main Window's chrome loses its Focus Mode button. This is forced rather than chosen: `enterFocusMode` currently unmounts the Workspace, which would destroy every Daughter Window, and exiting would attempt to reopen them through a delayed restore that has lost its user-gesture window. Focus Mode on the Main Window with Panes parked on a second monitor is the Operator's actual setup, so the two features have to compose.

Two behaviours deliberately override dockview's defaults, and both need care. Closing a Daughter Window destroys its Panes, where dockview would relocate them into the main grid; this is `skipPopoutReturn` and is a real override, not a free pick. And when a popout is blocked while restoring — which is normal, since restore has no user gesture behind it — dockview redocks the orphaned groups into the main grid, whereupon autosave would write that redocked layout back over the stored Workspace within 400ms and erase the arrangement permanently. Autosave must therefore be frozen on a blocked restore, and the user offered an explicit retry, which succeeds because the click supplies the gesture the automatic attempt lacked.

Dragging a Pane out of a Window to create a Daughter Window is the only genuinely new code. dockview has no such gesture; it must be built from `dragend` screen coordinates tested against the window bounds, then `addPopoutGroup` with that position. `dragDropEnabled: false` in `tauri.conf.json` is already the setting this needs, since Tauri's native drag-drop would otherwise swallow the HTML5 drag.

Theme and portals reuse machinery that already exists for a different reason. `ThemeScope` and its `PortalContainerContext` were built so the primitives page could show both themes at once, and they are exactly what keeps a Radix menu opened inside a Daughter Window from portalling to the Main Window's `document.body` on another monitor; `applyThemeVariables` already takes its root element as a parameter. `popout.html` becomes a second Vite build input and must be bundled.

The per-Pane behaviours this feature also settles — the window count cap, what the Daughter Window's top bar contains, how singleton Panes appear in the other Window's menu, the Main Window's list of open Daughter Windows — are product detail rather than architecture and belong in the issue, not here.

## Amendment: issue 01's verdict (2026-08-09)

**Windows: confirmed, both phases, by hand against a real production binary.**
`window.open` — and dockview's `addPopoutGroup` through it — does not work
under Tauri's WebView2 host with the framework's own defaults. The cause
was not a popup blocker or a missing user gesture (both were tested and
ruled out): wry's WebView2 backend denies every `NewWindowRequested` event
unconditionally unless the host app supplies an `on_new_window` handler on
the window builder, and this project never had. Once wired (`lib.rs`),
`addPopoutGroup` succeeds even from an ungestured call — confirming this was
the host webview declining by default, not a platform incapability, and
answering phase 1's Windows question outright.

Phase 2 is also confirmed on Windows: `tauri-plugin-localhost` serves the
bundled frontend over real `http://localhost:<port>`, the window is built
programmatically against that origin (`WebviewWindowBuilder`, replacing the
static declaration `tauri.conf.json` used to carry), and `dynamic-acl`'s
`add_capability` grants that origin the same IPC access the custom-protocol
origin has by default. Verified against `cargo build --features
custom-protocol` — the same feature flag `cargo tauri build` passes — not
just `cargo tauri dev`, since dev's `http://localhost:3000` origin would have
trivially passed the assertion regardless and proven nothing about
production. The full finding set passed: same-origin document access,
adopted-DOM presence, the opener's stylesheets copied across, custom
property writes, and a correct `popoutGroups` round-trip through
`api.toJSON()`.

**Linux and macOS: not independently confirmed, for reasons outside the
implementer's control, but the risk is now materially lower than issue 01
assumed.** Neither platform was reachable from the Windows machine this work
was done on: WSL2 (the offered fallback for Linux) refused to start with a
host logon-policy error (`Wsl/Service/CreateInstance/CreateVm/HCS/0x80070569`
— the session lacks the sign-in rights Hyper-V's VM host service requires),
and there is no local path to macOS at all.
`.github/workflows/popout-spike.yml` builds and runs the same spike on both
platforms and is included in this branch, but per the explicit decision made
before this work started, it has not been run — that is left for the
branch owner to trigger by hand (`workflow_dispatch`) and confirm.

What *is* established, from reading wry 0.54.4's source rather than running
it: the fix that unblocked Windows is not a WebView2-specific workaround.
`on_new_window` is Tauri's one cross-platform entry point over three
different native mechanisms wry implements per backend — WebKitGTK's
`new_window_req_handler` on Linux, and, concretely for macOS,
`WryWebViewUIDelegate`'s `webView:createWebViewWithConfiguration:​forNavigationAction:windowFeatures:`,
which *is* the `WKUIDelegate.createWebViewWith` implementation this ADR's
own opening section named as the exact crux for WKWebView. Tauri already
carries that implementation; this project had simply never called the API
that activates it. This does not make Linux and macOS a confirmed pass — a
prior assumption about a webview's behaviour is exactly the kind of thing
this issue exists to stop taking on faith — but it substantially narrows what
running the CI job is actually expected to find.

Per the branch owner's explicit instruction, issues 02 and 03 proceed now
rather than waiting on that run, on the working assumption that Linux and
macOS confirm as expected. If the CI job comes back negative on either
platform, that is the trigger to revisit — per this issue's own rule, a
platform-partial pass is not a shippable one.
