/**
 * A Plot Pane's retained series, rendered to the CSV `port.files.saveCsv` writes
 * to disk.
 *
 * Pure and given its data rather than reading `plotStream` itself, so the shape
 * written for a given capture can be pinned in a test without a running Device.
 */

export interface PlotExportPoint {
  readonly x: number;
  readonly y: number;
}

export interface PlotExportSeries {
  readonly name: string;
  /** Already decoded to the reading a person would recognise — float, signed, whatever the entry's type calls for. */
  readonly points: readonly PlotExportPoint[];
}

export interface PlotExport {
  readonly csv: string;
  readonly suggestedName: string;
}

const pad = (n: number, len = 2): string => String(n).padStart(len, '0');
const localDate = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const localTime = (d: Date): string =>
  `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
const localDateTime = (d: Date): string => `${localDate(d)} ${localTime(d)}`;

/**
 * A Plot Pane's series as a CSV, one Date/Time/Value triplet per series so a
 * spreadsheet can plot each independently rather than forcing them onto a
 * single shared timeline they were never sampled on.
 */
export function buildPlotCsv(series: readonly PlotExportSeries[], exportedAt: Date): PlotExport {
  const names = series.map(s => s.name);
  const maxRows = Math.max(0, ...series.map(s => s.points.length));

  const headerRow1 = names.map(name => `${name},,`).join(',');
  const headerRow2 = names.map(() => 'Date,Time,Value').join(',');

  const dataRows = Array.from({ length: maxRows }, (_, i) =>
    series
      .map(s => {
        const point = s.points[i];
        if (!point) return ',,';
        const d = new Date(point.x * 1000);
        return `${localDate(d)},${localTime(d)},${point.y}`;
      })
      .join(',')
  );

  const allPoints = series.flatMap(s => s.points);
  const earliestX = allPoints.length > 0 ? Math.min(...allPoints.map(p => p.x)) : exportedAt.getTime() / 1000;
  const latestX = allPoints.length > 0 ? Math.max(...allPoints.map(p => p.x)) : earliestX;
  const earliestDate = new Date(earliestX * 1000);
  const earliestStamp = `${localDate(earliestDate)}_${pad(earliestDate.getHours())}-${pad(earliestDate.getMinutes())}-${pad(earliestDate.getSeconds())}`;
  const suggestedName = `dshub-plot-data-${earliestStamp}.csv`;

  const metaBlock = [
    `Filename,${suggestedName}`,
    `Exported,${localDateTime(exportedAt)}`,
    `Data Start,${localDateTime(earliestDate)}`,
    `Data End,${localDateTime(new Date(latestX * 1000))}`,
    `Max Samples,${maxRows}`,
    '',
  ].join('\n');

  const csv = [metaBlock, headerRow1, headerRow2, ...dataRows].join('\n');

  return { csv, suggestedName };
}
