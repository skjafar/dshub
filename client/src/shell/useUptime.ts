import { useEffect, useRef, useState } from 'react';

/**
 * Seconds the link has been up, or null while it is not.
 *
 * Each tick recomputes from the moment the link came up rather than adding one,
 * so the figure survives a tab being backgrounded — browsers throttle timers
 * there, and a counter incremented per tick would silently under-report during
 * exactly the long unattended run where uptime is the number anyone cares about.
 *
 * Establishing the start time is a side effect, so it happens in one: reading
 * the clock during render would be impure, which breaks under React's
 * double-render, and that is the worse of the two available trade-offs.
 */
export function useUptime(connected: boolean): number | null {
  const startedAt = useRef<number | null>(null);
  const [seconds, setSeconds] = useState<number | null>(null);

  useEffect(() => {
    if (!connected) {
      startedAt.current = null;
      setSeconds(null);
      return;
    }

    startedAt.current = Date.now();
    setSeconds(0);
    const id = setInterval(() => {
      if (startedAt.current !== null) {
        setSeconds(Math.floor((Date.now() - startedAt.current) / 1000));
      }
    }, 1000);
    return () => clearInterval(id);
  }, [connected]);

  return seconds;
}
