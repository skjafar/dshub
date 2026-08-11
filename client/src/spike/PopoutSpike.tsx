/**
 * The spike's harness: a bare dockview with one panel, popped out on request,
 * reported.
 *
 * Deliberately not the application. `App.tsx` would bring the Device context,
 * the poll registry and every Pane along with it, and a failure anywhere in
 * that tree would read as a failure of the mechanism under test. What is in
 * doubt is dockview and the host webview, so this mounts the smallest thing
 * that exercises both.
 *
 * Two runs, not one, because a `window.open` blocked for lack of a user
 * gesture and a host webview that cannot create windows at all produce the
 * identical symptom — `addPopoutGroup` resolving `false` — and only one of
 * those is the question issue 01 asks. The automatic run establishes the
 * gesture-less baseline; the button's run is a real, OS-level click (or a
 * synthetic one carrying `isTrusted: true`, which is what a genuine click
 * *is* to the engine) and is the one whose verdict counts.
 *
 * Reached only when the bundle was built with `VITE_DSHUB_SPIKE=popout` set —
 * see `index.tsx` — which is deliberately possible in a production-shaped
 * build too, since Tauri's production origin is exactly what phase 2 needs
 * exercised for real.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { DockviewReact } from 'dockview-react';
import type { DockviewApi, DockviewReadyEvent } from 'dockview';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { runPopoutProbe } from './popoutProbe';
import type { ProbeReport } from './popoutProbe';

import 'dockview/dist/styles/dockview.css';

/** The prefix the CI job greps for. Keep it in step with `popout-spike.yml`. */
const RESULT_MARKER = 'DSHUB_SPIKE_RESULT';

function Probe(): React.JSX.Element {
  return <div style={{ padding: 12, font: '14px system-ui' }}>popout probe panel</div>;
}

const components = { probe: Probe };

async function publish(label: string, report: ProbeReport): Promise<void> {
  const line = `${RESULT_MARKER} ${JSON.stringify({ label, ...report })}`;
  // WebView2 does not forward console output to the terminal that launched it,
  // so the verdict goes back through the Rust side, which does print. The
  // console line stays for a human watching devtools.
  console.log(line);
  if (isTauri()) {
    try {
      await invoke('spike_report', { payload: line });
    } catch (error) {
      console.error('spike_report failed', error);
    }
  }
}

export function PopoutSpike(): React.JSX.Element {
  const apiRef = useRef<DockviewApi | null>(null);
  const [autoReport, setAutoReport] = useState<ProbeReport | null>(null);
  const [clickReport, setClickReport] = useState<ProbeReport | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const handleReady = useCallback((event: DockviewReadyEvent) => {
    apiRef.current = event.api;
    event.api.addPanel({ id: 'probe', component: 'probe', title: 'Probe' });
  }, []);

  // The gesture-less baseline. Fires on its own a beat after dockview lays
  // out, so its result is on screen before anyone has to touch anything —
  // this is the run that is *expected* to fail if WebView2's popup blocker
  // treats a timer callback the way desktop Chrome does.
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      const api = apiRef.current;
      if (!api) return;
      void runPopoutProbe(api).then(result => {
        if (cancelled) return;
        setAutoReport(result);
        void publish('auto (no gesture)', result);
      });
    }, 500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  // Focused on mount so a single OS-level Enter or Space — from a keyboard,
  // or from `SendKeys`/`SendInput`-style automation, both of which the
  // engine sees as real input — triggers it without needing a precise click.
  useEffect(() => {
    buttonRef.current?.focus();
  }, []);

  const handleClick = useCallback(() => {
    const api = apiRef.current;
    if (!api) return;
    void runPopoutProbe(api).then(result => {
      setClickReport(result);
      void publish('button click (gesture)', result);
    });
  }, []);

  return (
    // Literal colours rather than design tokens — the one deliberate
    // exception to "components must not hardcode hex values" (CLAUDE.md):
    // this harness mounts in place of `<App/>` (see the file doc comment),
    // so there is no `ThemedApp` to have called `applyThemeVariables` and no
    // custom properties on the root for these to read. Wiring the theming
    // system into a page whose entire point is staying independent of the
    // application would be solving a problem this file doesn't have.
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', font: '13px system-ui' }}>
      <div style={{ padding: 8, display: 'flex', gap: 8, alignItems: 'center', background: '#222' }}>
        <button ref={buttonRef} onClick={handleClick} style={{ padding: '6px 12px' }}>
          Run gesture-backed probe
        </button>
        <span style={{ color: '#ccc' }}>This is the run whose verdict counts — see the file's doc comment.</span>
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <DockviewReact className="dockview-theme-abyss" components={components} onReady={handleReady} />
      </div>
      <pre style={{ margin: 0, maxHeight: '40vh', overflow: 'auto', padding: 12, background: '#111', color: '#eee' }}>
        {'── auto (no gesture) ──\n'}
        {autoReport === null ? 'probing…' : JSON.stringify(autoReport, null, 2)}
        {'\n\n── button click (gesture) ──\n'}
        {clickReport === null ? 'waiting for a click…' : JSON.stringify(clickReport, null, 2)}
      </pre>
    </div>
  );
}
