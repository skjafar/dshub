/**
 * `.scratch/daughter-windows-native` issue 01's harness, frontend side.
 *
 * Deliberately not the application, mirroring `PopoutSpike.tsx`'s and
 * `PollLoadSpike.tsx`'s own reasoning: what's under test is whether a
 * genuinely separate `WebviewWindow` (`daughter_window_spike.rs`'s
 * `spike_open_daughter_windows`) can `invoke` and `listen`, not whether the
 * rest of the app renders correctly in it.
 *
 * The same bundle mounts in every window this spike touches — the Main
 * Window and every spawned spike window alike, since `index.tsx`'s
 * `VITE_DSHUB_SPIKE` gate applies before any window-specific branching. This
 * component is what does that branching, by window label: the Main Window
 * (label `'main'`) gets a button (a real gesture, not strictly required here
 * since window creation needs none — kept anyway so a human running this by
 * hand, or `SendKeys` sending a real Enter, has one predictable thing to
 * trigger); any other label — `daughter-spike-*` (static glob capability) or
 * `dyn-spike-*` (per-window dynamic grant) alike — runs the probe
 * automatically the moment it mounts, since it exists for no other reason.
 *
 * Reached only when the bundle is built with `VITE_DSHUB_SPIKE=daughter-window`
 * — see `index.tsx`.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';

/** Mirrors `daughter_window_spike.rs`'s `BROADCAST_EVENT` constant. */
const BROADCAST_EVENT = 'spike-daughter-broadcast';
/** How long a daughter-spike window waits for the broadcast before reporting a timeout. */
const BROADCAST_TIMEOUT_MS = 6000;

const PAGE_STYLE: React.CSSProperties = {
  padding: 16,
  font: '14px system-ui',
  color: '#eee',
  background: '#111',
  height: '100vh',
};

async function publish(line: string): Promise<void> {
  // WebView2 does not forward console output to the terminal that launched
  // it, so the verdict goes back through the Rust side, which does print.
  // The console line stays for a human with devtools open.
  console.log(line);
  if (isTauri()) {
    try {
      await invoke('spike_report', { payload: line });
    } catch (error) {
      // If invoke itself is what this window's capability grant is missing,
      // this call fails the same way `mounted` already would have — this
      // catch exists so that failure surfaces in devtools rather than as an
      // unhandled rejection, not because it has any other channel to report through.
      console.error('spike_report failed', error, 'for line:', line);
    }
  }
}

function DaughterProbe({ label }: { label: string }): React.JSX.Element {
  const [status, setStatus] = useState('probing…');

  useEffect(() => {
    let cancelled = false;
    let received = false;

    // Proves invoke works from this window: if the capability grant this
    // window's label matches doesn't cover it, this call rejects and
    // `publish` logs the rejection to devtools instead of reporting it —
    // exactly the "fails silently rather than with an error" case the
    // ticket names, made visible here rather than left to be assumed.
    void publish(`${label}: mounted — invoke reachable (this call itself succeeded)`);

    const unlistenPromise = listen(BROADCAST_EVENT, () => {
      received = true;
      if (cancelled) return;
      setStatus('broadcast received');
      void publish(`${label}: broadcast RECEIVED`);
    }).catch(error => {
      void publish(`${label}: listen() rejected: ${String(error)}`);
      return null;
    });

    const timer = setTimeout(() => {
      if (received || cancelled) return;
      setStatus('TIMEOUT');
      void publish(`${label}: broadcast TIMEOUT — never received`);
    }, BROADCAST_TIMEOUT_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      void unlistenPromise.then(unlisten => unlisten?.());
    };
  }, [label]);

  return (
    <div style={PAGE_STYLE}>
      <div>daughter spike window: {label}</div>
      <div>{status}</div>
    </div>
  );
}

function MainHarness(): React.JSX.Element {
  const [result, setResult] = useState<string>('idle');
  const buttonRef = useRef<HTMLButtonElement>(null);

  const open = useCallback(() => {
    setResult('opening…');
    void invoke<string>('spike_open_daughter_windows')
      .then(report => setResult(report))
      .catch(error => setResult(`ERROR: ${String(error)}`));
  }, []);

  // Fires on its own, unlike `PopoutSpike.tsx`'s gesture-gated run: opening a
  // `WebviewWindow` from Rust needs no user gesture at all — that requirement
  // was `window.open`'s alone (the mechanism this spike replaces) — so there
  // is no gesture-less-vs-gesture-backed distinction left to test here. The
  // button stays only so a human re-running this by hand can retrigger it.
  // `open` is safe to omit below: it's a `useCallback` with its own `[]`
  // deps, so its identity never changes across renders — including it would
  // change nothing, since this effect is itself meant to run exactly once.
  useEffect(() => {
    const timer = setTimeout(open, 800);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleClick = useCallback(() => {
    open();
  }, [open]);

  return (
    <div style={PAGE_STYLE}>
      <button ref={buttonRef} onClick={handleClick} style={{ padding: '6px 12px' }}>
        Open daughter spike windows
      </button>
      <pre style={{ whiteSpace: 'pre-wrap' }}>{result}</pre>
    </div>
  );
}

export function DaughterWindowSpike(): React.JSX.Element {
  const label = getCurrentWindow().label;
  return label === 'main' ? <MainHarness /> : <DaughterProbe label={label} />;
}
