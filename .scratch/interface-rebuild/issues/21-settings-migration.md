# 21 — Settings schema migration

**What to build:** The upgrade path for people who already have data. Profiles carry across untouched — hand-built Maps, per-entry descriptions and units, and Command catalogues are irreplaceable and must never need re-entering. Dashboards, Workspaces, layouts and preferences reset, because the new interface earns fresh defaults and the old settings shape has no version to migrate from.

That reset must be announced. Someone opening the rebuilt application to find their Dashboards gone should read it as intended, not as data loss, and should be pointed at Profile export as the way to preserve work in future.

A schema marker is introduced at the same time, so the next change to this shape has something to migrate from — the absence of one is why this reset is necessary at all.

**Blocked by:** 08, 14

**Status:** done

- [x] Existing Profiles load into the rebuilt application unchanged, with Maps, metadata and Commands intact
- [x] Dashboards, Workspaces, layouts and preferences reset to defaults
- [x] The reset is announced plainly on first launch after upgrade, and reads as intended rather than as loss
- [x] A schema marker is written so future changes have a version to migrate from
- [x] A stored blob from the old shape never crashes the application, whatever state it is in
- [x] Retired theme identifiers land on a surviving theme
- [x] Tests cover loading an old-shape blob, an absent blob, and a corrupt blob

## Comments

Implemented in `client/src/contexts/settingsMigration.ts`, which introduces
`schemaVersion`/`SETTINGS_SCHEMA_VERSION` on `UserSettings` and treats any
stored blob without the current version as the old, unversioned shape:
Profiles carry across (with a corrupt individual Profile entry dropped
rather than costing the whole collection), everything else resets to
defaults. A distinct `profilesCarriedOver` flag additionally covers the case
where the blob itself is unparsable or not an object at all — there,
Profiles are lost too, and `SettingsResetNoticeDialog` (opened once from
`AppChrome`, seeded from `SettingsContext`'s `justMigrated`) says so plainly
rather than reusing the "your Profiles are safe" copy that fits the ordinary
old-shape case. Verified end-to-end against the dev server with Playwright
(seeded old-shape blob → notice opens → Profiles dialog shows the carried
Profile → reload does not re-show the notice).
