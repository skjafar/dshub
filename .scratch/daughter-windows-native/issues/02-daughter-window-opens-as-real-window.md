# 02 — A Daughter Window opens as a real OS window, shows its Pane, and closes cleanly

**What to build:** using the existing "Move to new window" tab command, a Pane opens into a genuine, independent OS window — its own webview process, its own React tree — showing the same read-only link/Control chrome and add-Pane control the current mechanism already has. Closing it, natively or from the Main Window's Daughter Window list, or by losing its last Pane, behaves correctly. As part of the same change, the localhost HTTP server the previous mechanism required is deleted, and the Main Window reverts to loading over Tauri's own protocol.

**Blocked by:** `.scratch/rust-owned-polling/05`, `01` (this directory's own spike)

**Status:** ready-for-agent

- [ ] "Move to new window" opens a Pane into a genuinely separate OS window, not a same-realm popout
- [ ] The Daughter Window shows Device link state and Control state read-only, and offers exactly one control — add a Pane — nothing else
- [ ] Live device values (register/parameter updates, connection status) reach the Daughter Window correctly
- [ ] Closing the Daughter Window via its native OS close control destroys its Panes rather than relocating them to the Main Window
- [ ] A Daughter Window that loses its last Pane closes itself, including when that happens via a Pane being moved elsewhere (not only via an explicit close of the window itself)
- [ ] The Main Window's Daughter Window list can close and focus a Daughter Window correctly
- [ ] Opening a 5th Daughter Window still warns first, unchanged from today
- [ ] No localhost HTTP server starts on any build configuration; the Main Window loads over Tauri's own protocol
- [ ] `capabilities/default.json` no longer contains a dynamically-added "remote" capability
- [ ] Settings, Profiles and Workspaces persist correctly across an app restart — regression check, since port instability in the mechanism this replaces is exactly what broke this before (`83d6577`)

## Comments

This is the seam everything else in this directory sits on top of. It's also where both previously-patched production bugs (`c44120f`, `83d6577`) get their root cause removed rather than continuing to be worked around.
