# 23 — Keyboard and contrast audit

**What to build:** The pass that turns per-ticket accessibility criteria into a verified commitment across the whole interface. Individual tickets each carried keyboard and contrast criteria; this one checks the seams between them, which is where such things actually fail.

Every Pane, Widget and dialog operable from the keyboard, with focus visible at all times and focus order that follows the visible arrangement rather than construction order. Dock manipulation — moving between Panes, closing, reopening — reachable without a pointer, which is the part no primitive library provides. Text and status colour clearing 4.5:1 across both themes, including the surfaces the third-party dock engine draws. Motion suppressed when the system asks for reduced motion.

**Blocked by:** 22

**Status:** ready-for-agent

- [ ] Every Pane, Widget and dialog is fully operable by keyboard
- [ ] Focus is visible at all times and focus order follows the visible arrangement
- [ ] Moving between, closing and reopening Panes is possible without a pointer
- [ ] Dialogs trap focus and restore it on close
- [ ] Text and status colour clear 4.5:1 in both themes, including third-party-drawn surfaces
- [ ] Reduced-motion preference suppresses pulsing and blinking indicators
- [ ] The contrast contract test covers the final palette as shipped
