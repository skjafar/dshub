# 21 — Settings schema migration

**What to build:** The upgrade path for people who already have data. Profiles carry across untouched — hand-built Maps, per-entry descriptions and units, and Command catalogues are irreplaceable and must never need re-entering. Dashboards, Workspaces, layouts and preferences reset, because the new interface earns fresh defaults and the old settings shape has no version to migrate from.

That reset must be announced. Someone opening the rebuilt application to find their Dashboards gone should read it as intended, not as data loss, and should be pointed at Profile export as the way to preserve work in future.

A schema marker is introduced at the same time, so the next change to this shape has something to migrate from — the absence of one is why this reset is necessary at all.

**Blocked by:** 08, 14

**Status:** ready-for-agent

- [ ] Existing Profiles load into the rebuilt application unchanged, with Maps, metadata and Commands intact
- [ ] Dashboards, Workspaces, layouts and preferences reset to defaults
- [ ] The reset is announced plainly on first launch after upgrade, and reads as intended rather than as loss
- [ ] A schema marker is written so future changes have a version to migrate from
- [ ] A stored blob from the old shape never crashes the application, whatever state it is in
- [ ] Retired theme identifiers land on a surviving theme
- [ ] Tests cover loading an old-shape blob, an absent blob, and a corrupt blob
