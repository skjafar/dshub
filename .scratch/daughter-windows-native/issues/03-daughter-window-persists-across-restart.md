# 03 — A Daughter Window persists across an app restart

**What to build:** a Daughter Window's arrangement — which Panes, in what layout, at what position and size — is saved as part of its owning Workspace and restored on the next launch, with no user gesture required for that to succeed.

**Blocked by:** 02

**Status:** ready-for-agent

- [ ] Closing and relaunching the app restores every Daughter Window that belonged to the active Workspace, at its saved position and size
- [ ] Switching Workspace closes the outgoing Workspace's Daughter Windows and opens the incoming one's
- [ ] A Workspace with no Daughter Windows opens with none
- [ ] A Workspace saved under the old (pre-native) dockview-popout format resets cleanly on first load under the new format, rather than erroring or partially restoring
- [ ] No blocked-restore / "reopen windows" recovery flow exists anymore — restoring a saved Daughter Window is not gated on a user gesture, since `WebviewWindowBuilder` doesn't need one
- [ ] A window that genuinely fails to open at restore (an OS-level resource failure) surfaces an error to the user rather than silently vanishing
