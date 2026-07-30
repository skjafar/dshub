# Spec — Interface Rebuild

Status: ready-for-agent

## Problem Statement

DSHub presents twelve full-screen views behind a fixed sidebar. Only one is visible at a time, so an Engineer chasing a fault cannot watch a Plot and the Register driving it together — they navigate back and forth, holding values in their head across the switch. The same flat list confronts an Operator with twelve destinations when three matter, and puts destructive Address Space editors at the same level as About.

The interface also cannot be changed in one place. Styling is inlined across most of the view layer rather than expressed in the design modules, so a change to the visual language means touching dozens of components and hoping none were missed. Four themes multiply that cost by four. Two words in the interface mean two things each: "Dashboard" names both the unauthored device-health surface and the user-composed instrument panel, and "Profile" reads as a user account when it is a Device personality.

Underneath, the runtime cost lands on exactly the wrong surfaces. Styles are constructed during render on views that update as often as every 50 ms, and the plotting engine is a general-purpose charting library carrying eleven times the weight of one built for live time-series.

## Solution

Replace the sidebar and its view router with a **Workspace**: a dockable arrangement of **Panes** that can sit side by side. Several Panes of the same kind may be open at once, each with its own filter and selection, so two Address Spaces can be compared or three Plots watched together. A shared Inspector Pane follows the active selection instead of being embedded separately inside each data surface.

A **Profile** owns several named Workspaces, one of them default, so rearranging Panes to chase a bug never destroys the arrangement kept for monitoring. Connecting to a Device stops being a destination and becomes a flow launched from the chrome, since nobody returns to it once connected.

The composed **Dashboard** is not dissolved into Panes. It stays a discrete artifact belonging to a Profile, with its own internal Widget grid, and gains **Focus Mode** — full-canvas, layout locked, chrome minimised — the state left running beside equipment.

The component library is removed. Behaviour that is hard to get right comes from headless primitives; everything else is component-scoped CSS reading design tokens published as custom properties. Two themes replace four. Plotting moves to an engine built for this workload, with a cursor synchronised across Plot Panes.

## User Stories

