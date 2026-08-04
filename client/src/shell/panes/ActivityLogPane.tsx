import { useEffect } from 'react';
import { useDSHub } from '../../contexts/DSHubContext';
import type { LogCategory, LogEntry } from '../../types/shared';
import type { PaneProps } from '../paneRegistry';
import { usePaneState } from '../paneState';
import type { LogLevel } from '../logFilter';
import { ActivityLog } from './ActivityLog';

interface ActivityLogPaneState {
  readonly category: LogCategory | 'all';
  readonly level: LogLevel | 'all';
  readonly selected: LogEntry | null;
}

/**
 * Binds the Activity Log to the Device's own log.
 *
 * A singleton: unlike a Register or Parameter Pane, two instances would show
 * the same one log twice rather than two independent views of different
 * Address Spaces, so there is exactly one and its filter lives with it rather
 * than distinguishing it from a twin.
 *
 * Attended to means mounted: whatever the unread count would report is
 * already sitting visibly in the list this Pane is showing, so it clears for
 * as long as the Pane is part of the Workspace anywhere on screen. It only
 * accumulates while the Pane is not mounted at all — closed, or (per ADR-0001)
 * behind a sibling tab in a shared dock group, which dockview unmounts.
 */
export function ActivityLogPane({ paneId }: PaneProps): React.JSX.Element {
  const { state, actions } = useDSHub();
  const [pane, updatePane] = usePaneState<ActivityLogPaneState>(paneId, () => ({
    category: 'all',
    level: 'all',
    selected: null,
  }));

  useEffect(() => {
    if (state.unreadLogCount > 0) actions.markLogsRead();
  }, [state.unreadLogCount, actions]);

  return (
    <ActivityLog
      entries={state.logs}
      category={pane.category}
      onCategoryChange={category => updatePane(previous => ({ ...previous, category }))}
      level={pane.level}
      onLevelChange={level => updatePane(previous => ({ ...previous, level }))}
      selected={pane.selected}
      onSelect={entry =>
        updatePane(previous => ({
          ...previous,
          selected: previous.selected === entry ? null : entry,
        }))
      }
      onClear={actions.clearLogs}
    />
  );
}
