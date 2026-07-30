# No component library — Radix primitives and CSS Modules

DSHub had MUI in 69 of 109 source files with inline `sx` styling in 64 of them, which made the visual language impossible to change in one place and put Emotion's runtime style construction on the render path of views that update every 50 ms. We removed MUI entirely. Behaviour that is genuinely hard to get right — dialog, menu, select, popover, tooltip, tabs, slider, switch — comes from Radix; everything else is our own CSS Modules reading the design tokens that `App.tsx` publishes as CSS custom properties.

A future reader will find no component library here and should not add one back. The absence is the decision.

## Considered Options

Keeping MUI behind a confining primitive layer would have fixed the sprawl for much less work, and upgrading to MUI 9 (the project sat on 7.3.2) was the fastest route to a working app. Both were rejected: the brief was a visual identity that does not read as generic enterprise software, and bending Material toward industrial density means every component is an override of an opinion we do not hold. Base UI was rejected as a foundation because it was still `1.0.0-rc.0`. react-aria-components has the most rigorous keyboard and accessibility behaviour of the candidates and remains the alternative worth revisiting if Radix proves thin.

vanilla-extract would have made a missing token a compile error, which is a real guardrail across this much new code. CSS Modules won because Vite supports it with no plugin and no runtime, and because colour continues to flow from `design/` through custom properties — keeping the rule that components never hardcode a hex value.

## Consequences

Table, text field and numeric input are ours to build. That is less painful than it sounds, because DSHub's inputs were already bespoke — thumbwheel entry, hex fields, tabular numerics.

Icons come from Phosphor, whose weight axis encodes state: outline for idle, filled for active. Weight must never encode severity. Colour owns that vocabulary, and the status ramp is identical across every theme of the same mode precisely so an Operator's read of machine state does not shift with a theme change.

Plotting moved from Chart.js to uPlot in the same pass. uPlot is an eleventh of the size, is built for live time-series at the tens-of-thousands-of-points scale this app retains, and syncs a cursor across chart instances — which is what makes several Plot panes in one Workspace feel like one instrument rather than three. The cost is imperative integration with no official React wrapper.

Accessibility is a commitment rather than best effort: contrast is enforced at 4.5:1 by test across the theme roster, and every Pane, Widget and dialog is keyboard operable. Note that `.impeccable.md` still claims no hard WCAG level requirement; it contradicts this decision and is corrected in the rebuild's final documentation pass, not before.
