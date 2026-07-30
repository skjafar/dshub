# 19 — Map Editor Pane and Profile management

**What to build:** Editing a Map as a Pane, so an Engineer can revise entry names, types, access and metadata while watching the Registers those entries name — which the current full-screen editor makes impossible. Entry reordering keeps working as it does today.

Alongside it, Profile management: creating, switching, importing and exporting Profiles. These are configuration tasks rather than working tools, so they are dialogs rather than Panes. A Profile carries Maps for every Address Space, its Commands, its per-entry metadata, its Dashboards and its Workspaces — switching one re-skins the whole application for a different board.

Profile files use the existing versioned portable format. Import must reject a malformed or unversioned file with a clear reason rather than partially applying it.

**Blocked by:** 06

**Status:** ready-for-agent

- [ ] A Map Editor Pane edits entry names, types, access and metadata alongside other Panes
- [ ] Entry reordering works as it does today
- [ ] Profiles can be created, switched, imported and exported
- [ ] Switching Profile re-skins the application, including its Maps, Commands, Dashboards and Workspaces
- [ ] Import rejects malformed or unversioned files with a clear reason and applies nothing
- [ ] Export produces a file the existing versioned format can read back
- [ ] Map and Command exports go through the port
