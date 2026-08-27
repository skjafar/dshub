# DSHub

A desktop application for reading, writing and monitoring SESAME control boards over TCP/UDP. It serves an Engineer debugging hardware and an Operator watching live equipment, through one interface.

## Language

### Device

**Device**:
A SESAME control board reachable over the network, identified by its board name and address.
_Avoid_: board, target, node, unit

**Control**:
The claim a session holds on a Device's control interface. Exactly one interface holds it at a time, and it must be claimed before any read or write is accepted.
_Avoid_: lock, ownership, session

**Address Space**:
One of the three numbered value spaces a Device exposes — Registers, Parameters, and System Registers. A bare address is meaningless without knowing which space it belongs to.
_Avoid_: memory, bank, table

**Register**:
A live runtime value at an address in the Device, readable while running and sometimes writable.
_Avoid_: variable, signal, tag, point

**Parameter**:
A configuration value at an address that persists on the Device across power cycles.
_Avoid_: setting, config value, constant

**System Register**:
A Register in the library-managed space, defined by the protocol rather than by firmware, and never writable.
_Avoid_: sysreg, internal register

**Command**:
A numbered instruction sent to a Device to make it act, as opposed to writing a value.
_Avoid_: SYS_COMMAND, action, RPC

### Configuration

**Map**:
A declaration of what lives at each address in one Address Space — the name, type and access of every entry.
_Avoid_: register list, definition file, schema

**Profile**:
Everything DSHub needs to speak to one kind of Device: its Maps for every Address Space, its Commands, its per-entry metadata, its Dashboards and its Workspaces. Switching Profile re-skins the whole application for a different board.
_Avoid_: map profile, user profile, preset, configuration

**Binding Snapshot**:
The entry a Widget, write target, or Plot series was bound to — its name and shape — captured alongside the address, which remains the only value ever used for an actual read, write or poll. An address alone is not stable: editing a Map can silently repoint it at a different entry. Diffed against the Map on every check, a Binding Snapshot is what tells a binding that still means what it did from one that has quietly drifted.
_Avoid_: binding identity, cache, fingerprint

### Interface

**Workspace**:
A named, saved arrangement of Panes belonging to a Profile — which surfaces are open, where they sit, how they are sized, and what each is showing, across every Window it spans. A Profile has several, one of them default, so rearranging for one task never destroys the arrangement for another.
_Avoid_: layout, desktop, perspective

**Window**:
One operating-system window displaying some of a Workspace's Panes. Exactly one is the Main Window; any other is a Daughter Window. A Workspace with no Daughter Windows spans exactly one.
_Avoid_: screen, monitor, view

**Main Window**:
The Window carrying app identity, Device connection and Control, and Pane/Workspace/Profile management. Every session has exactly one, and it is what a Workspace opens into first.
_Avoid_: primary window, home window

**Daughter Window**:
Any Window that is not the Main Window. Shows the Device's link and Control state read-only, offers a control to add a Pane, and otherwise holds nothing but Panes — never Connect, Control, Workspace, Profile, theme or Settings. Belongs to the Workspace, not the Profile: switching Workspace closes the outgoing one's Daughter Windows and opens the incoming one's.
_Avoid_: popout, secondary window, child window

**Pane**:
A single dockable surface within a Workspace, holding one tool. Several Panes of the same kind can be open at once, each with its own filter and selection, so two subsystems can be compared side by side. A Pane belongs to a Workspace, not to whichever Window currently shows it — dragging it to another Window changes nothing about what it is.
_Avoid_: panel, view, window, tab

**Dashboard**:
A composed instrument panel of Widgets, authored by a person and belonging to a Profile. A Device may have several.
_Avoid_: using this word for the Overview

**Widget**:
One configured element on a Dashboard, bound to an address and rendering or writing its value.
_Avoid_: tile, control, component, gadget

**Overview**:
The fixed, unauthored surface reporting a Device's own health — identity, uptime, link state, recent activity. Unlike a Dashboard, nobody composes it.
_Avoid_: Status, Device Dashboard, home

**Focus Mode**:
One Window showing a single Dashboard full-canvas with its layout locked and chrome minimised — the state you leave running beside the equipment. Entered from a Dashboard, it affects only the Window it was entered from; every other open Window, including the Main Window, keeps working normally.
_Avoid_: kiosk mode, fullscreen, presentation mode

**Status Semantics**:
The fixed meanings of ok, warn, error, info and idle. Every theme of the same mode renders them identically, because an Operator's read of machine state must not depend on which theme is active. Only the switch between dark and light re-tunes them, and only to hold legibility.
_Avoid_: severity, log level, alert level
