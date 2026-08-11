# 01 — Popout mechanism spike

**What to establish:** whether dockview's popout windows can work inside Tauri on every platform the build matrix targets. This gates the entire feature and the per-Window Focus Mode rework behind it. Nothing else is built until this returns a verdict.

**Status:** ready-for-agent

Two questions, asked strictly in order, because the first has no workaround and the second does.

**Phase 1 — does `window.open` work?** Establish whether `window.open` returns a usable, same-origin `Window` object inside Tauri's webview on Windows (WebView2), macOS (WKWebView) and Linux (WebKitGTK). WKWebView only creates windows if the host implements `WKUIDelegate.createWebViewWith`, and whether Tauri does is the crux. A host webview that refuses cannot be worked around from JavaScript, so if this fails on any platform the feature is dropped.

This needs the packaged desktop app on each platform, not `npm run dev` — `createBackendPort.ts` serves the fake port to any plain browser session regardless. The macOS and Linux runs need CI runners or real hardware; `.github/workflows/build.yml` already has the matrix to build on.

**Phase 2 — the origin problem, only if phase 1 passes.** dockview's `assertSameOriginPopoutUrl` requires the document protocol to be `http:` or `https:`:

```js
var protocolOk = resolved.protocol === 'http:' || resolved.protocol === 'https:';
if (!protocolOk || resolved.origin !== globalThis.location.origin) { throw ... }
```

Tauri serves from `http://tauri.localhost` on Windows but `tauri://localhost` on macOS and Linux, where this throws unconditionally. The candidate resolution is serving the frontend over `http://localhost:PORT` from the Rust side on every platform, which satisfies the assertion without touching anyone else's package but changes how the whole application is served and exposes the assets to any local process on that port. Patching or forking dockview was considered and rejected.

- [x] Phase 1 verdict recorded per platform: does `window.open` return a usable same-origin `Window` under Tauri — **Windows: yes, confirmed by hand against a production binary, once `on_new_window` was wired (wry denies it unconditionally without that handler — see the ADR amendment). Linux/macOS: not run; `.github/workflows/popout-spike.yml` exists for the branch owner to trigger.**
- [x] If phase 1 passes on all three, phase 2 establishes whether a Rust-side localhost HTTP server makes the origin acceptable on all three — **Windows: yes, `tauri-plugin-localhost` confirmed against `cargo build --features custom-protocol`. Linux/macOS: pending the same CI run.**
- [x] A popout is confirmed to render an adopted DOM subtree and receive the opener's stylesheets — **on Windows.**
- [ ] Cross-window drag of a Pane between the main grid and a popout is confirmed to work — **not yet exercised; there is no drag-out gesture to test until issue 03 builds it.**
- [x] The verdict is written back into `docs/adr/0004-panes-pop-out-through-dockview-popout-windows.md` as an amendment, whichever way it goes

If either phase fails, that is a complete and useful result: record it and close the feature. The ADR exists so a future reader finds out why DSHub has no pop-out rather than rediscovering the blocker.

**Where this actually landed.** Windows passes both phases outright, and the
failure mode issue 01 was actually worried about — a host webview that
silently declines to create windows — was real, just not platform-specific:
Tauri/wry's WebView2 backend denies `window.open` by default unless the app
registers `on_new_window`. Reading wry's other two backends shows the same
handler routes to WebKitGTK's own new-window signal on Linux and to
`WKUIDelegate.createWebViewWith` on macOS — the exact method this issue named
as the crux — so the fix is not a Windows-only workaround. Linux and macOS
remain formally unconfirmed: this machine cannot reach either (WSL2 refused
to start under this session's logon policy; there is no macOS hardware
available). The branch owner has directed that issues 02 and 03 proceed on
the working assumption that the CI job confirms both when run, rather than
blocking on it.
