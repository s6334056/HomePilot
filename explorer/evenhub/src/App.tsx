import { useEffect, useState } from 'react';
import './App.css';

export function App() {
  const [status, setStatus] = useState<string>('Initializing HomePilot Explorer...');
  const [targetUrl, setTargetUrl] = useState<string>('');

  useEffect(() => {
    console.log('[evenhub.App.tsx] Bootstrapping HomePilot Explorer on EvenHub...');

    // PWA endpoint: either from env or local default (port 5174)
    const envPwaUrl = import.meta.env.VITE_PWA_URL;
    const defaultLocalUrl = `${window.location.protocol}//${window.location.hostname}:5174`;
    const pwaURL = envPwaUrl || defaultLocalUrl;

    setTargetUrl(pwaURL);

    const isTargetDomain = window.location.href.startsWith(pwaURL);

    if (!isTargetDomain) {
      setStatus(`Redirecting to HomePilot PWA (${pwaURL})...`);
      // Keep query parameters (e.g. ?simulator=true)
      const searchParams = window.location.search;
      const destination = `${pwaURL}${searchParams}`;
      console.log(`[evenhub.App.tsx] Navigating to: ${destination}`);
      window.location.href = destination;
    } else {
      setStatus('Connected to HomePilot PWA.');
    }
  }, []);

  return (
    <div className="evenhub-boot-container">
      <div className="evenhub-card">
        <div className="icon">🏠</div>
        <h1>HomePilot Explorer</h1>
        <p className="status-text">{status}</p>
        {targetUrl && (
          <div className="url-box">
            <span>Target: </span>
            <a href={targetUrl}>{targetUrl}</a>
          </div>
        )}
        <div className="hint">Even Realities G2 Companion Service</div>
      </div>
    </div>
  );
}

export default App;
