import React from 'react';
import ReactDOM from 'react-dom/client';

// Self-hosted variable fonts. Previously these came from Google Fonts, so the
// entire typographic system collapsed to a system sans-serif whenever the machine
// had no internet — a routine condition on an isolated industrial network.
import '@fontsource-variable/inter';
import '@fontsource-variable/space-grotesk';
import '@fontsource-variable/jetbrains-mono';

import './index.css';
import App from './App';

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);

/**
 * Issue 01's popout spike, in place of the application.
 *
 * Gated on an explicit environment variable alone, deliberately not also on
 * `import.meta.env.DEV`: the spike's whole purpose is confirming the popout
 * mechanism survives Tauri's *production* origin (the custom protocol, or
 * the localhost server phase 2 substitutes for it — see `lib.rs`), which a
 * dev-only gate would make untestable. Nobody sets `VITE_DSHUB_SPIKE=popout`
 * by accident — `.github/workflows/popout-spike.yml` is the only place that
 * does — so the variable alone is what keeps every ordinary `npm run build`
 * or `npm run dev` showing the real application.
 */
if (import.meta.env.VITE_DSHUB_SPIKE === 'popout') {
  void import('./spike/PopoutSpike').then(({ PopoutSpike }) => {
    root.render(<PopoutSpike />);
  });
} else if (import.meta.env.VITE_DSHUB_SPIKE === 'poll-load') {
  // `.scratch/rust-owned-polling` issue 01 — see `spike/PollLoadSpike.tsx`.
  void import('./spike/PollLoadSpike').then(({ PollLoadSpike }) => {
    root.render(<PollLoadSpike />);
  });
} else if (import.meta.env.VITE_DSHUB_SPIKE === 'daughter-window') {
  // `.scratch/daughter-windows-native` issue 01 — see `spike/DaughterWindowSpike.tsx`.
  void import('./spike/DaughterWindowSpike').then(({ DaughterWindowSpike }) => {
    root.render(<DaughterWindowSpike />);
  });
} else {
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}

