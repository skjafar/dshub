import { useCallback, useEffect, useMemo, useState } from 'react';
import type { KeyboardEvent } from 'react';
import {
  ArrowDown,
  ArrowDownLeft,
  ArrowDownRight,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowUpLeft,
  ArrowUpRight,
} from '@phosphor-icons/react';
import { Button, cx } from '../../../ui';
import { useWidgetWrite } from '../../widgets/useWidgetWrite';
import type { Direction, DirectionalControlEntry, DirectionalControlWidgetConfig, WidgetTarget } from '../../widgets/widgetConfig';
import type { WidgetProps } from '../../widgets/widgetRegistry';
import styles from './DirectionalControlWidget.module.css';

/** How often a held direction repeats its Command. Fast enough to feel like a jog, slow enough not to flood the link. */
const REPEAT_INTERVAL_MS = 200;

const ICON: Readonly<Record<Direction, React.ComponentType<{ size?: number }>>> = {
  up: ArrowUp,
  down: ArrowDown,
  left: ArrowLeft,
  right: ArrowRight,
  upLeft: ArrowUpLeft,
  upRight: ArrowUpRight,
  downLeft: ArrowDownLeft,
  downRight: ArrowDownRight,
};

/**
 * Row-major, 3×3, the same grid the legacy Widget laid its buttons on. 4-way
 * leaves every corner empty; 8-way fills them with the diagonals.
 */
const FOUR_WAY_POSITIONS: readonly (Direction | null)[] = [null, 'up', null, 'left', null, 'right', null, 'down', null];
const EIGHT_WAY_POSITIONS: readonly (Direction | null)[] = [
  'upLeft',
  'up',
  'upRight',
  'left',
  null,
  'right',
  'downLeft',
  'down',
  'downRight',
];

function targetOf(command: number): WidgetTarget {
  return { kind: 'command', code: command };
}

/**
 * A pad of directions, each bound to a Command, driving repeated sends while
 * held — the capability this ticket adds over the legacy Widget, which only
 * ever sent once per click. One direction is held at a time; pressing a
 * second while the first is still down simply retargets the repeat, since a
 * pad reads a single held direction the way a physical jog control would.
 *
 * Stopping is handled in one place (the effect below) rather than scattered
 * across every event that can end a hold — release, blur and the link
 * dropping all just clear `held`, and the effect's own cleanup is what
 * actually cancels the interval, so there is exactly one path that can leave
 * a repeat running after it should have stopped.
 */
export function DirectionalControlWidget({ config }: WidgetProps): React.JSX.Element {
  const { directions, layout = '4way' } = config as DirectionalControlWidgetConfig;
  const { blockedReason, send, statusFor } = useWidgetWrite();
  const [held, setHeld] = useState<Direction | null>(null);

  const byDirection = useMemo(() => {
    const map = new Map<Direction, DirectionalControlEntry>();
    for (const entry of directions) map.set(entry.direction, entry);
    return map;
  }, [directions]);

  useEffect(() => {
    if (held === null) return;
    const entry = byDirection.get(held);
    if (!entry || blockedReason !== null) {
      setHeld(null);
      return;
    }
    const target = targetOf(entry.command);
    send(target, 0);
    const timer = setInterval(() => send(target, 0), REPEAT_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [held, byDirection, blockedReason, send]);

  const start = useCallback(
    (direction: Direction) => {
      if (blockedReason !== null || !byDirection.has(direction)) return;
      setHeld(direction);
    },
    [blockedReason, byDirection]
  );

  const stop = useCallback((direction: Direction) => {
    setHeld(previous => (previous === direction ? null : previous));
  }, []);

  const failure = useMemo(() => {
    for (const entry of directions) {
      const status = statusFor(targetOf(entry.command));
      if (status.failure !== null) return status.failure;
    }
    return null;
  }, [directions, statusFor]);

  const positions = layout === '8way' ? EIGHT_WAY_POSITIONS : FOUR_WAY_POSITIONS;

  const handleKeyDown = (direction: Direction) => (event: KeyboardEvent<HTMLButtonElement>): void => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    if (event.repeat) return;
    start(direction);
  };

  const handleKeyUp = (direction: Direction) => (event: KeyboardEvent<HTMLButtonElement>): void => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    stop(direction);
  };

  return (
    <div className={styles.widget}>
      <div className={styles.pad}>
        {positions.map((direction, index) => {
          if (direction === null) return <span key={`empty-${index}`} className={styles.empty} />;
          const entry = byDirection.get(direction);
          if (!entry) return <span key={direction} className={styles.empty} />;
          const Icon = ICON[direction];
          const isHeld = held === direction;
          return (
            <Button
              key={direction}
              type="button"
              variant={isHeld ? 'primary' : 'secondary'}
              className={styles.direction}
              disabled={blockedReason !== null}
              aria-label={entry.label ?? direction}
              onPointerDown={() => start(direction)}
              onPointerUp={() => stop(direction)}
              onPointerLeave={() => stop(direction)}
              onPointerCancel={() => stop(direction)}
              onBlur={() => stop(direction)}
              onKeyDown={handleKeyDown(direction)}
              onKeyUp={handleKeyUp(direction)}
            >
              <Icon size={16} />
            </Button>
          );
        })}
      </div>

      {blockedReason !== null || failure !== null ? (
        <p className={cx(styles.message, failure !== null && styles.failure)} role={failure !== null ? 'alert' : undefined}>
          {failure ?? blockedReason}
        </p>
      ) : null}
    </div>
  );
}
