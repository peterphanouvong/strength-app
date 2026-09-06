import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import {applyTheme, getSavedThemeId} from './lib/themes';

// The index.html boot script already set the vars pre-paint; this normalizes
// state (corrupt values, meta theme-color) through the one real code path.
applyTheme(getSavedThemeId());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
