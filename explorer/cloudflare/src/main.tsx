import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { loadColorTheme, applyColorTheme } from './services/ColorThemeSettings';

// Apply the persisted color theme before first paint (no reload needed later)
applyColorTheme(loadColorTheme());

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