1. As an Engineer, I want to open a Register Pane and a Plot Pane side by side, so that I can watch a value change while I read the trace it produces.
2. As an Engineer, I want to open two Register Panes with different filters, so that I can compare two subsystems without re-filtering between glances.
3. As an Engineer, I want to open three Plot Panes at once, so that I can correlate several signals during a single motion event.
4. As an Engineer, I want a crosshair I move in one Plot to appear at the same instant in every other Plot, so that I can read several signals at one moment in time.
5. As an Engineer, I want to drag a Pane to a new edge of the Workspace, so that I can arrange tools to match the task rather than the application's opinion.
6. As an Engineer, I want to resize Panes by dragging their shared border, so that I can give the surface I am reading the space it needs.
7. As an Engineer, I want to close a Pane I am done with, so that the Workspace stays legible.
8. As an Engineer, I want to reopen a closed Pane from a single visible affordance, so that closing something is never a decision I have to think twice about.
9. As an Engineer, I want Panes of the same kind to be distinguishable in their tab, so that two Register Panes are not an identical pair I have to click to tell apart.
10. As an Engineer, I want a single Inspector Pane that shows the entry I most recently selected in any data Pane, so that I do not need one Inspector per surface.
11. As an Engineer, I want the Inspector to decode the selected value as hexadecimal, binary and float alongside its decimal reading, so that I can interpret a raw word without external tools.
12. As an Engineer, I want the Inspector to state an entry's Address Space, type and access, so that I know whether writing to it is even permitted.
13. As an Engineer, I want to save the current arrangement as a named Workspace, so that I can return to it after working on something else.
14. As an Engineer, I want to switch between named Workspaces from the chrome, so that changing task takes one action rather than a rebuild.
15. As an Engineer, I want one Workspace marked default, so that opening a Profile puts me somewhere sensible without a choice.
16. As an Engineer, I want my Workspace restored exactly as I left it when I reopen the application, so that no arrangement work is repeated.
17. As an Engineer, I want each Pane to remember its own filter and selection inside a saved Workspace, so that restoring a layout restores what the Panes were actually showing.
18. As an Engineer, I want to rename and delete named Workspaces, so that the list reflects how I actually work.
19. As an Operator, I want a Dashboard I can put into Focus Mode, so that a screen beside the equipment shows only machine state.
20. As an Operator, I want Focus Mode to lock the layout, so that a stray drag cannot rearrange the panel during a shift.
21. As an Operator, I want to leave Focus Mode by a single deliberate action, so that returning to the Workspace is possible but not accidental.
22. As an Operator, I want an Overview surface reporting the Device's own identity, uptime, link state and recent activity, so that I can judge health without composing anything.
23. As an Operator, I want ok, warn and error to look identical in every theme of the same mode, so that my read of machine state never depends on a display setting.
24. As an Operator, I want status meaning carried by colour and never by icon weight, so that one visual channel owns condition unambiguously.
25. As an Operator, I want the connection state and which interface holds Control visible at all times, so that I always know whether what I am seeing is live.
26. As an Operator, I want a clear signal when the link drops, so that I never read a stale value as a current one.
27. As an Engineer, I want to connect to a Device from the chrome rather than a navigation destination, so that connecting does not occupy a permanent slot I never revisit.
28. As an Engineer, I want to scan for Devices and pick from what was discovered, so that I do not need to type an address I can be shown.
29. As an Engineer, I want to claim Control explicitly, so that I know when reads and writes will be accepted.
30. As an Engineer, I want to read and write Registers from a Pane, so that I can drive hardware during development.
31. As an Engineer, I want to read and write Parameters from a Pane, so that I can change configuration that survives a power cycle.
32. As an Engineer, I want System Registers presented as readable and never writable, so that the protocol-owned space cannot be corrupted by mistake.
33. As an Engineer, I want to see each entry's name, type and access from its Map rather than a bare address, so that I can work in the Device's own vocabulary.
34. As an Engineer, I want to filter a data Pane by name or address, so that I can find one entry among hundreds.
35. As an Engineer, I want to choose decimal, hexadecimal or binary display per surface, so that I can read a value in the form its meaning lives in.
36. As an Engineer, I want numeric values aligned on tabular figures, so that a digit changing does not shift the column.
37. As an Engineer, I want a value I have typed to be exactly what gets written, so that a live update arriving mid-edit can never overwrite my input before it commits.
38. As an Engineer, I want writes committed by both keyboard and pointer to behave identically, so that the commit path cannot change what reaches the hardware.
39. As an Engineer, I want to send a Command to the Device from a Pane, so that I can trigger operations that are not value writes.
40. As an Engineer, I want Commands presented by name from the Profile, so that I am not entering numbers from a separate document.
41. As an Engineer, I want an Activity Log Pane docked without leaving the surface I am working on, so that I can watch traffic while I work.
42. As an Engineer, I want to filter the Activity Log by category and level, so that I can find the one exchange that matters.
43. As an Engineer, I want packet traffic available as a filter of the Activity Log, so that hex dumps are reachable without a separate destination.
44. As an Engineer, I want an unread indicator on the Activity Log, so that I notice new events while looking elsewhere.
45. As an Operator, I want to compose a Dashboard from Widgets bound to addresses, so that I can build the panel my equipment needs.
46. As an Operator, I want every Widget kind available today to still exist, so that no panel I have built becomes impossible to rebuild.
47. As an Operator, I want to place and resize Widgets on a grid inside the Dashboard, so that layout expresses relative importance.
48. As an Operator, I want several Dashboards per Profile, so that different aspects of a machine each get a panel.
49. As an Operator, I want a Widget bound to an address to configure its binding, format and thresholds the same way whatever kind it is, so that learning one Widget teaches me the others.
50. As an Operator, I want a Widget that loses its Device data to say so plainly, so that I never read a frozen value as a live one.
51. As an Engineer, I want plotting to stay responsive with tens of thousands of retained points, so that a long capture does not degrade the interface.
52. As an Engineer, I want to pause and resume plotting, so that I can examine a trace without it moving under me.
53. As an Engineer, I want to set poll interval and time span per Plot, so that I can trade resolution against history.
54. As an Engineer, I want to export a Plot's data to a file, so that I can analyse it elsewhere.
55. As an Engineer, I want to export Maps, Commands and reports to files, so that work leaves the application in a usable form.
56. As an Engineer, I want my Profiles carried across the rebuild untouched, so that hand-built Maps, descriptions, units and Command catalogues are never re-entered.
57. As an Engineer, I want to be told plainly that Dashboards, layouts and preferences start fresh, so that their absence reads as intended rather than as data loss.
58. As an Engineer, I want to import and export a Profile as a file, so that a Device definition can move between machines.
59. As an Engineer, I want switching Profile to re-skin the whole application for that board, so that one tool serves several Device types.
60. As an Operator, I want one dark theme and one light theme, so that the interface suits both a dim cabinet and a sunlit floor.
61. As an Operator, I want a theme I previously chose to land on a surviving theme rather than nothing, so that an upgrade never leaves the interface unstyled.
62. As an Engineer, I want every Pane, Widget and dialog operable from the keyboard, so that I can work without reaching for a pointer.
63. As an Engineer, I want visible focus at all times, so that I always know what a keystroke will act on.
64. As an Operator, I want text and status colours to clear a 4.5:1 contrast ratio, so that the interface stays readable in poor light.
65. As an Operator, I want motion suppressed when the system asks for reduced motion, so that pulsing indicators do not become an obstacle.
66. As a Developer, I want the whole interface runnable against a fake Device, so that I can build and review it without hardware.
67. As a Developer, I want the same fake used by the tests, so that what I develop against and what I verify against cannot drift apart.
68. As a Developer, I want the real application verifiable against the Device emulator, so that protocol behaviour is exercised before it reaches hardware.
69. As a Developer, I want the interface to keep working when a Pane crashes, so that one failure does not blank the application.
70. As a Developer, I want colour to live only in the design modules, so that the visual language can be changed in one place.

