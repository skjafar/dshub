# 04 — Design foundations and primitive layer

**What to build:** The visual language and the component primitives everything else is assembled from. Two themes replace the current four: one dark, one light. Design tokens are published at runtime as custom properties, which is the single mechanism by which both first-party styles and third-party CSS-variable-themed libraries follow the theme. Components never hardcode a colour.

On top of that, the primitive layer: dialog, menu, select, popover, tooltip, tabs, slider and switch from headless primitives, plus the in-house table, text field and numeric input. Each styled, each keyboard operable, each with visible focus.

The type scale, density and the actual look are decided here — this is where the parked visual questions get answered, by building them and looking at them rather than describing them. A throwaway page showing every primitive in both themes is the deliverable that makes that judgement possible.

**Blocked by:** 01

**Status:** ready-for-agent

- [x] One dark and one light theme exist, switchable at runtime without reload
- [x] Retired theme identifiers remap to a surviving theme so no stored preference orphans
- [x] Status semantics are identical across every theme of a given mode
- [x] No component hardcodes a colour value; all colour flows from the tokens
- [x] Every primitive is operable by keyboard with visible focus, and dialogs trap focus
- [x] The contrast contract passes on the new two-theme roster at 4.5:1
- [x] A kitchen-sink page shows every primitive in both themes for review

## Comments

**The visual questions, answered by building them.** The type scale is eight
sizes centred on 13px rather than 16px, because the useful comparison for this
tool is a logic analyser rather than a web page and a screen holding two hundred
register rows earns its density. Sizes are in rem so OS text scaling still
works — density is a default, not a cage. Spacing is a 4px grid with half-steps
at the small end; the default control height is 28px, which is the largest value
that still lets a filter row, a header and a table share a pane without
scrolling.

**The two themes are one language, not two.** Blueprint's accents are Kinetic
Monolith's cyan/lime/gold taken to the lightness light paper needs, so the pair
reads as one instrument under two lighting conditions rather than two products.

**Three defects the review and the browser caught, all fixed here:**

- *Portals escaped their theme.* Dialogs, menus, selects, popovers and tooltips
  portal out of the React tree so an ancestor's `overflow` cannot clip them —
  and that escape also leaves a themed subtree, because tokens are inherited
  custom properties. The dialog rendered completely unstyled on the primitives
  page. `ThemeScope` plus `usePortalContainer` puts them back in scope.
- *Focus went nowhere on dialog close.* This dialog opens by state rather than
  through a Radix `Trigger`, and Radix restores focus to its trigger — so with
  none, a keyboard user was dropped back onto the document body. The opener is
  now captured at `onOpenAutoFocus` and restored explicitly.
- *Three of the light theme's accents failed AA.* The contrast contract only
  ever checked `primary`, and only on `surfaceContainer`. `secondary` and
  `tertiary` shipped at 3.60:1 and 3.55:1 on `surfaceHighest`, and `primary`
  itself was 4.25:1 on `surfaceHigh`. Every published accent is now checked on
  every surface, which is what caught it.

Placeholder text also lost the customary `opacity: 0.7`, which had taken it to
3.8:1 in the light theme. Placeholder text is text.

**Verified:** typecheck clean, 119 tests, ESLint 0 errors with no warnings in
new files, production build succeeds with the primitives page excluded. Driven
in a real browser: both themes side by side, overlays correct inside each scoped
theme, focus ring measured on a keyboard-focused control, and the application's
own Settings offering exactly two themes.

**Note for the reviewer of the next ticket:** whether the ring is *visible* is
deliberately not asserted in jsdom. jsdom loads no CSS and does not implement
`:focus-visible`, so such a test would pass against a stylesheet that draws
nothing. It is measured in the browser instead; the jsdom suite pins focus
*order* and operability, which it can answer honestly.
