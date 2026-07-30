# 06 — Register Pane and shared Inspector

**What to build:** The first data surface, and the Pane model that every later Pane inherits.

A Register Pane lists entries by name, type and access from the active Profile's Map rather than as bare addresses, filterable by name or address, with decimal, hexadecimal or binary display chosen per Pane and numerals aligned on tabular figures so a changing digit never shifts a column.

Crucially, Panes are multi-instance from the start. Two Register Panes can be open at once with genuinely independent filter and selection, and their tabs must be distinguishable without clicking. Building single-instance first and retrofitting this is rework — per-instance state is the model, not a later feature.

The Inspector becomes one shared Pane that follows the most recent selection in any data Pane, rather than being embedded separately inside each surface as it is today. It decodes the selected value as hexadecimal, binary and float alongside its decimal reading, and states the entry's Address Space, type and access.

Reading only. Writing is ticket 07.

**Blocked by:** 05

**Status:** ready-for-agent

- [ ] A Register Pane lists entries with name, type and access drawn from the Map
- [ ] Filtering by name and by address both work
- [ ] Display format is switchable per Pane and numerals are tabular
- [ ] Two Register Panes open simultaneously hold independent filter and selection
- [ ] Panes of the same kind are distinguishable from their tabs alone
- [ ] One Inspector Pane follows the active selection across Panes
- [ ] The Inspector decodes hexadecimal, binary and float, and states Address Space, type and access
- [ ] Behaviour tests drive the fake port and cover filtering, selection, empty and disconnected states
