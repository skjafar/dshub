import { Fragment } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import { ContextMenu } from './ContextMenu';
import { cx } from './cx';
import styles from './Table.module.css';

export interface Column<Row> {
  readonly key: string;
  readonly header: ReactNode;
  readonly render: (row: Row) => ReactNode;
  /** Right-aligns and uses tabular figures. For anything with a magnitude. */
  readonly numeric?: boolean;
  /** Monospace, for hex, addresses and packet data. */
  readonly mono?: boolean;
  readonly width?: string;
}

export interface TableProps<Row> {
  readonly columns: readonly Column<Row>[];
  readonly rows: readonly Row[];
  readonly rowKey: (row: Row) => string;
  /** Names the table for assistive technology, and titles it visibly. */
  readonly caption?: string;
  readonly selectedKey?: string;
  readonly onSelect?: (row: Row) => void;
  readonly emptyMessage?: ReactNode;
  /**
   * Right-click actions for a row, as `ContextMenuItem`s — `undefined` (the
   * default) for a Table with none, so every existing caller's rows stay
   * plain. Called per row rather than supplied once, since which actions
   * apply can depend on the row itself.
   */
  readonly rowContextMenu?: (row: Row) => ReactNode;
}

/**
 * A data table.
 *
 * Real `<table>` markup rather than a grid of divs, so row and column
 * relationships survive for a screen reader and a browser's own find-in-page
 * still works. When `onSelect` is supplied rows become focusable and respond to
 * Enter and Space, because a row that only answers a click is a row a keyboard
 * user cannot reach.
 */
export function Table<Row>({
  columns,
  rows,
  rowKey,
  caption,
  selectedKey,
  onSelect,
  emptyMessage = 'Nothing to show',
  rowContextMenu,
}: TableProps<Row>): React.JSX.Element {
  const selectable = onSelect !== undefined;

  const handleKeyDown = (event: KeyboardEvent<HTMLTableRowElement>, row: Row): void => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    // Space scrolls the page by default, which is never what pressing it on a
    // focused row is meant to do.
    event.preventDefault();
    onSelect?.(row);
  };

  const cellClass = (column: Column<Row>): string =>
    cx(styles.td, column.numeric && styles.numeric, column.mono && styles.mono);

  return (
    <div className={styles.scroll}>
      <table className={styles.table}>
        {caption ? <caption className={styles.caption}>{caption}</caption> : null}
        <thead>
          <tr>
            {columns.map(column => (
              <th
                key={column.key}
                scope="col"
                className={cx(styles.th, column.numeric && styles.numeric)}
                style={column.width ? { width: column.width } : undefined}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td className={styles.empty} colSpan={columns.length}>
                {emptyMessage}
              </td>
            </tr>
          ) : (
            rows.map(row => {
              const key = rowKey(row);
              const isSelected = key === selectedKey;
              const classes = cx(
                styles.row,
                selectable && styles.selectable,
                isSelected && styles.selected
              );

              const tr = (
                <tr
                  className={classes}
                  tabIndex={selectable ? 0 : undefined}
                  aria-selected={selectable ? isSelected : undefined}
                  onClick={selectable ? () => onSelect(row) : undefined}
                  onKeyDown={selectable ? e => handleKeyDown(e, row) : undefined}
                >
                  {columns.map(column => (
                    <td key={column.key} className={cellClass(column)}>
                      {column.render(row)}
                    </td>
                  ))}
                </tr>
              );

              const menu = rowContextMenu?.(row);
              if (menu === undefined) return <Fragment key={key}>{tr}</Fragment>;
              return (
                <ContextMenu key={key} trigger={tr}>
                  {menu}
                </ContextMenu>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
