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
 * `.scratch/rust-owned-polling` issue 01's spike, in place of the
 * application — see `spike/PollLoadSpike.tsx`.
 *
 * Gated on an explicit environment variable alone, deliberately not also on
 * `import.meta.env.DEV`: nobody sets `VITE_DSHUB_SPIKE=poll-load` by
 * accident, so the variable alone is what keeps every ordinary
 * `npm run build` or `npm run dev` showing the real application.
 */
if (import.meta.env.VITE_DSHUB_SPIKE === 'poll-load') {
  void import('./spike/PollLoadSpike').then(({ PollLoadSpike }) => {
    root.render(<PollLoadSpike />);
  });
} else {
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}

