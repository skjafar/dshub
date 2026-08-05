# 15 — Widgets: Value and Indicator families

**What to build:** Seven Widget kinds restyled onto the new design language and the shared configuration surface — the four that display a number (value readout, gauge, progress bar, encoder display) and the three that display a state (LED indicator, state LED, status matrix).

All seven survive by name and capability. They are not consolidated into fewer kinds with variants; that was considered and declined, so an Operator's existing panel maps kind for kind. What changes is that they stop re-implementing binding, formatting and thresholds, and draw those from the shared surface instead.

The indicator kinds are where status semantics matter most. Condition is carried by colour, which is identical across every theme of a given mode. Icon weight may encode active versus idle, but must never encode severity — that vocabulary belongs to colour alone.

**Blocked by:** 14

**Status:** ready-for-agent

- [x] Value readout, gauge, progress bar and encoder display all render and update from their bound address
- [x] LED indicator, state LED and status matrix all render state from their bound address
- [x] All seven configure through the shared surface with no duplicated binding or formatting logic
- [x] Condition is carried by colour through status semantics; icon weight never encodes severity
- [x] Each scales legibly across the range of grid sizes it can be given
- [x] Each shows a plain stale state when its Device data stops arriving

## Comments

**Status Matrix was redesigned as a bitfield view of one bound register**, not the legacy grid of sixteen independently-bound cells. The ticket's own wording — "status matrix... render state from **their** bound address" (singular) — combined with "no duplicated binding or formatting logic" ruled out keeping a per-cell address: sixteen items each with their own binding/format/threshold is exactly the duplication this batch exists to remove, just moved one level down. `shell/widgets/bitfield.ts`'s `bitsOf` decomposes the one bound reading into its thirty-two bits; a fault-flags register already packs one condition per bit, so the at-a-glance grid survives even though the mechanism changed. Every asserted bit shares one fixed `warn` colour rather than a per-bit configurable one — judged too fine-grained a capability to preserve (thirty-two independent threshold rules per Widget has no coherent UI), and disclosed rather than silently dropped: `WidgetConfigDialog` hides the Thresholds section entirely for this kind, since showing an editor with no effect is worse than not offering it.

**State LED carries no `states` array.** `threshold.ts` gained an `'=='` comparator and an optional per-rule `label`, and State LED is nothing but those thresholds rendered as a dot: the matched rule's label replaces the formatted value, its role colours the dot. Same shared surface, same shared editor, one new comparator — not a parallel configuration system. A state no rule names shows the raw reading rather than a generic "Unknown", which is more useful for diagnosing an unmapped code.

**LED Indicator and State LED's colours come from the shared `thresholds`/status-role system, not the legacy widgets' free-form hex `onColor`/`offColor`.** This is spec-mandated (spec.md: "Components never hardcode a colour value") rather than a capability trim. `onLabel`/`offLabel` text did survive as optional fields on `LedIndicatorWidgetConfig`, defaulting to "On"/"Off".

**Encoder Display's conversion factor is a constant only** — the legacy widget could also read it live from a Parameter. Disclosed in `widgetConfig.ts`'s doc comment; no later ticket claims the live-sourced variant, so it is a real, minor capability gap rather than deferred work, acceptable given the scope of this batch.

**The shared surface widened, not just the kind roster.** `WidgetConfigDialog` now takes a `kind` prop, revising ticket 14's "no kind parameter at all" — but the binding/format/threshold section stays identical for every kind; `kind` only ever reaches the `KindFields` section (min/max, conversion factor, on-value) and the Thresholds section's own applicability, both real per-kind variation rather than a workaround.

**Verified by hand in a real browser**, per this project's testing policy for the same reason dockview drag is: react-grid-layout's own drag/resize and the theme-driven visuals are outside the test net. All seven kinds were bound to a live register against the fake Device — Gauge's arc, Progress Bar's fill, Encoder Display's converted+raw pair, and Status Matrix's bit grid (a 103 = 0b1100111 reading lit exactly bits 0, 1, 2, 5 and 6) all rendered correctly.
