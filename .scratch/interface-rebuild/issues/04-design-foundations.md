# 04 — Design foundations and primitive layer

**What to build:** The visual language and the component primitives everything else is assembled from. Two themes replace the current four: one dark, one light. Design tokens are published at runtime as custom properties, which is the single mechanism by which both first-party styles and third-party CSS-variable-themed libraries follow the theme. Components never hardcode a colour.

On top of that, the primitive layer: dialog, menu, select, popover, tooltip, tabs, slider and switch from headless primitives, plus the in-house table, text field and numeric input. Each styled, each keyboard operable, each with visible focus.

The type scale, density and the actual look are decided here — this is where the parked visual questions get answered, by building them and looking at them rather than describing them. A throwaway page showing every primitive in both themes is the deliverable that makes that judgement possible.

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] One dark and one light theme exist, switchable at runtime without reload
- [ ] Retired theme identifiers remap to a surviving theme so no stored preference orphans
- [ ] Status semantics are identical across every theme of a given mode
- [ ] No component hardcodes a colour value; all colour flows from the tokens
- [ ] Every primitive is operable by keyboard with visible focus, and dialogs trap focus
- [ ] The contrast contract passes on the new two-theme roster at 4.5:1
- [ ] A kitchen-sink page shows every primitive in both themes for review
