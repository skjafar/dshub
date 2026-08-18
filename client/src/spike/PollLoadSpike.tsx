/**
 * `.scratch/rust-owned-polling` issue 01's harness: a bare page that drives
 * the poll-load spike commands (`src-tauri/src/poll_spike.rs`) against a
 * connected device and shows the live report.
 *
 * Deliberately not the application, mirroring `PopoutSpike.tsx`'s own reasoning:
 * what's under test is whether dozens of independent Rust-side poll tasks hold
 * up, not whether the rest of the app renders. `App.tsx` would bring the poll
 * registry, Panes and everything else along with it, and a failure anywhere in
 * that tree would read as a failure of the mechanism under test.
 *
 * Reached only when the bundle is built with `VITE_DSHUB_SPIKE=poll-load` —
 * see `index.tsx`.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';

const EMULATOR_IP = '127.0.0.1';
const STATUS_POLL_MS = 2000;

export function PollLoadSpike(): React.JSX.Element {
  const [log, setLog] = useState<readonly string[]>([]);
  const [addressCount, setAddressCount] = useState(30);
  const [baseIntervalMs, setBaseIntervalMs] = useState(200);
  const statusTimerRef = useRef<number | null>(null);

  const append = useCallback((line: string) => {
    setLog(prev => [...prev.slice(-299), `${new Date().toLocaleTimeString()}  ${line}`]);
  }, []);

  const call = useCallback(
    async (command: string, args?: Record<string, unknown>) => {
      if (!isTauri()) {
        append(`${command}: not running under Tauri — this harness needs a packaged or dev Tauri window`);
        return;
      }
      try {
        const result = await invoke<string>(command, args);
        append(result);
      } catch (error) {
        append(`${command} failed: ${String(error)}`);
      }
    },
    [append]
  );

  const connect = useCallback(() => {
    void call('connect_device', { ip: EMULATOR_IP, interfaceType: 'TCP', deviceName: 'Emulator (spike)' });
  }, [call]);

  const start = useCallback(() => {
    void call('spike_start_poll_load', { addressCount, baseIntervalMs });
  }, [call, addressCount, baseIntervalMs]);

  const resume = useCallback(() => {
    void call('spike_resume_poll_load');
  }, [call]);

  const stop = useCallback(() => {
    void call('spike_stop_poll_load');
  }, [call]);

  // Auto-polled status so request-count growth (or a stall) is visible without
  // manually clicking anything — the thing under test is whether it keeps
  // climbing steadily over a long run, not a single snapshot.
  useEffect(() => {
    statusTimerRef.current = window.setInterval(() => {
      void call('spike_poll_load_status');
    }, STATUS_POLL_MS);
    return () => {
      if (statusTimerRef.current !== null) window.clearInterval(statusTimerRef.current);
    };
  }, [call]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', font: '13px system-ui', color: '#eee', background: '#111' }}>
      <div style={{ padding: 8, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', background: '#222' }}>
        <button onClick={connect}>Connect to emulator ({EMULATOR_IP}:2009 TCP)</button>
        <label>
          addresses{' '}
          <input
            type="number"
            value={addressCount}
            onChange={e => setAddressCount(Number(e.target.value))}
            style={{ width: 60 }}
          />
        </label>
        <label>
          base interval ms{' '}
          <input
            type="number"
            value={baseIntervalMs}
            onChange={e => setBaseIntervalMs(Number(e.target.value))}
            style={{ width: 70 }}
          />
        </label>
        <button onClick={start}>Start</button>
        <button onClick={resume}>Resume (after reconnect)</button>
        <button onClick={stop}>Stop</button>
        <span style={{ color: '#999' }}>
          Status auto-refreshes every {STATUS_POLL_MS / 1000}s. Connect, Start, then watch the count climb; force a
          disconnect/reconnect via a real Connect dialog elsewhere and click Resume to check the reconnect path.
        </span>
      </div>
      <pre style={{ flex: 1, margin: 0, overflow: 'auto', padding: 12, whiteSpace: 'pre-wrap' }}>{log.join('\n')}</pre>
    </div>
  );
}
