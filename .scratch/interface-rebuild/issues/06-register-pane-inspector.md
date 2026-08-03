# 06 — Register Pane and shared Inspector

**What to build:** The first data surface, and the Pane model that every later Pane inherits.

A Register Pane lists entries by name, type and access from the active Profile's Map rather than as bare addresses, filterable by name or address, with decimal, hexadecimal or binary display chosen per Pane and numerals aligned on tabular figures so a changing digit never shifts a column.

Crucially, Panes are multi-instance from the start. Two Register Panes can be open at once with genuinely independent filter and selection, and their tabs must be distinguishable without clicking. Building single-instance first and retrofitting this is rework — per-instance state is the model, not a later feature.

The Inspector becomes one shared Pane that follows the most recent selection in any data Pane, rather than being embedded separately inside each surface as it is today. It decodes the selected value as hexadecimal, binary and float alongside its decimal reading, and states the entry's Address Space, type and access.

Reading only. Writing is ticket 07.

**Blocked by:** 05

**Status:** ready-for-agent

- [x] A Register Pane lists entries with name, type and access drawn from the Map
- [x] Filtering by name and by address both work
- [x] Display format is switchable per Pane and numerals are tabular
- [x] Two Register Panes open simultaneously hold independent filter and selection
- [x] Panes of the same kind are distinguishable from their tabs alone
- [x] One Inspector Pane follows the active selection across Panes
- [x] The Inspector decodes hexadecimal, binary and float, and states Address Space, type and access
- [x] Behaviour tests drive the fake port and cover filtering, selection, empty and disconnected states

## Comments

**Verified in a browser against the fake adapter**, on the CNC Profile so the Map
has something worth listing. Two Register Panes side by side hold different
filters, different display formats, different Live states and different selected
rows; their tabs read `Registers 1 · MOTOR` and `Registers 2 · SPINDLE`; and the
one Inspector follows whichever was selected last, naming the Pane it came from.
Dropping the link puts all three Panes into the same stale reading in words.

**Per-instance state is held by the shell, not by the component.** dockview
unmounts a Pane whose tab is not the visible one in its group, so component state
alone would lose a filter to a neighbouring tab click — and dragging a Pane to a
new dock position moves it between groups, which unmounts it too. `paneState.ts`
keys state by panel id so it survives both; a drag was checked in the browser and
the filter, format and title all came through. State is pruned when dockview
stops reporting a panel, because `openPane` reuses the lowest free instance
number: without pruning, a new `register#1` would inherit the closed one's filter.
Both halves are pinned by `__tests__/paneState.test.tsx`.

**The dock-engine verdict is confirmed now the slice is complete.** Ticket 05
recorded it mid-slice, with the multi-instance half — the reason the engine was
chosen over a plain splitter — still unexercised. ADR-0001 gains what the
Register Pane actually exercised, and the one finding that changed how Panes are
written: a Pane's component is not where its state can live.

**One deviation from the ticket's wording, and the reason for it.** The Value
column sits beside Name rather than at the end of the row. A Pane docked into a
quarter of the window is narrower than the table wants to be, and whatever is
last is what scrolls out of sight — which was the value itself, the one column
the Pane exists to show.

**The Pane reads at most fifty addresses at a time**, and says so in the status
line when the filter is wider than that. The link is strictly request/response,
so every address followed is latency charged to every other; ADR-0001 flagged
multi-instance Panes as the first thing to measure if the link feels slow. The
alternative — quietly reading the first fifty of four hundred — would leave the
rest showing a dash that reads as "the Device has nothing to say" rather than
"nobody asked".

**The Map is loaded once, by the shell.** `mapManager` is a frozen module
singleton with no way to announce a change, which was workable when one
full-screen view owned it and loaded it itself. `useMapEntries.ts` is the one
thing Panes subscribe to. It calls `initialize` rather than `reload` because the
settings provider still calls `initialize` for the same Profile; both parse the
same file into the same manager, so a race costs one duplicated parse at startup,
where `reload` would throw out of an effect.

**Four defects the review caught, all fixed here.**

- *The Inspector cited a Pane by a name no longer on any tab.* A Register Pane's
  title tracks its filter, and the provenance line captured that title when the
  row was selected — so retyping the filter left the Inspector naming a filter
  the Pane no longer had. The selection now follows the rename.
- *The Pane declared polling interest by hand.* CLAUDE.md names `useAutoRefresh`
  as the mechanism, and this had re-typed `useAutoRefreshMulti`'s stable-key memo
  and subscribe/release map. Both now go through one `usePolledTargets`, so there
  is a single way for a surface to declare interest.
- *A failed Map load was a global flag.* One broken Profile made every Pane
  report `failed`, including for a different Profile that was still loading. The
  failure is keyed by Profile and cleared as a new attempt starts.
- *`AddressSpace` restated `DataSource` in a comment.* It is narrowed from it
  with `Extract` now, so the two cannot drift. They are not the same set —
  `DataSource` also covers `sysCommand`, which is an instruction rather than a
  space with addresses in it.

**Also from the review, not defects.** The empty, loading, absent-Profile and
failed-Map states each have a test, since all four render as an empty table and
call for different actions. `isWritable` is gone — it had no caller until ticket
07. `link === 'online'` is `isLive` in `linkState.ts`, beside `isStale`.

**Environment note.** `@mui/icons-material` was installed without its
`package.json`, so `tsc` reported 38 unresolved-module errors on untouched files
before any of this work. `npm install` repaired it. 190 tests, typecheck and lint
clean.
