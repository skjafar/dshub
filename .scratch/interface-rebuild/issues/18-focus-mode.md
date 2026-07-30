# 18 — Focus Mode

**What to build:** A single Dashboard shown full-canvas with its layout locked and the chrome minimised — the state left running on a screen beside equipment. This is what gives an Operator a genuinely calm surface without reintroducing persona modes.

Entering and leaving are both deliberate, single actions. Locked means locked: a stray drag during a shift must not rearrange the panel. Leaving must be possible but never accidental.

Status semantics carry more weight here than anywhere else in the application, because this is the surface read from across a room by someone who will act on what it says.

**Blocked by:** 14

**Status:** ready-for-agent

- [ ] A Dashboard can be shown full-canvas with chrome minimised
- [ ] Layout is locked in Focus Mode; Widgets cannot be moved, resized or reconfigured
- [ ] Entering and leaving are each a single deliberate action, and leaving is not accidental
- [ ] Connection and Control state remain visible despite minimised chrome, so a dropped link is never missed
- [ ] Which Dashboard is shown is remembered across sessions
- [ ] The mode is fully operable by keyboard, including leaving it
