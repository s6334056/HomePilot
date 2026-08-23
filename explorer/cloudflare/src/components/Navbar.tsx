import React from 'react';
import { Settings, Smartphone } from 'lucide-react';

interface NavbarProps {
  currentPath: string;
  g2Status: string;
  onNavigate: (path: string) => void;
  onOpenSettings: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentPath,
  g2Status,
  onNavigate,
  onOpenSettings,
}) => {
  const segments = currentPath.split('/').filter(Boolean);
  let accumulatedPath = '';

  return (
    <div className="navbar-container">
      <header className="app-header">
        <div className="brand-group">
          <span className="brand-title">🏠 HomePilot Explorer</span>
          <span className="g2-badge" title="Even Realities G2 Connection Status">
            <Smartphone size={12} />
            <span>{g2Status}</span>
          </span>
        </div>

        <div className="toolbar">
          <button className="btn btn-icon" onClick={onOpenSettings} title="Settings">
            <Settings size={18} />
          </button>
        </div>
      </header>

      <nav className="breadcrumb-bar">
        <span
          className={`breadcrumb-item ${segments.length === 0 ? 'active' : ''}`}
          onClick={() => onNavigate('/home')}
          title="Root"
        >
          📁
        </span>
        {segments.map((seg, idx) => {
          accumulatedPath += '/' + seg;
          const target = accumulatedPath;
          const isLast = idx === segments.length - 1;
          return (
            <React.Fragment key={target}>
              <span className="breadcrumb-sep">/</span>
              <span
                className={`breadcrumb-item ${isLast ? 'active' : ''}`}
                onClick={() => !isLast && onNavigate(target)}
              >
                {seg}
              </span>
            </React.Fragment>
          );
        })}
      </nav>
    </div>
  );
};
