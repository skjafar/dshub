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
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
