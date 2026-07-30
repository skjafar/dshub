# 08 — Named Workspaces and persistence contracts

**What to build:** Workspaces become saveable, named artifacts belonging to a Profile, so rearranging Panes to chase a bug never destroys the arrangement kept for monitoring. A Profile owns several, one marked default, switchable from the chrome. Reopening the application restores the last Workspace exactly, including each Pane's own filter and selection — restoring a layout must restore what the Panes were actually showing, not empty Panes in the right places.

Because a stored Workspace embeds a third-party serialization format, corruption is a real failure mode rather than a theoretical one. An unrecognised or damaged stored layout must degrade to the default Workspace, never to a blank screen.

**Blocked by:** 06

**Status:** ready-for-agent

- [ ] The current arrangement can be saved as a named Workspace
- [ ] Named Workspaces can be switched, renamed and deleted from the chrome
- [ ] One Workspace is marked default and is what a Profile opens into
- [ ] Reopening the application restores the last Workspace, including per-Pane filter and selection
- [ ] Multiple Panes of the same kind restore with their state correctly separated
- [ ] Round-trip contract tests assert save-then-restore reproduces Panes, arrangement, filters and selections
- [ ] A corrupt or unrecognised stored layout degrades to the default Workspace