## Implementation Decisions

**Scope.** The view layer and design system are rebuilt outright, together with the presentation semantics that live outside the view layer: the Widget configuration schema, the persisted user-settings shape, the canned CNC Dashboard, and the Widget icon map. The device data path is out of scope and frozen — see the Out of Scope section and ADR-0003.

**Workspace shell.** A dockview-driven Workspace replaces the sidebar and the switch-based view router. Panes are fine-grained and multi-instance; each Pane instance carries its own identity, filter and selection. The Device Scanner becomes a connect flow launched from the chrome rather than a Pane. Recorded in ADR-0001.

**Workspace persistence.** A Profile owns a collection of named Workspaces with one marked default. A stored Workspace is dockview's serialized layout plus each Pane's own state. This makes the persisted shape dependent on a third-party format, which is the accepted lock-in recorded in ADR-0001.

**Dashboard and Focus Mode.** The Dashboard remains a discrete artifact belonging to a Profile, retaining its own internal Widget grid rather than dissolving into Panes. Focus Mode renders a single Dashboard full-canvas with layout locked and chrome minimised, entered and left by explicit action. Two layout systems coexist deliberately, separated by scale.

**Widgets.** All sixteen Widget kinds survive by name and capability, restyled rather than consolidated, so existing Dashboards map kind-for-kind. The duplication those sixteen carry — each re-implementing address binding, value formatting and thresholds — is factored into shared configuration primitives behind them, rather than resolved by shrinking the vocabulary.

**Component base.** No component library. Headless primitives supply dialog, menu, select, popover, tooltip, tabs, slider and switch; everything else is component-scoped CSS. Table, text field and numeric input are built in-house, which is tolerable because this application's inputs were already bespoke. Recorded in ADR-0002.

**Styling and tokens.** Component-scoped stylesheets consume design tokens published at runtime as CSS custom properties. Components never hardcode a colour value. The existing custom-property bridge is retained and becomes the single mechanism by which both first-party CSS and third-party CSS-variable-themed libraries follow the theme.

**Themes.** One dark and one light theme replace the current four. The retired theme identifiers are added to the existing legacy remapping so no stored preference orphans. Status semantics stay identical across every theme of a given mode; only the dark/light switch retunes them, and only to hold legibility.

**Icons.** Phosphor icons replace the removed icon set. The weight axis encodes state — outline for idle, filled for active — and must never encode severity, since colour owns that vocabulary.

**Plotting.** uPlot replaces the current charting stack for both the Plot Pane and the mini-plot Widget, driven imperatively so plot updates bypass the render cycle on fast ticks. Cursor synchronisation across Plot instances is a first-class requirement, not an enhancement.

**Device port.** All communication with the Rust backend is expressed as a single injected port interface covering both device commands (connect, disconnect, claim Control, read and write each Address Space, send Command, scan, start and stop plotting, update log settings) and host file writes (text, CSV, PDF). The real implementation is provided at the application root; a fake implementation is provided in tests and in browser development. This is the single seam for the rebuild. It requires a mechanical edit to frozen code — call sites only, no logic change — which ADR-0003 is amended to permit.

**Data migration.** Profiles carry across untouched. Dashboards, Workspaces, layouts and preferences reset. A schema marker is introduced on the settings shape so future changes have something to migrate from, which the settings blob has never had.

**Dependencies.** Removed: the component library, its icon set, its styling runtime, the charting stack and its date adapter, and the date library that exists only for that adapter. Added: the dock engine, headless primitives, the icon set, and the plotting engine. Unchanged: the Widget grid library, the drag library used for Map entry reordering, the colour picker, the PDF libraries, the Tauri API package, and the self-hosted font packages.

