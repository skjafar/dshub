import { describe, expect, it } from 'vitest';
import { buildPlotCsv } from '../plotExport';

/**
 * CSV rows carry a Date and Time in the machine's own local time — the same
 * choice the interface makes everywhere else a timestamp reaches a person —
 * so expected strings here are built from the same local getters the
 * implementation uses rather than hand-written against one timezone. Running
 * this suite somewhere other than UTC must not be what makes it fail.
 */
const pad = (n: number, len = 2): string => String(n).padStart(len, '0');
const dateOf = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const timeOf = (d: Date): string =>
  `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;

const T0 = new Date(2024, 0, 1, 9, 0, 0);
const T1 = new Date(T0.getTime() + 1000);
const X0 = T0.getTime() / 1000;
const X1 = T1.getTime() / 1000;

describe('buildPlotCsv', () => {
  it('writes one Date,Time,Value triplet per series, aligned by row rather than by timestamp', () => {
    const { csv } = buildPlotCsv(
      [
        { name: 'SPINDLE_RPM', points: [{ x: X0, y: 1200 }, { x: X1, y: 1250 }] },
        { name: 'COOLANT_TEMP', points: [{ x: X0, y: 41.5 }] },
      ],
      T0
    );

    const lines = csv.split('\n');
    expect(lines).toContain('SPINDLE_RPM,,,COOLANT_TEMP,,');
    expect(lines).toContain('Date,Time,Value,Date,Time,Value');
    // Row 0: both series have a point.
    expect(lines).toContain(`${dateOf(T0)},${timeOf(T0)},1200,${dateOf(T0)},${timeOf(T0)},41.5`);
    // Row 1: the shorter series pads with an empty triplet rather than
    // dropping the longer one's second point.
    expect(lines).toContain(`${dateOf(T1)},${timeOf(T1)},1250,,,`);
  });

  it('names the file from the earliest retained point across every series', () => {
    const { suggestedName } = buildPlotCsv(
      [
        { name: 'A', points: [{ x: X1, y: 1 }] },
        { name: 'B', points: [{ x: X0, y: 2 }] },
      ],
      T0
    );

    expect(suggestedName).toBe(
      `dshub-plot-data-${dateOf(T0)}_${pad(T0.getHours())}-${pad(T0.getMinutes())}-${pad(T0.getSeconds())}.csv`
    );
  });

  it('produces an empty capture rather than throwing when every series is empty', () => {
    const { csv, suggestedName } = buildPlotCsv([{ name: 'SPINDLE_RPM', points: [] }], T0);

    expect(csv).toContain('Max Samples,0');
    expect(suggestedName).toMatch(/^dshub-plot-data-.*\.csv$/);
  });

  it('records the exported-at instant separately from the data span', () => {
    const exportedAt = new Date(T0.getTime() + 3_600_000);

    const { csv } = buildPlotCsv([{ name: 'SPINDLE_RPM', points: [{ x: X0, y: 1 }] }], exportedAt);

    expect(csv).toContain(`Exported,${dateOf(exportedAt)} ${timeOf(exportedAt)}`);
    expect(csv).toContain(`Data Start,${dateOf(T0)} ${timeOf(T0)}`);
    expect(csv).toContain(`Data End,${dateOf(T0)} ${timeOf(T0)}`);
  });
});