**Delivery.** Work proceeds on a branch off master. A vertical slice lands first — shell, theme bridge, primitives, Overview Pane and Register Pane wired to live data through the port — and is judged before the remaining surfaces are ported. The type scale, density and visual language are settled inside that slice rather than decided in the abstract.

## Testing Decisions

**What makes a good test here.** Tests describe behaviour an Engineer or Operator could observe: what is displayed, what reaches the Device, what survives a restart. They do not assert markup structure, class names, or which module called which. A test that would fail on a purely visual change has been written at the wrong level. Where a test pins a specific hardware-safety bug, it carries a docblock explaining the failure it exists to prevent — the existing write-cell test is the model.

**The seam.** Every test that needs a Device drives the fake port. Nothing mocks modules and nothing stubs the transport, following the established precedent where the poll registry takes an injected reader and its test passes a recording function. The fake port is the same one used for browser development, so the two cannot drift.

**Modules under test.**

- *Value encoding on the write path* — the contract tests. For each type, Address Space and display format, assert exactly what value reaches the port for a given input, including both keyboard and pointer commit paths. This is the failure that is silent and reaches hardware, so it gets the most thorough coverage in the rebuild.
- *Workspace serialization* — round-trip contract tests. A Workspace saved and restored must produce the same Panes, arrangement, filters and selections. Assert that an unrecognised or corrupt stored layout degrades to the default Workspace rather than failing to render.
- *Pane behaviour* — Testing Library suites for filtering, selection, empty and disconnected states, and Inspector following selection across Panes. Multi-instance behaviour is explicitly covered: two Panes of a kind must hold independent filter and selection.
- *Widget behaviour* — binding, formatting, threshold evaluation and the stale-data state, exercised through the shared configuration primitives rather than sixteen times over.
- *Theme and contrast* — the existing palette contract, adapted to the two-theme roster: status legibility on every surface in each mode, hue separation between ok, warn and error, identical status values across themes of a mode, and no brand accent colliding with the error colour.
- *Keyboard operability* — focus order, focus visibility, and dialog focus trapping on the primitives layer.

**Prior art.** The poll registry suite demonstrates injected-boundary testing with fake timers. The write-cell suite demonstrates a component test that pins a hardware-safety bug and explains why in prose. Both are the pattern to follow. Logic suites run in the node environment; component suites opt into a DOM environment per file via docblock.

**Out of the test net.** No end-to-end framework is introduced. Dock drag behaviour is verified by hand against the real application, because exercising it meaningfully requires a real browser and the cost is not justified before the shell has settled. No visual regression snapshots during a period when everything is deliberately changing.

## Out of Scope

- The poll registry, the device half of the application context, the Map parsing and management modules, and the pure utilities: number formatting, float conversion, thumbwheel arithmetic, and the Map, header, Command and PDF file generators. These are frozen, hold nearly all existing coverage, and encode correctness a visual review cannot catch. The only permitted change is the mechanical substitution of port calls for direct transport calls.
- The Rust backend command surface, the wire protocol, and the Device emulator. The interface adapts to the backend, not the reverse.
- Address-based response correlation and poll coalescing. Both are invariants, not implementation details: without correlation a single timed-out request permanently shifts every later value onto the wrong Register, and without coalescing duplicate polls cost latency directly on a strictly request/response link.
- Consolidating the sixteen Widget kinds into a smaller vocabulary. Considered and declined; the duplication is addressed behind them instead.
- Persona modes. One navigation with progressive disclosure serves both an Engineer and an Operator; the two differ by task, not by permitted surfaces.
- Migrating Dashboards, Workspaces, layouts or preferences. Only Profiles carry across.
- Server and shared directories at the repository root.

## Further Notes

The dock engine is the one genuinely unproven element. The vertical slice exists so that discovering it was the wrong choice is cheap, and it should be judged explicitly at the end of the slice rather than assumed once work is underway.

Multi-instance Panes each declaring an interest in addresses is a heavier load pattern than the single-view application ever produced. The poll registry coalesces by address and issues one request per distinct address at the fastest requested interval, so this is safe by construction — but it is the first thing to measure if the link feels slow, and a Workspace with many Panes open is the case to measure.

Two pieces of project documentation are stale and should be corrected once the slice lands and the real answers are known, not before: the design context file still claims eight themes and no hard contrast requirement, and the project instructions describe a component-library-based design system and a screenshot recipe for a different operating system.

Nothing builds, tests or runs until dependencies are installed — the client dependency tree is currently absent.
